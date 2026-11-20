#!/usr/bin/env node
'use strict';

/**
 * Usage, inside the backend container, where /app/storage is a volume nothing serves:
 *   node scripts/ops/move-generated-pdfs-out-of-public.js --dry-run [--folder gacp-certificates]
 *   node scripts/ops/move-generated-pdfs-out-of-public.js --apply --to /app/storage/quarantine [--folder gacp-certificates]
 *   optional: --uploads-dir <dir>   (default <backend>/public/uploads)
 *
 * Prints counts only, never a file name: the names carry document numbers.
 * Idempotent: a file already at the destination with the same bytes is removed from the public
 * folder; anything else at the destination (different bytes, a symlink) is left where it is and
 * counted as a conflict (exit 1).
 * Both folders are compared by their real paths, and so is every destination folder under --to,
 * so a symlink anywhere on the way cannot pass the uploads folder off as a destination.
 * A symlink inside the folder is never followed: it is counted as skipped and the run does not
 * report itself done.
 * Node built-ins only, so a dry run can read a volume mounted read-only in a throwaway container.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const FOLDERS = Object.freeze({
    'gacp-pdfs': ['credit-notes', 'debit-notes', 'receipts', 'invoices', 'quotations', 'labels', 'other'],
    'gacp-certificates': ['certificates'],
});

function fail(message) {
    console.error(message);
    process.exit(1);
}

function parseArgs(argv) {
    const opts = { dryRun: false, apply: false, to: null, folder: 'gacp-pdfs', uploadsDir: path.join(__dirname, '../../public/uploads') };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--dry-run') { opts.dryRun = true; }
        else if (arg === '--apply') { opts.apply = true; }
        else if (arg === '--to') { opts.to = argv[++i] || null; }
        else if (arg === '--uploads-dir') { opts.uploadsDir = argv[++i] || null; }
        else if (arg === '--folder') { opts.folder = argv[++i] || null; }
        else { fail(`unknown argument: ${arg}`); }
    }
    if (opts.dryRun === opts.apply) {
        fail('usage: move-generated-pdfs-out-of-public.js (--dry-run | --apply --to <dir>) [--folder <folder>] [--uploads-dir <dir>]');
    }
    if (!Object.hasOwn(FOLDERS, opts.folder || '')) { fail(`refused: --folder must be one of ${Object.keys(FOLDERS).join(', ')}`); }
    if (!opts.uploadsDir) { fail('--uploads-dir needs a directory'); }
    if (opts.apply && !opts.to) { fail('--apply needs --to <dir>, a directory outside the public uploads folder'); }
    return opts;
}

function kindOf(rel, kinds) {
    return kinds.find((k) => rel.startsWith(`${k}-`) || rel.startsWith(`${k}/`)) || kinds[kinds.length - 1];
}

function listFiles(dir) {
    const listing = { files: [], symlinks: 0 };
    const walk = (current) => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) { walk(full); }
            else if (entry.isFile()) { listing.files.push(path.relative(dir, full)); }
            else if (entry.isSymbolicLink()) { listing.symlinks += 1; }
        }
    };
    if (fs.existsSync(dir)) { walk(dir); }
    return listing;
}

function sha256(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function isInside(child, parent) {
    const rel = path.relative(parent, child);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** The real path of a directory that exists, or null. */
function realDirectory(dir) {
    try {
        const real = fs.realpathSync(path.resolve(dir));
        return fs.statSync(real).isDirectory() ? real : null;
    } catch {
        return null;
    }
}

function entryExists(p) {
    try {
        fs.lstatSync(p);
        return true;
    } catch (err) {
        if (err.code === 'ENOENT') { return false; }
        throw err;
    }
}

/**
 * The real path a destination will have: its deepest existing ancestor resolved through every
 * symlink, plus the part still to be created. A dangling symlink on the way throws, so a
 * destination is never judged by its spelling alone.
 */
function realDestination(dir) {
    let existing = path.resolve(dir);
    const toCreate = [];
    while (!entryExists(existing)) {
        toCreate.unshift(path.basename(existing));
        existing = path.dirname(existing);
    }
    return path.join(fs.realpathSync(existing), ...toCreate);
}

function identity(p) {
    const st = fs.statSync(p, { bigint: true });
    return `${st.dev}:${st.ino}`;
}

function isSameFile(a, b) {
    return identity(a) === identity(b);
}

function directoryIdentities(root) {
    const ids = new Set();
    const walk = (dir) => {
        ids.add(identity(dir));
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) { walk(path.join(dir, entry.name)); }
        }
    };
    walk(root);
    return ids;
}

/**
 * Whether a destination folder is, or would be created under, a folder of the uploads tree:
 * by its real path (a symlink on the way) or by device and inode (a bind mount, which realpath
 * cannot see).
 */
function leadsIntoUploads(dir, uploads, uploadDirs) {
    if (isInside(realDestination(dir), uploads)) { return true; }
    for (let p = path.resolve(dir); ; p = path.dirname(p)) {
        if (fs.existsSync(p) && uploadDirs.has(identity(p))) { return true; }
        if (p === path.dirname(p)) { return false; }
    }
}

function unlinkSource(src, dest) {
    if (isSameFile(src, dest) && (isSameFile(path.dirname(src), path.dirname(dest)) || fs.statSync(src).nlink < 2)) {
        throw Object.assign(new Error('source is its destination\'s own entry or only link'), { code: 'SAME_FILE' });
    }
    fs.unlinkSync(src);
}

const LINK_REFUSED = new Set(['EXDEV', 'EPERM', 'ENOTSUP', 'EOPNOTSUPP']);

/**
 * Checking first and then renaming let a second run replace the first run's paper in between
 * (a rename replaces its target); a hard link refuses with EEXIST whatever is there, so the
 * check and the move are one step.
 */
function placeAt(src, dest) {
    fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
    try {
        fs.linkSync(src, dest);
        fs.unlinkSync(src);
        return 'moved';
    } catch (err) {
        if (err.code === 'EEXIST') { return 'exists'; }
        if (!LINK_REFUSED.has(err.code)) { throw err; }
    }
    try {
        fs.copyFileSync(src, dest, fs.constants.COPYFILE_EXCL);
    } catch (err) {
        if (err.code === 'EEXIST') { return 'exists'; }
        throw err;
    }
    if (sha256(src) !== sha256(dest)) { throw new Error('copy verification failed'); }
    unlinkSource(src, dest);
    return 'moved';
}

function main() {
    const opts = parseArgs(process.argv.slice(2));
    const uploads = realDirectory(opts.uploadsDir);
    if (!uploads) {
        fail('refused: --uploads-dir is not a directory (mistyped, or not mounted here)');
    }
    const kinds = FOLDERS[opts.folder];
    const source = path.join(uploads, opts.folder);
    const { files, symlinks } = listFiles(source);

    const byKind = Object.fromEntries(kinds.map((k) => [k, 0]));
    for (const rel of files) { byKind[kindOf(rel, kinds)] += 1; }
    console.log(`public folder: <uploads>/${opts.folder}${fs.existsSync(source) ? '' : ' (absent)'}`);
    for (const [kind, n] of Object.entries(byKind)) { if (n) { console.log(`  ${kind}: ${n}`); } }
    console.log(`  total: ${files.length}`);
    if (symlinks) { console.log(`  skipped symlinks: ${symlinks} (never followed or moved)`); }

    if (opts.dryRun) {
        console.log(`dry run: would move ${files.length} file(s); nothing changed`);
        return 0;
    }

    let vault;
    let target;
    let uploadDirs;
    try {
        vault = realDestination(opts.to);
        if (fs.existsSync(vault) && !fs.statSync(vault).isDirectory()) {
            fail('refused: --to is not a directory');
        }
        target = path.join(vault, opts.folder);
        uploadDirs = directoryIdentities(uploads);
        if (leadsIntoUploads(vault, uploads, uploadDirs) || leadsIntoUploads(target, uploads, uploadDirs)) {
            fail('refused: --to resolves inside the public uploads folder (through a symlink or a bind mount)');
        }
    } catch (err) {
        fail(`refused: --to cannot be resolved (${err.code || err.message})`);
    }
    const counts = { moved: 0, alreadyInPlace: 0, conflicts: 0, sameFile: 0, insideUploads: 0, errors: 0 };
    for (const rel of files) {
        const src = path.join(source, rel);
        const dest = path.join(target, rel);
        try {
            if (leadsIntoUploads(path.dirname(dest), uploads, uploadDirs)) {
                counts.insideUploads += 1;
                continue;
            }
            if (placeAt(src, dest) === 'moved') {
                counts.moved += 1;
            } else if (fs.lstatSync(dest).isFile() && sha256(dest) === sha256(src)) {
                unlinkSource(src, dest);
                counts.alreadyInPlace += 1;
            } else {
                counts.conflicts += 1;
            }
        } catch (err) {
            if (err.code === 'SAME_FILE') {
                counts.sameFile += 1;
                continue;
            }
            counts.errors += 1;
            console.error(`  move failed (${err.code || err.message})`);
        }
    }
    console.log(`applied: moved: ${counts.moved} · already in place: ${counts.alreadyInPlace} · conflicts: ${counts.conflicts} · same file as the destination: ${counts.sameFile} · destination inside the uploads folder: ${counts.insideUploads} · errors: ${counts.errors}`);
    if (counts.sameFile) {
        console.log('refused to unlink: a source is its destination itself (a folder linked or mounted onto the vault, or a file mounted onto it; not a hard link in another folder); nothing of it was removed');
    }
    if (counts.insideUploads) {
        console.log('refused to move: a folder under --to leads back into the uploads folder (a symlink or a bind mount); those papers stayed where they are');
    }
    const left = listFiles(source);
    console.log(`left in the public folder: ${left.files.length}${left.symlinks ? ` · skipped symlinks: ${left.symlinks}, never followed; check each by hand` : ''}`);
    return counts.conflicts || counts.sameFile || counts.insideUploads || counts.errors || symlinks ? 1 : 0;
}

process.exitCode = main();

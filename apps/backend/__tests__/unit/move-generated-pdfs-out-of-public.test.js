'use strict';

/**
 * scripts/ops/move-generated-pdfs-out-of-public.js — the deploy-time move of the papers the
 * renderer used to copy into the public <uploads>/gacp-pdfs folder (billing-reconciliation
 * spec 13.5, B0). Run as the operator runs it: a child process on real directories.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '../../scripts/ops/move-generated-pdfs-out-of-public.js');

function run(args) {
    const res = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
    return { code: res.status, out: `${res.stdout}${res.stderr}` };
}

const canBindMount = spawnSync('unshare', ['-rm', 'true']).status === 0;

function runWithBindMount(source, target, args) {
    const quoted = [process.execPath, SCRIPT, ...args].map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ');
    const res = spawnSync('unshare', ['-rm', 'sh', '-c', `mount --bind '${source}' '${target}' && exec ${quoted}`], { encoding: 'utf8' });
    return { code: res.status, out: `${res.stdout}${res.stderr}` };
}

describe('move-generated-pdfs-out-of-public', () => {
    let root;
    let uploads;
    let vault;
    const PAPERS = {
        'receipts-TAX-PRD-2569-000001.pdf': 'receipt bytes',
        'receipts-null.pdf': 'a receipt rendered before its number existed',
        'invoices-INV-CO-1A2B3C4D-M1.pdf': 'invoice bytes',
        'quotations-QT-2569-000007.pdf': 'quotation bytes',
        'credit-notes-CN-PRD-2569-000001.pdf': 'credit note bytes',
        'debit-notes-draft-7f3a.pdf': 'debit note bytes',
        'labels-LOT-1.pdf': 'label bytes',
    };

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'b0-move-'));
        uploads = path.join(root, 'public', 'uploads');
        vault = path.join(root, 'storage', 'quarantine');
        fs.mkdirSync(path.join(uploads, 'gacp-pdfs'), { recursive: true });
        fs.mkdirSync(path.join(uploads, 'lab-results'), { recursive: true });
        for (const [name, body] of Object.entries(PAPERS)) {
            fs.writeFileSync(path.join(uploads, 'gacp-pdfs', name), body);
        }
        fs.writeFileSync(path.join(uploads, 'lab-results', 'report.pdf'), 'lab');
    });
    afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

    const left = () => fs.readdirSync(path.join(uploads, 'gacp-pdfs'));

    test('refuses to run without exactly one of --dry-run / --apply', () => {
        expect(run(['--uploads-dir', uploads]).code).toBe(1);
        expect(run(['--dry-run', '--apply', '--uploads-dir', uploads]).code).toBe(1);
        expect(left()).toHaveLength(7);
    });

    test('--dry-run prints counts by kind, never a file name, and moves nothing', () => {
        const { code, out } = run(['--dry-run', '--uploads-dir', uploads]);
        expect(code).toBe(0);
        expect(out).toContain('receipts: 2');
        expect(out).toContain('invoices: 1');
        expect(out).toContain('quotations: 1');
        expect(out).toContain('credit-notes: 1');
        expect(out).toContain('debit-notes: 1');
        expect(out).toContain('labels: 1');
        expect(out).toContain('total: 7');
        for (const name of Object.keys(PAPERS)) { expect(out).not.toContain(name.replace(/\.pdf$/, '')); }
        expect(left()).toHaveLength(7);
    });

    test('--apply moves every paper byte-for-byte out of the public folder and leaves the rest', () => {
        const { code, out } = run(['--apply', '--to', vault, '--uploads-dir', uploads]);
        expect(code).toBe(0);
        expect(out).toContain('moved: 7');
        expect(left()).toEqual([]);
        for (const [name, body] of Object.entries(PAPERS)) {
            expect(fs.readFileSync(path.join(vault, 'gacp-pdfs', name), 'utf8')).toBe(body);
        }
        expect(fs.existsSync(path.join(uploads, 'lab-results', 'report.pdf'))).toBe(true);
    });

    test('a second --apply finds nothing left; a copy already in the vault is not moved twice', () => {
        fs.mkdirSync(path.join(vault, 'gacp-pdfs'), { recursive: true });
        fs.writeFileSync(path.join(vault, 'gacp-pdfs', 'labels-LOT-1.pdf'), PAPERS['labels-LOT-1.pdf']);
        const first = run(['--apply', '--to', vault, '--uploads-dir', uploads]);
        expect(first.out).toContain('moved: 6');
        expect(first.out).toContain('already in place: 1');
        expect(left()).toEqual([]);
        const again = run(['--apply', '--to', vault, '--uploads-dir', uploads]);
        expect(again.code).toBe(0);
        expect(again.out).toContain('total: 0');
    });

    test('a different file already at the destination is a conflict: both are kept and the run says so', () => {
        fs.mkdirSync(path.join(vault, 'gacp-pdfs'), { recursive: true });
        fs.writeFileSync(path.join(vault, 'gacp-pdfs', 'receipts-null.pdf'), 'some other receipt');
        const { code, out } = run(['--apply', '--to', vault, '--uploads-dir', uploads]);
        expect(code).toBe(1);
        expect(out).toContain('conflicts: 1');
        expect(left()).toEqual(['receipts-null.pdf']);
        expect(fs.readFileSync(path.join(vault, 'gacp-pdfs', 'receipts-null.pdf'), 'utf8')).toBe('some other receipt');
    });

    test.each([
        ['inside the public uploads folder', () => path.join(uploads, 'private')],
        ['the public uploads folder itself', () => uploads],
    ])('refuses a destination %s', (_label, to) => {
        const { code } = run(['--apply', '--to', to(), '--uploads-dir', uploads]);
        expect(code).toBe(1);
        expect(left()).toHaveLength(7);
    });

    test('--apply without --to is refused', () => {
        expect(run(['--apply', '--uploads-dir', uploads]).code).toBe(1);
        expect(left()).toHaveLength(7);
    });

    test('no gacp-pdfs folder: nothing to move', () => {
        fs.rmSync(path.join(uploads, 'gacp-pdfs'), { recursive: true });
        const { code, out } = run(['--dry-run', '--uploads-dir', uploads]);
        expect(code).toBe(0);
        expect(out).toContain('total: 0');
    });

    // Security review of 1b554df0c, L1: a --to that only looked outside the uploads folder
    // deleted the only copy of every paper and reported "already in place".
    const everyPaperStillPublic = () => {
        for (const [name, body] of Object.entries(PAPERS)) {
            expect([name, fs.readFileSync(path.join(uploads, 'gacp-pdfs', name), 'utf8')]).toEqual([name, body]);
        }
    };

    test('a --to that is a symlink to the uploads folder is refused and no paper is lost', () => {
        const link = path.join(root, 'innocent-looking-vault');
        fs.symlinkSync(uploads, link);
        const { code, out } = run(['--apply', '--to', link, '--uploads-dir', uploads]);
        expect(code).toBe(1);
        expect(out).toContain('refused');
        everyPaperStillPublic();
    });

    test('a --to under a symlink that lands inside the uploads folder is refused', () => {
        const link = path.join(root, 'storage-link');
        fs.symlinkSync(uploads, link);
        const { code } = run(['--apply', '--to', path.join(link, 'quarantine'), '--uploads-dir', uploads]);
        expect(code).toBe(1);
        everyPaperStillPublic();
        expect(fs.existsSync(path.join(uploads, 'quarantine'))).toBe(false);
    });

    test('an --uploads-dir given through a symlink still refuses a --to inside the real folder', () => {
        const link = path.join(root, 'uploads-link');
        fs.symlinkSync(uploads, link);
        const { code } = run(['--apply', '--to', path.join(uploads, 'private'), '--uploads-dir', link]);
        expect(code).toBe(1);
        everyPaperStillPublic();
        expect(fs.existsSync(path.join(uploads, 'private'))).toBe(false);
    });

    test('a public gacp-pdfs that is a symlink into the vault is not emptied: a file is never unlinked onto itself', () => {
        const vaultPapers = path.join(vault, 'gacp-pdfs');
        fs.mkdirSync(vault, { recursive: true });
        fs.renameSync(path.join(uploads, 'gacp-pdfs'), vaultPapers);
        fs.symlinkSync(vaultPapers, path.join(uploads, 'gacp-pdfs'));
        const { code, out } = run(['--apply', '--to', vault, '--uploads-dir', uploads]);
        expect(code).toBe(1);
        expect(out).toContain('same file as the destination: 7');
        for (const [name, body] of Object.entries(PAPERS)) {
            expect([name, fs.readFileSync(path.join(vaultPapers, name), 'utf8')]).toEqual([name, body]);
        }
    });

    test('a public gacp-pdfs linked into the vault is not emptied, even when its papers have a backup hard link', () => {
        const vaultPapers = path.join(vault, 'gacp-pdfs');
        const backup = path.join(root, 'backup');
        fs.mkdirSync(vault, { recursive: true });
        fs.mkdirSync(backup);
        fs.renameSync(path.join(uploads, 'gacp-pdfs'), vaultPapers);
        fs.symlinkSync(vaultPapers, path.join(uploads, 'gacp-pdfs'));
        for (const name of Object.keys(PAPERS)) { fs.linkSync(path.join(vaultPapers, name), path.join(backup, name)); }
        const { code, out } = run(['--apply', '--to', vault, '--uploads-dir', uploads]);
        expect([code, out.split('\n').find((line) => line.startsWith('applied: '))]).toEqual([1,
            'applied: moved: 0 · already in place: 0 · conflicts: 0 · same file as the destination: 7 · destination inside the uploads folder: 0 · errors: 0']);
        expect(fs.readdirSync(vaultPapers).sort()).toEqual(Object.keys(PAPERS).sort());
    });

    // Second opinion (Jev, order 53) on round 2: --to was resolved, the folders under it were not.
    test('a vault whose gacp-pdfs is a symlink back into a public folder is refused and nothing lands there', () => {
        fs.mkdirSync(vault, { recursive: true });
        fs.symlinkSync(path.join(uploads, 'lab-results'), path.join(vault, 'gacp-pdfs'));
        const { code, out } = run(['--apply', '--to', vault, '--uploads-dir', uploads]);
        expect(code).toBe(1);
        expect(out).toContain('refused');
        everyPaperStillPublic();
        expect(fs.readdirSync(path.join(uploads, 'lab-results'))).toEqual(['report.pdf']);
    });

    test('a folder in the vault that is a symlink back into uploads keeps the papers under it where they are', () => {
        fs.mkdirSync(path.join(uploads, 'gacp-pdfs', 'receipts'));
        fs.writeFileSync(path.join(uploads, 'gacp-pdfs', 'receipts', 'TAX-PRD-2569-000002.pdf'), 'nested receipt');
        fs.mkdirSync(path.join(vault, 'gacp-pdfs'), { recursive: true });
        fs.symlinkSync(path.join(uploads, 'lab-results'), path.join(vault, 'gacp-pdfs', 'receipts'));
        const { code, out } = run(['--apply', '--to', vault, '--uploads-dir', uploads]);
        expect(code).toBe(1);
        expect(out).toContain('moved: 7');
        expect(out).toContain('destination inside the uploads folder: 1');
        expect(fs.readFileSync(path.join(uploads, 'gacp-pdfs', 'receipts', 'TAX-PRD-2569-000002.pdf'), 'utf8')).toBe('nested receipt');
        expect(fs.readdirSync(path.join(uploads, 'lab-results'))).toEqual(['report.pdf']);
    });

    test('a mistyped --uploads-dir is refused, not reported as nothing to move', () => {
        const { code, out } = run(['--dry-run', '--uploads-dir', path.join(root, 'no-such-uploads')]);
        expect(code).toBe(1);
        expect(out).toContain('refused');
        expect(out).not.toContain('total: 0');
    });

    test('a --to that is a regular file is refused with a refused line, and nothing moves', () => {
        const file = path.join(root, 'not-a-folder');
        fs.writeFileSync(file, 'x');
        const { code, out } = run(['--apply', '--to', file, '--uploads-dir', uploads]);
        expect(code).toBe(1);
        expect(out).toMatch(/^refused: /m);
        expect(out).not.toMatch(/\n\s+at /);
        everyPaperStillPublic();
    });

    test('a symlinked entry under gacp-pdfs is counted as skipped, never followed, and --apply is not done', () => {
        const elsewhere = path.join(root, 'elsewhere');
        fs.mkdirSync(elsewhere);
        fs.writeFileSync(path.join(elsewhere, 'receipts-TAX-PRD-2569-000003.pdf'), 'paper elsewhere');
        fs.symlinkSync(path.join(elsewhere, 'receipts-TAX-PRD-2569-000003.pdf'), path.join(uploads, 'gacp-pdfs', 'receipts-TAX-PRD-2569-000003.pdf'));
        const dry = run(['--dry-run', '--uploads-dir', uploads]);
        expect([dry.code, dry.out.includes('skipped symlinks: 1'), dry.out.includes('total: 7')]).toEqual([0, true, true]);
        const applied = run(['--apply', '--to', vault, '--uploads-dir', uploads]);
        expect(applied.code).toBe(1);
        expect(applied.out).toContain('moved: 7');
        expect(applied.out).toContain('skipped symlinks: 1');
        expect(fs.lstatSync(path.join(uploads, 'gacp-pdfs', 'receipts-TAX-PRD-2569-000003.pdf')).isSymbolicLink()).toBe(true);
        expect(fs.readFileSync(path.join(elsewhere, 'receipts-TAX-PRD-2569-000003.pdf'), 'utf8')).toBe('paper elsewhere');
        expect(applied.out).not.toContain('TAX-PRD-2569-000003');
    });

    const bindMountTest = canBindMount ? test : test.skip;

    bindMountTest('a vault folder that is a bind mount of a public folder is refused, and nothing lands there', () => {
        fs.mkdirSync(path.join(vault, 'gacp-pdfs'), { recursive: true });
        const { code, out } = runWithBindMount(path.join(uploads, 'lab-results'), path.join(vault, 'gacp-pdfs'),
            ['--apply', '--to', vault, '--uploads-dir', uploads]);
        expect(code).toBe(1);
        expect(out).toMatch(/^refused: /m);
        everyPaperStillPublic();
        expect(fs.readdirSync(path.join(uploads, 'lab-results'))).toEqual(['report.pdf']);
    });

    bindMountTest('a vault that is a bind mount of the uploads folder itself is refused', () => {
        fs.mkdirSync(vault, { recursive: true });
        const { code, out } = runWithBindMount(uploads, vault, ['--apply', '--to', vault, '--uploads-dir', uploads]);
        expect(code).toBe(1);
        expect(out).toMatch(/^refused: /m);
        everyPaperStillPublic();
    });

    bindMountTest('a folder inside the vault bound onto a folder inside uploads keeps the papers under it where they are', () => {
        fs.mkdirSync(path.join(uploads, 'gacp-pdfs', 'receipts'));
        fs.writeFileSync(path.join(uploads, 'gacp-pdfs', 'receipts', 'TAX-PRD-2569-000002.pdf'), 'nested receipt');
        fs.mkdirSync(path.join(uploads, 'stash'));
        fs.mkdirSync(path.join(vault, 'gacp-pdfs', 'receipts'), { recursive: true });
        const { code, out } = runWithBindMount(path.join(uploads, 'stash'), path.join(vault, 'gacp-pdfs', 'receipts'),
            ['--apply', '--to', vault, '--uploads-dir', uploads]);
        expect(code).toBe(1);
        expect(out).toContain('moved: 7');
        expect(out).toContain('destination inside the uploads folder: 1');
        expect(fs.readFileSync(path.join(uploads, 'gacp-pdfs', 'receipts', 'TAX-PRD-2569-000002.pdf'), 'utf8')).toBe('nested receipt');
        expect(fs.readdirSync(path.join(uploads, 'stash'))).toEqual([]);
    });

    test('the move never replaces an entry at the destination, even one the existence check cannot see', () => {
        fs.mkdirSync(path.join(vault, 'gacp-pdfs'), { recursive: true });
        fs.symlinkSync(path.join(root, 'nowhere'), path.join(vault, 'gacp-pdfs', 'labels-LOT-1.pdf'));
        const { code, out } = run(['--apply', '--to', vault, '--uploads-dir', uploads]);
        expect(code).toBe(1);
        expect(out).toContain('moved: 6');
        expect(out).toContain('conflicts: 1');
        expect(fs.readFileSync(path.join(uploads, 'gacp-pdfs', 'labels-LOT-1.pdf'), 'utf8')).toBe(PAPERS['labels-LOT-1.pdf']);
        expect(fs.lstatSync(path.join(vault, 'gacp-pdfs', 'labels-LOT-1.pdf')).isSymbolicLink()).toBe(true);
    });

    test('a rerun after a kill between link and unlink finishes the move', () => {
        const name = 'receipts-null.pdf';
        fs.mkdirSync(path.join(vault, 'gacp-pdfs'), { recursive: true });
        fs.linkSync(path.join(uploads, 'gacp-pdfs', name), path.join(vault, 'gacp-pdfs', name));
        const { code, out } = run(['--apply', '--to', vault, '--uploads-dir', uploads]);
        expect([code, out.split('\n').find((line) => line.startsWith('applied: '))]).toEqual([0,
            'applied: moved: 6 · already in place: 1 · conflicts: 0 · same file as the destination: 0 · destination inside the uploads folder: 0 · errors: 0']);
        expect(left()).toEqual([]);
        expect([fs.readFileSync(path.join(vault, 'gacp-pdfs', name), 'utf8'), fs.statSync(path.join(vault, 'gacp-pdfs', name)).nlink])
            .toEqual([PAPERS[name], 1]);
    });

    bindMountTest('a destination file that is a bind mount of the source is never unlinked', () => {
        const name = 'receipts-null.pdf';
        fs.mkdirSync(path.join(vault, 'gacp-pdfs'), { recursive: true });
        fs.writeFileSync(path.join(vault, 'gacp-pdfs', name), '');
        const { code, out } = runWithBindMount(path.join(uploads, 'gacp-pdfs', name), path.join(vault, 'gacp-pdfs', name),
            ['--apply', '--to', vault, '--uploads-dir', uploads]);
        expect(code).toBe(1);
        expect(out).toContain('same file as the destination: 1');
        expect(fs.readFileSync(path.join(uploads, 'gacp-pdfs', name), 'utf8')).toBe(PAPERS[name]);
    });

    describe('--folder gacp-certificates', () => {
        const CERTIFICATES = { 'TH-GACP-1-2569.pdf': 'certificate 1', 'GACP-TH-2569-A3F7B2.pdf': 'legacy certificate' };
        const certificatesLeft = () => fs.readdirSync(path.join(uploads, 'gacp-certificates'));

        beforeEach(() => {
            fs.mkdirSync(path.join(uploads, 'gacp-certificates'));
            for (const [name, body] of Object.entries(CERTIFICATES)) {
                fs.writeFileSync(path.join(uploads, 'gacp-certificates', name), body);
            }
        });

        test('--dry-run counts the stored copies and prints no certificate number', () => {
            const { code, out } = run(['--dry-run', '--folder', 'gacp-certificates', '--uploads-dir', uploads]);
            expect(code).toBe(0);
            expect(out).toContain('public folder: <uploads>/gacp-certificates');
            expect(out).toContain('certificates: 2');
            expect(out).toContain('total: 2');
            expect(out).not.toMatch(/TH-GACP|GACP-TH|2569/);
            expect(certificatesLeft()).toHaveLength(2);
        });

        test('--apply moves them byte for byte to <to>/gacp-certificates and leaves gacp-pdfs alone', () => {
            const { code, out } = run(['--apply', '--folder', 'gacp-certificates', '--to', vault, '--uploads-dir', uploads]);
            expect(code).toBe(0);
            expect(out).toContain('moved: 2');
            expect(certificatesLeft()).toEqual([]);
            for (const [name, body] of Object.entries(CERTIFICATES)) {
                expect(fs.readFileSync(path.join(vault, 'gacp-certificates', name), 'utf8')).toBe(body);
            }
            expect(left()).toHaveLength(7);
        });

        test('a folder the script does not know is refused', () => {
            const { code } = run(['--dry-run', '--folder', 'lab-results', '--uploads-dir', uploads]);
            expect(code).toBe(1);
            expect(fs.readdirSync(path.join(uploads, 'lab-results'))).toEqual(['report.pdf']);
        });
    });
});

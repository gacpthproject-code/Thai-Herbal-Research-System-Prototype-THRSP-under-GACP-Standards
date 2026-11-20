/**
 * Privacy notice v1.4 §7 item 4 says the system never deletes audit and security records in the
 * database on its own, and §7 item 5 says the same of application data, the documents uploaded
 * with an application, and farm data. Those sentences are true only while no scheduled code path
 * deletes or clears such rows or files.
 *
 * Scope: every module that runs on a timer. That is each file under jobs/ and cron/, the queue
 * workers (services/queue-service.js), the dormant services/scheduler/, and any other backend file
 * that calls cron.schedule, followed through every local require() they make (lazy ones included,
 * since the whole file text is read). Within that closure, any of these fails the test with the
 * §7 item it would make untrue:
 *   - a Prisma delete/deleteMany on a protected model,
 *   - raw SQL DELETE/TRUNCATE on a protected table,
 *   - a file deletion (fs unlink/rm, storage deleteObject): uploaded documents are files,
 *   - clearing application formData (formData: null, or the erasure scrubber).
 * A hit means either the scheduled code must not do it, or §7 must change first.
 *
 * Two things the account anonymization does on a timer are §7 item 1, not item 5, and are allowed:
 *   - deleting the account's application drafts, only in services/account-anonymization.js: a draft is the unsent working copy, never filed,
 *     with no legal retention (services/pdpa-erasure-service.js matrix); item 5 is the data of
 *     filed applications;
 *   - deleting the account's avatar file, only through services/account-avatar.js, which can reach
 *     a file at the root of the uploads folder and nothing in a sub-folder (the last test pins
 *     that); the root also holds ID images and farm photos, which stay safe because the avatar
 *     path is written only by uploadAvatar.
 *
 * One deletion on a timer is §7 item 5's own stated exception (order 129(3)) and is allowed:
 *   - deleting a CAR evidence file the applicant uploaded but never sent, only in
 *     services/car-staged-files-sweep.js, only a file named by formData.carStagedFiles, and only
 *     once the round's deadline has passed or 7 days after upload. Its one deletion goes through
 *     unsentFilePath, which reaches a file directly inside uploads/car and nothing else (the last
 *     test pins that); files referenced by no application are reported, never deleted.
 */

const fs = require('fs');
const path = require('path');

const BACKEND = path.join(__dirname, '..', '..');
const SCHEMA_DIR = path.join(BACKEND, 'prisma', 'schema');

const ITEM_4 = '§7 item 4 (บันทึกการตรวจสอบ ... ระบบไม่ลบบันทึกเหล่านี้โดยอัตโนมัติ)';
const ITEM_5 = '§7 item 5 (ข้อมูลคำขอ เอกสารประกอบคำขอ และข้อมูลฟาร์ม ... ระบบไม่ลบข้อมูลเหล่านี้โดยอัตโนมัติ)';

const PROTECTED_MODELS = Object.freeze({
    AuditLog: ITEM_4,
    Application: ITEM_5,
    ApplicationDraft: ITEM_5,
    ApplicationComment: ITEM_5,
    ApplicationBundle: ITEM_5,
    ApplicationDocument: ITEM_5,
    Farm: ITEM_5,
    Plot: ITEM_5,
    SiteAnalysis: ITEM_5,
    TrainingRecord: ITEM_5,
});

const AVATAR_MODULE = path.join(BACKEND, 'services', 'account-avatar.js');
const ANONYMIZATION_MODULE = path.join(BACKEND, 'services', 'account-anonymization.js');
const UNSENT_CAR_SWEEP_MODULE = path.join(BACKEND, 'services', 'car-staged-files-sweep.js');
const DRAFT_DELETION = 'deletes ApplicationDraft';
const FILE_DELETION = 'deletes a file (uploaded documents are files)';

const SKIP_DIRS = new Set(['node_modules', '__tests__', 'scripts', 'prisma', 'test-support', 'coverage']);

function tableOf(model) {
    for (const f of fs.readdirSync(SCHEMA_DIR).filter((n) => n.endsWith('.prisma'))) {
        const block = fs.readFileSync(path.join(SCHEMA_DIR, f), 'utf8')
            .match(new RegExp(`^model\\s+${model}\\s*\\{([\\s\\S]*?)^\\}`, 'm'));
        if (block) {
            const mapped = block[1].match(/@@map\("([^"]+)"\)/);
            return mapped ? mapped[1] : model;
        }
    }
    throw new Error(`model ${model} is not in the schema; update PROTECTED_MODELS`);
}

function backendFiles(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) {continue;}
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {backendFiles(full, out);} else if (full.endsWith('.js')) {out.push(full);}
    }
    return out;
}

function scheduledEntryPoints() {
    const all = backendFiles(BACKEND);
    const under = (sub) => all.filter((f) => f.startsWith(path.join(BACKEND, sub) + path.sep));
    const timers = all.filter((f) => /cron\.schedule\s*\(/.test(fs.readFileSync(f, 'utf8')));
    return [...new Set([
        ...under('jobs'), ...under('cron'), ...under(path.join('services', 'scheduler')),
        path.join(BACKEND, 'services', 'queue-service.js'), ...timers,
    ])];
}

function resolveLocal(from, spec) {
    const base = path.resolve(path.dirname(from), spec);
    return [base, `${base}.js`, path.join(base, 'index.js')]
        .find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) || null;
}

function closureOf(entries) {
    const seen = new Set();
    const stack = [...entries];
    while (stack.length) {
        const file = stack.pop();
        if (seen.has(file)) {continue;}
        seen.add(file);
        for (const m of fs.readFileSync(file, 'utf8').matchAll(/require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) {
            const target = resolveLocal(file, m[1]);
            if (target && target.startsWith(BACKEND) && !target.includes(`${path.sep}node_modules${path.sep}`)) {stack.push(target);}
        }
    }
    return [...seen].sort();
}

function rules() {
    const out = [];
    for (const [model, item] of Object.entries(PROTECTED_MODELS)) {
        const accessor = model[0].toLowerCase() + model.slice(1);
        out.push({ item, what: `deletes ${model}`, re: new RegExp(`\\.${accessor}\\s*\\.\\s*(delete|deleteMany)\\s*\\(`) });
        out.push({ item, what: `raw SQL removes rows of ${tableOf(model)}`, re: new RegExp(`(DELETE\\s+FROM|TRUNCATE(\\s+TABLE)?)\\s+"?${tableOf(model)}"?\\b`, 'i') });
    }
    out.push({ item: ITEM_5, what: FILE_DELETION, re: /\b(unlink|unlinkSync|rmSync|rmdir|rmdirSync|deleteObject)\s*\(|\bfs\w*\s*\.\s*rm\s*\(/ });
    out.push({ item: ITEM_5, what: 'clears application formData', re: /(?<![.\w])formData\s*:\s*null\b|_sanitizeApplicationFormData\s*\(/ });
    return out;
}

function violationsIn(files) {
    const found = [];
    const all = rules();
    for (const file of files) {
        fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
            if (/^\s*(\/\/|\*)/.test(line)) {return;}
            for (const rule of all) {
                if ((file === AVATAR_MODULE || file === UNSENT_CAR_SWEEP_MODULE) && rule.what === FILE_DELETION) {continue;}
                if (file === ANONYMIZATION_MODULE && rule.what === DRAFT_DELETION) {continue;}
                if (rule.re.test(line)) {
                    found.push(`${path.relative(BACKEND, file)}:${i + 1} ${rule.what}: would make ${rule.item} untrue`);
                }
            }
        });
    }
    return found;
}

describe('§7 items 4 and 5: no scheduled code path deletes or clears audit, application, document or farm data', () => {
    const entries = scheduledEntryPoints();
    const closure = closureOf(entries);

    test('the scan reaches the real scheduler, the queue and the retention sweep', () => {
        const rel = closure.map((f) => path.relative(BACKEND, f));
        expect(rel).toEqual(expect.arrayContaining([
            'jobs/scheduler.js', 'services/queue-service.js', 'jobs/pdpa-retention-job.js', 'jobs/payment-closure-job.js',
            'services/car-staged-files-sweep.js',
        ]));
    });

    test('the rules do catch a deletion when one is there', () => {
        const probe = path.join(BACKEND, 'services', 'pdpa-erasure-service.js');
        expect(violationsIn([probe]).join('\n')).toMatch(/applicationDraft|ApplicationDraft|formData/);
    });

    test('nothing reachable from a timer deletes or clears what §7 items 4 and 5 say stays', () => {
        expect(violationsIn(closure)).toEqual([]);
    });

    test('the one file deletion allowed on a timer reaches only a file at the root of the uploads folder', () => {
        const { avatarFilePath } = require('../../services/account-avatar');
        const { BASE_UPLOAD_DIR } = require('../../services/uploads-root');
        const root = path.resolve(BASE_UPLOAD_DIR);
        expect(avatarFilePath('/uploads/1700000000000-avatar.png')).toBe(path.join(root, '1700000000000-avatar.png'));
        for (const notAnAvatar of [
            '/uploads/applications/app-1/idcard.pdf',
            '/uploads/application-drafts/x.pdf',
            '/uploads/car/x.pdf',
            '/uploads/../server.js',
            '/uploads/..',
            '/uploads/',
            '/etc/passwd',
            'uploads/x.png',
            null,
            { avatar: '/uploads/x.png' },
        ]) {
            expect(avatarFilePath(notAnAvatar)).toBeNull();
        }
    });

    test('the unsent-CAR sweep deletes in one place, through unsentFilePath, which reaches only a file directly inside uploads/car', () => {
        const source = fs.readFileSync(UNSENT_CAR_SWEEP_MODULE, 'utf8').split('\n');
        const deletionRule = rules().find((rule) => rule.what === FILE_DELETION);
        const deletions = source.filter((line) => !/^\s*(\/\/|\*)/.test(line) && deletionRule.re.test(line));
        expect(deletions).toHaveLength(1);
        expect(deletions[0]).toMatch(/\bunlink\(target\)/);
        expect(source.filter((line) => /\btarget\s*=/.test(line))).toEqual([expect.stringMatching(/const target = unsentFilePath\(entry\);/)]);

        const { unsentFilePath } = require('../../services/car-staged-files-sweep');
        const { BASE_UPLOAD_DIR } = require('../../services/uploads-root');
        const carDir = path.join(path.resolve(BASE_UPLOAD_DIR), 'car');
        expect(unsentFilePath({ filename: 'CAR-1700000000000-123.pdf' })).toBe(path.join(carDir, 'CAR-1700000000000-123.pdf'));
        for (const notUnsent of [
            { filename: '../applications/app-1/idcard.pdf' },
            { filename: 'sub/x.pdf' },
            { filename: '..' },
            { filename: '.' },
            { filename: '' },
            { path: '/uploads/car/x.pdf' },
            { filename: ['x.pdf'] },
            null,
        ]) {
            expect(unsentFilePath(notUnsent)).toBeNull();
        }
    });
});

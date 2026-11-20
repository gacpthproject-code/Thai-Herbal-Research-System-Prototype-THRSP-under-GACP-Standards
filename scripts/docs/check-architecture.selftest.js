#!/usr/bin/env node
'use strict';

/**
 * Controls for check-architecture.js: each case drifts the code or the doc in a
 * scratch copy of the tree and asserts the matching check goes red (or, where
 * `after` says so, stays green), after asserting the same check is green on the
 * unmutated copy. A case that cannot be set up fails under its own name and the
 * rest still run.
 *
 *   node scripts/docs/check-architecture.selftest.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { docBlock, readTruth, renderDiagrams } = require('./generate-architecture-diagrams');

const REPO = path.join(__dirname, '..', '..');
const CHECKER = path.join(REPO, 'scripts/docs/check-architecture.js');
const DOC = 'docs/architecture/README.md';
const DEPLOYMENT = 'docs/architecture/diagrams/deployment.md';
const OFF = 'ยังไม่เปิด';
const REPO_SCOPE = ['--scope', 'repo'];

function plainCopy() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-selftest-'));
    const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: REPO })
        .toString().split('\0').filter((f) => f && fs.existsSync(path.join(REPO, f)));
    for (const f of files) {
        fs.mkdirSync(path.join(dir, path.dirname(f)), { recursive: true });
        try {
            fs.linkSync(path.join(REPO, f), path.join(dir, f));
        } catch (err) {
            if (err.code !== 'EXDEV') { throw err; }
            fs.copyFileSync(path.join(REPO, f), path.join(dir, f));
        }
    }
    return dir;
}

/** Hard links share bytes with the real tree: unlink before writing so only the copy changes. */
function rewrite(root, rel, fn) {
    const abs = path.join(root, rel);
    const before = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
    if (fs.existsSync(abs)) { fs.unlinkSync(abs); }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, fn(before), 'utf8');
}

/**
 * Host snapshots change only after a deploy, so they may trail the doc. Rebuilding them
 * from the doc keeps these controls about the checker, not about the last deploy.
 */
function alignSnapshots(root) {
    const doc = fs.readFileSync(path.join(root, DOC), 'utf8');
    const containers = docBlock(doc, 'containers');
    const auth = docBlock(doc, 'integrations').filter((r) => r.codes[0][0].startsWith('auth:'));
    for (const env of ['staging', 'demo']) {
        const services = containers.filter((r) => r.cells[0] === env).map((r) => r.codes[1][0]);
        rewrite(root, `evidence/architecture/hosts/${env}.txt`, () => services.map((s) => `gacp-${s} selftest/image:1 ${s}\n`).join(''));
        rewrite(root, `evidence/architecture/idp/${env}.txt`, () => auth.map((r) => `${r.codes[0][0].slice('auth:'.length)} ${r.cells[2] === OFF ? 'coming_soon false' : 'enabled true'}\n`).join(''));
    }
    regenerateDeployment(root);
}

function regenerateDeployment(root) {
    rewrite(root, DEPLOYMENT, () => renderDiagrams(readTruth(root), fs.readFileSync(path.join(root, DOC), 'utf8'))[DEPLOYMENT]);
}

function scratchCopy() {
    const dir = plainCopy();
    alignSnapshots(dir);
    return dir;
}

function replaceOnce(text, from, to) {
    if (!text.includes(from)) { throw new Error(`selftest anchor not found: ${from}`); }
    return text.replace(from, to);
}

/** The doc says what the live row is, so a real status change moves the control with it. */
function flipAuthRow(doc, key) {
    const row = new RegExp(`^(\\| \`auth:${key}\` \\|[^|]*\\| )([^|]+?)( \\|)`, 'm');
    const m = doc.match(row);
    if (!m) { throw new Error(`selftest anchor not found: auth:${key}`); }
    return doc.replace(row, `$1${m[2] === OFF ? 'sandbox' : OFF}$3`);
}

function flipProvider(snapshot, key) {
    const on = `${key} enabled true`;
    const off = `${key} coming_soon false`;
    return snapshot.includes(on) ? replaceOnce(snapshot, on, off) : replaceOnce(snapshot, off, on);
}

function addApprovedEdge(source) {
    const m = source.match(/APPROVED: new Set\(\[([^\]]*)\]\),/);
    if (!m) { throw new Error('selftest anchor not found: APPROVED: new Set([...])'); }
    const target = ['REJECTED', 'CANCELLED', 'DRAFT'].find((s) => !m[1].includes(`'${s}'`));
    return source.replace(m[0], `APPROVED: new Set([${m[1]}, '${target}']),`);
}

const addService = (root, file) => rewrite(root, file, (t) => replaceOnce(t, '\nservices:\n', '\nservices:\n  fake-svc:\n    image: selftest/image:1\n'));
const addRow = (root, env) => rewrite(root, DOC, (t) => replaceOnce(t, '<!-- /arch:containers -->', `| ${env} | \`fake-svc\` | ปลอม |\n<!-- /arch:containers -->`));

function check(root, env = {}, args = []) {
    let out;
    let exit = 0;
    try {
        out = execFileSync(process.execPath, [CHECKER, '--root', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
    } catch (err) {
        out = err.stdout;
        exit = err.status;
    }
    const status = {};
    for (const line of out.split('\n')) {
        const m = line.match(/^(PASS|FAIL|SKIP) (K\d+)/);
        if (m) { status[m[2]] = m[1]; }
    }
    return { status, out, exit };
}

const CASES = [
    {
        name: 'บทบาทใหม่ในโค้ด', check: 'K2', expect: 'fake_role',
        mutate: (r) => rewrite(r, 'apps/backend/shared/canonical-rbac.js', (t) => replaceOnce(t, "  HEALTH: 'health',", "  HEALTH: 'health',\n  FAKE_ROLE: 'fake_role',")),
    },
    {
        name: 'ชื่อบทบาทชุดเก่าในเนื้อความ', check: 'K2', expect: 'scheduler',
        mutate: (r) => rewrite(r, DOC, (t) => replaceOnce(t, '## 6. บทบาทและสิทธิ์', '## 6. บทบาทและสิทธิ์\n\nงานนี้เป็นของ scheduler')),
    },
    {
        name: 'สถานะใหม่ในโค้ด', check: 'K3', expect: 'FAKE_STATE',
        mutate: (r) => rewrite(r, 'apps/backend/services/workflow-transition-service.js', (t) => replaceOnce(t, "  'CANCELLED',\n]);", "  'CANCELLED',\n  'FAKE_STATE',\n]);")),
    },
    {
        name: 'เส้นสถานะใหม่ทำให้แผนภาพเก่า', check: 'K3', expect: 'application-states.md',
        mutate: (r) => rewrite(r, 'apps/backend/services/workflow-transition-service.js', addApprovedEdge),
    },
    {
        name: 'ป้ายสถานะบนจอเปลี่ยน', check: 'K3', expect: 'DRAFT',
        mutate: (r) => rewrite(r, 'apps/web-app/src/lib/constants/workflow-states.ts', (t) => replaceOnce(t, "DRAFT: 'ร่าง',", "DRAFT: 'ฉบับร่าง',")),
    },
    {
        name: 'container ใหม่บนเครื่อง demo', check: 'K1', expect: 'demo:fake-svc',
        mutate: (r) => rewrite(r, 'evidence/architecture/hosts/demo.txt', (t) => `${t}gacp-fake fake/image:1 fake-svc\n`),
    },
    {
        name: 'container หายจากเครื่อง staging', check: 'K1', expect: 'staging:pgadmin',
        mutate: (r) => rewrite(r, 'evidence/architecture/hosts/staging.txt', (t) => t.split('\n').filter((l) => !/ pgadmin$/.test(l)).join('\n')),
    },
    {
        name: 'Prisma model ใหม่', check: 'K4', expect: 'FakeModel',
        mutate: (r) => rewrite(r, 'apps/backend/prisma/schema/system.prisma', (t) => `${t}\nmodel FakeModel {\n  id String @id\n}\n`),
    },
    {
        name: 'route group ใหม่', check: 'K5', expect: 'fakegroup',
        mutate: (r) => {
            rewrite(r, 'apps/backend/routes/api/fakegroup/fake.js', () => 'module.exports = require("express").Router();\n');
            rewrite(r, 'apps/backend/routes/api/index.js', (t) => replaceOnce(t, "router.use('/herbs',", "router.use('/fake', require('./fakegroup/fake'));\nrouter.use('/herbs',"));
        },
    },
    {
        name: 'path ใหม่ใน route group เดิม', check: 'K5', expect: '/api/herbs-v2',
        mutate: (r) => rewrite(r, 'apps/backend/routes/api/index.js', (t) => replaceOnce(t, "router.use('/herbs',", "router.use('/herbs-v2', require('./herbs/herbs'));\nrouter.use('/herbs',")),
    },
    {
        name: 'path ใหม่ที่เขียน .use หลายบรรทัด', check: 'K5', expect: '/api/herbs-ml',
        mutate: (r) => rewrite(r, 'apps/backend/routes/api/index.js', (t) => replaceOnce(t, "router.use('/herbs',", "router.use(\n    '/herbs-ml',\n    require('./herbs/herbs'),\n);\nrouter.use('/herbs',")),
    },
    {
        name: 'path เป็นตัวแปร', check: 'K5', expect: 'path ไม่ใช่ข้อความตายตัว',
        mutate: (r) => rewrite(r, 'apps/backend/routes/api/index.js', (t) => replaceOnce(t, "router.use('/herbs',", "const HERBS_V2 = '/herbs-v2';\nrouter.use(HERBS_V2, require('./herbs/herbs'));\nrouter.use('/herbs',")),
    },
    {
        name: 'แขวน router ที่ไม่รู้ว่ามาจากโฟลเดอร์ใด', check: 'K5', expect: 'herbsV2Router',
        mutate: (r) => rewrite(r, 'apps/backend/routes/api/index.js', (t) => replaceOnce(t, "router.use('/herbs',", "const herbsV2Router = makeRouter();\nrouter.use('/herbs-v2', herbsV2Router);\nrouter.use('/herbs',")),
    },
    {
        name: 'sub-router ที่ไม่ได้ประกาศใน index.js', check: 'K5', expect: 'ไม่รู้จัก router "herbsRouter"',
        mutate: (r) => rewrite(r, 'apps/backend/routes/api/index.js', (t) => replaceOnce(t, "router.use('/herbs',", "herbsRouter.use('/v2', require('./herbs/herbs'));\nrouter.use('/herbs',")),
    },
    {
        name: 'แขวนไฟล์เดี่ยวที่ path ใหม่โดยเอกสารไม่ได้ระบุ', check: 'K5', expect: '/api/ping',
        mutate: (r) => rewrite(r, 'apps/backend/routes/api/index.js', (t) => replaceOnce(t, "router.use('/herbs',", "router.use('/ping', require('./health'));\nrouter.use('/herbs',")),
    },
    {
        name: 'ป้ายบนจอต่างจากมติแต่ย่อหน้าใต้ตารางไม่ได้ระบุ', check: 'K2', expect: 'finance_officer_dtam',
        mutate: (r) => rewrite(r, DOC, (t) => t.replace(/^ป้ายบนจอของ \d+ บทบาท.*$/m, 'ป้ายบนจอของ `dispatcher` และ `field_inspector` ยังเป็นคำก่อนมติ ("ผู้จัดคิว" และ "ผู้ตรวจพื้นที่")')),
    },
    {
        name: 'K6 ถูกบังคับแต่ไม่มี @prisma/client', check: 'K6', base: 'SKIP', expect: 'ARCH_REQUIRE_K6=1', env: { ARCH_REQUIRE_K6: '1' },
        mutate: () => {},
    },
    {
        name: 'สถานะผู้ให้บริการตัวตนไม่ตรงประตูสาธารณะ', check: 'K8', expect: 'auth:thaid',
        mutate: (r) => rewrite(r, DOC, (t) => flipAuthRow(t, 'thaid')),
    },
    {
        name: 'ประตูสาธารณะทั้งสองเครื่องตอบต่างจากเอกสาร', check: 'K8', expect: 'auth:healthid',
        mutate: (r) => ['staging', 'demo'].forEach((env) => rewrite(r, `evidence/architecture/idp/${env}.txt`, (t) => flipProvider(t, 'healthid'))),
    },
    {
        name: 'บันทึกประตูสาธารณะขาดผู้ให้บริการ', check: 'K8', expect: 'snapshot-idp.sh',
        mutate: (r) => rewrite(r, 'evidence/architecture/idp/demo.txt', (t) => t.split('\n').filter((l) => !/^providerid /.test(l)).join('\n')),
    },
    {
        name: 'เวอร์ชัน Next.js เปลี่ยน', check: 'K7', expect: 'แต่โค้ดคือ 0.0.0-selftest',
        mutate: (r) => rewrite(r, 'apps/web-app/package.json', (t) => t.replace(/"next": "[^"]+"/, '"next": "0.0.0-selftest"')),
    },
    {
        name: 'adapter ชำระเงินใหม่', check: 'K8', expect: 'payment:fake-adapter.js',
        mutate: (r) => rewrite(r, 'apps/backend/services/payment/fake-adapter.js', () => 'module.exports = {};\n'),
    },
    {
        name: 'คำของที่ถอดแล้วในเนื้อความ', check: 'K9', expect: 'Ksher',
        mutate: (r) => rewrite(r, DOC, (t) => replaceOnce(t, '## 8. การเชื่อมต่อภายนอก', '## 8. การเชื่อมต่อภายนอก\n\nรับชำระผ่าน Ksher')),
    },
    {
        name: 'บพข. ในเอกสาร', check: 'K9', expect: 'บพข',
        mutate: (r) => rewrite(r, DOC, (t) => `${t}\n- ส่งข้อมูลให้ บพข.\n`),
    },
    {
        name: 'ชื่อผู้ให้บริการในเนื้อความ', check: 'K9', expect: 'Stripe',
        mutate: (r) => rewrite(r, DOC, (t) => replaceOnce(t, '## 8. การเชื่อมต่อภายนอก', '## 8. การเชื่อมต่อภายนอก\n\nชำระผ่าน Stripe')),
    },
    {
        name: 'path ที่ไม่มีอยู่จริง', check: 'K10', expect: 'apps/backend/services/no-such-file.js',
        mutate: (r) => rewrite(r, DOC, (t) => `${t}\n- \`apps/backend/services/no-such-file.js\`\n`),
    },
    {
        name: 'ADR ใหม่ที่ไม่อยู่ในทะเบียน', check: 'K10', expect: 'ADR-999',
        mutate: (r) => rewrite(r, 'docs/adr/ADR-999-fake.md', () => '# ADR-999\n'),
    },
    {
        name: 'เลข IP ในเอกสาร', check: 'K11', expect: 'IP',
        mutate: (r) => rewrite(r, DOC, (t) => `${t}\nเครื่อง 10.0.0.1\n`),
    },
    {
        name: 'คำกำหนดส่งในเอกสาร', check: 'K11', expect: 'กำหนดส่ง',
        mutate: (r) => rewrite(r, DOC, (t) => `${t}\nกำหนดส่งงานเดือนหน้า\n`),
    },
    {
        name: 'sha ในหัวเอกสารไม่ใช่ commit', check: 'K12', expect: 'ไม่ใช่ commit',
        mutate: (r) => {
            execFileSync('git', ['init', '-q'], { cwd: r });
            rewrite(r, DOC, (t) => replaceOnce(t, 'ตรวจกับโค้ดที่ commit: `', 'ตรวจกับโค้ดที่ commit: `0000000'));
        },
    },
    {
        name: 'service ใหม่ใน overlay พร้อมแถวเอกสาร เขียวใน scope repo', check: 'K1', args: REPO_SCOPE, after: 'PASS', expect: 'SKIP-SCOPE K1a',
        mutate: (r) => { addService(r, 'docker-compose.staging.yml'); addRow(r, 'staging'); },
    },
    {
        name: 'แผนภาพการติดตั้งเก่ากว่าบันทึก แดงใน scope repo', check: 'K1', args: REPO_SCOPE, expect: 'deployment.md',
        mutate: (r) => rewrite(r, DEPLOYMENT, (t) => `${t}\nแก้ด้วยมือ\n`),
    },
    {
        name: 'บันทึก docker ps ต่างจากเอกสาร ไม่แดงใน scope repo', check: 'K1', args: REPO_SCOPE, after: 'PASS', expect: 'SKIP-SCOPE K1a',
        mutate: (r) => {
            rewrite(r, 'evidence/architecture/hosts/staging.txt', (t) => t.split('\n').filter((l) => !/ redis$/.test(l)).join('\n'));
            regenerateDeployment(r);
        },
    },
    {
        name: 'service พร้อมแถวเอกสารแต่ไม่อยู่ในบันทึก แดงในโหมดเต็ม', check: 'K1', expect: 'staging:fake-svc',
        mutate: (r) => { addService(r, 'docker-compose.staging.yml'); addRow(r, 'staging'); },
    },
    {
        name: 'overlay ประกาศ service ที่บันทึกไม่มี แดงในโหมดเต็ม', check: 'K1', expect: 'compose ประกาศ fake-svc',
        mutate: (r) => addService(r, 'docker-compose.staging.yml'),
    },
    {
        name: 'เปิดผู้ให้บริการเครื่องเดียว แดงในโหมดเต็ม', check: 'K8', expect: 'เปิดเฉพาะ',
        mutate: (r) => rewrite(r, 'evidence/architecture/idp/staging.txt', (t) => flipProvider(t, 'thaid')),
    },
    {
        name: 'เปิดผู้ให้บริการเครื่องเดียว ไม่แดงใน scope repo', check: 'K8', args: REPO_SCOPE, after: 'PASS', expect: 'SKIP-SCOPE K8a',
        mutate: (r) => rewrite(r, 'evidence/architecture/idp/staging.txt', (t) => flipProvider(t, 'thaid')),
    },
    {
        name: 'สถานะตัวเชื่อมนอกสามคำ แดงใน scope repo', check: 'K8', args: REPO_SCOPE, expect: 'ไม่ใช่',
        mutate: (r) => rewrite(r, DOC, (t) => t.replace(/^(\| `payment:stripe-adapter\.js` \|[^|]*\| )[^|]+?( \|)/m, '$1เปิดบางส่วน$2')),
    },
    {
        name: 'adapter ชำระเงินใหม่ แดงใน scope repo', check: 'K8', args: REPO_SCOPE, expect: 'payment:fake-adapter.js',
        mutate: (r) => rewrite(r, 'apps/backend/services/payment/fake-adapter.js', () => 'module.exports = {};\n'),
    },
    {
        name: 'ผล scope repo ต้องไม่ใช่บรรทัด RESULT: PASS', check: 'RESULT', args: REPO_SCOPE,
        mutate: () => {},
        verify: ({ out, exit }) => exit === 0 && !/^RESULT: PASS$/m.test(out) && /^RESULT: PASS-SCOPE repo ไม่ได้ตรวจ K1a K8a$/m.test(out),
    },
    {
        name: 'scope ที่ไม่รู้จักต้องหยุด ไม่ตรวจแบบเงียบ', check: 'RESULT', args: ['--scope', 'nope'],
        mutate: () => {},
        verify: ({ out, exit }) => exit === 2 && !out.includes('RESULT'),
    },
    {
        name: 'scope repo บันทึกหลักฐาน K12 ไม่ได้', check: 'RESULT', args: [...REPO_SCOPE, '--write-evidence'],
        mutate: (r) => fs.rmSync(path.join(r, 'evidence/architecture'), { recursive: true }),
        verify: ({ exit }, r) => exit === 2 && !fs.existsSync(path.join(r, 'evidence/architecture')),
    },
];

const bases = new Map();

function baseStatus(args) {
    const key = args.join(' ');
    if (!bases.has(key)) {
        const root = scratchCopy();
        try {
            bases.set(key, check(root, {}, args).status);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    }
    return bases.get(key);
}

function runCase(c) {
    const args = c.args || [];
    let root;
    try {
        root = scratchCopy();
        const before = c.verify ? 'ไม่มี' : baseStatus(args)[c.check];
        c.mutate(root);
        const result = check(root, c.env, args);
        const after = result.status[c.check];
        const ok = c.verify
            ? c.verify(result, root)
            : before === (c.base || 'PASS') && after === (c.after || 'FAIL') && result.out.includes(c.expect);
        return { ok, detail: `ฐาน ${before} หลังแก้ ${after}` };
    } catch (err) {
        return { ok: false, detail: `เตรียมเคสไม่ได้ ${err.message}` };
    } finally {
        if (root) { fs.rmSync(root, { recursive: true, force: true }); }
    }
}

function main() {
    let failed = 0;
    for (const c of CASES) {
        const { ok, detail } = runCase(c);
        if (!ok) { failed += 1; }
        // gate-compare keeps the first token after FAIL, so the case name has to be inside it.
        console.log(`${ok ? 'PASS' : 'FAIL'} ${c.check}:${c.name.replace(/\s+/g, '_')}: ${detail}`);
    }
    console.log(failed ? `RESULT: FAIL (${failed})` : `RESULT: PASS (${CASES.length} controls)`);
    process.exit(failed ? 1 : 0);
}

main();

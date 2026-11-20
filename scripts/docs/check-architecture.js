#!/usr/bin/env node
'use strict';

/**
 * Checks docs/architecture/README.md against the code (K1-K12 of the Track B item 4
 * criteria). Read-only, no database, no env. Exit 0 = every check passes.
 *
 *   node scripts/docs/check-architecture.js
 *   node scripts/docs/check-architecture.js --root DIR        # check another tree
 *   node scripts/docs/check-architecture.js --write-evidence  # also record the PASS for K12 (K6 required)
 *   node scripts/docs/check-architecture.js --scope repo      # only what this checkout can decide (full-gate)
 *
 * A snapshot of a host changes only after a deploy, and a deploy needs the gate first, so
 * --scope repo leaves out the comparisons with those snapshots (K1a, K8a). They print
 * SKIP-SCOPE and the result says so. Without the flag every part runs.
 *
 * K6 needs a generated @prisma/client. Without one it prints SKIP and does not fail,
 * unless ARCH_REQUIRE_K6=1 (set by local-gate under LOCAL_GATE_FULL=1) or --write-evidence.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { DOC, readTruth, renderDiagrams, docBlock, modelGroups, rootFromArgs, read } = require('./generate-architecture-diagrams');

const RETIRED_HEADING = '### 11.2 ของที่ถอดออกแล้ว';
const EVIDENCE_DIR = 'evidence/architecture';
const INTEGRATION_STATES = ['ใช้งาน', 'sandbox', 'ยังไม่เปิด'];
const ADR_STATES = ['ใช้อยู่', 'ถูกแทน', 'ถอดแล้ว'];

const RETIRED_ROLE_WORDS = /\b(scheduler|auditor|head_auditor|account|account_dtam|account_platform|admin|platform_admin|farmer)\b/;

const RETIRED_TERMS = [
    ['Mongo', /mongo/i],
    ['DTAM remittance/payable', /remittance|payable/i],
    ['workspace switcher', /workspace[ -]?switch|สลับพื้นที่ทำงาน|โหมด\s*(สลับ\s*)?workspace/i],
    ['slip/สลิป', /\bslip\b|สลิป/i],
    ['Ksher', /ksher/i],
    ['Omise', /omise/i],
    ['บัตรเครดิต', /บัตรเครดิต|credit card/i],
    ['PlantUnit', /plant[-_ ]?unit/i],
    ['MEDICAL', /\bMEDICAL\b/],
    ['email-OTP', /email[- ]?otp/i],
    ['DigitalOcean', /digital\s?ocean/i],
    ['preview environment', /preview\.gacpth|docker-compose\.preview|สภาพแวดล้อม\s*preview|preview\s+(environment|stack)/i],
    ['CANCEL_EXPIRED', /CANCEL_EXPIRED/],
    ['Next.js 14', /next(\.js)?\s*@?\s*14\b/i],
];
const FORBIDDEN_ANYWHERE = [['บพข. (operator 2026-10-07: ไม่ใช่ผู้รับข้อมูล)', /บพข/]];
// Q3: vendors are named by function in prose; code spans (file names, env keys) keep their real names.
const VENDOR_NAMES = /\b(stripe|supabase|cloudflare|tencent|sentry)\b/i;

function stripCode(text) {
    return text.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
}

function mainBody(doc) {
    const i = doc.indexOf(RETIRED_HEADING);
    return i < 0 ? doc : doc.slice(0, i);
}

function setDiff(expected, actual) {
    const a = new Set(actual);
    const e = new Set(expected);
    return { missing: [...e].filter((x) => !a.has(x)), extra: [...a].filter((x) => !e.has(x)) };
}

function hostService(row) {
    return `${row.cells[0]}:${row.codes[1][0]}`;
}

function blockOrFail(doc, name, problems) {
    const rows = docBlock(doc, name);
    if (!rows) { problems.push(`ไม่พบตาราง <!-- arch:${name} --> ในเอกสาร`); return []; }
    return rows;
}

function reportSet(problems, what, { missing, extra }) {
    for (const m of missing) { problems.push(`${what} ในโค้ดแต่ไม่มีในเอกสาร: ${m}`); }
    for (const x of extra) { problems.push(`${what} ในเอกสารแต่ไม่มีในโค้ด: ${x}`); }
}

/** Mermaid refuses a subgraph whose id is also a node id ("would create a cycle"), so the diagram never renders. */
function mermaidIdClashes(text) {
    const subgraphs = new Set([...text.matchAll(/^\s*subgraph\s+([A-Za-z0-9_]+)/gm)].map((m) => m[1]));
    const nodes = new Set([...text.matchAll(/^\s*([A-Za-z0-9_]+)\s*(?:\[|\(|\{)/gm)].map((m) => m[1]));
    return [...subgraphs].filter((id) => nodes.has(id));
}

function diffDiagram(root, rel, expected) {
    const clashes = mermaidIdClashes(expected).map((id) => `${rel}: subgraph กับ node ใช้ id "${id}" ซ้ำกัน Mermaid จะแสดงแผนภาพไม่ได้`);
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) { return clashes.concat([`ไม่มีไฟล์แผนภาพ ${rel} (รัน node scripts/docs/generate-architecture-diagrams.js)`]); }
    return fs.readFileSync(abs, 'utf8') === expected
        ? clashes
        : clashes.concat([`${rel} ไม่ตรงกับที่สร้างใหม่จากโค้ด (รัน node scripts/docs/generate-architecture-diagrams.js แล้ว commit)`]);
}

const CHECKS = [
    {
        id: 'K1', title: 'container บนสองเครื่องครบในส่วนการติดตั้ง',
        run({ doc, root, diagrams }) {
            const problems = [];
            blockOrFail(doc, 'containers', problems);
            return problems.concat(diffDiagram(root, 'docs/architecture/diagrams/deployment.md', diagrams['docs/architecture/diagrams/deployment.md']));
        },
        host: {
            id: 'K1a',
            repoTitle: 'มีตาราง container และแผนภาพการติดตั้งตรงกับบันทึกที่ commit ไว้',
            reason: 'เทียบเอกสารและ compose กับผล docker ps ที่บันทึกไว้ บันทึกเปลี่ยนได้หลัง deploy เท่านั้น ตรวจใน local-gate และ deploy walk',
            run({ doc, truth }) {
                const problems = [];
                const running = truth.hosts.flatMap((h) => h.containers.map((c) => `${h.env}:${c.service}`));
                reportSet(problems, 'service', setDiff(running, (docBlock(doc, 'containers') || []).map(hostService)));
                for (const h of truth.hosts) {
                    const up = new Set(h.containers.map((c) => c.service));
                    for (const s of h.composeServices.filter((x) => !up.has(x))) {
                        problems.push(`${h.env}: compose ประกาศ ${s} แต่ไม่พบใน docker ps ที่บันทึกไว้`);
                    }
                }
                return problems;
            },
        },
    },
    {
        id: 'K2', title: 'บทบาทครบพร้อมชื่อไทย ป้ายบนจอ และสังกัด ไม่มีชื่อบทบาทชุดเก่า',
        run({ doc, truth, root, diagrams }) {
            const problems = [];
            const rows = blockOrFail(doc, 'roles', problems);
            reportSet(problems, 'บทบาท', setDiff(truth.roles.map((r) => r.key), rows.map((r) => r.codes[0][0])));
            for (const role of truth.roles) {
                const row = rows.find((r) => r.codes[0][0] === role.key);
                if (!row) { continue; }
                if (!row.cells[1]) { problems.push(`${role.key}: ไม่มีชื่อไทย`); }
                const label = role.codeLabel ?? 'ไม่มีป้าย';
                if (row.cells[2] !== label) { problems.push(`${role.key}: ป้ายบนจอในเอกสาร "${row.cells[2]}" แต่ ROLE_LABELS_TH คือ "${label}"`); }
                if (row.codes[3][0] !== role.affiliation) { problems.push(`${role.key}: สังกัดในเอกสาร ${row.codes[3][0]} แต่ในโค้ดคือ ${role.affiliation}`); }
            }
            const after = doc.slice(doc.indexOf('<!-- /arch:roles -->')).split('\n').slice(1).find((l) => l.trim()) || '';
            const differ = rows.filter((r) => r.cells[2] !== 'ไม่มีป้าย' && r.cells[1] !== r.cells[2]);
            const named = new Set([...after.matchAll(/`([^`]+)`/g)].map((m) => m[1]));
            const unlabeled = rows.filter((r) => r.cells[2] === 'ไม่มีป้าย').map((r) => r.codes[0][0]);
            reportSet(problems, 'บทบาทที่ป้ายบนจอต่างจากมติ (ย่อหน้าใต้ตาราง)', setDiff(differ.map((r) => r.codes[0][0]), [...named].filter((k) => !unlabeled.includes(k))));
            for (const r of differ) {
                if (!after.includes(`"${r.cells[2]}"`) || !after.includes(`"${r.cells[1]}"`)) { problems.push(`${r.codes[0][0]}: ย่อหน้าใต้ตารางไม่ได้ยกป้าย "${r.cells[2]}" คู่กับชื่อตามมติ "${r.cells[1]}"`); }
            }
            stripCode(mainBody(doc)).split('\n').forEach((line, i) => {
                const m = line.match(RETIRED_ROLE_WORDS);
                if (m) { problems.push(`ชื่อบทบาทชุดเก่า "${m[1]}" บรรทัด ${i + 1}`); }
            });
            return problems.concat(diffDiagram(root, 'docs/architecture/diagrams/context.md', diagrams['docs/architecture/diagrams/context.md']));
        },
    },
    {
        id: 'K3', title: 'สถานะคำขอครบ ป้ายตรงจอ และแผนภาพสถานะสร้างจากโค้ด',
        run({ doc, truth, root, diagrams }) {
            const problems = [];
            const rows = blockOrFail(doc, 'states', problems);
            reportSet(problems, 'สถานะ', setDiff(truth.workflow.states.map((s) => s.key), rows.map((r) => r.codes[0][0])));
            for (const s of truth.workflow.states) {
                const row = rows.find((r) => r.codes[0][0] === s.key);
                if (row && row.cells[1] !== s.label) { problems.push(`${s.key}: ป้ายในเอกสาร "${row.cells[1]}" แต่บนจอคือ "${s.label}"`); }
            }
            return problems
                .concat(diffDiagram(root, 'docs/architecture/diagrams/application-states.md', diagrams['docs/architecture/diagrams/application-states.md']))
                .concat(diffDiagram(root, 'docs/architecture/workflow-state-machine.md', diagrams['docs/architecture/workflow-state-machine.md']));
        },
    },
    {
        id: 'K4', title: 'ทุก Prisma model อยู่ในกลุ่มโดเมนเดียว',
        run({ doc, truth, root, diagrams }) {
            const problems = [];
            blockOrFail(doc, 'model-groups', problems);
            const listed = modelGroups(doc).flatMap((g) => g.models);
            const seen = new Set();
            for (const m of listed) { if (seen.has(m)) { problems.push(`model อยู่มากกว่าหนึ่งกลุ่ม: ${m}`); } seen.add(m); }
            reportSet(problems, 'model', setDiff(truth.models.map((m) => m.name), listed));
            return problems.concat(diffDiagram(root, 'docs/architecture/diagrams/data-model.md', diagrams['docs/architecture/diagrams/data-model.md']));
        },
    },
    {
        id: 'K5', title: 'ทุก route group พร้อม path ที่แขวน',
        run({ doc, truth }) {
            const problems = [...truth.routeErrors];
            for (const f of truth.routeFileMounts) {
                if (!doc.includes(`\`${f.mount}\``) || !doc.includes(`\`${f.file}\``)) { problems.push(`${f.mount} (${f.file}) แขวนใน index.js แต่เอกสารไม่ได้ระบุ`); }
            }
            const rows = blockOrFail(doc, 'route-groups', problems);
            reportSet(problems, 'route group', setDiff(truth.routeGroups.map((g) => g.folder), rows.map((r) => r.codes[0][0])));
            for (const g of truth.routeGroups) {
                const row = rows.find((r) => r.codes[0][0] === g.folder);
                if (!row) { continue; }
                const documented = row.codes[1] || [];
                reportSet(problems, `path ของ ${g.folder}`, setDiff(g.mounts, documented.filter((c) => c.startsWith('/api'))));
            }
            return problems;
        },
    },
    {
        id: 'K6', title: 'data dictionary สร้างใหม่แล้วตรงกับที่ commit',
        run({ root, requireK6 }) {
            if (!prismaClientGenerated(root)) {
                if (requireK6) { return ['ยังไม่มี @prisma/client ที่ generate แล้ว (pnpm install และ prisma generate ก่อน) แต่ ARCH_REQUIRE_K6=1 บังคับให้ตรวจ']; }
                return { skipped: 'ยังไม่มี @prisma/client ที่ generate แล้ว ตั้ง ARCH_REQUIRE_K6=1 เพื่อบังคับ' };
            }
            const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'arch-dd-')), 'dd.md');
            const script = [
                "process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://placeholder:placeholder@localhost:5432/placeholder';",
                "const { generateDataDictionaryMarkdown } = require(process.argv[1]);",
                "require('fs').writeFileSync(process.argv[2], generateDataDictionaryMarkdown(), 'utf8');",
            ].join('\n');
            const r = spawnSync(process.execPath, ['-e', script, path.join(root, 'apps/backend/services/dataset-export-service.js'), out], { encoding: 'utf8', cwd: root });
            if (r.status !== 0 || !fs.existsSync(out)) {
                const last = `${r.stderr || ''}${r.stdout || ''}`.trim().split('\n').filter((l) => /error|cannot|fatal/i.test(l)).pop() || '';
                return [`สร้าง data dictionary ไม่ได้ ต้อง pnpm install และ prisma generate ก่อน (${last.slice(0, 160)})`];
            }
            const dropStamp = (t) => t.split('\n').filter((l) => !/^> สร้างอัตโนมัติจาก dataset-domains\.js generated /.test(l)).join('\n');
            return dropStamp(fs.readFileSync(out, 'utf8')) === dropStamp(read(root, 'docs/data/data-dictionary.md'))
                ? []
                : ['docs/data/data-dictionary.md ไม่ตรงกับโค้ด (รัน node apps/backend/scripts/generate-data-dictionary.js)'];
        },
    },
    {
        id: 'K7', title: 'เวอร์ชันซอฟต์แวร์หลักตรงกับโค้ด',
        run({ doc, truth }) {
            const problems = [];
            const rows = blockOrFail(doc, 'versions', problems);
            reportSet(problems, 'ซอฟต์แวร์', setDiff(Object.keys(truth.versions), rows.map((r) => r.codes[0][0])));
            for (const [name, value] of Object.entries(truth.versions)) {
                const row = rows.find((r) => r.codes[0][0] === name);
                if (row && (row.codes[1] || [])[0] !== value) { problems.push(`${name}: เอกสารเขียน ${(row.codes[1] || [])[0]} แต่โค้ดคือ ${value}`); }
            }
            return problems;
        },
    },
    {
        id: 'K8', title: 'ตัวเชื่อมภายนอกครบ มีสถานะหนึ่งในสามคำ และสถานะผู้ให้บริการตัวตนตรงกับประตูสาธารณะ',
        run({ doc, truth }) {
            const problems = [];
            const rows = blockOrFail(doc, 'integrations', problems);
            reportSet(problems, 'ตัวเชื่อม', setDiff(truth.integrations.map((i) => i.key), rows.map((r) => r.codes[0][0])));
            for (const r of rows) {
                if (!INTEGRATION_STATES.includes(r.cells[2])) { problems.push(`${r.codes[0][0]}: สถานะ "${r.cells[2]}" ไม่ใช่ ${INTEGRATION_STATES.join(' / ')}`); }
            }
            return problems;
        },
        host: {
            id: 'K8a',
            repoTitle: 'ตัวเชื่อมภายนอกครบ และมีสถานะหนึ่งในสามคำ',
            reason: 'เทียบสถานะ auth กับคำตอบของประตูสาธารณะที่บันทึกไว้ บันทึกเปลี่ยนได้หลัง deploy เท่านั้น ตรวจใน local-gate และ deploy walk',
            run({ doc, truth }) {
                const problems = [];
                const rows = docBlock(doc, 'integrations') || [];
                for (const i of truth.integrations.filter((x) => x.kind === 'auth')) {
                    const key = i.key.slice('auth:'.length);
                    const row = rows.find((r) => r.codes[0][0] === i.key);
                    const seen = truth.idp.map((h) => ({ env: h.env, file: h.file, p: h.providers.find((x) => x.key === key) }));
                    const missing = seen.filter((h) => !h.p);
                    if (missing.length) { missing.forEach((h) => problems.push(`${i.key}: ไม่มีใน ${h.file} (รัน scripts/docs/snapshot-idp.sh)`)); continue; }
                    const on = seen.filter((h) => h.p.enabled).map((h) => h.env);
                    if (on.length && on.length < seen.length) { problems.push(`${i.key}: เปิดเฉพาะ ${on.join(', ')} สามคำในตารางไม่พอบอก`); continue; }
                    const allowed = on.length ? ['ใช้งาน', 'sandbox'] : ['ยังไม่เปิด'];
                    if (row && !allowed.includes(row.cells[2])) {
                        problems.push(`${i.key}: เอกสารเขียน "${row.cells[2]}" แต่ประตูสาธารณะของ ${seen.map((h) => h.env).join(' และ ')} ตอบ ${seen.map((h) => h.p.state).join(' / ')} จึงต้องเป็น ${allowed.join(' หรือ ')}`);
                    }
                }
                return problems;
            },
        },
    },
    {
        id: 'K9', title: 'ไม่มีคำของที่ถอดแล้วนอกภาคผนวก ไม่มี บพข. และเรียกผู้ให้บริการตามหน้าที่',
        run({ doc, diagrams }) {
            const problems = [];
            const scan = (text, where) => text.split('\n').forEach((line, i) => {
                for (const [label, re] of RETIRED_TERMS) { if (re.test(line)) { problems.push(`${where} บรรทัด ${i + 1}: พบคำของที่ถอดแล้ว "${label}"`); } }
            });
            if (!doc.includes(RETIRED_HEADING)) { problems.push(`ไม่พบหัวข้อภาคผนวก "${RETIRED_HEADING}"`); }
            scan(mainBody(doc), DOC);
            for (const [rel, content] of Object.entries(diagrams)) { scan(content, rel); }
            doc.split('\n').forEach((line, i) => {
                for (const [label, re] of FORBIDDEN_ANYWHERE) { if (re.test(line)) { problems.push(`บรรทัด ${i + 1}: ${label}`); } }
            });
            stripCode(mainBody(doc)).split('\n').forEach((line, i) => {
                const m = line.match(VENDOR_NAMES);
                if (m) { problems.push(`บรรทัด ${i + 1}: ชื่อผู้ให้บริการ "${m[1]}" ในเนื้อความ (เรียกตามหน้าที่ ชื่อจริงใส่ได้เฉพาะใน code span)`); }
            });
            return problems;
        },
    },
    {
        id: 'K10', title: 'ทุก path ที่อ้างมีอยู่จริง และทุก ADR อยู่ในทะเบียน',
        run({ doc, root }) {
            const problems = [];
            const docDir = path.dirname(DOC);
            const cited = new Set();
            for (const m of stripFences(doc).matchAll(/`([^`\s]+)`/g)) {
                const p = m[1];
                if (/^(\/|@|https?:)|[<>*:]/.test(p) || !p.includes('/')) { continue; }
                cited.add(p.replace(/\/$/, ''));
            }
            for (const m of doc.matchAll(/\]\(([^)#\s]+)\)/g)) {
                if (!/^https?:/.test(m[1])) { cited.add(path.posix.join(docDir, m[1])); }
            }
            for (const p of cited) { if (!fs.existsSync(path.join(root, p))) { problems.push(`path ไม่มีอยู่จริง: ${p}`); } }
            const rows = blockOrFail(doc, 'adrs', problems);
            const adrs = fs.readdirSync(path.join(root, 'docs/adr')).filter((f) => /^ADR-.*\.md$/.test(f)).map((f) => `docs/adr/${f}`);
            reportSet(problems, 'ADR', setDiff(adrs, rows.map((r) => r.codes[0][0])));
            for (const r of rows) {
                if (!ADR_STATES.includes(r.cells[2])) { problems.push(`${r.codes[0][0]}: สถานะ "${r.cells[2]}" ไม่ใช่ ${ADR_STATES.join(' / ')}`); }
            }
            return problems;
        },
    },
    {
        id: 'K11', title: 'ไม่มี IP เครื่อง และไม่มีวันตรวจรับหรือกำหนดส่ง',
        run({ doc, diagrams }) {
            const problems = [];
            const texts = { [DOC]: doc, ...diagrams };
            for (const [rel, text] of Object.entries(texts)) {
                text.split('\n').forEach((line, i) => {
                    if (/\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(line)) { problems.push(`${rel} บรรทัด ${i + 1}: มีเลข IP`); }
                    if (/กำหนดส่ง|วันตรวจรับ|ตรวจรับงาน/.test(line)) { problems.push(`${rel} บรรทัด ${i + 1}: มีคำวันตรวจรับหรือกำหนดส่ง`); }
                });
            }
            return problems;
        },
    },
];

/** True once `prisma generate` has written the client that apps/backend resolves. */
function prismaClientGenerated(root) {
    try {
        const pkg = require.resolve('@prisma/client/package.json', { paths: [path.join(root, 'apps/backend')] });
        require.resolve('.prisma/client/schema.prisma', { paths: [fs.realpathSync(path.dirname(pkg))] });
        return true;
    } catch {
        return false;
    }
}

function stripFences(text) {
    return text.replace(/```[\s\S]*?```/g, '');
}

function headerSha(doc) {
    return (doc.match(/^ตรวจกับโค้ดที่ commit: `([0-9a-f]{7,40})`/m) || [])[1] || null;
}

function evidencePath(sha) {
    return `${EVIDENCE_DIR}/check-${sha.slice(0, 9)}.txt`;
}

function checkK12(root, doc) {
    const sha = headerSha(doc);
    if (!sha) { return ['หัวเอกสารไม่มีบรรทัด "ตรวจกับโค้ดที่ commit: `<sha>`"']; }
    const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    if (git(['rev-parse', '--git-dir']).status !== 0) { return []; }
    if (git(['cat-file', '-e', `${sha}^{commit}`]).status !== 0) { return [`sha ${sha} ในหัวเอกสารไม่ใช่ commit ใน repo`]; }
    if (git(['merge-base', '--is-ancestor', sha, 'HEAD']).status !== 0) { return [`sha ${sha} ในหัวเอกสารไม่อยู่ในประวัติของ HEAD`]; }
    const ev = path.join(root, evidencePath(sha));
    if (!fs.existsSync(ev) || !/^RESULT: PASS$/m.test(fs.readFileSync(ev, 'utf8'))) {
        return [`ไม่มีผลรันที่ผ่านของ ${sha} ใน ${evidencePath(sha)} (รันด้วย --write-evidence)`];
    }
    return [];
}

function runChecks(root, { requireK6 = false, scope = null } = {}) {
    const doc = read(root, DOC);
    const truth = readTruth(root);
    const diagrams = renderDiagrams(truth, doc);
    const ctx = { root, doc, truth, diagrams, requireK6 };
    const results = CHECKS.map((c) => {
        try {
            const out = c.run(ctx);
            if (!Array.isArray(out)) { return { id: c.id, title: c.title, problems: [], skipped: out.skipped }; }
            if (!c.host) { return { id: c.id, title: c.title, problems: out }; }
            if (scope) { return { id: c.id, title: c.host.repoTitle, problems: out, scopeSkip: c.host }; }
            return { id: c.id, title: c.title, problems: out.concat(c.host.run(ctx)) };
        } catch (err) { return { id: c.id, title: c.title, problems: [`ตรวจไม่ได้: ${err.message}`] }; }
    });
    return { doc, results };
}

function format(results) {
    const lines = [];
    for (const r of results) {
        if (r.skipped) { lines.push(`SKIP ${r.id} ${r.title} (${r.skipped})`); continue; }
        lines.push(`${r.problems.length ? 'FAIL' : 'PASS'} ${r.id} ${r.title}`);
        for (const p of r.problems) { lines.push(`     - ${p}`); }
        if (r.scopeSkip) { lines.push(`SKIP-SCOPE ${r.scopeSkip.id} ${r.scopeSkip.reason}`); }
    }
    return lines;
}

if (require.main === module) {
    const root = rootFromArgs(process.argv);
    const writeEvidence = process.argv.includes('--write-evidence');
    const scopeAt = process.argv.indexOf('--scope');
    const scope = scopeAt < 0 ? null : process.argv[scopeAt + 1];
    if (scopeAt >= 0 && scope !== 'repo') {
        console.error(`--scope รับได้แค่ repo ได้รับ "${scope}"`);
        process.exit(2);
    }
    if (scope && writeEvidence) {
        console.error('--write-evidence ต้องเป็นผลรันเต็ม ใช้คู่กับ --scope ไม่ได้');
        process.exit(2);
    }
    const { doc, results } = runChecks(root, { requireK6: writeEvidence || process.env.ARCH_REQUIRE_K6 === '1', scope });
    const k1to11Pass = results.every((r) => r.problems.length === 0 && !r.skipped);
    if (writeEvidence && k1to11Pass) {
        const sha = headerSha(doc);
        const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
        const body = [`# check-architecture K1-K11 · หัวเอกสาร ${sha} · รันที่ HEAD ${head}`, ...format(results), 'RESULT: PASS', ''].join('\n');
        fs.mkdirSync(path.join(root, EVIDENCE_DIR), { recursive: true });
        fs.writeFileSync(path.join(root, evidencePath(sha)), body, 'utf8');
    }
    results.push({ id: 'K12', title: 'หัวเอกสารระบุ sha ที่ตรวจ และมีผลรันที่ผ่านของ sha นั้น', problems: checkK12(root, doc) });
    const lines = format(results);
    const pass = results.every((r) => r.problems.length === 0);
    const notChecked = results.filter((r) => r.scopeSkip).map((r) => r.scopeSkip.id);
    if (!pass) { lines.push('RESULT: FAIL'); } else if (scope) { lines.push(`RESULT: PASS-SCOPE ${scope} ไม่ได้ตรวจ ${notChecked.join(' ')}`); } else { lines.push('RESULT: PASS'); }
    console.log(lines.join('\n'));
    process.exit(pass ? 0 : 1);
}

module.exports = { runChecks, CHECKS };

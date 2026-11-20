#!/usr/bin/env node
'use strict';

/**
 * Reads the architecture facts out of the code and renders the Mermaid diagrams
 * under docs/architecture/diagrams/. check-architecture.js imports readTruth()
 * and renderDiagrams() so the doc and the diagrams are judged against one reading.
 *
 *   node scripts/docs/generate-architecture-diagrams.js            # write diagrams
 *   node scripts/docs/generate-architecture-diagrams.js --root DIR # read/write another tree
 */

const fs = require('fs');
const path = require('path');

const DOC = 'docs/architecture/README.md';
const DIAGRAM_DIR = 'docs/architecture/diagrams';
const HOST_SNAPSHOTS = { staging: 'evidence/architecture/hosts/staging.txt', demo: 'evidence/architecture/hosts/demo.txt' };
const IDP_SNAPSHOTS = { staging: 'evidence/architecture/idp/staging.txt', demo: 'evidence/architecture/idp/demo.txt' };
const ENV_COMPOSE = { staging: 'docker-compose.staging.yml', demo: 'docker-compose.demo.yml' };

function read(root, rel) {
    return fs.readFileSync(path.join(root, rel), 'utf8');
}

function freshRequire(root, rel) {
    const abs = path.join(root, rel);
    for (const key of Object.keys(require.cache)) {
        if (key.startsWith(path.join(root, 'apps'))) { delete require.cache[key]; }
    }
    return require(abs);
}

function readRoles(root) {
    const rbac = freshRequire(root, 'apps/backend/shared/canonical-rbac.js');
    const labels = parseTsRecord(read(root, 'apps/web-app/src/lib/role-utils.ts'), 'ROLE_LABELS_TH', rbac.CANONICAL_ROLES);
    return Object.values(rbac.CANONICAL_ROLES).map((key) => ({
        key,
        affiliation: rbac.ROLE_AFFILIATION_BY_ROLE[key] ?? null,
        codeLabel: labels[key] ?? null,
    }));
}

/** Parses `[CANONICAL_ROLES.X]: 'label'` or `KEY: 'label'` entries of one exported Record literal. */
function parseTsRecord(source, constName, roleConstants = {}) {
    const start = source.indexOf(`export const ${constName}`);
    if (start < 0) { return {}; }
    const body = source.slice(start, source.indexOf('\n};', start));
    const out = {};
    const re = /^\s*(?:\[CANONICAL_ROLES\.([A-Z_]+)\]|([A-Z_]+)):\s*'([^']*)'/gm;
    let m;
    while ((m = re.exec(body))) {
        const key = m[1] ? roleConstants[m[1]] : m[2];
        if (key) { out[key] = m[3]; }
    }
    return out;
}

function readWorkflow(root) {
    const wf = freshRequire(root, 'apps/backend/services/workflow-transition-service.js');
    const labels = parseTsRecord(read(root, 'apps/web-app/src/lib/constants/workflow-states.ts'), 'STATUS_LABELS');
    const transitions = [];
    for (const from of wf.WORKFLOW_STATES) {
        for (const to of wf.ALLOWED_TRANSITIONS[from] ?? []) {
            const actors = Object.entries(wf.ROLE_TRANSITIONS)
                .filter(([, edges]) => edges.has(`${from}->${to}`))
                .map(([role]) => role);
            transitions.push({ from, to, actors });
        }
    }
    return {
        states: wf.WORKFLOW_STATES.map((key) => ({ key, label: labels[key] ?? null })),
        transitions,
        requiresComment: [...wf.REQUIRES_COMMENT_TARGETS],
        editable: [...wf.EDITABLE_STATUSES],
    };
}

function readModels(root) {
    const dir = 'apps/backend/prisma/schema';
    const blocks = [];
    for (const file of fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.prisma')).sort()) {
        const src = read(root, `${dir}/${file}`);
        const re = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
        let m;
        while ((m = re.exec(src))) { blocks.push({ name: m[1], file: `${dir}/${file}`, body: m[2] }); }
    }
    const names = new Set(blocks.map((b) => b.name));
    return blocks.map(({ name, file, body }) => {
        const relations = [];
        const types = new Map();
        let key = [];
        for (const line of body.split('\n')) {
            const t = line.trim();
            const field = t.match(/^(\w+)\s+(\w+)/);
            if (field && !t.startsWith('@@')) { types.set(field[1], field[2]); }
            if (field && /\s@id\b/.test(t)) { key = [field[1]]; }
            const compound = t.match(/^@@id\(\s*(?:fields:\s*)?\[([^\]]+)\]/);
            if (compound) { key = compound[1].split(',').map((k) => k.trim()); }
            const f = t.match(/^(\w+)\s+(\w+)(\[\])?(\?)?\s+.*@relation\([^)]*fields:/);
            if (f && names.has(f[2])) { relations.push({ field: f[1], target: f[2] }); }
        }
        return { name, file, relations, key: key.map((k) => ({ name: k, type: types.get(k) })) };
    });
}

/** Top-level arguments of the call whose `(` is at `open`, or null when it never closes. */
function callArgs(src, open) {
    const args = [];
    let depth = 0; let quote = null; let from = open + 1;
    for (let i = open; i < src.length; i += 1) {
        const ch = src[i];
        if (quote) {
            if (ch === '\\') { i += 1; } else if (ch === quote) { quote = null; }
            continue;
        }
        if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
        if ('([{'.includes(ch)) { depth += 1; continue; }
        if (')]}'.includes(ch)) {
            depth -= 1;
            if (depth === 0) { args.push(src.slice(from, i).trim()); return args.filter(Boolean); }
            continue;
        }
        if (ch === ',' && depth === 1) { args.push(src.slice(from, i).trim()); from = i + 1; }
    }
    return null;
}

/**
 * Route groups = folders under apps/backend/routes/api. Mount paths come from every
 * `.use(...)` call in index.js that has two or more arguments. Its first argument must
 * be a single-quoted path, its receiver a Router declared in index.js, and its last
 * argument `require('./<folder>/...')`, a variable required from a folder, or another
 * Router of index.js (a sub-router whose own mounts nest under this path). A
 * `require('./<file>')` of a single file beside index.js is a file mount, not a group.
 * Anything else is returned in `errors`, never skipped.
 */
function readRouteGroups(root) {
    const apiDir = 'apps/backend/routes/api';
    const folders = fs.readdirSync(path.join(root, apiDir), { withFileTypes: true })
        .filter((d) => d.isDirectory()).map((d) => d.name).sort();
    const src = read(root, `${apiDir}/index.js`)
        .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
        .replace(/(^|\s)\/\/.*$/gm, '$1');
    const lineOf = (i) => src.slice(0, i).split('\n').length;
    const varFolder = {};
    for (const m of src.matchAll(/const\s+(\w+)\s*=\s*require\('\.\/([\w-]+)[/']/g)) { varFolder[m[1]] = m[2]; }
    const routers = new Set([...src.matchAll(/const\s+(\w+)\s*=\s*express\.Router\(\)/g)].map((m) => m[1]));
    const exported = (src.match(/module\.exports\s*=\s*(\w+)/) || [])[1];
    const errors = [];
    const uses = [];
    for (const m of src.matchAll(/(\w+)\s*\.use\(/g)) {
        const line = lineOf(m.index);
        const args = callArgs(src, m.index + m[0].length - 1);
        if (!args) { errors.push(`index.js บรรทัด ${line}: อ่าน .use( ไม่จบ`); continue; }
        if (args.length < 2) { continue; }
        const at = `index.js บรรทัด ${line}: ${m[1]}.use(${args[0]}, ...)`;
        const literal = args[0].match(/^'([^']*)'$/);
        if (!literal) { errors.push(`${at} path ไม่ใช่ข้อความตายตัว`); continue; }
        if (!routers.has(m[1])) { errors.push(`${at} ไม่รู้จัก router "${m[1]}"`); continue; }
        const last = args[args.length - 1];
        const inline = last.match(/^require\('\.\/([\w-]+)[/']/);
        const name = (last.match(/^(\w+)$/) || [])[1];
        const target = inline ? { folder: inline[1] }
            : name && varFolder[name] ? { folder: varFolder[name] }
                : name && routers.has(name) ? { router: name } : null;
        if (!target) { errors.push(`${at} ไม่รู้ว่า "${last.split('\n')[0]}" เป็น route group ใด`); continue; }
        if (target.folder && !folders.includes(target.folder)) {
            if (!inline || !fs.existsSync(path.join(root, apiDir, `${target.folder}.js`))) { errors.push(`${at} ไม่มีโฟลเดอร์ ${apiDir}/${target.folder}`); continue; }
            target.file = `${apiDir}/${target.folder}.js`;
            delete target.folder;
        }
        uses.push({ receiver: m[1], mountPath: literal[1], line, ...target });
    }
    const prefix = { [exported]: '' };
    const join = (base, p) => `${base}${p === '/' ? '' : p}`;
    for (let changed = true; changed;) {
        changed = false;
        for (const u of uses.filter((x) => x.router && !(x.router in prefix) && x.receiver in prefix)) {
            prefix[u.router] = join(prefix[u.receiver], u.mountPath);
            changed = true;
        }
    }
    const mounts = Object.fromEntries(folders.map((f) => [f, new Set()]));
    const fileMounts = [];
    for (const u of uses.filter((x) => !x.router)) {
        if (!(u.receiver in prefix)) { errors.push(`index.js บรรทัด ${u.line}: router "${u.receiver}" ไม่ได้แขวนกับ ${exported}`); continue; }
        const mount = `/api${join(prefix[u.receiver], u.mountPath)}`;
        if (u.folder) { mounts[u.folder].add(mount); } else { fileMounts.push({ file: u.file, mount }); }
    }
    return { groups: folders.map((folder) => ({ folder, mounts: [...mounts[folder]].sort() })), fileMounts, errors };
}

function composeServices(source) {
    const out = [];
    let inServices = false;
    for (const line of source.split('\n')) {
        if (/^services:\s*$/.test(line)) { inServices = true; continue; }
        if (/^\S/.test(line)) { inServices = false; }
        const m = inServices && line.match(/^ {2}([A-Za-z0-9_.-]+):\s*$/);
        if (m) { out.push(m[1]); }
    }
    return out;
}

function readHosts(root) {
    return Object.entries(HOST_SNAPSHOTS).map(([env, rel]) => {
        const containers = read(root, rel).split('\n')
            .filter((l) => l.trim() && !l.startsWith('#'))
            .map((l) => { const [name, image, service] = l.trim().split(/\s+/); return { name, image, service }; });
        return { env, containers, composeServices: composeServices(read(root, ENV_COMPOSE[env])) };
    });
}

function readVersions(root) {
    const backend = JSON.parse(read(root, 'apps/backend/package.json'));
    const web = JSON.parse(read(root, 'apps/web-app/package.json'));
    const dep = (pkg, name) => (pkg.dependencies || {})[name] || (pkg.devDependencies || {})[name] || null;
    const nodeFrom = (rel) => (read(root, rel).match(/^FROM node:(\d+)/m) || [])[1] || null;
    const redis = (read(root, 'docker-compose.production.yml').match(/image:\s*redis:([\w.-]+)/) || [])[1] || null;
    const provider = (read(root, 'apps/backend/prisma/schema/_base.prisma').match(/provider\s*=\s*"(postgresql)"/) || [])[1] || null;
    return {
        'node (backend Dockerfile)': nodeFrom('apps/backend/Dockerfile'),
        'node (web-app Dockerfile)': nodeFrom('apps/web-app/Dockerfile'),
        'node (engines)': backend.engines && backend.engines.node,
        next: dep(web, 'next'),
        react: dep(web, 'react'),
        express: dep(backend, 'express'),
        prisma: dep(backend, 'prisma'),
        '@prisma/client': dep(backend, '@prisma/client'),
        'redis image': redis,
        'datasource provider': provider,
    };
}

function readIntegrations(root) {
    const auth = read(root, 'apps/backend/config/auth-providers.js');
    const keys = JSON.parse((auth.match(/PROVIDER_KEYS\s*=\s*Object\.freeze\((\[[^\]]*\])\)/) || [])[1].replace(/'/g, '"'));
    const adapters = fs.readdirSync(path.join(root, 'apps/backend/services/payment'))
        .filter((f) => f.endsWith('-adapter.js') && f !== 'payment-adapter.js').sort();
    return [
        ...keys.map((key) => ({ key: `auth:${key}`, kind: 'auth' })),
        ...adapters.map((file) => ({ key: `payment:${file}`, kind: 'payment' })),
    ];
}

/** What GET /api/auth/idp/providers answered on each host (snapshot-idp.sh). */
function readIdp(root) {
    return Object.entries(IDP_SNAPSHOTS).map(([env, rel]) => ({
        env,
        file: rel,
        providers: read(root, rel).split('\n')
            .filter((l) => l.trim() && !l.startsWith('#'))
            .map((l) => { const [key, state, enabled] = l.trim().split(/\s+/); return { key, state, enabled: enabled === 'true' }; }),
    }));
}

function readTruth(root) {
    const routes = readRouteGroups(root);
    return {
        roles: readRoles(root),
        workflow: readWorkflow(root),
        models: readModels(root),
        routeGroups: routes.groups,
        routeErrors: routes.errors,
        routeFileMounts: routes.fileMounts,
        hosts: readHosts(root),
        versions: readVersions(root),
        integrations: readIntegrations(root),
        idp: readIdp(root),
    };
}

/** Rows of one `<!-- arch:NAME -->` table in the doc: cells as text plus their `code` spans. */
function docBlock(doc, name) {
    const open = `<!-- arch:${name} -->`;
    const start = doc.indexOf(open);
    if (start < 0) { return null; }
    const end = doc.indexOf(`<!-- /arch:${name} -->`, start);
    const body = doc.slice(start + open.length, end < 0 ? undefined : end);
    return body.split('\n')
        .filter((l) => /^\|/.test(l.trim()) && !/^\|\s*-/.test(l.trim()))
        .slice(1)
        .map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
        .map((cells) => ({ cells, codes: cells.map((c) => [...c.matchAll(/`([^`]+)`/g)].map((m) => m[1])) }));
}

const HEADER = '<!-- สร้างโดย scripts/docs/generate-architecture-diagrams.js ห้ามแก้ด้วยมือ -->\n';
const AFFILIATION_TH = {
    public: 'ผู้ขอรับรอง', certification_body: 'กรม (หน่วยรับรอง)', platform_operator: 'บริษัทผู้ให้บริการ', system: 'ระบบอัตโนมัติ',
};

function renderContext(truth) {
    const lines = [HEADER, '# แผนภาพบริบท (C4 ชั้นที่ 1)', '', '```mermaid', 'flowchart LR'];
    for (const [aff, title] of Object.entries(AFFILIATION_TH)) {
        const roles = truth.roles.filter((r) => r.affiliation === aff);
        if (!roles.length) { continue; }
        lines.push(`  subgraph aff_${aff}["${title}"]`);
        for (const r of roles) { lines.push(`    ${r.key}["${r.key}"]`); }
        lines.push('  end');
    }
    lines.push('  public_scan["ผู้ซื้อ/ประชาชนที่สแกน QR"]');
    lines.push('  gacp(("ระบบ GACP"))');
    for (const r of truth.roles) { lines.push(`  ${r.key} --> gacp`); }
    lines.push('  public_scan --> gacp');
    for (const i of truth.integrations) {
        const id = i.key.replace(/[^A-Za-z0-9]/g, '_');
        lines.push(`  ${id}[["${i.key}"]]`);
        lines.push(`  gacp --- ${id}`);
    }
    lines.push('```', '');
    return lines.join('\n');
}

function renderDeployment(truth) {
    const lines = [HEADER, '# แผนภาพการติดตั้ง', '', 'ที่มา: `evidence/architecture/hosts/*.txt` (บันทึกด้วย `scripts/docs/snapshot-hosts.sh`)', '', '```mermaid', 'flowchart TB'];
    lines.push('  edge["CDN/ไฟร์วอลล์หน้าบ้าน"]');
    for (const host of truth.hosts) {
        lines.push(`  subgraph ${host.env}_host["เครื่อง ${host.env}"]`);
        lines.push(`    ${host.env}_hostnginx["nginx บนเครื่อง"]`);
        for (const c of host.containers) { lines.push(`    ${host.env}_${c.service.replace(/-/g, '_')}["${c.service}"]`); }
        lines.push('  end');
        lines.push(`  edge --> ${host.env}_hostnginx`);
        lines.push(`  ${host.env}_db[("Postgres แบบบริการ: ${host.env}")]`);
        const backend = host.containers.find((c) => /^backend/.test(c.service));
        if (backend) { lines.push(`  ${host.env}_${backend.service.replace(/-/g, '_')} --> ${host.env}_db`); }
    }
    lines.push('```', '');
    return lines.join('\n');
}

function renderStates(truth) {
    const lines = [HEADER, '# วงจรสถานะคำขอ', '', 'ที่มา: `WORKFLOW_STATES`, `ALLOWED_TRANSITIONS`, `ROLE_TRANSITIONS` ใน `apps/backend/services/workflow-transition-service.js` · ป้ายบนเส้น = บทบาทที่เดินเส้นนั้นได้', '', '```mermaid', 'stateDiagram-v2'];
    lines.push(`  [*] --> ${truth.workflow.states[0].key}`);
    for (const t of truth.workflow.transitions) {
        lines.push(`  ${t.from} --> ${t.to} : ${t.actors.length ? t.actors.join(', ') : '(ไม่มีบทบาทถือเส้นนี้)'}`);
    }
    const hasOut = new Set(truth.workflow.transitions.map((t) => t.from));
    for (const s of truth.workflow.states) { if (!hasOut.has(s.key)) { lines.push(`  ${s.key} --> [*]`); } }
    lines.push('```', '');
    return lines.join('\n');
}

function renderStateReference(truth) {
    const wf = truth.workflow;
    const lines = [HEADER, '# ตารางอ้างอิงวงจรสถานะคำขอ', '',
        'ที่มา: `apps/backend/services/workflow-transition-service.js` · ป้ายบนจอ: `apps/web-app/src/lib/constants/workflow-states.ts` · แผนภาพ: [diagrams/application-states.md](diagrams/application-states.md)', '',
        '## เส้นที่เดินได้และบทบาทที่เดินได้', '', '| จาก | ไป | บทบาท |', '|---|---|---|'];
    for (const t of wf.transitions) {
        lines.push(`| \`${t.from}\` | \`${t.to}\` | ${t.actors.length ? t.actors.map((a) => `\`${a}\``).join(' ') : 'ไม่มีบทบาทถือเส้นนี้'} |`);
    }
    lines.push('', '## สถานะปลายทางที่ต้องมีเหตุผลประกอบ (`REQUIRES_COMMENT_TARGETS`)', '');
    for (const s of wf.requiresComment) { lines.push(`- \`${s}\``); }
    lines.push('', '## สถานะที่ผู้ยื่นแก้ฟอร์มได้ (`EDITABLE_STATUSES`)', '');
    for (const s of wf.editable) { lines.push(`- \`${s}\``); }
    lines.push('');
    return lines.join('\n');
}

function renderDataModel(truth, groups) {
    const groupOf = new Map();
    for (const g of groups) { for (const m of g.models) { groupOf.set(m, g.name); } }
    const lines = [HEADER, '# แผนภาพข้อมูลตามกลุ่มโดเมน', '', 'ที่มา: `apps/backend/prisma/schema/*.prisma` · การจัดกลุ่ม: ตาราง arch:model-groups ใน `docs/architecture/README.md` · ในกล่องแสดงเฉพาะคีย์หลัก (PK) · เส้น = foreign key (ฝั่งที่มี `@relation(fields:)`)', ''];
    const cross = new Map();
    for (const m of truth.models) {
        for (const r of m.relations) {
            const a = groupOf.get(m.name); const b = groupOf.get(r.target);
            if (a && b && a !== b) { const k = `${a}|${b}`; cross.set(k, (cross.get(k) || 0) + 1); }
        }
    }
    const gid = (name) => `g${groups.findIndex((g) => g.name === name)}`;
    lines.push('## ความสัมพันธ์ข้ามกลุ่ม', '', '```mermaid', 'flowchart LR');
    for (const g of groups) { lines.push(`  ${gid(g.name)}["${g.name} (${g.models.length})"]`); }
    for (const [k, n] of [...cross.entries()].sort()) {
        const [a, b] = k.split('|');
        lines.push(`  ${gid(a)} -->|${n}| ${gid(b)}`);
    }
    lines.push('```', '');
    const byName = new Map(truth.models.map((m) => [m.name, m]));
    for (const g of groups) {
        lines.push(`## ${g.name}`, '', '```mermaid', 'erDiagram');
        const inGroup = new Set(g.models);
        for (const name of g.models) {
            lines.push(`  ${name} {`, ...byName.get(name).key.map((k) => `    ${k.type} ${k.name} PK`), '  }');
        }
        for (const m of truth.models.filter((x) => inGroup.has(x.name))) {
            for (const r of m.relations.filter((x) => inGroup.has(x.target))) {
                lines.push(`  ${r.target} ||--o{ ${m.name} : ${r.field}`);
            }
        }
        lines.push('```', '');
    }
    return lines.join('\n');
}

function modelGroups(doc) {
    const rows = docBlock(doc, 'model-groups') || [];
    return rows.map((r) => ({ name: r.cells[0].replace(/`/g, ''), models: r.codes.slice(1).flat() }));
}

function renderDiagrams(truth, doc) {
    return {
        [`${DIAGRAM_DIR}/context.md`]: renderContext(truth),
        [`${DIAGRAM_DIR}/deployment.md`]: renderDeployment(truth),
        [`${DIAGRAM_DIR}/application-states.md`]: renderStates(truth),
        ['docs/architecture/workflow-state-machine.md']: renderStateReference(truth),
        [`${DIAGRAM_DIR}/data-model.md`]: renderDataModel(truth, modelGroups(doc)),
    };
}

function rootFromArgs(argv) {
    const i = argv.indexOf('--root');
    return path.resolve(i >= 0 ? argv[i + 1] : path.join(__dirname, '..', '..'));
}

if (require.main === module) {
    const root = rootFromArgs(process.argv);
    const files = renderDiagrams(readTruth(root), read(root, DOC));
    for (const [rel, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        fs.writeFileSync(path.join(root, rel), content, 'utf8');
        console.log(`[architecture-diagrams] written: ${rel}`);
    }
}

module.exports = { DOC, readTruth, renderDiagrams, docBlock, modelGroups, rootFromArgs, read };

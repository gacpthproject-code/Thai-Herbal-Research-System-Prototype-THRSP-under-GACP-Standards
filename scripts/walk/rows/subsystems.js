'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { check } = require('../lib/context');
const { scrub } = require('../lib/mask');

const REPO = path.join(__dirname, '..', '..', '..');
const HERB_SPECIES = 6;

async function staffGet(ctx, p, preferred) {
    const d = await ctx.driver();
    const role = preferred || ['approver', 'reviewer', 'dispatcher', 'inspector', 'finplat'].find((r) => d.signedIn.has(r)) || 'approver';
    if (!(await ctx.signIn(role)).ok) { return { status: null, role }; }
    return { ...(await d.api(role, 'GET', p)), role };
}

const FULL_SHA = /^[0-9a-f]{40}$/;

function checkArchitectureAtRevisionArchive(revision, outDir) {
    if (!FULL_SHA.test(revision)) { throw new Error(`revision จากเครื่องไม่ใช่ sha 40 ตัว: ${JSON.stringify(String(revision).slice(0, 60))}`); }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'walk-arch-'));
    const tar = `${dir}.tar`;
    try {
        execFileSync('git', ['-C', REPO, 'archive', '--format=tar', '-o', tar, revision], { stdio: 'pipe', timeout: 300000 });
        execFileSync('tar', ['-xf', tar, '-C', dir], { stdio: 'pipe', timeout: 300000 });
        const r = spawnSync('node', ['scripts/docs/check-architecture.js'], { cwd: dir, encoding: 'utf8', timeout: 300000 });
        const out = scrub(`${r.stdout}${r.stderr}`);
        fs.writeFileSync(path.join(outDir, 'check-architecture.log'), out);
        return { code: r.status, last: out.trim().split('\n').slice(-2).join(' ') };
    } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(tar, { force: true }); }
}

module.exports = {
    id: 'subsystems',
    title: 'ระบบย่อยที่ตอบบนเครื่อง: เทียบมาตรฐาน แบบสำรวจ ฐานข้อมูลสมุนไพร ตรวจภาพ และเอกสารสถาปัตยกรรม',
    async run(ctx) {
        const S = ctx.state;
        return [
            await check('standards-comparison', 'ตารางเทียบมาตรฐาน WHO · ไทย · ASEAN ตอบบนเครื่อง ทุกแถวมีเลขข้อและแหล่ง', async () => {
                const list = await ctx.http('GET', '/api/standards');
                const cmp = await staffGet(ctx, '/api/standards/comparison');
                if (list.status !== 200 || cmp.status !== 200) { return ctx.fail(`/api/standards ${list.status} · /comparison ${cmp.status} (${cmp.role})`); }
                const topics = cmp.body?.data?.topics || [];
                const cells = topics.flatMap((t) => t.cells || []);
                const missing = cells.filter((c) => !c.ref || !c.sourceId).length;
                if (!topics.length || topics.some((t) => !t.cells?.length)) { return ctx.fail('ตารางเทียบว่างหรือมีหัวข้อที่ไม่มีช่อง'); }
                return missing ? ctx.fail(`${missing}/${cells.length} ช่องไม่มีเลขข้อหรือแหล่ง`) : ctx.pass(`${topics.length} หัวข้อ ${cells.length} ช่อง มีเลขข้อและแหล่งครบ (อ่านด้วย ${cmp.role})`);
            }),
            await check('survey-system', 'ระบบแบบสำรวจตอบบนเครื่อง', async () => {
                const r = await staffGet(ctx, '/api/surveys/templates');
                return r.status === 200 ? ctx.pass(`200 (อ่านด้วย ${r.role})`) : ctx.fail(`ตอบ ${r.status} (${r.role})`);
            }),
            await check('architecture', 'เอกสารสถาปัตยกรรมตรงกับโค้ดของ revision ที่เครื่องรัน (check-architecture.js)', async () => {
                if (!S.revision) { return ctx.fail('ไม่รู้ revision ของเครื่อง (แถว identity)'); }
                const r = checkArchitectureAtRevisionArchive(S.revision, ctx.outDir);
                return r.code === 0 ? ctx.pass(`${S.revision.slice(0, 12)}: ${r.last}`) : ctx.fail(`${S.revision.slice(0, 12)} exit ${r.code}: ${r.last}`);
            }),
            await check('herb-db', `ฐานข้อมูลสมุนไพรมีครบ ${HERB_SPECIES} ชนิดและมีรายการที่อ้างแหล่ง`, async () => {
                const r = await ctx.http('GET', '/api/herbs/coverage');
                const c = r.json?.data;
                if (r.status !== 200 || !c) { return ctx.fail(`/api/herbs/coverage ${r.status}`); }
                const detail = `${c.totalHerbs} ชนิด · ${c.totalEntries} รายการ · อ้างแหล่ง ${c.totalCited}`;
                if (c.totalHerbs !== HERB_SPECIES) { return ctx.fail(`${detail} (ต้องมี ${HERB_SPECIES} ชนิด)`); }
                return c.totalCited > 0 ? ctx.pass(detail) : ctx.fail(`${detail} (ไม่มีรายการที่อ้างแหล่ง)`);
            }),
            await check('image-system', 'บริการตรวจภาพตอบบนเครื่อง', async () => {
                const r = await staffGet(ctx, '/api/image-assessment/catalog', 'inspector');
                return r.status === 200 ? ctx.pass(`catalog 200 (อ่านด้วย ${r.role})`) : ctx.fail(`catalog ${r.status} (${r.role})`);
            }),
        ];
    },
};

module.exports.checkArchitectureAtRevisionArchive = checkArchitectureAtRevisionArchive;

'use strict';

const fs = require('fs');
const path = require('path');
const { check } = require('../lib/context');

const REPO = path.join(__dirname, '..', '..', '..');

module.exports = {
    id: 'identity',
    title: 'ตัวตนของ build ที่เดินตรวจ (revision ของ backend และ frontend ตรงกับ main)',
    async run(ctx) {
        return [
            await check('revision', 'backend กับ frontend รัน commit เดียวกัน', async () => {
                const be = await ctx.http('GET', '/api/health');
                const fe = await ctx.http('GET', '/api/webapp-version');
                const b = be.json?.revision; const f = fe.json?.revision;
                ctx.state.revision = b || null;
                if (!b || !f) { return ctx.fail(`อ่าน revision ไม่ได้ (health ${be.status}, webapp-version ${fe.status})`); }
                return b === f ? ctx.pass(`revision ${b.slice(0, 12)} builtAt ${be.json.builtAt}`) : ctx.fail(`backend ${b.slice(0, 12)} ≠ frontend ${f.slice(0, 12)}`);
            }),
            await check('deploy-drift', 'scripts/probes/deploy-drift.sh เฉพาะแถวของเครื่องนี้', async () => {
                const rows = fs.readFileSync(path.join(REPO, 'scripts/probes/deploy-targets.txt'), 'utf8').split('\n')
                    .filter((l) => l.trim() && !l.trim().startsWith('#') && l.split('|')[0].trim().startsWith(`${ctx.targetName}-`));
                if (!rows.length) { return ctx.notYet(`deploy-targets.txt ไม่มีแถวของ ${ctx.targetName}`); }
                const file = path.join(ctx.outDir, 'deploy-targets.txt');
                fs.writeFileSync(file, `${rows.join('\n')}\n`);
                return ctx.runProbe('deploy-drift', { DEPLOY_TARGETS_FILE: file });
            }),
        ];
    },
};

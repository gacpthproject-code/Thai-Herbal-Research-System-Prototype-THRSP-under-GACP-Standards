#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { STATUS, normalizeCheck, foldRow, exitCodeFor, resolveTarget, stripeGate, selectRows, parseArgs } = require('./lib/verdict');
const { loadConfig, inContainer } = require('./lib/target');
const { createContext, asMissingAccount } = require('./lib/context');
const { writeResult } = require('./lib/report');
const { scrub } = require('./lib/mask');

const REGISTRY = ['identity', 'cert-path', 'finance', 'jobs', 'tnt', 'accounts', 'verify', 'pdpa', 'subsystems']
    .map((id) => require(`./rows/${id}`));

const EXIT_REFUSED = 2;
const DEMO_CLOSED_ROWS = ['cert-path', 'tnt'];

const IO = {
    paymentMode: (base) => fetch(`${base}/api/payments/mode`, { signal: AbortSignal.timeout(30000) }).then((r) => r.json()).then((b) => b?.data?.mode ?? null).catch(() => null),
    stripeKeyClasses: (cfg) => inContainer(cfg, 'stripe-keys').catch(() => ({})),
    createContext,
};

async function preflight(base, cfg, io) {
    const keys = await io.stripeKeyClasses(cfg);
    return stripeGate({ paymentMode: await io.paymentMode(base), secretKeyClass: keys.secret, publishableKeyClass: keys.publishable });
}

async function main(argv, io = IO) {
    let opts;
    try { opts = parseArgs(argv); } catch (err) { console.error(err.message); return EXIT_REFUSED; }
    if (opts.list) { for (const r of REGISTRY) { console.log(`${r.id}\t${r.title}${r.note ? `\n\t${r.note}` : ''}`); } return 0; }
    if (!opts.base) { console.error('usage: deploy-walk.sh <base-url> [--target staging|demo] [--rows a,b] [--out dir] [--list]'); return EXIT_REFUSED; }
    const target = resolveTarget(opts.base, opts.target);
    if (!target.ok) { console.error(`ปฏิเสธ: ${target.reason}`); return EXIT_REFUSED; }
    const picked = selectRows(REGISTRY, opts.rows);
    if (!picked.ok) { console.error(picked.reason); return EXIT_REFUSED; }
    const writes = picked.rows.filter((r) => DEMO_CLOSED_ROWS.includes(r.id)).map((r) => r.id);
    if (target.name === 'demo' && writes.length) {
        console.error(`ปฏิเสธ: แถว ${writes.join(', ')} เขียนข้อมูลและปิดบน demo จนกว่าจะมีบัญชีเดินตรวจของ demo และ operator ตัดสินเรื่องใบทดสอบในหน้าตรวจสอบสาธารณะ (deploy-demo.md) · ใช้ --rows เลือกแถวอื่น`);
        return EXIT_REFUSED;
    }
    let cfg;
    try { cfg = loadConfig(target.name); } catch (err) { console.error(`ปฏิเสธ: ${err.message}`); return EXIT_REFUSED; }

    const runId = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 16).replace(/[-:T]/g, '');
    const outDir = path.resolve(opts.out || path.join(os.homedir(), 'work/state/walk', `deploy-walk-${target.name}-${runId}`));
    fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
    const log = (s) => { const line = `${new Date().toISOString()} ${scrub(s)}`; console.log(line); fs.appendFileSync(path.join(outDir, 'walk.log'), `${line}\n`); };

    const gate = await preflight(target.base, cfg, io);
    if (!gate.ok) { log(`ปฏิเสธ: ${gate.reason}`); return EXIT_REFUSED; }
    log(`target ${target.name} ${target.base} · Stripe test mode confirmed · rows ${picked.rows.map((r) => r.id).join(',')} · out ${outDir}`);

    let ctx;
    try { ctx = io.createContext({ base: target.base, targetName: target.name, cfg, outDir, log }); } catch (err) { log(`ปฏิเสธ: ไฟล์ตั้งค่า ${err.message}`); return EXIT_REFUSED; }
    ctx.runId = runId;
    ctx.state.stripeGate = gate;
    ctx.results = {};
    const startedAt = new Date().toISOString();
    const rows = [];
    try {
        for (const row of picked.rows) {
            log(`row ${row.id} start`);
            let checks;
            try { checks = await row.run(ctx); } catch (err) { checks = [{ id: 'row', title: row.title, ...(asMissingAccount(err) || { status: STATUS.FAIL, detail: `แถวล้ม: ${scrub(String(err.message).split('\n')[0])}` }) }]; }
            checks = checks.map((c) => normalizeCheck({ ...c, detail: scrub(c.detail ?? '') }));
            const status = foldRow(checks);
            ctx.results[row.id] = status;
            rows.push({ id: row.id, title: row.title, note: row.note, status, checks });
            log(`row ${row.id} ${status} ${checks.map((c) => `${c.id}=${c.status}`).join(' ')}`);
        }
    } finally { await ctx.close(); }

    const end = await fetch(`${target.base}/api/health`, { signal: AbortSignal.timeout(30000) }).then((r) => r.json()).catch(() => ({}));
    if (ctx.state.revision && end.revision !== ctx.state.revision) {
        rows.push({ id: 'stable-build', title: 'build ไม่เปลี่ยนระหว่างเดินตรวจ', status: STATUS.FAIL,
            checks: [{ id: 'revision-at-end', title: 'revision ตอนจบเท่ากับตอนเริ่ม', status: STATUS.FAIL, detail: `เริ่ม ${ctx.state.revision.slice(0, 12)} จบ ${String(end.revision).slice(0, 12)}` }] });
    }
    const exitCode = exitCodeFor(rows);
    const result = {
        target: target.name, base: target.base, revision: ctx.state.revision || null, revisionAtEnd: end.revision || null, runId, startedAt, finishedAt: new Date().toISOString(),
        testApplication: ctx.state.appNumber || null, certificate: ctx.state.cert?.number || null,
        verdict: exitCode ? 'FAIL' : rows.every((r) => r.status === STATUS.PASS) ? 'PASS' : 'PASS-WITH-NOT-YET', exitCode, rows,
    };
    writeResult(outDir, result);
    for (const r of rows) { console.log(`${r.status.padEnd(8)} ${r.id}`); }
    log(`result ${result.verdict} exit ${exitCode} · ${path.join(outDir, 'result.th.md')}`);
    return exitCode;
}

if (require.main === module) {
    main(process.argv.slice(2)).then((code) => process.exit(code), (err) => { console.error(scrub(err.stack || err.message)); process.exit(1); });
}

module.exports = { main, REGISTRY };

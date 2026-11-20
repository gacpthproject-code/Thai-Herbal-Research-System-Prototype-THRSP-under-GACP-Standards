#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const GATE = process.env.PROBE_GATE_UNDER_TEST || path.join(__dirname, 'probe-gate.js');
const REAL_REGISTRY = path.join(__dirname, '..', 'probes', 'probe-registry.txt');

function runGate({ registry, results }) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-gate-selftest-'));
    const probes = path.join(root, 'scripts', 'probes');
    fs.mkdirSync(probes, { recursive: true });
    Object.keys(results).forEach((name) => fs.writeFileSync(path.join(probes, `${name}.sh`), '#!/usr/bin/env bash\n'));
    fs.writeFileSync(path.join(probes, 'probe-registry.txt'), `${registry.join('\n')}\n`);
    const json = JSON.stringify({ results: Object.entries(results).filter(([, status]) => status).map(([probe, status]) => ({ probe, status })) });
    fs.writeFileSync(path.join(root, 'scripts', 'check-done.sh'),
        `#!/usr/bin/env bash\nprintf '%s' '${json}' > "$PROBE_OUT_DIR/probe-results.json"\n`);
    const out = path.join(root, 'out');
    fs.mkdirSync(out);
    const res = spawnSync('node', [GATE], {
        encoding: 'utf8',
        env: { ...process.env, PROBE_GATE_ROOT: root, PROBE_REGISTRY: '', PROBE_OUT_DIR: out },
    });
    fs.rmSync(root, { recursive: true, force: true });
    return { code: res.status, output: `${res.stdout}${res.stderr}` };
}

const ciRow = (name) => `${name} | ci | - | - | selftest ci row`;
const reportRow = (name) => `${name} | report | - | - | selftest report row (operator 2026-11-04 order 158)`;
const ALLOWED = 'a5-accuracy';

const realRows = fs.readFileSync(REAL_REGISTRY, 'utf8').split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => l.split('|').map((f) => f.trim()));
const realReportRows = realRows.filter(([, run]) => run === 'report').map(([name]) => name);
const realWithFlippedRow = (flip) => realRows.map((f) => (f[0] === flip ? [f[0], 'report', '-', '-', f[4]] : f).join(' | '));
const flipTarget = realRows.find(([name, run]) => run === 'ci' && name !== ALLOWED)[0];
const allRealPass = Object.fromEntries(realRows.map(([name]) => [name, 'PASS']));

const cases = [
    {
        name: 'a report-only row that FAILs does not fail the gate, and its FAIL is printed',
        registry: [ciRow('p-ci'), reportRow(ALLOWED)],
        results: { 'p-ci': 'PASS', [ALLOWED]: 'FAIL' },
        expectCode: 0,
        expectOutput: /a5-accuracy: FAIL — report-only/,
    },
    {
        name: 'a normal ci row that FAILs still fails the gate',
        registry: [ciRow('p-ci'), reportRow(ALLOWED)],
        results: { 'p-ci': 'FAIL', [ALLOWED]: 'PASS' },
        expectCode: 1,
        expectOutput: /p-ci: FAIL and no operator waiver/,
    },
    {
        name: 'a report-only row cannot carry a waiver',
        registry: [ciRow('p-ci'), `${ALLOWED} | report | waived:2099-01-01 | operator | x`],
        results: { 'p-ci': 'PASS', [ALLOWED]: 'FAIL' },
        expectCode: 1,
        expectOutput: /report-only and never gates, so a waiver on it means nothing/,
    },
    {
        name: 'a report-only row needs a written reason',
        registry: [ciRow('p-ci'), `${ALLOWED} | report | - | - |`],
        results: { 'p-ci': 'PASS', [ALLOWED]: 'PASS' },
        expectCode: 1,
        expectOutput: /report-only with no written reason/,
    },
    {
        name: 'a report row with no operator ruling in the allowlist fails the gate and names the row',
        registry: [ciRow('p-ci'), reportRow('p-report')],
        results: { 'p-ci': 'PASS', 'p-report': 'PASS' },
        expectCode: 1,
        expectOutput: /แถว 'p-report' ตั้ง run เป็น report แต่ไม่มีคำตัดสินของ operator/,
    },
    {
        name: 'the real registry has exactly one report row, a5-accuracy',
        check: () => (realReportRows.length === 1 && realReportRows[0] === ALLOWED
            ? { ok: true, detail: 'report rows: a5-accuracy' }
            : { ok: false, detail: `report rows in the real registry: ${realReportRows.join(', ') || '(none)'}` }),
    },
    {
        name: `flipping a real ci row (${flipTarget}) to report fails the gate and names it`,
        registry: realWithFlippedRow(flipTarget),
        results: allRealPass,
        expectCode: 1,
        expectOutput: new RegExp(`แถว '${flipTarget}' ตั้ง run เป็น report แต่ไม่มีคำตัดสินของ operator`),
    },
    {
        name: 'a report row that comes back BLOCKED prints a warning naming it',
        registry: [ciRow('p-ci'), reportRow(ALLOWED)],
        results: { 'p-ci': 'PASS', [ALLOWED]: 'BLOCKED' },
        expectCode: 0,
        expectOutput: /probe-gate warnings:[\s\S]*a5-accuracy: report-only แต่ผลเป็น BLOCKED/,
    },
    {
        name: 'a report row with no result at all prints a warning naming it',
        registry: [ciRow('p-ci'), reportRow(ALLOWED)],
        results: { 'p-ci': 'PASS', [ALLOWED]: null },
        expectCode: 0,
        expectOutput: /probe-gate warnings:[\s\S]*a5-accuracy: report-only แต่ผลเป็น NO RESULT/,
    },
];

let failed = 0;
cases.forEach((c) => {
    if (c.check) {
        const { ok, detail } = c.check();
        if (!ok) { failed += 1; }
        console.log(`${ok ? 'ok  ' : 'FAIL'} ${c.name} (${detail})`);
        return;
    }
    const { code, output } = runGate(c);
    const ok = code === c.expectCode && c.expectOutput.test(output);
    if (!ok) { failed += 1; }
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${c.name} (exit ${code}, wanted ${c.expectCode})`);
    if (!ok) { console.log(output.split('\n').map((l) => `      ${l}`).join('\n')); }
});
console.log(failed === 0 ? `probe-gate selftest: ${cases.length}/${cases.length} PASS` : `probe-gate selftest: ${failed} case(s) FAILED`);
process.exit(failed === 0 ? 0 : 1);

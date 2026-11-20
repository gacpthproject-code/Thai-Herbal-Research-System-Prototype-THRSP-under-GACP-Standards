#!/usr/bin/env node
// gate-compare — "no new failures vs main" (CLAUDE.md, done criteria for tiers A/B/C).
// Replaces ~/work/state/gate/compare.sh + main-baseline + fails-<sha>, lost with the old machine (order 164(1)).
//
//   node scripts/ops/gate-compare.js --base <main-sha> --head <sha>     compare two gated commits
//   node scripts/ops/gate-compare.js --write-fails <sha>                record <sha>'s failing tests
//   node scripts/ops/gate-compare.js --selftest
//
// Inputs: evidence/gate/<sha>.json (committed attestation) and evidence/gate/fails/<sha>.txt (committed list of
// failing tests, one "<check>\t<test>" per line). --write-fails builds that list from the gate's raw logs
// (evidence/gate/logs/<sha>/, gitignored) so the baseline survives a fresh clone.
// UNPROVEN means a check could not be compared, so a person reads its log before calling it not new.
// Exit: 0 no new failure · 1 new failure(s) or UNPROVEN · 2 missing input (never treated as "no new failures").
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const gateDir = (root) => path.join(root, 'evidence/gate');

function fullSha(root, sha) {
  const hit = fs.readdirSync(gateDir(root)).filter((f) => f.endsWith('.json') && f.startsWith(sha));
  if (hit.length !== 1) throw new Error(`attestation for ${sha}: ${hit.length ? 'ambiguous' : 'not found'} in evidence/gate/`);
  return hit[0].slice(0, -5);
}

function readAttestation(root, sha) {
  const att = JSON.parse(fs.readFileSync(path.join(gateDir(root), `${sha}.json`), 'utf8'));
  if (att.sha !== sha) throw new Error(`attestation ${sha}: names sha ${att.sha}`);
  if (att.dry_run) throw new Error(`attestation ${sha}: dry run, nothing was measured`);
  if (att.dirty) throw new Error(`attestation ${sha}: dirty checkout, the sha is not what ran`);
  if (Number.isNaN(Date.parse(att.timestamp_utc))) throw new Error(`attestation ${sha}: no valid timestamp_utc`);
  return att;
}

// Jest text output: "  ● Suite name › test name" headers of failed tests, plus "FAIL path" suite lines
// (a suite that fails to load has no ● test line, only FAIL).
function failedFromJestText(text) {
  const out = new Set();
  for (const line of text.split('\n')) {
    let m = line.match(/^\s{2}● (.+?)\s*$/);
    if (m && !/^Console$/.test(m[1])) out.add(m[1]);
    m = line.match(/^FAIL\s+(\S+)/);
    if (m) out.add(`[suite] ${m[1]}`);
  }
  return out;
}

function failedFromJestJson(obj) {
  const out = new Set();
  for (const s of obj.testResults || []) {
    if (s.status === 'failed' && !(s.assertionResults || []).some((a) => a.status === 'failed')) out.add(`[suite] ${s.name.replace(/^.*\/tree\//, '')}`);
    for (const a of s.assertionResults || []) if (a.status === 'failed') out.add(a.fullName || a.title);
  }
  return out;
}

const NO_NAMES = '[check failed — no test names in log]';

function deriveFails(root, sha) {
  const att = readAttestation(root, sha);
  const logs = path.join(gateDir(root), 'logs', sha);
  if (!fs.existsSync(logs)) throw new Error(`raw logs for ${sha} not on this machine (${path.relative(root, logs)})`);
  const rows = [];
  const probeFile = path.join(logs, 'artifacts', 'probe-results.json');
  const probes = fs.existsSync(probeFile) ? JSON.parse(fs.readFileSync(probeFile, 'utf8')).results : [];
  for (const c of att.checks) {
    if (c.status !== 'fail') continue;
    const names = new Set();
    if (c.id === 'probe-ci') for (const r of probes) if (r.status === 'FAIL') names.add(r.probe);
    const cands = [path.join(logs, 'artifacts', `${c.id}.json`), path.join(logs, 'artifacts', c.id === 'integration-pg' ? 'integration.json' : '-'),
      path.join(logs, 'artifacts', `${c.id}.log`), path.join(logs, `${c.id}.log`)];
    for (const f of c.id === 'probe-ci' && names.size ? [] : cands) {
      if (!fs.existsSync(f)) continue;
      const txt = fs.readFileSync(f, 'utf8');
      const got = f.endsWith('.json') ? (() => { try { return failedFromJestJson(JSON.parse(txt)); } catch { return new Set(); } })() : failedFromJestText(txt);
      got.forEach((n) => names.add(n));
    }
    if (names.size === 0) names.add(NO_NAMES);
    for (const n of [...names].sort()) rows.push(`${c.id}\t${n.replace(/\s+/g, ' ')}`);
  }
  // Every probe's status, so one that stopped measuring is visible even while probe-ci passes.
  for (const r of [...probes].sort((a, b) => a.probe.localeCompare(b.probe))) rows.push(`probe-status\t${r.probe}\t${r.status}`);
  return rows;
}

function readFails(root, sha) {
  const f = path.join(gateDir(root), 'fails', `${sha}.txt`);
  if (!fs.existsSync(f)) return new Set(deriveFails(root, sha));
  const txt = fs.readFileSync(f, 'utf8');
  const written = Date.parse(/--write-fails, ([^)]+)\)/.exec(txt)?.[1]);
  if (Number.isNaN(written)) throw new Error(`fails list for ${sha}: no dated header, rerun --write-fails`);
  if (written < Date.parse(readAttestation(root, sha).timestamp_utc)) throw new Error(`fails list for ${sha} is older than its attestation: rerun --write-fails`);
  return new Set(txt.split('\n').filter((l) => l && !l.startsWith('#')));
}

const rowsOf = (fails, id) => [...fails].filter((r) => r.startsWith(`${id}\t`));
const probeTable = (fails) => new Map(rowsOf(fails, 'probe-status').map((r) => r.split('\t').slice(1)));

// One decision per check, from the union of both attestations. A cell that measured nothing is UNPROVEN,
// never "no new failure": a failed or required check that did not run, a nameless failure, fewer names in a
// check still failing, or a probe that left PASS or FAIL. Advisory checks not run on both sides stay quiet.
function compare(root, baseSha, headSha) {
  const stat = (att) => Object.fromEntries(att.checks.map((c) => [c.id, c]));
  const base = stat(readAttestation(root, baseSha));
  const head = stat(readAttestation(root, headSha));
  const bf = readFails(root, baseSha);
  const hf = readFails(root, headSha);
  const report = { base: baseSha, head: headSha, newFailedChecks: [], newNotRun: [], fixedChecks: [], newFailedTests: [], fixedTests: [], unprovenChecks: [] };
  for (const id of new Set([...Object.keys(base), ...Object.keys(head)])) {
    const was = base[id]?.status;
    const now = head[id]?.status;
    const bRows = rowsOf(bf, id);
    const hRows = rowsOf(hf, id);
    if (now === undefined) { report.newFailedChecks.push(`${id} (${was} → missing from head)`); continue; }
    if (!['pass', 'fail', 'not-run'].includes(now)) throw new Error(`${id} has unknown status ${now} at ${headSha}`);
    if (now === 'pass' && was === 'fail') { report.fixedChecks.push(id); report.fixedTests.push(...bRows); }
    if (now === 'not-run') {
      if (was === 'fail') report.unprovenChecks.push(`${id}: failed on base, did not run on head`);
      else if (was !== 'not-run') report.newNotRun.push(`${id}: ${head[id].reason || ''}`);
      else if (head[id].required) report.unprovenChecks.push(`${id}: required, did not run on either side`);
    }
    if (now !== 'fail') continue;
    if (!hRows.length) throw new Error(`${id} failed at ${headSha} but has no row in its fails list`);
    report.newFailedTests.push(...hRows.filter((r) => !bf.has(r)));
    if (was !== 'fail') { report.newFailedChecks.push(`${id} (${was || 'absent'} → fail)`); continue; }
    if (!bRows.length) throw new Error(`${id} failed at ${baseSha} but has no row in its fails list`);
    const gone = bRows.filter((r) => !hf.has(r)).length;
    if (hRows.some((r) => r.endsWith(`\t${NO_NAMES}`))) report.unprovenChecks.push(`${id}: failed on both sides with no test names`);
    else if (gone) report.unprovenChecks.push(`${id}: ${gone} name(s) gone while the check still fails`);
  }
  const headProbes = probeTable(hf);
  let probesLost = false;
  for (const [probe, was] of probeTable(bf)) {
    const now = headProbes.get(probe);
    if (['PASS', 'FAIL'].includes(was) && !['PASS', 'FAIL'].includes(now)) {
      report.unprovenChecks.push(`probe-ci: probe ${probe} ${was} → ${now || 'missing'}`);
      probesLost = true;
    }
  }
  if (probesLost) {
    report.fixedChecks = report.fixedChecks.filter((id) => id !== 'probe-ci');
    report.fixedTests = report.fixedTests.filter((r) => !r.startsWith('probe-ci\t'));
  }
  report.verdict = report.newFailedChecks.length || report.newFailedTests.length || report.newNotRun.length ? 'NEW-FAILURES'
    : report.unprovenChecks.length ? 'UNPROVEN' : 'NO-NEW-FAILURES';
  return report;
}

function print(r) {
  const sec = (t, a) => console.log(`${t} (${a.length})${a.length ? '\n  ' + a.join('\n  ') : ''}`);
  console.log(`gate-compare base=${r.base.slice(0, 9)} head=${r.head.slice(0, 9)}`);
  sec('new failed checks', r.newFailedChecks);
  sec('required/advisory check pass → not-run', r.newNotRun);
  sec('new failed tests', r.newFailedTests);
  sec('unproven, read the log of each', r.unprovenChecks);
  sec('fixed checks', r.fixedChecks);
  sec('fixed tests', r.fixedTests);
  console.log(`verdict: ${r.verdict}`);
}

function selftest() {
  const os = require('os');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gcmp-'));
  const g = path.join(d, 'evidence/gate');
  fs.mkdirSync(path.join(g, 'fails'), { recursive: true });
  const TS = '2026-11-07T08:00:00Z';
  const att = (sha, checks, extra = {}) => fs.writeFileSync(path.join(g, `${sha}.json`), JSON.stringify({ sha, timestamp_utc: TS, checks, ...extra }));
  const rows = (sha, list, written = '2026-11-07T08:00:30.000Z') => fs.writeFileSync(path.join(g, `fails/${sha}.txt`),
    `# failing tests at ${sha} (gate-compare --write-fails, ${written})\n${list.map((l) => `${l}\n`).join('')}`);
  const ok = (id) => ({ id, status: 'pass' }); const bad = (id) => ({ id, status: 'fail' }); const off = (id) => ({ id, status: 'not-run', reason: 'x' });
  let fails = 0;
  const expect = (name, cond) => { if (!cond) { console.log(`FAIL ${name}`); fails++; } };
  const throws = (fn, rx) => { try { fn(); return false; } catch (e) { return rx.test(e.message); } };
  att('aaa', [bad('suite-green'), ok('probe-ci'), ok('deploy-drift')]); rows('aaa', ['suite-green\tA › old']);
  // 1. same failing test on both = no new failure
  att('bbb', [bad('suite-green'), ok('probe-ci'), ok('deploy-drift')]); rows('bbb', ['suite-green\tA › old']);
  expect('identical failures pass', compare(d, 'aaa', 'bbb').verdict === 'NO-NEW-FAILURES');
  // 2. extra failing test in an already-failing check = new failure (check-level alone would miss it)
  rows('bbb', ['suite-green\tA › old', 'suite-green\tB › new']);
  const r2 = compare(d, 'aaa', 'bbb');
  expect('new test in failing check caught', r2.verdict === 'NEW-FAILURES' && r2.newFailedTests.length === 1);
  // 3. a check that passed on base and fails on head
  att('ccc', [bad('suite-green'), bad('probe-ci'), ok('deploy-drift')]); rows('ccc', ['suite-green\tA › old', 'probe-ci\tx']);
  expect('new failed check caught', compare(d, 'aaa', 'ccc').newFailedChecks.length === 1);
  // 4. pass → not-run is not silently a pass
  att('ddd', [bad('suite-green'), ok('probe-ci'), off('deploy-drift')]); rows('ddd', ['suite-green\tA › old']);
  expect('pass→not-run flagged', compare(d, 'aaa', 'ddd').verdict === 'NEW-FAILURES');
  // 5. jest text parser
  const t = failedFromJestText('FAIL __tests__/x.test.js\n  ● Suite › does a thing\n  ● Console\nPASS y');
  expect('jest text parse', t.has('Suite › does a thing') && t.has('[suite] __tests__/x.test.js') && !t.has('Console'));
  // 6. missing attestation is an error, not a pass
  expect('missing head throws', throws(() => compare(d, 'aaa', 'zzz'), /./));
  // 7. a check failing on both sides with no test names proves nothing
  att('e1', [bad('secret-scan-deep')]); att('e2', [bad('secret-scan-deep')]);
  rows('e1', [`secret-scan-deep\t${NO_NAMES}`]); rows('e2', [`secret-scan-deep\t${NO_NAMES}`]);
  const r7 = compare(d, 'e1', 'e2');
  expect('nameless failure on both sides is unproven', r7.verdict === 'UNPROVEN' && r7.unprovenChecks[0].startsWith('secret-scan-deep'));
  // 8. a fails list older than its attestation belongs to an earlier gate run
  att('f1', []); rows('f1', ['suite-green\tA › old'], '2026-11-07T04:00:00.000Z');
  expect('stale fails list refused', throws(() => compare(d, 'f1', 'aaa'), /older than/));
  // 9. base fail, head not-run: nothing was measured, and its rows are not "fixed"
  att('g1', [off('suite-green'), ok('probe-ci'), ok('deploy-drift')]); rows('g1', []);
  const r9 = compare(d, 'aaa', 'g1');
  expect('fail→not-run is unproven, not fixed', r9.verdict === 'UNPROVEN' && r9.fixedTests.length === 0 && r9.fixedChecks.length === 0);
  // 10. a check missing from head, and a new check that did not run
  att('h1', [bad('suite-green'), ok('probe-ci')]); rows('h1', ['suite-green\tA › old']);
  expect('check missing from head caught', compare(d, 'aaa', 'h1').verdict === 'NEW-FAILURES');
  att('h2', [bad('suite-green'), ok('probe-ci'), ok('deploy-drift'), off('brand-new')]); rows('h2', ['suite-green\tA › old']);
  expect('new check that did not run caught', compare(d, 'aaa', 'h2').verdict === 'NEW-FAILURES');
  // 11. a failing check with no row, and fails lists that cannot be dated
  att('i1', [bad('suite-green'), ok('probe-ci'), ok('deploy-drift')]); rows('i1', []);
  expect('failing check with no row refused', throws(() => compare(d, 'aaa', 'i1'), /no row/));
  fs.writeFileSync(path.join(g, 'fails/i1.txt'), 'suite-green\tA › old\n');
  expect('fails list without a header refused', throws(() => compare(d, 'aaa', 'i1'), /header/));
  rows('i1', ['suite-green\tA › old'], 'not-a-date');
  expect('fails list with a bad date refused', throws(() => compare(d, 'aaa', 'i1'), /header/));
  fs.writeFileSync(path.join(g, 'i2.json'), JSON.stringify({ sha: 'i2', checks: [] })); rows('i2', []);
  expect('attestation with no time refused', throws(() => compare(d, 'aaa', 'i2'), /timestamp/));
  // 12. fewer names in a check that still fails: the run may have died, so it proves nothing
  att('j1', [bad('integration-pg')]); rows('j1', ['integration-pg\tA', 'integration-pg\tB']);
  att('j2', [bad('integration-pg')]); rows('j2', ['integration-pg\tA']);
  const r12 = compare(d, 'j1', 'j2');
  expect('fewer names in a failing check is unproven', r12.verdict === 'UNPROVEN' && r12.fixedTests.length === 0);
  // 13. an attestation that is not a real gate run
  att('k1', [bad('suite-green'), ok('probe-ci'), ok('deploy-drift')], { dry_run: true }); rows('k1', ['suite-green\tA › old']);
  att('k2', [bad('suite-green'), ok('probe-ci'), ok('deploy-drift')], { dirty: true }); rows('k2', ['suite-green\tA › old']);
  fs.writeFileSync(path.join(g, 'k3.json'), JSON.stringify({ sha: 'other', timestamp_utc: TS, checks: [] })); rows('k3', []);
  expect('dry-run refused', throws(() => compare(d, 'aaa', 'k1'), /dry/));
  expect('dirty refused', throws(() => compare(d, 'aaa', 'k2'), /dirty/));
  expect('sha mismatch refused', throws(() => compare(d, 'aaa', 'k3'), /sha/));
  // 14. probe-ci is compared by probe name
  const pdir = path.join(g, 'logs/m1/artifacts'); fs.mkdirSync(pdir, { recursive: true });
  fs.writeFileSync(path.join(pdir, 'probe-results.json'), JSON.stringify({ results: [{ probe: 'one', status: 'FAIL' }, { probe: 'two', status: 'PASS' }, { probe: 'three', status: 'BLOCKED' }] }));
  att('m1', [bad('probe-ci')]);
  expect('probe-ci rows are probe names, every probe keeps its status', deriveFails(d, 'm1').join() === 'probe-ci\tone,probe-status\tone\tFAIL,probe-status\tthree\tBLOCKED,probe-status\ttwo\tPASS');
  // 15. a probe that stopped measuring is seen, whether probe-ci passes or fails
  att('n1', [ok('probe-ci')]); rows('n1', ['probe-status\tone\tPASS', 'probe-status\ttwo\tPASS']);
  att('n2', [ok('probe-ci')]); rows('n2', ['probe-status\tone\tPASS', 'probe-status\ttwo\tBLOCKED']);
  att('n3', [ok('probe-ci')]); rows('n3', ['probe-status\tone\tPASS']);
  att('n4', [ok('probe-ci')]); rows('n4', []);
  expect('PASS→BLOCKED probe is unproven', compare(d, 'n1', 'n2').verdict === 'UNPROVEN');
  expect('probe gone from head is unproven', compare(d, 'n1', 'n3').verdict === 'UNPROVEN');
  expect('whole probe table gone is unproven', compare(d, 'n1', 'n4').verdict === 'UNPROVEN');
  expect('same probe table is not unproven', compare(d, 'n1', 'n1').verdict === 'NO-NEW-FAILURES');
  att('n5', [bad('probe-ci')]); rows('n5', ['probe-ci\tone', 'probe-status\tone\tFAIL']);
  att('n6', [ok('probe-ci')]); rows('n6', ['probe-status\tone\tBLOCKED']);
  const r15 = compare(d, 'n5', 'n6');
  expect('FAIL→BLOCKED last probe is not fixed', r15.verdict === 'UNPROVEN' && r15.fixedChecks.length === 0 && r15.fixedTests.length === 0);
  att('n7', [ok('probe-ci')]); rows('n7', ['probe-status\tone\tPASS']);
  expect('FAIL→PASS probe is fixed', compare(d, 'n5', 'n7').fixedChecks[0] === 'probe-ci');
  // 16. a status this tool does not know is refused, and a required check that never ran is not a pass
  att('o1', [{ id: 'suite-green', status: 'error' }]); rows('o1', []);
  expect('unknown status refused', throws(() => compare(d, 'aaa', 'o1'), /status/));
  att('o2', [{ id: 'x', status: 'not-run', required: true, reason: 'r' }]); rows('o2', []);
  att('o3', [{ id: 'x', status: 'not-run', required: true, reason: 'r' }]); rows('o3', []);
  expect('required not-run on both sides is unproven', compare(d, 'o2', 'o3').verdict === 'UNPROVEN');
  att('o4', [{ id: 'x', status: 'not-run', required: false, reason: 'r' }]); rows('o4', []);
  att('o5', [{ id: 'x', status: 'not-run', required: false, reason: 'r' }]); rows('o5', []);
  expect('advisory not-run on both sides stays quiet', compare(d, 'o4', 'o5').verdict === 'NO-NEW-FAILURES');
  // 17. a suite that failed to load keeps one name across runs
  expect('suite name has no temp path', failedFromJestJson({ testResults: [{ status: 'failed', name: '/tmp/gacp-gate-x/tree/apps/backend/a.test.js', assertionResults: [] }] }).has('[suite] apps/backend/a.test.js'));
  fs.rmSync(d, { recursive: true, force: true });
  console.log(fails ? `gate-compare selftest: FAIL (${fails})` : 'gate-compare selftest: PASS (17 groups)');
  return fails ? 1 : 0;
}

function main(argv) {
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  if (argv.includes('--selftest')) return selftest();
  try {
    if (arg('--write-fails')) {
      const sha = fullSha(ROOT, arg('--write-fails'));
      const rows = deriveFails(ROOT, sha);
      const f = path.join(gateDir(ROOT), 'fails', `${sha}.txt`);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, `# failing tests at ${sha} (gate-compare --write-fails, ${new Date().toISOString()})\n${rows.join('\n')}${rows.length ? '\n' : ''}`);
      console.log(`wrote ${path.relative(ROOT, f)} (${rows.length} rows)`);
      return 0;
    }
    const base = arg('--base'); const head = arg('--head');
    if (!base || !head) { console.error('usage: --base <sha> --head <sha> | --write-fails <sha> | --selftest'); return 2; }
    const r = compare(ROOT, fullSha(ROOT, base), fullSha(ROOT, head));
    if (argv.includes('--json')) console.log(JSON.stringify(r, null, 2)); else print(r);
    return r.verdict === 'NO-NEW-FAILURES' ? 0 : 1;
  } catch (e) {
    console.error(`gate-compare: ${e.message}`);
    return 2;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { compare, failedFromJestText, failedFromJestJson };

#!/usr/bin/env node
// evidence-pack — HARNESS.md §5 summaries for a work item, from two gated commits.
// Replaces ~/work/state/gate/evidence-pack.py, lost with the old machine (order 164(1)).
//
//   node scripts/ops/evidence-pack.js <head_sha> <main_gate_sha> <evidence_dir> [notes]
//
// Writes into <evidence_dir>:
//   test-output.txt          per-check status of both commits + every failing test name + where the raw logs are
//   probe-results.json       the head's probe-gate results (copied from its gate artifacts) or a NOT-AVAILABLE marker
//   ratchet-before-after.txt ratchet counters of main vs head, from each side's probe results when present
//   gate-compare.json        the gate-compare verdict (new failures vs main)
// Raw logs are never copied (HARNESS.md §5: they hold key-like strings). Run gitleaks on the dir before committing.
'use strict';
const fs = require('fs');
const path = require('path');
const { compare } = require('./gate-compare');

const ROOT = path.resolve(__dirname, '../..');
const G = path.join(ROOT, 'evidence/gate');

function full(sha) {
  const hit = fs.readdirSync(G).filter((f) => f.endsWith('.json') && f.startsWith(sha));
  if (hit.length !== 1) throw new Error(`attestation for ${sha}: ${hit.length ? 'ambiguous' : 'not found'}`);
  return hit[0].slice(0, -5);
}
const att = (sha) => JSON.parse(fs.readFileSync(path.join(G, `${sha}.json`), 'utf8'));
const artifacts = (sha) => path.join(G, 'logs', sha, 'artifacts');

function probeResults(sha) {
  const f = path.join(artifacts(sha), 'probe-results.json');
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}

// probe-results.json shape is owned by scripts/ci/probe-gate.js; search it for anything ratchet-like
// instead of assuming a schema, so a format change shows up as "no counters found", never as zero.
function ratchetCounters(pr) {
  const out = {};
  const walk = (o, key) => {
    if (o && typeof o === 'object') { for (const [k, v] of Object.entries(o)) walk(v, key ? `${key}.${k}` : k); return; }
    if (/ratchet/i.test(key || '') && (typeof o === 'number' || typeof o === 'string')) out[key] = o;
  };
  walk(pr, '');
  return out;
}

function main(argv) {
  const [h, b, dir, notes] = argv;
  if (!h || !b || !dir) { console.error('usage: evidence-pack.js <head_sha> <main_gate_sha> <evidence_dir> [notes]'); return 2; }
  const head = full(h); const base = full(b);
  const ha = att(head); const ba = att(base);
  fs.mkdirSync(dir, { recursive: true });
  const cmp = compare(ROOT, base, head);
  const bStat = Object.fromEntries(ba.checks.map((c) => [c.id, c.status]));
  const lines = [
    `# test-output — head ${head} vs main ${base}`,
    `# generated ${new Date().toISOString()} by scripts/ops/evidence-pack.js${notes ? ` · ${notes}` : ''}`,
    `head verdict: ${ha.verdict} (${ha.timestamp_utc}, host ${ha.hostname}) · main verdict: ${ba.verdict} (${ba.timestamp_utc})`,
    `allow_blocked: ${ha.allow_blocked || 'none'}`,
    '',
    'check                    main        head        required',
    ...ha.checks.map((c) => `${c.id.padEnd(24)} ${String(bStat[c.id] || '-').padEnd(11)} ${c.status.padEnd(11)} ${c.required ? 'yes' : 'no'}${c.reason ? `  (${c.reason})` : ''}`),
    '',
    `gate-compare: ${cmp.verdict}`,
    ...['newFailedChecks', 'newNotRun', 'newFailedTests', 'unprovenChecks', 'fixedChecks', 'fixedTests'].map((k) => `${k} (${cmp[k].length})${cmp[k].length ? '\n  ' + cmp[k].join('\n  ') : ''}`),
    '',
    `raw logs (not committed): evidence/gate/logs/${head}/ on the machine that ran the gate (${ha.hostname})`,
  ];
  fs.writeFileSync(path.join(dir, 'test-output.txt'), lines.join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'gate-compare.json'), JSON.stringify(cmp, null, 2) + '\n');

  const hp = probeResults(head);
  fs.writeFileSync(path.join(dir, 'probe-results.json'),
    JSON.stringify(hp || { status: 'NOT-AVAILABLE', reason: `no ${path.relative(ROOT, artifacts(head))}/probe-results.json on this machine` }, null, 2) + '\n');

  const bp = probeResults(base);
  const hr = hp ? ratchetCounters(hp) : null; const br = bp ? ratchetCounters(bp) : null;
  const keys = [...new Set([...Object.keys(hr || {}), ...Object.keys(br || {})])].sort();
  const rlines = [`# ratchet — main ${base.slice(0, 9)} → head ${head.slice(0, 9)}`];
  if (!hr || !br) rlines.push(`NOT-AVAILABLE: probe results missing for ${!hr ? 'head' : ''}${!hr && !br ? ' and ' : ''}${!br ? 'main' : ''} on this machine`);
  else if (!keys.length) rlines.push('NOT-AVAILABLE: no ratchet counters found in probe-results.json (format changed?)');
  else for (const k of keys) rlines.push(`${k}: ${br[k] ?? '-'} → ${hr[k] ?? '-'}`);
  fs.writeFileSync(path.join(dir, 'ratchet-before-after.txt'), rlines.join('\n') + '\n');

  console.log(`evidence-pack: wrote 4 files to ${dir} · gate-compare ${cmp.verdict}`);
  return cmp.verdict === 'NO-NEW-FAILURES' ? 0 : 1;
}

if (require.main === module) {
  try { process.exit(main(process.argv.slice(2))); } catch (e) { console.error(`evidence-pack: ${e.message}`); process.exit(2); }
}

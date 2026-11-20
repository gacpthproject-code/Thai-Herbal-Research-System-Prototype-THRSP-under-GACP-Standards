#!/usr/bin/env node
// selftest ของ walk-compare.js · รันตัวจริงเป็นโปรเซสลูกกับไฟล์ result.json ที่สร้างขึ้น แล้วตรวจ exit และข้อความ
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, 'walk-compare.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'walkcmp-'));
let n = 0;
const write = (obj) => { const f = path.join(dir, `r${n += 1}.json`); fs.writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj)); return f; };
const result = (rows, extra = {}) => ({ target: 'demo', base: 'https://demo.gacpth.com', revision: 'a'.repeat(40), rows: Object.entries(rows).map(([id, status]) => ({ id, status, checks: [] })), ...extra });
const run = (a, b) => spawnSync(process.execPath, [SCRIPT, a, b], { encoding: 'utf8' });

let fails = 0;
const expect = (name, cond, r) => { if (!cond) { fails += 1; console.log(`FAIL ${name}\n  exit=${r && r.status}\n  ${r && (r.stdout + r.stderr).split('\n').join('\n  ')}`); } };

const base = write(result({ identity: 'FAIL', accounts: 'PASS', verify: 'PASS', pdpa: 'NOT-YET', jobs: 'FAIL' }));

let r = run(base, write(result({ identity: 'PASS', accounts: 'PASS', verify: 'PASS', pdpa: 'NOT-YET', jobs: 'FAIL' })));
expect('same or better on every row passes', r.status === 0 && /ไม่มี FAIL ใหม่/.test(r.stdout), r);

r = run(base, write(result({ identity: 'PASS', accounts: 'FAIL', verify: 'PASS', pdpa: 'NOT-YET', jobs: 'FAIL' })));
expect('a row that passed in the baseline and fails after is a new FAIL', r.status === 1 && /accounts/.test(r.stdout) && /FAIL ใหม่/.test(r.stdout), r);

r = run(base, write(result({ identity: 'PASS', accounts: 'PASS', verify: 'PASS', pdpa: 'FAIL', jobs: 'FAIL' })));
expect('NOT-YET in the baseline is no baseline, so failing after is not a new FAIL but is called out', r.status === 0 && /pdpa .*FAIL โดยไม่มีฐาน/.test(r.stdout) && /ผล: ไม่มี FAIL ใหม่ · มี FAIL โดยไม่มีฐาน 1 แถว \(pdpa\)/.test(r.stdout), r);

r = run(base, write(result({ identity: 'PASS', accounts: 'PASS', pdpa: 'NOT-YET', jobs: 'FAIL' })));
expect('a baseline row missing from the post walk is a new FAIL, not a pass', r.status === 1 && /verify/.test(r.stdout), r);

r = run(base, write(result({ identity: 'PASS', accounts: 'PASS', verify: 'PASS', pdpa: 'NOT-YET', jobs: 'FAIL', 'stable-build': 'FAIL' })));
expect('a FAIL row that only the post walk has has no baseline, so it is shown but not a new FAIL', r.status === 0 && /stable-build/.test(r.stdout), r);

r = run(base, write(result({ identity: 'PASS', accounts: 'NOT-YET', verify: 'PASS', pdpa: 'NOT-YET', jobs: 'FAIL' })));
expect('PASS that becomes NOT-YET is not a new FAIL but is reported as lost coverage', r.status === 0 && /ครอบคลุมหาย 1 แถว \(accounts\)/.test(r.stdout), r);

r = run(base, write(result({ identity: 'PASS', accounts: 'PASS', verify: 'PASS', pdpa: 'NOT-YET', jobs: 'FAIL' }, { target: 'staging', base: 'https://staging.gacpth.com' })));
expect('walks of two different machines are refused', r.status === 2, r);

r = run(base, write(result({ accounts: 'pass' })));
expect('an unknown row status is refused', r.status === 2, r);

r = run(base, write('{not json'));
expect('an unreadable result file is refused', r.status === 2, r);

r = run(base, path.join(dir, 'missing.json'));
expect('a missing result file is refused', r.status === 2, r);

r = run(base, write({ target: 'demo', base: 'https://demo.gacpth.com', rows: [] }));
expect('a post walk with no rows is refused, it measured nothing', r.status === 2, r);

r = spawnSync(process.execPath, [SCRIPT, base], { encoding: 'utf8' });
expect('one argument is a usage error', r.status === 2, r);

fs.rmSync(dir, { recursive: true, force: true });
console.log(fails ? `walk-compare selftest: FAIL (${fails})` : 'walk-compare selftest: PASS (12 cases)');
process.exit(fails ? 1 : 0);

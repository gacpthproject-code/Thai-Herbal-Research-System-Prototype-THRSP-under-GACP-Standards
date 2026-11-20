// LIMITATION (review r1 MINOR 1): 1 HOP ONLY — a suite is selected when its OWN
// require/jest.mock names a changed module, so a suite that reaches one only through
// another source file is never enumerated; the 2-hop set is 197 suites larger and holds
// two further pre-existing reds this list cannot show — __tests__/unit/application-status-
// writer-cert-hook-evidence-gate.test.js (needs a live Postgres) and
// __tests__/unit/auth-idp-providers-endpoint.test.js (reads THAID config out of apps/backend/.env).
const fs = require('fs'), path = require('path');
const BS = String.fromCharCode(92);
const root = process.cwd();
const changed = fs.readFileSync('C:/Users/charo/AppData/Local/Temp/claude/c--Users-charo-Documents-GitHub-GACP-Certification-Application/b4785f3a-0000-4aa9-93aa-d4f9bb2aeda9/scratchpad/changed-backend-src.txt','utf8').split(/\r?\n/).filter(l => l.trim().endsWith('.js'));
const mods = new Set();
for (const c of changed) {
  const rel = c.replace(/^apps.backend./,'');
  mods.add(rel.replace(/\.js$/,''));
  mods.add(path.basename(rel).replace(/\.js$/,''));
}
const unitdir = path.join(root,'__tests__','unit');
const files = fs.readdirSync(unitdir).filter(f => f.endsWith('.test.js')).sort();
const hits = [];
for (const f of files) {
  const txt = fs.readFileSync(path.join(unitdir,f),'utf8');
  const names = new Set();
  const re = /(?:require|jest\.mock)\(\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(txt))) {
    const s = m[1];
    if (!s.startsWith('.')) continue;
    const resolved = path.normalize(path.join('__tests__/unit', s)).split(BS).join('/');
    names.add(resolved); names.add(path.basename(resolved));
  }
  for (const n of names) { if (mods.has(n)) { hits.push(f); break; } }
}
fs.writeFileSync('C:/Users/charo/AppData/Local/Temp/claude/c--Users-charo-Documents-GitHub-GACP-Certification-Application/b4785f3a-0000-4aa9-93aa-d4f9bb2aeda9/scratchpad/suites-touching-changed.txt', hits.join('\n'));
console.log(hits.length);

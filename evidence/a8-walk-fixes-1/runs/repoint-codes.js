'use strict';
// node repoint-codes.js <backend dir> CODE[=fallbackFile] ... — moves each code's `source: 'file:line'` to the nearest
// line in that file (or the fallback file) that names the code. Prints old -> new; changes nothing it cannot resolve.
const fs = require('fs');
const path = require('path');
const [dir, ...args] = process.argv.slice(2);
const catalogPath = path.join(dir, 'shared/error-codes.js');
let catalog = fs.readFileSync(catalogPath, 'utf8');
for (const arg of args) {
  const [code, fallback] = arg.split('=');
  const block = new RegExp(`(  ${code}: \\{[\\s\\S]*?source: ')([^':]+):(\\d+)(')`);
  const m = catalog.match(block);
  if (!m) { console.log(`${code}: no catalog row`); continue; }
  const file = fallback || m[2];
  const lines = fs.readFileSync(path.join(dir, file), 'utf8').split('\n');
  const want = Number(m[3]);
  const hits = lines.map((l, i) => (l.includes(`'${code}'`) || l.includes(`"${code}"`) || l.includes(` ${code},`) || l.includes(`(${code}`) ? i + 1 : 0)).filter(Boolean);
  if (!hits.length) { console.log(`${code}: ${file} never names it`); continue; }
  const best = hits.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a));
  catalog = catalog.replace(block, `$1${file}:${best}$4`);
  console.log(`${code}: ${m[2]}:${m[3]} -> ${file}:${best}`);
}
fs.writeFileSync(catalogPath, catalog);

'use strict';
// Same repo schemas, same inputs, zod resolved to the directory in argv[3]. Prints sorted lines.
const path = require('path');
const Module = require('module');
const root = process.argv[2];
const zodDir = process.argv[3];
const orig = Module._resolveFilename;
Module._resolveFilename = function (r, ...a) {
  if (r === 'zod' || r.startsWith('zod/')) return orig.call(this, path.join(zodDir, r.slice(3) || '.'), ...a);
  return orig.call(this, r, ...a);
};
const mods = ['shared/zod-schemas.js', 'shared/schemas/auth-schemas.js', 'validation/application-schemas.js', 'validation/canonical-application-validator.js', 'shared/holder-registry.js'];
const seen = new Set();
const schemas = [];
function walk(v, name, d) {
  if (!v || (typeof v !== 'object' && typeof v !== 'function') || seen.has(v) || d > 3) return;
  seen.add(v);
  if (typeof v.safeParse === 'function') { schemas.push([name, v]); return; }
  if (typeof v === 'object') for (const k of Object.keys(v)) walk(v[k], `${name}.${k}`, d + 1);
}
for (const m of mods) {
  try { walk(require(path.join(root, 'apps/backend', m)), m, 0); } catch (e) { console.log('LOADFAIL', m, e.message.slice(0, 100)); }
}
function sample(s, depth = 0) {
  const def = s && s._zod && s._zod.def;
  if (!def || depth > 6) return undefined;
  switch (def.type) {
    case 'string': return 'ทดสอบ';
    case 'number': return 1;
    case 'boolean': return true;
    case 'date': return new Date(0);
    case 'enum': return Object.values(def.entries)[0];
    case 'literal': return def.values[0];
    case 'array': return [sample(def.element, depth + 1)];
    case 'object': return Object.fromEntries(Object.entries(def.shape).map(([k, v]) => [k, sample(v, depth + 1)]));
    case 'optional': case 'nullable': case 'default': case 'prefault': case 'nonoptional': case 'readonly': case 'catch':
      return sample(def.innerType, depth + 1);
    case 'pipe': return sample(def.in, depth + 1);
    case 'union': return sample(def.options[0], depth + 1);
    default: return undefined;
  }
}
const generic = [undefined, null, {}, [], '', 'x', 0, -1, 1.5, true, { email: 'a' }, { email: 'a@b.co', password: 'x' }, new Array(3).fill(null), 'a'.repeat(5000)];
function mutations(v) {
  const out = [v];
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const k of Object.keys(v)) for (const bad of [null, 123, '', [], undefined]) out.push({ ...v, [k]: bad });
  }
  return out;
}
const lines = [];
for (const [name, s] of schemas) {
  let v;
  try { v = sample(s); } catch { v = undefined; }
  [...generic, ...mutations(v)].forEach((input, i) => {
    let r;
    try { const p = s.safeParse(input); r = p.success ? { ok: p.data } : { issues: p.error.issues }; } catch (e) { r = { threw: e.message }; }
    lines.push(`${name}#${i} ${JSON.stringify(r)}`);
  });
}
console.log(`schemas=${schemas.length} cases=${lines.length}`);
console.log(lines.sort().join('\n'));

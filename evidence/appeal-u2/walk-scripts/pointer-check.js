'use strict';
// usage: node pointer-check.js <backendDir>. Prints catalog entries whose `source` line does not name the code.
const fs = require('fs');
const path = require('path');
const backend = process.argv[2];
const { ERROR_CODES } = require(path.join(backend, 'shared/error-codes.js'));
const cache = new Map();
const lines = (rel) => {
    if (!cache.has(rel)) {
        const abs = path.join(backend, rel);
        cache.set(rel, fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8').split('\n') : null);
    }
    return cache.get(rel);
};
let bad = 0;
for (const [code, row] of Object.entries(ERROR_CODES)) {
    const m = /^(.+?):(\d+)$/.exec(String(row.source || ''));
    if (!m) { continue; }
    const file = lines(m[1]);
    if (!file) { console.log(`MISSING FILE ${code} ${row.source}`); bad += 1; continue; }
    const at = file[Number(m[2]) - 1] || '';
    if (!at.includes(code)) { console.log(`DRIFT ${code} ${row.source} :: ${at.trim().slice(0, 100)}`); bad += 1; }
}
console.log(`pointer-check: ${bad} entries off their line`);

'use strict';

/**
 * The field app's evidence writers hold every caller to the visit unless the caller says otherwise
 * (security re-review 2026-10-09 L3), and the only code that may say otherwise is the demo seed,
 * which records evidence for applications it seats past their visit.
 */

const fs = require('fs');
const path = require('path');

const BACKEND = path.resolve(__dirname, '../..');
const SKIPPED = new Set(['node_modules', '__tests__', 'test-support', 'coverage', 'test-uploads', 'uploads', 'logs']);
const OPT_OUT = /onlyDuringVisit\s*:\s*false/;

function sourceFiles(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (entry.name.startsWith('.') || SKIPPED.has(entry.name)) { return []; }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { return sourceFiles(full); }
        return entry.name.endsWith('.js') ? [full] : [];
    });
}

test('only the demo seed opts out of the visit gate', () => {
    const optingOut = sourceFiles(BACKEND)
        .filter((file) => OPT_OUT.test(fs.readFileSync(file, 'utf8')))
        .map((file) => path.relative(BACKEND, file).split(path.sep).join('/'));
    expect(optingOut).toEqual(['prisma/seed-gacp.js']);
});

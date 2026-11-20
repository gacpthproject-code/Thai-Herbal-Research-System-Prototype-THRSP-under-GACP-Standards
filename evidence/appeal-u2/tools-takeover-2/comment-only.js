'use strict';
// usage: node comment-only.js <repo> <file...> — for each file, print the HEAD and the working copy through the TypeScript
// printer with comments removed; equal output means the change touched comments (and whitespace) only.
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ts = require(path.join(process.argv[2], 'apps/web-app/node_modules/typescript'));
const repo = process.argv[2];
const printer = ts.createPrinter({ removeComments: true });
const kindOf = (f) => (f.endsWith('.tsx') ? ts.ScriptKind.TSX : f.endsWith('.ts') ? ts.ScriptKind.TS : f.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.JS);
const strip = (file, text) => printer.printFile(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kindOf(file)));
let bad = 0;
for (const file of process.argv.slice(3)) {
    const before = execFileSync('git', ['-C', repo, 'show', `HEAD:${file}`], { encoding: 'utf8' });
    const after = fs.readFileSync(path.join(repo, file), 'utf8');
    const same = strip(file, before) === strip(file, after);
    if (!same) { bad += 1; }
    console.log(`${same ? 'comment-only' : 'CODE CHANGED'} ${file}`);
}
console.log(`comment-only: ${process.argv.length - 3 - bad} of ${process.argv.length - 3} files`);
process.exit(bad ? 1 : 0);

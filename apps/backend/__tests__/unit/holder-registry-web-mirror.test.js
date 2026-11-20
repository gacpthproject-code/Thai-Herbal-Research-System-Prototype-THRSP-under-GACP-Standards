'use strict';

/**
 * The web draws the holder record from its own registry (apps/web-app/src/lib/holder/
 * holder-registry.ts); the server judges it with shared/holder-registry.js. If the web
 * stopped drawing a field the server requires, step 2 would say "missing" about a field no
 * screen can fill. This pins every server-required field to a web field marked required.
 *
 * The web also repeats the registration-number rule (registrationNoProblem) so the create
 * page can refuse before the POST. The web cannot import the backend file, so the second
 * half transpiles the web registry and runs both rules over the same inputs: the server's
 * refusal message must equal the web's, case by case, and the labels must match.
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');
const { isThaiIdChecksumValid } = require('@gacp/validation/thai-id-checksum');
const server = require('../../shared/holder-registry');

const WEB_PATH = path.join(__dirname, '../../../web-app/src/lib/holder/holder-registry.ts');
const WEB = fs.readFileSync(WEB_PATH, 'utf8');
const webRequiredPaths = new Set([...WEB.matchAll(/path: '([^']+)', labelTh: [^\n]*required: true/g)].map((m) => m[1]));
const signatoryTemplate = /path: 'signatory\.(\w+)'[^\n]*required: true/g;
for (const m of WEB.matchAll(signatoryTemplate)) { webRequiredPaths.add(`signatory.${m[1]}`); }

function loadWebRegistry() {
    const ts = require(path.join(__dirname, '../../../web-app/node_modules/typescript'));
    const { outputText } = ts.transpileModule(WEB, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    });
    const m = new Module(WEB_PATH);
    m.paths = Module._nodeModulePaths(path.join(__dirname, '../..'));
    m._compile(outputText, WEB_PATH);
    return m.exports;
}

describe('the web holder form draws every field the server requires', () => {
    test.each(server.HOLDER_TYPE_KEYS)('%s', (type) => {
        const notDrawn = server.requiredFieldsFor(type)
            .map((f) => f.path)
            // Not form fields: the number is fixed at creation, and a person's legal name is
            // their first and last name.
            .filter((p) => p !== 'registrationNo' && !(type === 'INDIVIDUAL' && p === 'legalName'))
            .filter((p) => !webRequiredPaths.has(p));
        expect(notDrawn).toEqual([]);
    });

    test('the web knows every holder type the server does', () => {
        for (const type of server.HOLDER_TYPE_KEYS) { expect(WEB).toContain(`${type}:`); }
    });
});

describe('the web registration rule equals the server rule, case by case', () => {
    const web = loadWebRegistry();

    const withChecksum = (d12) => {
        for (let c = 0; c < 10; c += 1) { if (isThaiIdChecksumValid(d12 + c)) { return d12 + c; } }
        throw new Error(`no check digit for ${d12}`);
    };
    const inputs = new Set([
        '', ' ', '-', '/', '-/-', '-'.repeat(50),
        '5-50-01-11/1-0123', ' 5-50-01-11/1-0123 ', 'สวช 0123', '55001110123', '1234567890', 'abc',
        '7', '1'.repeat(40), '1'.repeat(41), '5'.repeat(5000), `${'1-'.repeat(19)}10`,
        '0105555123451',
        withChecksum('110170020345'), ` ${withChecksum('110170020345')} `,
    ]);
    for (let d = 0; d <= 9; d += 1) {
        const v = withChecksum(`010${d}55512345`);
        inputs.add(v);
        inputs.add(` ${v} `);
    }
    const shown = (v) => (v.length > 45 ? `${v.slice(0, 20)}… (${v.length} chars)` : JSON.stringify(v));
    const cases = [];
    for (const type of server.HOLDER_TYPE_KEYS) {
        for (const v of inputs) { cases.push([type, shown(v), v]); }
    }

    test.each(cases)('%s %s', (type, _shown, v) => {
        const s = server.checkRegistrationNo(type, v);
        expect(web.registrationNoProblem(type, v)).toBe(s.ok ? null : s.message);
    });

    test.each(server.HOLDER_TYPE_KEYS)('%s labels and note', (type) => {
        const s = server.HOLDER_TYPES[type];
        const w = web.HOLDER_TYPES[type];
        expect({
            labelTh: w.labelTh,
            signatoryLabelTh: w.signatoryLabelTh,
            registrationLabelTh: w.registrationLabelTh,
            noteTh: w.noteTh,
        }).toEqual({
            labelTh: s.labelTh,
            signatoryLabelTh: s.signatoryLabelTh ?? null,
            registrationLabelTh: s.registration.labelTh,
            noteTh: s.noteTh,
        });
    });
});

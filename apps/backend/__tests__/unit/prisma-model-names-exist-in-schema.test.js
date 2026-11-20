'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '../../../..');
const BACKEND = 'apps/backend';
const SCHEMA_DIR = path.join(REPO_ROOT, BACKEND, 'prisma/schema');
const SKIPPED_DIRS = ['__tests__', 'test-support', 'eslint-rules', 'chaos-tests'];
const CLIENT_CALL = /\b(?:prisma|tx|client)\??\.(\w+)\??\.(?:findMany|findFirst|findUnique|findFirstOrThrow|findUniqueOrThrow|create|createMany|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy)(?:\?\.)?\s*\(/g;

const GUARDED = ['apps/backend/services/chart-of-accounts-service.js:account'];

function accessorsOfSchema() {
    const names = new Set();
    for (const file of fs.readdirSync(SCHEMA_DIR)) {
        const source = fs.readFileSync(path.join(SCHEMA_DIR, file), 'utf8');
        for (const match of source.matchAll(/^model\s+(\w+)\s*\{/gm)) {
            names.add(match[1][0].toLowerCase() + match[1].slice(1));
        }
    }
    return names;
}

function trackedBackendSources() {
    return execFileSync('git', ['ls-files', '-z', BACKEND], { cwd: REPO_ROOT }).toString().split('\0')
        .filter((file) => file.endsWith('.js') && !SKIPPED_DIRS.some((dir) => file.split('/').includes(dir)));
}

function withoutComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ''))
        .replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

function unknownModelCalls(files, models) {
    const found = [];
    for (const file of files) {
        const lines = withoutComments(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8')).split('\n');
        lines.forEach((line, index) => {
            for (const match of line.matchAll(CLIENT_CALL)) {
                if (!models.has(match[1])) { found.push({ file, line: index + 1, model: match[1] }); }
            }
        });
    }
    return found;
}

describe('prisma model names exist in the schema folder', () => {
    const models = accessorsOfSchema();
    const unknown = unknownModelCalls(trackedBackendSources(), models);
    const key = (call) => `${call.file}:${call.model}`;

    test('the schema folder yields the model accessors', () => {
        expect(models.size).toBeGreaterThan(50);
        expect(models.has('applicationDocument')).toBe(true);
        expect(models.has('farm')).toBe(true);
    });

    test('no backend source calls a model the schema does not define', () => {
        const unguarded = unknown.filter((call) => !GUARDED.includes(key(call)));
        expect(unguarded.map((call) => `${call.file}:${call.line} ${call.model}`)).toEqual([]);
    });

    test('every guarded entry still matches a call, so the list cannot rot', () => {
        expect(GUARDED.filter((entry) => !unknown.some((call) => key(call) === entry))).toEqual([]);
    });

    test('the scanner sees through optional chaining and the comment stripper keeps code', () => {
        const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'model-names-'));
        const file = path.join(dir, 'sample.js');
        fs.writeFileSync(file, [
            '// prisma.ghost.findMany() in a comment is not a call',
            'const a = prisma.document?.findMany?.({ where: {} });',
            'const b = await tx.establishment.count();',
            'const c = prisma.farm.findMany({ where: { fileUrl: "http://x/y" } });',
        ].join('\n'));
        const calls = unknownModelCalls([path.relative(REPO_ROOT, file)], new Set(['farm']));
        fs.rmSync(dir, { recursive: true, force: true });
        expect(calls.map((call) => `${call.line}:${call.model}`)).toEqual(['2:document', '3:establishment']);
    });
});

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { hidePrismaEnvFiles } = require('../../test-support/prisma-env-isolation');

const BACKEND = path.join(__dirname, '../..');
const UNREACHABLE_DATABASE_URL = 'postgresql://hermetic-check@127.0.0.1:1/none';

function namesPrismaLoadsInAChild(env) {
    const child = spawnSync(process.execPath, ['-e', `
        const before = new Set(Object.keys(process.env));
        require('@prisma/client');
        process.stdout.write(JSON.stringify(Object.keys(process.env).filter((name) => !before.has(name))));
    `], { cwd: BACKEND, env, encoding: 'utf8', timeout: 60000 });
    expect(child.status).toBe(0);
    return JSON.parse(child.stdout);
}

const namesPrismaLoadsIntoAnEmptyEnvironment = () => namesPrismaLoadsInAChild({ PATH: process.env.PATH });

describe('a jest run sees no variable from the env file @prisma/client loads', () => {
    test('the run-level setup leaves the jest process without them', () => {
        const fromTheFile = namesPrismaLoadsIntoAnEmptyEnvironment();
        const runner = { PATH: process.env.PATH, DATABASE_URL: UNREACHABLE_DATABASE_URL };
        const child = spawnSync(process.execPath, ['-e', `
            require('./jest.globalsetup.js')().then(
                () => process.stdout.write(JSON.stringify(Object.keys(process.env))),
                (error) => { process.stderr.write(String(error && error.message)); process.exit(1); },
            );
        `], { cwd: BACKEND, env: runner, encoding: 'utf8', timeout: 60000 });
        expect(child.status).toBe(0);

        const afterSetup = new Set(JSON.parse(child.stdout));
        expect(fromTheFile.filter((name) => afterSetup.has(name) && !(name in runner))).toEqual([]);
    });

    test("a child process a test spawns with the run's environment gets none of them either", () => {
        expect(namesPrismaLoadsInAChild({ ...process.env, DATABASE_URL: UNREACHABLE_DATABASE_URL })).toEqual([]);
    });

    test('a test that deletes one does not get it back from @prisma/client', () => {
        const names = namesPrismaLoadsIntoAnEmptyEnvironment().filter((name) => name !== 'DATABASE_URL');
        const saved = Object.fromEntries(names.filter((name) => name in process.env).map((name) => [name, process.env[name]]));
        for (const name of names) {
            delete process.env[name];
        }
        try {
            jest.isolateModules(() => {
                const { PrismaClient } = require('@prisma/client');
                new PrismaClient();
            });
            expect(names.filter((name) => name in process.env)).toEqual([]);
        } finally {
            for (const name of names) {
                delete process.env[name];
            }
            Object.assign(process.env, saved);
        }
    });

    test('Prisma reads an env file it can see, and nothing from one the run hid', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermetic-env-'));
        const file = path.join(dir, '.env');
        fs.writeFileSync(file, 'GACP_HERMETIC_PROBE=from-the-file\n');
        const { warnEnvConflicts } = require('@prisma/client/runtime/library.js');
        try {
            warnEnvConflicts({ rootEnvPath: null, schemaEnvPath: file });
            expect(process.env.GACP_HERMETIC_PROBE).toBe('from-the-file');
            delete process.env.GACP_HERMETIC_PROBE;

            hidePrismaEnvFiles([file]);
            warnEnvConflicts({ rootEnvPath: null, schemaEnvPath: file });
            expect(process.env.GACP_HERMETIC_PROBE).toBeUndefined();
        } finally {
            delete process.env.GACP_HERMETIC_PROBE;
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});

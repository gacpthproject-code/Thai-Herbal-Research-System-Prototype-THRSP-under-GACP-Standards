'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { refuseDatabaseUrlLoadedFromAnotherCheckout } = require('../../config/prisma-env-files');
const { hidePrismaEnvFiles } = require('../../test-support/prisma-env-isolation');

const BACKEND = path.join(__dirname, '../..');
const RUNNER_URL = 'postgresql://runner@127.0.0.1:1/chosen';
const OTHER_CHECKOUTS_URL = 'postgresql://elsewhere@10.0.0.1:5432/theirs';
const OPENS_THE_SHARED_CLIENT = "require('./services/prisma-database');";
const LOADS_PRISMA_FIRST = `require('@prisma/client'); ${OPENS_THE_SHARED_CLIENT}`;
const SETS_ITS_OWN_URL_FIRST = `process.env.DATABASE_URL = ${JSON.stringify(RUNNER_URL)}; ${OPENS_THE_SHARED_CLIENT}`;
const RESETS_FOR_HANDOFF = "require('./scripts/reset-for-handoff').main().then((code) => process.exit(code));";

let scratch;
beforeAll(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'other-checkouts-'));
});
afterAll(() => fs.rmSync(scratch, { recursive: true, force: true }));

function scratchEnvFile(text = null) {
    const file = path.join(fs.mkdtempSync(path.join(scratch, 'checkout-')), '.env');
    if (text !== null) {
        fs.writeFileSync(file, text);
    }
    return file;
}

function runWithAnotherCheckoutsEnvFile({ runnerEnv = {}, envFileText = null, script = OPENS_THE_SHARED_CLIENT }) {
    const envFile = scratchEnvFile(envFileText);
    const child = spawnSync(process.execPath, ['-e', `
        const fs = require('fs');
        const path = require('path');
        const client = require.resolve('.prisma/client/index.js', { paths: [path.dirname(require.resolve('@prisma/client'))] });
        const envPaths = JSON.stringify({ rootEnvPath: null, schemaEnvPath: path.relative(path.dirname(client), ${JSON.stringify(envFile)}) });
        const readFileSync = fs.readFileSync;
        fs.readFileSync = function readWithTheEnvFileMoved(file, ...rest) {
            const content = readFileSync.call(this, file, ...rest);
            return path.resolve(String(file)) === client && typeof content === 'string'
                ? content.replace(/"relativeEnvPaths":\\s*\\{[^{}]*\\}/, () => '"relativeEnvPaths": ' + envPaths)
                : content;
        };
        ${script}
    `], { cwd: BACKEND, env: { PATH: process.env.PATH, ...runnerEnv }, encoding: 'utf8', timeout: 60000 });
    const output = `${child.stdout}${child.stderr}`;
    return { exitCode: child.status, initialised: /PRISMA INIT/.test(output), output, envFile };
}

const outcome = ({ exitCode, initialised }) => ({ exitCode, initialised });

describe('a script that opens the shared Prisma client', () => {
    test('starts on the DATABASE_URL its runner set, as a production container does', () => {
        expect(outcome(runWithAnotherCheckoutsEnvFile({ runnerEnv: { NODE_ENV: 'production', DATABASE_URL: RUNNER_URL } })))
            .toEqual({ exitCode: 0, initialised: true });
    });

    test('starts on the DATABASE_URL its runner set even when the env file @prisma/client loads writes the same one', () => {
        expect(outcome(runWithAnotherCheckoutsEnvFile({
            runnerEnv: { DATABASE_URL: RUNNER_URL },
            envFileText: `DATABASE_URL=${RUNNER_URL}\n`,
        }))).toEqual({ exitCode: 0, initialised: true });
    });

    test('starts on it as well when the script loaded @prisma/client before the shared client', () => {
        expect(outcome(runWithAnotherCheckoutsEnvFile({
            runnerEnv: { DATABASE_URL: RUNNER_URL },
            envFileText: `DATABASE_URL=${RUNNER_URL}\n`,
            script: LOADS_PRISMA_FIRST,
        }))).toEqual({ exitCode: 0, initialised: true });
    });

    test('starts on a DATABASE_URL the script set itself before it loaded the shared client, as generate-data-dictionary.js does', () => {
        expect(outcome(runWithAnotherCheckoutsEnvFile({
            envFileText: `DATABASE_URL=${OTHER_CHECKOUTS_URL}\n`,
            script: SETS_ITS_OWN_URL_FIRST,
        }))).toEqual({ exitCode: 0, initialised: true });
    });

    describe("refuses to start on a DATABASE_URL that came from another checkout's env file, naming the file and never the URL", () => {
        test.each([
            ['written out in the file', `DATABASE_URL=${OTHER_CHECKOUTS_URL}\n`, OPENS_THE_SHARED_CLIENT],
            ['built from other variables in the file', `GACP_OTHER_DB_USER=elsewhere\nDATABASE_URL=postgresql://\${GACP_OTHER_DB_USER}@10.0.0.1:5432/theirs\n`, OPENS_THE_SHARED_CLIENT],
            ['after the script loaded @prisma/client before the shared client', `DATABASE_URL=${OTHER_CHECKOUTS_URL}\n`, LOADS_PRISMA_FIRST],
        ])('%s', (_case, envFileText, script) => {
            const run = runWithAnotherCheckoutsEnvFile({ envFileText, script });
            expect(outcome(run)).toEqual({ exitCode: 1, initialised: false });
            expect(run.output).toContain(run.envFile);
            expect(run.output).not.toContain(OTHER_CHECKOUTS_URL);
        });
    });

    test('cannot carry on with a client of its own once the shared client refused, as reset-for-handoff.js did', () => {
        const run = runWithAnotherCheckoutsEnvFile({
            envFileText: `NODE_ENV=development\nDATABASE_URL=${OTHER_CHECKOUTS_URL}\n`,
            script: RESETS_FOR_HANDOFF,
        });
        expect(run.exitCode).toBe(1);
        expect(run.output).toContain(run.envFile);
        expect(run.output).not.toContain('GACP Database Reset for Handoff');
    });
});

describe('refuseDatabaseUrlLoadedFromAnotherCheckout, given a DATABASE_URL that Prisma put in place', () => {
    function refusal(envFile, ownEnvFile) {
        try {
            refuseDatabaseUrlLoadedFromAnotherCheckout(false, [envFile], ownEnvFile);
            return null;
        } catch (error) {
            return error.message;
        }
    }

    test("accepts one from this checkout's own env file", () => {
        const ownEnvFile = scratchEnvFile(`DATABASE_URL=${OTHER_CHECKOUTS_URL}\n`);
        expect(refusal(ownEnvFile)).toContain(ownEnvFile);
        expect(refusal(ownEnvFile, ownEnvFile)).toBeNull();
    });

    test('accepts one from another checkout once the run hides that file from Prisma, as every jest process does', () => {
        const envFile = scratchEnvFile(`DATABASE_URL=${OTHER_CHECKOUTS_URL}\n`);
        expect(refusal(envFile)).toContain(envFile);

        hidePrismaEnvFiles([envFile]);
        expect(refusal(envFile)).toBeNull();
    });
});

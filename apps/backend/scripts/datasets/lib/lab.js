'use strict';

/**
 * A throwaway stack for the research dataset checker: an empty Postgres (a
 * `tbd-` container, or an empty database the caller names), the backend booted
 * from this tree on a free port, and tokens minted with the stack's own secrets.
 * Nothing here reads or writes staging, demo, gacp-gate-scratch or a .env file.
 */

const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const BACKEND = path.resolve(__dirname, '../../..');
const REPO = path.resolve(BACKEND, '../..');

const randomSecret = (label) => `${label}-${crypto.randomBytes(24).toString('hex')}`;

function freePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            server.close(() => resolve(port));
        });
    });
}

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

async function waitFor(check, { timeoutMs, what }) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        if (await check()) { return; }
        if (Date.now() > deadline) { throw new Error(`timed out waiting for ${what}`); }
        await sleep(500);
    }
}

/**
 * An empty database. With `databaseUrl` the caller owns it; otherwise a
 * postgres:17-alpine container named tbd-dataset-check-<random> is started and
 * removed by stop().
 */
async function startPostgres({ databaseUrl } = {}) {
    if (databaseUrl) { return { url: databaseUrl, stop: async () => {} }; }
    const name = `tbd-dataset-check-${crypto.randomBytes(3).toString('hex')}`;
    const port = await freePort();
    const password = crypto.randomBytes(12).toString('hex');
    const run = spawnSync('docker', ['run', '-d', '--rm', '--name', name, '-e', `POSTGRES_PASSWORD=${password}`,
        '-p', `127.0.0.1:${port}:5432`, 'postgres:17-alpine'], { encoding: 'utf8' });
    if (run.status !== 0) { throw new Error(`docker run ${name} failed: ${(run.stderr || '').trim()}`); }
    const stop = async () => { spawnSync('docker', ['stop', name], { encoding: 'utf8' }); };
    try {
        await waitFor(() => spawnSync('docker', ['exec', name, 'pg_isready', '-U', 'postgres'], { encoding: 'utf8' }).status === 0,
            { timeoutMs: 60000, what: `${name} to accept connections` });
        await sleep(1000);
        const created = spawnSync('docker', ['exec', name, 'psql', '-U', 'postgres', '-c', 'CREATE DATABASE dataset_check'], { encoding: 'utf8' });
        if (created.status !== 0) { throw new Error(`create database in ${name} failed: ${created.stderr}`); }
    } catch (err) {
        await stop();
        throw err;
    }
    return { url: `postgresql://postgres:${password}@127.0.0.1:${port}/dataset_check?schema=public`, stop, name };
}

function migrate(url) {
    const r = spawnSync(process.execPath, [path.join(BACKEND, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
        { cwd: BACKEND, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: os.homedir(), DATABASE_URL: url } });
    if (r.status !== 0) { throw new Error(`prisma migrate deploy failed: ${(r.stderr || r.stdout || '').trim().slice(-600)}`); }
}

/**
 * Tables the sample writes through the system's own doors. Their ids and
 * creation times come from the Prisma engine (random uuid, wall clock); on the
 * scratch database only, a trigger replaces both with values drawn from one
 * sequence, so the same sample run twice writes the same rows byte for byte.
 */
const FIXED_IDENTITY_MODELS = Object.freeze([
    'CultivationLog', 'HarvestBatch', 'TraceQrSecurity', 'TraceQrScan',
    'SurveyTemplate', 'SurveyQuestion', 'SurveyResponse', 'SurveyAnswer',
]);

/** The Postgres table of a Prisma model (models map to snake_case tables). */
function tableOf(model) {
    const { Prisma } = require(path.join(BACKEND, 'node_modules/@prisma/client'));
    const found = Prisma.dmmf.datamodel.models.find((m) => m.name === model);
    if (!found) { throw new Error(`no Prisma model ${model}`); }
    return found.dbName || found.name;
}

async function installFixedIdentity(prisma, { epoch }) {
    await prisma.$executeRawUnsafe('CREATE SEQUENCE IF NOT EXISTS dataset_sample_row_seq');
    await prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION dataset_sample_fixed_identity() RETURNS trigger AS $$
        DECLARE
            n bigint := nextval('dataset_sample_row_seq');
            h text := md5(TG_TABLE_NAME || ':' || n);
        BEGIN
            NEW.id := substr(h, 1, 8) || '-' || substr(h, 9, 4) || '-4' || substr(h, 14, 3) || '-8' || substr(h, 18, 3) || '-' || substr(h, 21, 12);
            NEW."createdAt" := timestamp '${epoch}' + n * interval '1 minute';
            RETURN NEW;
        END $$ LANGUAGE plpgsql`);
    for (const model of FIXED_IDENTITY_MODELS) {
        await prisma.$executeRawUnsafe(`CREATE TRIGGER dataset_sample_fixed_identity BEFORE INSERT ON "${tableOf(model)}" FOR EACH ROW EXECUTE FUNCTION dataset_sample_fixed_identity()`);
    }
}

/**
 * The backend from this tree, development mode, on its own port and log file.
 * `env` is the whole environment besides PATH/HOME: nothing is inherited.
 */
async function bootBackend({ label, env, preloads = [], logDir }) {
    const port = await freePort();
    const logPath = path.join(logDir, `backend-${label}.log`);
    const log = fs.openSync(logPath, 'w');
    const child = spawn(process.execPath, [...preloads.flatMap((p) => ['-r', p]), 'server.js'], {
        cwd: BACKEND,
        env: { PATH: process.env.PATH, HOME: os.homedir(), NODE_ENV: 'development', PORT: String(port), LOG_LEVEL: 'info', ...env },
        stdio: ['ignore', log, log],
    });
    let exited = null;
    child.on('exit', (code) => { exited = code; });
    const base = `http://127.0.0.1:${port}`;
    const stop = async () => {
        if (exited === null) {
            child.kill('SIGTERM');
            await waitFor(() => exited !== null, { timeoutMs: 15000, what: `backend ${label} to exit` }).catch(() => child.kill('SIGKILL'));
        }
        fs.closeSync(log);
    };
    try {
        await waitFor(async () => {
            if (exited !== null) { throw new Error(`backend ${label} exited with ${exited}; see ${logPath}`); }
            try { return (await fetch(`${base}/api/health`)).status === 200; } catch { return false; }
        }, { timeoutMs: 90000, what: `backend ${label} on ${port}` });
    } catch (err) {
        await stop();
        throw err;
    }
    return { base, stop, logPath };
}

/**
 * Tokens shaped like a login's (services/prisma-auth-service.js), signed with
 * the secrets the stack was booted with. `withOrganization: false` mints the
 * shape a session issued before the tenant claim carries.
 */
function tokenMinter(jwtEnv) {
    Object.assign(process.env, jwtEnv);
    const { generateToken } = require(path.join(BACKEND, 'config/jwt-security'));
    return (user, { withOrganization = true } = {}) => generateToken({
        id: user.id,
        role: user.role,
        canonicalRole: user.role,
        accountType: user.accountType,
        accountTier: 'NORMAL',
        authType: user.authType,
        twoFactorEnabled: false,
        ...(withOrganization ? { organizationId: user.organizationId } : {}),
        email: user.email,
        sessionFamilyId: crypto.randomUUID(),
    }, user.accountType === 'PROVIDER' ? 'provider' : 'public');
}

function jwtSecrets() {
    const health = randomSecret('tbd-health-jwt');
    const provider = randomSecret('tbd-provider-jwt');
    return { JWT_SECRET: health, HEALTH_JWT_SECRET: health, PROVIDER_JWT_SECRET: provider, DTAM_JWT_SECRET: provider };
}

/** One HTTP call; the body is kept as bytes so CSV, JSONL and ZIP are judged exactly as sent. */
async function call(base, method, urlPath, { token, body } = {}) {
    const headers = {};
    if (token) { headers.Authorization = `Bearer ${token}`; }
    if (body !== undefined) { headers['Content-Type'] = 'application/json'; }
    const res = await fetch(`${base}${urlPath}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const bytes = Buffer.from(await res.arrayBuffer());
    let json = null;
    try { json = JSON.parse(bytes.toString('utf8')); } catch { json = null; }
    return { status: res.status, contentType: res.headers.get('content-type') || '', cacheControl: res.headers.get('cache-control'), bytes, json };
}

module.exports = {
    BACKEND, REPO, FIXED_IDENTITY_MODELS, tableOf,
    randomSecret, startPostgres, migrate, installFixedIdentity, bootBackend, tokenMinter, jwtSecrets, call,
};

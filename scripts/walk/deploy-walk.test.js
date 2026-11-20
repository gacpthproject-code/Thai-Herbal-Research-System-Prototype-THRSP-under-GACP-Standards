'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { STATUS, pass, fail, notYet, normalizeCheck, foldRow, exitCodeFor, probeExitToStatus, resolveTarget, stripeGate, selectRows, parseArgs } = require('./lib/verdict');
const { loadConfig, containerArgv, accountCredentials } = require('./lib/target');
const { scrub, piiFound, addSecret } = require('./lib/mask');
const { loadPlaywright } = require('./lib/driver');

const fakeKey = (prefix, mode) => [prefix, mode, 'abc'].join('_');
const P = { status: STATUS.PASS }; const F = { status: STATUS.FAIL }; const N = { status: STATUS.NOT_YET };

test('a row passes only when every check passed', () => {
    assert.equal(foldRow([P, P]), STATUS.PASS);
    assert.equal(foldRow([P, N]), STATUS.NOT_YET);
    assert.equal(foldRow([N, F, P]), STATUS.FAIL);
    assert.equal(foldRow([]), STATUS.NOT_YET);
});

test('a check with a missing or unknown status fails its row and says why', () => {
    assert.equal(foldRow([{ id: 'x' }]), STATUS.FAIL);
    assert.equal(foldRow([{ status: 'pass' }]), STATUS.FAIL);
    assert.equal(foldRow([P, { status: undefined }]), STATUS.FAIL);
    assert.equal(foldRow([N, { status: 'SKIP' }]), STATUS.FAIL);
    const fixed = normalizeCheck({ id: 'x', detail: 'd' });
    assert.equal(fixed.status, STATUS.FAIL);
    assert.match(fixed.detail, /สถานะของข้อไม่รู้จัก \(ไม่มี\)/);
    assert.match(normalizeCheck({ status: 'pass' }).detail, /"pass"/);
    assert.equal(normalizeCheck(P), P);
});

test('the run exits non-zero on any FAIL and zero on NOT-YET', () => {
    assert.equal(exitCodeFor([{ status: STATUS.PASS }, { status: STATUS.NOT_YET }]), 0);
    assert.equal(exitCodeFor([{ status: STATUS.PASS }, { status: STATUS.FAIL }]), 1);
});

test('a probe that could not look is a FAIL, a pending probe is NOT-YET', () => {
    assert.equal(probeExitToStatus(0), STATUS.PASS);
    assert.equal(probeExitToStatus(1), STATUS.FAIL);
    assert.equal(probeExitToStatus(2), STATUS.FAIL);
    assert.equal(probeExitToStatus(3), STATUS.NOT_YET);
    assert.equal(probeExitToStatus(null), STATUS.FAIL);
});

test('demo is refused unless --target demo is given', () => {
    for (const url of ['https://demo.gacpth.com', 'https://119.59.105.140/']) {
        const r = resolveTarget(url);
        assert.equal(r.ok, false);
        assert.match(r.reason, /--target demo/);
    }
    assert.deepEqual(resolveTarget('https://demo.gacpth.com', 'demo'), { ok: true, name: 'demo', base: 'https://demo.gacpth.com' });
    assert.equal(resolveTarget('https://demo.gacpth.com', 'staging').ok, false);
});

test('staging resolves without a flag; unknown hosts and plain http are refused', () => {
    assert.deepEqual(resolveTarget('https://staging.gacpth.com/'), { ok: true, name: 'staging', base: 'https://staging.gacpth.com' });
    assert.equal(resolveTarget('https://staging.gacpth.com', 'demo').ok, false);
    assert.equal(resolveTarget('https://gacpth.com').ok, false);
    assert.equal(resolveTarget('http://staging.gacpth.com').ok, false);
    assert.equal(resolveTarget('not a url').ok, false);
});

test('the walk refuses unless both the target and its container say test mode', () => {
    assert.deepEqual(stripeGate({ paymentMode: 'TRIAL', secretKeyClass: 'test', publishableKeyClass: 'test' }), { ok: true });
    const refused = [
        { paymentMode: 'LIVE', secretKeyClass: 'test', publishableKeyClass: 'test' },
        { paymentMode: 'TRIAL', secretKeyClass: 'live', publishableKeyClass: 'test' },
        { paymentMode: 'TRIAL', secretKeyClass: 'test', publishableKeyClass: 'live' },
        { paymentMode: 'TRIAL', secretKeyClass: 'absent', publishableKeyClass: 'test' },
        { paymentMode: null, secretKeyClass: 'test', publishableKeyClass: 'test' },
        { paymentMode: 'TRIAL', secretKeyClass: undefined, publishableKeyClass: 'test' },
        { paymentMode: 'TRIAL', secretKeyClass: fakeKey('sk', 'live'), publishableKeyClass: 'test' },
    ];
    for (const r of refused) { assert.equal(stripeGate(r).ok, false, JSON.stringify(r)); }
});

test('the container classifier sees only the key prefix', async () => {
    const code = fs.readFileSync(path.join(__dirname, 'container/stripe-keys.js'), 'utf8');
    const F2 = Object.getPrototypeOf(async () => {}).constructor;
    const run = (secret, pub) => {
        const saved = { ...process.env };
        process.env.STRIPE_SECRET_KEY = secret; process.env.STRIPE_PUBLISHABLE_KEY = pub;
        if (secret === undefined) { delete process.env.STRIPE_SECRET_KEY; }
        try { return new F2('input', 'require', code)({}, require); } finally { process.env = saved; }
    };
    assert.deepEqual(await run(fakeKey('sk', 'test'), fakeKey('pk', 'test')), { secret: 'test', publishable: 'test' });
    assert.deepEqual(await run(fakeKey('sk', 'live'), fakeKey('pk', 'live')), { secret: 'live', publishable: 'live' });
    assert.deepEqual(await run(fakeKey('rk', 'live'), fakeKey('pk', 'test')), { secret: 'live', publishable: 'test' });
    assert.deepEqual(await run(undefined, 'xyz'), { secret: 'absent', publishable: 'unknown' });
});

test('the CLI refuses demo and unknown hosts before reading any config', () => {
    const cli = path.join(__dirname, 'deploy-walk.js');
    const demo = spawnSync('node', [cli, 'https://demo.gacpth.com'], { encoding: 'utf8' });
    assert.equal(demo.status, 2);
    assert.match(demo.stderr, /--target demo/);
    const other = spawnSync('node', [cli, 'https://example.com'], { encoding: 'utf8' });
    assert.equal(other.status, 2);
});

test('a config readable by others is refused', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'walk-cfg-'));
    const f = path.join(dir, 'c.json');
    fs.writeFileSync(f, JSON.stringify({ staging: { accounts: {} } }), { mode: 0o644 });
    fs.chmodSync(f, 0o644);
    assert.throws(() => loadConfig('staging', f), /0600/);
    fs.chmodSync(f, 0o600);
    assert.deepEqual(loadConfig('staging', f), { accounts: {} });
    assert.throws(() => loadConfig('demo', f), /demo/);
});

test('rows are picked by id and unknown ids are refused', () => {
    const reg = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    assert.deepEqual(selectRows(reg, ['c', 'a']).rows.map((r) => r.id), ['a', 'c']);
    assert.equal(selectRows(reg, null).rows.length, 3);
    assert.equal(selectRows(reg, ['x']).ok, false);
});

test('arguments parse into options', () => {
    assert.deepEqual(parseArgs(['https://staging.gacpth.com', '--rows', 'identity, verify', '--out', '/tmp/o']),
        { base: 'https://staging.gacpth.com', target: null, rows: ['identity', 'verify'], out: '/tmp/o', list: false });
    assert.throws(() => parseArgs(['--nope']));
});

test('saved output carries no identifier, key or account secret', () => {
    addSecret('walk-password-123');
    const raw = `id 1234567890123 tel 0812345678 mail a.b@example.com key ${fakeKey('sk', 'test')}DEF jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig pw walk-password-123 db postgresql://u:p@h:6543/x`;
    const out = scrub(raw);
    for (const leak of ['1234567890123', '0812345678', 'a.b@example.com', `${fakeKey('sk', 'test')}DEF`, 'eyJhbGciOiJIUzI1NiJ9', 'walk-password-123', 'u:p@h']) {
        assert.equal(out.includes(leak), false, leak);
    }
    assert.deepEqual(piiFound('{"holder":"บริษัท","n":"65/2569"}'), []);
    assert.deepEqual(piiFound('{"tax":"0105512345678"}'), ['เลข 13 หลัก']);
});

const WALK = __dirname;
const walkFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (
    e.isDirectory() ? walkFiles(path.join(dir, e.name)) : /\.(js|sh)$/.test(e.name) ? [path.join(dir, e.name)] : []));

test('no walk code outside the container reads the database URL or the Stripe secret', () => {
    const forbidden = /process\.env\.(DATABASE_URL|STRIPE_SECRET_KEY|STRIPE_PUBLISHABLE_KEY)|process\.env\[|\b(DATABASE_URL|STRIPE_SECRET_KEY)\b\s*[:=]|read-env|printenv|\benv\b[^\n]*docker|docker[^\n]*\benv\b/;
    const host = walkFiles(WALK).filter((f) => !f.startsWith(path.join(WALK, 'container')) && f !== __filename);
    assert.ok(host.length > 20);
    for (const f of host) { assert.doesNotMatch(fs.readFileSync(f, 'utf8'), forbidden, path.relative(WALK, f)); }
    const readsEnv = walkFiles(path.join(WALK, 'container')).filter((f) => /process\.env/.test(fs.readFileSync(f, 'utf8')));
    assert.deepEqual(readsEnv.map((f) => path.basename(f)), ['stripe-keys.js']);
});

const runContainerScript = (name, input, fakeRequire = require) => {
    const code = fs.readFileSync(path.join(WALK, 'container', `${name}.js`), 'utf8');
    const F2 = Object.getPrototypeOf(async () => {}).constructor;
    return new F2('input', 'require', code)(input, fakeRequire);
};

test('the Stripe balance call runs only with a test key and returns a status, never the key', async () => {
    const saved = { env: { ...process.env }, fetch: globalThis.fetch };
    const calls = [];
    globalThis.fetch = async (url, opts) => { calls.push({ url, auth: opts.headers.authorization }); return { status: 200 }; };
    try {
        const testKey = fakeKey('sk', 'test');
        process.env.STRIPE_SECRET_KEY = testKey; process.env.STRIPE_PUBLISHABLE_KEY = fakeKey('pk', 'test');
        const ok = await runContainerScript('stripe-keys', { balance: true });
        assert.deepEqual(ok, { secret: 'test', publishable: 'test', balanceStatus: 200 });
        assert.equal(JSON.stringify(ok).includes(testKey), false);
        assert.deepEqual(calls.map((c) => c.url), ['https://api.stripe.com/v1/balance']);
        calls.length = 0;
        process.env.STRIPE_SECRET_KEY = fakeKey('sk', 'live');
        assert.deepEqual(await runContainerScript('stripe-keys', { balance: true }), { secret: 'live', publishable: 'test' });
        assert.equal(calls.length, 0, 'a live key is never sent to Stripe');
    } finally { process.env = saved.env; globalThis.fetch = saved.fetch; }
});

const probeSql = (probe) => {
    const sh = fs.readFileSync(path.join(WALK, '..', 'probes', `${probe}.sh`), 'utf8');
    return sh.match(/-tAc \\\s*\n\s*"([\s\S]*?)" \\\s*\n\s*2>/)[1].replace(/\\"/g, '"');
};
const containerSql = (name) => fs.readFileSync(path.join(WALK, 'container', 'money-counts.js'), 'utf8').match(new RegExp(`const ${name} = \`([^\`]+)\``))[1];
const oneLine = (sql) => sql.replace(/\s+/g, ' ').trim();

test('the in-container money counts run the same SQL as the repo probes', () => {
    assert.equal(oneLine(containerSql('MONEY_EQUATION')), oneLine(probeSql('money-equation')));
    assert.equal(oneLine(containerSql('QUOTATION_CLOSURE')), oneLine(probeSql('quotation-closure')));
});

test('the in-container money counts return counts or an error code, nothing else', async () => {
    const answers = [[{ count: 0n }], Object.assign(new Error('postgresql://u:pw@h/db refused'), { code: 'P1001' })];
    const prisma = {
        $queryRawUnsafe: async () => { const a = answers.shift(); if (a instanceof Error) { throw a; } return a; },
        $disconnect: async () => {},
    };
    const fakeRequire = (m) => (m.endsWith('prisma-database') ? { prisma } : { withoutTenantScope: (fn) => fn() });
    const r = await runContainerScript('money-counts', {}, fakeRequire);
    assert.deepEqual(r, { moneyEquation: { count: 0 }, quotationClosure: { error: 'P1001' } });
});

test('the in-container zone read runs the same statement as the repo probe', () => {
    const container = fs.readFileSync(path.join(WALK, 'container', 'db-session-timezone.js'), 'utf8').match(/const SHOW_TIMEZONE = '([^']+)'/)[1];
    const probe = fs.readFileSync(path.join(WALK, '..', 'probes', 'db-session-timezone.sh'), 'utf8').match(/-tAc "([^"]+)" 2>/)[1];
    assert.equal(container, probe);
});

test('the in-container zone read returns the zone or an error code, nothing else', async () => {
    const answers = [[{ TimeZone: 'UTC' }], Object.assign(new Error('postgresql://u:pw@h/db refused'), { code: 'P1001' })];
    const prisma = {
        $queryRawUnsafe: async () => { const a = answers.shift(); if (a instanceof Error) { throw a; } return a; },
        $disconnect: async () => {},
    };
    const fakeRequire = (m) => (m.endsWith('prisma-database') ? { prisma } : { withoutTenantScope: (fn) => fn() });
    assert.deepEqual(await runContainerScript('db-session-timezone', {}, fakeRequire), { timezone: 'UTC' });
    assert.deepEqual(await runContainerScript('db-session-timezone', {}, fakeRequire), { error: 'P1001' });
});

test('the jobs row passes the session zone only on UTC', async () => {
    const { pass, fail, notYet } = require('./lib/verdict');
    const statusOn = async (answer) => {
        const inContainer = async (name) => (name === 'db-session-timezone' ? answer : { overdue: [], waiting: {}, expiredCerts: [] });
        const checks = await require('./rows/jobs').run({ state: {}, pass, fail, notYet, inContainer });
        return checks.find((c) => c.id === 'db-session-timezone').status;
    };
    assert.equal(await statusOn({ timezone: 'UTC' }), 'PASS');
    assert.equal(await statusOn({ timezone: 'Asia/Bangkok' }), 'FAIL');
    assert.equal(await statusOn({ timezone: 'Etc/UTC' }), 'FAIL');
    assert.equal(await statusOn({ error: 'P1001' }), 'FAIL');
});

test('the Stripe gate in main refuses with exit 2 before any sign-in', async () => {
    const { main } = require('./deploy-walk');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'walk-main-'));
    const cfgFile = path.join(dir, 'c.json');
    fs.writeFileSync(cfgFile, JSON.stringify({ staging: { accounts: {} } }), { mode: 0o600 });
    const savedCfg = process.env.DEPLOY_WALK_CONFIG;
    process.env.DEPLOY_WALK_CONFIG = cfgFile;
    const logs = console.log; console.log = () => {};
    try {
        const cases = [
            { mode: 'LIVE', keys: { secret: 'test', publishable: 'test' } },
            { mode: null, keys: { secret: 'test', publishable: 'test' } },
            { mode: 'TRIAL', keys: { secret: 'live', publishable: 'test' } },
            { mode: 'TRIAL', keys: {} },
        ];
        for (const [i, c] of cases.entries()) {
            let contexts = 0;
            const io = { paymentMode: async () => c.mode, stripeKeyClasses: async () => c.keys, createContext: () => { contexts += 1; throw new Error('walk started'); } };
            assert.equal(await main(['https://staging.gacpth.com', '--out', path.join(dir, `o${i}`)], io), 2, JSON.stringify(c));
            assert.equal(contexts, 0, JSON.stringify(c));
        }
    } finally {
        console.log = logs;
        if (savedCfg === undefined) { delete process.env.DEPLOY_WALK_CONFIG; } else { process.env.DEPLOY_WALK_CONFIG = savedCfg; }
    }
});

test('deploy-walk.sh skips heavy.sh only when an ancestor already holds the heavy lock', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'walk-heavy-'));
    const stub = path.join(dir, 'heavy.sh');
    const mark = path.join(dir, 'called');
    fs.writeFileSync(stub, `#!/usr/bin/env bash\ntouch "${mark}"\n"$@"\n`, { mode: 0o755 });
    const run = (env) => spawnSync('bash', [path.join(WALK, 'deploy-walk.sh'), '--list'], { encoding: 'utf8', env: { ...process.env, GACP_HEAVY_SH: stub, ...env } });
    const held = run({ GACP_HEAVY_HELD: '1' });
    assert.equal(held.status, 0);
    assert.equal(fs.existsSync(mark), false, 'held lock: heavy.sh not entered again');
    const free = run({ GACP_HEAVY_HELD: '' });
    assert.equal(free.status, 0);
    assert.equal(fs.existsSync(mark), true, 'free lock: wrapped in heavy.sh');
});

test('a revision that is not a full sha never reaches a command', () => {
    const { checkArchitectureAtRevisionArchive } = require('./rows/subsystems');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'walk-rev-'));
    const canary = path.join(dir, 'pwned');
    for (const rev of [`HEAD; touch ${canary}`, `$(touch ${canary})`, 'abc123', 'A'.repeat(40), undefined]) {
        assert.throws(() => checkArchitectureAtRevisionArchive(rev, dir), /sha 40/);
    }
    assert.equal(fs.existsSync(canary), false);
});

const OK_PATHS = ['/api/surveys/templates', '/api/image-assessment/catalog'];
const subsystemsCtx = ({ comparison, herbs, status = 200, listStatus = 200, signInOk = true, cmpStatus = 200, down = [], revision, outDir } = {}) => {
    const reads = [];
    const http = async (method, p) => {
        if (p === '/api/standards') { return { status: listStatus, json: { data: [] } }; }
        if (p === '/api/herbs/coverage') { return { status, json: herbs === undefined ? null : { data: herbs } }; }
        return { status: 404, json: null };
    };
    const api = async (role, method, p) => {
        reads.push(`${role} ${p}`);
        if (down.includes(p)) { return { status: 503, body: {} }; }
        if (p === '/api/standards/comparison') { return { status: cmpStatus, body: { data: comparison } }; }
        if (p === '/api/image-assessment/catalog') { return { status: role === 'inspector' ? 200 : 403, body: {} }; }
        return OK_PATHS.includes(p) ? { status: 200, body: {} } : { status: 404, body: {} };
    };
    return {
        state: { revision }, outDir, reads, results: { tnt: 'PASS' }, http, pass, fail, notYet,
        signIn: async () => (signInOk ? { ok: true } : { ok: false, reason: 'x' }),
        driver: async () => ({ signedIn: new Set(['approver', 'inspector']), api }),
    };
};
const goodCells = { topics: [{ cells: [{ ref: '4.1', sourceId: 'who-1' }, { ref: '2', sourceId: 'th-1' }] }] };
const goodHerbs = { totalHerbs: 6, totalEntries: 120, totalCited: 7 };
const byId = (checks) => Object.fromEntries(checks.map((c) => [c.id, c.status]));
const runSubsystems = (o) => require('./rows/subsystems').run(subsystemsCtx(o));
const SUBSYSTEM_CHECKS = ['standards-comparison', 'survey-system', 'architecture', 'herb-db', 'image-system'];

test('the subsystems row passes each real-machine check on a healthy response', async () => {
    const got = byId(await runSubsystems({ comparison: goodCells, herbs: goodHerbs }));
    for (const id of ['standards-comparison', 'survey-system', 'herb-db', 'image-system']) { assert.equal(got[id], STATUS.PASS, id); }
});

test('a comparison cell without its clause number or its source fails the row', async () => {
    for (const cell of [{ sourceId: 's' }, { ref: '1' }]) {
        const got = byId(await runSubsystems({ comparison: { topics: [{ cells: [{ ref: '1', sourceId: 's' }, cell] }] }, herbs: goodHerbs }));
        assert.equal(got['standards-comparison'], STATUS.FAIL);
    }
    assert.equal(byId(await runSubsystems({ comparison: { topics: [] }, herbs: goodHerbs }))['standards-comparison'], STATUS.FAIL);
});

test('a comparison topic with no cells fails the row, alone or beside a good topic', async () => {
    const good = goodCells.topics[0];
    for (const empty of [{ cells: [] }, {}]) {
        for (const topics of [[empty], [good, empty]]) {
            const got = byId(await runSubsystems({ comparison: { topics }, herbs: goodHerbs }));
            assert.equal(got['standards-comparison'], STATUS.FAIL, JSON.stringify(topics));
        }
    }
});

test('the standards check fails when either endpoint does not answer 200', async () => {
    const list = byId(await runSubsystems({ comparison: goodCells, herbs: goodHerbs, listStatus: 500 }));
    assert.equal(list['standards-comparison'], STATUS.FAIL);
    const cmp = byId(await runSubsystems({ comparison: goodCells, herbs: goodHerbs, cmpStatus: 503 }));
    assert.equal(cmp['standards-comparison'], STATUS.FAIL);
});

test('a staff sign-in that fails fails every check that needs staff and leaves the public one alone', async () => {
    const got = byId(await runSubsystems({ comparison: goodCells, herbs: goodHerbs, signInOk: false }));
    for (const id of ['standards-comparison', 'survey-system', 'image-system']) { assert.equal(got[id], STATUS.FAIL, id); }
    assert.equal(got['herb-db'], STATUS.PASS);
});

test('the image catalog is read as an inspector', async () => {
    const ctx = subsystemsCtx({ comparison: goodCells, herbs: goodHerbs });
    const got = byId(await require('./rows/subsystems').run(ctx));
    assert.equal(got['image-system'], STATUS.PASS);
    assert.ok(ctx.reads.includes('inspector /api/image-assessment/catalog'), ctx.reads.join(' | '));
});

test('the subsystems row has exactly its own checks, in order, with no fixed rows beside them', async () => {
    const checks = await runSubsystems({ comparison: goodCells, herbs: goodHerbs });
    assert.deepEqual(checks.map((c) => c.id), SUBSYSTEM_CHECKS);
});

test('the herb database passes with 6 species and a cited entry, and fails when a species is missing or nothing is cited', async () => {
    const herb = async (herbs) => byId(await runSubsystems({ comparison: goodCells, herbs }))['herb-db'];
    assert.equal(await herb({ totalHerbs: 6, totalEntries: 30, totalCited: 1 }), STATUS.PASS);
    assert.equal(await herb({ totalHerbs: 5, totalEntries: 900, totalCited: 900 }), STATUS.FAIL);
    assert.equal(await herb({ totalHerbs: 7, totalEntries: 900, totalCited: 900 }), STATUS.FAIL);
    assert.equal(await herb({ totalHerbs: 6, totalEntries: 900, totalCited: 0 }), STATUS.FAIL);
    assert.equal(await herb({ totalHerbs: 6, totalEntries: 900 }), STATUS.FAIL);
    assert.equal(await herb(undefined), STATUS.FAIL);
    const sick = byId(await runSubsystems({ comparison: goodCells, herbs: goodHerbs, status: 500 }));
    assert.equal(sick['herb-db'], STATUS.FAIL, 'a good body on a 500 is not a pass');
});

test('the survey and image systems fail when the machine does not answer 200 on their own path', async () => {
    for (const [id, p] of [['survey-system', '/api/surveys/templates'], ['image-system', '/api/image-assessment/catalog']]) {
        const got = byId(await runSubsystems({ comparison: goodCells, herbs: goodHerbs, down: [p] }));
        assert.equal(got[id], STATUS.FAIL, id);
        assert.equal(Object.entries(got).filter(([k, v]) => k !== id && k !== 'architecture' && v !== STATUS.PASS).length, 0, 'other checks unaffected');
    }
});

test('the architecture check fails, never NOT-YET, without a usable revision', async () => {
    for (const revision of [undefined, 'HEAD', 'not-a-sha']) {
        const got = byId(await runSubsystems({ comparison: goodCells, herbs: goodHerbs, revision }));
        assert.equal(got.architecture, STATUS.FAIL, String(revision));
    }
});

const withArchiveExit = async (code, fn) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'walk-fakearch-'));
    const src = path.join(dir, 'src');
    fs.mkdirSync(path.join(src, 'scripts', 'docs'), { recursive: true });
    fs.writeFileSync(path.join(src, 'scripts', 'docs', 'check-architecture.js'), `console.log('arch line'); process.exit(${code});
`);
    const tar = path.join(dir, 'fake.tar');
    assert.equal(spawnSync('tar', ['-cf', tar, '-C', src, '.']).status, 0);
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'git'), `#!/usr/bin/env bash
while [ $# -gt 0 ]; do [ "$1" = -o ] && out="$2"; shift; done
cp "${tar}" "$out"
`, { mode: 0o755 });
    const savedPath = process.env.PATH;
    process.env.PATH = `${bin}${path.delimiter}${savedPath}`;
    try { return await fn(dir); } finally { process.env.PATH = savedPath; fs.rmSync(dir, { recursive: true, force: true }); }
};

test('the architecture check passes on exit 0 and fails, never NOT-YET, on any other exit', async () => {
    for (const [code, want] of [[0, STATUS.PASS], [1, STATUS.FAIL], [3, STATUS.FAIL]]) {
        const got = await withArchiveExit(code, (outDir) => runSubsystems({ comparison: goodCells, herbs: goodHerbs, revision: 'a'.repeat(40), outDir }));
        assert.equal(byId(got).architecture, want, `exit ${code}`);
    }
});

test('no check of the subsystems row can come back NOT-YET, whatever the machine answers', async () => {
    const scenarios = [
        { comparison: goodCells, herbs: goodHerbs },
        { comparison: goodCells, herbs: { ...goodHerbs, totalCited: 0 } },
        { comparison: goodCells, herbs: { ...goodHerbs, totalHerbs: 3 } },
        { comparison: { topics: [] }, herbs: undefined, status: 500 },
        { comparison: goodCells, herbs: goodHerbs, down: OK_PATHS, revision: 'zzz' },
    ];
    for (const sc of scenarios) {
        const checks = await runSubsystems(sc);
        assert.ok(checks.length >= 4);
        for (const c of checks) { assert.notEqual(c.status, STATUS.NOT_YET, `${c.id} ${JSON.stringify(sc)}`); }
    }
});

test('the walk registry has the subsystems row and no contract wording or prototype numbers in it', async () => {
    const row = require('./rows/subsystems');
    assert.equal(row.id, 'subsystems');
    assert.ok(require('./deploy-walk').REGISTRY.includes(row), 'the walk runs the subsystems row');
    const checks = await runSubsystems({ comparison: goodCells, herbs: goodHerbs });
    const text = [row.id, row.title, row.note || '', ...checks.flatMap((c) => [c.id, c.title, c.detail])].join(' ');
    assert.doesNotMatch(text, /ต้นแบบ|สัญญา|บพข|USSD|\bp[0-9]-|\ba5\b/i);
    assert.equal(fs.existsSync(path.join(WALK, 'rows', 'prototypes.js')), false);
    assert.doesNotMatch(fs.readFileSync(path.join(WALK, 'deploy-walk.js'), 'utf8'), /'prototypes'/);
});

test('a config ssh host that starts with a dash reaches ssh as the host, never as an option', () => {
    const docker = ['docker', 'exec', '-i', 'c', 'node'];
    const argv = containerArgv({ ssh: '-oProxyCommand=touch /tmp/pwned' }, docker);
    const end = argv.indexOf('--');
    assert.ok(end > 0, 'ssh argv has an end-of-options marker');
    assert.equal(argv[end + 1], '-oProxyCommand=touch /tmp/pwned');
    assert.ok(argv.slice(0, end).every((a) => !a.includes('ProxyCommand')), 'host is not among the ssh options');
    assert.deepEqual(containerArgv({ ssh: null }, docker), docker);
});

test('playwright is found through the checkout the walker runs from, whoever the user is', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'walk-pw-'));
    const pkg = path.join(repo, 'node_modules/.pnpm/playwright@1.2.3/node_modules/playwright');
    fs.mkdirSync(pkg, { recursive: true });
    fs.writeFileSync(path.join(pkg, 'index.js'), "module.exports = { from: 'this-checkout' };");
    assert.equal(loadPlaywright(repo).from, 'this-checkout');
});

const noAccountCtx = (accounts) => {
    const { createContext } = require('./lib/context');
    const ctx = createContext({ base: 'https://demo.gacpth.com', targetName: 'demo', cfg: { accounts }, outDir: os.tmpdir(), log: () => {} });
    ctx.driver = async () => { throw new Error('driver started without an account'); };
    return ctx;
};

test('an account that is not configured or whose file is missing is no account, not a crash', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'walk-acct-'));
    const gone = path.join(dir, 'missing.env');
    assert.equal(accountCredentials({ accounts: {} }, 'applicant'), null);
    assert.equal(accountCredentials({}, 'applicant'), null);
    assert.equal(accountCredentials({ accounts: { applicant: { envFile: gone } } }, 'applicant'), null);
    assert.equal(accountCredentials({ accounts: { approver: { providerId: 'p', passwordFile: gone } } }, 'approver'), null);
    const env = path.join(dir, 'a.env');
    fs.writeFileSync(env, 'WALK_NID=1\nWALK_PW=pw\n');
    assert.equal(accountCredentials({ accounts: { applicant: { envFile: env } } }, 'applicant').identifier, '1');
    assert.throws(() => accountCredentials({ accounts: 5 }, 'applicant'), /accounts/);
});

test('a check that needs an account the walk does not have is NOT-YET and names the role', async () => {
    const { check } = require('./lib/context');
    const ctx = noAccountCtx({ applicant: { envFile: path.join(os.tmpdir(), 'no-such-walk.env') } });
    const c = await check('x', 'needs applicant', async () => { const s = await ctx.signIn('applicant'); return s.ok ? ctx.pass('in') : ctx.fail(s.reason); });
    assert.equal(c.status, STATUS.NOT_YET);
    assert.match(c.detail, /applicant/);
    const finance = await check('y', 'needs finplat', async () => { await ctx.signIn('finplat'); return ctx.pass('in'); });
    assert.equal(finance.status, STATUS.NOT_YET);
    assert.match(finance.detail, /finplat/);
});

test('with no walk accounts the accounts row reports NOT-YET, never PASS or FAIL', async () => {
    const checks = await require('./rows/accounts').run(noAccountCtx({}));
    assert.ok(checks.length >= 4);
    for (const c of checks) { assert.equal(c.status, STATUS.NOT_YET, `${c.id}: ${c.status} ${c.detail}`); }
    assert.match(checks.find((c) => c.id === 'staff-2fa').detail, /dispatcher/);
});

test('a row that signs in outside a check is NOT-YET when its account is missing', async () => {
    const { main } = require('./deploy-walk');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'walk-row-'));
    const cfgFile = path.join(dir, 'c.json');
    fs.writeFileSync(cfgFile, JSON.stringify({ demo: { accounts: {} } }), { mode: 0o600 });
    const savedCfg = process.env.DEPLOY_WALK_CONFIG; process.env.DEPLOY_WALK_CONFIG = cfgFile;
    const savedFetch = global.fetch; global.fetch = async () => ({ json: async () => ({}) });
    const logs = console.log; console.log = () => {};
    const row = { id: 'accounts', title: 't', run: async (ctx) => { await ctx.signIn('applicant'); return []; } };
    const { REGISTRY } = require('./deploy-walk');
    const saved = REGISTRY.find((r) => r.id === 'accounts'); const at = REGISTRY.indexOf(saved);
    REGISTRY[at] = row;
    try {
        const io = { paymentMode: async () => 'TRIAL', stripeKeyClasses: async () => ({ secret: 'test', publishable: 'test' }), createContext: require('./lib/context').createContext };
        const out = path.join(dir, 'o');
        assert.equal(await main(['https://demo.gacpth.com', '--target', 'demo', '--rows', 'accounts', '--out', out], io), 0);
        const res = JSON.parse(fs.readFileSync(path.join(out, 'result.json'), 'utf8'));
        assert.equal(res.rows[0].status, STATUS.NOT_YET);
    } finally {
        REGISTRY[at] = saved; console.log = logs; global.fetch = savedFetch;
        if (savedCfg === undefined) { delete process.env.DEPLOY_WALK_CONFIG; } else { process.env.DEPLOY_WALK_CONFIG = savedCfg; }
    }
});

test('a config malformed in another way is refused with exit 2, not a stack trace', async () => {
    const { main } = require('./deploy-walk');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'walk-bad-'));
    const cfgFile = path.join(dir, 'c.json');
    fs.writeFileSync(cfgFile, JSON.stringify({ demo: { accounts: 5 } }), { mode: 0o600 });
    const savedCfg = process.env.DEPLOY_WALK_CONFIG; process.env.DEPLOY_WALK_CONFIG = cfgFile;
    const logs = console.log; console.log = () => {};
    const savedFetch = global.fetch; global.fetch = async () => { throw new Error('network reached'); };
    const { REGISTRY } = require('./deploy-walk');
    const at = REGISTRY.findIndex((r) => r.id === 'identity'); const saved = REGISTRY[at];
    let ran = 0;
    REGISTRY[at] = { id: 'identity', title: 't', run: async () => { ran += 1; return []; } };
    try {
        const io = { paymentMode: async () => 'TRIAL', stripeKeyClasses: async () => ({ secret: 'test', publishable: 'test' }), createContext: require('./lib/context').createContext };
        assert.equal(await main(['https://demo.gacpth.com', '--target', 'demo', '--rows', 'identity', '--out', path.join(dir, 'o')], io), 2);
        assert.equal(ran, 0);
    } finally {
        REGISTRY[at] = saved; console.log = logs; global.fetch = savedFetch;
        if (savedCfg === undefined) { delete process.env.DEPLOY_WALK_CONFIG; } else { process.env.DEPLOY_WALK_CONFIG = savedCfg; }
    }
});

test('demo refuses the rows that write data, whether picked or left to the default', async () => {
    const { main } = require('./deploy-walk');
    const io = { paymentMode: async () => { throw new Error('preflight reached'); }, stripeKeyClasses: async () => ({}), createContext: () => { throw new Error('walk started'); } };
    const errs = console.error; const said = []; console.error = (m) => said.push(String(m));
    try {
        for (const extra of [['--rows', 'identity,cert-path'], ['--rows', 'tnt'], []]) {
            assert.equal(await main(['https://demo.gacpth.com', '--target', 'demo', ...extra], io), 2, extra.join(' '));
        }
    } finally { console.error = errs; }
    assert.ok(said.every((m) => /ปิดบน demo/.test(m)), said.join('\n'));
});

test('an option given twice is refused, so a later --rows cannot widen an approved command', () => {
    assert.throws(() => parseArgs(['https://demo.gacpth.com', '--rows', 'identity', '--rows', 'cert-path']), /ซ้ำ/);
    assert.throws(() => parseArgs(['https://demo.gacpth.com', '--target', 'demo', '--target', 'demo']), /ซ้ำ/);
});

#!/usr/bin/env node
'use strict';

/**
 * Research dataset checker: K1-K13 of the Track B dataset criteria
 * (~/.claude/orchestrate/gacp/trackB/05-dataset-criteria.md, order 49).
 *
 * Stands up an empty Postgres, migrates it, writes the synthetic sample through
 * the system's own doors (lib/sample.js), boots the backend from this tree and
 * exports through the real HTTP doors with an account for every role, then
 * judges what came back (lib/judges.js). Exit 0 only when every check passes.
 *
 *   node apps/backend/scripts/datasets/check-dataset.js                    # tbd- container
 *   node apps/backend/scripts/datasets/check-dataset.js --database-url URL # an empty database you own
 *       --write-evidence   also write evidence/dataset/<sha>/check.txt (counts, sha256, results; no keys)
 *       --write-sample     also refresh docs/data/sample from this run
 *
 * Needs docker (or --database-url), pnpm install and prisma generate. Run it
 * through ~/work/state/heavy.sh: it migrates a database and boots the backend
 * once per key and per ruling it checks. K14 (the read-only staging run) is
 * not part of this script.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const lab = require('./lib/lab');
const sample = require('./lib/sample');
const { judge, pseudonymiser, readTable, CHECKS } = require('./lib/judges');

const { BACKEND, REPO } = lab;
const SAMPLE_DIR = path.join(REPO, 'docs/data/sample');
const PRELOADS = {
    clock: path.join(__dirname, 'lib/fixed-day-clock.js'),
    ruling: path.join(__dirname, 'lib/sample-ruling.js'),
    sampleKey: path.join(__dirname, 'lib/sample-key.js'),
};
const EXPORT_ACTIONS = ['DATASET_EXPORTED', 'DATASET_DELETION_LIST_EXPORTED', 'DATASET_BUNDLE_EXPORTED'];

function readZip(buffer) {
    const files = new Map();
    let offset = 0;
    while (offset + 4 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
        const method = buffer.readUInt16LE(offset + 8);
        const crc = buffer.readUInt32LE(offset + 14);
        const size = buffer.readUInt32LE(offset + 18);
        const nameLength = buffer.readUInt16LE(offset + 26);
        const extraLength = buffer.readUInt16LE(offset + 28);
        const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
        const start = offset + 30 + nameLength + extraLength;
        const data = Buffer.from(buffer.subarray(start, start + size));
        if (method !== 0 || zlib.crc32(data) !== crc) { throw new Error(`zip entry ${name}: method ${method} or crc mismatch`); }
        files.set(name, data);
        offset = start + size;
    }
    return files;
}

const git = (args) => spawnSync('git', args, { cwd: REPO, encoding: 'utf8' }).stdout.trim();

function regenerateDictionary() {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tbd-dd-')), 'dd.md');
    const script = [
        "process.env.DATABASE_URL = 'postgresql://placeholder:placeholder@localhost:5432/placeholder';",
        'const { generateDataDictionaryMarkdown } = require(process.argv[1]);',
        "require('fs').writeFileSync(process.argv[2], generateDataDictionaryMarkdown(), 'utf8');",
    ].join('\n');
    const r = spawnSync(process.execPath, ['-e', script, path.join(BACKEND, 'services/dataset-export-service.js'), out],
        { cwd: BACKEND, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: os.homedir(), NODE_ENV: 'development' } });
    const text = r.status === 0 ? fs.readFileSync(out, 'utf8') : `regeneration failed: ${(r.stderr || '').slice(-300)}`;
    fs.rmSync(path.dirname(out), { recursive: true, force: true });
    return text;
}

/** SQL written independently of the registry's Prisma where-clauses (K5, K9). */
async function sqlCounts(prisma, orgId) {
    const t = lab.tableOf;
    const one = async (sql, ...params) => Number((await prisma.$queryRawUnsafe(sql, ...params))[0].n);
    const consented = `r."researchConsentAt" IS NOT NULL AND r."researchConsentVersion" = $2 AND r."researchConsentWithdrawnAt" IS NULL`;
    const logs = `FROM "${t('CultivationLog')}" l JOIN "${t('PlantingCycle')}" c ON c.id = l."cycleId" JOIN "${t('Farm')}" f ON f.id = c."farmId" WHERE l."organizationId" = $1`;
    const batches = `FROM "${t('HarvestBatch')}" b JOIN "${t('Farm')}" f ON f.id = b."farmId" LEFT JOIN "${t('PlantingCycle')}" c ON c.id = b."cycleId" WHERE b."organizationId" = $1`;
    return {
        'cultivation-logs': await one(`SELECT count(*) AS n ${logs} AND c."isDeleted" = false AND f."isDeleted" = false`, orgId),
        'harvest-batches': await one(`SELECT count(*) AS n ${batches} AND b."isDeleted" = false AND f."isDeleted" = false AND (c.id IS NULL OR c."isDeleted" = false)`, orgId),
        'trace-scans': await one(`SELECT count(*) AS n FROM "${t('TraceQrScan')}" WHERE "organizationId" = $1`, orgId),
        'survey-responses': await one(`SELECT count(*) AS n FROM "${t('SurveyAnswer')}" a JOIN "${t('SurveyResponse')}" r ON r.id = a."responseId" WHERE a."organizationId" = $1 AND ${consented}`, orgId, sample.ACCEPTED_NOTICE),
        'survey-questions': await one(`SELECT count(*) AS n FROM "${t('SurveyQuestion')}" WHERE "organizationId" = $1`, orgId),
        'cultivation-logs/deleted': await one(`SELECT count(*) AS n ${logs} AND (c."isDeleted" OR f."isDeleted")`, orgId),
        'survey-responses/withdrawn': await one(`SELECT count(*) AS n FROM "${t('SurveyResponse')}" WHERE "organizationId" = $1 AND "researchConsentAt" IS NOT NULL AND "researchConsentWithdrawnAt" IS NOT NULL`, orgId),
        'harvest-batches/deleted': await one(`SELECT count(*) AS n ${batches} AND (b."isDeleted" OR f."isDeleted" OR coalesce(c."isDeleted", false))`, orgId),
    };
}

/** Every identifier and personal value in the database, for K6 and the K7 reverse lookup. */
async function realValues(prisma) {
    const t = lab.tableOf;
    const columns = await prisma.$queryRawUnsafe(`SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name IN ('id', 'uuid') AND data_type IN ('text', 'uuid', 'character varying')`);
    const ids = [];
    for (const { table_name: table, column_name: column } of columns) {
        for (const row of await prisma.$queryRawUnsafe(`SELECT "${column}"::text AS v FROM "${table}" WHERE "${column}" IS NOT NULL`)) { ids.push(row.v); }
    }
    const personal = [
        ['User', ['email', 'phoneNumber', 'firstName', 'lastName', 'canonicalId', 'healthId', 'providerId']],
        ['Farm', ['farmName', 'address']], ['Entity', ['displayName']], ['Organization', ['name', 'code', 'slug']],
        ['PlantingCycle', ['cycleName']], ['HarvestBatch', ['batchNumber', 'qrCode', 'trackingUrl', 'notes']],
        ['TraceQrSecurity', ['qrCode', 'publicUrl']], ['TraceQrScan', ['requestPath', 'requestIp', 'userAgent']],
        ['SurveyResponse', ['respondentMarker']], ['CultivationLog', ['performedBy', 'notes']],
    ];
    const values = [];
    for (const [model, cols] of personal) {
        for (const col of cols) {
            for (const row of await prisma.$queryRawUnsafe(`SELECT "${col}"::text AS v FROM "${t(model)}" WHERE "${col}" IS NOT NULL`)) { values.push(row.v); }
        }
    }
    const batchNumbers = (await prisma.$queryRawUnsafe(`SELECT "batchNumber" AS v FROM "${t('HarvestBatch')}"`)).map((r) => r.v);
    return {
        ids: [...new Set([...ids, ...batchNumbers])],
        realValues: [...new Set([...ids, ...values])].filter((v) => v.length >= 6),
    };
}

async function relations(prisma, orgId) {
    const t = lab.tableOf;
    const q = (sql) => prisma.$queryRawUnsafe(sql, orgId);
    const by = (rows, keyOf, valueOf) => Object.fromEntries(rows.map((r) => [keyOf(r), valueOf(r)]));
    return {
        'cultivation-logs': {
            keyFields: ['id'],
            byRow: by(await q(`SELECT l.id, l."cycleId", c."farmId", l."plotId" FROM "${t('CultivationLog')}" l JOIN "${t('PlantingCycle')}" c ON c.id = l."cycleId"
                JOIN "${t('Farm')}" f ON f.id = c."farmId" WHERE l."organizationId" = $1 AND c."isDeleted" = false AND f."isDeleted" = false`),
                (r) => r.id, (r) => ({ cycleId: r.cycleId, farmId: r.farmId, plotId: r.plotId })),
        },
        'harvest-batches': {
            keyFields: ['id'],
            byRow: by(await q(`SELECT b.id, b."batchNumber", b."cycleId", b."farmId" FROM "${t('HarvestBatch')}" b JOIN "${t('Farm')}" f ON f.id = b."farmId"
                LEFT JOIN "${t('PlantingCycle')}" c ON c.id = b."cycleId" WHERE b."isDeleted" = false AND f."isDeleted" = false AND (c.id IS NULL OR c."isDeleted" = false) AND b."organizationId" = $1`),
                (r) => r.id, (r) => ({ batchNumber: r.batchNumber, cycleId: r.cycleId, farmId: r.farmId })),
        },
        'trace-scans': {
            keyFields: ['id'],
            byRow: by(await q(`SELECT s.id, s."qrSecurityId", q."entityId" FROM "${t('TraceQrScan')}" s JOIN "${t('TraceQrSecurity')}" q ON q.id = s."qrSecurityId" WHERE s."organizationId" = $1`),
                (r) => r.id, (r) => ({ qrSecurityId: r.qrSecurityId, scannedEntityId: r.entityId })),
        },
        'survey-responses': {
            keyFields: ['responseId', 'questionId'],
            byRow: by(await q(`SELECT a."responseId", a."questionId", r."templateId" FROM "${t('SurveyAnswer')}" a JOIN "${t('SurveyResponse')}" r ON r.id = a."responseId"
                WHERE a."organizationId" = $1 AND r."researchConsentAt" IS NOT NULL AND r."researchConsentVersion" = '${sample.ACCEPTED_NOTICE}' AND r."researchConsentWithdrawnAt" IS NULL`),
            (r) => `${r.responseId}|${r.questionId}`, (r) => ({ templateId: r.templateId })),
        },
        'survey-questions': {
            keyFields: ['questionId'],
            byRow: by(await q(`SELECT id, "templateId" FROM "${t('SurveyQuestion')}" WHERE "organizationId" = $1`), (r) => r.id, (r) => ({ templateId: r.templateId })),
        },
    };
}

/**
 * The small-cell rule of order 49 Q5, written here a second time so the judge
 * never trusts the export's code: cells under 5 are blank, then the smallest
 * shown cells (ties by name) until the blank ones, with `blank` people who
 * gave no name, hold 5 or more.
 */
function blankCells(counts, blank = 0) {
    const ascending = Object.entries(counts).sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
    const hidden = new Set(ascending.filter(([, n]) => n < 5).map(([name]) => name));
    let sum = blank + ascending.filter(([name]) => hidden.has(name)).reduce((s, [, n]) => s + n, 0);
    for (const [name, n] of ascending) {
        if (hidden.size === 0 || sum >= 5) { break; }
        if (!hidden.has(name)) { hidden.add(name); sum += n; }
    }
    return hidden;
}

/** Which responses each round must carry, and the region and province each may show (order 49 Q3, Q5). */
function consentPlan(written, key) {
    const inOrgA = sample.FARMERS.filter((f) => f.org === 'A');
    const exportable = (round) => inOrgA.filter((f) => f.consent === 'v3' || (f.consent === 'withdraw' && round === 'A'));
    const rounds = ['A', 'B1', 'B2'];
    const count = (names) => names.reduce((c, n) => ({ ...c, [n]: (c[n] || 0) + 1 }), {});
    const placed = {};
    for (const round of rounds) {
        const people = exportable(round);
        const blankRegions = blankCells(count(people.map((f) => f.region)));
        placed[round] = {};
        for (const f of people) {
            const here = people.filter((g) => g.region === f.region);
            const named = here.filter((g) => g.province);
            const blankProvinces = blankCells(count(named.map((g) => g.province)), here.length - named.length);
            const region = blankRegions.has(f.region) ? null : f.region;
            placed[round][key.of(written.responses[f.key])] = { region, province: region && f.province && !blankProvinces.has(f.province) ? f.province : null };
        }
    }
    return {
        exported: Object.fromEntries(rounds.map((r) => [r, exportable(r).map((f) => written.responses[f.key])])),
        never: inOrgA.filter((f) => f.consent === 'v2' || f.consent === 'none').map((f) => written.responses[f.key]),
        withdrawn: inOrgA.filter((f) => f.consent === 'withdraw').map((f) => written.responses[f.key]),
        placed,
    };
}

const EXPORT_DOOR = /^\/api\/datasets\/(bundle|[^/?]+\/(export|withdrawn|deleted))/;
const sri = (bytes) => `sha256-${crypto.createHash('sha256').update(bytes).digest('base64')}`;
const groupedFingerprint = (key) => pseudonymiser(key).fingerprint.match(/.{1,4}/g).join(':');

/** What the audit row of one export that left must say, recomputed from the bytes received and the key used. */
function auditWanted(urlPath, bytes, key) {
    if (urlPath.startsWith('/api/datasets/bundle')) {
        const files = readZip(bytes);
        const manifest = JSON.parse(files.get('manifest.json').toString('utf8'));
        return {
            format: 'zip', rows: Object.fromEntries(manifest.files.filter((f) => f.rows !== null).map((f) => [f.path, f.rows])),
            sha256: sri(bytes), manifestSha256: sri(files.get('manifest.json')), keyFingerprint: groupedFingerprint(key),
        };
    }
    const format = new URL(urlPath, 'http://checker.invalid').searchParams.get('format') || 'csv';
    return { format, rows: readTable(`x.${format}`, bytes, []).rows.length, sha256: sri(bytes), keyFingerprint: groupedFingerprint(key) };
}

async function collect({ databaseUrl, log = () => {} } = {}) {
    const { DATASET_DOMAINS, DATASET_LISTS } = require(path.join(BACKEND, 'data/datasets/dataset-domains'));
    const { RESEARCH_CONSENT_NOTICE } = require(path.join(BACKEND, 'shared/research-consent-notice'));
    const { PrismaClient, Prisma } = require(path.join(BACKEND, 'node_modules/@prisma/client'));
    const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tbd-dataset-check-'));
    const head = git(['rev-parse', 'HEAD']);
    const keys = {
        sample: sample.SAMPLE_KEY, other: lab.randomSecret('tbd-dataset-key2'), hmac: lab.randomSecret('tbd-hmac'),
        short: crypto.randomBytes(31).toString('hex').slice(0, 31),
    };
    const jwt = lab.jwtSecrets();
    const mint = lab.tokenMinter(jwt);
    const pg = await lab.startPostgres({ databaseUrl });
    const prisma = new PrismaClient({ datasources: { db: { url: pg.url } } });
    const backends = [];
    const boot = async (label, env, preloads = []) => {
        const b = await lab.bootBackend({
            label, logDir, preloads,
            env: {
                DATABASE_URL: pg.url, ...jwt, HMAC_KEY: keys.hmac, SURVEY_RESPONDENT_KEY: lab.randomSecret('tbd-respondent'),
                SIGNING_KEY_DIR: path.join(logDir, 'keys'), RSA_PRIVATE_KEY_PASSPHRASE: lab.randomSecret('tbd-rsa'), GIT_SHA: head, ...env,
            },
        });
        backends.push(b);
        return b;
    };
    const audit = { exports: 0 };
    const doors = [];
    const sent = [];
    const exportResponses = [];
    const apiOf = (b, key) => async (method, urlPath, opts) => {
        const res = await lab.call(b.base, method, urlPath, opts);
        if (EXPORT_DOOR.test(urlPath)) {
            exportResponses.push({ path: urlPath, status: res.status, cacheControl: res.cacheControl });
            if (res.status === 200) { audit.exports += 1; sent.push({ path: urlPath, want: auditWanted(urlPath, res.bytes, key) }); }
        }
        return res;
    };
    const codeOf = (res) => res.json?.error || res.json?.code || null;
    const farmKeys = DATASET_DOMAINS.filter((d) => d.basis === 'FARM_OPERATION').map((d) => d.key);
    const closedFarmDomains = (catalogRes) => (catalogRes.json?.data?.domains || [])
        .filter((d) => farmKeys.includes(d.key) && !d.available && d.unavailableCode === 'DATASET_RESEARCH_BASIS_NOT_IN_FORCE').length;
    try {
        if (databaseUrl) {
            const tables = await prisma.$queryRawUnsafe("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'");
            if (tables[0].n > 0) { throw new Error('--database-url must name an empty database: the checker migrates it and writes its own sample'); }
        }
        log('migrate');
        lab.migrate(pg.url);
        await lab.installFixedIdentity(prisma, { epoch: sample.ROW_EPOCH });
        const stage = await sample.insertStage(prisma);
        const tokens = Object.fromEntries(Object.entries(stage.people).map(([k, u]) => [k, mint(u)]));

        log('seed through doors');
        fs.mkdirSync(path.join(logDir, 'keys'));
        const main = await boot('sample', { DATASET_PSEUDONYM_KEY: keys.sample, DATASET_SAMPLE_CLOCK_START: sample.CLOCK_START }, [PRELOADS.clock, PRELOADS.ruling, PRELOADS.sampleKey]);
        const api = apiOf(main, keys.sample);
        const written = await sample.writeThroughDoors({ api, mint, stage });
        await sample.rewindHistoricalConsents({ prisma, written });

        const exportRound = async (token) => {
            const files = new Map();
            const targets = [...DATASET_DOMAINS.map((d) => [d.key, `/api/datasets/${d.key}/export`]), ...DATASET_LISTS.map((l) => [l.key, `/api/datasets/${l.key}`])];
            for (const [key, door] of targets) {
                for (const format of ['csv', 'jsonl']) {
                    const res = await api('GET', `${door}?format=${format}`, { token });
                    if (res.status === 200) { files.set(`${key.replace('/', '-')}.${format}`, res.bytes); } else { doors.push({ who: 'adminA', path: door, status: res.status, code: codeOf(res), want: { status: 200 } }); }
                }
            }
            return files;
        };
        const bundleOf = async (b, key, token) => {
            const res = await apiOf(b, key)('GET', '/api/datasets/bundle', { token });
            if (res.status !== 200) { throw new Error(`bundle answered ${res.status}`); }
            const files = readZip(res.bytes);
            return { files, manifest: JSON.parse(files.get('manifest.json').toString('utf8')) };
        };

        log('export round A');
        const counts = { A: await sqlCounts(prisma, stage.orgIds.A) };
        const rounds = { A: await exportRound(tokens.adminA) };
        await sample.changeAfterFirstExport({ api, stage, written });
        counts.B1 = await sqlCounts(prisma, stage.orgIds.A);
        counts.B2 = counts.B1;
        log('export rounds B1, B2');
        rounds.B1 = await exportRound(tokens.adminA);
        rounds.B2 = await exportRound(tokens.adminA);
        const bundles = { B1: await bundleOf(main, keys.sample, tokens.adminA), B2: await bundleOf(main, keys.sample, tokens.adminA) };

        log('doors per role');
        const catalog = {};
        for (const who of [...sample.STAFF.map((s) => s.key), 'f1']) { catalog[who] = await api('GET', '/api/datasets', { token: tokens[who] }); }
        const probes = ['/api/datasets/survey-responses/export?format=csv', '/api/datasets/survey-responses/withdrawn?format=csv', '/api/datasets/bundle'];
        for (const s of sample.STAFF.filter((x) => x.role !== 'system_admin_dtam')) {
            for (const door of probes) {
                const res = await api('GET', door, { token: tokens[s.key] });
                doors.push({ who: s.role, path: door, status: res.status, code: codeOf(res), want: { status: 403, code: 'DATASET_EXPORT_FORBIDDEN' } });
            }
        }
        for (const door of probes) {
            const farmer = await api('GET', door, { token: tokens.f1 });
            doors.push({ who: 'health', path: door, status: farmer.status, code: codeOf(farmer), want: { status: 401 } });
            const anonymous = await api('GET', door);
            doors.push({ who: 'ไม่มี token', path: door, status: anonymous.status, code: codeOf(anonymous), want: { status: 401 } });
        }
        // User.organizationId is NOT NULL, so a real account always has an organization: a token
        // minted before the tenant claim existed is resolved from the database, never widened.
        // The NO_ORGANIZATION branch itself is pinned by __tests__/unit/dataset-routes.test.js.
        const legacy = await api('GET', '/api/datasets/survey-responses/export?format=csv', { token: mint(stage.people.adminA, { withOrganization: false }) });
        doors.push({ who: 'ผู้ดูแลที่ token ไม่มีองค์กร', path: 'survey-responses.csv', status: legacy.status, code: codeOf(legacy), bytes: legacy.bytes, want: { status: 200, sameAs: 'survey-responses.csv' } });

        const orgBFiles = new Map();
        for (const d of DATASET_DOMAINS) {
            const res = await api('GET', `/api/datasets/${d.key}/export?format=jsonl`, { token: tokens.adminB });
            if (res.status === 200) { orgBFiles.set(`${d.key}.jsonl`, res.bytes); } else { doors.push({ who: 'adminB', path: d.key, status: res.status, code: codeOf(res), want: { status: 200 } }); }
        }
        const key1 = pseudonymiser(keys.sample);
        const t = lab.tableOf;
        const orgBIds = [];
        for (const model of ['CultivationLog', 'HarvestBatch', 'TraceQrScan', 'SurveyResponse', 'SurveyQuestion']) {
            for (const r of await prisma.$queryRawUnsafe(`SELECT id FROM "${t(model)}" WHERE "organizationId" = $1`, stage.orgIds.B)) { orgBIds.push(key1.of(r.id)); }
        }
        const orgB = { files: orgBFiles, counts: await sqlCounts(prisma, stage.orgIds.B), allowed: new Set(orgBIds) };

        log('exports while no audit row can be written');
        const auditTable = t('AuditLog');
        const unaudited = [];
        await prisma.$executeRawUnsafe(`CREATE FUNCTION tbd_refuse_dataset_audit() RETURNS trigger AS $$
            BEGIN IF NEW.action LIKE 'DATASET_%' THEN RAISE EXCEPTION 'the dataset checker refuses this audit row'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
        await prisma.$executeRawUnsafe(`CREATE TRIGGER tbd_refuse_dataset_audit BEFORE INSERT ON "${auditTable}" FOR EACH ROW EXECUTE FUNCTION tbd_refuse_dataset_audit()`);
        try {
            for (const door of probes) {
                const res = await api('GET', door, { token: tokens.adminA });
                const text = res.bytes.toString('utf8');
                unaudited.push({ path: door, status: res.status, code: codeOf(res), leaked: text.startsWith('\uFEFF') || text.startsWith('PK') || /"responseId"/.test(text) });
            }
        } finally {
            await prisma.$executeRawUnsafe(`DROP TRIGGER tbd_refuse_dataset_audit ON "${auditTable}"`);
            await prisma.$executeRawUnsafe('DROP FUNCTION tbd_refuse_dataset_audit()');
        }
        const truthValues = await realValues(prisma);
        const truth = {
            counts, ...truthValues, planted: sample.PLANTED_IDENTIFIERS, relations: await relations(prisma, stage.orgIds.A),
            consent: consentPlan(written, key1),
            deleted: {
                'harvest-batches': sample.FARMERS.filter((f) => f.deleteFarm).flatMap((f) => written.batches[f.key]),
                'cultivation-logs': (await prisma.$queryRawUnsafe(`SELECT id FROM "${t('CultivationLog')}" WHERE "cycleId" = ANY($1)`,
                    sample.FARMERS.filter((f) => f.deleteFarm).map((f) => stage.farms[f.key].cycleId))).map((r) => r.id),
            },
        };
        await main.stop();

        log('second key, then keys every export refuses');
        const second = await boot('other-key', { DATASET_PSEUDONYM_KEY: keys.other });
        const dictionaryDoor = (await apiOf(second, keys.other)('GET', '/api/datasets/dictionary', { token: tokens.reviewerA })).bytes.toString('utf8');
        const otherKey = {
            files: new Map([['survey-responses.jsonl', (await apiOf(second, keys.other)('GET', '/api/datasets/survey-responses/export?format=jsonl', { token: tokens.adminA })).bytes]]),
            ...(await bundleOf(second, keys.other, tokens.adminA)),
        };
        await second.stop();
        const keyDoors = [];
        const refusedKeys = [
            ['no-key', 'ไม่มีกุญแจ', {}, 'DATASET_PSEUDONYM_KEY_UNAVAILABLE'],
            ['hmac-key', 'กุญแจซ้ำ HMAC_KEY', { DATASET_PSEUDONYM_KEY: keys.hmac }, 'DATASET_PSEUDONYM_KEY_REUSES_HMAC_KEY'],
            ['sample-key', 'กุญแจชุดตัวอย่างที่เปิดเผย', { DATASET_PSEUDONYM_KEY: keys.sample }, 'DATASET_PSEUDONYM_KEY_PUBLIC'],
            ['short-key', 'กุญแจสั้นกว่า 32 ไบต์', { DATASET_PSEUDONYM_KEY: keys.short }, 'DATASET_PSEUDONYM_KEY_TOO_SHORT'],
        ];
        for (const [name, label, env, want] of refusedKeys) {
            const b = await boot(name, env);
            const refusedApi = apiOf(b, env.DATASET_PSEUDONYM_KEY || 'no key was set');
            for (const door of probes) {
                const res = await refusedApi('GET', door, { token: tokens.adminA });
                keyDoors.push({ label, path: door, status: res.status, code: codeOf(res), want });
            }
            if (label === 'ไม่มีกุญแจ') {
                const farm = await refusedApi('GET', '/api/datasets/cultivation-logs/export?format=csv', { token: tokens.adminA });
                doors.push({ who: 'adminA ไม่มีมติฐานการใช้ข้อมูล', path: 'cultivation-logs', status: farm.status, code: codeOf(farm), want: { status: 403, code: 'DATASET_RESEARCH_BASIS_NOT_IN_FORCE' } });
                const listed = await refusedApi('GET', '/api/datasets', { token: tokens.adminA });
                doors.push({ who: 'แคตตาล็อกไม่มีมติ', path: 'โดเมนข้อมูลฟาร์มปิด', status: closedFarmDomains(listed), want: { status: farmKeys.length } });
            }
            await b.stop();
        }

        // order 56(4.3): a ruling in force by date but with no research ethics approval on file opens nothing
        log('farm ruling without a research ethics approval');
        const unapproved = await boot('ruling-without-ethics-approval',
            { DATASET_PSEUDONYM_KEY: keys.other, DATASET_SAMPLE_RULING: 'without-ethics-approval' }, [PRELOADS.ruling]);
        const unapprovedApi = apiOf(unapproved, keys.other);
        const UNAPPROVED = 'มติไม่มีหนังสืออนุมัติจริยธรรม';
        for (const key of farmKeys) {
            const res = await unapprovedApi('GET', `/api/datasets/${key}/export?format=csv`, { token: tokens.adminA });
            doors.push({ who: UNAPPROVED, path: key, status: res.status, code: codeOf(res), want: { status: 403, code: 'DATASET_RESEARCH_BASIS_NOT_IN_FORCE' } });
        }
        const unapprovedCatalog = await unapprovedApi('GET', '/api/datasets', { token: tokens.adminA });
        doors.push({ who: UNAPPROVED, path: 'แคตตาล็อก: โดเมนข้อมูลฟาร์มปิด', status: closedFarmDomains(unapprovedCatalog), want: { status: farmKeys.length } });
        const unapprovedBundle = await bundleOf(unapproved, keys.other, tokens.adminA);
        const notExported = unapprovedBundle.manifest.notExported.filter((x) => farmKeys.includes(x.key) && x.code === 'DATASET_RESEARCH_BASIS_NOT_IN_FORCE').length;
        doors.push({ who: UNAPPROVED, path: 'ชุดเต็ม: โดเมนข้อมูลฟาร์มใน notExported', status: notExported, want: { status: farmKeys.length } });
        const farmFiles = [...unapprovedBundle.files.keys()].filter((name) => farmKeys.some((key) => name.startsWith(`${key}.`))).length;
        doors.push({ who: UNAPPROVED, path: 'ชุดเต็ม: ไฟล์ข้อมูลฟาร์มใน ZIP', status: farmFiles, want: { status: 0 } });
        // the refusals above count only if this backend holds the dated ruling: with no ruling loaded they would pass for the wrong reason
        const loaded = unapprovedBundle.manifest.researchBasis?.FARM_OPERATION || {};
        doors.push({ who: UNAPPROVED, path: 'manifest: มติที่ถึงวันมีผลแต่ไม่มีหนังสืออนุมัติ', status: loaded.effectiveFrom === '2026-01-01' && loaded.ethicsApproval === null ? 1 : 0, want: { status: 1 } });
        await unapproved.stop();
        audit.list = (await prisma.$queryRawUnsafe(`SELECT metadata FROM "${t('AuditLog')}" WHERE action = ANY($1)`, EXPORT_ACTIONS))
            .map((r) => ({ metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata }));
        audit.rows = audit.list.length;

        const read = (rel) => (fs.existsSync(path.join(REPO, rel)) ? fs.readFileSync(path.join(REPO, rel), 'utf8') : '');
        const dictionary = read('docs/data/data-dictionary.md');
        const committedSample = new Map();
        if (fs.existsSync(SAMPLE_DIR)) {
            for (const name of fs.readdirSync(SAMPLE_DIR).filter((n) => n !== 'README.md')) { committedSample.set(name, fs.readFileSync(path.join(SAMPLE_DIR, name))); }
        }
        return {
            head, logDir, keys, registry: { domains: DATASET_DOMAINS, lists: DATASET_LISTS },
            models: new Map(Prisma.dmmf.datamodel.models.map((m) => [m.name, m])),
            catalog: Object.fromEntries(Object.entries(catalog).map(([k, v]) => [k, { status: v.status, json: v.json }])),
            rounds, bundles, otherKey, orgB, doors, keyDoors, audit, truth, committedSample, sent, unaudited, exportResponses,
            extraFiles: { 'กุญแจที่สอง': otherKey.files, 'ผู้ดูแลองค์กร B': orgBFiles },
            logs: backends.map((b) => ({ label: path.basename(b.logPath), text: fs.readFileSync(b.logPath, 'utf8') })),
            texts: {
                dictionary, dictionaryDoor, dictionaryRegenerated: regenerateDictionary(), readme: read('docs/data/README.md'),
                recipientSurfaces: {
                    'docs/data/data-dictionary.md': dictionary,
                    'docs/data/README.md': read('docs/data/README.md'),
                    'docs/data/privacy-notice-research-use-draft.md': read('docs/data/privacy-notice-research-use-draft.md'),
                    'apps/web-app/src/app/provider/datasets/page.tsx': read('apps/web-app/src/app/provider/datasets/page.tsx'),
                    'ข้อความยินยอม research-survey-notice-th-v3': JSON.stringify(RESEARCH_CONSENT_NOTICE),
                },
            },
            report: '',
        };
    } finally {
        for (const b of backends) { await b.stop().catch(() => {}); }
        await prisma.$disconnect().catch(() => {});
        await pg.stop();
        fs.rmSync(path.join(logDir, 'keys'), { recursive: true, force: true });
    }
}

function format(results) {
    const lines = [];
    for (const r of results) {
        lines.push(`${r.problems.length ? 'FAIL' : 'PASS'} ${r.id} ${r.title}`);
        for (const p of r.problems.slice(0, 40)) { lines.push(`     - ${p}`); }
        if (r.problems.length > 40) { lines.push(`     - และอีก ${r.problems.length - 40} ข้อ`); }
    }
    return lines;
}

/** Counts and hashes of the synthetic run: no key, no real data. */
function summary(obs) {
    const lines = ['', '## จำนวนแถว (SQL ของรอบ A → รอบ B)'];
    for (const key of Object.keys(obs.truth.counts.A)) { lines.push(`- ${key}: ${obs.truth.counts.A[key]} → ${obs.truth.counts.B2[key]}`); }
    lines.push('', '## sha256 ของชุดเต็มรอบ B2 (ชุดตัวอย่างสังเคราะห์)');
    for (const f of obs.bundles.B2.manifest.files) { lines.push(`- ${f.path}: ${f.rows ?? '-'} แถว · ${f.sha256}`); }
    lines.push(`- ลายนิ้วมือกุญแจตัวอย่าง: ${obs.bundles.B2.manifest.pseudonymKeyFingerprint}`);
    return lines;
}

function finish(obs, results, extra = []) {
    const lines = [`# check-dataset K1-K13 · HEAD ${obs.head}`, ...format(results), ...extra];
    const pass = results.every((r) => r.problems.length === 0);
    lines.push(pass ? 'RESULT: PASS' : 'RESULT: FAIL');
    const text = lines.join('\n');
    const leaks = CHECKS.find((c) => c.id === 'K12').run({ ...obs, report: text });
    if (leaks.some((p) => p.startsWith('ผลตรวจ'))) { return { pass: false, text: 'RESULT: FAIL (ผลตรวจมีค่ากุญแจ จึงไม่พิมพ์)' }; }
    return { pass, text };
}

async function main() {
    const args = process.argv.slice(2);
    const at = args.indexOf('--database-url');
    const databaseUrl = at >= 0 ? args[at + 1] : undefined;
    const obs = await collect({ databaseUrl, log: (step) => process.stderr.write(`[check-dataset] ${step}\n`) });
    if (args.includes('--write-sample')) { obs.committedSample = new Map(); }
    const results = judge(obs);
    const { pass, text } = finish(obs, results, summary(obs));
    console.log(text);
    if (args.includes('--write-evidence')) {
        const dir = path.join(REPO, 'evidence/dataset', obs.head.slice(0, 9));
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'check.txt'), `${text}\n`, 'utf8');
    }
    if (args.includes('--write-sample') && pass) {
        fs.mkdirSync(SAMPLE_DIR, { recursive: true });
        for (const [name, data] of obs.bundles.B2.files) { fs.writeFileSync(path.join(SAMPLE_DIR, name), data); }
    }
    process.exit(pass ? 0 : 1);
}

if (require.main === module) {
    main().catch((err) => { console.error(`[check-dataset] ${err.message}`); process.exit(2); });
}

module.exports = { collect, finish, summary, readZip };

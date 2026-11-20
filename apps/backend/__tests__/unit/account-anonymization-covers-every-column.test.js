/**
 * Privacy notice v1.4 §7 item 1 promises that account data stops identifying the person, both
 * when the retention sweep reaches the account and when an erasure request is confirmed.
 *
 * This runs the real sweep (jobs/pdpa-retention-job.js) and the real erasure door
 * (services/pdpa-erasure-service.js executeErasure) against an in-memory client that records
 * every write, then reads the Prisma schema: each column of User and of Entity must be written
 * on the account's own row and its personal INDIVIDUAL entity by BOTH paths, or be listed in
 * test-support/account-columns-kept.js with the reason it may stay. A column added to either
 * model fails here until someone decides what anonymization does with it.
 */

const fs = require('fs');
const path = require('path');

const USER_ID = 'acct-user-1';
const ENTITY_ID = 'acct-entity-1';

const mockWrites = [];
let mockCandidateServed = false;

function fakeUserRow() {
    return {
        id: USER_ID,
        canonicalId: '0000000000000',
        organizationId: 'org-1',
        healthId: '0000000000000',
        providerId: null,
        role: 'health',
        retainUntil: new Date('2001-01-01T00:00:00.000Z'),
        legalHold: false,
        isDeleted: false,
        isAnonymized: false,
        privacySettings: null,
    };
}

function modelStub(model) {
    return new Proxy({}, {
        get: (_target, op) => async (args = {}) => {
            if (['update', 'updateMany', 'upsert', 'create', 'delete', 'deleteMany'].includes(op)) {
                mockWrites.push({ model, op, args });
            }
            if (model === 'user' && op === 'findMany') {
                if (mockCandidateServed) {return [];}
                mockCandidateServed = true;
                return [fakeUserRow()];
            }
            if (model === 'user' && (op === 'findUnique' || op === 'findFirst')) {return fakeUserRow();}
            if (model === 'user' && op === 'updateMany') {return { count: 1 };}
            if (model === 'entityMembership' && op === 'findMany') {return [{ entityId: ENTITY_ID }];}
            if (op === 'findMany' || op === 'groupBy') {return [];}
            if (op === 'count') {return 0;}
            if (op === 'updateMany' || op === 'deleteMany') {return { count: 0 };}
            if (op === 'findUnique' || op === 'findFirst') {return null;}
            return {};
        },
    });
}

const mockClient = new Proxy({}, {
    get: (_target, key) => {
        if (key === '$transaction') {
            return async (arg) => (typeof arg === 'function' ? arg(mockClient) : Promise.all(arg));
        }
        if (key === '$executeRaw' || key === '$executeRawUnsafe' || key === '$queryRaw' || key === '$queryRawUnsafe') {
            return async () => [];
        }
        if (key === 'then') {return undefined;}
        return modelStub(key);
    },
});

jest.mock('../../services/prisma-database', () => ({ prisma: mockClient }));

const { runPdpaRetentionSweep } = require('../../jobs/pdpa-retention-job');
const { executeErasure } = require('../../services/pdpa-erasure-service');
const { KEPT_USER_COLUMNS, KEPT_ENTITY_COLUMNS } = require('../../test-support/account-columns-kept');

const SCHEMA_DIR = path.join(__dirname, '..', '..', 'prisma', 'schema');

/** Scalar and enum columns of one model, read from prisma/schema/*.prisma (relations excluded). */
function columnsOf(modelName) {
    const texts = fs.readdirSync(SCHEMA_DIR).filter((f) => f.endsWith('.prisma'))
        .map((f) => fs.readFileSync(path.join(SCHEMA_DIR, f), 'utf8'));
    const models = new Set(texts.flatMap((t) => [...t.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1])));
    for (const text of texts) {
        const block = text.match(new RegExp(`^model\\s+${modelName}\\s*\\{([\\s\\S]*?)^\\}`, 'm'));
        if (!block) {continue;}
        return block[1].split('\n')
            .map((line) => line.trim().match(/^(\w+)\s+(\w+)(\[\])?/))
            .filter((m) => m && !models.has(m[2]) && !m[3])
            .map((m) => m[1]);
    }
    throw new Error(`model ${modelName} not found under ${SCHEMA_DIR}`);
}

function writtenColumns(model, id) {
    const cols = new Set();
    for (const w of mockWrites) {
        if (w.model !== model || !['update', 'updateMany'].includes(w.op)) {continue;}
        if (w.args.where && w.args.where.id === id) {Object.keys(w.args.data || {}).forEach((c) => cols.add(c));}
    }
    return cols;
}

function undecided(model, kept, id) {
    const written = writtenColumns(model, id);
    return columnsOf(model === 'user' ? 'User' : 'Entity').filter((c) => !written.has(c) && !(c in kept));
}

function reset() {
    mockWrites.length = 0;
    mockCandidateServed = false;
}

describe('account anonymization decides every column of User and the personal Entity (§7 item 1)', () => {
    test('the kept lists name only columns that exist', () => {
        const userCols = columnsOf('User');
        const entityCols = columnsOf('Entity');
        expect(Object.keys(KEPT_USER_COLUMNS).filter((c) => !userCols.includes(c))).toEqual([]);
        expect(Object.keys(KEPT_ENTITY_COLUMNS).filter((c) => !entityCols.includes(c))).toEqual([]);
    });

    test('the retention sweep writes every User column that is not on the kept list', async () => {
        reset();
        await runPdpaRetentionSweep();
        expect(undecided('user', KEPT_USER_COLUMNS, USER_ID)).toEqual([]);
    });

    test('the retention sweep writes every column of the personal entity that is not on the kept list', async () => {
        reset();
        await runPdpaRetentionSweep();
        expect(undecided('entity', KEPT_ENTITY_COLUMNS, ENTITY_ID)).toEqual([]);
    });

    test('the confirmed erasure writes every User column that is not on the kept list', async () => {
        reset();
        await executeErasure({ userId: USER_ID, actorId: USER_ID, actorRole: 'health' });
        expect(undecided('user', KEPT_USER_COLUMNS, USER_ID)).toEqual([]);
    });

    test('the confirmed erasure writes every column of the personal entity that is not on the kept list', async () => {
        reset();
        await executeErasure({ userId: USER_ID, actorId: USER_ID, actorRole: 'health' });
        expect(undecided('entity', KEPT_ENTITY_COLUMNS, ENTITY_ID)).toEqual([]);
    });
});

'use strict';

/**
 * Dataset Export Service — registry guards and the pure publishing rules.
 * What leaves the database is proven on real Postgres in
 * __tests__/integration/research-dataset-export-real-postgres.test.js; this
 * file pins the registry so a column, a key or a consent version cannot slip
 * through unnoticed.
 */

jest.mock('../../shared/logger', () => {
    const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { ...l, createLogger: jest.fn(() => l) };
});

const mockFindMany = jest.fn();
jest.mock('../../services/prisma-database', () => ({
    prisma: new Proxy({}, { get: (target, prop) => (typeof prop === 'string' ? { findMany: (...a) => mockFindMany(...a) } : undefined) }),
}));

const datasetService = require('../../services/dataset-export-service');
const {
    DATASET_DOMAINS, DATASET_LISTS, PUBLISH, RESEARCH_BASIS, ACCEPTED_RESEARCH_CONSENT_VERSIONS,
} = require('../../data/datasets/dataset-domains');
const { RESEARCH_USE_BASES } = require('../../data/datasets/research-use-bases');
const { RESEARCH_CONSENT_NOTICE } = require('../../shared/research-consent-notice');

const { Prisma } = require('@prisma/client');
const MODELS = new Map(Prisma.dmmf.datamodel.models.map(m => [m.name, m]));

beforeEach(() => { mockFindMany.mockReset(); });

describe('dataset registry', () => {
    test('exports only domains the system writes (order 49 Q1b: care-logs and drying-* have no write path)', () => {
        expect(DATASET_DOMAINS.map(d => d.key)).toEqual([
            'cultivation-logs', 'harvest-batches', 'trace-scans', 'survey-responses', 'survey-questions',
        ]);
        expect(DATASET_LISTS.map(l => l.key)).toEqual(['cultivation-logs/deleted', 'harvest-batches/deleted', 'survey-responses/withdrawn']);
    });

    test('farm-operation domains are gated, and no research-use ruling is in force in the code (order 49 Q2)', () => {
        expect(DATASET_DOMAINS.filter(d => d.basis === RESEARCH_BASIS.FARM_OPERATION).map(d => d.key))
            .toEqual(['cultivation-logs', 'harvest-batches', 'trace-scans']);
        expect(RESEARCH_USE_BASES.FARM_OPERATION).toEqual([]);
        expect(datasetService.researchBasisAt(RESEARCH_BASIS.FARM_OPERATION).inForce).toBe(false);
    });

    test('no farm-operation ruling comes into force while a cultivation log can vanish without a trace (K15/K16 T6)', () => {
        // DELETE /api/cultivation-logs/:id removes the row outright: once logs leave for the research
        // data store, such a delete stops the export but never reaches cultivation-logs/deleted.
        // A trace is all three: the columns, the soft-delete extension, and no hard delete left in the app.
        const fs = require('fs');
        const path = require('path');
        const everInForce = RESEARCH_USE_BASES.FARM_OPERATION.some(entry => entry.inForce === true);
        const logColumns = MODELS.get('CultivationLog').fields.map(f => f.name);
        const { SOFT_DELETE_MODELS } = require('../../services/soft-delete-extension');
        const appSources = ['routes', 'services'].flatMap(function walk(dir) {
            const abs = path.join(__dirname, '../..', dir);
            return fs.readdirSync(abs, { withFileTypes: true }).flatMap(e => (e.isDirectory()
                ? walk(path.join(dir, e.name))
                : e.name.endsWith('.js') ? [fs.readFileSync(path.join(abs, e.name), 'utf8')] : []));
        });
        const hardDeletes = appSources.filter(src => /cultivationLog\.delete(Many)?\(/.test(src)).length;
        const leavesATrace = logColumns.includes('isDeleted') && logColumns.includes('deletedAt')
            && SOFT_DELETE_MODELS.has('CultivationLog') && hardDeletes === 0;
        expect({ farmRulingInForce: everInForce, cultivationLogDeletionLeavesATrace: leavesATrace })
            .not.toEqual({ farmRulingInForce: true, cultivationLogDeletionLeavesATrace: false });
    });

    test('the live survey notice version is an accepted consent version, and only v3 is (order 49 Q3)', () => {
        expect(ACCEPTED_RESEARCH_CONSENT_VERSIONS).toEqual(['research-survey-notice-th-v3']);
        expect(ACCEPTED_RESEARCH_CONSENT_VERSIONS).toContain(RESEARCH_CONSENT_NOTICE.version);
    });

    test('every field path exists on its Prisma model, through relations', () => {
        const missing = [];
        for (const domain of DATASET_DOMAINS) {
            for (const field of domain.fields) {
                let model = MODELS.get(domain.model);
                const path = (field.from || field.field).split('.');
                path.forEach((part, i) => {
                    const column = model && model.fields.find(f => f.name === part);
                    if (!column) { missing.push(`${domain.key}.${field.field} (${part})`); model = null; return; }
                    if (i < path.length - 1) { model = MODELS.get(column.type); }
                });
            }
        }
        expect(missing).toEqual([]);
    });

    test('every column of every source model is exported or withheld with a reason, and every withheld column exists (K4)', () => {
        const undecided = [];
        for (const domain of DATASET_DOMAINS) {
            const decided = new Set(domain.withheld.filter(w => w.reason).map(w => w.column));
            for (const field of domain.fields) {
                const path = (field.from || field.field).split('.');
                let model = MODELS.get(domain.model);
                for (const part of path.slice(0, -1)) { model = MODELS.get(model.fields.find(f => f.name === part).type); }
                decided.add(`${model.name}.${path[path.length - 1]}`);
            }
            for (const name of domain.sourceModels || [domain.model]) {
                for (const column of MODELS.get(name).fields.filter(f => f.kind !== 'object')) {
                    if (!decided.has(`${name}.${column.name}`)) { undecided.push(`${domain.key}: ${name}.${column.name}`); }
                }
            }
            for (const { column } of domain.withheld) {
                const [name, columnName] = column.split('.');
                if (!MODELS.get(name)?.fields.some(f => f.name === columnName && f.kind !== 'object')) { undecided.push(`${domain.key}: withheld ${column} is not a column`); }
            }
        }
        expect(undecided).toEqual([]);
    });

    test('PII columns are never exported', () => {
        const banned = new Set(['requestIp', 'userAgent', 'notes', 'qcNotes', 'recordedBy', 'performedBy', 'createdBy', 'qcBy', 'photoUrl', 'respondentUserId', 'respondentMarker', 'qrCode', 'trackingUrl']);
        for (const domain of DATASET_DOMAINS) {
            for (const field of domain.fields) {
                expect({ domain: domain.key, field: field.field, banned: banned.has((field.from || field.field).split('.').pop()) })
                    .toEqual({ domain: domain.key, field: field.field, banned: false });
            }
        }
    });

    test('every identifier field leaves as a pseudonym, no exceptions', () => {
        const unmarked = DATASET_DOMAINS.flatMap(domain => domain.fields
            .filter(f => /(^id$|Id$|^batchNumber$)/.test(f.field) && f.publish !== PUBLISH.PSEUDONYM)
            .map(f => `${domain.key}.${f.field}`));
        expect(unmarked).toEqual([]);
    });

    test('every string column is published as free text, a closed set, a template or a pseudonym', () => {
        const loose = [];
        for (const domain of DATASET_DOMAINS) {
            for (const field of domain.fields) {
                const path = (field.from || field.field).split('.');
                let model = MODELS.get(domain.model);
                for (const part of path.slice(0, -1)) { model = MODELS.get(model.fields.find(f => f.name === part).type); }
                const column = model.fields.find(f => f.name === path[path.length - 1]);
                if (column.type === 'String' && !field.publish && !field.values) {
                    loose.push(`${domain.key}.${field.field}`);
                }
            }
        }
        // plantCode is a foreign key into the species register; scannedEntityType is set by the system
        expect(loose).toEqual(['harvest-batches.plantCode', 'trace-scans.scannedEntityType']);
    });
});

describe('redactFreeText (order 49 Q5)', () => {
    test.each([
        ['โทร 081-234-5678 นะ', 'โทร [เบอร์โทร] นะ'],
        ['โทร 0812345678', 'โทร [เบอร์โทร]'],
        ['+66 81 234 5678', '[เบอร์โทร]'],
        ['บ้าน 02-123-4567', 'บ้าน [เบอร์โทร]'],
        ['อีเมล a.b+c@example.co.th ครับ', 'อีเมล [อีเมล] ครับ'],
        ['แทนคุณ 1100000000008', 'แทนคุณ 1-XXXX-XXXX-X-0008'],
        ['อ้างอิง 0b0c2f7e-0000-4000-8000-000000000001', 'อ้างอิง [รหัส]'],
        ['ปุ๋ยสูตร 15-15-15 จำนวน 50 กก.', 'ปุ๋ยสูตร 15-15-15 จำนวน 50 กก.'],
        ['ราคา 1200000 บาท ปี 2569', 'ราคา 1200000 บาท ปี 2569'],
        // Thai formats (K15/K16 M2): brackets, dot and slash separators, 66 without +, Thai digits
        ['โทร (081) 234-5678 นะ', 'โทร [เบอร์โทร] นะ'],
        ['สำนักงาน (02) 123-4567', 'สำนักงาน [เบอร์โทร]'],
        ['081.234.5678', '[เบอร์โทร]'],
        ['081/234/5678', '[เบอร์โทร]'],
        ['66812345678', '[เบอร์โทร]'],
        ['+66 (0) 81 234 5678', '[เบอร์โทร]'],
        ['โทร ๐๘๑-๒๓๔-๕๖๗๘', 'โทร [เบอร์โทร]'],
        ['บัตร ๑๑๐๐๐๐๐๐๐๐๐๐๘', 'บัตร 1-XXXX-XXXX-X-0008'],
        // two phones in a row read as one 13-digit ID: masked as an ID, the digits after it swept
        ['081-234-5678 089-999-0000', '0-XXXX-XXXX-X-8089[ตัวเลข]'],
        // K16 review F1: an ID written in groups, then a phone: the ID is masked whole, then the phone
        ['เลขบัตร 3-1150-77156-09-3 081-234-5678', 'เลขบัตร 3-XXXX-XXXX-X-6093 [เบอร์โทร]'],
        ['บัตร ๓-๑๑๕๐-๗๗๑๕๖-๐๙-๓ ๐๘๑-๒๓๔-๕๖๗๘', 'บัตร 3-XXXX-XXXX-X-6093 [เบอร์โทร]'],
        // K16 review F2: several separators, en dash, comma, (+66), and a swept tail with spaced separators
        ['โทร 081 - 234 - 5678', 'โทร [เบอร์โทร]'],
        ['โทร 081  234  5678', 'โทร [เบอร์โทร]'],
        ['โทร 081–234–5678', 'โทร [เบอร์โทร]'],
        ['โทร 081,234,5678', 'โทร [เบอร์โทร]'],
        ['โทร (+66) 81-234-5678', 'โทร [เบอร์โทร]'],
        ['โทร 0-XXXX-XXXX-X-8089 - 999 - 0000', 'โทร 0-XXXX-XXXX-X-8089[ตัวเลข]'],
        // K16 re-check R2: a mobile then a landline read as one 13-digit ID from the middle; the head of the first is swept too
        ['โทร 081-234-5678 / 02-123-4567', 'โทร [ตัวเลข]5-XXXX-XXXX-X-4567'],
        // K16 re-check R1: a phone must not start inside a masked ID
        ['บัตร 1100000000008 081-234-5678', 'บัตร 1-XXXX-XXXX-X-0008 [เบอร์โทร]'],
        // K16 re-check, less common shapes
        ['โทร +66 (81) 234-5678', 'โทร [เบอร์โทร]'],
        ['โทร 0 81 234 5678', 'โทร [เบอร์โทร]'],
        // K16 second re-check R3: only a masked national ID blocks a phone after "X-", not any word ending in X
        ['FAX-02-123-4567', 'FAX-[เบอร์โทร]'],
        ['FAX-0812345678', 'FAX-[เบอร์โทร]'],
        // R2b: a phone must not take the first digit of a masked ID, nor end on a lone digit
        ['(07) 1622584 / 0655724928 / 098 4823789', '[เบอร์โทร] / 0-XXXX-XXXX-X-8098[ตัวเลข]'],
        ['079663506  0 95 7202805', '[เบอร์โทร]  [เบอร์โทร]'],
        ['ใช้ 0.5 1.5 2.5 3.5 4.5 ลิตร', 'ใช้ 0.5 1.5 2.5 3.5 4.5 ลิตร'],
        // K16 third re-check R2c: three mobiles in a row; the phone pattern reads the rest of the run off the window
        ['0974332190  087 0929995 - 066 4243013', '0-XXXX-XXXX-X-0087 [เบอร์โทร][ตัวเลข]'],
        // masked at write time and again here: two masked IDs share a digit, the rest of the run is still swept
        ['หมู่ 5-XXXX-XXXX-X-8290-XXXX-XXXX-X-3088.715.0424', 'หมู่ 5-XXXX-XXXX-X-8290-XXXX-XXXX-X-3088[ตัวเลข]'],
        // R2d: masked twice so the first masked ID keeps one tail digit; it still anchors the sweep
        ['Tel: +66 (0) 80 187 1-XXXX-XXXX-X-9749 070889038', 'Tel: +66 (0) [ตัวเลข]1-XXXX-XXXX-X-9-XXXX-XXXX-X-9038'],
        // the same two phones as a survey answer stores them: the write path's ID mask took 13 digits across both
        ['โทร 0-XXXX-XXXX-X-8089-999-0000', 'โทร 0-XXXX-XXXX-X-8089[ตัวเลข]'],
        ['แทนคุณ 1-XXXX-XXXX-X-0008 อายุ 45 ปี', 'แทนคุณ 1-XXXX-XXXX-X-0008 อายุ 45 ปี'],
        // not a phone or an ID: kept, Thai digits read as digits
        ['นัดวันที่ 06/10/2569 เวลา 09.30', 'นัดวันที่ 06/10/2569 เวลา 09.30'],
        ['ปุ๋ยสูตร ๑๕-๑๕-๑๕ ปี ๒๕๖๙', 'ปุ๋ยสูตร 15-15-15 ปี 2569'],
        ['ใช้ 0.75 กก. วันที่ 2026-10-09', 'ใช้ 0.75 กก. วันที่ 2026-10-09'],
        [null, null],
        ['', ''],
    ])('%j → %j', (input, expected) => {
        expect(datasetService.redactFreeText(input)).toBe(expected);
    });
});

describe('redactFreeText stays linear on long text (K16 re-check F3)', () => {
    test('60,000 characters with no @ take well under a second', () => {
        const started = Date.now();
        datasetService.redactFreeText('ก'.repeat(30000) + 'abc'.repeat(10000));
        expect(Date.now() - started).toBeLessThan(500);
    });
});

describe('pseudonyms and the key', () => {
    test('stable for one key, different across keys, null stays null', () => {
        const a = datasetService.pseudonymiserFor('k'.repeat(40));
        const b = datasetService.pseudonymiserFor('j'.repeat(40));
        const farm = '0b0c2f7e-0000-4000-8000-000000000001';
        expect(a(farm)).toMatch(/^[0-9a-f]{32}$/);
        expect(a(farm)).toBe(a(farm));
        expect(a(farm)).not.toBe(b(farm));
        expect(a(null)).toBeNull();
    });

    test('the key fingerprint names the key without revealing it', () => {
        const key = 'k'.repeat(40);
        const fp = datasetService.keyFingerprint(key);
        expect(fp).toMatch(/^[0-9a-f]{16}$/);
        expect(fp).toBe(datasetService.keyFingerprint(key));
        expect(fp).not.toBe(datasetService.keyFingerprint('j'.repeat(40)));
        expect(datasetService.pseudonymiserFor(key)('x')).not.toContain(fp);
    });
});

describe('dataset pseudonym key (DATASET_PSEUDONYM_KEY)', () => {
    const QUESTION = {
        id: '0b0c2f7e-0000-4000-8000-000000000001', createdAt: new Date('2026-07-01T00:00:00Z'), templateId: 't1',
        template: { code: 'C', title: 'T', targetGroup: 'FARMER', version: 1 }, sortOrder: 1, section: null,
        questionText: 'q', questionType: 'TEXT', choices: null, isRequired: true,
    };
    const saved = {};
    const KEYS = ['NODE_ENV', 'DATASET_PSEUDONYM_KEY', 'HMAC_KEY'];

    beforeEach(() => { for (const k of KEYS) { saved[k] = process.env[k]; } });
    afterEach(() => {
        for (const k of KEYS) {
            if (saved[k] === undefined) { delete process.env[k]; } else { process.env[k] = saved[k]; }
        }
    });

    /** A fresh service whose secrets module read NODE_ENV as `nodeEnv`. */
    function serviceUnder(nodeEnv) {
        process.env.NODE_ENV = nodeEnv;
        let service;
        jest.isolateModules(() => { service = require('../../services/dataset-export-service'); });
        return service;
    }

    test.each(['production', 'development'])('%s: no DATASET_PSEUDONYM_KEY = 503 on every door, even when HMAC_KEY is set', async (nodeEnv) => {
        delete process.env.DATASET_PSEUDONYM_KEY;
        process.env.HMAC_KEY = 'h'.repeat(48);
        const service = serviceUnder(nodeEnv);
        mockFindMany.mockResolvedValue([QUESTION]);
        await expect(service.exportDomain('survey-questions', 'jsonl'))
            .rejects.toMatchObject({ statusCode: 503, code: 'DATASET_PSEUDONYM_KEY_UNAVAILABLE' });
        await expect(service.exportList('survey-responses/withdrawn', 'jsonl'))
            .rejects.toMatchObject({ statusCode: 503, code: 'DATASET_PSEUDONYM_KEY_UNAVAILABLE' });
        await expect(service.exportBundle()).rejects.toMatchObject({ statusCode: 503, code: 'DATASET_PSEUDONYM_KEY_UNAVAILABLE' });
        expect(mockFindMany).not.toHaveBeenCalled();
    });

    test.each(['production', 'development'])('%s: DATASET_PSEUDONYM_KEY set to the HMAC_KEY value = 503, nothing read', async (nodeEnv) => {
        process.env.HMAC_KEY = 's'.repeat(48);
        process.env.DATASET_PSEUDONYM_KEY = 's'.repeat(48);
        const service = serviceUnder(nodeEnv);
        mockFindMany.mockResolvedValue([QUESTION]);
        await expect(service.exportDomain('survey-questions', 'jsonl'))
            .rejects.toMatchObject({ statusCode: 503, code: 'DATASET_PSEUDONYM_KEY_REUSES_HMAC_KEY' });
        await expect(service.exportBundle()).rejects.toMatchObject({ statusCode: 503, code: 'DATASET_PSEUDONYM_KEY_REUSES_HMAC_KEY' });
        expect(mockFindMany).not.toHaveBeenCalled();
    });

    // Anyone can read these two keys (K15/K16 L4), so a file made with one is reversible by anyone holding a real id.
    const SAMPLE_KEY = 'synthetic-sample-pseudonym-key-public-not-a-secret-2026';
    const TEST_FALLBACK = 'test-only-dataset-pseudonym-key-32-bytes-okay';

    test.each([
        ['production', 'the published sample key', SAMPLE_KEY],
        ['development', 'the published sample key', SAMPLE_KEY],
        ['development', 'the sample key with a trailing newline', `${SAMPLE_KEY}\n`],
        ['production', 'the test-run fallback of config/secrets.js', TEST_FALLBACK],
    ])('%s: %s = 503 DATASET_PSEUDONYM_KEY_PUBLIC, nothing read', async (nodeEnv, label, key) => {
        process.env.HMAC_KEY = 'h'.repeat(48);
        process.env.DATASET_PSEUDONYM_KEY = key;
        const service = serviceUnder(nodeEnv);
        mockFindMany.mockResolvedValue([QUESTION]);
        await expect(service.exportDomain('survey-questions', 'jsonl')).rejects.toMatchObject({ statusCode: 503, code: 'DATASET_PSEUDONYM_KEY_PUBLIC' });
        await expect(service.exportList('survey-responses/withdrawn', 'jsonl')).rejects.toMatchObject({ statusCode: 503, code: 'DATASET_PSEUDONYM_KEY_PUBLIC' });
        await expect(service.exportBundle()).rejects.toMatchObject({ statusCode: 503, code: 'DATASET_PSEUDONYM_KEY_PUBLIC' });
        expect(mockFindMany).not.toHaveBeenCalled();
    });

    test('test runs: no key set = the catalog fallback, which is refused like any public key', async () => {
        delete process.env.DATASET_PSEUDONYM_KEY;
        const service = serviceUnder('test');
        await expect(service.exportDomain('survey-questions', 'jsonl')).rejects.toMatchObject({ statusCode: 503, code: 'DATASET_PSEUDONYM_KEY_PUBLIC' });
        expect(mockFindMany).not.toHaveBeenCalled();
    });

    test.each([
        ['31 bytes', 'x'.repeat(31)],
        ['32 characters of which 2 are spaces at the ends', ` ${'x'.repeat(30)} `],
    ])('development: a key of %s = 503 DATASET_PSEUDONYM_KEY_TOO_SHORT, nothing read', async (label, key) => {
        process.env.DATASET_PSEUDONYM_KEY = key;
        const service = serviceUnder('development');
        await expect(service.exportDomain('survey-questions', 'jsonl')).rejects.toMatchObject({ statusCode: 503, code: 'DATASET_PSEUDONYM_KEY_TOO_SHORT' });
        expect(mockFindMany).not.toHaveBeenCalled();
    });

    test('production: a key under 32 characters is refused (the secrets catalog withholds it)', async () => {
        process.env.DATASET_PSEUDONYM_KEY = 'x'.repeat(31);
        const service = serviceUnder('production');
        await expect(service.exportDomain('survey-questions', 'jsonl')).rejects.toMatchObject({ statusCode: 503 });
        expect(mockFindMany).not.toHaveBeenCalled();
    });

    test('production: pseudonyms are keyed by DATASET_PSEUDONYM_KEY, not by HMAC_KEY', async () => {
        process.env.DATASET_PSEUDONYM_KEY = 'p'.repeat(48);
        process.env.HMAC_KEY = 'h'.repeat(48);
        const service = serviceUnder('production');
        mockFindMany.mockResolvedValueOnce([QUESTION]);
        const row = JSON.parse((await service.exportDomain('survey-questions', 'jsonl')).body.trim());
        expect(row.questionId).toBe(service.pseudonymiserFor('p'.repeat(48))(QUESTION.id));
        expect(row.questionId).not.toBe(service.pseudonymiserFor('h'.repeat(48))(QUESTION.id));
    });
});

describe('survey answers: small geographic cells (order 49 Q5, complementary suppression)', () => {
    const KEY = 'unit-test-dataset-pseudonym-key-0123456789';
    const p = datasetService.pseudonymiserFor(KEY);
    let saved;
    beforeAll(() => { saved = process.env.DATASET_PSEUDONYM_KEY; process.env.DATASET_PSEUDONYM_KEY = KEY; });
    afterAll(() => { if (saved === undefined) { delete process.env.DATASET_PSEUDONYM_KEY; } else { process.env.DATASET_PSEUDONYM_KEY = saved; } });

    const people = (count, region, province, tag) => Array.from({ length: count }, (_, i) => [`${tag}${i}`, region, province]);

    /** Two answers per respondent, in creation order, shaped like the export's SELECT. */
    function answersOf(respondents) {
        let n = 0;
        return respondents.flatMap(([responseId, region, province]) => ['q1', 'q2'].map((questionId) => {
            n += 1;
            return {
                id: `a${n}`, createdAt: new Date(Date.UTC(2026, 9, 1, 0, n)), responseId, questionId, valueText: null, valueNumber: 3,
                response: { templateId: 't1', region, province, respondentType: 'FARMER', submittedAt: new Date('2026-10-01T03:00:00Z') },
            };
        }));
    }

    async function exportGeography(respondents) {
        const rows = answersOf(respondents);
        mockFindMany.mockResolvedValueOnce(rows);
        const out = (await datasetService.exportDomain('survey-responses', 'jsonl')).body.trim().split('\n').map(l => JSON.parse(l));
        return (label) => {
            const mine = out.filter(r => r.responseId === p(label)).map(r => [r.region, r.province]);
            expect(mine).toHaveLength(2);
            return mine[0];
        };
    }

    test('a province under 5 hides the next-smallest provinces of its region until the blank ones hold 5 or more', async () => {
        const geo = await exportGeography([
            ...people(5, 'NORTH', 'เชียงใหม่', 'cm'), ...people(1, 'NORTH', 'ลำพูน', 'lp'),
            ...people(5, 'CENTRAL', 'กรุงเทพมหานคร', 'bk'), ...people(3, 'CENTRAL', 'นนทบุรี', 'nb'), ...people(2, 'CENTRAL', 'ปทุมธานี', 'pt'),
        ]);
        // NORTH: ลำพูน alone would be a blank group of one, so เชียงใหม่ joins it
        expect([geo('cm0'), geo('lp0')]).toEqual([['NORTH', null], ['NORTH', null]]);
        // CENTRAL: นนทบุรี 3 + ปทุมธานี 2 already hold 5, so กรุงเทพมหานคร stays
        expect([geo('bk0'), geo('nb0'), geo('pt0')]).toEqual([['CENTRAL', 'กรุงเทพมหานคร'], ['CENTRAL', null], ['CENTRAL', null]]);
    });

    test('a region under 5 is blank with its provinces, and the next-smallest regions join it until the blank regions hold 5', async () => {
        const geo = await exportGeography([
            ...people(6, 'NORTH', 'เชียงใหม่', 'cm'), ...people(8, 'CENTRAL', 'กรุงเทพมหานคร', 'bk'), ...people(2, 'SOUTH', 'สงขลา', 'sk'),
        ]);
        expect([geo('sk0'), geo('cm0'), geo('bk0')]).toEqual([[null, null], [null, null], ['CENTRAL', 'กรุงเทพมหานคร']]);
    });

    test('a province shown is free text the respondent typed: masked like any other (K16 review)', async () => {
        const geo = await exportGeography([...people(5, 'NORTH', 'โทร 081-234-5678', 'tp')]);
        expect(geo('tp0')).toEqual(['NORTH', 'โทร [เบอร์โทร]']);
    });

    test('respondents who gave no province are part of the blank group of their region', async () => {
        const geo = await exportGeography([
            ...people(5, 'NORTHEAST', 'ขอนแก่น', 'kk'), ...people(1, 'NORTHEAST', 'เลย', 'ly'), ...people(4, 'NORTHEAST', null, 'no'),
        ]);
        expect([geo('kk0'), geo('ly0'), geo('no0')]).toEqual([['NORTHEAST', 'ขอนแก่น'], ['NORTHEAST', null], ['NORTHEAST', null]]);
    });

    test('a respondent counts once however many questions they answered', async () => {
        const geo = await exportGeography([...people(4, 'NORTH', 'เชียงใหม่', 'cm'), ...people(5, 'CENTRAL', 'กรุงเทพมหานคร', 'bk')]);
        // 4 respondents = 8 answer rows, still a region under 5
        expect([geo('cm0'), geo('bk0')]).toEqual([[null, null], [null, null]]);
    });
});

describe('survey questions (K15/K16 L1)', () => {
    const KEY = 'unit-test-dataset-pseudonym-key-0123456789';
    let saved;
    beforeAll(() => { saved = process.env.DATASET_PSEUDONYM_KEY; process.env.DATASET_PSEUDONYM_KEY = KEY; });
    afterAll(() => { if (saved === undefined) { delete process.env.DATASET_PSEUDONYM_KEY; } else { process.env.DATASET_PSEUDONYM_KEY = saved; } });

    test('choices are free text like the question: a phone, an email or an ID in a choice is masked, the list stays JSON', async () => {
        mockFindMany.mockResolvedValueOnce([{
            id: 'q1', createdAt: new Date('2026-07-01T00:00:00Z'), templateId: 't1', template: { code: 'C', title: 'T', targetGroup: 'FARMER', version: 1 },
            sortOrder: 1, section: null, questionText: 'ช่องทางติดต่อ', questionType: 'SINGLE_CHOICE', isRequired: true,
            choices: ['สายด่วน (02) 123-4567', 'อีเมล help@example.go.th', 'ผู้ใหญ่บ้าน 3100000000008', 'ไม่ต้องติดต่อ'],
        }]);
        const row = JSON.parse((await datasetService.exportDomain('survey-questions', 'jsonl')).body.trim());
        expect(JSON.parse(row.choices)).toEqual(['สายด่วน [เบอร์โทร]', 'อีเมล [อีเมล]', 'ผู้ใหญ่บ้าน 3-XXXX-XXXX-X-0008', 'ไม่ต้องติดต่อ']);
    });
});

describe('door refusals', () => {
    test('unknown domain 404 · unknown list 404 · unknown format 400 · farm data without a ruling 403, nothing read', async () => {
        await expect(datasetService.exportDomain('care-logs', 'csv')).rejects.toMatchObject({ statusCode: 404, code: 'DATASET_NOT_FOUND' });
        await expect(datasetService.exportList('trace-scans/deleted', 'csv')).rejects.toMatchObject({ statusCode: 404, code: 'DATASET_LIST_NOT_FOUND' });
        await expect(datasetService.exportDomain('survey-questions', 'xml')).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_FORMAT' });
        await expect(datasetService.exportDomain('harvest-batches', 'csv')).rejects.toMatchObject({ statusCode: 403, code: 'DATASET_RESEARCH_BASIS_NOT_IN_FORCE' });
        expect(mockFindMany).not.toHaveBeenCalled();
    });
});

describe('the research data store deletes withdrawn pseudonyms within 90 days (order 56(4.2))', () => {
    const saved = {};
    beforeEach(() => {
        saved.key = process.env.DATASET_PSEUDONYM_KEY;
        process.env.DATASET_PSEUDONYM_KEY = `deletion-duty-test-key-${'d'.repeat(24)}`;
        mockFindMany.mockResolvedValue([]);
    });
    afterEach(() => {
        if (saved.key === undefined) { delete process.env.DATASET_PSEUDONYM_KEY; } else { process.env.DATASET_PSEUDONYM_KEY = saved.key; }
    });

    test('every bundle states the duty in its manifest and its dictionary in the same words: withdrawals and account erasures, copies and backups, 90 days from the export that lists them', async () => {
        const { manifest } = await datasetService.exportBundle();
        const duty = manifest.deletionDuty;
        for (const fact of [
            'คลังข้อมูลวิจัยของโครงการต้องลบ', 'รายการคำตอบที่ถอนความยินยอมแล้ว', 'สำเนา', 'ข้อมูลสำรอง',
            'ภายใน 90 วันนับจากวันที่ได้รับชุดข้อมูลที่มีรหัสแฝงนั้นในรายการ', 'ถอนความยินยอม', 'ลบบัญชี',
        ]) {
            expect({ fact, stated: typeof duty === 'string' && duty.includes(fact) }).toEqual({ fact, stated: true });
        }
        expect(datasetService.generateDataDictionaryMarkdown()).toContain(duty);
    });
});

describe('data dictionary generator', () => {
    test('covers every domain, field, list and withheld column, and carries no generation date (K2)', () => {
        const md = datasetService.generateDataDictionaryMarkdown();
        for (const domain of DATASET_DOMAINS) {
            expect(md).toContain(`\`${domain.key}\``);
            for (const field of domain.fields) { expect(md).toContain(`\`${field.field}\``); }
            for (const w of domain.withheld) { expect(md).toContain(`\`${w.column}\``); }
        }
        for (const list of DATASET_LISTS) { expect(md).toContain(`\`${list.key}\``); }
        expect(md).not.toMatch(/generated \d{4}-\d{2}-\d{2}/);
        expect(datasetService.generateDataDictionaryMarkdown()).toBe(md);
        expect(md).not.toMatch(/บพข/);
    });
});

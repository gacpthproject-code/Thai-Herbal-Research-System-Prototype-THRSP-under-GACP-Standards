'use strict';

/**
 * Farm-operation data leaves for the research data store only under a dated
 * ruling that is in force and names the research ethics committee approval on
 * file (order 56(4.3), PDPC s.24(1) research notice): committee, reference
 * number and approval date, no later than the day the ruling takes effect. An
 * in-force date alone is refused on every door, and such a ruling never opens
 * the window the farm deletion lists cover.
 */

jest.mock('../../shared/logger', () => {
    const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { ...l, createLogger: jest.fn(() => l) };
});

const mockFindMany = jest.fn();
jest.mock('../../services/prisma-database', () => ({
    prisma: new Proxy({}, { get: (target, prop) => (typeof prop === 'string' ? { findMany: (...a) => mockFindMany(...a) } : undefined) }),
}));

const mockBases = { current: { FARM_OPERATION: [] } };
jest.mock('../../data/datasets/research-use-bases', () => ({
    get RESEARCH_USE_BASES() { return mockBases.current; },
}));

const datasetService = require('../../services/dataset-export-service');
const { RESEARCH_BASIS } = require('../../data/datasets/dataset-domains');

const KEY = `research-basis-test-key-${'b'.repeat(24)}`;
const FARM = ['cultivation-logs', 'harvest-batches', 'trace-scans'];
const AT = new Date('2026-10-09T05:00:00Z');
const APPROVAL = Object.freeze({ committee: 'คณะกรรมการจริยธรรมการวิจัยในมนุษย์ มหาวิทยาลัยทดสอบ', reference: 'COA 001/2569', approvedOn: '2025-12-15' });
const ruling = (fields) => ({ effectiveFrom: '2026-01-01', inForce: true, privacyNoticeVersion: 'test-notice', ruling: 'test', ...fields });
const REFUSED = { statusCode: 403, code: 'DATASET_RESEARCH_BASIS_NOT_IN_FORCE' };

const farmCatalog = () => datasetService.listDomains({ at: AT })
    .filter(d => FARM.includes(d.key))
    .map(d => ({ key: d.key, available: d.available, code: d.unavailableCode }));

/** A harvest batch whose farm was deleted on `day` (Bangkok), as the deleted-batch list reads it. */
const batchOfFarmDeletedOn = (n, day) => ({
    id: `a0000000-0000-4000-8000-00000000000${n}`, createdAt: new Date('2025-11-01T00:00:00Z'), updatedAt: new Date('2025-11-01T00:00:00Z'),
    isDeleted: false, farm: { isDeleted: true, deletedAt: new Date(`${day}T05:00:00Z`) }, cycle: null,
});

const saved = {};
beforeEach(() => {
    saved.key = process.env.DATASET_PSEUDONYM_KEY;
    process.env.DATASET_PSEUDONYM_KEY = KEY;
    mockFindMany.mockReset();
    mockFindMany.mockResolvedValue([]);
});
afterEach(() => {
    mockBases.current = { FARM_OPERATION: [] };
    if (saved.key === undefined) { delete process.env.DATASET_PSEUDONYM_KEY; } else { process.env.DATASET_PSEUDONYM_KEY = saved.key; }
});

describe('a farm ruling in force by date without a complete research ethics approval is refused (order 56(4.3))', () => {
    test.each([
        ['no approval at all', {}],
        ['an approval naming no committee', { ethicsApproval: { ...APPROVAL, committee: ' ' } }],
        ['an approval with no reference number', { ethicsApproval: { committee: APPROVAL.committee, approvedOn: APPROVAL.approvedOn } }],
        ['an approval with no date', { ethicsApproval: { committee: APPROVAL.committee, reference: APPROVAL.reference } }],
        ['an approval dated on a day that does not exist', { ethicsApproval: { ...APPROVAL, approvedOn: '2025-02-30' } }],
        ['an approval dated after the ruling takes effect', { ethicsApproval: { ...APPROVAL, approvedOn: '2026-01-02' } }],
    ])('%s: every farm door answers 403 and reads nothing, and the catalog closes the farm domains', async (label, fields) => {
        mockBases.current = { FARM_OPERATION: [ruling(fields)] };
        expect(datasetService.researchBasisAt(RESEARCH_BASIS.FARM_OPERATION, AT).inForce).toBe(false);
        for (const key of FARM) {
            await expect(datasetService.exportDomain(key, 'csv', { at: AT })).rejects.toMatchObject(REFUSED);
        }
        expect(mockFindMany).not.toHaveBeenCalled();
        expect(farmCatalog()).toEqual(FARM.map(key => ({ key, available: false, code: REFUSED.code })));
    });

    test('the bundle leaves farm data out, and its manifest shows the ruling without an approval', async () => {
        mockBases.current = { FARM_OPERATION: [ruling({})] };
        const { manifest } = await datasetService.exportBundle({ at: AT });
        expect(manifest.notExported).toEqual(FARM.map(key => ({ key, code: REFUSED.code })));
        expect(manifest.files.filter(f => f.kind === 'domain').map(f => f.key))
            .toEqual(['survey-responses', 'survey-responses', 'survey-questions', 'survey-questions']);
        expect(manifest.researchBasis.FARM_OPERATION)
            .toEqual({ inForce: false, effectiveFrom: '2026-01-01', privacyNoticeVersion: 'test-notice', ethicsApproval: null });
    });

    test('no farm row left while such a ruling stood, so the farm deletion lists stay empty and read nothing', async () => {
        mockBases.current = { FARM_OPERATION: [ruling({})] };
        for (const key of ['cultivation-logs/deleted', 'harvest-batches/deleted']) {
            await expect(datasetService.exportList(key, 'jsonl', { at: AT })).resolves.toMatchObject({ rows: 0 });
        }
        expect(mockFindMany).not.toHaveBeenCalled();
    });
});

describe('a farm ruling in force with its research ethics approval on file', () => {
    test.each([
        ['approved before the ruling takes effect', APPROVAL],
        ['approved on the day the ruling takes effect', { ...APPROVAL, approvedOn: '2026-01-01' }],
    ])('%s: farm data leaves', async (label, approval) => {
        mockBases.current = { FARM_OPERATION: [ruling({ ethicsApproval: approval })] };
        expect(datasetService.researchBasisAt(RESEARCH_BASIS.FARM_OPERATION, AT).inForce).toBe(true);
        await expect(datasetService.exportDomain('trace-scans', 'jsonl', { at: AT })).resolves.toMatchObject({ rows: 0 });
        expect(mockFindMany).toHaveBeenCalled();
        expect(farmCatalog()).toEqual(FARM.map(key => ({ key, available: true, code: null })));
    });

    test('the manifest and the data dictionary name the approval the data left under', async () => {
        mockBases.current = { FARM_OPERATION: [ruling({ ethicsApproval: APPROVAL })] };
        const { manifest } = await datasetService.exportBundle({ at: AT });
        expect(manifest.notExported).toEqual([]);
        expect(manifest.researchBasis.FARM_OPERATION)
            .toEqual({ inForce: true, effectiveFrom: '2026-01-01', privacyNoticeVersion: 'test-notice', ethicsApproval: APPROVAL });
        const dictionary = datasetService.generateDataDictionaryMarkdown({ at: AT });
        for (const value of Object.values(APPROVAL)) { expect(dictionary).toContain(value); }
    });
});

describe('the farm deletion lists cover only days a ruling with an approval stood', () => {
    const listedIds = async () => (await datasetService.exportList('harvest-batches/deleted', 'jsonl', { at: AT })).body
        .split('\n').filter(Boolean).map(line => JSON.parse(line).id).sort();
    const p = datasetService.pseudonymiserFor(KEY);

    test('a ruling without an approval before an approved one does not widen the window', async () => {
        mockBases.current = { FARM_OPERATION: [ruling({}), ruling({ effectiveFrom: '2026-06-01', ethicsApproval: { ...APPROVAL, approvedOn: '2026-05-15' } })] };
        mockFindMany.mockResolvedValue([batchOfFarmDeletedOn(1, '2026-03-01'), batchOfFarmDeletedOn(2, '2026-07-01')]);
        expect(await listedIds()).toEqual([p(batchOfFarmDeletedOn(2, '2026-07-01').id)]);
    });

    test('a later ruling without an approval stops the export, and the list still covers the days the approved ruling stood', async () => {
        mockBases.current = { FARM_OPERATION: [ruling({ ethicsApproval: APPROVAL }), ruling({ effectiveFrom: '2026-06-01', privacyNoticeVersion: 'test-notice-2' })] };
        await expect(datasetService.exportDomain('cultivation-logs', 'csv', { at: AT })).rejects.toMatchObject(REFUSED);
        mockFindMany.mockResolvedValue([batchOfFarmDeletedOn(1, '2026-03-01'), batchOfFarmDeletedOn(2, '2026-07-01')]);
        expect(await listedIds()).toEqual([p(batchOfFarmDeletedOn(1, '2026-03-01').id), p(batchOfFarmDeletedOn(2, '2026-07-01').id)].sort());
    });
});

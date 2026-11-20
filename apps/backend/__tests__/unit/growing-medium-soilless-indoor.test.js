'use strict';

const { buildHerbRuleRows } = require('../../scripts/seed-herb-requirement-rules');

const mockRulesAt = jest.fn();
const mockPlantCodes = jest.fn();
jest.mock('../../services/requirement-rule-service', () => ({
    rulesAt: (...args) => mockRulesAt(...args),
    plantCodesWithRulesAt: (...args) => mockPlantCodes(...args),
    RULE_DIMENSIONS: {
        landTenure: ['OWNED', 'STATE_PERMITTED', 'RENTED'],
        areaType: ['OUTDOOR', 'GREENHOUSE', 'INDOOR'],
        certScope: ['PLANTING', 'PROCESSING'],
    },
}));
jest.mock('../../services/prisma-database', () => ({ prisma: {} }));
jest.mock('../../shared/logger', () => {
    const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { ...l, createLogger: jest.fn(() => l) };
});

const { siteFieldGaps } = require('@gacp/validation/filing-fields');
const { validateCanonicalSubmission } = require('../../validation/canonical-application-validator');
const { resolveApplicationRequirements } = require('../../services/application-requirements-service');
const { analyzeRecord, STATUS } = require('../../services/standards-analyzer-service');
const { renderKatorlor1Html } = require('../../services/pdf/katorlor1-template-service');
const { formDataWithoutContact } = require('../../shared/applicant-contact');
const { renewalPrefill } = require('../../services/renewal-prefill');
const { DOCUMENT_SLOTS } = require('../../constants/document-slots');

const SOILLESS_REASON = 'ผู้ยื่นระบุว่าปลูกในอาคารแบบไม่ใช้ดิน รอผู้เชี่ยวชาญตัดสินว่าหัวข้อดินเกี่ยวข้องหรือไม่';

const ALL_ROWS = buildHerbRuleRows('cannabis', { effectiveFrom: '2026-09-02T00:00:00Z' })
    .map((row, index) => ({ id: `rule-${index}`, ...row }));

function rulesFor(asked) {
    const matches = (column, value) => {
        const wanted = asked[column] === undefined ? null : asked[column];
        if (value === null || value === undefined) { return true; }
        if (Array.isArray(wanted)) { return wanted.includes(value); }
        return wanted === value;
    };
    return ALL_ROWS.filter((row) => (
        matches('holderType', row.holderType)
        && matches('requestType', row.requestType)
        && matches('plantCode', row.plantCode)
        && matches('landTenure', row.landTenure)
        && matches('areaType', row.areaType)
        && matches('certScope', row.certScope)
    ));
}

beforeEach(() => {
    jest.clearAllMocks();
    mockRulesAt.mockImplementation(async (asked) => rulesFor(asked));
    mockPlantCodes.mockResolvedValue(['cannabis']);
});

function completeFarm(over = {}) {
    return {
        siteName: 'อาคารปลูกบางพลี', siteAddress: '99 หมู่ 1', areaSqm: '400', province: 'สมุทรปราการ',
        district: 'บางพลี', subDistrict: 'บางพลีใหญ่', postalCode: '10540', areaTypes: ['INDOOR'],
        siteContactName: 'สมชาย ใจดี', sitePhone: '0812345678', siteContactIsApplicant: true,
        landOwnership: 'OWNED', landDocumentDetail: { type: 'โฉนด', number: '12345' },
        coordinates: '13.6069, 100.7061', plantsPerCycle: '200', cyclesPerYear: '4',
        ...over,
    };
}

function completeFiling(farm) {
    return {
        plantId: 'cannabis',
        certificationPurposes: ['EXPORT'],
        applicantType: 'JURISTIC',
        requestType: 'NEW',
        certScope: 'PLANTING',
        farmData: farm,
        varieties: [{ kind: 'SEED', name: 'หางกระรอกภูพาน', origin: 'DOMESTIC', source: 'ศูนย์พันธุ์พืช', quantity: '200', unit: 'ต้น' }],
    };
}

const gapPaths = (farm, filing) => siteFieldGaps(farm, filing).map((gap) => gap.path);

describe('ประตูตรวจคำขอ: วัสดุปลูกถามเฉพาะอาคารระบบปิด และเป็นคำปิดสองคำ', () => {
    test.each([
        ['SOIL'],
        ['SOILLESS'],
    ])('อาคารระบบปิดตอบ %s: ไม่มีช่องว่าง และประตูยื่นรับ', (medium) => {
        const farm = completeFarm({ growingMedium: medium });
        expect(gapPaths(farm)).toEqual([]);
        expect(validateCanonicalSubmission(completeFiling(farm), []).errorsByStep['3']).toBeUndefined();
    });

    test('อาคารระบบปิดไม่ได้ตอบ: ขาด growing_medium ทั้งในวิซาร์ดและที่ประตูยื่น', () => {
        const farm = completeFarm();
        expect(gapPaths(farm)).toEqual(['growing_medium']);
        const result = validateCanonicalSubmission(completeFiling(farm), []);
        expect(result.isValid).toBe(false);
        expect(result.missingFields).toContain('step3.growing_medium');
        expect(result.errorsByStep['3']).toEqual([
            expect.objectContaining({ path: 'growing_medium', message: 'กรุณาเลือกว่าอาคารระบบปิดปลูกในดินหรือไม่ใช้ดิน' }),
        ]);
    });

    test.each([
        ['HYDROPONIC'],
        ['soilless'],
        [''],
        [true],
    ])('อาคารระบบปิดตอบคำนอกชุด %j: ปฏิเสธ', (medium) => {
        expect(gapPaths(completeFarm({ growingMedium: medium }))).toEqual(['growing_medium']);
    });

    test.each([
        [['OUTDOOR'], 'SOIL'],
        [['GREENHOUSE'], 'SOILLESS'],
        [[], 'SOILLESS'],
    ])('ไม่ได้เลือกอาคารระบบปิด (%j) แต่ส่ง %s มา: ปฏิเสธที่ประตูยื่น', (areaTypes, medium) => {
        const farm = completeFarm({ areaTypes, growingMedium: medium });
        expect(gapPaths(farm)).toEqual(['growing_medium']);
        const issues = validateCanonicalSubmission(completeFiling(farm), []).errorsByStep['3'] || [];
        expect(issues).toContainEqual(expect.objectContaining({
            path: 'growing_medium', message: 'ตอบเรื่องปลูกในดินหรือไม่ใช้ดินได้เฉพาะเมื่อเลือกอาคารระบบปิด',
        }));
    });

    test('ไม่ได้เลือกอาคารระบบปิดและไม่ได้ส่งวัสดุปลูก: ไม่ถาม', () => {
        expect(gapPaths(completeFarm({ areaTypes: ['OUTDOOR'] }))).toEqual([]);
    });

    test('กลางแจ้งร่วมกับอาคารระบบปิด: ยังถามวัสดุปลูก', () => {
        expect(gapPaths(completeFarm({ areaTypes: ['OUTDOOR', 'INDOOR'] }))).toEqual(['growing_medium']);
        expect(gapPaths(completeFarm({ areaTypes: ['OUTDOOR', 'INDOOR'], growingMedium: 'SOILLESS' }))).toEqual([]);
    });

    test('ใบแทนไม่ถามส่วนที่ ๒ จึงไม่ถามวัสดุปลูก', () => {
        expect(gapPaths(completeFarm(), { requestType: 'REPLACEMENT' })).toEqual([]);
    });
});

function filingFor(areaTypes, growingMedium) {
    return {
        id: 'app-medium',
        entity: { type: 'JURISTIC' },
        formData: {
            plantId: 'cannabis',
            requestType: 'NEW',
            certScope: 'PLANTING',
            certificationPurposes: ['RESEARCH'],
            farmData: { landOwnership: 'OWNED', areaTypes, ...(growingMedium === undefined ? {} : { growingMedium }) },
        },
    };
}

const slotIdsOf = (payload) => payload.slots.map((slot) => slot.slotId);

describe('เอนจินเอกสาร: ไม่มีช่อง soil_test เฉพาะอาคารระบบปิดอย่างเดียวที่ไม่ใช้ดิน', () => {
    test('อาคารระบบปิด + ไม่ใช้ดิน: ไม่มีช่อง soil_test ส่วนช่องน้ำยังอยู่', async () => {
        const payload = await resolveApplicationRequirements(filingFor(['INDOOR'], 'SOILLESS'), []);
        expect(slotIdsOf(payload)).not.toContain('soil_test');
        expect(slotIdsOf(payload)).toContain('water_test');
        expect(payload.missingRequired).not.toContain('soil_test');
    });

    test.each([
        ['อาคารระบบปิด + ปลูกในดิน', ['INDOOR'], 'SOIL'],
        ['อาคารระบบปิดที่ยังไม่ได้ตอบ', ['INDOOR'], undefined],
        ['กลางแจ้งร่วมกับอาคารระบบปิดที่ไม่ใช้ดิน', ['OUTDOOR', 'INDOOR'], 'SOILLESS'],
        ['โรงเรือนร่วมกับอาคารระบบปิดที่ไม่ใช้ดิน', ['GREENHOUSE', 'INDOOR'], 'SOILLESS'],
        ['กลางแจ้ง', ['OUTDOOR'], undefined],
        ['กลางแจ้งที่ส่งไม่ใช้ดินมาโดยไม่ได้เลือกอาคาร', ['OUTDOOR'], 'SOILLESS'],
    ])('%s: ยังมีช่อง soil_test แบบไม่บังคับ', async (_name, areaTypes, medium) => {
        const payload = await resolveApplicationRequirements(filingFor(areaTypes, medium), []);
        expect(payload.slots.find((slot) => slot.slotId === 'soil_test')).toMatchObject({ required: false, requiredReason: null });
    });
});

const SOIL_ROW = Object.freeze({
    documentId: 'doc-soil-1', documentType: 'soil_test', fileUrl: '/uploads/soil-1.pdf',
    fileName: 'soil-1.pdf', createdAt: '2026-11-01T00:00:00Z', currentForSlot: 'soil_test', supersededAt: null,
});

describe('เอนจินเอกสาร: ไฟล์ผลตรวจดินที่อัปโหลดไว้แล้วต้องไม่หายจากรายการ แม้ตอบภายหลังว่าไม่ใช้ดิน', () => {
    test('อาคารระบบปิด + ไม่ใช้ดิน + มีแถว application_documents ของ soil_test: ช่องยังอยู่แบบไม่บังคับ พร้อมไฟล์', async () => {
        const payload = await resolveApplicationRequirements(filingFor(['INDOOR'], 'SOILLESS'), [SOIL_ROW]);
        expect(payload.slots.find((slot) => slot.slotId === 'soil_test')).toMatchObject({
            required: false, requiredReason: null, satisfied: true,
            documentId: 'doc-soil-1', fileUrl: '/uploads/soil-1.pdf', fileName: 'soil-1.pdf',
        });
        expect(payload.missingRequired).not.toContain('soil_test');
    });

    test('อาคารระบบปิด + ไม่ใช้ดิน + ไฟล์อยู่ใน formData.draftDocuments: ช่องยังอยู่พร้อมไฟล์', async () => {
        const filing = filingFor(['INDOOR'], 'SOILLESS');
        filing.formData.draftDocuments = [{ slotId: 'soil_test', documentId: 'doc-soil-2', fileUrl: '/uploads/soil-2.pdf', fileName: 'soil-2.pdf', uploadedAt: '2026-11-01T00:00:00Z' }];
        const payload = await resolveApplicationRequirements(filing, []);
        expect(payload.slots.find((slot) => slot.slotId === 'soil_test')).toMatchObject({ required: false, satisfied: true, fileName: 'soil-2.pdf' });
    });

    test('ไฟล์ดินที่ถูกแทนที่แล้วลบตัวแทนทิ้ง (แถว superseded เท่านั้น): ไม่มีไฟล์ จึงไม่มีช่อง', async () => {
        const superseded = { ...SOIL_ROW, currentForSlot: null, supersededAt: '2026-11-02T00:00:00Z' };
        const payload = await resolveApplicationRequirements(filingFor(['INDOOR'], 'SOILLESS'), [superseded]);
        expect(slotIdsOf(payload)).not.toContain('soil_test');
    });
});

function analyzed(standardCode, farmData, documentTypes = []) {
    const result = analyzeRecord(standardCode, {
        id: 'app-medium', status: 'SUBMITTED', formData: { farmData }, documents: documentTypes.map((documentType) => ({ documentType })),
    });
    return result.requirements.find((r) => r.id === 'SOIL');
}

describe('ตัววิเคราะห์มาตรฐาน: อาคารระบบปิดไม่ใช้ดินได้ รอประเมิน พร้อมเหตุผล ไม่มีคำตัดสินที่สี่', () => {
    test.each([['THAI_GACP'], ['WHO'], ['ASEAN']])('%s: ไม่ใช้ดิน = NEEDS_REVIEW พร้อมเหตุผลตามคำสั่ง และไม่แนะนำให้แนบผลตรวจดิน', (standard) => {
        const soil = analyzed(standard, { areaTypes: ['INDOOR'], growingMedium: 'SOILLESS' });
        expect(soil.status).toBe('NEEDS_REVIEW');
        expect(soil.evidence).toBe(SOILLESS_REASON);
        expect(soil.recommendation).toBeNull();
    });

    test('ชุดคำตัดสินยังมีสามค่า ไม่มี ไม่เกี่ยวข้อง', () => {
        expect(Object.values(STATUS).sort()).toEqual(['MET', 'NEEDS_REVIEW', 'NOT_MET']);
    });

    test.each([
        ['อาคารระบบปิด + ปลูกในดิน', { areaTypes: ['INDOOR'], growingMedium: 'SOIL' }],
        ['กลางแจ้งร่วมกับอาคารระบบปิดที่ไม่ใช้ดิน', { areaTypes: ['OUTDOOR', 'INDOOR'], growingMedium: 'SOILLESS' }],
        ['อาคารระบบปิดที่ยังไม่ได้ตอบ', { areaTypes: ['INDOOR'] }],
    ])('%s ไม่มีผลตรวจดิน: ยังเป็น NOT_MET ตามเดิม', (_name, farmData) => {
        const soil = analyzed('THAI_GACP', farmData);
        expect(soil.status).toBe('NOT_MET');
        expect(soil.evidence).not.toBe(SOILLESS_REASON);
    });

    test('หัวข้ออื่นของคำขอไม่ใช้ดินไม่เปลี่ยน', () => {
        const farm = { areaTypes: ['INDOOR'], growingMedium: 'SOILLESS' };
        const withMedium = analyzeRecord('THAI_GACP', { id: 'a', status: 'SUBMITTED', formData: { farmData: farm }, documents: [] });
        const without = analyzeRecord('THAI_GACP', { id: 'a', status: 'SUBMITTED', formData: { farmData: { areaTypes: ['INDOOR'] } }, documents: [] });
        const byTopic = (result) => Object.fromEntries(result.requirements.filter((r) => r.id !== 'SOIL').map((r) => [r.id, r.status]));
        expect(byTopic(withMedium)).toEqual(byTopic(without));
    });
});

describe('ผู้อ่านทุกตัวได้รับคำตอบวัสดุปลูก', () => {
    const application = (farmData) => ({ id: 'app-k1', formData: completeFiling(farmData) });

    test('กทล.1 ที่ระบบประกอบพิมพ์คำตอบ และกำกับว่าเป็นข้อมูลเพิ่มเติมนอกแบบ กทล ๑', () => {
        const html = renderKatorlor1Html(application(completeFarm({ growingMedium: 'SOILLESS' })), { dims: { areaTypes: ['INDOOR'] }, slots: [] });
        expect(html).toMatch(/วัสดุปลูกในอาคารระบบปิด/);
        expect(html).toMatch(/ไม่ใช้ดิน/);
        expect(html).toMatch(/ข้อมูลเพิ่มเติม ไม่อยู่ในแบบ กทล ๑/);
    });

    test('กทล.1 ของคำขอที่ไม่ได้เลือกอาคารระบบปิดไม่มีแถววัสดุปลูก แม้มีค่าค้าง', () => {
        const html = renderKatorlor1Html(application(completeFarm({ areaTypes: ['OUTDOOR'], growingMedium: 'SOIL' })), { dims: { areaTypes: ['OUTDOOR'] }, slots: [] });
        expect(html).not.toMatch(/วัสดุปลูกในอาคารระบบปิด/);
    });

    test('ผู้จัดคิวและผู้ตรวจพื้นที่อ่านวัสดุปลูกได้ (รายการที่อนุญาตของ farmData)', () => {
        const filing = formDataWithoutContact(completeFiling(completeFarm({ growingMedium: 'SOILLESS' })));
        expect(filing.farmData.growingMedium).toBe('SOILLESS');
        expect(filing.farmData.sitePhone).toBeUndefined();
    });

    test('ต่ออายุ: ยกคำตอบจากคำขอเดิมมาเมื่อยังเลือกอาคารระบบปิด', () => {
        const previous = completeFiling(completeFarm({ growingMedium: 'SOILLESS' }));
        expect(renewalPrefill(previous, {}).farmData.growingMedium).toBe('SOILLESS');
    });

    test('ต่ออายุ: ไม่ยกคำตอบมาเมื่อคำขอใหม่ไม่ได้เลือกอาคารระบบปิด และไม่ยกคำนอกชุด', () => {
        const previous = completeFiling(completeFarm({ growingMedium: 'SOILLESS' }));
        expect(renewalPrefill(previous, { farmData: { areaTypes: ['OUTDOOR'] } }).farmData.growingMedium).toBeUndefined();
        const odd = completeFiling(completeFarm({ growingMedium: 'HYDRO' }));
        expect(renewalPrefill(odd, {}).farmData.growingMedium).toBeUndefined();
    });
});

describe('ข้อความช่องผลตรวจดิน (ข้อสังเกต M1 และ M4)', () => {
    const soil = DOCUMENT_SLOTS.SOIL_TEST;

    test('บอกว่าการยกเว้นเป็นของจริง: ระบบไม่ถามเอกสารนี้จากผู้ที่ตอบว่าปลูกในอาคารระบบปิดแบบไม่ใช้ดินอย่างเดียว', () => {
        expect(soil.description).toMatch(/ระบบไม่ถามเอกสารนี้จากผู้ที่ปลูกในอาคารระบบปิดแบบไม่ใช้ดินอย่างเดียว/);
        expect(soil.description).not.toMatch(/ไม่ต้องแนบ/);
    });

    test('สั้นพอสำหรับการ์ดบนมือถือ: คำอธิบายไม่เกิน 160 ตัวอักษร และคำแนะนำแหล่งที่มาไม่เกิน 100', () => {
        expect(soil.description.length).toBeLessThanOrEqual(160);
        expect(soil.sourceHint.length).toBeLessThanOrEqual(100);
    });
});

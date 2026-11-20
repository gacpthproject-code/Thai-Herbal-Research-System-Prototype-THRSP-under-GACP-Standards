'use strict';

// คำสั่ง 159 (operator 2026-11-04): หลักฐานดินคือรายงานแล็บที่ผู้ยื่นอัปโหลด ไม่บังคับตอนยื่น แบบเดียวกับน้ำ
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

const { resolveApplicationRequirements } = require('../../services/application-requirements-service');
const { DOCUMENT_SLOTS } = require('../../constants/document-slots');
const { buildApplicantReadiness } = require('../../services/applicant-readiness');
const { JOURNEY_CONFIGS } = require('../../data/journey-config-matrix');

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

function filing(areaTypes) {
    return {
        id: 'app-soil',
        entity: { type: 'JURISTIC' },
        formData: {
            plantId: 'cannabis',
            requestType: 'NEW',
            certScope: 'PLANTING',
            certificationPurposes: ['RESEARCH'],
            farmData: { landOwnership: 'OWNED', areaTypes },
        },
    };
}

const slotOf = (payload, slotId) => payload.slots.find((slot) => slot.slotId === slotId);

describe('ผลตรวจดินไม่บังคับทุกลักษณะพื้นที่ และไม่เคยกั้นการยื่น (คำสั่ง 159 ข้อ b)', () => {
    test.each([
        [['OUTDOOR']],
        [['GREENHOUSE']],
        [['INDOOR']],
        [['OUTDOOR', 'INDOOR']],
        [['OUTDOOR', 'GREENHOUSE', 'INDOOR']],
    ])('areaTypes %j: ช่องดินและช่องน้ำถูกเสนอ ไม่บังคับ ไม่อยู่ในรายการขาด', async (areaTypes) => {
        const payload = await resolveApplicationRequirements(filing(areaTypes), []);
        expect(payload.dims.areaTypes).toEqual(areaTypes);
        ['soil_test', 'water_test'].forEach((slotId) => {
            expect(slotOf(payload, slotId)).toMatchObject({ required: false, requiredReason: null, satisfied: false });
            expect(payload.missingRequired).not.toContain(slotId);
            expect(payload.requiredSlotIds).not.toContain(slotId);
        });
    });

    test('ประตูยื่นปฏิเสธจาก missingRequired เท่านั้น: มีเอกสารบังคับครบแต่ไม่มีผลตรวจดิน = ไม่มีอะไรขาด', async () => {
        const first = await resolveApplicationRequirements(filing(['OUTDOOR']), []);
        const everyRequiredPaper = first.requiredSlotIds.map((documentType) => ({ documentType, supersededAt: null }));
        expect(everyRequiredPaper.length).toBeGreaterThan(0);

        const payload = await resolveApplicationRequirements(filing(['OUTDOOR']), everyRequiredPaper);
        expect(payload.missingRequired).toEqual([]);
        expect(payload.blockingIssues).toEqual([]);
        expect(slotOf(payload, 'soil_test')).toMatchObject({ required: false, satisfied: false });
        expect(slotOf(payload, 'water_test')).toMatchObject({ required: false, satisfied: false });
    });

    test('ผลตรวจดินที่อัปโหลดแล้วนับเป็นหลักฐานของช่องดิน ไม่เปลี่ยนให้เป็นช่องบังคับ', async () => {
        const payload = await resolveApplicationRequirements(filing(['GREENHOUSE']), [{ documentType: 'SOIL_TEST', supersededAt: null }]);
        expect(slotOf(payload, 'soil_test')).toMatchObject({ required: false, satisfied: true });
        expect(slotOf(payload, 'water_test')).toMatchObject({ required: false, satisfied: false });
    });
});

describe('ข้อความบนช่องผลตรวจดินบอกตรง ๆ ว่าเป็นรายงานจากห้องปฏิบัติการที่ผู้ยื่นอัปโหลด', () => {
    const soil = DOCUMENT_SLOTS.SOIL_TEST;
    const soilText = `${soil.name} ${soil.description} ${soil.sourceHint}`;

    test('ชื่อและคำอธิบายครอบคลุมทุกประโยคของคำตัดสิน', () => {
        expect(soil.slotId).toBe('soil_test');
        expect(soil.name).toMatch(/ห้องปฏิบัติการ/);
        expect(soilText).toMatch(/อัปโหลด/);
        expect(soilText).toMatch(/ไม่ใช่เอกสารบังคับ/);
        expect(soilText).toMatch(/เจ้าหน้าที่ไม่เก็บตัวอย่างดินเอง/);
        expect(soilText).toMatch(/ไม่ใช้ดิน/);
    });

    test('ประโยคเดิมที่พูดถึงการที่เจ้าหน้าที่พบความเสี่ยงแล้วขอเพิ่มหายไป', () => {
        expect(soilText).not.toMatch(/เจ้าหน้าที่ขอเพิ่ม/);
        expect(soilText).not.toMatch(/พบความเสี่ยงปนเปื้อน/);
    });

    test('ตามกติกา thai-ui-copy: ไม่มี em dash, มีช่องว่างหน้า ๆ, เรียกผู้ใช้ว่าคุณ', () => {
        [soil.name, soil.description, soil.sourceHint].forEach((text) => {
            expect(text).not.toMatch(/—/);
            expect(text).not.toMatch(/\Sๆ/);
            expect(text).not.toMatch(/ท่าน/);
        });
    });

    test('ช่องผลตรวจน้ำไม่เปลี่ยนในงานนี้ (คำตัดสินเรื่องน้ำยังเป็นชุดเดิม)', () => {
        expect(DOCUMENT_SLOTS.WATER_TEST).toEqual({
            slotId: 'water_test',
            name: 'ผลตรวจคุณภาพน้ำ',
            description: 'ไม่ใช่เอกสารบังคับตอนยื่น แนบได้เมื่อคุณมีผลตรวจอยู่แล้ว หรือเมื่อเจ้าหน้าที่ขอเพิ่มเพราะพบความเสี่ยงปนเปื้อน',
            sourceHint: 'ส่งตัวอย่างน้ำที่ใช้ในแปลงให้ห้องปฏิบัติการที่ได้รับการรับรอง แล้วนำรายงานผลที่มีเลขที่รายงานและวันที่ตรวจมาแนบ',
        });
    });
});

describe('หน้าความพร้อม (GET /readiness) ปฏิบัติกับดินแบบเดียวกับน้ำ', () => {
    const snapshot = (documents) => ({
        user: { firstName: 'สมชาย', lastName: 'ใจดี' },
        farms: [{ id: 'f1' }],
        sopDocuments: [],
        documents,
    });
    const itemOf = (result, id) => result.items.find((item) => item.id === id);

    test('ทั้งน้ำและดินเป็นรายการไม่บังคับ ไม่ถูกนับเป็นสิ่งที่ต้องพร้อมก่อนยื่น', () => {
        const result = buildApplicantReadiness(snapshot([{ documentType: 'SOP_CULTIVATION' }, { documentType: 'ID_CARD' }, { documentType: 'HOUSE_REG' }]));
        expect(itemOf(result, 'water_test')).toMatchObject({ optional: true, ready: false });
        expect(itemOf(result, 'soil_test')).toMatchObject({ optional: true, ready: false });
        expect(result.ready).toBe(true);
        expect(result.readyCount).toBe(4);
        expect(result.totalCount).toBe(4);
        result.items.filter((item) => !item.optional).forEach((item) => expect(item.ready).toBe(true));
    });

    test('มีไฟล์ผลตรวจดินหรือน้ำแล้ว รายการนั้นพร้อม', () => {
        const result = buildApplicantReadiness(snapshot([{ documentType: 'SOIL_TEST' }, { documentType: 'WATER_TEST' }]));
        expect(itemOf(result, 'soil_test').ready).toBe(true);
        expect(itemOf(result, 'water_test').ready).toBe(true);
    });

    test('ข้อความของรายการดินตรงกับคำตัดสิน และชี้ไปที่เดียวกับรายการน้ำ', () => {
        const result = buildApplicantReadiness(snapshot([]));
        const soil = itemOf(result, 'soil_test');
        const water = itemOf(result, 'water_test');
        expect(soil.label).toMatch(/ห้องปฏิบัติการ/);
        expect(soil.description).toMatch(/ไม่บังคับ/);
        expect(soil.description).toMatch(/ไม่ใช้ดิน/);
        expect(soil.actionHref).toBe(water.actionHref);
        expect(water.label).toBe('ผลตรวจคุณภาพน้ำ');
    });

    test('รายการบังคับที่ยังไม่พร้อมยังทำให้ภาพรวมไม่พร้อม', () => {
        const result = buildApplicantReadiness({ ...snapshot([]), farms: [] });
        expect(result.ready).toBe(false);
        expect(itemOf(result, 'farm').ready).toBe(false);
    });
});

describe('ชุด journey เก่าไม่เรียกผลวิเคราะห์ดินว่าเป็นเอกสารบังคับอีก', () => {
    test('ไม่มี requiredDocuments ใดมี soil_analysis_report', () => {
        const offenders = Object.entries(JOURNEY_CONFIGS)
            .filter(([, config]) => (config.requiredDocuments || []).includes('soil_analysis_report'))
            .map(([key]) => key);
        expect(offenders).toEqual([]);
    });
});

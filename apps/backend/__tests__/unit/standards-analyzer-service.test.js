'use strict';

jest.mock('../../shared/logger', () => {
    const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { ...l, createLogger: jest.fn(() => l) };
});

const mockApplicationFindFirst = jest.fn();

jest.mock('../../services/prisma-database', () => ({
    prisma: { application: { findFirst: (...a) => mockApplicationFindFirst(...a) } },
}));

const analyzer = require('../../services/standards-analyzer-service');
const { TOPICS } = require('../../data/standards/gacp-requirement-comparison');
const { deriveDocumentType } = require('../../services/application-document-sync');

const APP_ID = '11111111-1111-4111-8111-111111111111';
const { STATUS } = analyzer;

function application(overrides = {}) {
    return {
        id: APP_ID, applicationNumber: 'APP-001', healthId: 'owner-token', status: 'SUBMITTED',
        formData: {}, documents: [], ...overrides,
    };
}

function docs(...types) {
    return types.map((documentType, i) => ({ id: `d${i}`, documentType }));
}

async function analyze(code, app, actor = { role: 'document_reviewer' }) {
    mockApplicationFindFirst.mockResolvedValue(app);
    return analyzer.analyzeApplication(APP_ID, code, { actor });
}

const byTopic = (result, id) => result.requirements.find((r) => r.id === id);
const channelsOf = (topic) => [...(topic.signals.docs || []), ...(topic.signals.docsSecondary || []), ...(topic.signals.form || [])];

beforeEach(() => mockApplicationFindFirst.mockReset());

describe('analyzeApplication: หัวข้อของมาตรฐานที่เลือก', () => {
    test('WHO มีหัวข้อการเก็บจากธรรมชาติ ASEAN ไม่มี', async () => {
        const who = await analyze('WHO', application());
        const asean = await analyze('ASEAN', application());
        expect(byTopic(who, 'WILD_COLLECTION')).toBeDefined();
        expect(byTopic(asean, 'WILD_COLLECTION')).toBeUndefined();
        expect(who.requirements).toHaveLength(TOPICS.length);
        expect(asean.requirements).toHaveLength(TOPICS.length - 1);
    });

    test('แต่ละข้อบอกเลขข้อ สาระ และแหล่งของมาตรฐานที่เลือก', async () => {
        const water = byTopic(await analyze('ASEAN', application()), 'WATER');
        expect(water.ref).toBe('ASEAN GAP FS ข้อ 19-22, 69-70');
        expect(water.source.url).toContain('asean.org');
        expect(water.isRequired).toBe(true);
    });

    test('ไม่มีผลตรวจน้ำ = ยังไม่ผ่าน พร้อมคำแนะนำ', async () => {
        const water = byTopic(await analyze('WHO', application()), 'WATER');
        expect(water.status).toBe(STATUS.NOT_MET);
        expect(water.recommendation).toContain('ผลตรวจน้ำ');
    });

    test('แนบผลตรวจน้ำ = ผ่าน และบอกเอกสารที่พบ', async () => {
        const water = byTopic(await analyze('THAI_GACP', application({ documents: docs('WATER_TEST') })), 'WATER');
        expect(water.status).toBe(STATUS.MET);
        expect(water.evidence).toContain('WATER_TEST');
    });

    test('ผลตรวจน้ำไม่ตอบหัวข้อดิน', async () => {
        const soil = byTopic(await analyze('WHO', application({ documents: docs('WATER_TEST') })), 'SOIL');
        expect(soil.status).toBe(STATUS.NOT_MET);
    });

    test('ข้อมูลที่กรอกในคำขอ = หลักฐานบางส่วน รอผู้ตรวจยืนยัน', async () => {
        const app = application({ formData: { harvestData: { dryingMethod: 'RACK' } } });
        const post = byTopic(await analyze('WHO', app), 'POST_HARVEST');
        expect(post.status).toBe(STATUS.NEEDS_REVIEW);
        expect(post.evidence).toContain('harvestData.dryingMethod');
    });

    test('รายการว่างในคำขอไม่นับเป็นหลักฐาน', async () => {
        const app = application({ formData: { productionData: { varieties: [] } } });
        const plant = byTopic(await analyze('WHO', app), 'PLANT_MATERIAL');
        expect(plant.evidence).not.toContain('productionData.varieties');
    });

    test('ช่องกรอกที่เป็นอ็อบเจกต์ว่างหรือช่องว่างล้วนไม่นับเป็นหลักฐาน น้ำจึงยังไม่ผ่าน', async () => {
        const app = application({ formData: { farmData: { waterSource: '   ', waterSourceDetail: {} } } });
        const water = byTopic(await analyze('THAI_GACP', app), 'WATER');
        expect(water.status).toBe(STATUS.NOT_MET);
        expect(water.evidence).not.toContain('waterSourceDetail');
    });

    test('อ็อบเจกต์ที่ทุกค่าข้างในว่าง (ซ้อนกี่ชั้นก็ตาม) ไม่นับเป็นหลักฐาน แต่ค่าจริงที่ซ้อนอยู่ข้างในนับ', async () => {
        const allEmpty = { type: '', note: '   ', meters: null, tags: [''], nested: { depth: { label: undefined } } };
        const water = byTopic(await analyze('THAI_GACP', application({ formData: { farmData: { waterSourceDetail: allEmpty } } })), 'WATER');
        expect(water.status).toBe(STATUS.NOT_MET);
        expect(water.evidence).not.toContain('waterSourceDetail');

        const filled = byTopic(await analyze('THAI_GACP', application({ formData: { farmData: { waterSourceDetail: { nested: { depth: { label: 'บ่อบาดาล' } } } } } })), 'WATER');
        expect(filled.status).toBe(STATUS.NEEDS_REVIEW);
        expect(filled.evidence).toContain('waterSourceDetail');
    });

    test('ช่องกรอกที่อ้างถึงตัวเอง (วนซ้ำ) ไม่ทำให้การวิเคราะห์ค้างหรือล้ม', async () => {
        const loop = {};
        loop.self = loop;
        await expect(analyze('THAI_GACP', application({ formData: { farmData: { waterSourceDetail: loop } } }))).resolves.toBeDefined();
    });

    test('การตามสอบไม่ผ่านจากความสามารถของแพลตฟอร์ม คำขอว่างไม่ผ่าน และไม่มีหัวข้อใดอ้างแพลตฟอร์ม', async () => {
        const trace = byTopic(await analyze('ASEAN', application()), 'TRACEABILITY');
        expect(trace.status).not.toBe(STATUS.MET);
        expect(trace.evidence).not.toContain('แพลตฟอร์ม');
        expect(TOPICS.filter((topic) => topic.signals.platform)).toEqual([]);
    });

    test('การตามสอบตัดสินจากหลักฐานของคำขอเอง: แผนที่แปลงและบรรจุภัณฑ์ที่กรอกเป็นหลักฐานบางส่วน', async () => {
        const app = application({ documents: docs('SITE_MAP_COORDS'), formData: { harvestData: { packaging: 'ถุงสุญญากาศติดฉลาก' } } });
        const trace = byTopic(await analyze('THAI_GACP', app), 'TRACEABILITY');
        expect(trace.status).toBe(STATUS.NEEDS_REVIEW);
        expect(trace.evidence).toContain('SITE_MAP_COORDS');
        expect(trace.evidence).toContain('harvestData.packaging');
        expect(trace.recommendation).toContain('รุ่นผลิต');
    });

    test('การตามสอบหลังตรวจแปลงผ่าน: ไทยและ WHO ผ่าน ASEAN รอประเมินเพราะต้องบันทึกปลายทางของล็อต', async () => {
        const app = application({ status: 'AUDIT_PASSED' });
        expect(byTopic(await analyze('THAI_GACP', app), 'TRACEABILITY').status).toBe(STATUS.MET);
        expect(byTopic(await analyze('WHO', app), 'TRACEABILITY').status).toBe(STATUS.MET);
        const asean = byTopic(await analyze('ASEAN', app), 'TRACEABILITY');
        expect(asean.status).toBe(STATUS.NEEDS_REVIEW);
        expect(asean.evidence).toContain('ปลายทางของทุกล็อต');
    });

    test('ผ่านตรวจแปลงแล้ว หัวข้อที่ยืนยันที่แปลงผ่าน รวมน้ำ (รายการตรวจแปลงข้อ 2.1) แต่ดินไม่ผ่านเพราะรายการตรวจแปลงไม่มีข้อดิน', async () => {
        const result = await analyze('THAI_GACP', application({ status: 'AUDIT_PASSED' }));
        expect(byTopic(result, 'PERSONNEL').status).toBe(STATUS.MET);
        expect(byTopic(result, 'WATER').status).toBe(STATUS.MET);
        const soil = byTopic(result, 'SOIL');
        expect(soil.status).toBe(STATUS.NOT_MET);
        expect(soil.evidence).not.toContain('ผู้ตรวจยืนยันหัวข้อนี้ที่แปลง');
    });

    test('ตรวจแปลงยังไม่ผ่าน ดินและน้ำที่ไม่มีผลตรวจยังไม่ผ่าน', async () => {
        const result = await analyze('THAI_GACP', application({ status: 'AUDIT_NOT_PASSED' }));
        expect(byTopic(result, 'SOIL').status).toBe(STATUS.NOT_MET);
        expect(byTopic(result, 'WATER').status).toBe(STATUS.NOT_MET);
    });

    test('ก่อนตรวจแปลง หัวข้อที่ไม่มีช่องยื่นในคำขอ (บุคลากร การทบทวน) ยังรอประเมิน ไม่ใช่ยังไม่ผ่าน', async () => {
        const result = await analyze('WHO', application());
        expect(byTopic(result, 'PERSONNEL').status).toBe(STATUS.NEEDS_REVIEW);
        expect(byTopic(result, 'REVIEW').status).toBe(STATUS.NEEDS_REVIEW);
        expect(TOPICS.filter((topic) => !topic.signals.manual && channelsOf(topic).length === 0).map((topic) => topic.id)).toEqual(['PERSONNEL', 'REVIEW']);
    });

    test('การตรวจสารปนเปื้อนต่อรอบเก็บเกี่ยวรอผู้ประเมิน พร้อมเหตุผล', async () => {
        const lab = byTopic(await analyze('THAI_GACP', application()), 'CONTAMINANT_TESTING');
        expect(lab.status).toBe(STATUS.NEEDS_REVIEW);
        expect(lab.evidence).toContain('รอบเก็บเกี่ยว');
    });

    test('สรุปนับครบ และความพร้อมเป็นร้อยละ', async () => {
        const result = await analyze('WHO', application({ documents: docs('WATER_TEST', 'SOIL_TEST') }));
        const { summary } = result;
        expect(summary.met + summary.notMet + summary.needsReview).toBe(summary.total);
        expect(summary.readinessPct).toBe(Math.round((summary.met / summary.total) * 100));
    });
});

describe('คำตัดสินรู้มาตรฐาน: หลักฐานที่ตอบเกณฑ์ไทยไม่ทำให้ข้อที่มีสิ่งต้องทำเพิ่มผ่าน (A5 ข้อ 1)', () => {
    const cellsWithExtraRequired = TOPICS.flatMap((topic) => ['WHO', 'ASEAN']
        .filter((code) => topic.clauses[code].extraRequired && !topic.signals.manual)
        .map((code) => ({ topic: topic.id, code, extraRequired: topic.clauses[code].extraRequired })));

    test('ผลตรวจน้ำทำให้ข้อน้ำของไทยผ่าน แต่ WHO และ ASEAN ที่มีสิ่งต้องทำเพิ่มรอประเมินและบอกสิ่งที่ขาด', async () => {
        const app = application({ documents: docs('WATER_TEST') });
        expect(byTopic(await analyze('THAI_GACP', app), 'WATER').status).toBe(STATUS.MET);
        const who = byTopic(await analyze('WHO', app), 'WATER');
        expect(who.status).toBe(STATUS.NEEDS_REVIEW);
        expect(who.evidence).toContain('WATER_TEST');
        expect(who.evidence).toContain('โรคที่มีพาหะนำ');
        const asean = byTopic(await analyze('ASEAN', app), 'WATER');
        expect(asean.status).toBe(STATUS.NEEDS_REVIEW);
        expect(asean.evidence).toContain('เทียบเท่าน้ำดื่ม');
    });

    test('ผลตรวจดินทำให้ข้อดินของไทยและ WHO ผ่าน (WHO ไม่มีสิ่งต้องทำเพิ่ม) แต่ ASEAN รอประเมิน', async () => {
        const app = application({ documents: docs('SOIL_TEST') });
        expect(byTopic(await analyze('THAI_GACP', app), 'SOIL').status).toBe(STATUS.MET);
        expect(byTopic(await analyze('WHO', app), 'SOIL').status).toBe(STATUS.MET);
        const asean = byTopic(await analyze('ASEAN', app), 'SOIL');
        expect(asean.status).toBe(STATUS.NEEDS_REVIEW);
        expect(asean.evidence).toContain('การรมดิน');
    });

    test('ตรวจแปลงผ่านตามเกณฑ์ไทย: พื้นที่ของ WHO ผ่าน แต่ของ ASEAN รอประเมินเพราะต้องมีบันทึกประเมินความเสี่ยงพื้นที่', async () => {
        const app = application({ status: 'AUDIT_PASSED' });
        expect(byTopic(await analyze('WHO', app), 'SITE').status).toBe(STATUS.MET);
        const asean = byTopic(await analyze('ASEAN', app), 'SITE');
        expect(asean.status).toBe(STATUS.NEEDS_REVIEW);
        expect(asean.evidence).toContain('ผ่านการตรวจประเมิน ณ แปลงแล้ว');
        expect(asean.evidence).toContain('ประเมินความเสี่ยงของพื้นที่');
    });

    test.each(cellsWithExtraRequired)('$code $topic: ตรวจแปลงผ่านและมีเอกสารหลักครบก็ยังไม่ผ่าน เพราะยังไม่มีหลักฐานของ "$extraRequired"', async ({ topic, code, extraRequired }) => {
        const allPrimary = TOPICS.flatMap((t) => t.signals.docs || []);
        const cell = byTopic(await analyze(code, application({ status: 'CERTIFIED', documents: docs(...allPrimary) })), topic);
        expect(cell.status).toBe(STATUS.NEEDS_REVIEW);
        expect(cell.evidence).toContain(extraRequired);
    });

    test('มีช่องที่ต้องทำเพิ่มให้ทดสอบจริง และไม่มีช่องไทยที่มีสิ่งต้องทำเพิ่ม', () => {
        expect(cellsWithExtraRequired.length).toBeGreaterThan(10);
        expect(TOPICS.filter((topic) => topic.clauses.THAI_GACP.extraRequired)).toEqual([]);
    });
});

describe('คำขอที่ไม่มีอะไรเลยในหัวข้อที่มีช่องยื่น = ยังไม่ผ่าน ไม่ใช่รอประเมิน (A5 ข้อ 3)', () => {
    const topicsWithChannel = TOPICS
        .filter((topic) => !topic.signals.manual && channelsOf(topic).length > 0)
        .map((topic) => ({ topic: topic.id }));

    test('หัวข้อที่มีช่องยื่นมี 15 หัวข้อ ที่เหลือคือบุคลากร การทบทวน และสองหัวข้อที่ให้ผู้เชี่ยวชาญประเมิน', () => {
        expect(topicsWithChannel).toHaveLength(TOPICS.length - 4);
    });

    test.each(topicsWithChannel)('$topic: ร่างเปล่ายังไม่ผ่านทั้งสามมาตรฐาน พร้อมคำแนะนำ', async ({ topic }) => {
        for (const code of ['THAI_GACP', 'WHO', 'ASEAN']) {
            const cell = byTopic(await analyze(code, application({ status: 'DRAFT' })), topic);
            if (!cell) { continue; }
            expect(cell.status).toBe(STATUS.NOT_MET);
            expect(cell.recommendation).toBeTruthy();
        }
    });

    test('คำขอที่มีแต่เอกสารสิทธิ์ที่ดิน: พื้นที่รอประเมิน ปุ๋ยยังไม่ผ่าน บุคลากรรอประเมิน', async () => {
        const result = await analyze('THAI_GACP', application({ documents: docs('LAND_RIGHTS') }));
        expect(byTopic(result, 'SITE').status).toBe(STATUS.NEEDS_REVIEW);
        expect(byTopic(result, 'FERTILISER').status).toBe(STATUS.NOT_MET);
        expect(byTopic(result, 'PERSONNEL').status).toBe(STATUS.NEEDS_REVIEW);
    });
});

describe('ชื่อช่องเอกสารที่เปลี่ยนไป', () => {
    test('โฉนดที่เก็บด้วยชื่อเก่า LAND_DEED ยังนับเป็นหลักฐานพื้นที่ และบอกชื่อที่อยู่ในคำขอ', async () => {
        const site = byTopic(await analyze('WHO', application({ documents: docs('LAND_DEED') })), 'SITE');
        expect(site.status).toBe(STATUS.NEEDS_REVIEW);
        expect(site.evidence).toContain('LAND_DEED');
    });

    test('SOP รายเรื่องฉบับเก่าไม่ทำให้หัวข้อบันทึกข้อมูลผ่าน', async () => {
        const records = byTopic(await analyze('WHO', application({ documents: docs('SOP_PEST') })), 'RECORDS');
        expect(records.status).toBe(STATUS.NEEDS_REVIEW);
        expect(records.evidence).toContain('SOP_PEST');
    });

    test('คู่มือ SOP ฉบับเดียวไม่ทำให้หัวข้อใดผ่านเอง', async () => {
        const result = await analyze('WHO', application({ documents: docs('SOP_MANUAL') }));
        const passedBySop = result.requirements.filter((r) => r.status === STATUS.MET && r.evidence.includes('SOP_MANUAL'));
        expect(passedBySop).toEqual([]);
    });

    const DOCUMENT_SIGNALS = TOPICS.flatMap((topic) => [
        ...(topic.signals.docs || []).map((slot) => ({ topic: topic.id, slot, expected: STATUS.MET })),
        ...(topic.signals.docsSecondary || []).map((slot) => ({ topic: topic.id, slot, expected: STATUS.NEEDS_REVIEW })),
    ]);

    test.each(DOCUMENT_SIGNALS)('$topic อ่านเอกสาร $slot ที่ประตูอัปโหลดเก็บไว้', async ({ topic, slot, expected }) => {
        const stored = deriveDocumentType(slot);
        const result = byTopic(await analyze('THAI_GACP', application({ documents: docs(stored) })), topic);
        expect(result.status).toBe(expected);
        expect(result.evidence).toContain(stored);
    });
});

describe('analyzeApplication: ข้อผิดพลาด', () => {
    test('มาตรฐานที่ไม่อยู่ในตารางเทียบ = 404 STANDARD_NOT_FOUND', async () => {
        await expect(analyzer.analyzeApplication(APP_ID, 'FDA', { actor: {} }))
            .rejects.toMatchObject({ statusCode: 404, code: 'STANDARD_NOT_FOUND' });
        expect(mockApplicationFindFirst).not.toHaveBeenCalled();
    });

    test('คำขอที่ไม่มี = 404 APPLICATION_NOT_FOUND', async () => {
        mockApplicationFindFirst.mockResolvedValue(null);
        await expect(analyzer.analyzeApplication(APP_ID, 'WHO', { actor: {} }))
            .rejects.toMatchObject({ statusCode: 404, code: 'APPLICATION_NOT_FOUND' });
    });

    test('ผู้ยื่นที่ไม่ใช่เจ้าของ = 404 เหมือนไม่มีคำขอ', async () => {
        await expect(analyze('WHO', application(), { role: 'HEALTH', canonicalId: 'someone-else' }))
            .rejects.toMatchObject({ statusCode: 404, code: 'APPLICATION_NOT_FOUND' });
    });

    test('ผู้ยื่นที่เป็นเจ้าของอ่านได้', async () => {
        const result = await analyze('WHO', application(), { role: 'health', canonicalId: 'owner-token' });
        expect(result.application.id).toBe(APP_ID);
    });
});

describe('getAseanComparison', () => {
    test('ยังคืนตาราง 10 ประเทศ', () => {
        expect(analyzer.getAseanComparison().map((row) => row.countryCode))
            .toEqual(['TH', 'VN', 'ID', 'MY', 'PH', 'SG', 'MM', 'KH', 'LA', 'BN']);
    });
});

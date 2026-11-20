'use strict';

/**
 * ต้นแบบที่ 1: ตารางเทียบข้อกำหนด ไทย · WHO · ASEAN ต้องอ้างเอกสารต้นทางได้ทุกช่อง
 *
 * - ทุกหัวข้อมีช่องครบสามมาตรฐาน ทุกช่องมีเลขข้อ สาระ และแหล่งอ้างอิงที่มีอยู่จริงในรายการแหล่ง
 * - แหล่งอ้างอิงเป็นเว็บของหน่วยงานเจ้าของเอกสาร (.go.th · who.int · asean.org)
 * - ช่อง WHO/ASEAN ที่ไทยไม่มีข้อเรื่องนั้นต้องบอกว่าต้องทำหรือแนะนำให้ทำอะไรเพิ่ม
 * - ระดับของช่องตามถ้อยคำของเอกสารต้นทาง: WHO GACP 2003 เขียน should ทั้งฉบับ (ข้อแนะนำ) มี must
 *   ไม่กี่ประโยค ส่วน มกษ. 3502 และ ASEAN GAP เขียนข้อเป็นประโยคบอกเล่าให้ทำ (ข้อกำหนด ไม่ใช่ "ข้อบังคับ" คำสั่ง 154)
 *   "ต้องทำเพิ่ม" นับเฉพาะข้อกำหนดหรือประโยค must ที่ไทยไม่มี ข้อแนะนำนับแยกเป็น "แนะนำให้ทำเพิ่ม"
 * - WHO GACP ไม่กำหนดตัวเลขโลหะหนัก (seed เดิมอ้างผิดว่ากำหนด)
 * - CSV เปิดใน spreadsheet เป็นภาษาไทยได้ หนึ่งแถวต่อหัวข้อต่อมาตรฐาน
 */

jest.mock('../../services/prisma-database', () => ({ prisma: {} }));

const { SOURCES, LEVEL, STANDARDS, TOPICS } = require('../../data/standards/gacp-requirement-comparison');
const { getComparison, comparisonCsv, GAP } = require('../../services/standards-analyzer-service');
const { slotIdSpellings } = require('../../routes/api/applications/validation-slot-utils');

const CODES = STANDARDS.map((standard) => standard.code);
const OFFICIAL_HOSTS = /^https:\/\/([a-z0-9-]+\.)*(go\.th|who\.int|asean\.org)\//;

function cell(topicId, code) {
    return getComparison().topics.find((topic) => topic.id === topicId).cells.find((c) => c.standardCode === code);
}

describe('ตารางเทียบข้อกำหนดอ้างเอกสารต้นทางได้ทุกช่อง', () => {
    test('สามมาตรฐาน: ไทยเป็นฐานเทียบ แล้ว WHO และ ASEAN', () => {
        expect(CODES).toEqual(['THAI_GACP', 'WHO', 'ASEAN']);
        expect(getComparison().baseline).toBe('THAI_GACP');
    });

    test.each(TOPICS.map((topic) => [topic.id, topic]))('%s มีช่องครบสามมาตรฐาน พร้อมเลขข้อ สาระ และแหล่ง', (id, topic) => {
        expect(Object.keys(topic.clauses).sort()).toEqual([...CODES].sort());
        CODES.forEach((code) => {
            const clause = topic.clauses[code];
            expect(Object.values(LEVEL)).toContain(clause.level);
            expect(clause.ref.trim().length).toBeGreaterThan(0);
            expect(clause.text.trim().length).toBeGreaterThan(20);
            expect(SOURCES[clause.sourceId]).toBeDefined();
            expect(STANDARDS.find((s) => s.code === code).sourceIds).toContain(clause.sourceId);
        });
    });

    test('ทุกแหล่งอ้างอิงอยู่บนเว็บของหน่วยงานเจ้าของเอกสาร และบอกวันที่อ่าน', () => {
        Object.values(SOURCES).forEach((source) => {
            expect(source.url).toMatch(OFFICIAL_HOSTS);
            expect(source.fileUrl).toMatch(OFFICIAL_HOSTS);
            expect(source.readOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });
    });

    test('ช่องที่ไทยไม่มีข้อเรื่องนั้นแต่มาตรฐานอื่นมี ต้องบอกสิ่งที่ต้องทำหรือแนะนำให้ทำเพิ่ม', () => {
        TOPICS.forEach((topic) => {
            if (topic.clauses.THAI_GACP.level !== LEVEL.ABSENT) { return; }
            ['WHO', 'ASEAN'].forEach((code) => {
                if (topic.clauses[code].level === LEVEL.ABSENT) { return; }
                const clause = topic.clauses[code];
                expect(clause.extraRequired || clause.extraRecommended).toEqual(expect.any(String));
            });
        });
    });

    test('ฐานเทียบไม่มีสิ่งที่ต้องทำเพิ่มเทียบกับตัวเอง', () => {
        TOPICS.forEach((topic) => {
            expect(topic.clauses.THAI_GACP.extraRequired).toBeUndefined();
            expect(topic.clauses.THAI_GACP.extraRecommended).toBeUndefined();
        });
    });

    test('ระดับของช่องตามถ้อยคำต้นทาง: WHO เป็นข้อแนะนำ (should) ไทยและ ASEAN เป็นข้อกำหนด', () => {
        ['SITE', 'SOIL', 'AGROCHEMICALS'].forEach((id) => {
            expect(cell(id, 'WHO').level).toBe(LEVEL.RECOMMENDED);
            expect(cell(id, 'THAI_GACP').level).toBe(LEVEL.REQUIRED);
            expect(cell(id, 'ASEAN').level).toBe(LEVEL.REQUIRED);
        });
        expect(TOPICS.filter((topic) => topic.clauses.WHO.level === LEVEL.REQUIRED).map((t) => t.id)).toEqual([]);
    });

    test('ข้อแนะนำของ WHO ที่ต่างจากไทยเป็น "แนะนำให้ทำเพิ่ม" ไม่ใช่ "ต้องทำเพิ่ม" ส่วนประโยค must ของ WHO ยังนับเป็นต้องทำเพิ่ม', () => {
        ['SITE', 'SOIL', 'AGROCHEMICALS'].forEach((id) => {
            expect(cell(id, 'WHO').gap).toBe(GAP.RECOMMENDS);
            expect(cell(id, 'WHO').extraRequired).toBeNull();
            expect(cell(id, 'WHO').extraRecommended).not.toMatch(/เป็นข้อปฏิบัติ|เป็นข้อบังคับ/);
        });
        expect(cell('WATER', 'WHO').gap).toBe(GAP.ADD);
        expect(cell('WATER', 'WHO').extraRequired).toContain('พาหะ');
        getComparison().topics.forEach((topic) => topic.cells.filter((c) => c.gap).forEach((c) => {
            expect(c.gap === GAP.ADD).toBe(Boolean(c.extraRequired));
            expect(c.gap === GAP.RECOMMENDS).toBe(!c.extraRequired && Boolean(c.extraRecommended));
        }));
    });

    test('ตัวเลขบนจอ: WHO ต้องทำเพิ่ม 4 แนะนำให้ทำเพิ่ม 13 · ASEAN ต้องทำเพิ่ม 14', () => {
        const { summary } = getComparison();
        expect(summary.WHO).toEqual({ topics: 18, add: 4, recommends: 13, thaiCovers: 1, notInStandard: 0 });
        expect(summary.ASEAN).toEqual({ topics: 18, add: 14, recommends: 0, thaiCovers: 3, notInStandard: 1 });
    });

    test('WHO GACP ไม่กำหนดตัวเลขเกณฑ์สารปนเปื้อน ตัวเลขในหัวข้อนี้เป็นของประกาศกรมฯ', () => {
        expect(cell('CONTAMINANT_TESTING', 'WHO').text).not.toMatch(/ppm|mg\/kg/);
        expect(cell('CONTAMINANT_TESTING', 'THAI_GACP').text).toContain('ตะกั่ว ≤ 5 ppm');
        expect(cell('CONTAMINANT_TESTING', 'THAI_GACP').sourceId).toBe('DTAM_CANNABIS_GACP_2568');
    });

    test('ASEAN อ้าง ASEAN GAP และบอกตรง ๆ ว่าเขียนสำหรับผักผลไม้สด', () => {
        const asean = getComparison().standards.find((s) => s.code === 'ASEAN');
        expect(asean.sources.map((s) => s.id)).toEqual(['ASEAN_GAP_2006']);
        expect(asean.scopeNote).toContain('ผักและผลไม้สด');
    });

    test('ช่องว่างต่อหัวข้อมาจากระดับและสิ่งที่ต้องทำหรือแนะนำให้ทำเพิ่ม', () => {
        expect(cell('RECORDS', 'WHO').gap).toBe(GAP.RECOMMENDS);
        expect(cell('RECORDS', 'WHO').extraRecommended).toContain('3 ปี');
        expect(cell('CONTAMINANT_TESTING', 'WHO').gap).toBe(GAP.THAI_COVERS);
        expect(cell('WILD_COLLECTION', 'ASEAN').gap).toBe(GAP.NOT_IN_STANDARD);
        expect(cell('WILD_COLLECTION', 'THAI_GACP').gap).toBeNull();
    });

    test('สรุปต่อมาตรฐานนับครบทุกหัวข้อ', () => {
        const { summary, topics } = getComparison();
        ['WHO', 'ASEAN'].forEach((code) => {
            const s = summary[code];
            expect(s.topics).toBe(topics.length);
            expect(s.add + s.recommends + s.thaiCovers + s.notInStandard).toBe(topics.length);
        });
    });

    test('ช่องเอกสารหลักฐานหลักไม่ใช่ช่องที่รวมเอกสารหลายฉบับไว้ด้วยกัน', () => {
        TOPICS.forEach((topic) => (topic.signals.docs || []).forEach((slot) => {
            expect(slotIdSpellings(slot)).toHaveLength(1);
        }));
    });
});

describe('CSV ของตารางเทียบ', () => {
    const csv = comparisonCsv();
    const lines = csv.trimEnd().split('\r\n');

    test('ขึ้นต้นด้วย BOM ให้ spreadsheet อ่านภาษาไทยถูก', () => {
        expect(csv.charCodeAt(0)).toBe(0xFEFF);
    });

    test('หัวตาราง แล้วหนึ่งแถวต่อหัวข้อต่อมาตรฐาน', () => {
        expect(lines[0]).toContain('"หัวข้อ","มาตรฐาน","ระดับ","ข้อที่อ้าง"');
        expect(lines[0]).toContain('"สิ่งที่ต้องทำเพิ่ม","สิ่งที่แนะนำให้ทำเพิ่ม"');
        expect(lines).toHaveLength(1 + TOPICS.length * STANDARDS.length);
    });

    test('แถวบอกเลขข้อ ช่องว่าง และ URL ของแหล่ง', () => {
        const row = lines.find((line) => line.includes('WHO GACP ข้อ 4.2, 4.6'));
        expect(row).toContain('"ข้อแนะนำ"');
        expect(row).toContain('"แนะนำให้ทำเพิ่ม"');
        expect(lines.find((line) => line.includes('WHO GACP ข้อ 2.3.5'))).toContain('"ต้องทำเพิ่ม"');
        expect(row).toContain('https://www.who.int/publications/i/item/9241546271');
    });
});

describe('ถ้อยคำไม่อ้างเกินจริง (คำสั่ง 154 · รอบ 3)', () => {
    test('ระดับของข้อกำหนดใช้คำว่า "ข้อกำหนด" ไม่ใช่ "ข้อบังคับ" ทั้งในตาราง หมายเหตุ และ CSV', () => {
        const comparison = getComparison();
        expect(JSON.stringify(comparison)).not.toContain('ข้อบังคับ');
        expect(comparisonCsv()).not.toContain('ข้อบังคับ');
        expect(comparisonCsv().split('\r\n').find((line) => line.includes('มกษ. 3502-2561 ข้อ 2'))).toContain('"ข้อกำหนด"');
    });

    test('ASEAN GAP: หมายเหตุบอกว่าเป็นต้นแบบให้ GAP ระดับประเทศ ไม่มีระบบรับรองของอาเซียนเอง และไม่อ้างการรับรอง', () => {
        const asean = getComparison().standards.find((standard) => standard.code === 'ASEAN');
        expect(asean.scopeNote).toContain('ไม่มีระบบรับรองของอาเซียนเอง');
        expect(asean.scopeNote).not.toContain('เพื่อรับการรับรอง');
        expect(JSON.stringify(SOURCES.ASEAN_GAP_2006)).not.toContain('เพื่อรับการรับรอง');
    });

    test('WHO 3.1: ใบอนุญาตเก็บจากธรรมชาติคงเงื่อนไข "ในบางประเทศ" ของต้นทาง', () => {
        const who = cell('WILD_COLLECTION', 'WHO');
        expect(who.text).toContain('ในบางประเทศ');
        expect(who.extraRequired).toContain('ในบางประเทศ');
        expect(who.gap).toBe(GAP.ADD);
    });

    test('WHO 5.1 และ 5.1.1 อยู่ในช่องสิ่งแวดล้อม: เคารพ CBD และทำข้อตกลงแบ่งปันผลประโยชน์เป็นลายลักษณ์อักษรก่อนเก็บหรือปลูก', () => {
        const who = cell('ENVIRONMENT', 'WHO');
        expect(who.ref).toMatch(/5\.1(?!\.2)/);
        expect(who.ref).toContain('5.1.1');
        expect(who.text).toContain('CBD');
        expect(who.text).toContain('ลายลักษณ์อักษร');
        expect(who.extraRequired).toContain('CBD');
        expect(who.extraRequired).toContain('ลายลักษณ์อักษร');
        expect(who.gap).toBe(GAP.ADD);
    });
});

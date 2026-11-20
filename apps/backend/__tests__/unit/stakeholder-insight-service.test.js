'use strict';

/**
 * ต้นแบบที่ 3: วิเคราะห์ข้อความความต้องการของผู้มีส่วนได้ส่วนเสีย
 *
 * - ประโยคสรุปทุกประโยคคัดมาจากข้อความต้นทางตรงตัว ไม่มีประโยคที่ระบบแต่งขึ้น
 * - ประเด็นนับจำนวนข้อความที่มีคำในคลังคำ ข้อความหนึ่งเข้าได้หลายประเด็น
 * - คำสำคัญนับจำนวนข้อความ ไม่ใช่จำนวนครั้งที่พิมพ์ซ้ำ
 * - เลือกแหล่ง: มีข้อความในระบบใช้ข้อความในระบบ ไม่มีใช้ชุดข้อความสาธารณะ ผู้อ่านเลือกเองได้
 * - ชุดข้อความสาธารณะทุกข้อมีแหล่ง URL และกลุ่มผู้พูดที่รู้จัก
 */

const mockAnswers = jest.fn();
const mockInterviews = jest.fn();

jest.mock('../../services/prisma-database', () => ({
    prisma: {
        surveyAnswer: { findMany: (...a) => mockAnswers(...a) },
        expertInterview: { findMany: (...a) => mockInterviews(...a) },
    },
}));

const insight = require('../../services/stakeholder-insight-service');
const { CORPUS_SOURCES, CORPUS_EXCERPTS } = require('../../data/research/stakeholder-needs-corpus');
const { NEED_THEMES, STAKEHOLDER_GROUPS } = require('../../data/research/stakeholder-need-themes');

const DOCS = [
    { id: 'a', group: 'FARMER', text: 'ค่าใช้จ่ายในการตรวจแปลงสูงมาก และห้องปฏิบัติการที่ตรวจวิเคราะห์ได้อยู่ไกลจากแปลง ต้องเดินทางนานหลายชั่วโมงทุกครั้งที่ส่งตัวอย่าง' },
    { id: 'b', group: 'FARMER', text: 'อยากมีตลาดรับซื้อที่แน่นอน ราคาไม่ตกเมื่อผลผลิตออกพร้อมกัน ราคาไม่ตก ราคาไม่ตก' },
    { id: 'c', group: 'EXPERT', text: 'เกษตรกรต้องการความรู้และการอบรมเรื่องการเขียนเอกสาร SOP ก่อนยื่นคำขอ เพราะเอกสารถูกตีกลับหลายรอบ' },
];

beforeEach(() => {
    mockAnswers.mockReset().mockResolvedValue([]);
    mockInterviews.mockReset().mockResolvedValue([]);
});

describe('analyzeTexts', () => {
    const result = insight.analyzeTexts(DOCS);
    const theme = (id) => result.themes.find((t) => t.id === id);

    test('นับข้อความและกลุ่มผู้ให้ข้อมูล', () => {
        expect(result.documentCount).toBe(3);
        expect(result.groups).toEqual([
            { group: 'FARMER', label: 'เกษตรกร', documents: 2 },
            { group: 'EXPERT', label: 'ผู้เชี่ยวชาญ', documents: 1 },
        ]);
    });

    test('ข้อความหนึ่งเข้าได้หลายประเด็น และนับเป็นจำนวนข้อความ', () => {
        expect(theme('COST').documents).toBe(1);
        expect(theme('LAB_TESTING').documents).toBe(1);
        expect(theme('MARKET').documents).toBe(1);
        expect(theme('KNOWLEDGE').documents).toBe(1);
        expect(theme('PROCESS').documents).toBe(1);
        expect(theme('INCOME').documents).toBe(0);
        expect(theme('COST').share).toBe(33);
    });

    test('ประเด็นบอกคำในคลังคำที่ทำให้ข้อความเข้าประเด็นนั้น', () => {
        expect(theme('LAB_TESTING').terms.map((t) => t.term)).toEqual(expect.arrayContaining(['ห้องปฏิบัติการ', 'ตรวจวิเคราะห์']));
        expect(theme('LAB_TESTING').lexicon).toEqual(NEED_THEMES.find((t) => t.id === 'LAB_TESTING').terms);
    });

    test('ประโยคสรุปทุกประโยคคัดมาจากข้อความต้นทางตรงตัว', () => {
        const quoted = [...result.summary.keySentences, ...result.themes.map((t) => t.example).filter(Boolean)];
        expect(quoted.length).toBeGreaterThan(0);
        quoted.forEach((sentence) => {
            const source = DOCS.find((d) => d.id === sentence.documentId);
            expect(source.text).toContain(sentence.text);
        });
    });

    test('ประโยคสรุปไม่ซ้ำข้อความเดียวกัน', () => {
        const ids = result.summary.keySentences.map((s) => s.documentId);
        expect(new Set(ids).size).toBe(ids.length);
    });

    test('คำที่พิมพ์ซ้ำในข้อความเดียวนับครั้งเดียว', () => {
        const once = insight.analyzeTexts([{ id: 'x', group: 'FARMER', text: 'ราคา ราคา ราคา ราคา' }]);
        expect(once.keywords.find((k) => k.term === 'ราคา')).toEqual({ term: 'ราคา', documents: 1 });
    });

    test('บรรทัดสรุปบอกจำนวนจริงของประเด็นอันดับแรกและประเด็นที่ไม่พบ', () => {
        expect(result.summary.lines[0]).toBe('วิเคราะห์ 3 ข้อความ จาก 2 กลุ่ม (เกษตรกร 2 · ผู้เชี่ยวชาญ 1)');
        expect(result.summary.lines[1]).toMatch(/^ประเด็นที่พบมากอันดับ 1: .+ พบใน 1 จาก 3 ข้อความ/);
        expect(result.summary.lines.at(-1)).toContain('รายได้และความมั่นคงของเกษตรกร');
    });

    test('ไม่มีข้อความ ไม่มีสรุป', () => {
        const empty = insight.analyzeTexts([{ id: 'e', group: 'FARMER', text: '   ' }]);
        expect(empty.documentCount).toBe(0);
        expect(empty.summary.lines).toEqual([]);
        expect(empty.summary.keySentences).toEqual([]);
    });
});

describe('splitSentences', () => {
    test('ทุกประโยคเป็นส่วนหนึ่งของข้อความเดิมตรงตัว แม้มีเว้นวรรคซ้อนและขึ้นบรรทัดใหม่', () => {
        const text = 'ผู้เชี่ยวชาญเห็นว่าเกษตรกรต้องการอบรมการเขียนเอกสาร  SOP ก่อนยื่นคำขอ\nต้องการที่ปรึกษา';
        const sentences = insight.splitSentences(text);
        expect(sentences).toEqual(['ผู้เชี่ยวชาญเห็นว่าเกษตรกรต้องการอบรมการเขียนเอกสาร  SOP ก่อนยื่นคำขอ', 'ต้องการที่ปรึกษา']);
        sentences.forEach((sentence) => expect(text).toContain(sentence));
    });

    test('ไม่ทำตัวอักษรหาย', () => {
        CORPUS_EXCERPTS.forEach((excerpt) => {
            const joined = insight.splitSentences(excerpt.text).join(' ');
            expect(joined.replace(/\s+/g, '')).toBe(excerpt.text.replace(/\s+/g, ''));
        });
    });
});

describe('ชุดข้อความสาธารณะ', () => {
    test('ทุกข้อมีแหล่ง URL วันที่เผยแพร่ และกลุ่มผู้พูดที่รู้จัก', () => {
        expect(CORPUS_EXCERPTS.length).toBe(19);
        CORPUS_EXCERPTS.forEach((excerpt) => {
            const source = CORPUS_SOURCES[excerpt.sourceId];
            expect(source.url).toMatch(/^https:\/\//);
            expect(source.published).toMatch(/^\d{4}/);
            expect(STAKEHOLDER_GROUPS[excerpt.group]).toBeDefined();
            expect(excerpt.text.length).toBeLessThanOrEqual(400);
        });
    });
});

describe('getStakeholderInsights: เลือกแหล่งข้อความ', () => {
    test('ไม่มีข้อความในระบบ ใช้ชุดข้อความสาธารณะ และบอกว่าใช้ชุดไหน', async () => {
        const result = await insight.getStakeholderInsights({ scope: { organizationId: 'o1' } });
        expect(result.basis).toBe('CORPUS');
        expect(result.available).toEqual({ system: 0, corpus: CORPUS_EXCERPTS.length });
        expect(result.documentCount).toBe(CORPUS_EXCERPTS.length);
        expect(result.summary.keySentences[0].source.url).toMatch(/^https:\/\//);
    });

    test('มีคำตอบในระบบ ใช้คำตอบในระบบ ไม่ปนกับชุดสาธารณะ', async () => {
        mockAnswers.mockResolvedValue([{
            id: 'ans1', valueText: DOCS[0].text,
            question: { questionText: 'ปัญหาที่พบ' }, response: { template: { title: 'แบบสำรวจภาคเหนือ', targetGroup: 'FARMER' } },
        }]);
        mockInterviews.mockResolvedValue([{ id: 'iv1', title: 'สัมภาษณ์ 1', transcript: DOCS[2].text, keyInsights: ['ต้องการที่ปรึกษา'] }]);
        const result = await insight.getStakeholderInsights({ scope: { organizationId: 'o1' } });
        expect(result.basis).toBe('SYSTEM');
        expect(result.documentCount).toBe(2);
        expect(result.documents.map((d) => d.id)).toEqual(['answer:ans1', 'interview:iv1']);
    });

    test('อ่านเฉพาะองค์กรของผู้อ่าน และไม่อ่านคำตอบที่ถอนความยินยอมแล้ว', async () => {
        await insight.getStakeholderInsights({ scope: { organizationId: 'o1' } });
        const where = mockAnswers.mock.calls[0][0].where;
        expect(where.organizationId).toBe('o1');
        expect(where.response.researchConsentWithdrawnAt).toBeNull();
        expect(where.NOT.valueText).toBe(require('../../services/survey-service').REDACTED_TEXT);
        const interviewWhere = mockInterviews.mock.calls[0][0].where;
        expect(interviewWhere).toMatchObject({ organizationId: 'o1', isDeleted: false, intervieweeConsentWithdrawnAt: null });
    });

    test('ผู้อ่านเลือกชุดสาธารณะได้แม้มีคำตอบในระบบ', async () => {
        mockAnswers.mockResolvedValue([{
            id: 'ans1', valueText: DOCS[0].text,
            question: { questionText: 'q' }, response: { template: { title: 't', targetGroup: 'FARMER' } },
        }]);
        const result = await insight.getStakeholderInsights({ basis: 'CORPUS', scope: { organizationId: 'o1' } });
        expect(result.basis).toBe('CORPUS');
        expect(result.available.system).toBe(1);
    });

    test('แหล่งที่ไม่รู้จัก = 400', async () => {
        await expect(insight.getStakeholderInsights({ basis: 'WEB' }))
            .rejects.toMatchObject({ statusCode: 400, code: 'INSIGHT_BASIS_INVALID' });
    });
});

'use strict';

/**
 * Survey Service — สัญญา C05F680149 ต้นแบบที่ 2 "ระบบสำรวจความต้องการ (1 ชุด)"
 *
 * ERP document contract under test (contract C05F680149 acceptance mapping ข้อ 2):
 *   - SurveyTemplate = master document with status machine DRAFT→ACTIVE→CLOSED
 *     (frozen enum + per-transition Set guard + typed err.code + idempotent
 *     no-op — mirrors quotation-service).
 *   - SurveyResponse = POSTED document: submit validates region (4 ภาค),
 *     required questions, per-type answers, and question ownership; free-text
 *     answers are masked with maskThaiIdsInText before persist (PII invariant).
 *   - Stats = per-question aggregates + Thai keyword extraction (text-mining
 *     3.1, stdlib Intl.Segmenter).
 *   - CSV export uses the shared formula-injection guard (CWE-1236).
 *   - ExpertInterview transcript + keyInsights masked at write.
 * Errors carry .statusCode/.code at the throw site.
 */

jest.mock('../../shared/logger', () => {
    const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { ...l, createLogger: jest.fn(() => l) };
});

const mockTemplateCreate = jest.fn();
const mockTemplateFindFirst = jest.fn();
const mockTemplateFindMany = jest.fn();
const mockTemplateUpdate = jest.fn();
const mockQuestionCreate = jest.fn();
const mockQuestionCreateMany = jest.fn();
const mockResponseCreate = jest.fn();
const mockResponseFindMany = jest.fn();
const mockAnswerCreate = jest.fn();
const mockAnswerCreateMany = jest.fn();
const mockInterviewCreate = jest.fn();
const mockInterviewFindMany = jest.fn();

const txMock = {
    surveyTemplate: { create: (...a) => mockTemplateCreate(...a), update: (...a) => mockTemplateUpdate(...a) },
    surveyQuestion: { create: (...a) => mockQuestionCreate(...a), createMany: (...a) => mockQuestionCreateMany(...a) },
    surveyResponse: { create: (...a) => mockResponseCreate(...a) },
    surveyAnswer: { create: (...a) => mockAnswerCreate(...a), createMany: (...a) => mockAnswerCreateMany(...a) },
};

jest.mock('../../services/prisma-database', () => ({
    prisma: {
        surveyTemplate: {
            create: (...a) => mockTemplateCreate(...a),
            findFirst: (...a) => mockTemplateFindFirst(...a),
            findMany: (...a) => mockTemplateFindMany(...a),
            update: (...a) => mockTemplateUpdate(...a),
        },
        surveyQuestion: { create: (...a) => mockQuestionCreate(...a), createMany: (...a) => mockQuestionCreateMany(...a) },
        surveyResponse: {
            create: (...a) => mockResponseCreate(...a),
            findMany: (...a) => mockResponseFindMany(...a),
        },
        surveyAnswer: { create: (...a) => mockAnswerCreate(...a), createMany: (...a) => mockAnswerCreateMany(...a) },
        expertInterview: {
            create: (...a) => mockInterviewCreate(...a),
            findMany: (...a) => mockInterviewFindMany(...a),
        },
        $transaction: async (fn) => fn(txMock),
    },
}));

const surveyService = require('../../services/survey-service');
const { RESEARCH_CONSENT_NOTICE } = require('../../shared/research-consent-notice');
const { extractThaiKeywords } = require('../../utils/thai-keywords');

const TEMPLATE_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR = { id: 'user-uuid-1', role: 'ADMIN' };
const RESPONDENT = { id: 'farmer-uuid', role: 'health' };
const CONSENT = { accepted: true, version: RESEARCH_CONSENT_NOTICE.version };

function templateWithQuestions(overrides = {}) {
    return {
        id: TEMPLATE_ID,
        code: 'FARMER-NEEDS-2569',
        title: 'แบบสำรวจความต้องการเกษตรกร',
        targetGroup: 'FARMER',
        status: 'ACTIVE',
        isDeleted: false,
        questions: [
            { id: 'q1', questionText: 'ปลูกสมุนไพรชนิดใด', questionType: 'TEXT', isRequired: true, sortOrder: 1 },
            { id: 'q2', questionText: 'ความพึงพอใจต่อระบบ', questionType: 'RATING_5', isRequired: true, sortOrder: 2 },
            { id: 'q3', questionText: 'ช่องทางการขาย', questionType: 'SINGLE_CHOICE', choices: ['ตลาดสด', 'ออนไลน์', 'สหกรณ์'], isRequired: false, sortOrder: 3 },
            { id: 'q4', questionText: 'พื้นที่ปลูก (ไร่)', questionType: 'NUMBER', isRequired: false, sortOrder: 4 },
        ],
        ...overrides,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockTemplateCreate.mockImplementation(async ({ data }) => ({ id: TEMPLATE_ID, ...data }));
    mockQuestionCreate.mockImplementation(async ({ data }) => ({ id: `q-${data.sortOrder}`, ...data }));
    mockResponseCreate.mockImplementation(async ({ data }) => ({ id: 'resp-1', ...data }));
    mockAnswerCreate.mockImplementation(async ({ data }) => ({ id: `ans-${data.questionId}`, ...data }));
    mockQuestionCreateMany.mockImplementation(async ({ data }) => ({ count: data.length }));
    mockAnswerCreateMany.mockImplementation(async ({ data }) => ({ count: data.length }));
    mockInterviewCreate.mockImplementation(async ({ data }) => ({ id: 'int-1', ...data }));
});

describe('survey-service.createTemplate', () => {
    test('valid payload creates template + questions inside one transaction', async () => {
        const result = await surveyService.createTemplate({
            code: 'FARMER-NEEDS-2569',
            title: 'แบบสำรวจความต้องการเกษตรกร 4 ภาค',
            targetGroup: 'FARMER',
            questions: [
                { questionText: 'ปลูกอะไร', questionType: 'TEXT', isRequired: true },
                { questionText: 'พึงพอใจแค่ไหน', questionType: 'RATING_5', isRequired: true },
            ],
        }, { actor: ACTOR });

        expect(result.id).toBe(TEMPLATE_ID);
        expect(mockTemplateCreate).toHaveBeenCalledTimes(1);
        // N questions cost ONE insert (N+1 batching, Step 3)
        expect(mockQuestionCreate).not.toHaveBeenCalled();
        expect(mockQuestionCreateMany).toHaveBeenCalledTimes(1);
        const questionRows = mockQuestionCreateMany.mock.calls[0][0].data;
        expect(questionRows).toHaveLength(2);
        // createdBy stamps the actor UUID (never a national id)
        expect(mockTemplateCreate.mock.calls[0][0].data.createdBy).toBe('user-uuid-1');
        // questions get 1-based sortOrder
        expect(questionRows[0].sortOrder).toBe(1);
        expect(questionRows[1].sortOrder).toBe(2);
    });

    test('zero questions → 400 SURVEY_TEMPLATE_INVALID', async () => {
        await expect(surveyService.createTemplate({
            code: 'X', title: 'ว่าง', questions: [],
        }, { actor: ACTOR })).rejects.toMatchObject({ statusCode: 400, code: 'SURVEY_TEMPLATE_INVALID' });
    });

    test('duplicate code (Prisma P2002) → 409 SURVEY_TEMPLATE_CODE_EXISTS (not 500)', async () => {
        const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        mockTemplateCreate.mockRejectedValueOnce(p2002);
        await expect(surveyService.createTemplate({
            code: 'DUP', title: 'ซ้ำ',
            questions: [{ questionText: 'q', questionType: 'TEXT' }],
        }, { actor: ACTOR })).rejects.toMatchObject({ statusCode: 409, code: 'SURVEY_TEMPLATE_CODE_EXISTS' });
    });

    test('choice question without choices → 400 SURVEY_TEMPLATE_INVALID', async () => {
        await expect(surveyService.createTemplate({
            code: 'X', title: 'มีตัวเลือกแต่ไม่ใส่ choices',
            questions: [{ questionText: 'เลือก', questionType: 'SINGLE_CHOICE' }],
        }, { actor: ACTOR })).rejects.toMatchObject({ statusCode: 400, code: 'SURVEY_TEMPLATE_INVALID' });
    });
});

describe('survey-service template status machine (DRAFT→ACTIVE→CLOSED)', () => {
    test('activate: DRAFT → ACTIVE stamps activatedAt', async () => {
        mockTemplateFindFirst.mockResolvedValue({ id: TEMPLATE_ID, status: 'DRAFT', isDeleted: false });
        mockTemplateUpdate.mockImplementation(async ({ data }) => ({ id: TEMPLATE_ID, ...data }));

        const result = await surveyService.activateTemplate(TEMPLATE_ID);
        expect(result.status).toBe('ACTIVE');
        expect(mockTemplateUpdate.mock.calls[0][0].data.activatedAt).toBeInstanceOf(Date);
    });

    test('activate: already ACTIVE → idempotent no-op (no update call)', async () => {
        mockTemplateFindFirst.mockResolvedValue({ id: TEMPLATE_ID, status: 'ACTIVE', isDeleted: false });
        const result = await surveyService.activateTemplate(TEMPLATE_ID);
        expect(result.status).toBe('ACTIVE');
        expect(mockTemplateUpdate).not.toHaveBeenCalled();
    });

    test('activate: CLOSED → 409 INVALID_SURVEY_TEMPLATE_STATUS', async () => {
        mockTemplateFindFirst.mockResolvedValue({ id: TEMPLATE_ID, status: 'CLOSED', isDeleted: false });
        await expect(surveyService.activateTemplate(TEMPLATE_ID))
            .rejects.toMatchObject({ statusCode: 409, code: 'INVALID_SURVEY_TEMPLATE_STATUS' });
    });

    test('close: ACTIVE → CLOSED; DRAFT → 409', async () => {
        mockTemplateFindFirst.mockResolvedValue({ id: TEMPLATE_ID, status: 'ACTIVE', isDeleted: false });
        mockTemplateUpdate.mockImplementation(async ({ data }) => ({ id: TEMPLATE_ID, ...data }));
        const closed = await surveyService.closeTemplate(TEMPLATE_ID);
        expect(closed.status).toBe('CLOSED');

        mockTemplateFindFirst.mockResolvedValue({ id: TEMPLATE_ID, status: 'DRAFT', isDeleted: false });
        await expect(surveyService.closeTemplate(TEMPLATE_ID))
            .rejects.toMatchObject({ statusCode: 409, code: 'INVALID_SURVEY_TEMPLATE_STATUS' });
    });

    test('unknown template → 404 SURVEY_NOT_FOUND', async () => {
        mockTemplateFindFirst.mockResolvedValue(null);
        await expect(surveyService.activateTemplate(TEMPLATE_ID))
            .rejects.toMatchObject({ statusCode: 404, code: 'SURVEY_NOT_FOUND' });
    });
});

describe('survey-service.submitResponse', () => {
    test('template not ACTIVE → 409 SURVEY_NOT_ACTIVE', async () => {
        mockTemplateFindFirst.mockResolvedValue(templateWithQuestions({ status: 'DRAFT' }));
        await expect(surveyService.submitResponse(TEMPLATE_ID, {
            researchConsent: CONSENT,
            region: 'NORTH',
            answers: [{ questionId: 'q1', value: 'ขมิ้นชัน' }, { questionId: 'q2', value: 5 }],
        }, { actor: RESPONDENT })).rejects.toMatchObject({ statusCode: 409, code: 'SURVEY_NOT_ACTIVE' });
    });

    test('invalid region → 400 (4 ภาคเท่านั้น: NORTH/CENTRAL/NORTHEAST/SOUTH)', async () => {
        mockTemplateFindFirst.mockResolvedValue(templateWithQuestions());
        await expect(surveyService.submitResponse(TEMPLATE_ID, {
            researchConsent: CONSENT,
            region: 'EAST',
            answers: [{ questionId: 'q1', value: 'ขิง' }, { questionId: 'q2', value: 4 }],
        }, { actor: RESPONDENT })).rejects.toMatchObject({ statusCode: 400 });
    });

    test('duplicate questionId → 400 DUPLICATE_QUESTION (not a 500 from Prisma P2002)', async () => {
        mockTemplateFindFirst.mockResolvedValue(templateWithQuestions());
        await expect(surveyService.submitResponse(TEMPLATE_ID, {
            researchConsent: CONSENT,
            region: 'NORTH',
            answers: [
                { questionId: 'q1', value: 'ขิง' },
                { questionId: 'q2', value: 4 },
                { questionId: 'q1', value: 'ซ้ำ' }, // duplicate → would hit @@unique
            ],
        }, { actor: RESPONDENT })).rejects.toMatchObject({ statusCode: 400, code: 'DUPLICATE_QUESTION' });
        // guarded before the transaction ever opens
        expect(mockResponseCreate).not.toHaveBeenCalled();
    });

    test('missing required answer → 400 MISSING_REQUIRED_ANSWERS', async () => {
        mockTemplateFindFirst.mockResolvedValue(templateWithQuestions());
        await expect(surveyService.submitResponse(TEMPLATE_ID, {
            researchConsent: CONSENT,
            region: 'SOUTH',
            answers: [{ questionId: 'q1', value: 'ไพล' }], // q2 (required rating) missing
        }, { actor: RESPONDENT })).rejects.toMatchObject({ statusCode: 400, code: 'MISSING_REQUIRED_ANSWERS' });
    });

    test('answer for a question not in the template → 400 INVALID_QUESTION', async () => {
        mockTemplateFindFirst.mockResolvedValue(templateWithQuestions());
        await expect(surveyService.submitResponse(TEMPLATE_ID, {
            researchConsent: CONSENT,
            region: 'CENTRAL',
            answers: [
                { questionId: 'q1', value: 'กัญชา' },
                { questionId: 'q2', value: 3 },
                { questionId: 'foreign-q', value: 'x' },
            ],
        }, { actor: RESPONDENT })).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_QUESTION' });
    });

    test('RATING_5 out of range / NUMBER non-numeric / choice not in list → 400 INVALID_ANSWER', async () => {
        mockTemplateFindFirst.mockResolvedValue(templateWithQuestions());

        await expect(surveyService.submitResponse(TEMPLATE_ID, {
            researchConsent: CONSENT,
            region: 'NORTH',
            answers: [{ questionId: 'q1', value: 'ขิง' }, { questionId: 'q2', value: 6 }],
        }, { actor: RESPONDENT })).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_ANSWER' });

        await expect(surveyService.submitResponse(TEMPLATE_ID, {
            researchConsent: CONSENT,
            region: 'NORTH',
            answers: [
                { questionId: 'q1', value: 'ขิง' }, { questionId: 'q2', value: 4 },
                { questionId: 'q4', value: 'ไม่ใช่ตัวเลข' },
            ],
        }, { actor: RESPONDENT })).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_ANSWER' });

        await expect(surveyService.submitResponse(TEMPLATE_ID, {
            researchConsent: CONSENT,
            region: 'NORTH',
            answers: [
                { questionId: 'q1', value: 'ขิง' }, { questionId: 'q2', value: 4 },
                { questionId: 'q3', value: 'ตัวเลือกปลอม' },
            ],
        }, { actor: RESPONDENT })).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_ANSWER' });
    });

    test('a national ID typed in Thai digits is masked at write as the approved notice promises; text without one keeps its Thai digits (K16 review)', async () => {
        mockTemplateFindFirst.mockResolvedValue(templateWithQuestions());
        await surveyService.submitResponse(TEMPLATE_ID, {
            researchConsent: CONSENT,
            region: 'NORTHEAST',
            province: 'ขอนแก่น',
            answers: [
                { questionId: 'q1', value: 'เลขบัตรผม ๑๑๐๑๗๐๐๒๐๗๐๓๐ ครับ' },
                { questionId: 'q2', value: 4 },
                { questionId: 'q3', value: 'สหกรณ์' },
            ],
        }, { actor: RESPONDENT });
        const stored = mockAnswerCreateMany.mock.calls[0][0].data.find(r => r.questionId === 'q1').valueText;
        expect(stored).toBe('เลขบัตรผม 1-XXXX-XXXX-X-7030 ครับ');

        mockAnswerCreateMany.mockClear();
        await surveyService.submitResponse(TEMPLATE_ID, {
            researchConsent: CONSENT,
            region: 'NORTHEAST',
            answers: [
                { questionId: 'q1', value: 'ปลูก ๓ ไร่ ปี ๒๕๖๙' },
                { questionId: 'q2', value: 4 },
                { questionId: 'q3', value: 'สหกรณ์' },
            ],
        }, { actor: RESPONDENT });
        expect(mockAnswerCreateMany.mock.calls[0][0].data.find(r => r.questionId === 'q1').valueText).toBe('ปลูก ๓ ไร่ ปี ๒๕๖๙');
    });

    test('valid submit: creates response + answer rows; text masked; rating in valueNumber', async () => {
        mockTemplateFindFirst.mockResolvedValue(templateWithQuestions());

        const result = await surveyService.submitResponse(TEMPLATE_ID, {
            researchConsent: CONSENT,
            region: 'NORTHEAST',
            province: 'ขอนแก่น',
            answers: [
                { questionId: 'q1', value: 'เลขบัตรผม 1101700207030 ครับ ปลูกขมิ้นชัน' },
                { questionId: 'q2', value: 4 },
                { questionId: 'q3', value: 'สหกรณ์' },
            ],
        }, { actor: RESPONDENT });

        expect(result.id).toBe('resp-1');
        expect(mockResponseCreate).toHaveBeenCalledTimes(1);
        expect(mockResponseCreate.mock.calls[0][0].data.respondentUserId).toBe('farmer-uuid');
        expect(mockResponseCreate.mock.calls[0][0].data.region).toBe('NORTHEAST');
        // N answers cost ONE insert (N+1 batching, Step 3)
        expect(mockAnswerCreate).not.toHaveBeenCalled();
        expect(mockAnswerCreateMany).toHaveBeenCalledTimes(1);
        const answerRows = mockAnswerCreateMany.mock.calls[0][0].data;
        expect(answerRows).toHaveLength(3);

        const textAnswer = answerRows.find(r => r.questionId === 'q1');
        expect(textAnswer.valueText).not.toContain('1101700207030'); // masked
        expect(textAnswer.valueText).toContain('ขมิ้นชัน');

        const ratingAnswer = answerRows.find(r => r.questionId === 'q2');
        expect(ratingAnswer.valueNumber).toBe(4);
    });

    test('province free-text is masked at persist (national id typed into จังหวัด)', async () => {
        mockTemplateFindFirst.mockResolvedValue(templateWithQuestions());
        await surveyService.submitResponse(TEMPLATE_ID, {
            researchConsent: CONSENT,
            region: 'CENTRAL',
            province: 'กรุงเทพ 1101700207030',
            answers: [
                { questionId: 'q1', value: 'ปลูกกัญชา' },
                { questionId: 'q2', value: 3 },
                { questionId: 'q3', value: 'สหกรณ์' },
            ],
        }, { actor: RESPONDENT });

        const persistedProvince = mockResponseCreate.mock.calls[0][0].data.province;
        expect(persistedProvince).not.toContain('1101700207030'); // masked
        expect(persistedProvince).toContain('กรุงเทพ');
    });
});

describe('survey respondent key (SURVEY_RESPONDENT_KEY)', () => {
    const KEYS = ['NODE_ENV', 'SURVEY_RESPONDENT_KEY', 'HMAC_KEY'];
    const saved = {};
    beforeEach(() => { for (const k of KEYS) { saved[k] = process.env[k]; } });
    afterEach(() => {
        for (const k of KEYS) {
            if (saved[k] === undefined) { delete process.env[k]; } else { process.env[k] = saved[k]; }
        }
    });

    test.each(['production', 'development'])('%s: no SURVEY_RESPONDENT_KEY = 503, even when HMAC_KEY is set; nothing written', async (nodeEnv) => {
        delete process.env.SURVEY_RESPONDENT_KEY;
        process.env.HMAC_KEY = 'h'.repeat(48);
        process.env.NODE_ENV = nodeEnv;
        let service;
        jest.isolateModules(() => { service = require('../../services/survey-service'); });
        mockTemplateFindFirst.mockResolvedValue(templateWithQuestions());
        await expect(service.submitResponse(TEMPLATE_ID, {
            researchConsent: CONSENT,
            region: 'NORTH',
            answers: [{ questionId: 'q1', value: 'ขิง' }, { questionId: 'q2', value: 4 }],
        }, { actor: RESPONDENT })).rejects.toMatchObject({ statusCode: 503, code: 'SURVEY_RESPONDENT_KEY_UNAVAILABLE' });
        expect(mockResponseCreate).not.toHaveBeenCalled();
    });
});

describe('research consent notice (order 40: บพข. co-funds the research and receives no data)', () => {
    const noticeText = () => JSON.stringify(RESEARCH_CONSENT_NOTICE);

    test('v3 names only the university as the research partner and never sends data to the funder', () => {
        expect(RESEARCH_CONSENT_NOTICE.version).toBe('research-survey-notice-th-v3');
        expect(noticeText()).not.toMatch(/บพข|หน่วยบริหารและจัดการทุน|Data Lake/);
        const purpose = RESEARCH_CONSENT_NOTICE.sections.find(s => s.heading === 'วัตถุประสงค์').body;
        expect(purpose).toContain('มหาวิทยาลัยราชภัฏสวนสุนันทา');
        const withdrawal = RESEARCH_CONSENT_NOTICE.sections.find(s => s.heading === 'การถอนความยินยอม').body;
        expect(withdrawal).toContain('คลังข้อมูลวิจัยของโครงการ');
    });

    test('consent given to the v2 wording is refused with 409, so the respondent rereads v3', async () => {
        mockTemplateFindFirst.mockResolvedValue(templateWithQuestions());
        await expect(surveyService.submitResponse(TEMPLATE_ID, {
            region: 'NORTH',
            answers: [{ questionId: 'q2', value: 4 }],
            researchConsent: { accepted: true, version: 'research-survey-notice-th-v2' },
        }, { actor: RESPONDENT })).rejects.toMatchObject({ statusCode: 409, code: 'RESEARCH_CONSENT_VERSION_STALE' });
        expect(mockResponseCreate).not.toHaveBeenCalled();
    });
});

describe('survey-service.getTemplateStats', () => {
    test('aggregates rating avg + choice counts + region breakdown + text keywords', async () => {
        mockTemplateFindFirst.mockResolvedValue(templateWithQuestions());
        mockResponseFindMany.mockResolvedValue([
            {
                id: 'r1', region: 'NORTH', submittedAt: new Date('2026-07-01'),
                answers: [
                    { questionId: 'q1', valueText: 'อยากได้ราคาปุ๋ยถูกลง และตลาดรับซื้อสมุนไพร', valueNumber: null },
                    { questionId: 'q2', valueText: null, valueNumber: 4 },
                    { questionId: 'q3', valueText: 'ตลาดสด', valueNumber: null },
                ],
            },
            {
                id: 'r2', region: 'SOUTH', submittedAt: new Date('2026-07-02'),
                answers: [
                    { questionId: 'q1', valueText: 'ตลาดรับซื้อไม่แน่นอน ราคาผันผวน', valueNumber: null },
                    { questionId: 'q2', valueText: null, valueNumber: 2 },
                    { questionId: 'q3', valueText: 'ตลาดสด', valueNumber: null },
                ],
            },
        ]);

        const stats = await surveyService.getTemplateStats(TEMPLATE_ID, { aggregateOnly: false });

        expect(stats.totalResponses).toBe(2);
        expect(stats.regionBreakdown).toEqual(expect.objectContaining({ NORTH: 1, SOUTH: 1 }));

        const rating = stats.questions.find(q => q.questionId === 'q2');
        expect(rating.average).toBe(3);
        expect(rating.count).toBe(2);

        const choice = stats.questions.find(q => q.questionId === 'q3');
        expect(choice.choiceCounts).toEqual(expect.objectContaining({ 'ตลาดสด': 2 }));

        const text = stats.questions.find(q => q.questionId === 'q1');
        expect(Array.isArray(text.topKeywords)).toBe(true);
        // "ตลาด" appears in both answers — must surface as a keyword
        expect(text.topKeywords.map(k => k.word)).toEqual(expect.arrayContaining(['ตลาด']));
    });
});

describe('survey-service.getTemplateStats aggregate-only (order 34(5))', () => {
    test('a template still taking answers shows no numbers at all', async () => {
        mockTemplateFindFirst.mockResolvedValue({ ...templateWithQuestions(), status: 'ACTIVE' });
        const stats = await surveyService.getTemplateStats(TEMPLATE_ID);
        expect(stats).toEqual(expect.objectContaining({ aggregateOnly: true, statisticsAvailable: false }));
        expect(stats.questions).toBeUndefined();
        expect(mockResponseFindMany).not.toHaveBeenCalled();
    });

    test('closed: a lone small cell takes its next-smallest neighbour with it, names dropped, totals banded', async () => {
        mockTemplateFindFirst.mockResolvedValue({ ...templateWithQuestions(), status: 'CLOSED' });
        const response = (i, region, choice, text) => ({
            id: `r${i}`, respondentUserId: `u${i}`, region, submittedAt: new Date('2026-07-01'),
            answers: [
                { questionId: 'q1', valueText: text, valueNumber: null },
                { questionId: 'q2', valueText: null, valueNumber: 4 },
                { questionId: 'q3', valueText: choice, valueNumber: null },
            ],
        });
        mockResponseFindMany.mockResolvedValue([
            ...[1, 2, 3, 4, 5, 6, 7].map(i => response(i, 'NORTH', 'ตลาดสด', 'ตลาดรับซื้อ')),
            ...[8, 9, 10, 11, 12].map(i => response(i, 'CENTRAL', 'ขายส่ง', 'ตลาดกลาง')),
            response(13, 'SOUTH', 'ออนไลน์', 'ติดต่อนายสมชายบ้านเลขที่เก้า'),
        ]);

        const stats = await surveyService.getTemplateStats(TEMPLATE_ID);

        expect(stats.aggregateOnly).toBe(true);
        expect(stats.statisticsAvailable).toBe(true);
        expect(stats.smallCountThreshold).toBe(surveyService.SMALL_COUNT_THRESHOLD);
        expect(stats.regionBreakdown).toBeNull();
        expect(stats.regionBreakdownBand).toEqual({ NORTH: '0-9' });
        expect(stats.regionBreakdownHasSuppressedCells).toBe(true);
        expect(stats.totalResponses).toBeNull();
        expect(stats.totalResponsesBand).toBe('10-19');
        const rating = stats.questions.find(q => q.questionId === 'q2');
        expect(rating).toMatchObject({ average: 4, min: null, max: null, count: null, countBand: '10-19' });
        const choice = stats.questions.find(q => q.questionId === 'q3');
        expect(choice.choiceCounts).toEqual({ 'ตลาดสด': 7 });
        expect(JSON.stringify(stats)).not.toMatch(/ออนไลน์|ขายส่ง|SOUTH|CENTRAL/);
        // withdrawal redacts free text, so free-text keywords are never part of the aggregates
        expect(stats.questions.find(q => q.questionId === 'q1').topKeywords).toBeNull();
        expect(JSON.stringify(stats)).not.toMatch(/รับซื้อ|ตลาดกลาง|สมชาย/);
    });

    test('closed, nothing small: exact totals, no band', async () => {
        mockTemplateFindFirst.mockResolvedValue({ ...templateWithQuestions(), status: 'CLOSED' });
        mockResponseFindMany.mockResolvedValue([1, 2, 3, 4, 5].map(i => ({
            id: `r${i}`, respondentUserId: `u${i}`, region: 'NORTH', submittedAt: new Date('2026-07-01'),
            answers: [{ questionId: 'q3', valueText: 'ตลาดสด', valueNumber: null }],
        })));
        const stats = await surveyService.getTemplateStats(TEMPLATE_ID);
        expect(stats.totalResponses).toBe(5);
        expect(stats.totalResponsesBand).toBeNull();
        expect(stats.regionBreakdown).toEqual({ NORTH: 5 });
        expect(stats.regionBreakdownBand).toBeNull();
        expect(stats.questions.find(q => q.questionId === 'q3')).toMatchObject({ choiceCounts: { 'ตลาดสด': 5 }, count: 5, hasSuppressedCells: false });
    });

    /** One closed survey, every response in NORTH, q3 answered per `choices` ({ choice: count }). */
    async function statsForChoices(choices) {
        mockTemplateFindFirst.mockResolvedValue({ ...templateWithQuestions(), status: 'CLOSED' });
        let i = 0;
        mockResponseFindMany.mockResolvedValue(Object.entries(choices).flatMap(([choice, count]) =>
            Array.from({ length: count }, () => {
                i += 1;
                return {
                    id: `r${i}`, respondentUserId: `u${i}`, region: 'NORTH', submittedAt: new Date('2026-07-01'),
                    answers: [{ questionId: 'q3', valueText: choice, valueNumber: null }],
                };
            })));
        return surveyService.getTemplateStats(TEMPLATE_ID);
    }

    test('A=6 B=1 C=1 in one region: the hidden cells sum to 2, so A goes too, or the region total minus 6 gives B=1 C=1 back', async () => {
        const stats = await statsForChoices({ 'ตลาดสด': 6, 'ขายส่ง': 1, 'ออนไลน์': 1 });
        const choice = stats.questions.find(q => q.questionId === 'q3');
        expect(choice.choiceCounts).toEqual({});
        expect(choice.hasSuppressedCells).toBe(true);
        expect(stats.totalResponses).toBeNull();
        expect(stats.regionBreakdown).toBeNull();
        expect(JSON.stringify(stats)).not.toMatch(/"NORTH":8|"count":8/);
    });

    test('A=6 B=3 C=4: the hidden cells already sum to 7, so A stays shown', async () => {
        const stats = await statsForChoices({ 'ตลาดสด': 6, 'ขายส่ง': 3, 'ออนไลน์': 4 });
        const choice = stats.questions.find(q => q.questionId === 'q3');
        expect(choice.choiceCounts).toEqual({ 'ตลาดสด': 6 });
        expect(choice.hasSuppressedCells).toBe(true);
    });

    test('once totals are banded, the region breakdown is banded too, so it cannot sum back to the exact total', async () => {
        const stats = await statsForChoices({ 'ตลาดสด': 6, 'ขายส่ง': 3, 'ออนไลน์': 4 });
        expect(stats.totalResponses).toBeNull();
        expect(stats.totalResponsesBand).toBe('10-19');
        expect(stats.regionBreakdown).toBeNull();
        expect(stats.regionBreakdownBand).toEqual({ NORTH: '10-19' });
        expect(JSON.stringify(stats)).not.toContain('13');
    });
});

describe('survey-service.exportResponsesCsv', () => {
    test('one column per question in sortOrder; formula cells neutralized; BOM prefix', async () => {
        mockTemplateFindFirst.mockResolvedValue(templateWithQuestions());
        mockResponseFindMany.mockResolvedValue([
            {
                id: 'r1', region: 'NORTH', province: 'เชียงใหม่', submittedAt: new Date('2026-07-01T00:00:00Z'),
                answers: [
                    { questionId: 'q1', valueText: '=SUM(A1:A9)', valueNumber: null },
                    { questionId: 'q2', valueText: null, valueNumber: 5 },
                ],
            },
        ]);

        const csv = await surveyService.exportResponsesCsv(TEMPLATE_ID);

        expect(csv.startsWith('﻿')).toBe(true); // Excel-Thai BOM
        const lines = csv.replace('﻿', '').split('\n');
        expect(lines[0]).toContain('ปลูกสมุนไพรชนิดใด');
        expect(csv).toContain("'=SUM(A1:A9)"); // CWE-1236 neutralized
        expect(csv).not.toMatch(/(^|,)=SUM/m);
    });
});

describe('survey-service.createInterview (ต้นแบบ 2.2)', () => {
    test('transcript + keyInsights masked; recordedBy stamps actor UUID', async () => {
        const result = await surveyService.createInterview({
            title: 'สัมภาษณ์ผู้เชี่ยวชาญกรมฯ',
            intervieweeName: 'ดร.ตัวอย่าง',
            interviewDate: '2026-07-01',
            mode: 'ONLINE',
            transcript: 'ผู้ให้ข้อมูลเลขบัตร 1101700207030 กล่าวว่าระบบควรลดขั้นตอนเอกสาร',
            keyInsights: ['ลดขั้นตอนเอกสาร', 'เลข 1101700207030 ต้องถูก mask'],
            intervieweeConsentGiven: true,
            intervieweeConsentDate: '2026-07-01',
        }, { actor: ACTOR });

        expect(result.id).toBe('int-1');
        expect(mockInterviewCreate.mock.calls[0][0].data.intervieweeConsentGiven).toBe(true);
        const data = mockInterviewCreate.mock.calls[0][0].data;
        expect(data.transcript).not.toContain('1101700207030');
        expect(JSON.stringify(data.keyInsights)).not.toContain('1101700207030');
        expect(data.recordedBy).toBe('user-uuid-1');
    });

    test('missing required fields → 400 INTERVIEW_INVALID', async () => {
        await expect(surveyService.createInterview({ title: '' }, { actor: ACTOR }))
            .rejects.toMatchObject({ statusCode: 400, code: 'INTERVIEW_INVALID' });
    });
});

describe('utils/thai-keywords.extractThaiKeywords (text-mining 3.1)', () => {
    test('segments Thai text, drops stopwords, returns sorted frequency list', () => {
        const keywords = extractThaiKeywords([
            'อยากให้ราคาสมุนไพรดีขึ้น และมีตลาดรับซื้อแน่นอน',
            'ตลาดรับซื้อสมุนไพรมีน้อย ราคาไม่แน่นอน',
        ], { top: 10 });

        expect(Array.isArray(keywords)).toBe(true);
        expect(keywords.length).toBeGreaterThan(0);
        const words = keywords.map(k => k.word);
        expect(words).toEqual(expect.arrayContaining(['ตลาด', 'สมุนไพร', 'ราคา']));
        // stopwords must not surface
        expect(words).not.toEqual(expect.arrayContaining(['และ']));
        // sorted by count desc
        for (let i = 1; i < keywords.length; i++) {
            expect(keywords[i - 1].count).toBeGreaterThanOrEqual(keywords[i].count);
        }
    });

    test('empty/non-Thai-safe input → empty list (no crash)', () => {
        expect(extractThaiKeywords([])).toEqual([]);
        expect(extractThaiKeywords([null, undefined, ''])).toEqual([]);
    });
});

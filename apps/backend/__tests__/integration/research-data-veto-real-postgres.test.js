/**
 * ข้อมูลวิจัย: ปิดช่องที่ security review ยับยั้ง (H1, M1-M5, L1, L2, L4) บน Postgres จริง
 *
 * H1  ชุดข้อมูลทุกชุดส่งออกโดยไม่มีรหัสจริงตัวใดเลย (รวม path ของการสแกน QR)
 * M1  สถิติรวม: ปิดช่องเล็ก แล้วปิดช่องถัดไปจนผลรวมของช่องที่ปิดถึงเกณฑ์ ไม่บอกชื่อช่องที่ปิด ยอดรวมและยอดรายภาคเป็นช่วง
 * M2  ผู้ที่เห็นแค่สถิติรวมเห็นสถิติเมื่อปิดรับคำตอบแล้วเท่านั้น
 * M3  คำสำคัญนับจำนวนผู้ตอบ ไม่ใช่จำนวนครั้งที่พิมพ์ · คำสำคัญจากข้อความอิสระไม่อยู่ในสถิติรวม (ผู้ดูแลกรมเห็นเท่านั้น)
 * M5  ทำบทสัมภาษณ์ให้ระบุตัวไม่ได้ ล้างชื่อเรื่องด้วย และทำได้กับแถวที่ลบแบบ soft delete
 * L1  วันที่ยินยอมว่าง = ปฏิเสธ · ยินยอมหลังวันสัมภาษณ์ = ปฏิเสธ
 * L2  รายการรหัสแฝงของคำตอบที่ถอนแล้ว สำหรับลบออกจากคลังข้อมูลวิจัยของโครงการ (system_admin_dtam เท่านั้น)
 * L4  ส่งออกคำตอบแบบสำรวจมีแค่วันที่ส่ง ไม่มีเวลา
 */

'use strict';

process.env.TENANT_READ_ORG_SCOPE = 'false';
// its own key: the export refuses the test-run fallback of config/secrets.js like any published key
process.env.DATASET_PSEUDONYM_KEY = `research-veto-test-key-${'v'.repeat(24)}`;

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { RESEARCH_CONSENT_NOTICE } = require('../../shared/research-consent-notice');
const { DATASET_DOMAINS } = require('../../data/datasets/dataset-domains');

const mockActor = { current: null };
// farm-operation domains leave only under a research-use ruling in force with its ethics approval on file
// (orders 49 Q2, 56(4.3)); these suites check what leaves, so one is in force
jest.mock('../../data/datasets/research-use-bases', () => ({
    RESEARCH_USE_BASES: {
        FARM_OPERATION: [{
            effectiveFrom: '2026-01-01', inForce: true, privacyNoticeVersion: 'test-notice',
            ethicsApproval: { committee: 'คณะกรรมการจริยธรรมการวิจัยทดสอบ', reference: 'TEST-ETHICS-1', approvedOn: '2025-12-01' }, ruling: 'test',
        }],
    },
}));

jest.mock('../../middleware/auth-middleware', () => {
    const actual = jest.requireActual('../../middleware/auth-middleware');
    const { tenantContextMiddleware } = jest.requireActual('../../middleware/tenant-context-middleware');
    const bindTenant = tenantContextMiddleware();
    const attach = (req, res, next) => {
        req.user = { ...mockActor.current };
        return bindTenant(req, res, next);
    };
    return { ...actual, authenticateAny: attach, authenticateHealth: attach, authenticateProvider: attach, authenticateToken: attach };
});

const CONSENT = { accepted: true, version: RESEARCH_CONSENT_NOTICE.version };
const PERSON_NAME = 'สมศรีมณีรัตน์';
const NON_ADMIN_STAFF = [
    'document_reviewer', 'dispatcher', 'field_inspector', 'certificate_approver',
    'finance_officer_dtam', 'finance_officer_platform', 'system_admin_platform',
];

d('ข้อมูลวิจัย: ปิดช่องที่ security review ยับยั้ง (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { orgIds: [], userIds: [], templateIds: [], entityIds: [], farmIds: [], speciesIds: [] };
    let seq = 0;

    const as = (user) => { mockActor.current = { ...user }; };

    async function user(role, organizationId, accountType) {
        const id = crypto.randomUUID();
        seq += 1;
        await raw.user.create({
            data: {
                id, canonicalId: `rv-${seq}-${sfx}`, password: 'x', role,
                authType: accountType === 'PROVIDER' ? 'PROVIDER_ID' : 'EMAIL_LEGACY',
                ...(accountType === 'PROVIDER' ? { providerId: `rv-${seq}-${sfx}` } : { healthId: `rv-${seq}-${sfx}` }),
                email: `rv-${seq}-${sfx}@example.test`, firstName: `ชื่อ${seq}`, lastName: `สกุล${seq}`,
                organizationId, status: 'ACTIVE', accountType,
            },
        });
        fx.userIds.push(id);
        return { id, role, canonicalRole: role, organizationId };
    }

    async function template(organizationId, code) {
        const t = await raw.surveyTemplate.create({
            data: { code: `${code}-${sfx}`, title: `แบบสำรวจ ${code}`, status: 'ACTIVE', organizationId, targetGroup: 'FARMER' },
        });
        fx.templateIds.push(t.id);
        const q = async (sortOrder, questionText, questionType, choices) => raw.surveyQuestion.create({
            data: { templateId: t.id, sortOrder, questionText, questionType, choices, isRequired: true, organizationId },
        });
        return {
            id: t.id,
            rating: (await q(1, 'ความพึงพอใจ', 'RATING_5')).id,
            choice: (await q(2, 'แหล่งน้ำ', 'SINGLE_CHOICE', ['ประปา', 'บาดาล', 'น้ำฝน'])).id,
            text: (await q(3, 'ข้อเสนอแนะ', 'TEXTAREA')).id,
        };
    }

    const submit = (who, t, { rating = 4, choice = 'ประปา', text = 'ตลาดกลาง', region = 'NORTH' } = {}) => {
        as(who);
        return request(app).post(`/api/surveys/templates/${t.id}/responses`).send({
            region, province: 'เชียงใหม่', researchConsent: CONSENT,
            answers: [
                { questionId: t.rating, value: rating },
                { questionId: t.choice, value: choice },
                { questionId: t.text, value: text },
            ],
        });
    };

    const stats = async (who, t) => {
        as(who);
        const res = await request(app).get(`/api/surveys/templates/${t.id}/stats`);
        expect(res.status).toBe(200);
        return res.body.data;
    };

    const closeTemplate = async (t) => {
        as(fx.adminA);
        expect((await request(app).post(`/api/surveys/templates/${t.id}/close`)).status).toBe(200);
    };

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        for (const tag of ['a', 'b']) {
            const org = await raw.organization.create({ data: { name: `rv-${tag}-${sfx}`, slug: `rv-${tag}-${sfx}`, code: `RV${tag}_${sfx}`.toUpperCase() } });
            fx.orgIds.push(org.id);
        }
        [fx.orgA, fx.orgB] = fx.orgIds;
        fx.adminA = await user('system_admin_dtam', fx.orgA, 'PROVIDER');
        fx.adminB = await user('system_admin_dtam', fx.orgB, 'PROVIDER');
        fx.staffA = {};
        for (const role of NON_ADMIN_STAFF) {
            fx.staffA[role] = await user(role, fx.orgA, 'PROVIDER');
        }
        fx.farmers = [];
        for (let i = 0; i < 12; i += 1) {
            fx.farmers.push(await user('health', fx.orgA, 'HEALTH'));
        }

        app = express();
        app.use(express.json());
        app.use('/api/surveys', require('../../routes/api/surveys/surveys'));
        app.use('/api/datasets', require('../../routes/api/datasets/datasets'));
    });

    afterAll(async () => {
        const responseWhere = { templateId: { in: fx.templateIds } };
        await raw.surveyAnswer.deleteMany({ where: { response: responseWhere } }).catch(() => {});
        await raw.surveyResponse.deleteMany({ where: responseWhere }).catch(() => {});
        await raw.surveyQuestion.deleteMany({ where: { templateId: { in: fx.templateIds } } }).catch(() => {});
        await raw.surveyTemplate.deleteMany({ where: { id: { in: fx.templateIds } } }).catch(() => {});
        await raw.expertInterview.deleteMany({ where: { organizationId: { in: fx.orgIds } } }).catch(() => {});
        await raw.traceQrScan.deleteMany({ where: { organizationId: { in: fx.orgIds } } }).catch(() => {});
        await raw.traceQrSecurity.deleteMany({ where: { organizationId: { in: fx.orgIds } } }).catch(() => {});
        await raw.harvestBatch.deleteMany({ where: { organizationId: { in: fx.orgIds } } }).catch(() => {});
        await raw.cultivationLog.deleteMany({ where: { organizationId: { in: fx.orgIds } } }).catch(() => {});
        await raw.plantingCycle.deleteMany({ where: { organizationId: { in: fx.orgIds } } }).catch(() => {});
        await raw.plot.deleteMany({ where: { organizationId: { in: fx.orgIds } } }).catch(() => {});
        await raw.farm.deleteMany({ where: { id: { in: fx.farmIds } } }).catch(() => {});
        await raw.plantSpecies.deleteMany({ where: { id: { in: fx.speciesIds } } }).catch(() => {});
        await raw.entity.deleteMany({ where: { id: { in: fx.entityIds } } }).catch(() => {});
        await raw.auditLog.deleteMany({ where: { organizationId: { in: fx.orgIds } } }).catch(() => {});
        await raw.notification.deleteMany({ where: { userId: { in: fx.userIds } } }).catch(() => {});
        await raw.user.deleteMany({ where: { id: { in: fx.userIds } } }).catch(() => {});
        await raw.organization.deleteMany({ where: { id: { in: fx.orgIds } } }).catch(() => {});
        await raw.$disconnect();
    });

    describe('สถิติรวม (M1 M2 M3)', () => {
        let t;

        beforeAll(async () => {
            t = await template(fx.orgA, 'RV-STATS');
            // แหล่งน้ำ: ประปา 6 · บาดาล 5 · น้ำฝน 1 — น้ำฝนถูกปิด และบาดาลต้องถูกปิดตาม ไม่งั้น 12 − 6 − 5 = 1
            const choices = [...Array(6).fill('ประปา'), ...Array(5).fill('บาดาล'), 'น้ำฝน'];
            for (let i = 0; i < 12; i += 1) {
                const text = i === 0
                    ? Array(5).fill(`คุณ${PERSON_NAME}`).join(' ')
                    : 'ใช้น้ำประปา น้ำประปา';
                expect((await submit(fx.farmers[i], t, { choice: choices[i], text, rating: i === 0 ? 1 : 4 })).status).toBe(201);
            }
        });

        test('M2: แบบสำรวจยังเปิดรับคำตอบ = บทบาทที่เห็นแค่สถิติรวมไม่ได้ตัวเลขใดเลย · ผู้ดูแลกรมเห็นสดครบ', async () => {
            for (const role of NON_ADMIN_STAFF) {
                const data = await stats(fx.staffA[role], t);
                expect({ role, available: data.statisticsAvailable }).toEqual({ role, available: false });
                expect(data.totalResponses).toBeUndefined();
                expect(data.questions).toBeUndefined();
                expect(data.regionBreakdown).toBeUndefined();
            }
            const live = await stats(fx.adminA, t);
            expect(live.statisticsAvailable).toBe(true);
            expect(live.totalResponses).toBe(12);
            expect(live.questions.find(q => q.questionText === 'ความพึงพอใจ').average).toBe(3.75);
        });

        test('M1 + M3: ปิดรับแล้ว = ช่องเล็กและช่องถัดไปถูกปิดโดยไม่บอกชื่อ ยอดรวมเป็นช่วง ไม่มีคำสำคัญจากข้อความอิสระ', async () => {
            await closeTemplate(t);
            const data = await stats(fx.staffA.document_reviewer, t);
            expect(data.statisticsAvailable).toBe(true);

            const choice = data.questions.find(q => q.questionText === 'แหล่งน้ำ');
            expect(choice.choiceCounts).toEqual({ ประปา: 6 });
            expect(choice.hasSuppressedCells).toBe(true);
            expect(JSON.stringify(data)).not.toMatch(/บาดาล|น้ำฝน/);

            expect(data.totalResponses).toBeNull();
            expect(data.totalResponsesBand).toBe('10-19');
            expect(data.regionBreakdown).toBeNull();
            expect(data.regionBreakdownBand).toEqual({ NORTH: '10-19' });
            for (const q of data.questions) {
                expect({ q: q.questionText, count: q.count, band: q.countBand }).toEqual({ q: q.questionText, count: null, band: '10-19' });
            }

            const text = data.questions.find(q => q.questionText === 'ข้อเสนอแนะ');
            expect(text.topKeywords).toBeNull();
            const nameParts = [...new Intl.Segmenter('th', { granularity: 'word' }).segment(PERSON_NAME)]
                .filter(s => s.isWordLike && s.segment.length >= 2).map(s => s.segment);
            expect(nameParts.length).toBeGreaterThan(0);
            for (const part of [PERSON_NAME, ...nameParts]) {
                expect(JSON.stringify(data)).not.toContain(part);
            }
        });

        test('R1: ประปา 6 บาดาล 1 น้ำฝน 1 ในภาคเดียว = ปิดทั้งคำถาม เพราะยอดของภาคลบ 6 ได้ 2 ซึ่งคือ 1 กับ 1', async () => {
            const few = await template(fx.orgA, 'RV-SUM');
            const choices = [...Array(6).fill('ประปา'), 'บาดาล', 'น้ำฝน'];
            for (let i = 0; i < choices.length; i += 1) {
                expect((await submit(fx.farmers[i], few, { choice: choices[i] })).status).toBe(201);
            }
            await closeTemplate(few);
            const data = await stats(fx.staffA.document_reviewer, few);
            const choice = data.questions.find(q => q.questionText === 'แหล่งน้ำ');
            expect(choice.choiceCounts).toEqual({});
            expect(choice.hasSuppressedCells).toBe(true);
            expect(data.totalResponses).toBeNull();
            expect(data.regionBreakdown).toBeNull();
            expect(data.regionBreakdownBand).toEqual({ NORTH: '0-9' });
            expect(JSON.stringify(data)).not.toMatch(/ประปา|บาดาล|น้ำฝน|"NORTH":8/);
        });

        test('M1 negative control: ผู้ดูแลกรมเห็นทุกช่องและยอดจริง', async () => {
            const data = await stats(fx.adminA, t);
            expect(data.totalResponses).toBe(12);
            const choice = data.questions.find(q => q.questionText === 'แหล่งน้ำ');
            expect(choice.choiceCounts).toEqual({ ประปา: 6, บาดาล: 5, น้ำฝน: 1 });
            expect(choice.count).toBe(12);
        });

        test('M3: ผู้ตอบคนเดียวส่งชุดที่สองไม่ได้ · พิมพ์ชื่อคนซ้ำ 5 ครั้งในคำตอบเดียวนับเป็น 1 คน', async () => {
            const kw = await template(fx.orgA, 'RV-KW');
            expect((await submit(fx.farmers[0], kw, { text: Array(5).fill('ติดต่อผู้ใหญ่บ้าน').join(' ') })).status).toBe(201);
            const again = await submit(fx.farmers[0], kw, { text: 'ติดต่อผู้ใหญ่บ้าน' });
            expect(again.status).toBe(409);
            expect(again.body.error).toBe('SURVEY_ALREADY_ANSWERED');
            for (let i = 1; i <= 5; i += 1) {
                expect((await submit(fx.farmers[i], kw, { text: 'ราคาตลาดกลาง' })).status).toBe(201);
            }
            await closeTemplate(kw);
            const admin = await stats(fx.adminA, kw);
            const keywords = admin.questions.find(q => q.questionText === 'ข้อเสนอแนะ').topKeywords;
            expect(keywords.find(k => k.word === 'ตลาด')).toEqual({ word: 'ตลาด', count: 5 });
            expect(keywords.find(k => k.word === 'ติดต่อ')).toEqual({ word: 'ติดต่อ', count: 1 });
            const reader = await stats(fx.staffA.dispatcher, kw);
            expect(reader.questions.find(q => q.questionText === 'ข้อเสนอแนะ').topKeywords).toBeNull();
        });
    });

    describe('สัมภาษณ์ (M5 L1)', () => {
        const body = (extra = {}) => ({
            title: `สัมภาษณ์ ดร.ทดสอบ ${sfx}`, intervieweeName: `ดร.ทดสอบ ${sfx}`, interviewDate: '2026-10-01',
            transcript: 'บันทึก', intervieweeConsentGiven: true, intervieweeConsentDate: '2026-09-30', ...extra,
        });

        test('L1: วันที่ยินยอมเป็น null ถูกปฏิเสธ ไม่กลายเป็น 1970 · ยินยอมหลังวันสัมภาษณ์ถูกปฏิเสธ · ยินยอมวันเดียวกันได้', async () => {
            as(fx.adminA);
            const nullDate = await request(app).post('/api/surveys/interviews').send(body({ intervieweeConsentDate: null }));
            expect(nullDate.status).toBe(400);
            expect(nullDate.body.error).toBe('INTERVIEW_CONSENT_REQUIRED');

            const nullInterview = await request(app).post('/api/surveys/interviews').send(body({ interviewDate: null }));
            expect(nullInterview.status).toBe(400);

            const after = await request(app).post('/api/surveys/interviews').send(body({ intervieweeConsentDate: '2026-10-02' }));
            expect(after.status).toBe(400);
            expect(after.body.error).toBe('INTERVIEW_CONSENT_AFTER_INTERVIEW');

            expect(await raw.expertInterview.count({ where: { organizationId: fx.orgA } })).toBe(0);

            const sameDay = await request(app).post('/api/surveys/interviews').send(body({ intervieweeConsentDate: '2026-10-01' }));
            expect(sameDay.status).toBe(201);
        });

        test('M5: ทำให้ระบุตัวไม่ได้ล้างชื่อเรื่องด้วย และทำได้กับแถวที่ลบแบบ soft delete', async () => {
            const row = await raw.expertInterview.findFirst({ where: { organizationId: fx.orgA } });
            await raw.expertInterview.update({ where: { id: row.id }, data: { isDeleted: true, deletedAt: new Date() } });
            as(fx.adminB);
            expect((await request(app).post(`/api/surveys/interviews/${row.id}/anonymise`)).status).toBe(404);
            as(fx.adminA);
            const res = await request(app).post(`/api/surveys/interviews/${row.id}/anonymise`);
            expect(res.status).toBe(200);
            const after = await raw.expertInterview.findUnique({ where: { id: row.id } });
            expect(JSON.stringify(after)).not.toContain('ดร.ทดสอบ');
            expect(after.intervieweeConsentWithdrawnAt).toBeInstanceOf(Date);
        });
    });

    describe('ส่งออก (H1 L2 L4)', () => {
        const realIds = new Set();
        let lotId;
        let survey;

        const exportText = async (who, domain, format) => {
            as(who);
            const res = await request(app).get(`/api/datasets/${domain}/export?format=${format}`);
            expect({ domain, format, status: res.status }).toEqual({ domain, format, status: 200 });
            return res.text;
        };

        beforeAll(async () => {
            const entity = await raw.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท rv ${sfx} จำกัด`, organizationId: fx.orgA } });
            fx.entityIds.push(entity.id);
            const farm = await raw.farm.create({
                data: {
                    ownerId: fx.farmers[1].id, farmName: `ฟาร์ม rv ${sfx}`, farmType: 'CULTIVATION', address: '1', province: 'เชียงใหม่',
                    district: 'เมือง', subDistrict: 'ศรีภูมิ', postalCode: '50200', totalArea: 1, cultivationArea: 1,
                    cultivationMethod: 'OUTDOOR', organizationId: fx.orgA, entityId: entity.id,
                },
            });
            fx.farmIds.push(farm.id);
            const species = await raw.plantSpecies.create({ data: { code: `RV${sfx}`, nameTH: `พืชทดสอบ ${sfx}` } });
            fx.speciesIds.push(species.id);
            const plot = await raw.plot.create({ data: { farmId: farm.id, name: `แปลง ${sfx}`, area: 100, organizationId: fx.orgA } });
            const cycle = await raw.plantingCycle.create({
                data: { cycleName: `รอบ ${sfx}`, farmId: farm.id, plantSpeciesId: species.id, startDate: new Date('2026-06-01'), organizationId: fx.orgA },
            });
            const cultivation = await raw.cultivationLog.create({ data: { cycleId: cycle.id, plotId: plot.id, logType: 'IRRIGATION', organizationId: fx.orgA } });
            const batch = await raw.harvestBatch.create({
                data: { batchNumber: `LOT-RV-${sfx}`, cycleId: cycle.id, farmId: farm.id, freshWeight: 10, organizationId: fx.orgA },
            });
            const qrCode = `QR${sfx}RV`;
            const security = await raw.traceQrSecurity.create({
                data: {
                    entityType: 'HARVEST_BATCH', entityId: batch.id, qrCode, publicUrl: `https://example.test/verify/${sfx}`,
                    payload: {}, dataHash: 'h', chainHash: `c-${sfx}`, signature: 's', organizationId: fx.orgA,
                },
            });
            lotId = crypto.randomUUID();
            const scans = [];
            for (const path of [
                `/api/trace/lot/${lotId}?ref=${batch.batchNumber}`,
                `/api/v1/trace/batch/${batch.id}`,
                `/api/trace/plot-cycle/${qrCode}`,
                `/api/trace/${qrCode}`,
                `/api/trace/verify/HARVEST_BATCH/${batch.id}`,
                `/api/somewhere-else/${cycle.id}`,
            ]) {
                scans.push(await raw.traceQrScan.create({ data: { qrSecurityId: security.id, requestPath: path, organizationId: fx.orgA } }));
            }

            survey = await template(fx.orgA, 'RV-EXPORT');
            for (const i of [6, 7]) {
                expect((await submit(fx.farmers[i], survey, { text: 'ส่งออก' })).status).toBe(201);
            }
            const responses = await raw.surveyResponse.findMany({ where: { templateId: survey.id } });

            for (const id of [
                farm.id, entity.id, plot.id, cycle.id, cultivation.id, batch.id, batch.batchNumber, security.id, qrCode, lotId, ...scans.map(s => s.id),
                ...responses.map(r => r.id), fx.farmers[6].id, fx.farmers[7].id,
            ]) {
                realIds.add(id);
            }
        });

        test('H1: ทุกชุดข้อมูลทั้ง JSONL และ CSV ไม่มีรหัสจริงของแถวที่ปลูกไว้เลย', async () => {
            const leaks = [];
            for (const domain of DATASET_DOMAINS) {
                for (const format of ['jsonl', 'csv']) {
                    const out = await exportText(fx.adminA, domain.key, format);
                    const dataLines = out.replace('\ufeff', '').trim().split('\n').filter(Boolean).length - (format === 'csv' ? 1 : 0);
                    expect({ domain: domain.key, format, empty: dataLines < 1 })
                        .toEqual({ domain: domain.key, format, empty: false });
                    for (const id of realIds) {
                        if (out.includes(id)) { leaks.push(`${domain.key}.${format}: ${id}`); }
                    }
                }
            }
            expect(leaks).toEqual([]);
        });

        test('H1: เส้นทางที่สแกนออกเป็นแม่แบบเส้นทาง เส้นทางที่ไม่รู้จักออกเป็นค่าว่าง', async () => {
            const rows = (await exportText(fx.adminA, 'trace-scans', 'jsonl')).trim().split('\n').map(l => JSON.parse(l));
            expect(rows.map(r => r.requestPath).sort()).toEqual([
                '/api/trace/:qrCode',
                '/api/trace/batch/:batchId',
                '/api/trace/lot/:lotId',
                '/api/trace/plot-cycle/:qrCode',
                '/api/trace/verify/:entityType/:entityId',
                null,
            ].sort());
        });

        test('L4: วันที่ส่งคำตอบออกเป็นวันที่อย่างเดียว ทั้งไฟล์ของผู้ดูแลและชุดข้อมูลวิจัย', async () => {
            as(fx.adminA);
            const csv = (await request(app).get(`/api/surveys/templates/${survey.id}/export`)).text.replace('\ufeff', '');
            const lines = csv.trim().split('\n').slice(1);
            expect(lines).toHaveLength(2);
            for (const line of lines) {
                expect(line.split(',')[1]).toMatch(/^"\d{4}-\d{2}-\d{2}"$/);
            }
            const rows = (await exportText(fx.adminA, 'survey-responses', 'jsonl')).trim().split('\n').map(l => JSON.parse(l));
            expect(rows.length).toBeGreaterThan(0);
            for (const row of rows) {
                expect(row.submittedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            }
        });

        test('L2: รายการรหัสแฝงของคำตอบที่ถอนแล้วตรงกับรหัสแฝงที่เคยส่งออก · ผู้ดูแลกรมเท่านั้น · ไม่ข้ามองค์กร', async () => {
            const target = fx.farmers[6];
            const response = await raw.surveyResponse.findFirst({ where: { templateId: survey.id, respondentUserId: target.id } });
            const before = (await exportText(fx.adminA, 'survey-responses', 'jsonl')).trim().split('\n').map(l => JSON.parse(l));
            const beforeIds = new Set(before.map(r => r.responseId));

            as(target);
            expect((await request(app).post('/api/surveys/research-consent/withdraw')).status).toBe(200);

            const after = new Set((await exportText(fx.adminA, 'survey-responses', 'jsonl')).trim().split('\n').map(l => JSON.parse(l).responseId));
            const gone = [...beforeIds].filter(id => !after.has(id));
            expect(gone.length).toBeGreaterThan(0);

            as(fx.adminA);
            const list = await request(app).get('/api/datasets/survey-responses/withdrawn?format=jsonl');
            expect(list.status).toBe(200);
            const withdrawn = list.text.trim().split('\n').map(l => JSON.parse(l));
            expect(withdrawn.map(r => r.responseId).sort()).toEqual(expect.arrayContaining(gone.sort()));
            expect(withdrawn.every(r => /^\d{4}-\d{2}-\d{2}$/.test(r.withdrawnOn))).toBe(true);
            expect(list.text).not.toContain(response.id);

            const csv = await request(app).get('/api/datasets/survey-responses/withdrawn?format=csv');
            expect(csv.status).toBe(200);
            for (const id of gone) { expect(csv.text).toContain(id); }

            for (const role of NON_ADMIN_STAFF) {
                as(fx.staffA[role]);
                const res = await request(app).get('/api/datasets/survey-responses/withdrawn?format=jsonl');
                expect({ role, status: res.status }).toEqual({ role, status: 403 });
            }
            as(fx.adminB);
            const other = await request(app).get('/api/datasets/survey-responses/withdrawn?format=jsonl');
            expect(other.status).toBe(200);
            for (const id of gone) { expect(other.text).not.toContain(id); }
        });
    });
});

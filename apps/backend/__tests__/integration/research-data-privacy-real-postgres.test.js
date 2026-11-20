/**
 * ข้อมูลวิจัย (แบบสำรวจ สัมภาษณ์ ชุดข้อมูลวิจัย) คุ้มครองตามคำสั่ง 34(5) (real Postgres)
 *
 * operator 2026-10-07 "ตามที่แนะนำ": ข้อมูลดิบเฉพาะ system_admin_dtam ในองค์กรของตัวเอง (คำสั่ง 17)
 * บทบาทอื่นเห็นสถิติรวม · ขอความยินยอมเพื่อการวิจัยก่อนตอบ · ลบบัญชีแล้วคำตอบไม่ผูกตัวคน
 * ส่งออกชุดข้อมูลวิจัยไม่มี respondentUserId และแปลงรหัสฟาร์ม/รอบปลูกเป็นรหัสแฝง
 * ที่มา: reports/role-workflow-auditor/2026-10-07-modules-audit.md ข้อ D5 และส่วน E
 *
 * ปิดตัวกรององค์กรของ Prisma extension (TENANT_READ_ORG_SCOPE=false) เพื่อพิสูจน์ว่าแต่ละประตูกรองเอง
 */

'use strict';

process.env.TENANT_READ_ORG_SCOPE = 'false';
const PSEUDONYM_KEY = `research-privacy-test-key-${'p'.repeat(24)}`;
process.env.DATASET_PSEUDONYM_KEY = PSEUDONYM_KEY;

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { RESEARCH_CONSENT_NOTICE } = require('../../shared/research-consent-notice');
const { ERROR_CODES } = require('../../shared/error-codes');

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

const NON_ADMIN_STAFF = [
    'document_reviewer', 'dispatcher', 'field_inspector', 'certificate_approver',
    'finance_officer_dtam', 'finance_officer_platform', 'system_admin_platform',
];
const RARE_WORD = 'สมศรีมณีรัตน์';
const COMMON_WORD = 'น้ำประปา';
const COMMON_KEYWORD = 'ประปา'; // the Thai segmenter splits COMMON_WORD into น้ำ + ประปา
const CONSENT = { accepted: true, version: RESEARCH_CONSENT_NOTICE.version };

d('ข้อมูลวิจัยคุ้มครองตามคำสั่ง 34(5) (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { orgIds: [], userIds: [], templateIds: [], interviewIds: [], entityIds: [], farmIds: [] };
    let seq = 0;

    const as = (user) => { mockActor.current = { ...user }; };

    async function user(role, organizationId, accountType) {
        const id = crypto.randomUUID();
        seq += 1;
        await raw.user.create({
            data: {
                id, canonicalId: `rd-${seq}-${sfx}`, password: 'x', role,
                authType: accountType === 'PROVIDER' ? 'PROVIDER_ID' : 'EMAIL_LEGACY',
                ...(accountType === 'PROVIDER' ? { providerId: `rd-${seq}-${sfx}` } : { healthId: `rd-${seq}-${sfx}` }),
                email: `rd-${seq}-${sfx}@example.test`, firstName: `ชื่อจริง${seq}`, lastName: `นามสกุล${seq}`,
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
            choice: (await q(2, 'แหล่งน้ำ', 'SINGLE_CHOICE', ['บาดาล', 'ประปา'])).id,
            text: (await q(3, 'ข้อเสนอแนะ', 'TEXTAREA')).id,
        };
    }

    function answers(t, rating, choice, text) {
        return { region: 'NORTH', province: 'เชียงใหม่', answers: [
            { questionId: t.rating, value: rating },
            { questionId: t.choice, value: choice },
            { questionId: t.text, value: text },
        ], researchConsent: CONSENT };
    }

    const submit = (who, t, body) => { as(who); return request(app).post(`/api/surveys/templates/${t.id}/responses`).send(body); };

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        for (const tag of ['a', 'b']) {
            const org = await raw.organization.create({ data: { name: `rd-${tag}-${sfx}`, slug: `rd-${tag}-${sfx}`, code: `RD${tag}_${sfx}`.toUpperCase() } });
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
        for (let i = 0; i < 6; i += 1) {
            fx.farmers.push(await user('health', fx.orgA, 'HEALTH'));
        }
        fx.farmerB = await user('health', fx.orgB, 'HEALTH');

        fx.tA = await template(fx.orgA, 'RD-A');
        fx.tB = await template(fx.orgB, 'RD-B');

        app = express();
        app.use(express.json());
        app.use('/api/surveys', require('../../routes/api/surveys/surveys'));
        app.use('/api/datasets', require('../../routes/api/datasets/datasets'));

        // six consented answers in A: five say COMMON_WORD, one names a person (RARE_WORD)
        for (let i = 0; i < 6; i += 1) {
            const text = i === 0 ? `ติดต่อคุณ${RARE_WORD} ที่บ้านเลขที่ 9` : `ใช้${COMMON_WORD} ${COMMON_WORD}`;
            const res = await submit(fx.farmers[i], fx.tA, answers(fx.tA, i === 0 ? 1 : 4, i < 5 ? 'ประปา' : 'บาดาล', text));
            expect(res.status).toBe(201);
        }
        const resB = await submit(fx.farmerB, fx.tB, answers(fx.tB, 5, 'บาดาล', 'คำตอบขององค์กร B'));
        expect(resB.status).toBe(201);
    });

    afterAll(async () => {
        const responseWhere = { templateId: { in: fx.templateIds } };
        await raw.surveyAnswer.deleteMany({ where: { response: responseWhere } }).catch(() => {});
        await raw.surveyResponse.deleteMany({ where: responseWhere }).catch(() => {});
        await raw.surveyQuestion.deleteMany({ where: { templateId: { in: fx.templateIds } } }).catch(() => {});
        await raw.surveyTemplate.deleteMany({ where: { id: { in: fx.templateIds } } }).catch(() => {});
        await raw.expertInterview.deleteMany({ where: { organizationId: { in: fx.orgIds } } }).catch(() => {});
        await raw.harvestBatch.deleteMany({ where: { organizationId: { in: fx.orgIds } } }).catch(() => {});
        await raw.farm.deleteMany({ where: { id: { in: fx.farmIds } } }).catch(() => {});
        await raw.entity.deleteMany({ where: { id: { in: fx.entityIds } } }).catch(() => {});
        await raw.auditLog.deleteMany({ where: { organizationId: { in: fx.orgIds } } }).catch(() => {});
        await raw.notification.deleteMany({ where: { userId: { in: fx.userIds } } }).catch(() => {});
        await raw.user.deleteMany({ where: { id: { in: fx.userIds } } }).catch(() => {});
        await raw.organization.deleteMany({ where: { id: { in: fx.orgIds } } }).catch(() => {});
        await raw.$disconnect();
    });

    describe('1. ข้อมูลดิบเฉพาะ system_admin_dtam ในองค์กรของตัวเอง', () => {
        test('ส่งออก CSV: ผู้ดูแลกรมองค์กร A ได้ไฟล์ · ทุกบทบาทอื่น 403 · ผู้ดูแลองค์กร B ไม่เห็นแบบสำรวจของ A', async () => {
            as(fx.adminA);
            const ok = await request(app).get(`/api/surveys/templates/${fx.tA.id}/export`);
            expect(ok.status).toBe(200);
            expect(ok.text).toContain(RARE_WORD);

            for (const role of NON_ADMIN_STAFF) {
                as(fx.staffA[role]);
                const res = await request(app).get(`/api/surveys/templates/${fx.tA.id}/export`);
                expect({ role, status: res.status }).toEqual({ role, status: 403 });
                expect(res.text).not.toContain(RARE_WORD);
            }

            as(fx.adminB);
            const cross = await request(app).get(`/api/surveys/templates/${fx.tA.id}/export`);
            expect(cross.status).toBe(404);
            expect(cross.text).not.toContain(RARE_WORD);
        });

        test('สถิติ: บทบาทอื่นยังไม่เห็นตัวเลขขณะเปิดรับคำตอบ ไม่มีคำที่ระบุตัวคน · ผู้ดูแลกรมเห็นครบ', async () => {
            for (const role of NON_ADMIN_STAFF.filter(r => r !== 'system_admin_platform')) {
                as(fx.staffA[role]);
                const res = await request(app).get(`/api/surveys/templates/${fx.tA.id}/stats`);
                expect({ role, status: res.status }).toEqual({ role, status: 200 });
                expect(JSON.stringify(res.body)).not.toContain(RARE_WORD);
                expect(res.body.data.aggregateOnly).toBe(true);
                expect(res.body.data.statisticsAvailable).toBe(false);
                expect(res.body.data.questions).toBeUndefined();
            }

            as(fx.adminA);
            const full = await request(app).get(`/api/surveys/templates/${fx.tA.id}/stats`);
            expect(full.status).toBe(200);
            expect(full.body.data.aggregateOnly).toBe(false);
            const choice = full.body.data.questions.find(q => q.questionText === 'แหล่งน้ำ');
            expect(choice.choiceCounts).toEqual({ ประปา: 5, บาดาล: 1 });
            const text = full.body.data.questions.find(q => q.questionText === 'ข้อเสนอแนะ');
            expect(text.topKeywords.find(k => k.word === COMMON_KEYWORD).count).toBe(5);
        });

        test('สถิติข้ามองค์กร: เจ้าหน้าที่องค์กร B ไม่เห็นแบบสำรวจของ A · ไม่รู้องค์กร = ปฏิเสธ', async () => {
            as(fx.adminB);
            expect((await request(app).get(`/api/surveys/templates/${fx.tA.id}/stats`)).status).toBe(404);
            as({ id: crypto.randomUUID(), role: 'document_reviewer', canonicalRole: 'document_reviewer', organizationId: null });
            const res = await request(app).get(`/api/surveys/templates/${fx.tA.id}/stats`);
            expect(res.status).toBe(ERROR_CODES.NO_ORGANIZATION.httpStatus);
            expect(res.body.code).toBe('NO_ORGANIZATION');
        });

        test('รายการสัมภาษณ์: เฉพาะผู้ดูแลกรมขององค์กรนั้น', async () => {
            const body = (name) => ({
                title: 'สัมภาษณ์ผู้เชี่ยวชาญ', intervieweeName: name, interviewDate: '2026-10-01',
                transcript: 'บันทึกการสัมภาษณ์', intervieweeConsentGiven: true, intervieweeConsentDate: '2026-10-01',
            });
            as(fx.adminA);
            expect((await request(app).post('/api/surveys/interviews').send(body('ดร.เอ ผู้เชี่ยวชาญ'))).status).toBe(201);
            as(fx.adminB);
            expect((await request(app).post('/api/surveys/interviews').send(body('ดร.บี ผู้เชี่ยวชาญ'))).status).toBe(201);

            as(fx.adminA);
            const own = await request(app).get('/api/surveys/interviews');
            expect(own.status).toBe(200);
            expect(own.body.data.map(i => i.intervieweeName)).toEqual(['ดร.เอ ผู้เชี่ยวชาญ']);

            for (const role of NON_ADMIN_STAFF) {
                as(fx.staffA[role]);
                const res = await request(app).get('/api/surveys/interviews');
                expect({ role, status: res.status }).toEqual({ role, status: 403 });
                expect(res.text).not.toContain('ดร.เอ');
            }
        });

        test('สร้าง/เปิด/ปิดแบบสำรวจยังเป็นของ system_admin_dtam เท่านั้น', async () => {
            for (const role of NON_ADMIN_STAFF) {
                as(fx.staffA[role]);
                expect((await request(app).post(`/api/surveys/templates/${fx.tA.id}/close`)).status).toBe(403);
            }
        });
    });

    describe('2. ขอความยินยอมเพื่อการวิจัยก่อนตอบ', () => {
        test('ข้อความแจ้งเป็นภาษาไทยพร้อมรุ่น', async () => {
            as(fx.farmers[0]);
            const res = await request(app).get('/api/surveys/research-consent');
            expect(res.status).toBe(200);
            expect(res.body.data.version).toBe(RESEARCH_CONSENT_NOTICE.version);
            const text = JSON.stringify(res.body.data);
            for (const must of ['วัตถุประสงค์', 'ข้อมูลที่เก็บ', 'ระยะเวลาเก็บ', 'ถอนความยินยอม', 'สวนสุนันทา', 'คลังข้อมูลวิจัยของโครงการ']) {
                expect(text).toContain(must);
            }
            expect(text).not.toMatch(/บพข|Data Lake/);
        });

        test('ไม่ยินยอม = ส่งไม่ได้ (403) และไม่มีแถวถูกบันทึก · รุ่นเก่า = 409 · ยินยอม = บันทึกรุ่นและเวลา', async () => {
            const who = fx.farmers[5];
            const before = await raw.surveyResponse.count({ where: { templateId: fx.tA.id } });
            const body = answers(fx.tA, 3, 'ประปา', 'ทดสอบ');

            const none = await submit(who, fx.tA, { ...body, researchConsent: undefined });
            expect(none.status).toBe(403);
            expect(none.body.error).toBe('RESEARCH_CONSENT_REQUIRED');
            const declined = await submit(who, fx.tA, { ...body, researchConsent: { accepted: false, version: CONSENT.version } });
            expect(declined.status).toBe(403);
            const stale = await submit(who, fx.tA, { ...body, researchConsent: { accepted: true, version: 'research-survey-notice-th-v0' } });
            expect(stale.status).toBe(409);
            expect(stale.body.error).toBe('RESEARCH_CONSENT_VERSION_STALE');
            expect(await raw.surveyResponse.count({ where: { templateId: fx.tA.id } })).toBe(before);

            const rows = await raw.surveyResponse.findMany({ where: { templateId: fx.tA.id, respondentUserId: fx.farmers[1].id } });
            expect(rows).toHaveLength(1);
            expect(rows[0].researchConsentVersion).toBe(RESEARCH_CONSENT_NOTICE.version);
            expect(rows[0].researchConsentAt).toBeInstanceOf(Date);
        });

        test('บันทึกสัมภาษณ์ต้องมีความยินยอมของผู้ให้สัมภาษณ์และวันที่', async () => {
            as(fx.adminA);
            const base = { title: 'ไม่มีความยินยอม', intervieweeName: 'ผู้ไม่ยินยอม', interviewDate: '2026-10-01', transcript: 'ข้อความ' };
            const missing = await request(app).post('/api/surveys/interviews').send(base);
            expect(missing.status).toBe(400);
            expect(missing.body.error).toBe('INTERVIEW_CONSENT_REQUIRED');
            const refused = await request(app).post('/api/surveys/interviews').send({ ...base, intervieweeConsentGiven: false, intervieweeConsentDate: '2026-10-01' });
            expect(refused.status).toBe(400);
            const noDate = await request(app).post('/api/surveys/interviews').send({ ...base, intervieweeConsentGiven: true });
            expect(noDate.status).toBe(400);
            expect(await raw.expertInterview.count({ where: { intervieweeName: 'ผู้ไม่ยินยอม' } })).toBe(0);

            const saved = await raw.expertInterview.findFirst({ where: { intervieweeName: 'ดร.เอ ผู้เชี่ยวชาญ' } });
            expect(saved.intervieweeConsentGiven).toBe(true);
            expect(saved.intervieweeConsentDate.toISOString().slice(0, 10)).toBe('2026-10-01');
        });
    });

    describe('3. ลบบัญชี (PDPA) และถอนความยินยอม', () => {
        test('ลบบัญชี: คำตอบไม่ผูกตัวคน ข้อความที่พิมพ์เองถูกลบ คะแนนและตัวเลือกยังอยู่ · คนอื่นไม่ถูกแตะ', async () => {
            const erasure = require('../../services/pdpa-erasure-service');
            const target = fx.farmers[0];
            const mine = await raw.surveyResponse.findFirst({ where: { respondentUserId: target.id }, select: { id: true } });
            const summary = await erasure.executeErasure({ userId: target.id, actorId: fx.adminA.id, actorRole: 'system_admin_dtam' });
            expect(summary.anonymized.surveyResponses).toBe(1);
            // ข้อความยินยอม v3 เก็บรหัสบัญชีไว้ "เพื่อลบหรือถอนคำตอบตามคำขอของท่าน" การลบบัญชีคือคำขอนั้น
            // คำตอบจึงออกจากชุดข้อมูลวิจัยและอยู่ในรายการถอนด้วยรหัสแฝงเดิม เหมือนการถอนความยินยอม
            expect((await raw.surveyResponse.findUnique({ where: { id: mine.id } })).researchConsentWithdrawnAt).toBeInstanceOf(Date);
            const pseudonym = require('../../services/dataset-export-service').pseudonymiserFor(PSEUDONYM_KEY)(mine.id);
            as(fx.adminA);
            const exported = await request(app).get('/api/datasets/survey-responses/export?format=jsonl');
            expect({ status: exported.status, stillExported: exported.text.includes(pseudonym) }).toEqual({ status: 200, stillExported: false });
            const withdrawn = await request(app).get('/api/datasets/survey-responses/withdrawn?format=jsonl');
            expect(withdrawn.text.trim().split('\n').filter(Boolean).map(l => JSON.parse(l).responseId)).toContain(pseudonym);

            expect(await raw.surveyResponse.count({ where: { respondentUserId: target.id } })).toBe(0);
            const answersLeft = await raw.surveyAnswer.findMany({ where: { response: { templateId: fx.tA.id } }, select: { valueText: true, valueNumber: true } });
            expect(JSON.stringify(answersLeft)).not.toContain(RARE_WORD);
            expect(answersLeft.filter(a => a.valueNumber === 1)).toHaveLength(1);

            const other = await raw.surveyResponse.findFirst({ where: { respondentUserId: fx.farmers[2].id }, include: { answers: true } });
            expect(JSON.stringify(other.answers)).toContain(COMMON_WORD);

            as(fx.adminA);
            const stats = await request(app).get(`/api/surveys/templates/${fx.tA.id}/stats`);
            expect(stats.body.data.totalResponses).toBe(6);
        });

        test('ผู้ตอบถอนความยินยอมเอง: คำตอบไม่ผูกตัวคน ข้อความถูกลบ และไม่ถูกส่งออก', async () => {
            const who = fx.farmers[3];
            as(who);
            const res = await request(app).post('/api/surveys/research-consent/withdraw');
            expect(res.status).toBe(200);
            expect(res.body.data.withdrawnResponses).toBe(1);
            expect(await raw.surveyResponse.count({ where: { respondentUserId: who.id } })).toBe(0);
            // the account erased above and this withdrawal
            expect(await raw.surveyResponse.count({ where: { templateId: fx.tA.id, researchConsentWithdrawnAt: { not: null } } })).toBe(2);

            const again = await request(app).post('/api/surveys/research-consent/withdraw');
            expect(again.body.data.withdrawnResponses).toBe(0);
        });

        test('ผู้ดูแลกรมทำบทสัมภาษณ์ให้ระบุตัวไม่ได้เมื่อผู้ให้สัมภาษณ์ถอนความยินยอม · บทบาทอื่นทำไม่ได้', async () => {
            const row = await raw.expertInterview.findFirst({ where: { intervieweeName: 'ดร.เอ ผู้เชี่ยวชาญ' } });
            as(fx.staffA.document_reviewer);
            expect((await request(app).post(`/api/surveys/interviews/${row.id}/anonymise`)).status).toBe(403);
            as(fx.adminB);
            expect((await request(app).post(`/api/surveys/interviews/${row.id}/anonymise`)).status).toBe(404);
            as(fx.adminA);
            expect((await request(app).post(`/api/surveys/interviews/${row.id}/anonymise`)).status).toBe(200);
            const after = await raw.expertInterview.findUnique({ where: { id: row.id } });
            expect(after.intervieweeName).not.toContain('ดร.เอ');
            expect(after.transcript).not.toContain('บันทึกการสัมภาษณ์');
            expect(after.intervieweeConsentWithdrawnAt).toBeInstanceOf(Date);
        });
    });

    describe('4. ส่งออกชุดข้อมูลวิจัยไม่มีตัวระบุตรง', () => {
        let farmId;

        beforeAll(async () => {
            const entity = await raw.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท rd ${sfx} จำกัด`, organizationId: fx.orgA } });
            fx.entityIds.push(entity.id);
            const farm = await raw.farm.create({
                data: {
                    ownerId: fx.farmers[1].id, farmName: `ฟาร์ม rd ${sfx}`, farmType: 'CULTIVATION', address: '1', province: 'เชียงใหม่',
                    district: 'เมือง', subDistrict: 'ศรีภูมิ', postalCode: '50200', totalArea: 1, cultivationArea: 1,
                    cultivationMethod: 'OUTDOOR', organizationId: fx.orgA, entityId: entity.id,
                },
            });
            fx.farmIds.push(farm.id);
            farmId = farm.id;
            for (const n of [1, 2]) {
                await raw.harvestBatch.create({ data: { batchNumber: `LOT-RD-${sfx}-${n}`, farmId, freshWeight: 10 + n, organizationId: fx.orgA } });
            }
            // a response stored before consent existed: must never leave
            const legacy = await raw.surveyResponse.create({
                data: { templateId: fx.tA.id, respondentUserId: fx.farmers[4].id, region: 'SOUTH', organizationId: fx.orgA },
            });
            await raw.surveyAnswer.create({ data: { responseId: legacy.id, questionId: fx.tA.text, valueText: 'ไม่ได้ยินยอม', organizationId: fx.orgA } });
        });

        const exportAs = async (who, domain, format) => {
            as(who);
            const res = await request(app).get(`/api/datasets/${domain}/export?format=${format}`);
            expect(res.status).toBe(200);
            return res.text;
        };

        test('คำตอบแบบสำรวจ: ไม่มีรหัสบัญชี ชื่อ หรือรหัสคำตอบจริง · เฉพาะคำตอบที่ยินยอมและยังไม่ถอน', async () => {
            const responses = await raw.surveyResponse.findMany({ where: { templateId: fx.tA.id }, select: { id: true } });
            for (const format of ['jsonl', 'csv']) {
                const out = await exportAs(fx.adminA, 'survey-responses', format);
                expect(out).not.toMatch(/respondentUserId/);
                for (const u of [...fx.farmers]) {
                    expect(out).not.toContain(u.id);
                }
                for (const r of responses) {
                    expect(out).not.toContain(r.id);
                }
                expect(out).not.toMatch(/ชื่อจริง\d|นามสกุล\d/);
                expect(out).not.toContain('ไม่ได้ยินยอม');
                expect(out).not.toContain('คำตอบขององค์กร B');
            }
            const rows = (await exportAs(fx.adminA, 'survey-responses', 'jsonl')).trim().split('\n').map(l => JSON.parse(l));
            // 6 consented − 1 erased − 1 withdrawn = 4 responses × 3 answers
            expect(new Set(rows.map(r => r.responseId)).size).toBe(4);
            expect(rows).toHaveLength(12);
        });

        test('รหัสฟาร์มเป็นรหัสแฝง: คงที่ภายในการส่งออก ต่างกันเมื่อกุญแจต่างกัน', async () => {
            const first = (await exportAs(fx.adminA, 'harvest-batches', 'jsonl')).trim().split('\n').map(l => JSON.parse(l));
            expect(first).toHaveLength(2);
            expect(JSON.stringify(first)).not.toContain(farmId);
            expect(first[0].farmId).toMatch(/^[0-9a-f]{32}$/);
            expect(first[0].farmId).toBe(first[1].farmId);

            const csv = await exportAs(fx.adminA, 'harvest-batches', 'csv');
            expect(csv).not.toContain(farmId);
            expect(csv).toContain(first[0].farmId);

            const original = process.env.DATASET_PSEUDONYM_KEY;
            process.env.DATASET_PSEUDONYM_KEY = `rotated-dataset-key-${'z'.repeat(40)}`;
            try {
                const rotated = (await exportAs(fx.adminA, 'harvest-batches', 'jsonl')).trim().split('\n').map(l => JSON.parse(l));
                expect(rotated[0].farmId).toMatch(/^[0-9a-f]{32}$/);
                expect(rotated[0].farmId).not.toBe(first[0].farmId);
            } finally {
                if (original === undefined) { delete process.env.DATASET_PSEUDONYM_KEY; } else { process.env.DATASET_PSEUDONYM_KEY = original; }
            }
        });

        test('ผู้ดูแลกรมองค์กร B ส่งออกได้เฉพาะข้อมูลขององค์กร B', async () => {
            const out = await exportAs(fx.adminB, 'harvest-batches', 'jsonl');
            expect(out.trim()).toBe('');
            const survey = await exportAs(fx.adminB, 'survey-responses', 'jsonl');
            expect(survey).toContain('คำตอบขององค์กร B');
            expect(survey).not.toContain(COMMON_WORD);
        });
    });
});

/**
 * แบบสำรวจ: หนึ่งบัญชีตอบได้ครั้งเดียว ตอบได้เฉพาะกลุ่มเป้าหมาย สถิติรวมคำนวณย้อนไม่ได้ (security re-review cb4a23f77)
 *
 * H1a บัญชีเดียวส่งซ้ำ = 409 SURVEY_ALREADY_ANSWERED (ส่งพร้อมกันก็ได้แถวเดียว) · ถอนความยินยอมแล้วตอบใหม่ไม่ได้
 *     ผู้อ่านสถิติรวมปลูกคำตอบแล้วลบออกเพื่อหาช่องที่ถูกปิดไม่ได้อีก
 * H1b ตอบได้เฉพาะกลุ่มเป้าหมาย: FARMER = ผู้ยื่น (health) · DTAM_STAFF = เจ้าหน้าที่กรมขององค์กรเดียวกัน
 *     EXPERT / OPERATOR = ไม่มีใครตอบผ่านประตูนี้ · รายการที่เปิดรับคำตอบแสดงเฉพาะที่ตอบได้ พร้อมบอกว่าตอบแล้ว
 * L1  ตัวเลือกซ้ำในคำถามหลายตัวเลือกนับครั้งเดียว
 * L2  กุญแจรหัสแฝงที่ต่างจาก HMAC_KEY แค่ช่องว่างหัวท้าย = 503
 * L3  ถอนความยินยอมแล้วสถิติรวมไม่เปลี่ยน: คำสำคัญจากข้อความอิสระไม่อยู่ในสถิติรวม
 * F2  เครื่องหมายผู้ตอบใช้กุญแจของตัวเอง (SURVEY_RESPONDENT_KEY): หมุน HMAC_KEY หรือหมุนกุญแจนี้
 *     (กุญแจเก่าอยู่ใน SURVEY_RESPONDENT_KEYS_RETIRED) แล้วบัญชีเดิมยังตอบซ้ำไม่ได้ · ลบบัญชีล้างเครื่องหมายใต้กุญแจเก่า
 * F3  คำตอบของการส่งแบบสำรวจไม่มี respondentMarker และ respondentUserId
 */

'use strict';

process.env.TENANT_READ_ORG_SCOPE = 'false';

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { RESEARCH_CONSENT_NOTICE } = require('../../shared/research-consent-notice');

const mockActor = { current: null };
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

d('แบบสำรวจ: หนึ่งบัญชีตอบครั้งเดียว · เฉพาะกลุ่มเป้าหมาย (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { orgIds: [], userIds: [], templateIds: [] };
    let seq = 0;

    const as = (user) => { mockActor.current = { ...user }; };

    async function user(role, organizationId, accountType) {
        const id = crypto.randomUUID();
        seq += 1;
        await raw.user.create({
            data: {
                id, canonicalId: `so-${seq}-${sfx}`, password: 'x', role,
                authType: accountType === 'PROVIDER' ? 'PROVIDER_ID' : 'EMAIL_LEGACY',
                ...(accountType === 'PROVIDER' ? { providerId: `so-${seq}-${sfx}` } : { healthId: `so-${seq}-${sfx}` }),
                email: `so-${seq}-${sfx}@example.test`, firstName: `ชื่อ${seq}`, lastName: `สกุล${seq}`,
                organizationId, status: 'ACTIVE', accountType,
            },
        });
        fx.userIds.push(id);
        return { id, role, canonicalRole: role, organizationId };
    }

    async function template(code, { targetGroup = 'FARMER', organizationId = fx.orgA } = {}) {
        const t = await raw.surveyTemplate.create({
            data: { code: `${code}-${sfx}`, title: `แบบสำรวจ ${code}`, status: 'ACTIVE', organizationId, targetGroup },
        });
        fx.templateIds.push(t.id);
        const q = async (sortOrder, questionText, questionType, choices) => raw.surveyQuestion.create({
            data: { templateId: t.id, sortOrder, questionText, questionType, choices, isRequired: true, organizationId },
        });
        return {
            id: t.id,
            choice: (await q(1, 'แหล่งน้ำ', 'SINGLE_CHOICE', ['ประปา', 'บาดาล'])).id,
            multi: (await q(2, 'ปัญหา', 'MULTI_CHOICE', ['ราคา', 'แรงงาน', 'น้ำ'])).id,
            text: (await q(3, 'ข้อเสนอแนะ', 'TEXTAREA')).id,
        };
    }

    const submit = (who, t, { choice = 'ประปา', multi = ['ราคา'], text = 'ไม่มี' } = {}) => {
        as(who);
        return request(app).post(`/api/surveys/templates/${t.id}/responses`).send({
            region: 'NORTH', researchConsent: CONSENT,
            answers: [
                { questionId: t.choice, value: choice },
                { questionId: t.multi, value: multi },
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

    const close = async (t) => {
        as(fx.adminA);
        expect((await request(app).post(`/api/surveys/templates/${t.id}/close`)).status).toBe(200);
    };

    const rows = (t) => raw.surveyResponse.count({ where: { templateId: t.id } });

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        for (const tag of ['a', 'b']) {
            const org = await raw.organization.create({ data: { name: `so-${tag}-${sfx}`, slug: `so-${tag}-${sfx}`, code: `SO${tag}_${sfx}`.toUpperCase() } });
            fx.orgIds.push(org.id);
        }
        [fx.orgA, fx.orgB] = fx.orgIds;
        fx.adminA = await user('system_admin_dtam', fx.orgA, 'PROVIDER');
        fx.reviewerA = await user('document_reviewer', fx.orgA, 'PROVIDER');
        fx.inspectorB = await user('field_inspector', fx.orgB, 'PROVIDER');
        fx.platformAdmin = await user('system_admin_platform', fx.orgA, 'PROVIDER');
        fx.financePlatform = await user('finance_officer_platform', fx.orgA, 'PROVIDER');
        fx.farmers = [];
        for (let i = 0; i < 10; i += 1) {
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
        await raw.auditLog.deleteMany({ where: { organizationId: { in: fx.orgIds } } }).catch(() => {});
        await raw.user.deleteMany({ where: { id: { in: fx.userIds } } }).catch(() => {});
        await raw.organization.deleteMany({ where: { id: { in: fx.orgIds } } }).catch(() => {});
        await raw.$disconnect();
    });

    describe('H1a: หนึ่งบัญชีตอบได้ครั้งเดียว', () => {
        test('ส่งซ้ำจากบัญชีเดิม = 409 SURVEY_ALREADY_ANSWERED และมีแถวเดียว · บัญชีอื่นยังตอบได้', async () => {
            const t = await template('SO-TWICE');
            expect((await submit(fx.farmers[0], t)).status).toBe(201);
            const again = await submit(fx.farmers[0], t, { choice: 'บาดาล' });
            expect(again.status).toBe(409);
            expect(again.body.error).toBe('SURVEY_ALREADY_ANSWERED');
            expect(again.body.messageTh).toEqual(expect.any(String));
            expect(await rows(t)).toBe(1);
            expect((await submit(fx.farmers[1], t)).status).toBe(201);
            expect(await rows(t)).toBe(2);
        });

        test('ส่งพร้อมกันสองครั้งจากบัญชีเดิม = 201 หนึ่งครั้ง 409 หนึ่งครั้ง ไม่มี 500 และมีแถวเดียว', async () => {
            const t = await template('SO-RACE');
            const results = await Promise.all([0, 1, 2, 3].map(() => {
                as(fx.farmers[0]);
                return request(app).post(`/api/surveys/templates/${t.id}/responses`).send({
                    region: 'NORTH', researchConsent: CONSENT,
                    answers: [
                        { questionId: t.choice, value: 'ประปา' },
                        { questionId: t.multi, value: ['ราคา'] },
                        { questionId: t.text, value: 'พร้อมกัน' },
                    ],
                });
            }));
            expect(results.map(r => r.status).sort()).toEqual([201, 409, 409, 409]);
            for (const r of results.filter(x => x.status === 409)) {
                expect(r.body.error).toBe('SURVEY_ALREADY_ANSWERED');
            }
            expect(await rows(t)).toBe(1);
        });

        test('ปลูกคำตอบเพื่อลบหาช่องที่ถูกปิดไม่ได้: บาดาล 1 คนยังถูกปิดหลังผู้โจมตีพยายามปลูก 4 ครั้ง', async () => {
            const t = await template('SO-PLANT');
            for (let i = 0; i < 6; i += 1) {
                expect((await submit(fx.farmers[i], t, { choice: 'ประปา' })).status).toBe(201);
            }
            expect((await submit(fx.farmers[6], t, { choice: 'บาดาล' })).status).toBe(201);

            const attacker = fx.farmers[7];
            const planted = [];
            for (let i = 0; i < 4; i += 1) {
                planted.push((await submit(attacker, t, { choice: 'บาดาล' })).status);
            }
            expect(planted).toEqual([201, 409, 409, 409]);

            await close(t);
            const data = await stats(fx.reviewerA, t);
            const choice = data.questions.find(q => q.questionText === 'แหล่งน้ำ');
            expect(choice.choiceCounts.บาดาล).toBeUndefined();
            expect(choice.hasSuppressedCells).toBe(true);
            // the attack: shown บาดาล − planted rows = the hidden respondent
            const recovered = (choice.choiceCounts.บาดาล ?? 0) - 4;
            expect(recovered).not.toBe(1);
        });

        test('ถอนความยินยอมแล้วตอบแบบสำรวจเดิมอีกไม่ได้ · แบบสำรวจใหม่ยังตอบได้ · ลบบัญชีแล้วไม่เหลือเครื่องหมายผู้ตอบ', async () => {
            const t = await template('SO-WITHDRAW');
            const who = fx.farmers[8];
            expect((await submit(who, t)).status).toBe(201);
            as(who);
            expect((await request(app).post('/api/surveys/research-consent/withdraw')).status).toBe(200);
            const row = await raw.surveyResponse.findFirst({ where: { templateId: t.id } });
            expect(row.respondentUserId).toBeNull();
            expect(row.researchConsentWithdrawnAt).toBeInstanceOf(Date);
            expect(row.respondentMarker).toMatch(/^[0-9a-f]{64}$/);
            expect(JSON.stringify(row)).not.toContain(who.id);

            const again = await submit(who, t);
            expect(again.status).toBe(409);
            expect(again.body.error).toBe('SURVEY_ALREADY_ANSWERED');
            expect(await rows(t)).toBe(1);

            const fresh = await template('SO-WITHDRAW-NEXT');
            expect((await submit(who, fresh)).status).toBe(201);

            const surveyService = require('../../services/survey-service');
            await surveyService.anonymiseResponsesOfUser(raw, who.id);
            const erased = await raw.surveyResponse.findFirst({ where: { templateId: fresh.id } });
            expect(erased.respondentUserId).toBeNull();
            expect(erased.respondentMarker).toBeNull();
            const withdrawnThenErased = await raw.surveyResponse.findFirst({ where: { templateId: t.id } });
            expect(withdrawnThenErased.respondentMarker).toBeNull();
        });
    });

    describe('F2: กุญแจเครื่องหมายผู้ตอบแยกจาก HMAC_KEY และหมุนได้', () => {
        const NAMES = ['HMAC_KEY', 'SURVEY_RESPONDENT_KEY', 'SURVEY_RESPONDENT_KEYS_RETIRED'];
        let saved;
        beforeEach(() => { saved = Object.fromEntries(NAMES.map(n => [n, process.env[n]])); });
        afterEach(() => {
            for (const n of NAMES) {
                if (saved[n] === undefined) { delete process.env[n]; } else { process.env[n] = saved[n]; }
            }
        });
        const keyA = `so-survey-key-a-${sfx}-0123456789abcdef0123456789`;
        const keyB = `so-survey-key-b-${sfx}-0123456789abcdef0123456789`;

        test('ตอบแล้ว → หมุน HMAC_KEY → หมุนกุญแจผู้ตอบ (เก่าเข้ารายการเลิกใช้): ส่งซ้ำ 409 ทุกขั้น · /active ยังบอกว่าตอบแล้ว · ลบบัญชีล้างเครื่องหมายใต้กุญแจเก่า', async () => {
            process.env.SURVEY_RESPONDENT_KEY = keyA;
            delete process.env.SURVEY_RESPONDENT_KEYS_RETIRED;
            const t = await template('SO-ROTATE');
            const who = fx.farmers[5];
            expect((await submit(who, t)).status).toBe(201);
            const before = await raw.surveyResponse.findFirst({ where: { templateId: t.id } });

            process.env.HMAC_KEY = `so-hmac-rotated-${sfx}-0123456789abcdef0123456789`;
            const afterHmac = await submit(who, t);
            expect({ status: afterHmac.status, error: afterHmac.body.error }).toEqual({ status: 409, error: 'SURVEY_ALREADY_ANSWERED' });

            process.env.SURVEY_RESPONDENT_KEY = keyB;
            process.env.SURVEY_RESPONDENT_KEYS_RETIRED = ` other-retired-key-${sfx}-0123456789abcdef , ${keyA} `;
            const afterRotate = await submit(who, t);
            expect({ status: afterRotate.status, error: afterRotate.body.error }).toEqual({ status: 409, error: 'SURVEY_ALREADY_ANSWERED' });
            expect(await rows(t)).toBe(1);

            as(who);
            const active = await request(app).get('/api/surveys/active');
            expect(active.body.data.find(x => x.id === t.id).alreadyAnswered).toBe(true);

            expect((await submit(fx.farmers[6], t)).status).toBe(201);
            const newKeyRow = await raw.surveyResponse.findFirst({ where: { templateId: t.id, NOT: { id: before.id } } });
            expect(newKeyRow.respondentMarker).toMatch(/^[0-9a-f]{64}$/);
            expect(newKeyRow.respondentMarker).not.toBe(before.respondentMarker);

            const surveyService = require('../../services/survey-service');
            await surveyService.anonymiseResponsesOfUser(raw, who.id);
            const erased = await raw.surveyResponse.findUnique({ where: { id: before.id } });
            expect({ user: erased.respondentUserId, marker: erased.respondentMarker }).toEqual({ user: null, marker: null });
            const other = await raw.surveyResponse.findUnique({ where: { id: newKeyRow.id } });
            expect(other.respondentMarker).toBe(newKeyRow.respondentMarker);
        });

        test('กุญแจผู้ตอบเท่ากับ HMAC_KEY หรือ DATASET_PSEUDONYM_KEY เมื่อตัดช่องว่างหัวท้าย = 503 และไม่มีแถว', async () => {
            const t = await template('SO-KEY-REUSE');
            const hmac = `so-hmac-key-${sfx}-0123456789abcdef0123456789`;
            process.env.HMAC_KEY = hmac;
            const pseudonym = require('../../config/secrets').tryGetSecret('DATASET_PSEUDONYM_KEY');
            for (const reused of [`${hmac} `, ` ${hmac}\n`, ` ${pseudonym}`]) {
                process.env.SURVEY_RESPONDENT_KEY = reused;
                const res = await submit(fx.farmers[7], t);
                expect({ status: res.status, error: res.body.error })
                    .toEqual({ status: 503, error: 'SURVEY_RESPONDENT_KEY_REUSES_SHARED_KEY' });
            }
            expect(await rows(t)).toBe(0);
        });
    });

    test('F3: คำตอบของการส่งมีแค่ id templateId status submittedAt ไม่มี respondentMarker และ respondentUserId', async () => {
        const t = await template('SO-BODY');
        const res = await submit(fx.farmers[4], t);
        expect(res.status).toBe(201);
        expect(Object.keys(res.body.data).sort()).toEqual(['id', 'status', 'submittedAt', 'templateId']);
        expect(res.body.data).not.toHaveProperty('respondentMarker');
        expect(res.body.data).not.toHaveProperty('respondentUserId');
        expect(JSON.stringify(res.body)).not.toContain(fx.farmers[4].id);
    });

    describe('H1b: ตอบได้เฉพาะกลุ่มเป้าหมาย', () => {
        test('FARMER: ผู้ยื่นตอบได้ · เจ้าหน้าที่ทุกฝั่งได้ 403 SURVEY_NOT_FOR_RESPONDENT และไม่มีแถว', async () => {
            const t = await template('SO-FARMER');
            for (const staff of [fx.reviewerA, fx.adminA, fx.platformAdmin, fx.financePlatform]) {
                const res = await submit(staff, t);
                expect({ role: staff.role, status: res.status, error: res.body.error })
                    .toEqual({ role: staff.role, status: 403, error: 'SURVEY_NOT_FOR_RESPONDENT' });
            }
            expect(await rows(t)).toBe(0);
            expect((await submit(fx.farmers[9], t)).status).toBe(201);
        });

        test('DTAM_STAFF: เจ้าหน้าที่กรมองค์กรเดียวกันตอบได้ · ผู้ยื่น เจ้าหน้าที่องค์กรอื่น และฝั่งบริษัทได้ 403', async () => {
            const t = await template('SO-STAFF', { targetGroup: 'DTAM_STAFF' });
            for (const who of [fx.farmers[0], fx.inspectorB, fx.platformAdmin, fx.financePlatform]) {
                const res = await submit(who, t);
                expect({ role: who.role, status: res.status }).toEqual({ role: who.role, status: 403 });
            }
            expect(await rows(t)).toBe(0);
            expect((await submit(fx.reviewerA, t)).status).toBe(201);
        });

        test('EXPERT และ OPERATOR: ไม่มีบัญชีใดตอบผ่านประตูนี้', async () => {
            for (const group of ['EXPERT', 'OPERATOR']) {
                const t = await template(`SO-${group}`, { targetGroup: group });
                for (const who of [fx.farmers[0], fx.reviewerA, fx.adminA, fx.platformAdmin]) {
                    const res = await submit(who, t);
                    expect({ group, role: who.role, status: res.status }).toEqual({ group, role: who.role, status: 403 });
                }
                expect(await rows(t)).toBe(0);
            }
        });

        test('/active แสดงเฉพาะแบบสำรวจที่บัญชีนี้ตอบได้ และบอกว่าตอบแล้ว', async () => {
            const farmerOpen = await template('SO-LIST-F');
            const staffOpen = await template('SO-LIST-S', { targetGroup: 'DTAM_STAFF' });
            const staffOther = await template('SO-LIST-SB', { targetGroup: 'DTAM_STAFF', organizationId: fx.orgB });
            const expertOpen = await template('SO-LIST-E', { targetGroup: 'EXPERT' });
            expect((await submit(fx.farmers[2], farmerOpen)).status).toBe(201);

            const list = async (who) => {
                as(who);
                const res = await request(app).get('/api/surveys/active');
                expect(res.status).toBe(200);
                return new Map(res.body.data.map(t => [t.id, t]));
            };

            const forFarmer = await list(fx.farmers[2]);
            expect(forFarmer.get(farmerOpen.id).alreadyAnswered).toBe(true);
            for (const id of [staffOpen.id, staffOther.id, expertOpen.id]) { expect(forFarmer.has(id)).toBe(false); }
            expect((await list(fx.farmers[3])).get(farmerOpen.id).alreadyAnswered).toBe(false);

            const forStaff = await list(fx.reviewerA);
            expect(forStaff.get(staffOpen.id).alreadyAnswered).toBe(false);
            for (const id of [farmerOpen.id, staffOther.id, expertOpen.id]) { expect(forStaff.has(id)).toBe(false); }

            const forPlatform = await list(fx.platformAdmin);
            for (const id of [farmerOpen.id, staffOpen.id, staffOther.id, expertOpen.id]) { expect(forPlatform.has(id)).toBe(false); }
        });
    });

    test('L1: ตัวเลือกซ้ำในคำถามหลายตัวเลือกนับครั้งเดียว', async () => {
        const t = await template('SO-MULTI');
        expect((await submit(fx.farmers[0], t, { multi: ['ราคา', 'ราคา', 'ราคา', 'น้ำ'] })).status).toBe(201);
        const data = await stats(fx.adminA, t);
        expect(data.questions.find(q => q.questionText === 'ปัญหา').choiceCounts).toEqual({ ราคา: 1, น้ำ: 1 });
    });

    test('L2: กุญแจรหัสแฝงที่เท่ากับ HMAC_KEY เมื่อตัดช่องว่างหัวท้าย = 503 · กุญแจต่างกันจริงส่งออกได้', async () => {
        const saved = { hmac: process.env.HMAC_KEY, pseudonym: process.env.DATASET_PSEUDONYM_KEY };
        const hmac = `so-hmac-key-${sfx}-0123456789abcdef0123456789`;
        try {
            process.env.HMAC_KEY = hmac;
            as(fx.adminA);
            for (const padded of [`${hmac} `, ` ${hmac}`, `${hmac}\n`]) {
                process.env.DATASET_PSEUDONYM_KEY = padded;
                const res = await request(app).get('/api/datasets/survey-responses/export?format=jsonl');
                expect({ padded: JSON.stringify(padded).length, status: res.status, error: res.body.error })
                    .toEqual({ padded: JSON.stringify(padded).length, status: 503, error: 'DATASET_PSEUDONYM_KEY_REUSES_HMAC_KEY' });
            }
            process.env.DATASET_PSEUDONYM_KEY = `so-other-key-${sfx}-0123456789abcdef0123456789`;
            expect((await request(app).get('/api/datasets/survey-responses/export?format=jsonl')).status).toBe(200);
        } finally {
            for (const [name, value] of [['HMAC_KEY', saved.hmac], ['DATASET_PSEUDONYM_KEY', saved.pseudonym]]) {
                if (value === undefined) { delete process.env[name]; } else { process.env[name] = value; }
            }
        }
    });

    test('L3: ถอนความยินยอมหลังปิดรับคำตอบ สถิติรวมไม่เปลี่ยน (ไม่มีคำสำคัญจากข้อความอิสระ) · ผู้ดูแลกรมยังเห็นคำสำคัญ', async () => {
        const t = await template('SO-KEYWORD');
        for (let i = 0; i < 5; i += 1) {
            expect((await submit(fx.farmers[i], t, { text: 'ราคาตลาดกลาง' })).status).toBe(201);
        }
        await close(t);
        const before = await stats(fx.reviewerA, t);
        const admin = await stats(fx.adminA, t);
        expect(admin.questions.find(q => q.questionText === 'ข้อเสนอแนะ').topKeywords.find(k => k.word === 'ตลาด').count).toBe(5);

        as(fx.farmers[4]);
        expect((await request(app).post('/api/surveys/research-consent/withdraw')).status).toBe(200);
        const after = await stats(fx.reviewerA, t);
        expect(after).toEqual(before);
        expect(JSON.stringify(after)).not.toContain('ตลาด');
    });
});

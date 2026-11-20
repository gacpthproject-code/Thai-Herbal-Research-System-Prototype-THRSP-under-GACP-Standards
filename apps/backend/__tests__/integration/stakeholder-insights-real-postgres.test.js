'use strict';

/**
 * ต้นแบบที่ 3 บน Postgres จริง ผ่านประตู GET /api/surveys/insights
 *
 * - ผู้ดูแลระบบของกรมเห็นผลวิเคราะห์ข้อความอิสระขององค์กรตัวเอง เจ้าหน้าที่บทบาทอื่นได้ 403
 * - คำตอบที่ถอนความยินยอมแล้ว และบทสัมภาษณ์ที่ถอนความยินยอมแล้ว ไม่เข้าการวิเคราะห์
 * - คำตอบขององค์กรอื่นไม่เข้าการวิเคราะห์
 * - คำถามแบบเลือกตอบไม่เข้าการวิเคราะห์ข้อความ
 * - เลือกชุดข้อความสาธารณะได้ และแหล่งที่ไม่รู้จักได้ 400
 *
 * ข้อความในไฟล์นี้เป็นข้อมูลทดสอบที่เขียนขึ้นเพื่อทดสอบ ไม่ใช่คำตอบจริงของใคร
 */

process.env.TENANT_READ_ORG_SCOPE = 'false';

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');

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

const { REDACTED_TEXT } = require('../../services/survey-service');
const { CORPUS_EXCERPTS } = require('../../data/research/stakeholder-needs-corpus');

d('ต้นแบบที่ 3: วิเคราะห์ข้อความความต้องการ (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { orgIds: [], userIds: [], templateIds: [], interviewIds: [] };

    async function org(label) {
        const row = await raw.organization.create({
            data: { name: `si-${label}-${sfx}`, slug: `si-${label}-${sfx}`, code: `SI_${label}_${sfx}`.toUpperCase() },
        });
        fx.orgIds.push(row.id);
        return row.id;
    }

    async function staff(label, role, organizationId) {
        const id = crypto.randomUUID();
        await raw.user.create({
            data: {
                id, canonicalId: `si-${label}-${sfx}`, providerId: `si-${label}-${sfx}`, password: 'x', role,
                authType: 'PROVIDER_ID', email: `si-${label}-${sfx}@example.test`, firstName: 'ทดสอบ', lastName: label,
                organizationId, status: 'ACTIVE', accountType: 'PROVIDER',
            },
        });
        fx.userIds.push(id);
        return { id, role, canonicalRole: role, organizationId };
    }

    async function survey(organizationId, answers) {
        const template = await raw.surveyTemplate.create({
            data: { code: `SI-${fx.templateIds.length}-${sfx}`, title: 'แบบสำรวจทดสอบ', status: 'CLOSED', organizationId, targetGroup: 'FARMER' },
        });
        fx.templateIds.push(template.id);
        const text = await raw.surveyQuestion.create({
            data: { templateId: template.id, sortOrder: 1, questionText: 'ปัญหาที่พบ', questionType: 'TEXTAREA', organizationId },
        });
        const choice = await raw.surveyQuestion.create({
            data: { templateId: template.id, sortOrder: 2, questionText: 'แหล่งน้ำ', questionType: 'SINGLE_CHOICE', choices: ['ค่าใช้จ่ายสูง'], organizationId },
        });
        for (const answer of answers) {
            await raw.surveyResponse.create({
                data: {
                    templateId: template.id, region: 'NORTH', organizationId,
                    researchConsentWithdrawnAt: answer.withdrawn ? new Date() : null,
                    answers: {
                        create: [
                            { questionId: text.id, valueText: answer.text, organizationId },
                            { questionId: choice.id, valueText: 'ค่าใช้จ่ายสูง', organizationId },
                        ],
                    },
                },
            });
        }
    }

    async function interview(organizationId, transcript, { withdrawn = false } = {}) {
        const row = await raw.expertInterview.create({
            data: {
                title: 'สัมภาษณ์ทดสอบ', intervieweeName: 'ผู้ให้สัมภาษณ์ทดสอบ', interviewDate: new Date('2026-10-01T03:00:00Z'),
                transcript, keyInsights: ['ต้องการที่ปรึกษาเรื่องเอกสาร'], intervieweeConsentGiven: true,
                intervieweeConsentDate: new Date('2026-09-30T03:00:00Z'), organizationId,
                intervieweeConsentWithdrawnAt: withdrawn ? new Date() : null,
            },
        });
        fx.interviewIds.push(row.id);
    }

    const as = (actor) => { mockActor.current = actor; };
    const get = (query = '') => request(app).get(`/api/surveys/insights${query}`);
    const theme = (res, id) => res.body.data.themes.find((t) => t.id === id);

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        fx.orgA = await org('a');
        fx.orgB = await org('b');
        fx.admin = await staff('admin', 'system_admin_dtam', fx.orgA);
        fx.reviewer = await staff('reviewer', 'document_reviewer', fx.orgA);
        fx.adminB = await staff('adminb', 'system_admin_dtam', fx.orgB);
        await survey(fx.orgA, [
            { text: 'ค่าใช้จ่ายในการตรวจวิเคราะห์ที่ห้องปฏิบัติการสูงเกินไปสำหรับเกษตรกรรายย่อย' },
            { text: 'อยากมีตลาดรับซื้อที่แน่นอนก่อนลงทุนปลูกตามมาตรฐาน' },
            { text: REDACTED_TEXT },
            { text: 'ข้อความของผู้ตอบที่ถอนความยินยอมแล้วเรื่องราคาถูก', withdrawn: true },
        ]);
        await interview(fx.orgA, 'ผู้เชี่ยวชาญเห็นว่าเกษตรกรต้องการอบรมการเขียนเอกสาร SOP ก่อนยื่นคำขอ');
        await interview(fx.orgA, 'บทสัมภาษณ์ที่ถอนความยินยอมเรื่องรายได้', { withdrawn: true });
        await survey(fx.orgB, [{ text: 'คำตอบขององค์กรอื่นเรื่องรายได้และสัญญาซื้อขาย' }]);

        app = express();
        app.use(express.json());
        app.use('/api/surveys', require('../../routes/api/surveys/surveys'));
    });

    afterAll(async () => {
        if (!raw) { return; }
        await raw.surveyAnswer.deleteMany({ where: { response: { templateId: { in: fx.templateIds } } } }).catch(() => {});
        await raw.surveyResponse.deleteMany({ where: { templateId: { in: fx.templateIds } } }).catch(() => {});
        await raw.surveyQuestion.deleteMany({ where: { templateId: { in: fx.templateIds } } }).catch(() => {});
        await raw.surveyTemplate.deleteMany({ where: { id: { in: fx.templateIds } } }).catch(() => {});
        await raw.expertInterview.deleteMany({ where: { id: { in: fx.interviewIds } } }).catch(() => {});
        await raw.user.deleteMany({ where: { id: { in: fx.userIds } } }).catch(() => {});
        await raw.organization.deleteMany({ where: { id: { in: fx.orgIds } } }).catch(() => {});
        await raw.$disconnect();
    });

    test('เจ้าหน้าที่บทบาทอื่นได้ 403', async () => {
        as(fx.reviewer);
        expect((await get()).status).toBe(403);
    });

    test('ผู้ดูแลระบบเห็นข้อความขององค์กรตัวเองเท่านั้น ไม่รวมที่ถอนความยินยอม', async () => {
        as(fx.admin);
        const res = await get();
        expect(res.status).toBe(200);
        const data = res.body.data;
        expect(data.basis).toBe('SYSTEM');
        expect(data.documentCount).toBe(3);
        expect(data.available.system).toBe(3);
        expect(data.groups).toEqual([
            { group: 'FARMER', label: 'เกษตรกร', documents: 2 },
            { group: 'EXPERT', label: 'ผู้เชี่ยวชาญ', documents: 1 },
        ]);
        expect(theme(res, 'COST').documents).toBe(1);
        expect(theme(res, 'LAB_TESTING').documents).toBe(1);
        expect(theme(res, 'MARKET').documents).toBe(1);
        expect(theme(res, 'INCOME').documents).toBe(0);
        const everything = JSON.stringify(data);
        expect(everything).not.toContain('ถอนความยินยอม');
        expect(everything).not.toContain('องค์กรอื่น');
        expect(everything).not.toContain(REDACTED_TEXT);
    });

    test('ประโยคสรุปมาจากคำตอบจริงในฐานข้อมูล', async () => {
        as(fx.admin);
        const res = await get();
        const stored = [
            'ค่าใช้จ่ายในการตรวจวิเคราะห์ที่ห้องปฏิบัติการสูงเกินไปสำหรับเกษตรกรรายย่อย',
            'อยากมีตลาดรับซื้อที่แน่นอนก่อนลงทุนปลูกตามมาตรฐาน',
            'ผู้เชี่ยวชาญเห็นว่าเกษตรกรต้องการอบรมการเขียนเอกสาร SOP ก่อนยื่นคำขอ\nต้องการที่ปรึกษาเรื่องเอกสาร',
        ];
        res.body.data.summary.keySentences.forEach((sentence) => {
            expect(stored.some((text) => text.includes(sentence.text))).toBe(true);
        });
    });

    test('อีกองค์กรเห็นเฉพาะของตัวเอง', async () => {
        as(fx.adminB);
        const res = await get();
        expect(res.body.data.documentCount).toBe(1);
        expect(theme(res, 'INCOME').documents).toBe(1);
    });

    test('เลือกชุดข้อความสาธารณะได้ พร้อมแหล่ง', async () => {
        as(fx.admin);
        const res = await get('?basis=corpus');
        expect(res.status).toBe(200);
        expect(res.body.data.basis).toBe('CORPUS');
        expect(res.body.data.documentCount).toBe(CORPUS_EXCERPTS.length);
        expect(res.body.data.corpus.sources.length).toBeGreaterThan(0);
    });

    test('แหล่งที่ไม่รู้จักได้ 400', async () => {
        as(fx.admin);
        const res = await get('?basis=web');
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('INSIGHT_BASIS_INVALID');
    });
});

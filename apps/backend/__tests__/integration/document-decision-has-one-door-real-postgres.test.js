/**
 * การตัดสินผลตรวจเอกสารมีประตูเดียว คือหน้าตรวจเอกสารรายฉบับ (real Postgres)
 *
 * รายงาน role-workflow-auditor 2026-10-06 (R-H4, R-M1, dispatcher D2):
 * - ปุ่ม "อนุมัติเอกสาร" ในหน้ารายละเอียดยิง /workflow-transitions ซึ่งไม่ดูรายฉบับเลย บน staging
 *   ปุ่มขึ้นบนคำขอ aa75ba6e ที่หน้าตรวจรายฉบับบอกว่า INCOMPLETE
 * - บันทึกผลรายฉบับได้หลังคำขอพ้นขั้นตรวจเอกสารไปแล้ว แก้บันทึกที่ผู้อนุมัติใช้ตัดสินได้
 * - การมอบผู้ตรวจเอกสารเขียนเลขประจำตัวประชาชน 13 หลักของเจ้าหน้าที่ลง formData แล้วส่งออกทาง
 *   GET /api/provider/applications/:id (คำสั่ง 10)
 */

'use strict';

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { settleMilestones } = require('../../test-support/settled-milestones');

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

const SLOT = 'sop_manual';
const NATIONAL_ID = '3100000000124';

d('ตัดสินผลตรวจเอกสารได้ที่หน้าตรวจรายฉบับเท่านั้น (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { userIds: [], entityIds: [], appIds: [], ruleIds: [] };
    let seq = 0;

    const as = (user) => { mockActor.current = { ...user }; };
    const statusOf = async (id) => (await raw.application.findUnique({ where: { id }, select: { status: true } })).status;

    async function staff(role, providerId) {
        const id = crypto.randomUUID();
        seq += 1;
        await raw.user.create({
            data: {
                id, canonicalId: `dd-${seq}-${sfx}`, password: 'x', role, authType: 'PROVIDER_ID',
                providerId: providerId || `dd-${seq}-${sfx}`, email: `dd-${seq}-${sfx}@example.test`,
                firstName: 'เจ้าหน้าที่', lastName: role, organizationId: fx.org, status: 'ACTIVE', accountType: 'PROVIDER',
            },
        });
        fx.userIds.push(id);
        return { id, role, canonicalRole: role, organizationId: fx.org };
    }

    async function application(status, milestones, extra = {}) {
        seq += 1;
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-DD-${seq}-${sfx}`, healthId: fx.applicant.canonicalId, areaType: 'OUTDOOR',
                organizationId: fx.org, entityId: fx.entity, submitterId: fx.applicant.id, status,
                formData: { workflowState: status, plantId: 'cannabis', certificationPurposes: ['RESEARCH'] }, ...extra,
            },
        });
        fx.appIds.push(row.id);
        await settleMilestones(raw, { id: row.id, healthId: fx.applicant.canonicalId, organizationId: fx.org }, milestones);
        return row.id;
    }

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        const { deriveDimensions } = require('../../services/application-requirements-service');
        fx.org = (await raw.organization.create({ data: { name: `dd-${sfx}`, slug: `dd-${sfx}`, code: `DD_${sfx}`.toUpperCase() } })).id;
        fx.dispatcher = await staff('dispatcher');
        fx.reviewer = await staff('document_reviewer', NATIONAL_ID);

        const applicantId = crypto.randomUUID();
        fx.applicant = { id: applicantId, canonicalId: `dd-app-${sfx}` };
        await raw.user.create({
            data: {
                id: applicantId, canonicalId: fx.applicant.canonicalId, healthId: fx.applicant.canonicalId, password: 'x',
                role: 'health', authType: 'EMAIL_LEGACY', email: `dd-app-${sfx}@example.test`,
                firstName: 'ผู้ยื่น', lastName: 'ทดสอบ', organizationId: fx.org,
            },
        });
        fx.userIds.push(applicantId);
        fx.entity = (await raw.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท dd ${sfx} จำกัด`, organizationId: fx.org } })).id;
        fx.entityIds.push(fx.entity);

        const plantCode = deriveDimensions({ id: 'probe', areaType: 'OUTDOOR', formData: { plantId: 'cannabis' } }).plantCode;
        const rule = await raw.requirementRule.create({
            data: {
                plantCode, slotId: SLOT, isRequired: true, effectiveFrom: new Date('2020-01-03'),
                createdBy: fx.reviewer.id, reason: 'fixture: one required paper the reviewer has not accepted',
            },
        });
        fx.ruleIds.push(rule.id);

        app = express();
        app.use(express.json());
        app.use('/api/provider/applications', require('../../routes/api/provider/applications'));
        app.use('/api/provider/applications', require('../../routes/api/provider/document-reviews'));
        app.use('/api/provider/scheduler', require('../../routes/api/provider/scheduler'));
    });

    afterAll(async () => {
        const wipe = (model, where) => raw[model].deleteMany({ where }).catch(() => {});
        const byApp = { applicationId: { in: fx.appIds } };
        for (const model of ['applicationDocumentReview', 'revisionDeadline', 'correctionRound', 'applicationDocument', 'workActivity',
            'checkoutOrder', 'invoice']) {
            await wipe(model, byApp);
        }
        await wipe('notification', { userId: { in: fx.userIds } });
        await wipe('auditLog', { organizationId: fx.org });
        await wipe('auditLog', { resourceId: { in: fx.appIds } });
        await wipe('assignmentLedgerEntry', { assigneeUserId: { in: fx.userIds } });
        await wipe('application', { id: { in: fx.appIds } });
        await wipe('requirementRule', { id: { in: fx.ruleIds } });
        await wipe('entity', { id: { in: fx.entityIds } });
        await wipe('user', { id: { in: fx.userIds } });
        await wipe('organization', { id: fx.org });
        await raw.$disconnect();
    });

    const transition = (id, body) => request(app).post(`/api/provider/applications/${id}/workflow-transitions`).send(body);

    test('ผู้ตรวจที่ถูกมอบอนุมัติเอกสารทาง /workflow-transitions ไม่ได้ ทั้งที่ยังไม่ได้รับเอกสารสักฉบับ', async () => {
        const id = await application('ASSIGNED_FOR_REVIEW', ['M1'], { reviewerId: fx.reviewer.id });
        as(fx.reviewer);
        const res = await transition(id, { toState: 'DOC_APPROVED', reasonCode: 'DOCUMENTS_APPROVED', comment: 'ok' });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('DOCUMENT_DECISION_USE_CHECK');
        expect(await statusOf(id)).toBe('ASSIGNED_FOR_REVIEW');
    });

    test('ขอแก้ไขแบบข้อความอิสระทาง /workflow-transitions ก็ไม่ได้ ต้องระบุรายฉบับที่หน้าตรวจ', async () => {
        const id = await application('ASSIGNED_FOR_REVIEW', ['M1'], { reviewerId: fx.reviewer.id });
        as(fx.reviewer);
        const res = await transition(id, { toState: 'REVISION_REQUESTED', comment: 'แก้ทั้งหมด', revisionMessage: 'แก้ทั้งหมด' });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('DOCUMENT_DECISION_USE_CHECK');
        expect(await statusOf(id)).toBe('ASSIGNED_FOR_REVIEW');
    });

    test('หน้าตรวจรายฉบับยังปฏิเสธการรับคำขอที่ยังไม่ได้รับเอกสารบังคับ', async () => {
        const id = await application('ASSIGNED_FOR_REVIEW', ['M1'], { reviewerId: fx.reviewer.id });
        as(fx.reviewer);
        const res = await request(app).post(`/api/provider/applications/${id}/document-decision`).send({ action: 'ACCEPT_ALL' });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('DOCUMENT_CHECK_INCOMPLETE');
        expect(await statusOf(id)).toBe('ASSIGNED_FOR_REVIEW');
    });

    const verdict = (id) => request(app).post(`/api/provider/applications/${id}/document-reviews`)
        .send({ slotId: SLOT, verdict: 'MORE_REQUESTED', reason: 'ภาพสแกนอ่านไม่ออกทั้งหน้า', dueDate: '2026-12-01' });

    test('บันทึกผลรายฉบับหลังคำขอพ้นขั้นตรวจเอกสารแล้ว: ปฏิเสธ ไม่มีแถวใหม่', async () => {
        const id = await application('DOC_APPROVED', ['M1'], { reviewerId: fx.reviewer.id });
        as(fx.reviewer);
        const res = await verdict(id);
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('DOCUMENT_DECISION_WRONG_STATE');
        expect(await raw.applicationDocumentReview.count({ where: { applicationId: id } })).toBe(0);
    });

    test('บันทึกผลรายฉบับระหว่างตรวจเอกสาร: ได้', async () => {
        const id = await application('ASSIGNED_FOR_REVIEW', ['M1'], { reviewerId: fx.reviewer.id });
        as(fx.reviewer);
        const res = await verdict(id);
        expect(res.status).toBe(200);
        expect(await raw.applicationDocumentReview.count({ where: { applicationId: id } })).toBe(1);
    });

    test('มอบผู้ตรวจเอกสารแล้ว เลขประจำตัวของผู้ตรวจไม่อยู่ใน formData และไม่ออกทางหน้ารายละเอียด', async () => {
        const id = await application('DOC_FEE_PAID', ['M1']);
        as(fx.dispatcher);
        const assigned = await request(app).post('/api/provider/scheduler/assign-reviewer')
            .send({ applicationId: id, reviewerId: fx.reviewer.id });
        expect(assigned.status).toBe(200);
        const stored = await raw.application.findUnique({ where: { id }, select: { formData: true, reviewerId: true } });
        expect(stored.reviewerId).toBe(fx.reviewer.id);
        expect(JSON.stringify(stored.formData)).not.toContain(NATIONAL_ID);

        as(fx.reviewer);
        const detail = await request(app).get(`/api/provider/applications/${id}`);
        expect(detail.status).toBe(200);
        expect(JSON.stringify(detail.body)).not.toContain(NATIONAL_ID);
    });
});

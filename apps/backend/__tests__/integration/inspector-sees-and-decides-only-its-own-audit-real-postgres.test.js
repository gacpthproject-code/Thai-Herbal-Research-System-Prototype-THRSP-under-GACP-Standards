/**
 * ผู้ตรวจพื้นที่เห็นและตัดสินได้เฉพาะงานตรวจที่ผู้จัดคิวมอบให้ตัวเอง และไม่ถือสิทธิ์ตรวจเอกสาร (real Postgres)
 *
 * รายงาน role-workflow-auditor 2026-10-06 (reviewer-inspector R-H1, R-H2, R-H3) · คำสั่ง 14, 17, 27:
 * - GET /api/audits, /pending-schedule, /scheduled ให้ผู้ตรวจพื้นที่และผู้ตรวจเอกสารอ่านคำขอที่ยังไม่นัด
 *   และงานของผู้ตรวจคนอื่นทั้งองค์กร ไม่มีหน้าจอไหนเรียก จึงลบทิ้ง
 * - GET /api/provider/scheduler/audits/schedules เปิดให้สายตรวจทั้งหมด (พิกัดแปลง สถานะชำระ) เหลือผู้จัดคิว
 *   และผู้ดูแลกรม ในองค์กรของตัวเอง
 * - ผู้ตรวจพื้นที่ถือสิทธิ์ตรวจเอกสารทุกชั้น (สิทธิ์ ขาสถานะ รายชื่อมอบงาน การมองเห็น)
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

d('ผู้ตรวจพื้นที่: เห็นและตัดสินเฉพาะงานของตัวเอง ไม่ตรวจเอกสาร (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { userIds: [], entityIds: [], appIds: [], orgIds: [] };
    let seq = 0;

    const as = (user) => { mockActor.current = { ...user }; };
    const rowOf = (id) => raw.application.findUnique({ where: { id }, select: { status: true, reviewerId: true, auditorId: true } });

    async function staff(role, organizationId) {
        const id = crypto.randomUUID();
        seq += 1;
        await raw.user.create({
            data: {
                id, canonicalId: `ia-${seq}-${sfx}`, password: 'x', role, authType: 'PROVIDER_ID',
                providerId: `ia-${seq}-${sfx}`, email: `ia-${seq}-${sfx}@example.test`,
                firstName: 'เจ้าหน้าที่', lastName: role, organizationId, status: 'ACTIVE', accountType: 'PROVIDER',
            },
        });
        fx.userIds.push(id);
        return { id, role, canonicalRole: role, organizationId };
    }

    async function application(status, milestones, extra = {}, organizationId = fx.orgA) {
        seq += 1;
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-IA-${seq}-${sfx}`, healthId: fx.applicant.canonicalId, areaType: 'OUTDOOR',
                organizationId, entityId: fx.entity, submitterId: fx.applicant.id, status,
                formData: { workflowState: status }, ...extra,
            },
        });
        fx.appIds.push(row.id);
        await settleMilestones(raw, { id: row.id, healthId: fx.applicant.canonicalId, organizationId }, milestones);
        return row;
    }

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        for (const tag of ['a', 'b']) {
            const org = await raw.organization.create({ data: { name: `ia-${tag}-${sfx}`, slug: `ia-${tag}-${sfx}`, code: `IA${tag}_${sfx}`.toUpperCase() } });
            fx.orgIds.push(org.id);
        }
        [fx.orgA, fx.orgB] = fx.orgIds;

        fx.dispatcherA = await staff('dispatcher', fx.orgA);
        fx.reviewerA = await staff('document_reviewer', fx.orgA);
        fx.inspectorA1 = await staff('field_inspector', fx.orgA);
        fx.inspectorA2 = await staff('field_inspector', fx.orgA);
        fx.inspectorA3 = await staff('field_inspector', fx.orgA);
        fx.adminA = await staff('system_admin_dtam', fx.orgA);
        fx.platform = await staff('system_admin_platform', fx.orgB);

        const applicantId = crypto.randomUUID();
        fx.applicant = { id: applicantId, canonicalId: `ia-app-${sfx}` };
        await raw.user.create({
            data: {
                id: applicantId, canonicalId: fx.applicant.canonicalId, healthId: fx.applicant.canonicalId, password: 'x',
                role: 'health', authType: 'EMAIL_LEGACY', email: `ia-app-${sfx}@example.test`,
                firstName: 'ผู้ยื่น', lastName: 'ทดสอบ', organizationId: fx.orgA,
            },
        });
        fx.userIds.push(applicantId);
        fx.entity = (await raw.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท ia ${sfx} จำกัด`, organizationId: fx.orgA } })).id;
        fx.entityIds.push(fx.entity);

        fx.own = await application('AUDIT_CONFIRMED', ['M1', 'M2'], { auditorId: fx.inspectorA1.id, scheduledDate: new Date('2026-11-02T02:00:00Z') });
        fx.unscheduled = await application('AUDIT_FEE_PAID', ['M1', 'M2']);
        fx.colleague = await application('AUDIT_CONFIRMED', ['M1', 'M2'], { auditorId: fx.inspectorA2.id, scheduledDate: new Date('2026-11-03T02:00:00Z') });
        fx.otherOrg = await application('AUDIT_CONFIRMED', ['M1', 'M2'], { scheduledDate: new Date('2026-11-04T02:00:00Z') }, fx.orgB);

        app = express();
        app.use(express.json());
        app.use('/api/audits', require('../../routes/api/audit/audits'));
        app.use('/api/provider/scheduler', require('../../routes/api/provider/scheduler'));
        app.use('/api/provider/applications', require('../../routes/api/provider/applications'));
        app.use('/api/provider/applications', require('../../routes/api/provider/document-reviews'));
        app.use('/api/provider/admin', require('../../routes/api/provider/admin'));
    });

    afterAll(async () => {
        const wipe = (model, where) => raw[model].deleteMany({ where }).catch(() => {});
        const byApp = { applicationId: { in: fx.appIds } };
        for (const model of ['checkoutOrder', 'workActivity', 'revisionDeadline', 'correctionRound', 'invoice', 'auditChecklist']) {
            await wipe(model, byApp);
        }
        await wipe('notification', { userId: { in: fx.userIds } });
        await wipe('auditLog', { organizationId: { in: fx.orgIds } });
        await wipe('auditLog', { resourceId: { in: fx.appIds } });
        await wipe('assignmentLedgerEntry', { assigneeUserId: { in: fx.userIds } });
        await wipe('application', { id: { in: fx.appIds } });
        await wipe('entity', { id: { in: fx.entityIds } });
        await wipe('user', { id: { in: fx.userIds } });
        await wipe('organization', { id: { in: fx.orgIds } });
        await raw.$disconnect();
    });

    describe('รายการงานตรวจ: ไม่มีประตูให้สายตรวจอ่านงานทั้งองค์กร', () => {
        test.each([
            ['/api/audits'], ['/api/audits/pending-schedule'], ['/api/audits/scheduled'],
        ])('%s ไม่คืนคำขอที่ยังไม่นัดหรือของผู้ตรวจคนอื่น ให้ผู้ตรวจพื้นที่และผู้ตรวจเอกสาร', async (path) => {
            for (const who of [fx.inspectorA1, fx.reviewerA]) {
                as(who);
                const res = await request(app).get(path);
                expect(res.status).toBe(404);
                const body = JSON.stringify(res.body);
                expect(body).not.toContain(fx.unscheduled.applicationNumber);
                expect(body).not.toContain(fx.colleague.applicationNumber);
            }
        });

        test('งานของตัวเองยังเปิดดูรายตัวได้ งานคนอื่นได้ 404', async () => {
            as(fx.inspectorA1);
            expect((await request(app).get(`/api/audits/${fx.own.id}`)).status).toBe(200);
            expect((await request(app).get(`/api/audits/${fx.colleague.id}`)).status).toBe(404);
            expect((await request(app).get(`/api/audits/${fx.unscheduled.id}`)).status).toBe(404);
        });
    });

    describe('ตารางนัด GET /api/provider/scheduler/audits/schedules', () => {
        const schedules = () => request(app).get('/api/provider/scheduler/audits/schedules?limit=200');

        test('ผู้ตรวจพื้นที่และผู้ตรวจเอกสาร: 403', async () => {
            for (const who of [fx.inspectorA1, fx.reviewerA]) {
                as(who);
                const res = await schedules();
                expect(res.status).toBe(403);
                expect(JSON.stringify(res.body)).not.toContain(fx.colleague.applicationNumber);
            }
        });

        test('ผู้จัดคิว: เห็นนัดในองค์กรตัวเอง ไม่เห็นองค์กรอื่น', async () => {
            as(fx.dispatcherA);
            const res = await schedules();
            expect(res.status).toBe(200);
            const numbers = res.body.data.map((row) => row.applicationNumber);
            expect(numbers).toEqual(expect.arrayContaining([fx.own.applicationNumber, fx.colleague.applicationNumber]));
            expect(numbers).not.toContain(fx.otherOrg.applicationNumber);
        });

        test('ผู้จัดคิวที่ไม่มีองค์กร: ปฏิเสธ', async () => {
            // A token whose user the database does not know: nothing resolves an organization for it.
            as({ id: crypto.randomUUID(), role: 'dispatcher', canonicalRole: 'dispatcher', organizationId: null });
            const res = await schedules();
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('NO_ORGANIZATION');
        });
    });

    describe('ผู้ตรวจพื้นที่ไม่ตรวจเอกสาร (คำสั่ง 27)', () => {
        test('มอบงานตรวจเอกสารให้ผู้ตรวจพื้นที่ไม่ได้ ทั้งประตูผู้จัดคิวและ batch ของผู้ดูแล', async () => {
            const one = await application('DOC_FEE_PAID', ['M1']);
            as(fx.dispatcherA);
            const res = await request(app).post('/api/provider/scheduler/assign-reviewer')
                .send({ applicationId: one.id, reviewerId: fx.inspectorA3.id });
            expect(res.status).toBe(422);
            expect(res.body.code).toBe('STAFF_NOT_ASSIGNABLE');

            as(fx.adminA);
            const batch = await request(app).post('/api/provider/admin/batch-actions')
                .send({ applicationIds: [one.id], action: 'ASSIGN', assignTo: fx.inspectorA3.id });
            expect(batch.status).toBe(422);
            expect(await rowOf(one.id)).toMatchObject({ status: 'DOC_FEE_PAID', reviewerId: null });
        });

        test('สลับผู้ตรวจเอกสารไปเป็นผู้ตรวจพื้นที่ไม่ได้', async () => {
            const one = await application('ASSIGNED_FOR_REVIEW', ['M1'], { reviewerId: fx.reviewerA.id });
            as(fx.dispatcherA);
            const res = await request(app).post(`/api/provider/scheduler/reviewer-assignments/${one.id}/reassign`)
                .send({ newReviewerId: fx.inspectorA3.id, reason: 'ทดสอบ' });
            expect(res.status).toBeGreaterThanOrEqual(400);
            expect((await rowOf(one.id)).reviewerId).toBe(fx.reviewerA.id);
        });

        test('รายชื่อผู้ตรวจเอกสารให้ผู้จัดคิวเลือก ไม่มีผู้ตรวจพื้นที่', async () => {
            as(fx.dispatcherA);
            const res = await request(app).get('/api/provider/scheduler/reviewers');
            expect(res.status).toBe(200);
            const ids = res.body.data.map((row) => row.id);
            expect(ids).toContain(fx.reviewerA.id);
            expect(ids).not.toContain(fx.inspectorA3.id);
        });

        test('ผู้ตรวจพื้นที่ที่ถูกบันทึกเป็นผู้ตรวจเอกสาร (ข้อมูลเก่า) เปิดหน้าตรวจ ตัดสินเอกสาร หรืออ่านคำขอไม่ได้', async () => {
            const one = await application('ASSIGNED_FOR_REVIEW', ['M1'], { reviewerId: fx.inspectorA3.id });
            as(fx.inspectorA3);
            expect((await request(app).get(`/api/provider/applications/${one.id}/document-check`)).status).toBe(403);
            expect((await request(app).post(`/api/provider/applications/${one.id}/document-decision`).send({ action: 'ACCEPT_ALL' })).status).toBe(403);
            const transition = await request(app).post(`/api/provider/applications/${one.id}/workflow-transitions`)
                .send({ toState: 'DOC_APPROVED', comment: 'ok' });
            expect(transition.status).toBeGreaterThanOrEqual(400);
            expect((await request(app).get(`/api/provider/applications/${one.id}`)).status).toBe(404);
            expect((await rowOf(one.id)).status).toBe('ASSIGNED_FOR_REVIEW');
        });
    });

    describe('ตัดสินผลตรวจพื้นที่: เฉพาะผู้ตรวจที่ถูกมอบ', () => {
        test('ผู้ตรวจหัวหน้าที่ไม่ใช่ผู้ตรวจของงาน เดินขาผลตรวจทาง /workflow-transitions ไม่ได้ (headAuditorId ไม่ใช่ทางเข้าของผู้ตรวจพื้นที่ คำขอจึงมองไม่เห็น)', async () => {
            const one = await application('AUDIT_CONFIRMED', ['M1', 'M2'], { auditorId: fx.inspectorA1.id, headAuditorId: fx.inspectorA2.id });
            as(fx.inspectorA2);
            const res = await request(app).post(`/api/provider/applications/${one.id}/workflow-transitions`)
                .send({ toState: 'CAR_PENDING', comment: 'แก้ไขข้อ 3' });
            expect(res.status).toBe(404);
            expect((await rowOf(one.id)).status).toBe('AUDIT_CONFIRMED');
        });

        test('ผู้ตรวจที่ถูกมอบ บันทึกผลทาง /workflow-transitions ได้', async () => {
            const viaTransition = await application('AUDIT_CONFIRMED', ['M1', 'M2'], { auditorId: fx.inspectorA1.id });
            as(fx.inspectorA1);
            const moved = await request(app).post(`/api/provider/applications/${viaTransition.id}/workflow-transitions`)
                .send({ toState: 'CAR_PENDING', comment: 'แก้ไขข้อ 3' });
            expect(moved.status).toBe(200);
            expect((await rowOf(viaTransition.id)).status).toBe('CAR_PENDING');
        });
    });
});

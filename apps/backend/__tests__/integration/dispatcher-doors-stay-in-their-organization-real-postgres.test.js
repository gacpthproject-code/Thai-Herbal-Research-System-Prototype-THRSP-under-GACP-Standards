/**
 * ประตูของผู้จัดคิวอ่านและเขียนได้เฉพาะองค์กรของตัวเอง ไม่รู้องค์กร = ปฏิเสธ (real Postgres)
 *
 * คำสั่ง 17 (operator 2026-10-06): ทุกบทบาทเจ้าหน้าที่ทำงานในองค์กรของตัวเองเท่านั้น มีแต่
 * system_admin_platform ที่ข้ามองค์กรได้ · รายงาน role-workflow-auditor 2026-10-06 dispatcher D2, D3
 *
 * ชุดนี้ปิดตัวกรององค์กรของ Prisma extension (TENANT_READ_ORG_SCOPE=false) เพื่อพิสูจน์ว่าแต่ละประตูกรอง
 * เอง ไม่ได้พึ่งสวิตช์ที่ปิดได้ · บัญชี "ไม่รู้องค์กร" คือ token ที่ฐานข้อมูลไม่รู้จัก จึงไม่มีอะไรเติมองค์กรให้
 */

'use strict';

process.env.TENANT_READ_ORG_SCOPE = 'false';

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { settleMilestones } = require('../../test-support/settled-milestones');
const { minusWorkingDays } = require('../../utils/working-days');

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

const NATIONAL_ID_INSPECTOR = '3100000000132';
const NATIONAL_ID_REVIEWER = '3100000000141';

d('ประตูผู้จัดคิว: เฉพาะองค์กรของตัวเอง (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { userIds: [], entityIds: [], appIds: [], orgIds: [] };
    let seq = 0;

    const as = (user) => { mockActor.current = { ...user }; };
    const noOrganization = (role) => ({ id: crypto.randomUUID(), role, canonicalRole: role, organizationId: null });
    const rowOf = (id) => raw.application.findUnique({ where: { id }, select: { status: true, reviewerId: true, auditorId: true, formData: true } });

    async function staff(role, organizationId, providerId) {
        const id = crypto.randomUUID();
        seq += 1;
        await raw.user.create({
            data: {
                id, canonicalId: `do-${seq}-${sfx}`, password: 'x', role, authType: 'PROVIDER_ID',
                providerId: providerId || `do-${seq}-${sfx}`, email: `do-${seq}-${sfx}@example.test`,
                firstName: `เจ้าหน้าที่${seq}`, lastName: role, organizationId, status: 'ACTIVE', accountType: 'PROVIDER',
            },
        });
        fx.userIds.push(id);
        return { id, role, canonicalRole: role, organizationId };
    }

    async function application(organizationId, status, milestones, extra = {}) {
        seq += 1;
        const entity = organizationId === fx.orgA ? fx.entityA : fx.entityB;
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-DO-${seq}-${sfx}`, healthId: fx.applicant.canonicalId, areaType: 'OUTDOOR',
                organizationId, entityId: entity, submitterId: fx.applicant.id, status,
                formData: { workflowState: status }, ...extra,
            },
        });
        fx.appIds.push(row.id);
        await settleMilestones(raw, { id: row.id, healthId: fx.applicant.canonicalId, organizationId }, milestones);
        for (const invoice of await raw.invoice.findMany({ where: { applicationId: row.id }, select: { id: true } })) {
            await raw.invoice.update({ where: { id: invoice.id }, data: { receiptNumber: `RC-${invoice.id}`, receiptIssuedAt: new Date() } });
        }
        return row;
    }

    /** a filing that has sat in its state for four days, so the urgent monitor reports it */
    /**
     * Five Bangkok working days in its stage, whatever today is. Four calendar days was one working day
     * on 2026-10-13 (a weekend and a public holiday in between), which the monitor does not flag.
     */
    async function stale(row) {
        await raw.$executeRaw`UPDATE applications SET "updatedAt" = ${minusWorkingDays(new Date(), 5)} WHERE id = ${row.id}`;
        return row;
    }

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        for (const tag of ['a', 'b']) {
            const org = await raw.organization.create({ data: { name: `do-${tag}-${sfx}`, slug: `do-${tag}-${sfx}`, code: `DO${tag}_${sfx}`.toUpperCase() } });
            fx.orgIds.push(org.id);
        }
        [fx.orgA, fx.orgB] = fx.orgIds;

        fx.dispatcherA = await staff('dispatcher', fx.orgA);
        fx.reviewerA = await staff('document_reviewer', fx.orgA, NATIONAL_ID_REVIEWER);
        fx.reviewerA2 = await staff('document_reviewer', fx.orgA);
        fx.reviewerB = await staff('document_reviewer', fx.orgB);
        fx.inspectorA = await staff('field_inspector', fx.orgA, NATIONAL_ID_INSPECTOR);
        fx.inspectorA2 = await staff('field_inspector', fx.orgA);
        fx.inspectorB = await staff('field_inspector', fx.orgB);
        fx.inspectorB2 = await staff('field_inspector', fx.orgB);
        fx.financeA = await staff('finance_officer_platform', fx.orgA);
        fx.approverA = await staff('certificate_approver', fx.orgA);

        const applicantId = crypto.randomUUID();
        fx.applicant = { id: applicantId, canonicalId: `do-app-${sfx}` };
        await raw.user.create({
            data: {
                id: applicantId, canonicalId: fx.applicant.canonicalId, healthId: fx.applicant.canonicalId, password: 'x',
                role: 'health', authType: 'EMAIL_LEGACY', email: `do-app-${sfx}@example.test`,
                firstName: 'ผู้ยื่น', lastName: 'ทดสอบ', organizationId: fx.orgA,
            },
        });
        fx.userIds.push(applicantId);
        fx.entityA = (await raw.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท do-a ${sfx} จำกัด`, organizationId: fx.orgA } })).id;
        fx.entityB = (await raw.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท do-b ${sfx} จำกัด`, organizationId: fx.orgB } })).id;
        fx.entityIds.push(fx.entityA, fx.entityB);

        fx.paidA = await stale(await application(fx.orgA, 'DOC_FEE_PAID', ['M1']));
        fx.paidB = await stale(await application(fx.orgB, 'DOC_FEE_PAID', ['M1']));
        fx.reviewingA = await application(fx.orgA, 'ASSIGNED_FOR_REVIEW', ['M1'], { reviewerId: fx.reviewerA.id });
        fx.reviewingB = await application(fx.orgB, 'ASSIGNED_FOR_REVIEW', ['M1'], { reviewerId: fx.reviewerB.id });
        fx.confirmedA = await application(fx.orgA, 'AUDIT_CONFIRMED', ['M1', 'M2'], { auditorId: fx.inspectorA.id, scheduledDate: new Date('2026-11-20T02:00:00.000Z') });
        fx.confirmedB = await application(fx.orgB, 'AUDIT_CONFIRMED', ['M1', 'M2'], { auditorId: fx.inspectorB.id, scheduledDate: new Date('2026-11-20T02:00:00.000Z') });
        // the same inspector booked in two organizations: only the caller's booking may show
        fx.confirmedBbyA = await application(fx.orgB, 'AUDIT_CONFIRMED', ['M1', 'M2'], { auditorId: fx.inspectorA.id, scheduledDate: new Date('2026-11-21T02:00:00.000Z') });

        app = express();
        app.use(express.json());
        app.use('/api/provider/scheduler', require('../../routes/api/provider/scheduler'));
        app.use('/api/provider/reviewer', require('../../routes/api/provider/reviewer'));
        app.use('/api/provider/applications', require('../../routes/api/provider/applications'));
        app.use('/api/audits/reassign', require('../../routes/api/audit/audits-reassign'));
        app.use('/api/audit/scheduling', require('../../routes/api/audit/scheduling'));
        app.use('/api/provider/work', require('../../routes/api/provider/work'));
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

    describe('อ่าน', () => {
        test('หน้าศูนย์จัดคิว: เฉพาะคำขอขององค์กรตัวเอง', async () => {
            as(fx.dispatcherA);
            const res = await request(app).get('/api/provider/scheduler/dashboard?limit=200');
            expect(res.status).toBe(200);
            const body = JSON.stringify(res.body);
            expect(body).toContain(fx.paidA.applicationNumber);
            expect(body).not.toContain(fx.paidB.applicationNumber);
        });

        test('เฝ้าระวังงานค้าง: เฉพาะองค์กรตัวเอง', async () => {
            as(fx.dispatcherA);
            const res = await request(app).get('/api/provider/scheduler/urgent-monitor');
            expect(res.status).toBe(200);
            const numbers = res.body.data.stuckItems.map((row) => row.applicationNumber);
            expect(numbers).toContain(fx.paidA.applicationNumber);
            expect(numbers).not.toContain(fx.paidB.applicationNumber);
        });

        test('ภาระงานผู้ตรวจ: เฉพาะเจ้าหน้าที่องค์กรตัวเอง', async () => {
            as(fx.dispatcherA);
            const res = await request(app).get('/api/provider/scheduler/auditor-workload');
            expect(res.status).toBe(200);
            const ids = res.body.data.auditors.map((row) => row.id);
            expect(ids).toContain(fx.inspectorA.id);
            expect(ids).not.toContain(fx.inspectorB.id);
        });

        test('รายชื่อผู้ตรวจพื้นที่และผู้ตรวจเอกสาร: เฉพาะองค์กรตัวเอง และไม่มีเลขประจำตัวประชาชน', async () => {
            as(fx.dispatcherA);
            const auditors = await request(app).get('/api/provider/scheduler/auditors');
            const reviewers = await request(app).get('/api/provider/scheduler/reviewers');
            expect(auditors.status).toBe(200);
            expect(reviewers.status).toBe(200);
            const auditorIds = auditors.body.data.map((row) => row.id);
            const reviewerIds = reviewers.body.data.map((row) => row.id);
            expect(auditorIds).toContain(fx.inspectorA.id);
            expect(auditorIds).not.toContain(fx.inspectorB.id);
            expect(reviewerIds).toContain(fx.reviewerA.id);
            expect(reviewerIds).not.toContain(fx.reviewerB.id);
            expect(JSON.stringify(auditors.body)).not.toContain(NATIONAL_ID_INSPECTOR);
            expect(JSON.stringify(reviewers.body)).not.toContain(NATIONAL_ID_REVIEWER);
        });

        test('รายการที่สลับผู้ตรวจได้ (สองประตู): เฉพาะองค์กรตัวเอง', async () => {
            as(fx.dispatcherA);
            const reviewers = await request(app).get('/api/provider/scheduler/reviewer-assignments/reassignable');
            const audits = await request(app).get('/api/audits/reassign/reassignable');
            expect(reviewers.status).toBe(200);
            expect(audits.status).toBe(200);
            const reviewerRows = reviewers.body.data.applications.map((row) => row.applicationNumber);
            const auditRows = audits.body.data.applications.map((row) => row.applicationNumber);
            expect(reviewerRows).toContain(fx.reviewingA.applicationNumber);
            expect(reviewerRows).not.toContain(fx.reviewingB.applicationNumber);
            expect(auditRows).toContain(fx.confirmedA.applicationNumber);
            expect(auditRows).not.toContain(fx.confirmedB.applicationNumber);
        });

        test('ตารางว่างของผู้ตรวจพื้นที่: เห็นเฉพาะนัดขององค์กรตัวเอง', async () => {
            const range = 'from=2026-11-01T00:00:00.000Z&to=2026-11-30T00:00:00.000Z';
            as(fx.dispatcherA);
            const own = await request(app).get(`/api/audit/scheduling/auditor-availability/${fx.inspectorA.id}?${range}`);
            expect(own.status).toBe(200);
            const ownNumbers = own.body.data.busySlots.map((slot) => slot.applicationNumber);
            expect(ownNumbers).toContain(fx.confirmedA.applicationNumber);
            expect(ownNumbers).not.toContain(fx.confirmedBbyA.applicationNumber);
            const other = await request(app).get(`/api/audit/scheduling/auditor-availability/${fx.inspectorB.id}?${range}`);
            expect(JSON.stringify(other.body)).not.toContain(fx.confirmedB.applicationNumber);
        });

        test('รายการสลับผู้ตรวจพื้นที่: การเงินและผู้อนุมัติอ่านไม่ได้', async () => {
            for (const who of [fx.financeA, fx.approverA]) {
                as(who);
                const res = await request(app).get('/api/audits/reassign/reassignable');
                expect(res.status).toBe(403);
            }
        });

        test.each([
            ['/api/provider/scheduler/dashboard'],
            ['/api/provider/scheduler/urgent-monitor'],
            ['/api/provider/scheduler/auditor-workload'],
            ['/api/provider/scheduler/auditors'],
            ['/api/provider/scheduler/reviewers'],
            ['/api/provider/scheduler/reviewer-assignments/reassignable'],
            ['/api/audits/reassign/reassignable'],
            ['/api/audit/scheduling/queue'],
            ['/api/audit/scheduling/auditor-availability/x?from=2026-11-01T00:00:00.000Z&to=2026-11-30T00:00:00.000Z'],
        ])('%s: ผู้จัดคิวที่ไม่รู้องค์กร ถูกปฏิเสธ', async (path) => {
            as(noOrganization('dispatcher'));
            const res = await request(app).get(path);
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('NO_ORGANIZATION');
        });
    });

    describe('เขียน', () => {
        test('แจ้งเตือนผู้ยื่นขององค์กรอื่น: 404 ไม่มีแจ้งเตือน', async () => {
            const target = await application(fx.orgB, 'REVISION_REQUESTED', ['M1']);
            as(fx.dispatcherA);
            const res = await request(app).post(`/api/provider/scheduler/applications/${target.id}/send-reminder`).send({});
            expect(res.status).toBe(404);
            expect(await raw.notification.count({ where: { userId: fx.applicant.id, message: { contains: target.applicationNumber } } })).toBe(0);
        });

        test('นัดตรวจคำขอขององค์กรอื่นจากหน้าปฏิทิน: 404 ไม่มีอะไรเปลี่ยน', async () => {
            const target = await application(fx.orgB, 'AUDIT_FEE_PAID', ['M1', 'M2']);
            as(fx.dispatcherA);
            const res = await request(app).post('/api/provider/scheduler/audits/schedules').send({
                applicationId: target.id, auditorId: fx.inspectorA.id, scheduledDate: '2026-11-09T02:00:00.000Z',
                inspectionMode: 'ONSITE', location: 'แปลงทดสอบ',
            });
            expect(res.status).toBe(404);
            expect(await rowOf(target.id)).toMatchObject({ status: 'AUDIT_FEE_PAID', auditorId: null });
        });

        test('นัดตรวจจากหน้าปฏิทินด้วยผู้ตรวจองค์กรอื่น: ปฏิเสธ', async () => {
            const target = await application(fx.orgA, 'AUDIT_FEE_PAID', ['M1', 'M2']);
            as(fx.dispatcherA);
            const res = await request(app).post('/api/provider/scheduler/audits/schedules').send({
                applicationId: target.id, auditorId: fx.inspectorB.id, scheduledDate: '2026-11-10T02:00:00.000Z',
                inspectionMode: 'ONSITE', location: 'แปลงทดสอบ',
            });
            expect(res.status).toBe(422);
            expect(res.body.code).toBe('STAFF_NOT_ASSIGNABLE');
            expect(await rowOf(target.id)).toMatchObject({ status: 'AUDIT_FEE_PAID', auditorId: null });
        });

        test('นัดตรวจจากหน้าปฏิทินในองค์กรตัวเอง: ได้', async () => {
            const target = await application(fx.orgA, 'AUDIT_FEE_PAID', ['M1', 'M2']);
            as(fx.dispatcherA);
            const res = await request(app).post('/api/provider/scheduler/audits/schedules').send({
                applicationId: target.id, auditorId: fx.inspectorA2.id, scheduledDate: '2026-11-11T02:00:00.000Z',
                inspectionMode: 'ONSITE', location: 'แปลงทดสอบ',
            });
            expect(res.status).toBe(201);
            expect(await rowOf(target.id)).toMatchObject({ status: 'AUDIT_CONFIRMED', auditorId: fx.inspectorA2.id });
        });

        test('นัดตรวจจากคิวจัดตาราง: ผู้จัดคิวที่ไม่รู้องค์กรถูกปฏิเสธ ผู้จัดคิวองค์กรอื่นได้ 404', async () => {
            const target = await application(fx.orgB, 'AUDIT_FEE_PAID', ['M1', 'M2']);
            const body = { applicationId: target.id, auditorId: fx.inspectorB2.id, scheduledDate: '2026-11-12', scheduledTime: '09:00', location: 'แปลง' };
            as(noOrganization('dispatcher'));
            const unknown = await request(app).post('/api/audit/scheduling/assign').send(body);
            expect(unknown.status).toBe(400);
            expect(unknown.body.code || unknown.body.error).toBe('NO_ORGANIZATION');
            as(fx.dispatcherA);
            const other = await request(app).post('/api/audit/scheduling/assign').send(body);
            expect(other.status).toBe(404);
            expect(await rowOf(target.id)).toMatchObject({ status: 'AUDIT_FEE_PAID', auditorId: null });
        });

        test('สลับผู้ตรวจพื้นที่: ผู้จัดคิวที่ไม่รู้องค์กรถูกปฏิเสธ', async () => {
            const target = await application(fx.orgB, 'AUDIT_CONFIRMED', ['M1', 'M2'], { auditorId: fx.inspectorB.id });
            as(noOrganization('dispatcher'));
            const res = await request(app).post(`/api/audits/reassign/${target.id}/reassign`)
                .send({ newAuditorId: fx.inspectorB2.id, reason: 'ลาป่วย' });
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('NO_ORGANIZATION');
            expect((await rowOf(target.id)).auditorId).toBe(fx.inspectorB.id);
        });

        test('สลับผู้ตรวจพื้นที่ในองค์กรตัวเอง: ได้ · ไปเป็นผู้ตรวจองค์กรอื่น: ปฏิเสธ', async () => {
            const target = await application(fx.orgA, 'AUDIT_CONFIRMED', ['M1', 'M2'], { auditorId: fx.inspectorA.id });
            as(fx.dispatcherA);
            const crossing = await request(app).post(`/api/audits/reassign/${target.id}/reassign`)
                .send({ newAuditorId: fx.inspectorB.id, reason: 'ลาป่วย' });
            expect(crossing.status).toBe(422);
            expect((await rowOf(target.id)).auditorId).toBe(fx.inspectorA.id);
            const moved = await request(app).post(`/api/audits/reassign/${target.id}/reassign`)
                .send({ newAuditorId: fx.inspectorA2.id, reason: 'ลาป่วย' });
            expect(moved.status).toBe(200);
            expect((await rowOf(target.id)).auditorId).toBe(fx.inspectorA2.id);
        });

        test('สลับผู้ตรวจเอกสาร: ผู้จัดคิวที่ไม่รู้องค์กรถูกปฏิเสธ', async () => {
            const target = await application(fx.orgB, 'ASSIGNED_FOR_REVIEW', ['M1'], { reviewerId: fx.reviewerB.id });
            as(noOrganization('dispatcher'));
            const res = await request(app).post(`/api/provider/scheduler/reviewer-assignments/${target.id}/reassign`)
                .send({ newReviewerId: fx.reviewerA.id, reason: 'ลาป่วย' });
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('NO_ORGANIZATION');
            expect((await rowOf(target.id)).reviewerId).toBe(fx.reviewerB.id);
        });

        test('สลับผู้ตรวจเอกสารในองค์กรตัวเอง: ได้ ผู้ตรวจคนเดิมไม่ถืองานต่อ · ไปเป็นผู้ตรวจองค์กรอื่น: ปฏิเสธ', async () => {
            const target = await application(fx.orgA, 'ASSIGNED_FOR_REVIEW', ['M1'], {
                reviewerId: fx.reviewerA.id,
                formData: { workflowState: 'ASSIGNED_FOR_REVIEW', PROVIDERAssignment: { reviewerId: fx.reviewerA.id } },
            });
            as(fx.dispatcherA);
            const crossing = await request(app).post(`/api/provider/scheduler/reviewer-assignments/${target.id}/reassign`)
                .send({ newReviewerId: fx.reviewerB.id, reason: 'ลาป่วย' });
            expect(crossing.status).toBe(422);
            expect((await rowOf(target.id)).reviewerId).toBe(fx.reviewerA.id);
            const moved = await request(app).post(`/api/provider/scheduler/reviewer-assignments/${target.id}/reassign`)
                .send({ newReviewerId: fx.reviewerA2.id, reason: 'ลาป่วย' });
            expect(moved.status).toBe(200);
            const after = await rowOf(target.id);
            expect(after.reviewerId).toBe(fx.reviewerA2.id);
            expect(after.formData.PROVIDERAssignment.reviewerId).toBe(fx.reviewerA2.id);
            as(fx.reviewerA);
            expect((await request(app).get(`/api/provider/applications/${target.id}`)).status).toBe(404);
            as(fx.reviewerA2);
            expect((await request(app).get(`/api/provider/applications/${target.id}`)).status).toBe(200);
        });

        test('ปิดงานในกล่องงานไม่เลื่อนสถานะคำขอ: การมอบงานต้องระบุตัวผู้ตรวจที่หน้ามอบงานเท่านั้น', async () => {
            const target = await application(fx.orgA, 'DOC_FEE_PAID', ['M1']);
            const activity = await raw.workActivity.create({
                data: {
                    applicationId: target.id, workType: 'SCHEDULING', candidateGroup: 'dispatcher',
                    state: 'TODO', triggeredAtStage: 'DOC_FEE_PAID', organizationId: fx.orgA,
                },
            });
            as(fx.dispatcherA);
            expect((await request(app).get(`/api/provider/work/${activity.id}/next-states`)).status).toBe(404);
            const res = await request(app).post(`/api/provider/work/${activity.id}/done`)
                .send({ advanceStatus: { toState: 'ASSIGNED_FOR_REVIEW' } });
            expect(res.status).toBe(200);
            expect(res.body.data.application).toBeUndefined();
            expect(await rowOf(target.id)).toMatchObject({ status: 'DOC_FEE_PAID', reviewerId: null });
        });

        test('ประตูบันทึกความคืบหน้าผู้ตรวจเอกสารที่ไม่มีหน้าจอเรียก ถูกถอดแล้ว', async () => {
            as(fx.reviewerA);
            const res = await request(app).patch(`/api/provider/reviewer/${fx.paidB.id}/progress`).send({ step: 1, verified: true });
            expect(res.status).toBe(404);
            expect((await rowOf(fx.paidB.id)).formData).not.toHaveProperty('reviewProgress');
        });
    });
});

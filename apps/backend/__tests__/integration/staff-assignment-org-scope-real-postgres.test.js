/**
 * ทุกประตูที่ใส่เจ้าหน้าที่ลงในคำขอ ต้องตรวจคนที่ถูกใส่ (real Postgres)
 *
 * รีวิวความปลอดภัย 2026-10-06 (R3): ประตูเหล่านี้รับ id เจ้าหน้าที่จาก body แล้วเขียนลงคำขอโดยไม่ถาม
 * ว่าคนนั้นมีอยู่จริง ใช้งานอยู่ มีบทบาทตรงงาน และอยู่องค์กรเดียวกับคำขอหรือไม่ (คำสั่ง 17)
 * - POST  /api/provider/scheduler/audits/schedules   auditorId ทั้งนัดครั้งแรกและเลื่อนนัด
 *   (ประตูนัดเดิม POST /api/audits/schedule และ PATCH /api/audits/:id/schedule ลบแล้ว 2026-10-09)
 * - POST  /api/provider/scheduler/assign-reviewer     reviewerId
 * - POST  /api/provider/applications/:id/assign       reviewerId (และเคยตอบ 500 แทน 409 เมื่อยังไม่จ่าย)
 * - POST  /api/provider/admin/batch-actions ASSIGN    assignTo (ผู้ดูแลแพลตฟอร์มข้ามองค์กรได้ แต่คนที่ใส่ต้องอยู่องค์กรของคำขอ)
 */

'use strict';

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

d('ประตูมอบหมายตรวจคนที่ถูกมอบหมาย (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { userIds: [], entityIds: [], appIds: [], orgIds: [], invoiceIds: [] };
    let seq = 0;

    const as = (user) => { mockActor.current = { ...user }; };
    const rowOf = (id) => raw.application.findUnique({ where: { id }, select: { status: true, reviewerId: true, auditorId: true } });

    async function staff(role, organizationId, extra = {}) {
        const id = crypto.randomUUID();
        seq += 1;
        await raw.user.create({
            data: {
                id, canonicalId: `as-${seq}-${sfx}`, password: 'x', role, authType: 'PROVIDER_ID',
                providerId: `as-${seq}-${sfx}`, email: `as-${seq}-${sfx}@example.test`,
                firstName: 'เจ้าหน้าที่', lastName: role, organizationId, status: 'ACTIVE', accountType: 'PROVIDER', ...extra,
            },
        });
        fx.userIds.push(id);
        return { id, role, canonicalRole: role, organizationId };
    }

    async function application(status, extra = {}) {
        seq += 1;
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-AS-${seq}-${sfx}`, healthId: fx.applicant.canonicalId, areaType: 'OUTDOOR',
                organizationId: fx.orgA, entityId: fx.entity, submitterId: fx.applicant.id, status,
                formData: { workflowState: status }, ...extra,
            },
        });
        fx.appIds.push(row.id);
        return row.id;
    }

    async function settled(applicationId, milestone) {
        seq += 1;
        const invoice = await raw.invoice.create({
            data: {
                invoiceNumber: `INV-AS-${seq}-${sfx}`, applicationId, healthId: fx.applicant.canonicalId,
                serviceType: `CERTIFICATION_CHECKOUT_${milestone}`, subtotal: 0, totalAmount: 0,
                dueDate: new Date(), status: 'PAID', paidAt: new Date(), organizationId: fx.orgA, metadata: {},
                receiptNumber: `RC-AS-${seq}-${sfx}`, receiptIssuedAt: new Date(),
            },
        });
        fx.invoiceIds.push(invoice.id);
        await raw.checkoutOrder.create({
            data: {
                applicationId, milestone, platformFeeNet: 0, platformFeeVat: 0, platformFeeGross: 0,
                totalPayableAmount: 0, status: 'SETTLED', settledAt: new Date(), invoiceId: invoice.id,
                organizationId: fx.orgA,
            },
        });
    }

    const paidFor = async (status, milestones, extra) => {
        const id = await application(status, extra);
        for (const m of milestones) { await settled(id, m); }
        return id;
    };

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        for (const tag of ['a', 'b']) {
            const org = await raw.organization.create({ data: { name: `as-${tag}-${sfx}`, slug: `as-${tag}-${sfx}`, code: `AS${tag}_${sfx}`.toUpperCase() } });
            fx.orgIds.push(org.id);
        }
        [fx.orgA, fx.orgB] = fx.orgIds;

        fx.dispatcherA = await staff('dispatcher', fx.orgA);
        fx.reviewerA = await staff('document_reviewer', fx.orgA);
        fx.reviewerB = await staff('document_reviewer', fx.orgB);
        fx.inspectorA = await staff('field_inspector', fx.orgA);
        fx.inspectorA2 = await staff('field_inspector', fx.orgA);
        fx.inspectorB = await staff('field_inspector', fx.orgB);
        fx.inspectorSuspended = await staff('field_inspector', fx.orgA, { status: 'SUSPENDED' });
        fx.platformAdmin = await staff('system_admin_platform', fx.orgB);

        const applicantId = crypto.randomUUID();
        fx.applicant = { id: applicantId, canonicalId: `as-app-${sfx}` };
        await raw.user.create({
            data: {
                id: applicantId, canonicalId: fx.applicant.canonicalId, healthId: fx.applicant.canonicalId, password: 'x',
                role: 'health', authType: 'EMAIL_LEGACY', email: `as-app-${sfx}@example.test`,
                firstName: 'ผู้ยื่น', lastName: 'ทดสอบ', organizationId: fx.orgA,
            },
        });
        fx.userIds.push(applicantId);
        fx.entity = (await raw.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท as ${sfx} จำกัด`, organizationId: fx.orgA } })).id;
        fx.entityIds.push(fx.entity);

        app = express();
        app.use(express.json());
        app.use('/api/provider/scheduler', require('../../routes/api/provider/scheduler'));
        app.use('/api/provider/applications', require('../../routes/api/provider/applications'));
        app.use('/api/provider/admin', require('../../routes/api/provider/admin'));
    });

    afterAll(async () => {
        const wipe = (model, where) => raw[model].deleteMany({ where }).catch(() => {});
        const byApp = { applicationId: { in: fx.appIds } };
        for (const model of ['checkoutOrder', 'workActivity', 'auditChecklist']) {
            await wipe(model, byApp);
        }
        await wipe('invoice', { id: { in: fx.invoiceIds } });
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

    let daysAhead = 2;
    /** 09:00 Bangkok on a working day ahead, a different day per booking */
    const slot = () => {
        const { addWorkingDays, startOfLocalDay } = require('../../utils/working-days');
        daysAhead += 1;
        return new Date(startOfLocalDay(addWorkingDays(new Date(), daysAhead)).getTime() + 9 * 60 * 60 * 1000).toISOString();
    };
    const book = (applicationId, auditorId) => request(app).post('/api/provider/scheduler/audits/schedules')
        .send({ applicationId, auditorId, scheduledDate: slot(), location: 'แปลงทดสอบ' });

    describe('นัดตรวจแปลงจากหน้าปฏิทิน POST /api/provider/scheduler/audits/schedules', () => {
        test('ผู้ตรวจแปลงองค์กรอื่น: ปฏิเสธ ไม่มีอะไรเปลี่ยน', async () => {
            const id = await paidFor('AUDIT_FEE_PAID', ['M1', 'M2']);
            as(fx.dispatcherA);
            const res = await book(id, fx.inspectorB.id);
            expect(res.status).toBe(422);
            expect(res.body.code).toBe('STAFF_NOT_ASSIGNABLE');
            expect(await rowOf(id)).toMatchObject({ status: 'AUDIT_FEE_PAID', auditorId: null });
        });

        test('ไม่ใช่ผู้ตรวจแปลง (ผู้ตรวจเอกสาร) หรือบัญชีถูกระงับ: ปฏิเสธ', async () => {
            const id = await paidFor('AUDIT_FEE_PAID', ['M1', 'M2']);
            as(fx.dispatcherA);
            for (const who of [fx.reviewerA.id, fx.inspectorSuspended.id, crypto.randomUUID()]) {
                const res = await book(id, who);
                expect(res.status).toBe(422);
            }
            expect(await rowOf(id)).toMatchObject({ status: 'AUDIT_FEE_PAID', auditorId: null });
        });

        test('ผู้ตรวจแปลงคนเดียวกับผู้ตรวจเอกสารของคำขอ: ปฏิเสธ (แยกหน้าที่)', async () => {
            const id = await paidFor('AUDIT_FEE_PAID', ['M1', 'M2'], { reviewerId: fx.inspectorA2.id });
            as(fx.dispatcherA);
            const res = await book(id, fx.inspectorA2.id);
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('INSPECTOR_IS_APPLICATION_REVIEWER');
            expect(await rowOf(id)).toMatchObject({ status: 'AUDIT_FEE_PAID', auditorId: null });
        });

        test('ผู้ตรวจแปลงองค์กรเดียวกัน: นัดได้', async () => {
            const id = await paidFor('AUDIT_FEE_PAID', ['M1', 'M2']);
            as(fx.dispatcherA);
            const res = await book(id, fx.inspectorA.id);
            expect(res.status).toBe(201);
            expect(await rowOf(id)).toMatchObject({ status: 'AUDIT_CONFIRMED', auditorId: fx.inspectorA.id });
        });
    });

    describe('เลื่อนนัดและเปลี่ยนผู้ตรวจจากหน้าปฏิทิน (AUDIT_CONFIRMED)', () => {
        const booked = (extra = {}) => paidFor('AUDIT_CONFIRMED', ['M1', 'M2'], { auditorId: fx.inspectorA.id, scheduledDate: new Date(), ...extra });

        test('ผู้ตรวจแปลงองค์กรอื่น: ปฏิเสธ ผู้ตรวจเดิมยังอยู่', async () => {
            const id = await booked();
            as(fx.dispatcherA);
            const res = await book(id, fx.inspectorB.id);
            expect(res.status).toBe(422);
            expect((await rowOf(id)).auditorId).toBe(fx.inspectorA.id);
        });

        test('ผู้ตรวจแปลงคนเดียวกับผู้ตรวจเอกสาร: ปฏิเสธ', async () => {
            const id = await booked({ reviewerId: fx.inspectorA2.id });
            as(fx.dispatcherA);
            const res = await book(id, fx.inspectorA2.id);
            expect(res.status).toBe(409);
            expect((await rowOf(id)).auditorId).toBe(fx.inspectorA.id);
        });

        test('ผู้ตรวจแปลงองค์กรเดียวกัน: เปลี่ยนได้', async () => {
            const id = await booked();
            as(fx.dispatcherA);
            const res = await book(id, fx.inspectorA2.id);
            expect(res.status).toBe(201);
            expect((await rowOf(id)).auditorId).toBe(fx.inspectorA2.id);
        });
    });

    describe('มอบหมายผู้ตรวจเอกสาร POST /api/provider/scheduler/assign-reviewer', () => {
        const assign = (applicationId, reviewerId) => request(app)
            .post('/api/provider/scheduler/assign-reviewer').send({ applicationId, reviewerId });

        test('ผู้ตรวจเอกสารองค์กรอื่น: ปฏิเสธ', async () => {
            const id = await paidFor('DOC_FEE_PAID', ['M1']);
            as(fx.dispatcherA);
            const res = await assign(id, fx.reviewerB.id);
            expect(res.status).toBe(422);
            expect(res.body.code).toBe('STAFF_NOT_ASSIGNABLE');
            expect(await rowOf(id)).toMatchObject({ status: 'DOC_FEE_PAID', reviewerId: null });
        });

        test('ผู้ตรวจเอกสารองค์กรเดียวกัน: มอบหมายได้', async () => {
            const id = await paidFor('DOC_FEE_PAID', ['M1']);
            as(fx.dispatcherA);
            const res = await assign(id, fx.reviewerA.id);
            expect(res.status).toBe(200);
            expect(await rowOf(id)).toMatchObject({ status: 'ASSIGNED_FOR_REVIEW', reviewerId: fx.reviewerA.id });
        });
    });

    describe('มอบหมาย POST /api/provider/applications/:id/assign', () => {
        const assign = (id, reviewerId) => request(app).post(`/api/provider/applications/${id}/assign`).send({ reviewerId });

        test('ผู้ตรวจเอกสารองค์กรอื่น: ปฏิเสธ', async () => {
            const id = await paidFor('DOC_FEE_PAID', ['M1']);
            as(fx.dispatcherA);
            const res = await assign(id, fx.reviewerB.id);
            expect(res.status).toBe(422);
            expect(res.body.code).toBe('STAFF_NOT_ASSIGNABLE');
            expect(await rowOf(id)).toMatchObject({ status: 'DOC_FEE_PAID', reviewerId: null });
        });

        test('ผู้ตรวจเอกสารที่เป็นผู้ตรวจแปลงของคำขออยู่แล้ว: ปฏิเสธ (แยกหน้าที่)', async () => {
            const id = await paidFor('DOC_FEE_PAID', ['M1'], { auditorId: fx.reviewerA.id });
            as(fx.dispatcherA);
            const res = await assign(id, fx.reviewerA.id);
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('REVIEWER_IS_APPLICATION_INSPECTOR');
        });

        test('ยังไม่จ่ายงวดแรก: 409 MILESTONE_NOT_PAID ไม่ใช่ 500', async () => {
            const id = await application('DOC_FEE_PAID');
            as(fx.dispatcherA);
            const res = await assign(id, fx.reviewerA.id);
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('MILESTONE_NOT_PAID');
            expect(await rowOf(id)).toMatchObject({ status: 'DOC_FEE_PAID', reviewerId: null });
        });

        test('ผู้ตรวจเอกสารองค์กรเดียวกัน จ่ายแล้ว: มอบหมายได้', async () => {
            const id = await paidFor('DOC_FEE_PAID', ['M1']);
            as(fx.dispatcherA);
            const res = await assign(id, fx.reviewerA.id);
            expect(res.status).toBe(200);
            expect(await rowOf(id)).toMatchObject({ status: 'ASSIGNED_FOR_REVIEW', reviewerId: fx.reviewerA.id });
        });
    });

    describe('ผู้ดูแลแพลตฟอร์ม batch ASSIGN', () => {
        const batch = (ids, assignTo) => request(app).post('/api/provider/admin/batch-actions')
            .send({ applicationIds: ids, action: 'ASSIGN', assignTo });

        test('ผู้ตรวจเอกสารที่อยู่องค์กรอื่นจากคำขอ: ปฏิเสธ แม้ผู้ดูแลแพลตฟอร์มข้ามองค์กรได้', async () => {
            const id = await paidFor('DOC_FEE_PAID', ['M1']);
            as(fx.platformAdmin);
            const res = await batch([id], fx.reviewerB.id);
            expect(res.status).toBe(422);
            expect(res.body.code).toBe('STAFF_NOT_ASSIGNABLE');
            expect(await rowOf(id)).toMatchObject({ status: 'DOC_FEE_PAID', reviewerId: null });
        });

        test('ผู้ตรวจเอกสารองค์กรเดียวกับคำขอ: มอบหมายได้', async () => {
            const id = await paidFor('DOC_FEE_PAID', ['M1']);
            as(fx.platformAdmin);
            const res = await batch([id], fx.reviewerA.id);
            expect(res.status).toBe(200);
            expect(await rowOf(id)).toMatchObject({ status: 'ASSIGNED_FOR_REVIEW', reviewerId: fx.reviewerA.id });
        });
    });
});

/**
 * ทุกประตูที่เปลี่ยนสถานะ ต้องผ่านตัวเขียนสถานะตัวเดียว จึงไม่มีประตูไหนข้ามงวดที่คืนเงินแล้ว (real Postgres)
 *
 * รีวิวความปลอดภัย 2026-10-06 (N2): สามประตูเอาผลของ buildTransitionUpdate ไปเขียนแถวเองผ่าน
 * service wrapper จึงไม่ผ่านกฎ "ไม่มีสถานะหลังงวดที่ยังไม่ชำระ" ของตัวเขียน
 * - POST /api/provider/scheduler/assign-reviewer   DOC_FEE_PAID → ASSIGNED_FOR_REVIEW (ต้องจ่าย M1)
 *   และเคยปล่อยผ่านเมื่อผู้เรียกไม่มีองค์กร
 * - การนัดตรวจแปลง (เดิม POST /api/audits/schedule ซึ่งลบแล้ว 2026-10-09 เหลือประตูปฏิทิน
 *   POST /api/provider/scheduler/audits/schedules) AUDIT_FEE_PAID → AUDIT_CONFIRMED (ต้องจ่าย M1+M2)
 * - POST /api/provider/auditor/applications/:id/final-approvals   AUDIT_PASSED → APPROVED
 * - POST /api/provider/auditor/applications/:id/reject-to-auditor AUDIT_PASSED → CAR_REVIEWING
 * งวดที่คืนเงินเต็มจำนวนนับว่ายังไม่ชำระ (คำสั่ง 20)
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

d('ทุกประตูเปลี่ยนสถานะผ่านตัวเขียนสถานะ (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { userIds: [], entityIds: [], appIds: [], orgIds: [], invoiceIds: [] };
    let seq = 0;

    const as = (user) => { mockActor.current = { ...user }; };
    const rowOf = (id) => raw.application.findUnique({ where: { id }, select: { status: true, reviewerId: true, auditorId: true } });

    async function staff(role, organizationId) {
        const id = crypto.randomUUID();
        seq += 1;
        await raw.user.create({
            data: {
                id, canonicalId: `sd-${seq}-${sfx}`, password: 'x', role, authType: 'PROVIDER_ID',
                providerId: `sd-${seq}-${sfx}`, email: `sd-${seq}-${sfx}@example.test`,
                firstName: 'เจ้าหน้าที่', lastName: role, organizationId, status: 'ACTIVE', accountType: 'PROVIDER',
            },
        });
        fx.userIds.push(id);
        return { id, role, canonicalRole: role, organizationId };
    }

    async function application(status, extra = {}) {
        seq += 1;
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-SD-${seq}-${sfx}`, healthId: fx.applicant.canonicalId, areaType: 'OUTDOOR',
                organizationId: fx.orgA, entityId: fx.entity, submitterId: fx.applicant.id, status,
                formData: { workflowState: status }, ...extra,
            },
        });
        fx.appIds.push(row.id);
        return row.id;
    }

    /** งวดที่เงินเข้าจริง · refunded = คืนเงินเต็มจำนวนแล้ว (นับว่ายังไม่ชำระ) */
    async function settled(applicationId, milestone, { refunded = false } = {}) {
        seq += 1;
        const invoice = await raw.invoice.create({
            data: {
                invoiceNumber: `INV-SD-${seq}-${sfx}`, applicationId, healthId: fx.applicant.canonicalId,
                serviceType: `CERTIFICATION_CHECKOUT_${milestone}`, subtotal: 0, totalAmount: 0,
                dueDate: new Date(), status: 'PAID', paidAt: new Date(), organizationId: fx.orgA,
                metadata: refunded ? { refund: { status: 'COMPLETED' } } : {},
                receiptNumber: `RC-SD-${seq}-${sfx}`, receiptIssuedAt: new Date(),
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

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        for (const tag of ['a', 'b']) {
            const org = await raw.organization.create({ data: { name: `sd-${tag}-${sfx}`, slug: `sd-${tag}-${sfx}`, code: `SD${tag}_${sfx}`.toUpperCase() } });
            fx.orgIds.push(org.id);
        }
        [fx.orgA, fx.orgB] = fx.orgIds;

        fx.dispatcherA = await staff('dispatcher', fx.orgA);
        fx.dispatcherB = await staff('dispatcher', fx.orgB);
        fx.dispatcherNoOrg = { id: crypto.randomUUID(), role: 'dispatcher', canonicalRole: 'dispatcher', organizationId: null };
        fx.reviewerA = await staff('document_reviewer', fx.orgA);
        fx.inspectorA = await staff('field_inspector', fx.orgA);
        fx.approverA = await staff('certificate_approver', fx.orgA);

        const applicantId = crypto.randomUUID();
        fx.applicant = { id: applicantId, canonicalId: `sd-app-${sfx}` };
        await raw.user.create({
            data: {
                id: applicantId, canonicalId: fx.applicant.canonicalId, healthId: fx.applicant.canonicalId, password: 'x',
                role: 'health', authType: 'EMAIL_LEGACY', email: `sd-app-${sfx}@example.test`,
                firstName: 'ผู้ยื่น', lastName: 'ทดสอบ', organizationId: fx.orgA,
            },
        });
        fx.userIds.push(applicantId);
        fx.entity = (await raw.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท sd ${sfx} จำกัด`, organizationId: fx.orgA } })).id;
        fx.entityIds.push(fx.entity);

        app = express();
        app.use(express.json());
        app.use('/api/provider/scheduler', require('../../routes/api/provider/scheduler'));
        app.use('/api/provider/auditor', require('../../routes/api/provider/auditor'));
    });

    afterAll(async () => {
        const wipe = (model, where) => raw[model].deleteMany({ where }).catch(() => {});
        const byApp = { applicationId: { in: fx.appIds } };
        for (const model of ['checkoutOrder', 'workActivity', 'certificate', 'auditChecklist']) {
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

    describe('มอบหมายผู้ตรวจเอกสาร (scheduler/assign-reviewer)', () => {
        const assign = (applicationId, reviewerId = fx.reviewerA.id) => request(app)
            .post('/api/provider/scheduler/assign-reviewer').send({ applicationId, reviewerId });

        test('งวดแรกคืนเงินแล้ว: มอบหมายไม่ได้ สถานะไม่เปลี่ยน', async () => {
            const id = await application('DOC_FEE_PAID');
            await settled(id, 'M1', { refunded: true });
            as(fx.dispatcherA);
            const res = await assign(id);
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('MILESTONE_NOT_PAID');
            expect(await rowOf(id)).toMatchObject({ status: 'DOC_FEE_PAID', reviewerId: null });
        });

        test('ผู้จัดคิวที่ไม่มีองค์กร ถูกปฏิเสธ (ไม่รู้องค์กร = ไม่ให้)', async () => {
            const id = await application('DOC_FEE_PAID');
            await settled(id, 'M1');
            as(fx.dispatcherNoOrg);
            const res = await assign(id);
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('NO_ORGANIZATION');
            expect((await rowOf(id)).status).toBe('DOC_FEE_PAID');
        });

        test('ผู้จัดคิวองค์กรอื่น เห็นเหมือนไม่มีคำขอ', async () => {
            const id = await application('DOC_FEE_PAID');
            await settled(id, 'M1');
            as(fx.dispatcherB);
            const res = await assign(id);
            expect(res.status).toBe(404);
            expect((await rowOf(id)).status).toBe('DOC_FEE_PAID');
        });

        test('จ่ายงวดแรกแล้ว: มอบหมายได้ และผู้ตรวจอยู่ในคอลัมน์ reviewerId', async () => {
            const id = await application('DOC_FEE_PAID');
            await settled(id, 'M1');
            as(fx.dispatcherA);
            const res = await assign(id);
            expect(res.status).toBe(200);
            expect(await rowOf(id)).toMatchObject({ status: 'ASSIGNED_FOR_REVIEW', reviewerId: fx.reviewerA.id });
        });
    });

    describe('นัดตรวจแปลงจากหน้าปฏิทิน (audits/schedules)', () => {
        let daysAhead = 2;
        const schedule = (applicationId) => {
            const { addWorkingDays, startOfLocalDay } = require('../../utils/working-days');
            daysAhead += 1;
            const when = new Date(startOfLocalDay(addWorkingDays(new Date(), daysAhead)).getTime() + 9 * 60 * 60 * 1000);
            return request(app).post('/api/provider/scheduler/audits/schedules')
                .send({ applicationId, scheduledDate: when.toISOString(), auditorId: fx.inspectorA.id, location: 'แปลงทดสอบ' });
        };

        test('งวดที่สองคืนเงินแล้ว: นัดไม่ได้ สถานะและผู้ตรวจไม่เปลี่ยน', async () => {
            const id = await application('AUDIT_FEE_PAID');
            await settled(id, 'M1');
            await settled(id, 'M2', { refunded: true });
            as(fx.dispatcherA);
            const res = await schedule(id);
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Phase 2 payment must be confirmed before scheduling');
            expect(await rowOf(id)).toMatchObject({ status: 'AUDIT_FEE_PAID', auditorId: null });
        });

        test('ผู้จัดคิวองค์กรอื่น เห็นเหมือนไม่มีคำขอ', async () => {
            const id = await application('AUDIT_FEE_PAID');
            await settled(id, 'M1');
            await settled(id, 'M2');
            as(fx.dispatcherB);
            const res = await schedule(id);
            expect(res.status).toBe(404);
            expect((await rowOf(id)).status).toBe('AUDIT_FEE_PAID');
        });

        test('จ่ายครบสองงวด: นัดได้', async () => {
            const id = await application('AUDIT_FEE_PAID');
            await settled(id, 'M1');
            await settled(id, 'M2');
            as(fx.dispatcherA);
            const res = await schedule(id);
            expect(res.status).toBe(201);
            expect(await rowOf(id)).toMatchObject({ status: 'AUDIT_CONFIRMED', auditorId: fx.inspectorA.id });
        });
    });

    describe('ผู้อนุมัติใบรับรอง (auditor/final-approvals, reject-to-auditor)', () => {
        const passed = () => application('AUDIT_PASSED', { auditorId: fx.inspectorA.id, reviewerId: fx.reviewerA.id });

        test('อนุมัติไม่ได้เมื่องวดที่สองคืนเงินแล้ว และไม่มีใบรับรองเกิด', async () => {
            const id = await passed();
            await settled(id, 'M1');
            await settled(id, 'M2', { refunded: true });
            as(fx.approverA);
            await require('../../services/certification-decision-service').markDecisionFileViewed({ prisma: raw, applicationRef: id, organizationId: fx.approverA.organizationId, approverId: fx.approverA.id });
            const res = await request(app).post(`/api/provider/auditor/applications/${id}/final-approvals`).send({ reason: 'หลักฐานครบ' });
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('MILESTONE_NOT_PAID');
            expect((await rowOf(id)).status).toBe('AUDIT_PASSED');
            expect(await raw.certificate.count({ where: { applicationId: id } })).toBe(0);
        });

        test('ส่งกลับไปทบทวนไม่ได้เมื่องวดแรกคืนเงินแล้ว', async () => {
            const id = await passed();
            await settled(id, 'M1', { refunded: true });
            await settled(id, 'M2');
            as(fx.approverA);
            const res = await request(app).post(`/api/provider/auditor/applications/${id}/reject-to-auditor`).send({ comment: 'หลักฐานไม่พอ' });
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('MILESTONE_NOT_PAID');
            expect((await rowOf(id)).status).toBe('AUDIT_PASSED');
        });

        test('จ่ายครบสองงวด: ส่งกลับไปทบทวนได้ และมีแถวบันทึกการเปลี่ยนสถานะ', async () => {
            const id = await passed();
            await settled(id, 'M1');
            await settled(id, 'M2');
            as(fx.approverA);
            const res = await request(app).post(`/api/provider/auditor/applications/${id}/reject-to-auditor`).send({ comment: 'หลักฐานไม่พอ' });
            expect(res.status).toBe(200);
            expect((await rowOf(id)).status).toBe('CAR_REVIEWING');
            expect(await raw.auditLog.count({ where: { resourceId: id, action: 'APPLICATION_STATUS_TRANSITION' } })).toBe(1);
        });
    });
});

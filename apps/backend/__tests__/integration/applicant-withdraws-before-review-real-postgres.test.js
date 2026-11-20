/**
 * ผู้ยื่นถอนคำขอเองก่อนเริ่มตรวจเอกสาร → CANCELLED ไม่คืนเงิน (operator คำสั่ง 32, 2026-10-07)
 * real Postgres, ประตูจริง POST /api/applications/:id/withdraw
 *
 * เดิมไม่มีประตูถอนเลย (audit 2026-10-07 Q3): ลบได้เฉพาะร่าง
 */

'use strict';

process.env.PAYMENT_ADAPTER = 'mock';

const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { buildApplicantParties } = require('./fixtures/applicant-parties-fixture');

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

d('ถอนคำขอก่อนเริ่มตรวจเอกสาร (real Postgres)', () => {
    let raw;
    let fx;
    let app;

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        fx = await buildApplicantParties(raw, 'wd');
        app = express();
        app.use(express.json());
        app.use('/api/applications', require('../../routes/api/applications/application-withdraw'));
    });

    afterAll(async () => {
        await raw.paymentTransaction.deleteMany({ where: { applicationId: { in: fx.appIds } } }).catch(() => {});
        await fx.cleanup();
        await raw.$disconnect();
    });

    const as = (u) => { mockActor.current = { id: u.id, role: 'health', canonicalRole: 'health', organizationId: fx.orgId }; };
    const withdraw = (application, reason = 'เปลี่ยนแผนการปลูกปีนี้') => request(app)
        .post(`/api/applications/${application.id}/withdraw`).send({ reason });
    const rowOf = (id) => raw.application.findUnique({ where: { id }, select: { status: true, closedReason: true, formData: true } });

    test.each(['PENDING_DOC_FEE', 'DOC_FEE_PAID'])('จาก %s → CANCELLED · บันทึกเหตุผล · ไม่มีการคืนเงิน · แจ้งผู้ยื่นและผู้ถือ', async (status) => {
        const application = await fx.makeApplication({ status });
        if (status === 'DOC_FEE_PAID') { await fx.settle(application.id, 'M1'); }
        as(fx.applicant);
        const res = await withdraw(application);
        expect({ status: res.status, body: res.body }).toEqual({ status: 200, body: { success: true, data: { id: application.id, status: 'CANCELLED' } } });
        const row = await rowOf(application.id);
        expect(row.status).toBe('CANCELLED');
        expect(row.closedReason).toBe('CANCELLED_BY_APPLICANT');
        expect(row.formData.withdrawal).toMatchObject({ reason: 'เปลี่ยนแผนการปลูกปีนี้', by: fx.applicant.id, refund: 'NONE' });
        expect(await raw.creditNote.count({ where: { originalInvoice: { applicationId: application.id } } })).toBe(0);
        const told = await raw.notification.findMany({
            where: { metadata: { path: ['applicationId'], equals: application.id }, title: 'ถอนคำขอแล้ว' }, select: { userId: true },
        });
        expect(told.map((r) => r.userId).sort()).toEqual(fx.expectedParties);
    });

    const gateway = () => require('../../services/payment/payment-adapter').getPaymentAdapter();

    async function openCheckout(application, intentStatus) {
        const intent = await gateway().createCheckoutSession({
            amountSatang: 588500, currency: 'thb', idempotencyKey: `wd-${application.id}`,
        });
        (await gateway().getPaymentIntent(intent.id)).status = intentStatus;
        const invoice = await raw.invoice.create({
            data: {
                invoiceNumber: `INV-WD-${application.id.slice(0, 8)}`, applicationId: application.id, healthId: fx.applicant.canonicalId,
                serviceType: 'CERTIFICATION_CHECKOUT_M1', subtotal: 5500, totalAmount: 5885, dueDate: new Date(), status: 'pending',
                organizationId: fx.orgId, metadata: {},
            },
        });
        const order = await raw.checkoutOrder.create({
            data: {
                applicationId: application.id, milestone: 'M1', platformFeeNet: 5500, platformFeeVat: 385, platformFeeGross: 5885,
                totalPayableAmount: 5885, status: 'PENDING_PAYMENT', invoiceId: invoice.id, stripePaymentIntentId: intent.id,
                organizationId: fx.orgId,
            },
        });
        return { intentId: intent.id, invoice, order };
    }

    test('QR ที่เปิดค้างไว้ถูกยกเลิกที่ gateway ก่อนปิดคำขอ · คำสั่งชำระและใบแจ้งหนี้ถูกปลดพร้อมกัน', async () => {
        const application = await fx.makeApplication({ status: 'PENDING_DOC_FEE' });
        const { intentId, invoice, order } = await openCheckout(application, 'requires_payment_method');
        as(fx.applicant);
        expect((await withdraw(application)).status).toBe(200);
        expect((await gateway().getPaymentIntent(intentId)).status).toBe('canceled');
        expect((await raw.checkoutOrder.findUnique({ where: { id: order.id } })).status).toBe('CANCELLED');
        expect((await raw.invoice.findUnique({ where: { id: invoice.id } })).isDeleted).toBe(true);
    });

    test.each(['succeeded', 'processing'])('เงินกำลังเข้า (PaymentIntent %s) → 409 WITHDRAW_PAYMENT_IN_FLIGHT · คำขอและคำสั่งชำระไม่เปลี่ยน', async (intentStatus) => {
        const application = await fx.makeApplication({ status: 'PENDING_DOC_FEE' });
        const { intentId, invoice, order } = await openCheckout(application, intentStatus);
        as(fx.applicant);
        const res = await withdraw(application);
        expect({ status: res.status, code: res.body.code }).toEqual({ status: 409, code: 'WITHDRAW_PAYMENT_IN_FLIGHT' });
        expect((await rowOf(application.id)).status).toBe('PENDING_DOC_FEE');
        expect((await raw.checkoutOrder.findUnique({ where: { id: order.id } })).status).toBe('PENDING_PAYMENT');
        expect((await raw.invoice.findUnique({ where: { id: invoice.id } })).isDeleted).toBe(false);
        expect((await gateway().getPaymentIntent(intentId)).status).toBe(intentStatus);
    });

    async function orderWithIntent(application, { intentStatus, orderStatus }) {
        const intent = await gateway().createCheckoutSession({
            amountSatang: 588500, currency: 'thb', idempotencyKey: `wd-${orderStatus}-${application.id}`,
        });
        (await gateway().getPaymentIntent(intent.id)).status = intentStatus;
        const order = await raw.checkoutOrder.create({
            data: {
                applicationId: application.id, milestone: 'M1', platformFeeNet: 5500, platformFeeVat: 385, platformFeeGross: 5885,
                totalPayableAmount: 5885, status: orderStatus, stripePaymentIntentId: intent.id, organizationId: fx.orgId,
            },
        });
        return { intentId: intent.id, order };
    }

    test('N2: DOC_FEE_PAID มีคำสั่งชำระซ้ำที่ปลดแล้ว (CANCELLED) แต่ intent เป็น succeeded → ถอนได้ ไม่แตะ intent นั้น', async () => {
        const application = await fx.makeApplication({ status: 'DOC_FEE_PAID' });
        await fx.settle(application.id, 'M1');
        const { intentId, order } = await orderWithIntent(application, { intentStatus: 'succeeded', orderStatus: 'CANCELLED' });
        as(fx.applicant);
        const res = await withdraw(application);
        expect({ status: res.status, code: res.body.code }).toEqual({ status: 200, code: undefined });
        expect((await rowOf(application.id)).status).toBe('CANCELLED');
        expect((await gateway().getPaymentIntent(intentId)).status).toBe('succeeded');
        expect((await raw.checkoutOrder.findUnique({ where: { id: order.id } })).status).toBe('CANCELLED');
    });

    test('N2 ตัวควบคุม: DOC_FEE_PAID มีคำสั่งชำระที่ยังค้างจ่ายและเงินกำลังเข้า → 409 WITHDRAW_PAYMENT_IN_FLIGHT', async () => {
        const application = await fx.makeApplication({ status: 'DOC_FEE_PAID' });
        await fx.settle(application.id, 'M1');
        const { order } = await orderWithIntent(application, { intentStatus: 'processing', orderStatus: 'PENDING_PAYMENT' });
        as(fx.applicant);
        const res = await withdraw(application);
        expect({ status: res.status, code: res.body.code }).toEqual({ status: 409, code: 'WITHDRAW_PAYMENT_IN_FLIGHT' });
        expect((await rowOf(application.id)).status).toBe('DOC_FEE_PAID');
        expect((await raw.checkoutOrder.findUnique({ where: { id: order.id } })).status).toBe('PENDING_PAYMENT');
    });

    test('เริ่มตรวจเอกสารแล้ว (ASSIGNED_FOR_REVIEW) → 409 WITHDRAW_NOT_ALLOWED · สถานะไม่เปลี่ยน', async () => {
        const application = await fx.makeApplication({ status: 'ASSIGNED_FOR_REVIEW', reviewerId: fx.reviewer.id });
        as(fx.applicant);
        const res = await withdraw(application);
        expect({ status: res.status, code: res.body.code }).toEqual({ status: 409, code: 'WITHDRAW_NOT_ALLOWED' });
        expect((await rowOf(application.id)).status).toBe('ASSIGNED_FOR_REVIEW');
    });

    test('สมาชิกที่ไม่มีสิทธิ์ยื่น (MANAGER) ถอนไม่ได้ → 403 · ไม่ใส่เหตุผล → 400', async () => {
        const application = await fx.makeApplication({ status: 'PENDING_DOC_FEE' });
        as(fx.manager);
        const denied = await withdraw(application);
        expect(denied.status).toBe(403);
        as(fx.applicant);
        const noReason = await withdraw(application, ' ');
        expect({ status: noReason.status, code: noReason.body.code }).toEqual({ status: 400, code: 'WITHDRAW_REASON_REQUIRED' });
        expect((await rowOf(application.id)).status).toBe('PENDING_DOC_FEE');
    });
});

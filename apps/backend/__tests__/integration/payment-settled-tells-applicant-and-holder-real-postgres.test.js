/**
 * ชำระสำเร็จ / ออกใบเสร็จแล้ว แจ้งผู้ยื่นและผู้ถือครั้งเดียวต่อคำสั่งชำระ (real Postgres)
 *
 * D4 (audit 2026-10-07): notifyPaymentSuccess ไม่มีผู้เรียก ผู้ยื่นจ่าย QR แล้วต้องเปิดหน้าเองเพื่อรู้ว่าเงินเข้า
 * คำสั่ง 32: แจ้งผู้ยื่น ∪ สมาชิกผู้ถือที่มีสิทธิ์ SUBMIT_APPLICATION
 * webhook ซ้ำ (Stripe ส่งซ้ำ, reconcile) ต้องไม่ส่งซ้ำ
 */

'use strict';

process.env.PAYMENT_ADAPTER = 'mock';

const { dropConsentRows } = require('../../test-support/consent-history');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { buildApplicantParties } = require('./fixtures/applicant-parties-fixture');

d('ชำระสำเร็จแจ้งผู้ยื่นและผู้ถือ ครั้งเดียวต่อคำสั่งชำระ (real Postgres)', () => {
    let raw;
    let fx;
    const quotationService = require('../../services/quotation-service');
    const { issueQuotationOnSubmit } = require('../../services/quotation-issuance-on-submit');
    const { createCheckoutForApplication } = require('../../services/checkout/stripe-checkout-service');
    const { settleFromPaymentIntent } = require('../../services/checkout/checkout-settlement-service');
    const mockAdapter = require('../../services/payment/mock-payment-adapter');
    const { ConsentCategory, ConsentVersions } = require('../../middleware/consent-manager');

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        mockAdapter.__reset();
        fx = await buildApplicantParties(raw, 'paid');
        await raw.userConsent.create({
            data: {
                userId: fx.applicant.id, organizationId: fx.orgId, category: ConsentCategory.PAYMENT_TERMS,
                version: ConsentVersions.PAYMENT_TERMS, granted: true, grantedAt: new Date(),
            },
        });
    });

    afterAll(async () => {
        await raw.paymentTransaction.deleteMany({ where: { applicationId: { in: fx.appIds } } }).catch(() => {});
        await raw.journalEntry?.deleteMany({ where: { applicationId: { in: fx.appIds } } }).catch(() => {});
        await dropConsentRows(raw, fx.applicant.id).catch(() => {});
        await fx.cleanup();
        await raw.$disconnect();
    });

    async function pendingDocFee() {
        const application = await fx.makeApplication({ status: 'PENDING_DOC_FEE' });
        expect(await issueQuotationOnSubmit({ application, actorId: null })).toEqual({ issued: true });
        const [qt] = await raw.quotation.findMany({ where: { applicationId: application.id, isDeleted: false } });
        await quotationService.markQuotationAccepted(qt.id, { acceptedBy: null, snapshot: quotationService.buildAcceptanceSnapshot(qt) });
        const checkout = await createCheckoutForApplication({
            applicationId: application.id, milestone: 'M1',
            actor: {
                id: fx.applicant.id, healthId: fx.applicant.canonicalId, role: 'health',
                holderScope: { userId: fx.applicant.id, readIds: [fx.entityId], editIds: [fx.entityId] },
            },
        });
        const order = await raw.checkoutOrder.findUnique({ where: { id: checkout.checkoutOrderId } });
        const paymentIntent = {
            id: checkout.paymentIntentId, status: 'succeeded',
            amount_received: Math.round(Number(order.totalPayableAmount) * 100),
            metadata: { checkoutOrderId: order.id },
        };
        return { application, order, paymentIntent };
    }

    const paidNotices = (applicationId) => raw.notification.findMany({
        where: { type: 'PAYMENT_PHASE1_SUCCESS', metadata: { path: ['applicationId'], equals: applicationId } },
        select: { userId: true, title: true, message: true },
    });

    test('webhook ชำระงวด 1 สำเร็จ → ผู้ยื่นและสมาชิกผู้ถือที่มีสิทธิ์ยื่นได้คนละหนึ่งแถว · ส่งซ้ำไม่เพิ่ม', async () => {
        const { application, paymentIntent } = await pendingDocFee();

        expect(await settleFromPaymentIntent({ paymentIntent, eventId: `evt-${application.id}-1` })).toEqual({ settled: true });
        expect((await raw.application.findUnique({ where: { id: application.id } })).status).toBe('DOC_FEE_PAID');

        const first = await paidNotices(application.id);
        expect(first.map((r) => r.userId).sort()).toEqual(fx.expectedParties);
        expect(first.every((r) => r.message.includes(application.applicationNumber))).toBe(true);

        expect(await settleFromPaymentIntent({ paymentIntent, eventId: `evt-${application.id}-2` }))
            .toEqual({ settled: true, alreadySettled: true });
        expect(await paidNotices(application.id)).toHaveLength(fx.expectedParties.length);
    });

    test('ยังไม่ settle = ไม่มีแจ้งชำระสำเร็จ (ตัวควบคุมฝั่งลบ)', async () => {
        const { application } = await pendingDocFee();
        expect(await paidNotices(application.id)).toHaveLength(0);
    });
});

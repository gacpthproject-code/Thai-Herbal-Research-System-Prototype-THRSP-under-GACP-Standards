/**
 * settle บันทึก livemode ลง metadata ของใบแจ้งหนี้โดยไม่ทับสิ่งที่ผู้อื่นเขียนไว้ระหว่างทาง (real Postgres)
 *
 * ผลตรวจ trialmark รอบ 2 ข้อ I-2: settle อ่าน invoice.metadata ก่อนเปิด transaction แล้วเขียนทั้งก้อนจากของที่อ่านไว้
 * สิ่งที่ถูกเขียนลง metadata ระหว่างนั้นจะหายไป ช่วงนั้นมีการขอเลขใบเสร็จ (transaction แยก) คั่นอยู่
 * เทสต์นี้เขียน metadata ลงแถวจริงในช่วงนั้นพอดี แล้วดูว่าหลัง settle ยังอยู่
 */

'use strict';

process.env.PAYMENT_ADAPTER = 'mock';

const { dropConsentRows } = require('../../test-support/consent-history');
const mockBetweenReadAndSettle = { write: null };
jest.mock('../../services/receipt-numbering-service', () => {
    const actual = jest.requireActual('../../services/receipt-numbering-service');
    return {
        ...actual,
        allocateReceiptNumber: async (...args) => {
            if (mockBetweenReadAndSettle.write) { await mockBetweenReadAndSettle.write(); }
            return actual.allocateReceiptNumber(...args);
        },
    };
});

const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { buildApplicantParties } = require('./fixtures/applicant-parties-fixture');

d('settle ไม่ทับ metadata ที่ถูกเขียนหลังอ่านคำสั่งชำระ (real Postgres)', () => {
    let raw;
    let fx;
    const quotationService = require('../../services/quotation-service');
    const { issueQuotationOnSubmit } = require('../../services/quotation-issuance-on-submit');
    const { createCheckoutForApplication } = require('../../services/checkout/stripe-checkout-service');
    const { settleFromPaymentIntent } = require('../../services/checkout/checkout-settlement-service');
    const { prisma } = require('../../services/prisma-database');
    const mockAdapter = require('../../services/payment/mock-payment-adapter');
    const { ConsentCategory, ConsentVersions } = require('../../middleware/consent-manager');

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        mockAdapter.__reset();
        fx = await buildApplicantParties(raw, 'meta');
        await raw.userConsent.create({
            data: {
                userId: fx.applicant.id, organizationId: fx.orgId, category: ConsentCategory.PAYMENT_TERMS,
                version: ConsentVersions.PAYMENT_TERMS, granted: true, grantedAt: new Date(),
            },
        });
    });

    afterAll(async () => {
        mockBetweenReadAndSettle.write = null;
        await raw.paymentTransaction.deleteMany({ where: { applicationId: { in: fx.appIds } } }).catch(() => {});
        await raw.journalEntry?.deleteMany({ where: { applicationId: { in: fx.appIds } } }).catch(() => {});
        await dropConsentRows(raw, fx.applicant.id).catch(() => {});
        await fx.cleanup();
        await raw.$disconnect();
    });

    test('ค่าที่เขียนลง metadata ระหว่างอ่านคำสั่งชำระกับ settle ยังอยู่ และมี livemode=false เพิ่ม', async () => {
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
        const before = await prisma.invoice.findUnique({ where: { id: order.invoiceId }, select: { metadata: true } });

        mockBetweenReadAndSettle.write = async () => {
            mockBetweenReadAndSettle.write = null;
            const now = await prisma.invoice.findUnique({ where: { id: order.invoiceId }, select: { metadata: true } });
            await prisma.invoice.update({
                where: { id: order.invoiceId },
                data: { metadata: { ...now.metadata, staffNote: 'written between read and settle' } },
            });
        };

        const r = await settleFromPaymentIntent({
            paymentIntent: {
                id: checkout.paymentIntentId, status: 'succeeded', livemode: false,
                amount_received: Math.round(Number(order.totalPayableAmount) * 100),
                metadata: { checkoutOrderId: order.id },
            },
            eventId: `evt-${application.id}-meta`,
        });
        expect(r).toEqual({ settled: true });
        expect(mockBetweenReadAndSettle.write).toBeNull();

        const after = await prisma.invoice.findUnique({ where: { id: order.invoiceId }, select: { status: true, metadata: true } });
        expect(after.status).toBe('paid');
        expect(after.metadata).toEqual({ ...before.metadata, staffNote: 'written between read and settle', livemode: false });
    });
});

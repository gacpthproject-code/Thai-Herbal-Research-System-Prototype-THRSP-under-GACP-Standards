/**
 * ห้ามสร้างคำสั่งชำระบนคำขอที่เพิ่งถูกปิด (security re-review 2026-10-07 N5) · real Postgres
 *
 * createCheckoutForApplication อ่านสถานะคำขอโดยไม่ล็อกแถว ผู้ยื่นที่ถอนคำขออยู่พร้อมกัน (หรือตัวปิดเพราะไม่ชำระ)
 * commit CANCELLED/EXPIRED หลังการอ่านนั้น → ยังสร้างคำสั่งชำระและ QR ให้คำขอที่ปิดแล้วได้
 *
 * การถอนพร้อมกันจำลองด้วยทรานแซกชันที่เขียน CANCELLED ค้างไว้ยังไม่ commit (ถือ row lock แบบเดียวกับ
 * application-withdraw) แล้ว commit ระหว่างที่การสร้างคำสั่งชำระกำลังวิ่ง
 */

'use strict';

process.env.PAYMENT_ADAPTER = 'mock';

const { dropConsentRows } = require('../../test-support/consent-history');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { buildApplicantParties } = require('./fixtures/applicant-parties-fixture');

d('สร้างคำสั่งชำระไม่ได้เมื่อคำขอถูกปิดระหว่างทาง (real Postgres)', () => {
    let raw;
    let fx;
    const quotationService = require('../../services/quotation-service');
    const { issueQuotationOnSubmit } = require('../../services/quotation-issuance-on-submit');
    const { createCheckoutForApplication } = require('../../services/checkout/stripe-checkout-service');
    const mockAdapter = require('../../services/payment/mock-payment-adapter');
    const { ConsentCategory, ConsentVersions } = require('../../middleware/consent-manager');

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        mockAdapter.__reset();
        fx = await buildApplicantParties(raw, 'mint');
        await raw.userConsent.create({
            data: {
                userId: fx.applicant.id, organizationId: fx.orgId, category: ConsentCategory.PAYMENT_TERMS,
                version: ConsentVersions.PAYMENT_TERMS, granted: true, grantedAt: new Date(),
            },
        });
    });

    afterAll(async () => {
        await raw.paymentTransaction.deleteMany({ where: { applicationId: { in: fx.appIds } } }).catch(() => {});
        await raw.invoiceLineItem?.deleteMany({ where: { invoice: { applicationId: { in: fx.appIds } } } }).catch(() => {});
        await dropConsentRows(raw, fx.applicant.id).catch(() => {});
        await fx.cleanup();
        await raw.$disconnect();
    });

    async function acceptedPendingDocFee() {
        const application = await fx.makeApplication({ status: 'PENDING_DOC_FEE' });
        expect(await issueQuotationOnSubmit({ application, actorId: null })).toEqual({ issued: true });
        const [qt] = await raw.quotation.findMany({ where: { applicationId: application.id, isDeleted: false } });
        await quotationService.markQuotationAccepted(qt.id, { acceptedBy: null, snapshot: quotationService.buildAcceptanceSnapshot(qt) });
        return application;
    }

    const pay = (application) => createCheckoutForApplication({
        applicationId: application.id, milestone: 'M1',
        actor: {
            id: fx.applicant.id, healthId: fx.applicant.canonicalId, role: 'health',
            holderScope: { userId: fx.applicant.id, readIds: [fx.entityId], editIds: [fx.entityId] },
        },
    });

    test('ถอนคำขอ commit ระหว่างสร้างคำสั่งชำระ → 409 CHECKOUT_MILESTONE_NOT_PAYABLE · ไม่มีคำสั่งชำระหรือใบแจ้งหนี้', async () => {
        const application = await acceptedPendingDocFee();

        let commitWithdraw;
        const withdrawHeld = new Promise((resolve) => { commitWithdraw = resolve; });
        let withdrawWrote;
        const wrote = new Promise((resolve) => { withdrawWrote = resolve; });
        const withdraw = raw.$transaction(async (tx) => {
            await tx.$executeRaw`UPDATE applications SET status = 'CANCELLED', "closedReason" = 'CANCELLED_BY_APPLICANT' WHERE id = ${application.id}`;
            withdrawWrote();
            await withdrawHeld;
        }, { timeout: 20000 });
        await wrote;

        const checkout = pay(application).then(() => ({ ok: true }), (err) => ({ ok: false, err }));
        await new Promise((r) => setTimeout(r, 1500));
        commitWithdraw();
        await withdraw;

        const outcome = await checkout;
        expect(outcome.ok).toBe(false);
        expect({ status: outcome.err.statusCode, code: outcome.err.code })
            .toEqual({ status: 409, code: 'CHECKOUT_MILESTONE_NOT_PAYABLE' });
        expect(await raw.checkoutOrder.count({ where: { applicationId: application.id } })).toBe(0);
        expect(await raw.invoice.count({ where: { applicationId: application.id, isDeleted: false } })).toBe(0);
    });

    test('ตัวควบคุม: ไม่มีใครปิดคำขอ → สร้างคำสั่งชำระได้ตามปกติ', async () => {
        const application = await acceptedPendingDocFee();
        const checkout = await pay(application);
        expect(checkout.checkoutOrderId).toEqual(expect.any(String));
        expect(await raw.checkoutOrder.count({ where: { applicationId: application.id, status: 'PENDING_PAYMENT' } })).toBe(1);
    });
});

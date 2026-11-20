'use strict';

/**
 * Phase 2 end to end on a real Postgres, through the real HTTP doors (staging
 * walk 2026-10-06 round 5, D7 + D8).
 *
 * D7: the payments page sends `?app=` only, so POST /api/payments/checkout
 * arrives without a milestone. The server must pick the one milestone the
 * application can pay now (M2 at DOC_APPROVED), not assume M1.
 *
 * D8: once the webhook settles M2, the checkout rail's single invoice carries
 * the receipt. POST inspection-starts must read that as "receipt issued".
 *
 * Only authentication is attached by hand; the gateway is the mock adapter.
 */

process.env.PAYMENT_ADAPTER = 'mock';
process.env.STRIPE_CHECKOUT_ENABLED = 'true';

const { dropConsentRows } = require('../../test-support/consent-history');
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

const { ConsentCategory, ConsentVersions } = require('../../middleware/consent-manager');
const quotationService = require('../../services/quotation-service');
const { issueQuotationOnSubmit } = require('../../services/quotation-issuance-on-submit');
const { settleEvent } = require('../../services/checkout/checkout-settlement-service');
const mockAdapter = require('../../services/payment/mock-payment-adapter');
const { isPhase2PaymentConfirmed } = require('../../shared/phase2-schedule-gate');
const { batchReinstateWrongfulExpiry } = require('../../services/waiver-reopen-service');
const invoiceService = require('../../services/invoice-service');
const { computePhaseSettlement } = require('../../services/phase-billing-service');
const { writeApplicationStatus } = require('../../services/application-status-writer');
const { getSchedulingQueue } = require('../../services/audit-scheduling-service');

d('phase 2: the applicant pays M2 from the app and the inspector may start (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fx = { userIds: [], appIds: [] };

    const mkUser = async (name, role) => {
        const id = crypto.randomUUID();
        const canonicalId = `p2-${name}-${sfx}`;
        await raw.user.create({
            data: {
                id, canonicalId, healthId: canonicalId, password: 'x', role, authType: 'EMAIL_LEGACY',
                email: `p2-${name}-${sfx}@example.test`, firstName: 'ทดสอบ', lastName: name, organizationId: fx.org,
            },
        });
        fx.userIds.push(id);
        return { id, canonicalId };
    };
    const asApplicant = () => {
        mockActor.current = {
            id: fx.A.id, canonicalId: fx.A.canonicalId, healthId: fx.A.canonicalId,
            role: 'health', canonicalRole: 'health', organizationId: fx.org,
        };
    };
    const asInspector = () => {
        mockActor.current = { id: fx.I.id, role: 'field_inspector', canonicalRole: 'field_inspector', organizationId: fx.org };
    };

    async function docApprovedWithAcceptedQuotation(label) {
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-P2-${label}-${sfx}`, healthId: fx.A.canonicalId, areaType: 'OUTDOOR',
                organizationId: fx.org, entityId: fx.C, submitterId: fx.A.id, status: 'PENDING_DOC_FEE',
                formData: { workflowState: 'PENDING_DOC_FEE' },
            },
        });
        fx.appIds.push(row.id);
        expect(await issueQuotationOnSubmit({ application: row, actorId: null })).toEqual({ issued: true });
        const [qt] = await raw.quotation.findMany({ where: { applicationId: row.id, isDeleted: false } });
        await quotationService.markQuotationAccepted(qt.id, {
            acceptedBy: null, snapshot: quotationService.buildAcceptanceSnapshot(qt),
        });
        await settleMilestones(raw, row, ['M1']);
        await raw.application.update({
            where: { id: row.id },
            data: { status: 'DOC_APPROVED', phase1Status: 'PAID', formData: { workflowState: 'DOC_APPROVED' } },
        });
        return row.id;
    }

    async function webhookSettles(orderId, tag) {
        const order = await raw.checkoutOrder.findUnique({ where: { id: orderId } });
        const satang = Math.round(Number(order.totalPayableAmount) * 100);
        const eventId = `evt_p2_${tag}_${sfx}`;
        await raw.stripeWebhookEvent.create({
            data: {
                id: eventId, type: 'payment_intent.succeeded', status: 'RECEIVED', attempts: 0,
                payload: { data: { object: {
                    id: order.stripePaymentIntentId, amount: satang, amount_received: satang,
                    metadata: { checkoutOrderId: order.id, milestone: order.milestone },
                } } },
            },
        });
        return settleEvent(eventId);
    }

    async function settledM2(label) {
        const id = await docApprovedWithAcceptedQuotation(label);
        asApplicant();
        const pay = await request(app).post('/api/payments/checkout').send({ applicationId: id, milestone: 'M2' });
        expect(pay.status).toBe(200);
        await webhookSettles(pay.body.data.checkoutOrderId, label);
        const invoice = await raw.invoice.findFirst({ where: { applicationId: id, serviceType: 'CERTIFICATION_CHECKOUT_M2', isDeleted: false } });
        expect(invoice.receiptNumber).toBeTruthy();
        return { id, invoice };
    }

    async function refund(invoice, status) {
        await raw.invoice.update({
            where: { id: invoice.id },
            data: { metadata: { ...(invoice.metadata || {}), refund: { status } } },
        });
    }

    async function inspectionStarts(id) {
        await raw.application.update({
            where: { id },
            data: { status: 'AUDIT_CONFIRMED', auditorId: fx.I.id, formData: { workflowState: 'AUDIT_CONFIRMED' } },
        });
        asInspector();
        return request(app).post(`/api/provider/auditor/applications/${id}/inspection-starts`).send({});
    }

    async function expiredFromCar(id) {
        await raw.application.update({
            where: { id },
            data: { status: 'EXPIRED', formData: { workflowState: 'EXPIRED', cancelReason: 'CAR_OVERDUE' } },
        });
    }

    const financeApprover = () => ({
        id: fx.F.id, role: 'finance_officer_platform', canonicalRole: 'finance_officer_platform',
        status: 'ACTIVE', organizationId: fx.org,
    });

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        mockAdapter.__reset();
        fx.org = (await raw.organization.create({ data: { name: `p2-${sfx}`, slug: `p2-${sfx}`, code: `P2_${sfx}`.toUpperCase().slice(0, 24) } })).id;
        fx.A = await mkUser('a', 'health');
        fx.I = await mkUser('i', 'field_inspector');
        fx.F = await mkUser('f', 'finance_officer_platform');
        fx.P = await mkUser('p', 'system_admin_platform');
        fx.C = (await raw.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท p2 ${sfx} จำกัด`, organizationId: fx.org } })).id;
        await raw.entityMembership.create({ data: { userId: fx.A.id, entityId: fx.C, role: 'OWNER', status: 'ACTIVE', organizationId: fx.org } });
        await raw.userConsent.create({
            data: {
                userId: fx.A.id, organizationId: fx.org, category: ConsentCategory.PAYMENT_TERMS,
                version: ConsentVersions.PAYMENT_TERMS, granted: true, grantedAt: new Date(),
            },
        });

        app = express();
        app.use(express.json());
        app.use('/api/payments', require('../../routes/api/finance/payments'));
        app.use('/api/provider/auditor', require('../../routes/api/provider/auditor'));
    });

    afterAll(async () => {
        if (!raw) { return; }
        const ids = fx.appIds;
        const orders = await raw.checkoutOrder.findMany({ where: { applicationId: { in: ids } } }).catch(() => []);
        const eventIds = (await raw.stripeWebhookEvent.findMany({ where: { id: { startsWith: 'evt_p2_' } }, select: { id: true } })
            .catch(() => [])).map((e) => e.id).filter((id) => id.endsWith(sfx));
        await raw.stripeWebhookEvent.deleteMany({ where: { id: { in: eventIds } } }).catch(() => {});
        await raw.journalEntry?.deleteMany({ where: { applicationId: { in: ids } } }).catch(() => {});
        await raw.checkoutDocument?.deleteMany({ where: { checkoutOrderId: { in: orders.map((o) => o.id) } } }).catch(() => {});
        await raw.checkoutOrder.deleteMany({ where: { applicationId: { in: ids } } }).catch(() => {});
        for (const o of orders) {
            if (o.invoiceId) { await raw.invoiceLineItem.deleteMany({ where: { invoiceId: o.invoiceId } }).catch(() => {}); }
        }
        await raw.paymentTransaction.deleteMany({ where: { applicationId: { in: ids } } }).catch(() => {});
        await raw.invoice.deleteMany({ where: { applicationId: { in: ids } } }).catch(() => {});
        await raw.quotation.deleteMany({ where: { applicationId: { in: ids } } }).catch(() => {});
        await raw.auditLog.deleteMany({ where: { resourceId: { in: ids } } }).catch(() => {});
        await raw.application.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
        await raw.notification.deleteMany({ where: { userId: { in: fx.userIds } } }).catch(() => {});
        await dropConsentRows(raw, { in: fx.userIds }).catch(() => {});
        await raw.entityMembership.deleteMany({ where: { entityId: fx.C } }).catch(() => {});
        await raw.entity.deleteMany({ where: { id: { in: [fx.C, ...(fx.otherEntities || [])] } } }).catch(() => {});
        await raw.user.deleteMany({ where: { id: { in: fx.userIds } } }).catch(() => {});
        await raw.organization.deleteMany({ where: { id: fx.org } }).catch(() => {});
        await raw.$disconnect();
    });

    test('D7: checkout without a milestone at DOC_APPROVED opens M2, and the webhook settles it', async () => {
        const id = await docApprovedWithAcceptedQuotation('D7');
        asApplicant();

        const res = await request(app).post('/api/payments/checkout').send({ applicationId: id });

        expect(res.status).toBe(200);
        expect(res.body.data.milestone).toBe('M2');
        const order = await raw.checkoutOrder.findUnique({ where: { id: res.body.data.checkoutOrderId } });
        expect(order.milestone).toBe('M2');

        await webhookSettles(order.id, 'D7');
        expect((await raw.checkoutOrder.findUnique({ where: { id: order.id } })).status).toBe('SETTLED');
        expect((await raw.application.findUnique({ where: { id } })).status).toBe('AUDIT_FEE_PAID');
    });

    test('D7: an explicit milestone is still validated against the state', async () => {
        const id = await docApprovedWithAcceptedQuotation('D7X');
        asApplicant();

        const wrong = await request(app).post('/api/payments/checkout').send({ applicationId: id, milestone: 'M1' });
        expect(wrong.status).toBe(409);
        expect(wrong.body.error).toBe('CHECKOUT_MILESTONE_NOT_PAYABLE');

        const unknown = await request(app).post('/api/payments/checkout').send({ applicationId: id, milestone: 'M9' });
        expect(unknown.status).toBe(400);
        expect(unknown.body.error).toBe('CHECKOUT_INVALID_MILESTONE');

        expect(await raw.checkoutOrder.count({ where: { applicationId: id, status: 'PENDING_PAYMENT' } })).toBe(0);
    });

    test('D7: with nothing payable and no milestone, the refusal is 409 and nothing is minted', async () => {
        const id = await docApprovedWithAcceptedQuotation('D7N');
        await raw.application.update({ where: { id }, data: { status: 'UNDER_REVIEW', formData: { workflowState: 'UNDER_REVIEW' } } });
        asApplicant();

        const res = await request(app).post('/api/payments/checkout').send({ applicationId: id });

        expect(res.status).toBe(409);
        expect(res.body.error).toBe('CHECKOUT_MILESTONE_NOT_PAYABLE');
        expect(await raw.checkoutOrder.count({ where: { applicationId: id, status: 'PENDING_PAYMENT' } })).toBe(0);
    });

    test('D8: after M2 settles on the checkout rail, inspection-starts answers 200', async () => {
        const id = await docApprovedWithAcceptedQuotation('D8');
        asApplicant();
        const pay = await request(app).post('/api/payments/checkout').send({ applicationId: id, milestone: 'M2' });
        expect(pay.status).toBe(200);
        await webhookSettles(pay.body.data.checkoutOrderId, 'D8');
        const invoice = await raw.invoice.findFirst({ where: { applicationId: id, serviceType: 'CERTIFICATION_CHECKOUT_M2', isDeleted: false } });
        expect(invoice.receiptNumber).toBeTruthy();

        await raw.application.update({
            where: { id },
            data: { status: 'AUDIT_CONFIRMED', auditorId: fx.I.id, formData: { workflowState: 'AUDIT_CONFIRMED' } },
        });
        asInspector();

        const res = await request(app).post(`/api/provider/auditor/applications/${id}/inspection-starts`).send({});

        expect(res.status).toBe(200);
        const after = await raw.application.findUnique({ where: { id } });
        expect(after.formData.auditExecution.startedAt).toBeTruthy();
    });

    test('D8: before the receipt exists, inspection-starts still refuses', async () => {
        const id = await docApprovedWithAcceptedQuotation('D8N');
        asApplicant();
        const pay = await request(app).post('/api/payments/checkout').send({ applicationId: id });
        expect(pay.status).toBe(200);
        await raw.application.update({
            where: { id },
            data: { status: 'AUDIT_CONFIRMED', auditorId: fx.I.id, formData: { workflowState: 'AUDIT_CONFIRMED' } },
        });
        asInspector();

        const res = await request(app).post(`/api/provider/auditor/applications/${id}/inspection-starts`).send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Receipt must be issued before inspection can start');
    });
    test('refund: a refunded M2 refuses inspection-starts', async () => {
        const { id, invoice } = await settledM2('RF1');
        await refund(invoice, 'COMPLETED');

        const res = await inspectionStarts(id);

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Receipt must be issued before inspection can start');
    });

    test('refund: a refunded M2 refuses the phase-2 schedule gate, a settled one passes', async () => {
        const settled = await settledM2('RF2');
        const refunded = await settledM2('RF3');
        await refund(refunded.invoice, 'INITIATED');

        expect(await isPhase2PaymentConfirmed({ id: settled.id })).toBe(true);
        expect(await isPhase2PaymentConfirmed({ id: refunded.id })).toBe(false);
    });

    test('refund: a CANCELLED refund leaves the receipt standing', async () => {
        const { id, invoice } = await settledM2('RF4');
        await refund(invoice, 'CANCELLED');

        const res = await inspectionStarts(id);

        expect(res.status).toBe(200);
    });

    test('F-1: a refunded M2 cannot be reused to reopen an application expired from CAR_PENDING', async () => {
        const { id, invoice } = await settledM2('WV1');
        await refund(invoice, 'COMPLETED');
        await expiredFromCar(id);

        const report = await batchReinstateWrongfulExpiry({
            applicationIds: [id], approver: financeApprover(), bugRef: `BUG-${sfx}`, dryRun: true,
        });

        expect(report.wouldReinstate).toEqual([]);
        expect(report.skipped.map((s) => s.code)).toEqual(['WAIVER_FEE_NOT_SETTLED']);
    });

    test('F-1: a settled M2 with no refund may be reused for the reopen', async () => {
        const { id } = await settledM2('WV2');
        await expiredFromCar(id);

        const report = await batchReinstateWrongfulExpiry({
            applicationIds: [id], approver: financeApprover(), bugRef: `BUG-${sfx}`, dryRun: true,
        });

        expect(report.skipped).toEqual([]);
        expect(report.wouldReinstate).toHaveLength(1);
    });
    test('refund: a fully refunded M2 reads as unpaid in the settlement source', async () => {
        const { id, invoice } = await settledM2('RF5');
        await refund(invoice, 'COMPLETED');

        const settlement = computePhaseSettlement(await invoiceService.listSettlementsForApplication(id), 'PHASE_2');

        expect(settlement).toMatchObject({ phasePaid: false, phaseRefunded: true, phaseReceiptIssued: false });
    });

    test('double payment: a settled M2 cannot be charged again, even if the state were walked back', async () => {
        const { id } = await settledM2('DP1');
        const counts = async () => ({
            orders: await raw.checkoutOrder.count({ where: { applicationId: id } }),
            invoices: await raw.invoice.count({ where: { applicationId: id } }),
            charges: await raw.paymentTransaction.count({ where: { applicationId: id } }),
        });
        const before = await counts();
        asApplicant();

        const settledState = await request(app).post('/api/payments/checkout').send({ applicationId: id, milestone: 'M2' });
        expect(settledState.status).toBe(409);
        expect(settledState.body.error).toBe('CHECKOUT_MILESTONE_NOT_PAYABLE');

        await raw.application.update({
            where: { id }, data: { status: 'PENDING_AUDIT_FEE', formData: { workflowState: 'PENDING_AUDIT_FEE' } },
        });
        const walkedBack = await request(app).post('/api/payments/checkout').send({ applicationId: id, milestone: 'M2' });
        expect(walkedBack.status).toBe(409);
        expect(walkedBack.body.error).toBe('CHECKOUT_MILESTONE_ALREADY_PAID');

        expect(await counts()).toEqual(before);
    });

    test('double payment: two concurrent checkouts for one milestone leave one open order', async () => {
        const id = await docApprovedWithAcceptedQuotation('DP2');
        asApplicant();

        const results = await Promise.all([1, 2, 3].map(() => request(app).post('/api/payments/checkout').send({ applicationId: id })));

        const ok = results.filter((r) => r.status === 200);
        expect(ok.length).toBeGreaterThanOrEqual(1);
        expect(new Set(ok.map((r) => r.body.data.checkoutOrderId)).size).toBe(1);
        results.filter((r) => r.status !== 200).forEach((r) => {
            expect(r.status).toBe(409);
            // A loser that lost the order insert hits the unique index; one that read the
            // winner's order before its intent was bound loses the compare-and-set instead.
            expect(['CHECKOUT_ALREADY_IN_PROGRESS', 'CHECKOUT_ORDER_CHANGED']).toContain(r.body.error);
        });
        expect(await raw.checkoutOrder.count({ where: { applicationId: id, status: 'PENDING_PAYMENT' } })).toBe(1);
        expect(await raw.invoice.count({ where: { applicationId: id, serviceType: 'CERTIFICATION_CHECKOUT_M2' } })).toBe(1);
        expect(await raw.paymentTransaction.count({ where: { applicationId: id } })).toBe(1);
    });

    test('control: a press that loses the race to record the SAME intent (one idempotency key) does not cancel it', async () => {
        const id = await docApprovedWithAcceptedQuotation('SAMEKEY');
        asApplicant();
        const realCreate = mockAdapter.createCheckoutSession;
        let second;
        const spy = jest.spyOn(mockAdapter, 'createCheckoutSession').mockImplementationOnce(async (args) => {
            const session = await realCreate(args);
            // A second press runs to the end while the first is still talking to the gateway.
            second = await request(app).post('/api/payments/checkout').send({ applicationId: id });
            return session;
        });
        let first;
        try {
            first = await request(app).post('/api/payments/checkout').send({ applicationId: id });
        } finally {
            spy.mockRestore();
        }
        expect(second.status).toBe(200);
        expect(first.status).toBe(409);
        expect(first.body.error).toBe('CHECKOUT_ORDER_CHANGED');
        const open = await raw.checkoutOrder.findFirst({ where: { applicationId: id, status: 'PENDING_PAYMENT' } });
        expect(open.stripePaymentIntentId).toBe(second.body.data.paymentIntentId);
        expect((await mockAdapter.getPaymentIntent(open.stripePaymentIntentId)).status).toBe('requires_payment_method');
    });

    test('control: the losing press keeps the winner\'s intent even when its own holder scope no longer reads the order', async () => {
        const id = await docApprovedWithAcceptedQuotation('OUTOFSCOPE');
        asApplicant();
        const other = (await raw.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัทอื่น ${sfx}`, organizationId: fx.org } })).id;
        fx.otherEntities = [...(fx.otherEntities || []), other];
        const realCreate = mockAdapter.createCheckoutSession;
        let second;
        const spy = jest.spyOn(mockAdapter, 'createCheckoutSession').mockImplementationOnce(async (args) => {
            const session = await realCreate(args);
            second = await request(app).post('/api/payments/checkout').send({ applicationId: id });
            // The filing moves to a holder outside the first press's scope before it records anything.
            await raw.application.update({ where: { id }, data: { entityId: other } });
            return session;
        });
        let first;
        try {
            first = await request(app).post('/api/payments/checkout').send({ applicationId: id });
        } finally {
            spy.mockRestore();
            await raw.application.update({ where: { id }, data: { entityId: fx.C } });
        }
        expect(second.status).toBe(200);
        expect(first.status).toBe(409);
        expect(first.body.error).toBe('CHECKOUT_ORDER_CHANGED');
        const open = await raw.checkoutOrder.findFirst({ where: { applicationId: id, status: 'PENDING_PAYMENT' } });
        expect(open.stripePaymentIntentId).toBe(second.body.data.paymentIntentId);
        expect((await mockAdapter.getPaymentIntent(open.stripePaymentIntentId)).status).toBe('requires_payment_method');
    });

    test('a press whose record write fails for a reason other than a refusal does not cancel the intent another press records', async () => {
        const id = await docApprovedWithAcceptedQuotation('RECORDFAIL');
        asApplicant();
        // The database refuses this application's intent write once: an infrastructure failure, not a
        // refusal that proves nobody can record the intent any more.
        const fn = `p2_refuse_record_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
        await raw.$executeRawUnsafe(`CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                IF NEW."applicationId" = '${id}' AND NEW.stripe_payment_intent_id IS DISTINCT FROM OLD.stripe_payment_intent_id THEN
                    RAISE EXCEPTION 'record refused';
                END IF;
                RETURN NEW;
            END $$`);
        await raw.$executeRawUnsafe(`CREATE TRIGGER ${fn} BEFORE UPDATE ON checkout_orders FOR EACH ROW EXECUTE FUNCTION ${fn}()`);
        let dropped = false;
        const drop = async () => {
            if (dropped) { return; }
            dropped = true;
            await raw.$executeRawUnsafe(`DROP TRIGGER ${fn} ON checkout_orders`);
            await raw.$executeRawUnsafe(`DROP FUNCTION ${fn}()`);
        };
        const realCancel = mockAdapter.cancelPaymentIntent;
        let second;
        const cancel = jest.spyOn(mockAdapter, 'cancelPaymentIntent').mockImplementationOnce(async (intentId) => {
            // Another press records the same intent (one idempotency key) after this press read
            // "nobody recorded it" and before its cancel lands.
            await drop();
            second = await request(app).post('/api/payments/checkout').send({ applicationId: id });
            return realCancel(intentId);
        });
        let first;
        try {
            first = await request(app).post('/api/payments/checkout').send({ applicationId: id });
        } finally {
            cancel.mockRestore();
            await drop();
        }
        if (!second) { second = await request(app).post('/api/payments/checkout').send({ applicationId: id }); }
        expect(first.status).toBe(500);
        expect(first.body?.data?.clientSecret).toBeUndefined();
        expect(second.status).toBe(200);
        const open = await raw.checkoutOrder.findFirst({ where: { applicationId: id, status: 'PENDING_PAYMENT' } });
        expect(open.stripePaymentIntentId).toBe(second.body.data.paymentIntentId);
        expect((await mockAdapter.getPaymentIntent(open.stripePaymentIntentId)).status).toBe('requires_payment_method');
    });

    test('an intent minted for a checkout that then answers 409 is cancelled, not left payable', async () => {
        const id = await docApprovedWithAcceptedQuotation('ORPHAN');
        asApplicant();
        const minted = [];
        const realCreate = mockAdapter.createCheckoutSession;
        const spy = jest.spyOn(mockAdapter, 'createCheckoutSession').mockImplementationOnce(async (args) => {
            const session = await realCreate(args);
            minted.push(session.id);
            // The applicant withdrew while the gateway was minting.
            await raw.application.update({ where: { id }, data: { status: 'CANCELLED', formData: { workflowState: 'CANCELLED' } } });
            return session;
        });
        try {
            const res = await request(app).post('/api/payments/checkout').send({ applicationId: id });
            expect(res.status).toBe(409);
        } finally {
            spy.mockRestore();
        }
        expect(minted).toHaveLength(1);
        expect((await mockAdapter.getPaymentIntent(minted[0])).status).toBe('canceled');
        const order = await raw.checkoutOrder.findFirst({ where: { applicationId: id } });
        expect(order.stripePaymentIntentId).toBeNull();
    });

    async function adminMarksAuditFeePaid(id) {
        await raw.application.update({
            where: { id }, data: { status: 'PENDING_AUDIT_FEE', formData: { workflowState: 'PENDING_AUDIT_FEE' } },
        });
        return writeApplicationStatus({
            prisma: raw, applicationId: id, fromStatus: 'PENDING_AUDIT_FEE', toStatus: 'AUDIT_FEE_PAID',
            actorId: fx.F.id, actorRole: 'system_admin_dtam', onAudit: false,
        });
    }

    test('order 20: the paid-state fence refuses AUDIT_FEE_PAID when the settled M2 was fully refunded', async () => {
        const { id, invoice } = await settledM2('FN1');
        await refund(invoice, 'COMPLETED');

        await expect(adminMarksAuditFeePaid(id)).rejects.toMatchObject({ code: 'PAYMENT_NOT_SETTLED', statusCode: 409 });
        expect((await raw.application.findUnique({ where: { id } })).status).toBe('PENDING_AUDIT_FEE');
    });

    test('order 20: the paid-state fence still lets a correction land on AUDIT_FEE_PAID when the M2 payment stands', async () => {
        const { id } = await settledM2('FN2');

        await adminMarksAuditFeePaid(id);

        expect((await raw.application.findUnique({ where: { id } })).status).toBe('AUDIT_FEE_PAID');
    });

    test('order 20: a refunded M2 is unpaid, so it is not waiting in the scheduling queue (one queue, order 27)', async () => {
        const settled = await settledM2('SQ1');
        const refunded = await settledM2('SQ2');
        await refund(refunded.invoice, 'BANK_TRANSFER_PENDING');

        const { items } = await getSchedulingQueue({ organizationId: fx.org });
        const paid = Object.fromEntries(items.map((item) => [item.applicationId, item.phase2Paid]));

        expect(paid[settled.id]).toBe(true);
        expect(refunded.id in paid).toBe(false);
    });
    const m1Invoice = (id) => raw.invoice.findFirst({ where: { applicationId: id, serviceType: 'CERTIFICATION_CHECKOUT_M1' } });

    test('N1: once M1 is fully refunded, the M2 checkout refuses before minting anything', async () => {
        const id = await docApprovedWithAcceptedQuotation('N1A');
        await refund(await m1Invoice(id), 'COMPLETED');
        asApplicant();

        const res = await request(app).post('/api/payments/checkout').send({ applicationId: id, milestone: 'M2' });

        expect(res.status).toBe(409);
        expect(res.body.error).toBe('MILESTONE_NOT_PAID');
        expect(await raw.checkoutOrder.count({ where: { applicationId: id, milestone: 'M2' } })).toBe(0);
    });

    test('N1: an M2 payment that lands after M1 was refunded is recorded, the status stays, and staff are alerted', async () => {
        const id = await docApprovedWithAcceptedQuotation('N1B');
        asApplicant();
        const pay = await request(app).post('/api/payments/checkout').send({ applicationId: id, milestone: 'M2' });
        expect(pay.status).toBe(200);
        await refund(await m1Invoice(id), 'COMPLETED');

        const outcome = await webhookSettles(pay.body.data.checkoutOrderId, 'N1B');

        expect(outcome.status).toBe('PROCESSED');
        const order = await raw.checkoutOrder.findUnique({ where: { id: pay.body.data.checkoutOrderId } });
        expect(order.status).toBe('SETTLED');
        const invoice = await raw.invoice.findUnique({ where: { id: order.invoiceId } });
        expect(invoice.status).toBe('paid');
        expect(invoice.receiptNumber).toBeTruthy();
        expect(await raw.journalEntry.count({ where: { sourceType: 'CHECKOUT_SETTLEMENT', sourceId: order.id } })).toBe(1);
        expect(await raw.checkoutDocument.count({ where: { checkoutOrderId: order.id, documentType: 'PLATFORM_TAX_INVOICE' } })).toBe(1);
        expect((await raw.application.findUnique({ where: { id } })).status).toBe('DOC_APPROVED');
        const alert = await raw.auditLog.findFirst({ where: { resourceId: id, action: 'SETTLEMENT_STATUS_REFUSED' } });
        expect(alert).toMatchObject({ severity: 'CRITICAL' });
        expect(JSON.parse(alert.metadata)).toMatchObject({ checkoutOrderId: order.id, milestone: 'M2', unpaidMilestones: ['M1'] });
        expect(await raw.notification.count({ where: { userId: fx.P.id, type: 'SETTLEMENT_STATUS_REFUSED' } })).toBe(1);

        expect(await webhookSettles(order.id, 'N1B-again')).toMatchObject({ status: 'PROCESSED' });
        expect(await raw.journalEntry.count({ where: { sourceType: 'CHECKOUT_SETTLEMENT', sourceId: order.id } })).toBe(1);
    });

    // A: a payment that settles after the application has moved on (or was cancelled) is
    // recorded in full, but it must not drag the status back to AUDIT_FEE_PAID or reopen it.
    async function openM2ThenMoveTo(label, status) {
        const id = await docApprovedWithAcceptedQuotation(label);
        asApplicant();
        const pay = await request(app).post('/api/payments/checkout').send({ applicationId: id, milestone: 'M2' });
        expect(pay.status).toBe(200);
        await raw.application.update({ where: { id }, data: { status, formData: { workflowState: status } } });
        return { id, orderId: pay.body.data.checkoutOrderId };
    }

    test.each([
        ['LATE-AC', 'AUDIT_CONFIRMED'],
        ['LATE-CX', 'CANCELLED'],
    ])('A: a late M2 settlement on an application now %s records the money, keeps the status, and alerts', async (label, status) => {
        const { id, orderId } = await openM2ThenMoveTo(label, status);

        const outcome = await webhookSettles(orderId, label);

        expect(outcome.status).toBe('PROCESSED');
        const order = await raw.checkoutOrder.findUnique({ where: { id: orderId } });
        expect(order.status).toBe('SETTLED');
        expect((await raw.invoice.findUnique({ where: { id: order.invoiceId } })).receiptNumber).toBeTruthy();
        expect(await raw.journalEntry.count({ where: { sourceType: 'CHECKOUT_SETTLEMENT', sourceId: order.id } })).toBe(1);
        expect((await raw.application.findUnique({ where: { id } })).status).toBe(status);
        const alert = await raw.auditLog.findFirst({ where: { resourceId: id, action: 'SETTLEMENT_STATUS_REFUSED' } });
        expect(alert).toMatchObject({ severity: 'CRITICAL' });
        expect(JSON.parse(alert.metadata)).toMatchObject({ checkoutOrderId: orderId, milestone: 'M2', currentStatus: status });
    });
});

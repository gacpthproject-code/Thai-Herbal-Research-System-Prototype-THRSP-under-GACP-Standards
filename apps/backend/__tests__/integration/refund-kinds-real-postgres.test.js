'use strict';

/**
 * Order 22 as amended (operator 2026-10-06), payment terms v1.2 §7. The company
 * refunds outside the system; finance records it here and a credit note is
 * issued. Two kinds:
 *
 *   duplicate charge      only the excess is credited; the milestone stays paid
 *                         and the application does not move.
 *   provider cancelled    the company or the state cancelled the service before
 *                         the paid milestone's service started: the whole
 *                         milestone is credited, it counts as unpaid, and the
 *                         application closes as CANCELLED. Refused once the
 *                         service started (§7.1).
 *
 * An applicant who cancels gets no refund kind at all. Real Postgres, real HTTP
 * doors; only authentication is attached by hand, the gateway is the mock adapter.
 */

process.env.PAYMENT_ADAPTER = 'mock';
process.env.STRIPE_CHECKOUT_ENABLED = 'true';

const { dropConsentRows } = require('../../test-support/consent-history');
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
jest.mock('../../services/notification-fanout-service', () => ({ send: jest.fn().mockResolvedValue({ sent: true }) }));

const fanout = require('../../services/notification-fanout-service');
const { getTemplateForType } = jest.requireActual('../../services/notification-fanout-service');
const { ConsentCategory, ConsentVersions } = require('../../middleware/consent-manager');
const quotationService = require('../../services/quotation-service');
const { issueQuotationOnSubmit } = require('../../services/quotation-issuance-on-submit');
const { settleEvent } = require('../../services/checkout/checkout-settlement-service');
const mockAdapter = require('../../services/payment/mock-payment-adapter');
const { isPhase2PaymentConfirmed } = require('../../shared/phase2-schedule-gate');
const invoiceService = require('../../services/invoice-service');
const { computePhaseSettlement } = require('../../services/phase-billing-service');
const { retireCheckoutOrderInTx, RETIRE_REASONS } = require('../../services/checkout/retire-checkout-order');
const { PROVIDER_CANCELLATION_REASONS, companyInspectionDeadline } = require('../../shared/refund-kinds');
const adminApplicationService = require('../../services/admin-application-service');
const { writeApplicationStatus } = require('../../services/application-status-writer');

d('order 22: duplicate-charge and provider-cancellation refunds (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    const sfx = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fx = { userIds: [], appIds: [], orgIds: [] };

    const mkUser = async (name, role) => {
        const id = crypto.randomUUID();
        const canonicalId = `rk-${name}-${sfx}`;
        await raw.user.create({
            data: {
                id, canonicalId, healthId: canonicalId, password: 'x', role, authType: 'EMAIL_LEGACY',
                email: `rk-${name}-${sfx}@example.test`, firstName: 'ทดสอบ', lastName: name, organizationId: fx.org,
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
    const asFinance = () => {
        mockActor.current = {
            id: fx.F.id, role: 'finance_officer_platform', canonicalRole: 'finance_officer_platform', organizationId: fx.org,
        };
    };

    async function quotedApplication(label) {
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-RK-${label}-${sfx}`, healthId: fx.A.canonicalId, areaType: 'OUTDOOR',
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
        return row.id;
    }

    async function webhookSettles(orderId, tag) {
        const order = await raw.checkoutOrder.findUnique({ where: { id: orderId } });
        const satang = Math.round(Number(order.totalPayableAmount) * 100);
        const eventId = `evt_rk_${tag}_${sfx}`;
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

    /**
     * An application where `milestone` is the next payment: M1 at PENDING_DOC_FEE; for
     * M2, M1 really paid through the gateway and the documents approved.
     */
    async function payableFor(label, milestone) {
        const id = await quotedApplication(label);
        if (milestone === 'M1') { return id; }
        asApplicant();
        const m1 = await request(app).post('/api/payments/checkout').send({ applicationId: id, milestone: 'M1' });
        expect(m1.status).toBe(200);
        await webhookSettles(m1.body.data.checkoutOrderId, `${label}m1`);
        // eslint-disable-next-line gacp/no-direct-application-status-write -- fixture: the documents approved
        await raw.application.update({
            where: { id }, data: { status: 'DOC_APPROVED', formData: { workflowState: 'DOC_APPROVED' } },
        });
        return id;
    }

    async function settled(label, milestone) {
        const id = await payableFor(label, milestone);
        asApplicant();
        const pay = await request(app).post('/api/payments/checkout').send({ applicationId: id, milestone });
        expect(pay.status).toBe(200);
        await webhookSettles(pay.body.data.checkoutOrderId, label);
        const invoice = await raw.invoice.findFirst({
            where: { applicationId: id, serviceType: `CERTIFICATION_CHECKOUT_${milestone}`, isDeleted: false },
        });
        expect(invoice.status).toBe('paid');
        return { id, invoice };
    }

    /**
     * The applicant pays one milestone twice: the first QR lapses and its order is
     * retired, the applicant pays a second order, and then the first payment
     * still arrives. The gateway settled two orders for one milestone.
     */
    async function paidTwice(label, milestone) {
        const id = await payableFor(label, milestone);
        asApplicant();
        const first = await request(app).post('/api/payments/checkout').send({ applicationId: id, milestone });
        expect(first.status).toBe(200);
        const lapsed = await raw.checkoutOrder.findUnique({ where: { id: first.body.data.checkoutOrderId } });
        await raw.$transaction((tx) => retireCheckoutOrderInTx(tx, { order: lapsed, reason: RETIRE_REASONS.INTENT_CANCELED }));
        const second = await request(app).post('/api/payments/checkout').send({ applicationId: id, milestone });
        expect(second.status).toBe(200);
        expect(second.body.data.checkoutOrderId).not.toBe(lapsed.id);
        await webhookSettles(second.body.data.checkoutOrderId, `${label}b`);
        await webhookSettles(lapsed.id, `${label}a`);
        const settledOrders = await raw.checkoutOrder.findMany({ where: { applicationId: id, milestone, status: 'SETTLED' } });
        expect(settledOrders).toHaveLength(2);
        const invoice = await raw.invoice.findFirst({
            where: { applicationId: id, serviceType: `CERTIFICATION_CHECKOUT_${milestone}`, isDeleted: false },
        });
        expect(invoice.status).toBe('paid');
        const extraInvoice = await raw.invoice.findUnique({ where: { id: lapsed.invoiceId } });
        expect(extraInvoice.id).not.toBe(invoice.id);
        return { id, invoice, extraInvoice, secondAmount: Number(settledOrders.find((o) => o.id === lapsed.id).totalPayableAmount) };
    }

    // eslint-disable-next-line gacp/no-direct-application-status-write -- fixture: put the filing where a case starts
    const moveTo = (id, status) => raw.application.update({
        where: { id }, data: { status, auditorId: fx.I.id, formData: { workflowState: status } },
    });

    function recordRefund(invoiceId, amount, idempotencyKey = crypto.randomUUID()) {
        asFinance();
        return request(app).post(`/api/finance/refunds/${invoiceId}/duplicate-charge`).send({ amount, idempotencyKey });
    }

    function recordCancellation(invoiceId, body = { reasonCode: 'COMPANY_STOPPED_SERVICE', note: 'บริษัทปิดบริการรับรองในพื้นที่นี้' }) {
        asFinance();
        return request(app).post(`/api/finance/refunds/${invoiceId}/provider-cancellation`).send(body);
    }

    const creditNotes = (invoiceId) => raw.creditNote.findMany({
        where: { originalInvoiceId: invoiceId, isDeleted: false }, orderBy: { createdAt: 'asc' },
    });
    const pause = (ms) => new Promise((r) => setTimeout(r, ms));
    const sumOf = (rows, field) => rows.reduce((sum, r) => sum + Number(r[field]), 0);
    const statusOf = async (id) => (await raw.application.findUnique({ where: { id } })).status;
    const phase = async (id, p) => computePhaseSettlement(await invoiceService.listSettlementsForApplication(id), p);

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        mockAdapter.__reset();
        fx.org = (await raw.organization.create({ data: { name: `rk-${sfx}`, slug: `rk-${sfx}`, code: `RK_${sfx}`.toUpperCase().slice(0, 24) } })).id;
        fx.A = await mkUser('a', 'health');
        fx.I = await mkUser('i', 'field_inspector');
        fx.F = await mkUser('f', 'finance_officer_platform');
        fx.R = await mkUser('r', 'document_reviewer');
        await raw.user.update({ where: { id: fx.R.id }, data: { accountType: 'PROVIDER', status: 'ACTIVE' } });
        fx.C = (await raw.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท rk ${sfx} จำกัด`, organizationId: fx.org } })).id;
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
        app.use('/api/finance/refunds', require('../../routes/api/finance/refunds'));
        app.use('/api/finance/credit-notes', require('../../routes/api/finance/credit-notes'));
        app.use('/api/provider/auditor', require('../../routes/api/provider/auditor'));
        app.use('/api/provider/scheduler', require('../../routes/api/provider/scheduler'));
        app.use('/api/provider/applications', require('../../routes/api/provider/applications'));
        app.use('/api/provider/admin', require('../../routes/api/provider/admin'));
        app.use('/api/audit/onsite', require('../../routes/api/audit/onsite'));
    });

    afterAll(async () => {
        if (!raw) { return; }
        const ids = fx.appIds;
        const orders = await raw.checkoutOrder.findMany({ where: { applicationId: { in: ids } } }).catch(() => []);
        const invoiceIds = (await raw.invoice.findMany({ where: { applicationId: { in: ids } }, select: { id: true } })
            .catch(() => [])).map((i) => i.id);
        const eventIds = (await raw.stripeWebhookEvent.findMany({ where: { id: { startsWith: 'evt_rk_' } }, select: { id: true } })
            .catch(() => [])).map((e) => e.id).filter((id) => id.endsWith(sfx));
        await raw.stripeWebhookEvent.deleteMany({ where: { id: { in: eventIds } } }).catch(() => {});
        await raw.creditNote.deleteMany({ where: { originalInvoiceId: { in: invoiceIds } } }).catch(() => {});
        await raw.journalEntry?.deleteMany({ where: { applicationId: { in: ids } } }).catch(() => {});
        await raw.checkoutDocument?.deleteMany({ where: { checkoutOrderId: { in: orders.map((o) => o.id) } } }).catch(() => {});
        await raw.checkoutOrder.deleteMany({ where: { applicationId: { in: ids } } }).catch(() => {});
        await raw.invoiceLineItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } }).catch(() => {});
        await raw.paymentTransaction.deleteMany({ where: { applicationId: { in: ids } } }).catch(() => {});
        await raw.invoice.deleteMany({ where: { applicationId: { in: ids } } }).catch(() => {});
        await raw.quotation.deleteMany({ where: { applicationId: { in: ids } } }).catch(() => {});
        await raw.auditLog.deleteMany({ where: { resourceId: { in: ids } } }).catch(() => {});
        await raw.auditChecklist.deleteMany({ where: { applicationId: { in: ids } } }).catch(() => {});
        await raw.workActivity.deleteMany({ where: { applicationId: { in: ids } } }).catch(() => {});
        await raw.notification.deleteMany({ where: { userId: { in: fx.userIds } } }).catch(() => {});
        await raw.application.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
        await dropConsentRows(raw, { in: fx.userIds }).catch(() => {});
        await raw.entityMembership.deleteMany({ where: { entityId: fx.C } }).catch(() => {});
        await raw.entity.deleteMany({ where: { id: fx.C } }).catch(() => {});
        await raw.user.deleteMany({ where: { id: { in: fx.userIds } } }).catch(() => {});
        await raw.organization.deleteMany({ where: { id: { in: [fx.org, ...fx.orgIds] } } }).catch(() => {});
        await raw.$disconnect();
    });

    const noticesFor = (invoiceId) => fanout.send.mock.calls
        .map(([arg]) => arg)
        .filter((arg) => arg.payload?.invoiceId === invoiceId);

    test('only the excess is credited, the status does not move, M2 stays paid and the inspection gates still pass', async () => {
        const { id, invoice, extraInvoice } = await paidTwice('D1', 'M2');

        const res = await recordRefund(invoice.id, 1000);

        expect(res.status).toBe(201);
        expect(await statusOf(id)).toBe('AUDIT_FEE_PAID');
        expect(await phase(id, 'PHASE_2')).toMatchObject({ phasePaid: true, phaseRefunded: false, phaseReceiptIssued: true });
        expect(await isPhase2PaymentConfirmed({ id })).toBe(true);
        expect(await creditNotes(invoice.id)).toEqual([]);
        const notes = await creditNotes(extraInvoice.id);
        expect(notes).toHaveLength(1);
        expect(notes[0]).toMatchObject({ status: 'POSTED', reasonCode: 'CORRECTION' });
        expect(Number(notes[0].totalAmount)).toBe(1000);
        expect(Number(notes[0].vat)).toBe(65.42);
        expect(Number(notes[0].subtotal)).toBe(934.58);
        const meta = (await raw.invoice.findUnique({ where: { id: invoice.id } })).metadata;
        expect(meta.refund).toBeUndefined();
        expect(meta.duplicateChargeRefunds).toEqual([
            expect.objectContaining({ creditNoteId: notes[0].id, chargeInvoiceId: extraInvoice.id, amount: 1000, recordedBy: fx.F.id }),
        ]);
        expect(noticesFor(invoice.id)).toEqual([expect.objectContaining({
            type: 'REFUND_DUPLICATE_CHARGE',
            // The mock rail settles with no livemode, recorded as a test-mode settlement: the notice says so.
            payload: expect.objectContaining({ amount: 1000, creditNoteNumber: notes[0].creditNoteNumber, invoiceNumber: invoice.invoiceNumber, paymentMode: 'TRIAL' }),
        })]);

        await moveTo(id, 'AUDIT_CONFIRMED');
        asInspector();
        const starts = await request(app).post(`/api/provider/auditor/applications/${id}/inspection-starts`).send({});
        expect(starts.status).toBe(200);
    });

    test('an M1 paid twice: exactly the second payment is refundable, DOC_FEE_PAID and M1 paid stay', async () => {
        const { id, invoice, extraInvoice, secondAmount } = await paidTwice('D2', 'M1');

        const over = await recordRefund(invoice.id, secondAmount + 0.01);
        const exact = await recordRefund(invoice.id, secondAmount);

        expect(over.status).toBe(409);
        expect(over.body.error).toBe('REFUND_EXCEEDS_REMAINING');
        expect(exact.status).toBe(201);
        expect(await statusOf(id)).toBe('DOC_FEE_PAID');
        expect(await phase(id, 'PHASE_1')).toMatchObject({ phasePaid: true, phaseRefunded: false });
        expect((await creditNotes(extraInvoice.id)).map((n) => Number(n.totalAmount))).toEqual([secondAmount]);
        expect((await recordRefund(invoice.id, 0.01)).body.error).toBe('REFUND_EXCEEDS_REMAINING');
    });

    test.each(['M1', 'M2'])('a %s paid once has no excess: any duplicate-charge refund is refused and nothing is written', async (milestone) => {
        const { id, invoice } = await settled(`SO${milestone}`, milestone);

        for (const amount of [0.01, Number(invoice.totalAmount)]) {
            const res = await recordRefund(invoice.id, amount);
            expect(res.status).toBe(409);
            expect(res.body.error).toBe('REFUND_EXCEEDS_REMAINING');
        }
        expect(await creditNotes(invoice.id)).toEqual([]);
        expect((await raw.invoice.findUnique({ where: { id: invoice.id } })).metadata?.duplicateChargeRefunds).toBeUndefined();
        expect(await statusOf(id)).toBe(milestone === 'M1' ? 'DOC_FEE_PAID' : 'AUDIT_FEE_PAID');
        expect(fanout.send.mock.calls.filter(([arg]) => arg.payload?.invoiceId === invoice.id)).toEqual([]);
    });

    test.each([
        ['zero', 0],
        ['negative', -5],
        ['not a number', 'abc'],
        ['a numeric string', '100'],
        ['missing', undefined],
        ['a fraction of a satang', 10.005],
    ])('an invalid amount (%s) is refused and nothing is written', async (label, amount) => {
        const { id, invoice } = await settled(`DI${label.replace(/\W/g, '')}`, 'M2');

        const res = await recordRefund(invoice.id, amount);

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('REFUND_AMOUNT_INVALID');
        expect(await creditNotes(invoice.id)).toEqual([]);
        expect(await statusOf(id)).toBe('AUDIT_FEE_PAID');
    });

    test('a refund beyond the excess not yet refunded is refused', async () => {
        const { id, invoice, extraInvoice } = await paidTwice('X1', 'M2');
        const total = Number(extraInvoice.totalAmount);

        const over = await recordRefund(invoice.id, total + 0.01);
        expect(over.status).toBe(409);
        expect(over.body.error).toBe('REFUND_EXCEEDS_REMAINING');

        expect((await recordRefund(invoice.id, total - 100)).status).toBe(201);
        const beyond = await recordRefund(invoice.id, 100.01);
        expect(beyond.status).toBe(409);
        expect(beyond.body.error).toBe('REFUND_EXCEEDS_REMAINING');
        expect((await recordRefund(invoice.id, 100)).status).toBe(201);

        const notes = await creditNotes(extraInvoice.id);
        expect(notes.map((n) => Number(n.totalAmount))).toEqual([total - 100, 100]);
        expect(notes.reduce((sum, n) => sum + Number(n.subtotal), 0)).toBeCloseTo(Number(extraInvoice.subtotal), 2);
        expect(notes.reduce((sum, n) => sum + Number(n.vat), 0)).toBeCloseTo(Number(extraInvoice.vat), 2);
        expect((await recordRefund(invoice.id, 0.01)).body.error).toBe('REFUND_EXCEEDS_REMAINING');
        expect(await statusOf(id)).toBe('AUDIT_FEE_PAID');
    });

    test('the same request twice records one refund; two concurrent requests with one key record one refund', async () => {
        const { invoice, extraInvoice } = await paidTwice('R1', 'M2');

        const first = await recordRefund(invoice.id, 500, 'key-once');
        const again = await recordRefund(invoice.id, 500, 'key-once');
        expect(first.status).toBe(201);
        expect(again.status).toBe(200);
        expect(again.body.data.creditNoteId).toBe(first.body.data.creditNoteId);

        const racing = await Promise.all([1, 2].map(() => recordRefund(invoice.id, 700, 'key-race')));
        expect(racing.map((r) => r.status).sort()).toEqual([200, 201]);
        expect(await creditNotes(extraInvoice.id)).toHaveLength(2);
    });

    test('a request with no idempotency key is refused', async () => {
        const { invoice } = await settled('K1', 'M2');
        asFinance();

        const res = await request(app).post(`/api/finance/refunds/${invoice.id}/duplicate-charge`).send({ amount: 100 });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('REFUND_IDEMPOTENCY_KEY_REQUIRED');
        expect(await creditNotes(invoice.id)).toEqual([]);
    });

    test('the full-invoice refund door is gone', async () => {
        const { invoice } = await settled('G1', 'M2');
        asFinance();

        const res = await request(app).post(`/api/finance/refunds/${invoice.id}/initiate`).send({ reason: 'ยกเลิก', reasonCode: 'CANCELLATION' });

        expect(res.status).toBe(404);
        expect(await creditNotes(invoice.id)).toEqual([]);
    });
    test('provider cancellation before document review: the whole M1 is credited, M1 is unpaid, the application is CANCELLED', async () => {
        const { id, invoice } = await settled('P1', 'M1');

        const res = await recordCancellation(invoice.id, { reasonCode: 'DEPARTMENT_STOPPED_CERTIFYING', note: 'กรมแจ้งหยุดรับรองพืชชนิดนี้' });

        expect(res.status).toBe(201);
        expect(res.body.data.kind).toBe('PROVIDER_CANCELLED');
        expect(await statusOf(id)).toBe('CANCELLED');
        expect(await phase(id, 'PHASE_1')).toMatchObject({ phasePaid: false, phaseRefunded: true });
        const notes = await creditNotes(invoice.id);
        expect(notes).toHaveLength(1);
        expect(notes[0]).toMatchObject({ status: 'POSTED', reasonCode: 'CANCELLATION' });
        // L1: the credit note goes to the applicant; it prints the closed-list reason only.
        expect(notes[0].reason).toBe(`ยกเลิกการให้บริการ: ${PROVIDER_CANCELLATION_REASONS.DEPARTMENT_STOPPED_CERTIFYING}`);
        expect(Number(notes[0].subtotal)).toBe(Number(invoice.subtotal));
        expect(Number(notes[0].vat)).toBe(Number(invoice.vat));
        expect(Number(notes[0].totalAmount)).toBe(Number(invoice.totalAmount));
        const meta = (await raw.invoice.findUnique({ where: { id: invoice.id } })).metadata;
        expect(meta.refund).toMatchObject({
            kind: 'PROVIDER_CANCELLED', status: 'INITIATED', reasonCode: 'DEPARTMENT_STOPPED_CERTIFYING',
            note: 'กรมแจ้งหยุดรับรองพืชชนิดนี้', creditNoteId: notes[0].id, milestone: 'M1',
        });
        const application = await raw.application.findUnique({ where: { id } });
        expect(noticesFor(invoice.id)).toEqual([expect.objectContaining({
            type: 'REFUND_PROVIDER_CANCELLED',
            payload: expect.objectContaining({
                reasonCode: 'DEPARTMENT_STOPPED_CERTIFYING', applicationNumber: application.applicationNumber,
                amount: Number(invoice.totalAmount), creditNoteNumber: notes[0].creditNoteNumber, paymentMode: 'TRIAL',
            }),
        })]);
    });

    test('provider cancellation at AUDIT_CONFIRMED before the inspection starts: M2 is unpaid, scheduling refuses, a second call is the same record', async () => {
        const { id, invoice } = await settled('P2', 'M2');
        await moveTo(id, 'AUDIT_CONFIRMED');

        const first = await recordCancellation(invoice.id);
        const again = await recordCancellation(invoice.id);

        expect(first.status).toBe(201);
        expect(again.status).toBe(200);
        expect(again.body.data.creditNoteId).toBe(first.body.data.creditNoteId);
        expect(await creditNotes(invoice.id)).toHaveLength(1);
        expect(await statusOf(id)).toBe('CANCELLED');
        expect(await phase(id, 'PHASE_2')).toMatchObject({ phasePaid: false });
        expect(await isPhase2PaymentConfirmed({ id })).toBe(false);
    });

    test('provider cancellation is refused once the milestone service started (§7.1), and nothing is written', async () => {
        const reviewing = await settled('S1', 'M1');
        await moveTo(reviewing.id, 'ASSIGNED_FOR_REVIEW');
        const inspecting = await settled('S2', 'M2');
        await moveTo(inspecting.id, 'AUDIT_CONFIRMED');
        asInspector();
        expect((await request(app).post(`/api/provider/auditor/applications/${inspecting.id}/inspection-starts`).send({})).status).toBe(200);

        for (const [id, invoiceId, status] of [
            [reviewing.id, reviewing.invoice.id, 'ASSIGNED_FOR_REVIEW'],
            [inspecting.id, inspecting.invoice.id, 'AUDIT_CONFIRMED'],
        ]) {
            const res = await recordCancellation(invoiceId);
            expect(res.status).toBe(409);
            expect(res.body.error).toBe('REFUND_SERVICE_ALREADY_STARTED');
            expect(await statusOf(id)).toBe(status);
            expect(await creditNotes(invoiceId)).toEqual([]);
        }
    });

    test('provider cancellation needs a reason from the list and a note', async () => {
        const { id, invoice } = await settled('N1', 'M1');

        const noReason = await recordCancellation(invoice.id, { note: 'บริษัทปิดบริการรับรองในพื้นที่นี้' });
        const badReason = await recordCancellation(invoice.id, { reasonCode: 'APPLICANT_ASKED', note: 'ผู้ยื่นขอยกเลิกเอง' });
        const noNote = await recordCancellation(invoice.id, { reasonCode: 'COMPANY_STOPPED_SERVICE', note: ' ' });

        expect(noReason.body.error).toBe('REFUND_CANCELLATION_REASON_INVALID');
        expect(badReason.body.error).toBe('REFUND_CANCELLATION_REASON_INVALID');
        expect(noNote.body.error).toBe('REFUND_CANCELLATION_NOTE_REQUIRED');
        expect([noReason.status, badReason.status, noNote.status]).toEqual([400, 400, 400]);
        expect(await statusOf(id)).toBe('DOC_FEE_PAID');
        expect(await creditNotes(invoice.id)).toEqual([]);
    });

    describe('V1: a duplicate payment is its own taxed charge and is refunded against its own tax invoice', () => {
        test('the late payment issued its own tax invoice; the duplicate refund credits it and leaves the milestone invoice whole', async () => {
            const { invoice, extraInvoice, secondAmount } = await paidTwice('V0', 'M2');
            expect(extraInvoice).toMatchObject({ status: 'paid', isDeleted: true });
            expect(extraInvoice.receiptNumber).toBeTruthy();
            expect(extraInvoice.receiptNumber).not.toBe(invoice.receiptNumber);
            const extraTaxInvoice = await raw.checkoutDocument.findFirst({ where: { checkoutOrder: { invoiceId: extraInvoice.id } } });
            expect(extraTaxInvoice).toMatchObject({ documentType: 'PLATFORM_TAX_INVOICE', documentNumber: extraInvoice.receiptNumber });

            expect((await recordRefund(invoice.id, secondAmount)).status).toBe(201);

            const notes = await creditNotes(extraInvoice.id);
            expect(notes.map((n) => [Number(n.subtotal), Number(n.vat)])).toEqual([[Number(extraInvoice.subtotal), Number(extraInvoice.vat)]]);
            expect(await creditNotes(invoice.id)).toEqual([]);
        });

        test.each([
            ['duplicate first', ['duplicate', 'cancel']],
            ['cancellation first', ['cancel', 'duplicate']],
        ])('paid 2X, refund the duplicate X and cancel X: 2X is credited in total (%s)', async (label, steps) => {
            const { id, invoice, extraInvoice, secondAmount } = await paidTwice(`V${label[0]}`, 'M2');
            const X = Number(invoice.totalAmount);
            expect(secondAmount).toBe(X);

            for (const step of steps) {
                const res = step === 'duplicate' ? await recordRefund(invoice.id, X) : await recordCancellation(invoice.id);
                expect([step, res.status]).toEqual([step, 201]);
            }

            const all = [...await creditNotes(invoice.id), ...await creditNotes(extraInvoice.id)];
            expect(sumOf(all, 'totalAmount')).toBeCloseTo(2 * X, 2);
            expect((await creditNotes(invoice.id)).map((n) => n.reasonCode)).toEqual(['CANCELLATION']);
            expect((await creditNotes(extraInvoice.id)).map((n) => n.reasonCode)).toEqual(['CORRECTION']);
            expect(await statusOf(id)).toBe('CANCELLED');
            const after = await recordRefund(invoice.id, 0.01);
            expect([after.status, after.body.error]).toEqual([409, 'REFUND_EXCEEDS_REMAINING']);
        });

        test.each(['before', 'after'])('one satang over the extra payment is refused %s the cancellation, and nothing is written', async (when) => {
            const { invoice, extraInvoice } = await paidTwice(`VO${when}`, 'M2');
            const X = Number(invoice.totalAmount);
            if (when === 'after') { expect((await recordCancellation(invoice.id)).status).toBe(201); }

            const over = await recordRefund(invoice.id, X + 0.01);

            expect([over.status, over.body.error]).toEqual([409, 'REFUND_EXCEEDS_REMAINING']);
            expect(await creditNotes(extraInvoice.id)).toEqual([]);
        });
    });

    describe('H1: refunds are company money, each role stays in its own organization', () => {
        let otherOrg;
        beforeAll(async () => {
            otherOrg = (await raw.organization.create({ data: { name: `rk2-${sfx}`, slug: `rk2-${sfx}`, code: `RK2_${sfx}`.toUpperCase().slice(0, 24) } })).id;
            fx.orgIds.push(otherOrg);
        });
        const as = (role, organizationId) => {
            mockActor.current = { id: crypto.randomUUID(), role, canonicalRole: role, organizationId };
        };
        const writeDoors = (invoiceId) => [
            () => request(app).post(`/api/finance/refunds/${invoiceId}/duplicate-charge`).send({ amount: 1, idempotencyKey: crypto.randomUUID() }),
            () => request(app).post(`/api/finance/refunds/${invoiceId}/provider-cancellation`)
                .send({ reasonCode: 'COMPANY_STOPPED_SERVICE', note: 'บริษัทปิดบริการรับรองในพื้นที่นี้' }),
        ];

        // Another organization's invoice answers as a missing one (R2-L2): a 403 there confirmed
        // that the id exists. The role refusal and the caller with no organization stay 403.
        test.each([
            ['system_admin_dtam', 'own', 403, 'FORBIDDEN_ROLE'],
            ['system_admin_dtam', 'other', 403, 'FORBIDDEN_ROLE'],
            ['finance_officer_dtam', 'own', 403, 'FORBIDDEN_ROLE'],
            ['system_admin_platform', 'other', 403, 'FORBIDDEN_ROLE'],
            ['finance_officer_platform', 'other', 404, 'INVOICE_NOT_FOUND'],
            ['finance_officer_platform', 'none', 403, 'FORBIDDEN_TENANT'],
        ])('%s (%s organization) cannot record any refund', async (role, where, status, code) => {
            const { id, invoice } = await paidTwice(`W${role.replace(/_/g, '')}${where}`, 'M1');
            for (const door of writeDoors(invoice.id)) {
                as(role, { own: fx.org, other: otherOrg, none: undefined }[where]);
                const res = await door();
                expect([res.status, res.body.error]).toEqual([status, code]);
            }
            expect(await creditNotes(invoice.id)).toEqual([]);
            expect(await statusOf(id)).toBe('DOC_FEE_PAID');
        });

        test.each([
            ['system_admin_dtam', 'other', 404, 'INVOICE_NOT_FOUND'],
            ['finance_officer_dtam', 'other', 404, 'INVOICE_NOT_FOUND'],
            ['finance_officer_platform', 'other', 404, 'INVOICE_NOT_FOUND'],
            ['system_admin_dtam', 'own', 200, null],
            ['finance_officer_dtam', 'own', 200, null],
            ['finance_officer_platform', 'none', 403, 'FORBIDDEN_TENANT'],
            // The platform admin is not a finance reader at all; every finance read set stays one set.
            ['system_admin_platform', 'other', 403, 'FORBIDDEN_ROLE'],
        ])('%s reads refund status in the %s organization: %s', async (role, where, status, code) => {
            const { invoice } = await settled(`RD${role.replace(/_/g, '')}${where}`, 'M1');
            as(role, { own: fx.org, other: otherOrg, none: undefined }[where]);
            const res = await request(app).get(`/api/finance/refunds/${invoice.id}/status`);
            expect(res.status).toBe(status);
            if (code) {
                expect(res.body.error).toBe(code);
            } else {
                expect(res.body.data.invoiceId).toBe(invoice.id);
            }
        });
    });

    describe('H-1: the manual credit-note door is the company finance officer\'s, in its own organization, and only adjusts', () => {
        let otherOrg;
        beforeAll(async () => {
            otherOrg = (await raw.organization.create({ data: { name: `rk3-${sfx}`, slug: `rk3-${sfx}`, code: `RK3_${sfx}`.toUpperCase().slice(0, 24) } })).id;
            fx.orgIds.push(otherOrg);
        });
        const as = (role, organizationId) => {
            mockActor.current = { id: crypto.randomUUID(), role, canonicalRole: role, organizationId };
        };
        const adjustment = (invoiceId, extra = {}) => request(app).post('/api/finance/credit-notes').send({
            originalInvoiceId: invoiceId, reasonCode: 'PRICE_REDUCTION', reason: 'ลดราคาตามที่ตกลง', subtotal: 100, vat: 7, ...extra,
        });

        // Another organization's invoice answers as a missing one (R2-L2): a 403 there confirmed
        // that the id exists. The role refusal and the caller with no organization stay 403.
        test.each([
            ['system_admin_dtam', 'own', 403, 'FORBIDDEN_ROLE'],
            ['system_admin_dtam', 'other', 403, 'FORBIDDEN_ROLE'],
            ['finance_officer_platform', 'none', 403, 'FORBIDDEN_TENANT'],
            ['finance_officer_platform', 'other', 404, 'INVOICE_NOT_FOUND'],
        ])('%s (%s organization) cannot write a credit note, and nothing is written', async (role, where, status, code) => {
            const { invoice } = await settled(`CW${role.replace(/_/g, '')}${where}`, 'M1');
            as(role, { own: fx.org, other: otherOrg, none: undefined }[where]);

            const res = await adjustment(invoice.id);

            expect([res.status, res.body.error]).toEqual([status, code]);
            expect(await creditNotes(invoice.id)).toEqual([]);
        });

        test('the note belongs to the invoice\'s organization whatever organizationId the body sends', async () => {
            const { invoice } = await settled('CO', 'M1');
            asFinance();

            const res = await adjustment(invoice.id, { organizationId: otherOrg });

            expect(res.status).toBe(201);
            expect((await creditNotes(invoice.id)).map((n) => n.organizationId)).toEqual([fx.org]);
        });

        test('a CANCELLATION note is refused here: a cancellation is a refund kind, and the milestone stays paid', async () => {
            const { id, invoice } = await settled('CC', 'M1');
            asFinance();

            const res = await adjustment(invoice.id, { reasonCode: 'CANCELLATION', reason: 'ยกเลิกบริการ' });

            expect([res.status, res.body.error]).toEqual([409, 'CREDIT_NOTE_CANCELLATION_VIA_REFUND']);
            expect(await creditNotes(invoice.id)).toEqual([]);
            expect(await phase(id, 'PHASE_1')).toMatchObject({ phasePaid: true });
        });

        test('a note crediting everything left is refused at create, and two drafts that together would are refused at issue', async () => {
            const { invoice } = await settled('CF', 'M1');
            const half = { subtotal: Number(invoice.subtotal) / 2, vat: Number(invoice.vat) / 2 };
            asFinance();

            const whole = await adjustment(invoice.id, { reasonCode: 'CORRECTION', subtotal: Number(invoice.subtotal), vat: Number(invoice.vat) });
            expect([whole.status, whole.body.error]).toEqual([409, 'CREDIT_NOTE_FULL_CREDIT_VIA_REFUND']);

            const a = await adjustment(invoice.id, half);
            const b = await adjustment(invoice.id, half);
            expect([a.status, b.status]).toEqual([201, 201]);
            expect((await request(app).post(`/api/finance/credit-notes/${a.body.data.id}/issue`).send({})).status).toBe(200);
            const second = await request(app).post(`/api/finance/credit-notes/${b.body.data.id}/issue`).send({});
            expect([second.status, second.body.error]).toEqual([409, 'CREDIT_NOTE_FULL_CREDIT_VIA_REFUND']);
        });

        test('a manual note waits for a refund holding the invoice, then counts what the refund credited', async () => {
            const { invoice } = await settled('CL', 'M1');
            let release;
            let locked;
            const gate = new Promise((r) => { release = r; });
            const isLocked = new Promise((r) => { locked = r; });
            const refund = raw.$transaction(async (tx) => {
                await tx.$queryRaw`SELECT id FROM "invoices" WHERE id = ${invoice.id} FOR UPDATE`;
                await tx.creditNote.create({
                    data: {
                        originalInvoiceId: invoice.id, reason: 'คืนเงินที่ชำระซ้ำ', reasonCode: 'CORRECTION', status: 'ISSUED',
                        subtotal: Number(invoice.subtotal) - 50, vat: Number(invoice.vat) - 3.5,
                        totalAmount: Number(invoice.totalAmount) - 53.5, organizationId: fx.org,
                    },
                });
                locked();
                await gate;
            }, { timeout: 30000 });
            await isLocked;

            asFinance();
            const pending = adjustment(invoice.id).then((r) => r);
            await new Promise((r) => setTimeout(r, 1500));
            release();
            await refund;
            const res = await pending;

            expect([res.status, res.body.error]).toEqual([400, 'EXCEEDS_INVOICE_SUBTOTAL']);
            expect((await creditNotes(invoice.id)).map((n) => n.status)).toEqual(['ISSUED']);
        });
    });

    describe('M1: a CANCELLED application with a refund is not reopened by an admin hatch', () => {
        test('revert-last-transition and force-status both refuse, and the status stays CANCELLED', async () => {
            const { id, invoice } = await settled('AR', 'M2');
            await moveTo(id, 'AUDIT_CONFIRMED');
            expect((await recordCancellation(invoice.id)).status).toBe(201);
            await raw.application.update({
                where: { id },
                data: { workflowHistory: [{ action: 'REFUND_PROVIDER_CANCELLED', fromStatus: 'AUDIT_CONFIRMED', toStatus: 'CANCELLED', timestamp: new Date().toISOString() }] },
            });
            const admin = { actorId: crypto.randomUUID(), actorRole: 'system_admin_dtam' };

            await expect(adminApplicationService.revertLastTransition({
                applicationId: id, reason: 'แก้สถานะที่ยกเลิกผิดพลาด', ...admin,
            })).rejects.toMatchObject({ status: 409, code: 'APPLICATION_REFUNDED_CANCELLED' });
            await expect(adminApplicationService.forceTransitionStatus({
                applicationId: id, toStatus: 'AUDIT_CONFIRMED', reasonCode: 'DATA_CORRECTION',
                reason: 'แก้สถานะที่ยกเลิกผิดพลาด', ...admin,
            })).rejects.toMatchObject({ status: 409, code: 'APPLICATION_REFUNDED_CANCELLED' });

            expect(await statusOf(id)).toBe('CANCELLED');
            expect(await phase(id, 'PHASE_2')).toMatchObject({ phasePaid: false });
        });

        test('revert refuses a target force-status refuses (a paid state the gateway alone writes)', async () => {
            const { id } = await settled('AT', 'M1');
            // eslint-disable-next-line gacp/no-direct-application-status-write -- fixture: the history an admin revert reads
            await raw.application.update({
                where: { id },
                data: {
                    status: 'ASSIGNED_FOR_REVIEW',
                    workflowHistory: [{ action: 'ASSIGN_REVIEWER', fromStatus: 'DOC_FEE_PAID', toStatus: 'ASSIGNED_FOR_REVIEW', timestamp: new Date().toISOString() }],
                },
            });

            await expect(adminApplicationService.revertLastTransition({
                applicationId: id, reason: 'ย้อนการมอบหมายที่ผิดพลาด', actorId: crypto.randomUUID(), actorRole: 'system_admin_dtam',
            })).rejects.toMatchObject({ status: 409, code: 'REVERT_TARGET_FORBIDDEN' });
            expect(await statusOf(id)).toBe('ASSIGNED_FOR_REVIEW');
        });
    });

    describe('M2: the "service not started" check and the service start cannot interleave', () => {
        /** Hold the application row inside an open transaction until released. */
        function holdRow(id, data) {
            let release;
            let locked;
            const gate = new Promise((r) => { release = r; });
            const isLocked = new Promise((r) => { locked = r; });
            const done = raw.$transaction(async (tx) => {
                await tx.application.update({ where: { id }, data });
                locked();
                await gate;
            }, { timeout: 30000 });
            return { isLocked, release: async () => { release(); await done; } };
        }

        test('an inspection start that commits while the cancellation waits wins: the cancellation is refused', async () => {
            const { id, invoice } = await settled('RC1', 'M2');
            await moveTo(id, 'AUDIT_CONFIRMED');
            const started = { workflowState: 'AUDIT_CONFIRMED', auditExecution: { startedAt: new Date().toISOString(), startedBy: fx.I.id } };
            const hold = holdRow(id, { formData: started });
            await hold.isLocked;

            // supertest fires on then(), so start the request now, while the row is held.
            const pending = recordCancellation(invoice.id).then((r) => r);
            await pause(1500);
            await hold.release();
            const res = await pending;

            expect(res.status).toBe(409);
            expect(res.body.error).toBe('REFUND_SERVICE_ALREADY_STARTED');
            expect(await statusOf(id)).toBe('AUDIT_CONFIRMED');
            expect(await creditNotes(invoice.id)).toEqual([]);
        });

        test('a cancellation that commits while the inspection start waits wins: the start is refused', async () => {
            const { id } = await settled('RC2', 'M2');
            await moveTo(id, 'AUDIT_CONFIRMED');
            const hold = holdRow(id, { status: 'CANCELLED', formData: { workflowState: 'CANCELLED' } });
            await hold.isLocked;

            asInspector();
            const pending = request(app).post(`/api/provider/auditor/applications/${id}/inspection-starts`).send({}).then((r) => r);
            await pause(1500);
            await hold.release();
            const res = await pending;

            expect(res.status).toBe(409);
            expect(res.body.code).toBe('APPLICATION_STATE_CHANGED');
            const row = await raw.application.findUnique({ where: { id } });
            expect(row.status).toBe('CANCELLED');
            expect(row.formData.auditExecution).toBeUndefined();
        });
    });


    describe('M-1: a door that read the application before a cancellation committed does not write over it', () => {
        /** A cancellation through the status writer, held open until released. */
        function holdCancellation(id, fromStatus) {
            let release;
            let locked;
            const gate = new Promise((r) => { release = r; });
            const isLocked = new Promise((r) => { locked = r; });
            const done = raw.$transaction(async (tx) => {
                await writeApplicationStatus({
                    prisma: tx, applicationId: id, fromStatus, toStatus: 'CANCELLED',
                    actorId: fx.F.id, actorRole: 'SYSTEM', reason: 'REFUND_PROVIDER_CANCELLED:COMPANY_STOPPED_SERVICE', onAudit: false,
                });
                locked();
                await gate;
            }, { timeout: 30000 });
            return { isLocked, release: async () => { release(); await done; } };
        }
        const asStaff = (role, id = crypto.randomUUID()) => {
            mockActor.current = { id, role, canonicalRole: role, organizationId: fx.org };
        };

        test.each([
            ['the dispatcher\'s assign-reviewer', 'MAS', 'dispatcher', (id) => request(app).post('/api/provider/scheduler/assign-reviewer').send({ applicationId: id, reviewerId: fx.R.id })],
            ['the application assign', 'MAA', 'dispatcher', (id) => request(app).post(`/api/provider/applications/${id}/assign`).send({ reviewerId: fx.R.id })],
            ['the admin batch ASSIGN', 'MAB', 'system_admin_dtam', (id) => request(app).post('/api/provider/admin/batch-actions').send({ applicationIds: [id], action: 'ASSIGN', assignTo: fx.R.id })],
        ])('%s answers 409 and the application stays CANCELLED with no reviewer', async (_door, tag, role, door) => {
            const { id } = await settled(tag, 'M1');
            const hold = holdCancellation(id, 'DOC_FEE_PAID');
            await hold.isLocked;

            asStaff(role);
            const pending = door(id).then((r) => r);
            await pause(1500);
            await hold.release();
            const res = await pending;

            // The writer re-reads the status under the row lock before its versioned UPDATE, so it names the cause.
            expect([res.status, res.body.code]).toEqual([409, 'APPLICATION_CANCELLED_FINAL']);
            const row = await raw.application.findUnique({ where: { id } });
            expect([row.status, row.reviewerId]).toEqual(['CANCELLED', null]);
        });

        test('a GPS check-in that read the inspection before the cancellation committed writes nothing', async () => {
            const { id } = await settled('MS1', 'M2');
            await moveTo(id, 'AUDIT_CONFIRMED');
            const hold = holdCancellation(id, 'AUDIT_CONFIRMED');
            await hold.isLocked;

            asInspector();
            const pending = request(app).post(`/api/provider/auditor/applications/${id}/session/checkin`)
                .send({ latitude: 13.7, longitude: 100.5 }).then((r) => r);
            await pause(1500);
            await hold.release();
            const res = await pending;

            expect([res.status, res.body.code]).toEqual([409, 'APPLICATION_STATE_CHANGED']);
            const row = await raw.application.findUnique({ where: { id } });
            expect(row.status).toBe('CANCELLED');
            expect(row.formData.auditExecution).toBeUndefined();
        });

        test.each(['checkin', 'evidence', 'notes'])('session %s on a CANCELLED application is refused and writes nothing', async (kind) => {
            const { id } = await settled(`MS${kind}`, 'M2');
            await moveTo(id, 'CANCELLED');
            const body = {
                checkin: { latitude: 13.7, longitude: 100.5 },
                evidence: { photos: [{ id: 'p1', url: 'https://example.test/p1.jpg' }] },
                notes: { liveNotes: 'บันทึกระหว่างตรวจ' },
            }[kind];

            asInspector();
            const res = await request(app).post(`/api/provider/auditor/applications/${id}/session/${kind}`).send(body);

            expect(res.status).toBe(409);
            expect(res.body.code).toBe('APPLICATION_STATE_CHANGED');
            expect((await raw.application.findUnique({ where: { id } })).formData.auditExecution).toBeUndefined();
        });
    });

    describe('reason (ง): the company could not inspect within the window after the milestone-2 payment', () => {
        const cannotInspect = { reasonCode: 'COMPANY_CANNOT_INSPECT', note: 'ไม่มีผู้ตรวจที่ไปตรวจในจังหวัดนี้ได้' };

        test('on M2 the record carries the deadline the payment set: 60 Bangkok working days under v1.3', async () => {
            const { id, invoice } = await settled('IN1', 'M2');
            const order = await raw.checkoutOrder.findFirst({ where: { invoiceId: invoice.id, status: 'SETTLED' } });
            expect(order.paymentTermsVersion).toBe('payment-terms-th-v1.3');

            const res = await recordCancellation(invoice.id, cannotInspect);

            expect(res.status).toBe(201);
            expect(await statusOf(id)).toBe('CANCELLED');
            const meta = (await raw.invoice.findUnique({ where: { id: invoice.id } })).metadata;
            expect(meta.refund).toMatchObject({
                reasonCode: 'COMPANY_CANNOT_INSPECT',
                inspectionDeadline: companyInspectionDeadline(order.settledAt, 'payment-terms-th-v1.3').toISOString(),
            });
        });

        test('an M2 paid under v1.2 is cancelled for this reason with no window printed, recorded or told', async () => {
            const { id, invoice } = await settled('IN3', 'M2');
            await raw.checkoutOrder.updateMany({ where: { invoiceId: invoice.id }, data: { paymentTermsVersion: 'payment-terms-th-v1.2' } });

            const res = await recordCancellation(invoice.id, cannotInspect);

            expect(res.status).toBe(201);
            const [note] = await creditNotes(invoice.id);
            expect(note.reason).toBe('ยกเลิกการให้บริการ: บริษัทไม่สามารถตรวจประเมินแปลงได้ ด้วยเหตุฝ่ายบริษัท เช่น ไม่มีผู้ตรวจที่จะไปตรวจได้');
            const meta = (await raw.invoice.findUnique({ where: { id: invoice.id } })).metadata;
            expect(meta.refund.inspectionDeadline).toBeUndefined();
            const [notice] = noticesFor(invoice.id);
            expect(getTemplateForType('REFUND_PROVIDER_CANCELLED', notice.payload).bodyTHText).not.toMatch(/วันทำการ นับจากวันที่ชำระ/);
            expect(await statusOf(id)).toBe('CANCELLED');
        });

        test('an M2 stamped with a version the terms table does not know is refused, and nothing is written', async () => {
            const { id, invoice } = await settled('IN4', 'M2');
            await raw.checkoutOrder.updateMany({ where: { invoiceId: invoice.id }, data: { paymentTermsVersion: 'payment-terms-v1.3' } });

            const res = await recordCancellation(invoice.id, cannotInspect);

            expect([res.status, res.body.error]).toEqual([409, 'REFUND_TERMS_VERSION_UNKNOWN']);
            expect(await creditNotes(invoice.id)).toEqual([]);
            expect(await statusOf(id)).toBe('AUDIT_FEE_PAID');
        });

        test('on M1 the reason does not apply and nothing is written', async () => {
            const { id, invoice } = await settled('IN2', 'M1');

            const res = await recordCancellation(invoice.id, cannotInspect);

            expect(res.status).toBe(409);
            expect(res.body.error).toBe('REFUND_CANCELLATION_REASON_NOT_APPLICABLE');
            expect(await statusOf(id)).toBe('DOC_FEE_PAID');
            expect(await creditNotes(invoice.id)).toEqual([]);
        });
    });

    describe('F2 (security review 2026-10-09): a second visit is booked after the first one was decided, so M2 has started', () => {
        const staff = {};
        const as = (user) => { mockActor.current = { id: user.id, role: user.role, canonicalRole: user.role, organizationId: fx.org }; };
        let daysAhead = 3;
        /** 09:00 Bangkok on a working day ahead, a different day per booking so one inspector is never double-booked */
        const visitDay = () => {
            const { addWorkingDays, startOfLocalDay } = require('../../utils/working-days');
            daysAhead += 1;
            return new Date(startOfLocalDay(addWorkingDays(new Date(), daysAhead)).getTime() + 9 * 60 * 60 * 1000);
        };

        beforeAll(async () => {
            for (const [key, role] of [['inspector', 'field_inspector'], ['dispatcher', 'dispatcher']]) {
                const user = await mkUser(`f2${key}`, role);
                await raw.user.update({ where: { id: user.id }, data: { accountType: 'PROVIDER', status: 'ACTIVE' } });
                staff[key] = { id: user.id, role };
            }
        });

        /** A paid M2 whose first visit found a major defect: the inspector now reviews the corrective evidence. */
        async function correctiveEvidenceUnderReview(tag) {
            const { id, invoice } = await settled(tag, 'M2');
            // eslint-disable-next-line gacp/no-direct-application-status-write -- fixture: the first visit was decided MAJOR, the evidence came back
            await raw.application.update({
                where: { id },
                data: {
                    status: 'CAR_REVIEWING', auditorId: staff.inspector.id, reviewerId: fx.R.id,
                    scheduledDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
                    formData: { workflowState: 'CAR_REVIEWING', auditDecisions: [{ decision: 'MAJOR', notes: 'โรงเก็บไม่มีประตู' }] },
                },
            });
            return { id, invoice };
        }

        async function bookSecondVisit(id) {
            as(staff.inspector);
            const asked = await request(app).post(`/api/provider/auditor/applications/${id}/audit-decisions`)
                .send({ decision: 'REINSPECT', notes: 'ต้องดูประตูโรงเก็บของจริง' });
            expect(asked.status).toBe(200);
            as(staff.dispatcher);
            const booked = await request(app).post('/api/provider/scheduler/audits/schedules').send({
                applicationId: id, auditorId: staff.inspector.id, scheduledDate: visitDay().toISOString(), location: 'แปลงทดสอบ',
            });
            expect(booked.status).toBe(201);
            const row = await raw.application.findUnique({ where: { id } });
            expect([row.status, row.formData.reinspection.status, row.formData.auditExecution]).toEqual(['AUDIT_CONFIRMED', 'BOOKED', undefined]);
        }

        test('the cancellation refund of M2 is refused: nothing is credited and the application stays booked', async () => {
            const { id, invoice } = await correctiveEvidenceUnderReview('F2A');
            await bookSecondVisit(id);

            const res = await recordCancellation(invoice.id);

            expect([res.status, res.body.error]).toEqual([409, 'REFUND_SERVICE_ALREADY_STARTED']);
            expect(await statusOf(id)).toBe('AUDIT_CONFIRMED');
            expect(await creditNotes(invoice.id)).toEqual([]);
            expect((await raw.invoice.findUnique({ where: { id: invoice.id } })).metadata?.refund).toBeUndefined();
        });

        test('a decided on-site checklist counts too, whatever the status says', async () => {
            const { id, invoice } = await settled('F2C', 'M2');
            await moveTo(id, 'AUDIT_CONFIRMED');
            const checklist = await raw.auditChecklist.create({
                data: {
                    applicationId: id, templateName: 'GACP_GENERAL', sections: [], auditorId: fx.I.id, organizationId: fx.org,
                    status: 'COMPLETED', submittedAt: new Date(),
                },
            });

            const res = await recordCancellation(invoice.id);

            await raw.auditChecklist.delete({ where: { id: checklist.id } });
            expect([res.status, res.body.error]).toEqual([409, 'REFUND_SERVICE_ALREADY_STARTED']);
            expect(await statusOf(id)).toBe('AUDIT_CONFIRMED');
            expect(await creditNotes(invoice.id)).toEqual([]);
        });

        /** A paid M2 booked on the calendar for its first visit; returns the armed inspection. */
        async function firstVisitBooked(tag) {
            const { id, invoice } = await settled(tag, 'M2');
            await raw.application.update({ where: { id }, data: { reviewerId: fx.R.id } });
            as(staff.dispatcher);
            const booked = await request(app).post('/api/provider/scheduler/audits/schedules').send({
                applicationId: id, auditorId: staff.inspector.id, scheduledDate: visitDay().toISOString(), location: 'แปลงทดสอบ',
            });
            expect(booked.status).toBe(201);
            const audit = await raw.auditChecklist.findFirst({ where: { applicationId: id, status: 'IN_PROGRESS' } });
            return { id, invoice, audit };
        }

        test('N1: the field app\'s GPS check-in on the inspection counts, though nothing else was recorded yet', async () => {
            const { id, invoice, audit } = await firstVisitBooked('N1G');
            as(staff.inspector);
            const started = await request(app).post(`/api/audit/onsite/${audit.id}/start`)
                .send({ gps: { latitude: 13.7, longitude: 100.5 } });
            expect(started.status).toBe(200);
            expect(await raw.gpsVerificationLog.count({ where: { entityType: 'AUDIT_INSPECTION_START', entityId: audit.id } })).toBe(1);

            const res = await recordCancellation(invoice.id);

            await raw.gpsVerificationLog.deleteMany({ where: { entityId: audit.id } });
            expect([res.status, res.body.error]).toEqual([409, 'REFUND_SERVICE_ALREADY_STARTED']);
            expect(await statusOf(id)).toBe('AUDIT_CONFIRMED');
            expect(await creditNotes(invoice.id)).toEqual([]);
        });

        test('N1: an audit result recorded in the filing (auditResult and auditedAt) counts, whatever the status says', async () => {
            const { id, invoice } = await settled('N1R', 'M2');
            // eslint-disable-next-line gacp/no-direct-application-status-write
            await raw.application.update({
                where: { id },
                data: { status: 'AUDIT_CONFIRMED', formData: { workflowState: 'AUDIT_CONFIRMED', auditResult: 'FAIL', auditedAt: new Date().toISOString() } },
            });

            const res = await recordCancellation(invoice.id);

            expect([res.status, res.body.error]).toEqual([409, 'REFUND_SERVICE_ALREADY_STARTED']);
            expect(await creditNotes(invoice.id)).toEqual([]);
        });

        test('N1 control: a checklist the applicant could have written into the filing does not count', async () => {
            const { id, invoice } = await settled('N1C', 'M2');
            // eslint-disable-next-line gacp/no-direct-application-status-write -- fixture: the applicant-writable auditChecklist key is present
            await raw.application.update({
                where: { id },
                data: { status: 'AUDIT_CONFIRMED', formData: { workflowState: 'AUDIT_CONFIRMED', auditChecklist: [{ item: 'A1', result: 'PASS' }] } },
            });

            const res = await recordCancellation(invoice.id);

            expect([res.status, res.body.error]).toEqual([201, undefined]);
            expect(await statusOf(id)).toBe('CANCELLED');
        });

        test('LOW: once the refund closed the application, the field app records no evidence on its inspection', async () => {
            const { id, invoice, audit } = await firstVisitBooked('LWC');
            expect((await recordCancellation(invoice.id)).status).toBe(201);
            expect(await statusOf(id)).toBe('CANCELLED');
            const sharp = require('sharp');
            const photo = await sharp(crypto.randomBytes(640 * 480 * 3), { raw: { width: 640, height: 480, channels: 3 } }).jpeg({ quality: 80 }).toBuffer();

            as(staff.inspector);
            const started = await request(app).post(`/api/audit/onsite/${audit.id}/start`).send({ gps: { latitude: 13.7, longitude: 100.5 } });
            const answered = await request(app).post(`/api/audit/onsite/${audit.id}/checklist`)
                .send({ items: [{ itemCode: '1.1', response: 'PASS' }] });
            const photographed = await request(app).post(`/api/audit/onsite/${audit.id}/photo`)
                .field('gps', JSON.stringify({ latitude: 13.7, longitude: 100.5 }))
                .attach('photo', photo, { filename: 'farm.jpg', contentType: 'image/jpeg' });

            for (const [door, res] of [['start', started], ['checklist', answered], ['photo', photographed]]) {
                expect([door, res.status, res.body.code]).toEqual([door, 409, 'APPLICATION_STATE_CHANGED']);
            }
            const written = await Promise.all([
                raw.gpsVerificationLog.count({ where: { entityId: audit.id } }),
                raw.farmAuditChecklistItem.count({ where: { auditId: audit.id } }),
                raw.farmAuditPhoto.count({ where: { auditId: audit.id } }),
            ]);
            expect(written).toEqual([0, 0, 0]);
        });

        test('LOW control: at the visit the same three doors record their evidence', async () => {
            const { audit } = await firstVisitBooked('LWV');
            const sharp = require('sharp');
            const photo = await sharp(crypto.randomBytes(640 * 480 * 3), { raw: { width: 640, height: 480, channels: 3 } }).jpeg({ quality: 80 }).toBuffer();

            as(staff.inspector);
            const started = await request(app).post(`/api/audit/onsite/${audit.id}/start`).send({ gps: { latitude: 13.7, longitude: 100.5 } });
            const answered = await request(app).post(`/api/audit/onsite/${audit.id}/checklist`)
                .send({ items: [{ itemCode: '1.1', response: 'PASS' }] });
            const photographed = await request(app).post(`/api/audit/onsite/${audit.id}/photo`)
                .field('gps', JSON.stringify({ latitude: 13.7, longitude: 100.5 }))
                .attach('photo', photo, { filename: 'farm.jpg', contentType: 'image/jpeg' });

            const written = await Promise.all([
                raw.gpsVerificationLog.count({ where: { entityId: audit.id } }),
                raw.farmAuditChecklistItem.count({ where: { auditId: audit.id } }),
                raw.farmAuditPhoto.count({ where: { auditId: audit.id } }),
            ]);
            await raw.gpsVerificationLog.deleteMany({ where: { entityId: audit.id } });
            await raw.farmAuditPhoto.deleteMany({ where: { auditId: audit.id } });
            await raw.farmAuditChecklistItem.deleteMany({ where: { auditId: audit.id } });
            await raw.attachment.deleteMany({ where: { resModel: 'FarmAuditPhoto', resId: audit.id } });
            expect([started.status, answered.status, photographed.status]).toEqual([200, 200, 200]);
            expect(written).toEqual([1, 1, 1]);
        });

        test('control: a first visit booked and armed, nobody on site yet: the refund is recorded', async () => {
            const { id, invoice } = await settled('F2B', 'M2');
            await raw.application.update({ where: { id }, data: { reviewerId: fx.R.id } });
            as(staff.dispatcher);
            const booked = await request(app).post('/api/provider/scheduler/audits/schedules').send({
                applicationId: id, auditorId: staff.inspector.id, scheduledDate: visitDay().toISOString(), location: 'แปลงทดสอบ',
            });
            expect(booked.status).toBe(201);
            expect(await raw.auditChecklist.count({ where: { applicationId: id, status: 'IN_PROGRESS' } })).toBe(1);

            const res = await recordCancellation(invoice.id);

            expect([res.status, res.body.error]).toEqual([201, undefined]);
            expect(await statusOf(id)).toBe('CANCELLED');
            expect(await creditNotes(invoice.id)).toHaveLength(1);
        });
    });
});

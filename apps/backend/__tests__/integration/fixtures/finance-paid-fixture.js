'use strict';

/**
 * Real paid milestones for the finance-tools suites: an organization with an applicant
 * company, two company finance officers (maker and checker), a DTAM finance officer and
 * a DTAM admin; applications quoted, paid through the checkout door and settled by the
 * webhook path (mock gateway). Nothing about the money is written by hand.
 *
 * The caller owns the jest.mock of auth-middleware and passes its `mockActor` holder.
 */

const { dropConsentRows } = require('../../../test-support/consent-history');
const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');

const ROUTES = Object.freeze({
    '/api/payments': '../../../routes/api/finance/payments',
    '/api/invoices': '../../../routes/api/finance/invoices',
    '/api/finance/refunds': '../../../routes/api/finance/refunds',
    '/api/finance/credit-notes': '../../../routes/api/finance/credit-notes',
    '/api/finance/debit-notes': '../../../routes/api/finance/debit-notes',
    '/api/finance/wht': '../../../routes/api/finance/wht',
    '/api/finance': '../../../routes/api/finance/customer-reports',
    '/api/reports': '../../../routes/api/documents/reports',
});

function createFinanceFixture({ prefix, mockActor }) {
    const { ConsentCategory, ConsentVersions } = require('../../../middleware/consent-manager');
    const quotationService = require('../../../services/quotation-service');
    const { issueQuotationOnSubmit } = require('../../../services/quotation-issuance-on-submit');
    const { settleEvent } = require('../../../services/checkout/checkout-settlement-service');
    const { retireCheckoutOrderInTx, RETIRE_REASONS } = require('../../../services/checkout/retire-checkout-order');

    const sfx = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fx = { userIds: [], appIds: [], orgIds: [], entityIds: [] };
    const state = { raw: null, app: null };

    async function mkOrg(tag) {
        const org = await state.raw.organization.create({
            data: { name: `${prefix}${tag}-${sfx}`, slug: `${prefix}${tag}-${sfx}`, code: `${prefix}${tag}_${sfx}`.toUpperCase().slice(0, 24) },
        });
        fx.orgIds.push(org.id);
        return org.id;
    }

    async function mkUser(name, role, organizationId) {
        const id = crypto.randomUUID();
        const canonicalId = `${prefix}-${name}-${sfx}`;
        await state.raw.user.create({
            data: {
                id, canonicalId, healthId: canonicalId, password: 'x', role, authType: 'EMAIL_LEGACY',
                email: `${prefix}-${name}-${sfx}@example.test`, firstName: 'ทดสอบ', lastName: name, organizationId,
            },
        });
        fx.userIds.push(id);
        return { id, canonicalId, role, organizationId };
    }

    function as(user, overrides = {}) {
        mockActor.current = {
            id: user.id, canonicalId: user.canonicalId, healthId: user.canonicalId,
            role: user.role, canonicalRole: user.role, organizationId: user.organizationId, ...overrides,
        };
    }

    async function setup() {
        state.raw = new PrismaClient();
        await state.raw.$connect();
        require('../../../services/payment/mock-payment-adapter').__reset();
        fx.org = await mkOrg('a');
        fx.otherOrg = await mkOrg('b');
        fx.A = await mkUser('applicant', 'health', fx.org);
        fx.F = await mkUser('fin', 'finance_officer_platform', fx.org);
        fx.F2 = await mkUser('fin2', 'finance_officer_platform', fx.org);
        fx.FD = await mkUser('findtam', 'finance_officer_dtam', fx.org);
        fx.AD = await mkUser('admindtam', 'system_admin_dtam', fx.org);
        fx.FX = await mkUser('finother', 'finance_officer_platform', fx.otherOrg);
        fx.ADX = await mkUser('admindtamother', 'system_admin_dtam', fx.otherOrg);
        fx.C = (await state.raw.entity.create({
            data: {
                type: 'JURISTIC', displayName: `บริษัท ${prefix} ${sfx} จำกัด`, juristicId: '0105500000001',
                organizationId: fx.org,
            },
        })).id;
        fx.entityIds.push(fx.C);
        await state.raw.entityMembership.create({
            data: { userId: fx.A.id, entityId: fx.C, role: 'OWNER', status: 'ACTIVE', organizationId: fx.org },
        });
        await state.raw.userConsent.create({
            data: {
                userId: fx.A.id, organizationId: fx.org, category: ConsentCategory.PAYMENT_TERMS,
                version: ConsentVersions.PAYMENT_TERMS, granted: true, grantedAt: new Date(),
            },
        });
        state.app = express();
        state.app.use(express.json());
        for (const [mount, mod] of Object.entries(ROUTES)) {
            state.app.use(mount, require(mod));
        }
        return state;
    }

    async function quotedApplication(label) {
        const row = await state.raw.application.create({
            data: {
                applicationNumber: `APP-${prefix}-${label}-${sfx}`, healthId: fx.A.canonicalId, areaType: 'OUTDOOR',
                organizationId: fx.org, entityId: fx.C, submitterId: fx.A.id, status: 'PENDING_DOC_FEE',
                formData: { workflowState: 'PENDING_DOC_FEE' },
            },
        });
        fx.appIds.push(row.id);
        await issueQuotationOnSubmit({ application: row, actorId: null });
        const [qt] = await state.raw.quotation.findMany({ where: { applicationId: row.id, isDeleted: false } });
        await quotationService.markQuotationAccepted(qt.id, {
            acceptedBy: null, snapshot: quotationService.buildAcceptanceSnapshot(qt),
        });
        return row.id;
    }

    async function webhookSettles(orderId, tag) {
        const order = await state.raw.checkoutOrder.findUnique({ where: { id: orderId } });
        const satang = Math.round(Number(order.totalPayableAmount) * 100);
        const eventId = `evt_${prefix}_${tag}_${sfx}`;
        await state.raw.stripeWebhookEvent.create({
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

    async function checkout(id) {
        as(fx.A);
        const res = await request(state.app).post('/api/payments/checkout').send({ applicationId: id, milestone: 'M1' });
        if (res.status !== 200) { throw new Error(`checkout ${res.status} ${JSON.stringify(res.body)}`); }
        return res.body.data.checkoutOrderId;
    }

    const m1Invoice = (id) => state.raw.invoice.findFirst({
        where: { applicationId: id, serviceType: 'CERTIFICATION_CHECKOUT_M1', isDeleted: false },
    });

    /** M1 paid once through the gateway. */
    async function paidM1(label) {
        const id = await quotedApplication(label);
        await webhookSettles(await checkout(id), label);
        return { id, invoice: await m1Invoice(id) };
    }

    /** M1 paid twice: the first QR lapsed, the second was paid, then the first arrived too. */
    async function paidM1Twice(label) {
        const id = await quotedApplication(label);
        const firstId = await checkout(id);
        const lapsed = await state.raw.checkoutOrder.findUnique({ where: { id: firstId } });
        await state.raw.$transaction((tx) => retireCheckoutOrderInTx(tx, { order: lapsed, reason: RETIRE_REASONS.INTENT_CANCELED }));
        await webhookSettles(await checkout(id), `${label}b`);
        await webhookSettles(lapsed.id, `${label}a`);
        const extraInvoice = await state.raw.invoice.findUnique({ where: { id: lapsed.invoiceId } });
        return { id, invoice: await m1Invoice(id), extraInvoice };
    }

    async function cleanup() {
        const raw = state.raw;
        if (!raw) { return; }
        const ids = fx.appIds;
        const orders = await raw.checkoutOrder.findMany({ where: { applicationId: { in: ids } } }).catch(() => []);
        const invoiceIds = (await raw.invoice.findMany({ where: { applicationId: { in: ids } }, select: { id: true } })
            .catch(() => [])).map((i) => i.id);
        await raw.stripeWebhookEvent.deleteMany({ where: { id: { startsWith: `evt_${prefix}_`, endsWith: sfx } } }).catch(() => {});
        await raw.creditNote.deleteMany({ where: { originalInvoiceId: { in: invoiceIds } } }).catch(() => {});
        await raw.debitNote.deleteMany({ where: { originalInvoiceId: { in: invoiceIds } } }).catch(() => {});
        await raw.journalEntry.deleteMany({ where: { organizationId: { in: fx.orgIds } } }).catch(() => {});
        await raw.manualJournalEntryDraft.deleteMany({ where: { organizationId: { in: fx.orgIds } } }).catch(() => {});
        await raw.checkoutDocument?.deleteMany({ where: { checkoutOrderId: { in: orders.map((o) => o.id) } } }).catch(() => {});
        await raw.checkoutOrder.deleteMany({ where: { applicationId: { in: ids } } }).catch(() => {});
        await raw.invoiceLineItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } }).catch(() => {});
        await raw.paymentTransaction.deleteMany({ where: { applicationId: { in: ids } } }).catch(() => {});
        await raw.invoice.deleteMany({ where: { applicationId: { in: ids } } }).catch(() => {});
        await raw.quotation.deleteMany({ where: { applicationId: { in: ids } } }).catch(() => {});
        await raw.auditLog.deleteMany({ where: { resourceId: { in: ids } } }).catch(() => {});
        await raw.application.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
        await dropConsentRows(raw, { in: fx.userIds }).catch(() => {});
        await raw.entityMembership.deleteMany({ where: { entityId: { in: fx.entityIds } } }).catch(() => {});
        await raw.entity.deleteMany({ where: { id: { in: fx.entityIds } } }).catch(() => {});
        await raw.user.deleteMany({ where: { id: { in: fx.userIds } } }).catch(() => {});
        await raw.organization.deleteMany({ where: { id: { in: fx.orgIds } } }).catch(() => {});
        await raw.$disconnect();
    }

    return {
        fx, state, sfx, as, setup, cleanup, paidM1, paidM1Twice, quotedApplication,
        get raw() { return state.raw; },
        get app() { return state.app; },
    };
}

module.exports = { createFinanceFixture };

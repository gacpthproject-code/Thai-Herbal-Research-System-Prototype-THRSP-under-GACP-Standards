'use strict';
/**
 * Every payment-terms roll-out, replayed on a real Postgres with the consent
 * tables. Each published version replaces the one before it for NEW
 * acceptances, and whoever accepted the older one stays under it for what
 * they already paid:
 *   v1.1 → v1.2  operator 2026-10-03: "ใช้ 1.2" → "ทำได้เลย" (one ค่าบริการ)
 *   v1.2 → v1.3  operator 2026-10-06: "งั้นก็ต้องแก้เอกสารให้ตรง" (refund rules)
 *
 * Three questions per transition, each answered on the real rows a mocked
 * prisma cannot hold (user_consents @@unique(userId, category),
 * checkout_orders, the webhook ledger and the journal):
 *   (a) an applicant whose only grant is the older version is refused at the
 *       NEXT checkout until they accept the newer one, sees that their grant is
 *       not current (getUserConsents: version ≠ currentVersion), and the order
 *       minted after they accept carries the newer version;
 *   (b) an order minted under the older version and still in flight settles
 *       from its webhook after the newer one ships, keeping its stamp;
 *   (c) re-entering that in-flight order after accepting the newer version
 *       hands back the SAME order, restamped with the version just accepted:
 *       that acceptance is what authorises the charge now asked for (security
 *       review 2026-10-06, M3). Only money already settled keeps its old stamp.
 *
 * "Under version X" is reproduced literally: the services are loaded in an
 * isolated module registry with CONSENT_VERSION_PAYMENT_TERMS=X, the value the
 * code default had while X was in force. Keeping the v1.1 → v1.2 transition
 * here keeps the v1.2 roll-out provable after v1.3 ships.
 *
 * Gateway: the mock adapter (PAYMENT_ADAPTER=mock), network-free.
 */

process.env.PAYMENT_ADAPTER = 'mock';

const { dropConsentRows } = require('../../test-support/consent-history');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');

const V11 = 'payment-terms-th-v1.1';
const V12 = 'payment-terms-th-v1.2';
const V13 = 'payment-terms-th-v1.3';
const ENV_KEY = 'CONSENT_VERSION_PAYMENT_TERMS';

const quotationService = require('../../services/quotation-service');
const { issueQuotationOnSubmit } = require('../../services/quotation-issuance-on-submit');
const { settleEvent } = require('../../services/checkout/checkout-settlement-service');
const mockAdapter = require('../../services/payment/mock-payment-adapter');
const { ConsentCategory, ConsentVersions } = require('../../middleware/consent-manager');

/**
 * Run `fn` against the services as the deploy of `version` loaded them. Async
 * isolation because the checkout door requires its gate lazily, at call time:
 * the whole press has to happen inside the isolated registry, or the gate it
 * reaches is this file's default one.
 */
async function underVersion(version, fn) {
    const had = Object.prototype.hasOwnProperty.call(process.env, ENV_KEY);
    const saved = process.env[ENV_KEY];
    process.env[ENV_KEY] = version;
    let result;
    try {
        await jest.isolateModulesAsync(async () => {
            const { ConsentVersions: versions, consentManager } = require('../../middleware/consent-manager');
            const checkout = require('../../services/checkout/stripe-checkout-service');
            const { prisma: isolated } = require('../../services/prisma-database');
            try {
                result = await fn({ versions, consentManager, checkout });
            } finally {
                await isolated.$disconnect();
            }
        });
    } finally {
        if (had) { process.env[ENV_KEY] = saved; } else { delete process.env[ENV_KEY]; }
    }
    return result;
}

d('payment-terms roll-outs, on a real Postgres', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let prisma;
    let orgId;
    let holder;
    const users = [];
    const appIds = [];
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    beforeAll(async () => {
        prisma = new PrismaClient();
        await prisma.$connect();
        mockAdapter.__reset();
        const org = await prisma.organization.create({
            data: { name: 'PTR org', slug: `ptr-${suffix}`, code: `PTR_${suffix}`.toUpperCase().slice(0, 24) },
        });
        orgId = org.id;
        holder = await prisma.entity.create({ data: { type: 'INDIVIDUAL', displayName: `holder ${suffix}`, organizationId: orgId } });
    });

    afterAll(async () => {
        for (const id of appIds) {
            const orders = await prisma.checkoutOrder.findMany({ where: { applicationId: id } });
            for (const o of orders) {
                await prisma.journalEntry.deleteMany({ where: { sourceId: o.id } }).catch(() => {});
            }
            await prisma.checkoutOrder.deleteMany({ where: { applicationId: id } }).catch(() => {});
            for (const o of orders) {
                if (o.invoiceId) { await prisma.invoiceLineItem.deleteMany({ where: { invoiceId: o.invoiceId } }).catch(() => {}); }
            }
            await prisma.paymentTransaction.deleteMany({ where: { applicationId: id } }).catch(() => {});
            await prisma.invoice.deleteMany({ where: { applicationId: id } }).catch(() => {});
            await prisma.quotation.deleteMany({ where: { applicationId: id } }).catch(() => {});
            await prisma.auditLog.deleteMany({ where: { resourceId: id } }).catch(() => {});
            await prisma.application.deleteMany({ where: { id } }).catch(() => {});
        }
        await prisma.stripeWebhookEvent.deleteMany({ where: { id: { contains: suffix } } }).catch(() => {});
        for (const u of users) {
            await dropConsentRows(prisma, u.id).catch(() => {});
            await prisma.user.deleteMany({ where: { id: u.id } }).catch(() => {});
        }
        if (holder) { await prisma.entity.deleteMany({ where: { id: holder.id } }).catch(() => {}); }
        if (orgId) { await prisma.organization.deleteMany({ where: { id: orgId } }).catch(() => {}); }
        await prisma.$disconnect();
    });

    /** An applicant whose only payment-terms grant is `version`. */
    async function applicantWhoAccepted(version, label) {
        const user = await prisma.user.create({
            data: { canonicalId: `ptr-${label}-${suffix}`, password: 'x', organizationId: orgId, authType: 'EMAIL_LEGACY' },
        });
        users.push(user);
        await prisma.userConsent.create({
            data: {
                userId: user.id, organizationId: orgId, category: ConsentCategory.PAYMENT_TERMS,
                version, granted: true, grantedAt: new Date('2026-09-20T03:00:00.000Z'),
            },
        });
        return user;
    }

    async function acceptedApplication(user, label) {
        const app = await prisma.application.create({
            data: {
                applicationNumber: `PTR-${label}-${suffix}`, healthId: user.canonicalId, areaType: 'OUTDOOR',
                organizationId: orgId, entityId: holder.id, status: 'PENDING_DOC_FEE', formData: {},
            },
        });
        appIds.push(app.id);
        expect(await issueQuotationOnSubmit({ application: app, actorId: null })).toEqual({ issued: true });
        const [qt] = await prisma.quotation.findMany({ where: { applicationId: app.id, isDeleted: false } });
        await quotationService.markQuotationAccepted(qt.id, {
            acceptedBy: null, snapshot: quotationService.buildAcceptanceSnapshot(qt),
        });
        return app;
    }

    const pressWith = (door, user, app) => door.createCheckoutForApplication({
        applicationId: app.id, milestone: 'M1',
        actor: {
            id: user.id, healthId: user.canonicalId, role: 'health',
            holderScope: { userId: user.id, readIds: [holder.id], editIds: [holder.id] },
        },
    });
    const pressUnder = (version, user, app) => underVersion(version, ({ checkout }) => pressWith(checkout, user, app));
    const acceptUnder = (version, user) => underVersion(version, ({ consentManager }) =>
        // POST /api/consent {category:'PAYMENT_TERMS', granted:true}: the call the box makes.
        consentManager.recordConsent(user.id, ConsentCategory.PAYMENT_TERMS, true, '127.0.0.1', 'jest'));

    async function webhookSettles(order, tag) {
        const eventId = `evt_ptr_${tag}_${suffix}`;
        await prisma.stripeWebhookEvent.create({
            data: {
                id: eventId, type: 'payment_intent.succeeded', status: 'RECEIVED', attempts: 0,
                payload: { data: { object: {
                    id: order.stripePaymentIntentId, amount: 588500, amount_received: 588500,
                    metadata: { checkoutOrderId: order.id, milestone: 'M1' },
                } } },
            },
        });
        return settleEvent(eventId);
    }

    test('the runtime default is v1.3, and each reproduced deploy resolves its own version', async () => {
        expect(ConsentVersions.PAYMENT_TERMS).toBe(V13);
        for (const v of [V11, V12, V13]) {
            expect(await underVersion(v, async ({ versions }) => versions.PAYMENT_TERMS)).toBe(v);
        }
    });

    describe.each([
        { from: V11, to: V12, tag: '1112' },
        { from: V12, to: V13, tag: '1213' },
    ])('$from → $to', ({ from, to, tag }) => {
        test(`(a) a ${from}-only applicant is asked to accept ${to} before the next checkout; the order then carries ${to}`, async () => {
            const user = await applicantWhoAccepted(from, `a${tag}`);
            const app = await acceptedApplication(user, `a${tag}`);

            // What the checkout screen reads on open: granted, but not the current version,
            // so isPaymentTermsGranted answers false and the box is drawn again.
            const status = await underVersion(to, ({ consentManager }) => consentManager.getUserConsents(user.id));
            expect(status.PAYMENT_TERMS).toMatchObject({ granted: true, version: from, currentVersion: to });

            await expect(pressUnder(to, user, app)).rejects.toMatchObject({ code: 'PAYMENT_TERMS_NOT_ACCEPTED', status: 409 });
            expect(await prisma.checkoutOrder.count({ where: { applicationId: app.id } })).toBe(0);

            await acceptUnder(to, user);
            const grant = await prisma.userConsent.findUnique({
                where: { userId_category: { userId: user.id, category: ConsentCategory.PAYMENT_TERMS } },
            });
            expect(grant).toMatchObject({ granted: true, version: to });

            const minted = await pressUnder(to, user, app);
            const order = await prisma.checkoutOrder.findUnique({ where: { id: minted.checkoutOrderId } });
            expect(order.paymentTermsVersion).toBe(to);
            expect(order.paymentTermsAcceptedAt.toISOString()).toBe(grant.grantedAt.toISOString());
            expect(Number(order.totalPayableAmount)).toBe(5885);
        });

        test(`(b) an order minted under ${from} and still in flight settles from its webhook after ${to} ships, keeping its ${from} stamp`, async () => {
            const user = await applicantWhoAccepted(from, `b${tag}`);
            const app = await acceptedApplication(user, `b${tag}`);

            const minted = await pressUnder(from, user, app);
            const before = await prisma.checkoutOrder.findUnique({ where: { id: minted.checkoutOrderId } });
            expect(before).toMatchObject({ status: 'PENDING_PAYMENT', paymentTermsVersion: from });
            expect(before.stripePaymentIntentId).toBeTruthy();

            // After the deploy: a NEW checkout by the same applicant is refused until they accept the newer version …
            await expect(pressUnder(to, user, app)).rejects.toMatchObject({ code: 'PAYMENT_TERMS_NOT_ACCEPTED' });

            // … but the money already asked for under the older one settles, and the evidence row is not rewritten.
            expect((await webhookSettles(before, `b${tag}`)).status).toBe('PROCESSED');
            const after = await prisma.checkoutOrder.findUnique({ where: { id: before.id } });
            expect(after.status).toBe('SETTLED');
            expect(after.paymentTermsVersion).toBe(from);
            expect(after.paymentTermsAcceptedAt.toISOString()).toBe(before.paymentTermsAcceptedAt.toISOString());
            expect(Number(after.totalPayableAmount)).toBe(5885);
            const consent = await prisma.userConsent.findUnique({
                where: { userId_category: { userId: user.id, category: ConsentCategory.PAYMENT_TERMS } },
            });
            expect(consent.version).toBe(from);
        });

        test(`(c) re-entering an in-flight ${from} order after accepting ${to} hands back the same order, stamped ${to}, and it settles`, async () => {
            const user = await applicantWhoAccepted(from, `c${tag}`);
            const app = await acceptedApplication(user, `c${tag}`);
            const minted = await pressUnder(from, user, app);

            await acceptUnder(to, user);
            const again = await pressUnder(to, user, app);

            expect(again.checkoutOrderId).toBe(minted.checkoutOrderId);
            const order = await prisma.checkoutOrder.findUnique({ where: { id: minted.checkoutOrderId } });
            const grant = await prisma.userConsent.findUnique({
                where: { userId_category: { userId: user.id, category: ConsentCategory.PAYMENT_TERMS } },
            });
            expect(order.paymentTermsVersion).toBe(to);
            expect(order.paymentTermsAcceptedAt.toISOString()).toBe(grant.grantedAt.toISOString());
            expect(await prisma.checkoutOrder.count({ where: { applicationId: app.id } })).toBe(1);

            expect((await webhookSettles(order, `c${tag}`)).status).toBe('PROCESSED');
            expect((await prisma.checkoutOrder.findUnique({ where: { id: order.id } })).status).toBe('SETTLED');
        });
    });
});

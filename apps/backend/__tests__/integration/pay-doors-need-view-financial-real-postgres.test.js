'use strict';

/**
 * Operator order 41 (2026-10-07): paying requires seeing the amount. Every door that starts a
 * payment hands the payer the price (checkout returns the breakdown, the QR client secret, the
 * quotation number and the invoice id), so each one asks VIEW_FINANCIAL after SUBMIT_APPLICATION.
 *
 * Real Postgres, mock gateway. "submitterOnly" is a MANAGER whose membership lists
 * SUBMIT_APPLICATION but not VIEW_FINANCIAL. "granted" is a MANAGER the OWNER handed both
 * permissions through grant rows (operator ruling 2026-10-08 ก), the nearest member that may pay.
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

const { ConsentCategory, ConsentVersions } = require('../../middleware/consent-manager');
const quotationService = require('../../services/quotation-service');
const { issueQuotationOnSubmit } = require('../../services/quotation-issuance-on-submit');
const mockAdapter = require('../../services/payment/mock-payment-adapter');

d('pay doors need VIEW_FINANCIAL (real Postgres)', () => {
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { users: {}, userIds: [], appIds: [] };

    async function member(label, role, permissions = [], grants = []) {
        const id = crypto.randomUUID();
        const canonicalId = `pvf-${label}-${sfx}`;
        await raw.user.create({
            data: {
                id, canonicalId, healthId: canonicalId, password: 'x', role: 'health', authType: 'EMAIL_LEGACY',
                email: `${canonicalId}@example.test`, firstName: 'ทดสอบ', lastName: label, organizationId: fx.orgId,
            },
        });
        const membership = await raw.entityMembership.create({
            data: { userId: id, entityId: fx.entityId, role, permissions, status: 'ACTIVE', organizationId: fx.orgId },
        });
        for (const permission of grants) {
            await raw.entityMemberPermissionGrant.create({
                data: { membershipId: membership.id, permission, effect: 'GRANT', organizationId: fx.orgId },
            });
        }
        await raw.userConsent.create({
            data: {
                userId: id, organizationId: fx.orgId, category: ConsentCategory.PAYMENT_TERMS,
                version: ConsentVersions.PAYMENT_TERMS, granted: true, grantedAt: new Date(),
            },
        });
        fx.userIds.push(id);
        fx.users[label] = { id, canonicalId };
    }

    async function pendingDocFeeWithAcceptedQuotation(label, filer) {
        const row = await raw.application.create({
            data: {
                applicationNumber: `APP-PVF-${label}-${sfx}`, healthId: filer.canonicalId, areaType: 'OUTDOOR',
                organizationId: fx.orgId, entityId: fx.entityId, submitterId: filer.id, status: 'PENDING_DOC_FEE',
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

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        mockAdapter.__reset();
        const org = await raw.organization.create({ data: { name: `pvf-${sfx}`, slug: `pvf-${sfx}`, code: `PVF_${sfx}`.toUpperCase() } });
        fx.orgId = org.id;
        fx.entityId = (await raw.entity.create({
            data: { type: 'JURISTIC', displayName: 'บริษัท จ่ายต้องเห็นยอด จำกัด', juristicId: '0105561234594', organizationId: fx.orgId },
        })).id;
        await member('owner', 'OWNER');
        await member('submitterOnly', 'MANAGER', ['SUBMIT_APPLICATION']);
        await member('granted', 'MANAGER', [], ['SUBMIT_APPLICATION', 'VIEW_FINANCIAL']);
        fx.appId = await pendingDocFeeWithAcceptedQuotation('M1', fx.users.submitterOnly);
        fx.grantedAppIds = {};
        for (const door of ['checkout', 'create', 'phase1']) {
            fx.grantedAppIds[door] = await pendingDocFeeWithAcceptedQuotation(`G-${door}`, fx.users.granted);
        }

        app = express();
        app.use(express.json());
        app.use('/api/payments', require('../../routes/api/finance/payments'));
    });

    afterAll(async () => {
        if (!raw) { return; }
        const ids = fx.appIds;
        const orders = await raw.checkoutOrder.findMany({ where: { applicationId: { in: ids } } }).catch(() => []);
        await raw.checkoutDocument?.deleteMany({ where: { checkoutOrderId: { in: orders.map((o) => o.id) } } }).catch(() => {});
        await raw.checkoutOrder.deleteMany({ where: { applicationId: { in: ids } } }).catch(() => {});
        for (const o of orders) {
            if (o.invoiceId) { await raw.invoiceLineItem.deleteMany({ where: { invoiceId: o.invoiceId } }).catch(() => {}); }
        }
        await raw.paymentTransaction.deleteMany({ where: { applicationId: { in: ids } } }).catch(() => {});
        await raw.invoiceLineItem.deleteMany({ where: { invoice: { applicationId: { in: ids } } } }).catch(() => {});
        await raw.invoice.deleteMany({ where: { applicationId: { in: ids } } }).catch(() => {});
        await raw.quotation.deleteMany({ where: { applicationId: { in: ids } } }).catch(() => {});
        await raw.auditLog.deleteMany({ where: { resourceId: { in: ids } } }).catch(() => {});
        await raw.application.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
        await raw.notification.deleteMany({ where: { userId: { in: fx.userIds } } }).catch(() => {});
        await dropConsentRows(raw, { in: fx.userIds }).catch(() => {});
        await raw.entityMembership.deleteMany({ where: { entityId: fx.entityId } }).catch(() => {});
        await raw.entity.deleteMany({ where: { id: fx.entityId } }).catch(() => {});
        await raw.user.deleteMany({ where: { id: { in: fx.userIds } } }).catch(() => {});
        await raw.organization.deleteMany({ where: { id: fx.orgId } }).catch(() => {});
        await raw.$disconnect();
    });

    const as = (label) => {
        const u = fx.users[label];
        mockActor.current = {
            id: u.id, canonicalId: u.canonicalId, healthId: u.canonicalId, role: 'health', canonicalRole: 'health', organizationId: fx.orgId,
        };
    };
    const nothingMinted = async () => {
        expect(await raw.checkoutOrder.count({ where: { applicationId: fx.appId } })).toBe(0);
        expect(await raw.invoice.count({ where: { applicationId: fx.appId } })).toBe(0);
        expect(await raw.paymentTransaction.count({ where: { applicationId: fx.appId } })).toBe(0);
    };

    describe('a member who may submit but not read money', () => {
        let gateway;
        beforeEach(() => { gateway = jest.spyOn(mockAdapter, 'createCheckoutSession'); });
        afterEach(() => { gateway.mockRestore(); });

        test.each([
            ['POST /payments/checkout', () => request(app).post('/api/payments/checkout').send({ applicationId: fx.appId })],
            ['POST /payments/create', () => request(app).post('/api/payments/create').send({ applicationId: fx.appId })],
            ['POST /payments/phase1/:id', () => request(app).post(`/api/payments/phase1/${fx.appId}`).send({})],
        ])('%s answers 403 VIEW_FINANCIAL, mints nothing and never calls the gateway', async (_door, press) => {
            as('submitterOnly');
            const res = await press();
            expect(res.status).toBe(403);
            expect(res.body).toEqual(expect.objectContaining({ code: 'ENTITY_PERMISSION_DENIED', permission: 'VIEW_FINANCIAL' }));
            expect(JSON.stringify(res.body)).not.toMatch(/clientSecret|5,?885|QT-/);
            expect(gateway).not.toHaveBeenCalled();
            await nothingMinted();
        });
    });

    test('control: the OWNER (VIEW_FINANCIAL by role) opens the checkout and gets the QR', async () => {
        as('owner');
        const res = await request(app).post('/api/payments/checkout').send({ applicationId: fx.appId });
        expect(res.status).toBe(200);
        expect(res.body.data.clientSecret).toEqual(expect.any(String));
        expect(await raw.checkoutOrder.count({ where: { applicationId: fx.appId, status: 'PENDING_PAYMENT' } })).toBe(1);
    });

    describe('control: a MANAGER granted SUBMIT_APPLICATION and VIEW_FINANCIAL through grant rows pays', () => {
        test('POST /payments/checkout answers 200 with the QR and opens one order', async () => {
            as('granted');
            const appId = fx.grantedAppIds.checkout;
            const res = await request(app).post('/api/payments/checkout').send({ applicationId: appId });
            expect(res.status).toBe(200);
            expect(res.body.data.clientSecret).toEqual(expect.any(String));
            expect(await raw.checkoutOrder.count({ where: { applicationId: appId, status: 'PENDING_PAYMENT' } })).toBe(1);
        });

        test.each([
            ['POST /payments/create', (appId) => request(app).post('/api/payments/create').send({ applicationId: appId }), 'create'],
            ['POST /payments/phase1/:id', (appId) => request(app).post(`/api/payments/phase1/${appId}`).send({}), 'phase1'],
        ])('%s answers 200', async (_door, press, key) => {
            as('granted');
            const res = await press(fx.grantedAppIds[key]);
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });
});

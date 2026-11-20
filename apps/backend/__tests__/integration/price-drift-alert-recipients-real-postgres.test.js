'use strict';

/**
 * Order 55(b) (operator 2026-10-09, "ตามแนะนำ"): when a checkout is refused because the charge
 * disagrees with the accepted quotation, the full alert (the figures and the document number) goes
 * to the company finance officers of the application's organization, and an amount-free alert goes
 * to the platform admins. Nobody else: not the DTAM admin, not DTAM finance, not a document reviewer,
 * not another organization's finance officer (orders 17 and 47). One alert per unread incident, per
 * version.
 *
 * Real Postgres, through the real checkout door: the quotation is accepted for one cultivation type,
 * then the application names two, so the live charge disagrees with the accepted figures. The
 * recipients and the content are read back from the notification rows.
 */

process.env.PAYMENT_ADAPTER = 'mock';
process.env.STRIPE_CHECKOUT_ENABLED = 'true';

const crypto = require('crypto');
const request = require('supertest');
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
jest.mock('../../services/redis-service', () => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(true),
}));

const { createFinanceFixture } = require('./fixtures/finance-paid-fixture');

jest.setTimeout(120000);

d('the price-drift alert reaches company finance in full and the platform admin without amounts (order 55(b), real Postgres)', () => {
    const F = createFinanceFixture({ prefix: 'pda', mockActor });
    const { fx } = F;
    const staff = {};
    let appId;
    let quotationNumber;

    async function mkStaff(name, role, organizationId) {
        const id = crypto.randomUUID();
        const canonicalId = `pda-${name}-${F.sfx}`;
        await F.raw.user.create({
            data: {
                id, canonicalId, healthId: canonicalId, password: 'x', role, authType: 'EMAIL_LEGACY',
                email: `${canonicalId}@example.test`, firstName: 'ทดสอบ', lastName: name, organizationId,
            },
        });
        fx.userIds.push(id);
        return id;
    }

    async function press() {
        F.as(fx.A);
        return request(F.app).post('/api/payments/checkout').send({ applicationId: appId, milestone: 'M1' });
    }

    const alerts = () => F.raw.notification.findMany({
        where: { type: 'CHECKOUT_PRICE_DRIFT', metadata: { path: ['applicationId'], equals: appId } },
        orderBy: { createdAt: 'asc' },
    });
    const countFor = (rows, userId) => rows.filter((r) => r.userId === userId).length;

    beforeAll(async () => {
        await F.setup();
        staff.platformAdmin = await mkStaff('platformadmin', 'system_admin_platform', fx.otherOrg);
        staff.reviewer = await mkStaff('reviewer', 'document_reviewer', fx.org);
        appId = await F.quotedApplication('DRIFT');
        quotationNumber = (await F.raw.quotation.findFirst({ where: { applicationId: appId, isDeleted: false } })).quotationNumber;
        // Accepted for one cultivation type; the application now names two, so the live charge for
        // the first instalment is twice the accepted figure.
        await F.raw.application.update({
            where: { id: appId },
            data: { formData: { workflowState: 'PENDING_DOC_FEE', farmData: { areaTypes: ['OUTDOOR', 'INDOOR'] } } },
        });
    });

    afterAll(async () => {
        await F.raw?.notification.deleteMany({ where: { userId: { in: fx.userIds } } }).catch(() => {});
        for (const id of fx.appIds) {
            await F.raw?.notification.deleteMany({
                where: { type: 'CHECKOUT_PRICE_DRIFT', metadata: { path: ['applicationId'], equals: id } },
            }).catch(() => {});
        }
        await F.cleanup();
    });

    test('the charge is refused as drifted, and nothing is charged', async () => {
        const res = await press();
        expect([res.status, res.body.error || res.body.code]).toEqual([409, 'CHECKOUT_PRICE_DRIFT']);
        expect(await F.raw.checkoutOrder.count({ where: { applicationId: appId } })).toBe(0);
    });

    test('each company finance officer of the application`s organization gets the figures and the quotation number', async () => {
        const rows = await alerts();
        for (const officer of [fx.F, fx.F2]) {
            const mine = rows.filter((r) => r.userId === officer.id);
            expect(mine).toHaveLength(1);
            const text = `${mine[0].title} ${mine[0].message}`;
            expect(text).toContain(quotationNumber);
            expect(text).toContain('5885.00');
            expect(text).toContain('11770.00');
            expect(mine[0].metadata).toEqual(expect.objectContaining({
                quotationNumber, acceptedPhaseTotal: '5885.00', livePhaseTotal: '11770.00', milestone: 'M1',
            }));
        }
    });

    test('the platform admin gets the incident with no amount and no document number anywhere', async () => {
        const rows = await alerts();
        const mine = rows.filter((r) => r.userId === staff.platformAdmin);
        expect(mine).toHaveLength(1);
        const [row] = mine;
        const everything = JSON.stringify({ title: row.title, message: row.message, metadata: row.metadata });
        expect(everything).toContain(appId);
        const leaks = ['5885', '5,885', '11770', '11,770', 'บาท', quotationNumber]
            .filter((s) => everything.includes(s));
        expect(leaks).toEqual([]);
        expect(everything).not.toMatch(/\d\.\d{2}\b/);
        expect(Object.keys(row.metadata).filter((k) => /amount|total|quotation|price/i.test(k))).toEqual([]);
    });

    test('nobody else is told: no DTAM admin, no DTAM finance, no reviewer, no other organization`s finance', async () => {
        const rows = await alerts();
        const others = { dtamAdmin: fx.AD.id, dtamAdminOther: fx.ADX.id, dtamFinance: fx.FD.id, reviewer: staff.reviewer, financeOther: fx.FX.id };
        expect(Object.fromEntries(Object.entries(others).map(([k, id]) => [k, countFor(rows, id)])))
            .toEqual({ dtamAdmin: 0, dtamAdminOther: 0, dtamFinance: 0, reviewer: 0, financeOther: 0 });
        // Every recipient of either version, whoever else this database holds.
        const recipients = await F.raw.user.findMany({
            where: { id: { in: [...new Set(rows.map((r) => r.userId))] } },
            select: { role: true, organizationId: true },
        });
        const kinds = new Set(recipients.map((u) => (u.role === 'finance_officer_platform' && u.organizationId === fx.org
            ? 'company finance of the application`s organization'
            : u.role)));
        expect([...kinds].sort()).toEqual(['company finance of the application`s organization', 'system_admin_platform']);
    });

    // Jev, second opinion on this branch: a re-entered order already carries its instalment's invoice
    // (the pay press mints the order and its INV together), so the refusal there names that invoice,
    // which is what a payment refers to (order 54). Only a fresh mint has no invoice yet (order 55(a)).
    test('a re-entered order that drifted names its own invoice to company finance, and still nothing to the admin', async () => {
        const reentry = await F.quotedApplication('REENTRY');
        F.as(fx.A);
        const minted = await request(F.app).post('/api/payments/checkout').send({ applicationId: reentry, milestone: 'M1' });
        expect(minted.status).toBe(200);
        const order = await F.raw.checkoutOrder.findUnique({ where: { id: minted.body.data.checkoutOrderId } });
        const { invoiceNumber } = await F.raw.invoice.findUnique({ where: { id: order.invoiceId }, select: { invoiceNumber: true } });
        // A row minted before the drift gate: its stored figure is not what the applicant accepted.
        await F.raw.checkoutOrder.update({
            where: { id: order.id },
            data: { platformFeeNet: 6000, platformFeeVat: 420, platformFeeGross: 6420, totalPayableAmount: 6420 },
        });

        F.as(fx.A);
        const refused = await request(F.app).post('/api/payments/checkout').send({ applicationId: reentry, milestone: 'M1' });
        expect([refused.status, refused.body.error || refused.body.code]).toEqual([409, 'CHECKOUT_PRICE_DRIFT']);

        const rows = await F.raw.notification.findMany({
            where: { type: 'CHECKOUT_PRICE_DRIFT', metadata: { path: ['applicationId'], equals: reentry } },
        });
        const finance = rows.filter((r) => r.userId === fx.F.id);
        expect(finance).toHaveLength(1);
        expect(finance[0].message).toContain(invoiceNumber);
        expect(finance[0].message).toContain('6420.00');
        expect(finance[0].metadata).toEqual(expect.objectContaining({ invoiceNumber, livePhaseTotal: '6420.00' }));
        const admin = rows.filter((r) => r.userId === staff.platformAdmin);
        expect(admin).toHaveLength(1);
        expect(JSON.stringify(admin[0])).not.toContain(invoiceNumber);
    });

    test('dedup holds per version: an unread copy stops a repeat of its own version only', async () => {
        const platformAdmins = (await F.raw.user.findMany({
            where: { role: 'system_admin_platform' }, select: { id: true },
        })).map((u) => u.id);
        const markRead = (userIds) => F.raw.notification.updateMany({
            where: { type: 'CHECKOUT_PRICE_DRIFT', userId: { in: userIds }, metadata: { path: ['applicationId'], equals: appId } },
            data: { isRead: true },
        });
        const counts = async () => {
            const rows = await alerts();
            return { finance: countFor(rows, fx.F.id), finance2: countFor(rows, fx.F2.id), admin: countFor(rows, staff.platformAdmin) };
        };

        expect((await press()).status).toBe(409);
        expect(await counts()).toEqual({ finance: 1, finance2: 1, admin: 1 });

        await markRead([fx.F.id]);
        expect((await press()).status).toBe(409);
        expect(await counts()).toEqual({ finance: 1, finance2: 1, admin: 1 });

        await markRead([fx.F.id, fx.F2.id]);
        expect((await press()).status).toBe(409);
        expect(await counts()).toEqual({ finance: 2, finance2: 2, admin: 1 });

        await markRead(platformAdmins);
        expect((await press()).status).toBe(409);
        expect(await counts()).toEqual({ finance: 2, finance2: 2, admin: 2 });
    });
});

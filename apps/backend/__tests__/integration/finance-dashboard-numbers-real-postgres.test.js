'use strict';

/**
 * Dashboard numbers (approver/finance audit 2026-10-06 F11, order 29):
 *   - "รายรับเดือนนี้" was the all-time total; the month and all-time figures are now two
 *     labelled numbers, the month counted by the Bangkok month of the payment.
 *   - both are net of credit notes, so a refund (duplicate charge or provider
 *     cancellation) is not counted as revenue: a duplicate payment lands on a retired
 *     invoice, so the money refunded from it was never counted;
 *   - finance sees the revenue part of the analytics only (order 29), not applicant counts,
 *     provinces or workflow figures.
 * Real Postgres; the money is paid through checkout and settled by the webhook path, the
 * refunds are recorded through the finance doors.
 */

process.env.PAYMENT_ADAPTER = 'mock';
process.env.STRIPE_CHECKOUT_ENABLED = 'true';

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
jest.mock('../../services/redis-service', () => ({ get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(true) }));

const { createFinanceFixture } = require('./fixtures/finance-paid-fixture');

const money = (n) => Math.round(Number(n) * 100) / 100;

d('finance dashboard numbers (real Postgres)', () => {
    const F = createFinanceFixture({ prefix: 'dn', mockActor });
    const { fx } = F;
    const amounts = {};

    beforeAll(async () => {
        await F.setup();
        const lastMonth = await F.paidM1('LM');
        const paidAt = new Date(lastMonth.invoice.paidAt);
        paidAt.setUTCDate(paidAt.getUTCDate() - 40);
        await F.raw.invoice.update({ where: { id: lastMonth.invoice.id }, data: { paidAt } });
        const once = await F.paidM1('ONE');
        const twice = await F.paidM1Twice('TWO');
        const cancelled = await F.paidM1('CXL');

        F.as(fx.F);
        const dup = await request(F.app).post(`/api/finance/refunds/${twice.invoice.id}/duplicate-charge`)
            .send({ amount: money(twice.extraInvoice.totalAmount), idempotencyKey: `dup-${F.sfx}` });
        expect(dup.status).toBe(201);
        const cxl = await request(F.app).post(`/api/finance/refunds/${cancelled.invoice.id}/provider-cancellation`)
            .send({ reasonCode: 'COMPANY_STOPPED_SERVICE', note: 'บริษัทปิดบริการรับรองในพื้นที่นี้' });
        expect(cxl.status).toBe(201);

        amounts.lastMonth = money(lastMonth.invoice.totalAmount);
        // The second payment of TWO sits on its retired invoice and is refunded in full:
        // neither it nor its credit note is revenue. The cancelled milestone is credited.
        expect(twice.extraInvoice.isDeleted).toBe(true);
        amounts.thisMonthGross = money(once.invoice.totalAmount) + money(twice.invoice.totalAmount)
            + money(cancelled.invoice.totalAmount);
        amounts.credited = money(cancelled.invoice.totalAmount);
    }, 180000);
    afterAll(() => F.cleanup());

    test('the month and the all-time revenue are separate figures, both net of credit notes', async () => {
        F.as(fx.F);
        const res = await request(F.app).get('/api/invoices/summary');
        expect(res.status).toBe(200);
        const { revenue } = res.body.data;
        expect(revenue.month).toEqual({
            gross: money(amounts.thisMonthGross),
            credited: money(amounts.credited),
            net: money(amounts.thisMonthGross - amounts.credited),
        });
        expect(revenue.allTime).toEqual({
            gross: money(amounts.thisMonthGross + amounts.lastMonth),
            credited: money(amounts.credited),
            net: money(amounts.thisMonthGross + amounts.lastMonth - amounts.credited),
        });
        expect(res.body.data.month).toEqual(expect.objectContaining({ year: expect.any(Number), month: expect.any(Number) }));
    });

    test('the DTAM finance officer reads the same numbers; another organization reads none of them', async () => {
        F.as(fx.F);
        const own = await request(F.app).get('/api/invoices/summary');
        F.as(fx.FD);
        const dtam = await request(F.app).get('/api/invoices/summary');
        F.as(fx.FX);
        const other = await request(F.app).get('/api/invoices/summary');
        expect(dtam.body.data.revenue).toEqual(own.body.data.revenue);
        expect(other.body.data.revenue.allTime).toEqual({ gross: 0, credited: 0, net: 0 });
    });

    test('finance reads the revenue part of the analytics only, net of credit notes', async () => {
        F.as(fx.F);
        const res = await request(F.app).get('/api/reports/analytics?period=90');
        expect(res.status).toBe(200);
        expect(Object.keys(res.body.data).sort()).toEqual(['dailyStats', 'financial', 'period']);
        expect(res.body.data.financial.revenue).toBe(money(amounts.thisMonthGross + amounts.lastMonth - amounts.credited));
        expect(res.body.data.financial.refunded).toBe(money(amounts.credited));
        expect(Object.keys(res.body.data.dailyStats[0]).sort()).toEqual(['date', 'revenue']);
    });

    test('the DTAM admin still reads the whole analytics of its organization', async () => {
        F.as(fx.AD);
        const res = await request(F.app).get('/api/reports/analytics?period=90');
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual(expect.objectContaining({ applications: expect.any(Object), users: expect.any(Object) }));
    });
});

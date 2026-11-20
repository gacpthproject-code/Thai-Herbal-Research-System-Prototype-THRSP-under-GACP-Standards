'use strict';

/**
 * Order 29 (operator 2026-10-07): the company's books are written by the company's finance
 * officer only; the DTAM admin and the DTAM finance officer write nothing. An adjustment
 * entry, a purchase invoice and a period reopen are approved by a SECOND company finance
 * officer, never by the one who made them.
 * Order 17: every finance read stays inside the caller's organization; a caller with no
 * organization is refused, and the DTAM admin does not cross organizations.
 *
 * Real Postgres, real HTTP doors; only authentication is attached by hand.
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

const { createFinanceFixture } = require('./fixtures/finance-paid-fixture');

const DENIED = [400, 403];

d('company books: who writes, who checks, who reads (real Postgres)', () => {
    const F = createFinanceFixture({ prefix: 'cb', mockActor });
    const { fx } = F;
    let paid;

    beforeAll(async () => {
        await F.setup();
        paid = await F.paidM1('P1');
    }, 120000);
    afterAll(() => F.cleanup());

    const post = (url, body = {}) => request(F.app).post(url).send(body);
    const get = (url) => request(F.app).get(url);

    describe('order 29: DTAM-side roles never write the company books', () => {
        const writes = () => [
            ['debit note', () => post('/api/finance/debit-notes', {
                originalInvoiceId: paid.invoice.id, reasonCode: 'ADDITIONAL_CHARGE', reason: 'คิดค่าบริการขาด', subtotal: 100, vat: 7,
            })],
            ['WHT certificate', () => post('/api/finance/wht/certificate', {
                invoiceId: paid.invoice.id, certificateNumber: 'WHT-1', issuedByTaxId: '0105500000001',
                issuedByName: 'บริษัท ผู้ซื้อ', certificateDate: '2026-10-01', whtAmount: 165,
            })],
        ];

        test.each(['AD', 'FD'])('%s: every write door answers 403 and writes nothing', async (who) => {
            for (const [label, call] of writes()) {
                F.as(fx[who]);
                const res = await call();
                expect({ label, status: res.status }).toEqual({ label, status: 403 });
            }
            expect(await F.raw.debitNote.count({ where: { originalInvoiceId: paid.invoice.id } })).toBe(0);
        });

        test('the company finance officer writes a debit note on the company invoice', async () => {
            F.as(fx.F);
            const res = await post('/api/finance/debit-notes', {
                originalInvoiceId: paid.invoice.id, reasonCode: 'ADDITIONAL_CHARGE', reason: 'คิดค่าบริการขาด', subtotal: 100, vat: 7,
            });
            expect(res.status).toBe(201);
        });
    });

    describe('order 17: every finance read stays inside the caller organization', () => {
        const reads = [
            '/api/invoices/summary',
            '/api/invoices/export?type=monthly&month=10&year=2026',
            '/api/invoices/receipts/exceptions',
            '/api/finance/credit-notes',
            '/api/finance/debit-notes',
            '/api/finance/wht/certificates',
            `/api/finance/refunds/${'00000000-0000-4000-8000-000000000000'}/status`,
            '/api/reports/analytics',
        ];

        // Every stored user has an organization (User.organizationId NOT NULL), and the tenant
        // middleware fills a token without one from the user row; the caller with no
        // organization is a principal no user row answers for.
        test.each(reads)('a finance officer with no organization is refused: %s', async (url) => {
            F.as(fx.F, { id: crypto.randomUUID(), canonicalId: 'no-such-user', organizationId: null });
            const res = await get(url);
            expect(DENIED).toContain(res.status);
            expect(res.body.success).toBe(false);
        });

        test('the CSV export holds the caller organization\'s invoices', async () => {
            const [year, month] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit' })
                .format(new Date(paid.invoice.paidAt)).split('-').map(Number);
            const url = `/api/invoices/export?type=monthly&month=${month}&year=${year}`;
            F.as(fx.F);
            const own = await get(url);
            F.as(fx.FX);
            const other = await get(url);
            expect(own.status).toBe(200);
            expect(other.status).toBe(200);
            expect(own.text).toContain(paid.invoice.invoiceNumber);
            expect(other.text).not.toContain(paid.invoice.invoiceNumber);
        });
    });
});

'use strict';

/**
 * Finance documents (A3, 2026-10-08):
 *   payer      staff read the payer's tax fields only, no contact (order 18), and only an
 *              application of their own organization (order 17); the applicant's quotation
 *              keeps its contact line (payer-block rulings 2026-09-27).
 *   reference  a credit note refers to the ORIGINAL TAX INVOICE: the TAX-PRD number the
 *              settlement issued, not the INV- billing number (ป.รัษฎากร ม.86/10, ม.86/4).
 *   applicant  a payer charged twice sees the tax invoice of the second payment and the
 *              credit note that refunds it, and can download that credit note.
 *   transfer   the system never moves refund money (order 20); finance records the day the
 *              company's bank paid it and the bank reference (order 29), once.
 * Real Postgres; money paid through checkout and settled by the webhook path.
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

const invoiceTemplateService = require('../../services/pdf/invoice-template-service');
const { createFinanceFixture } = require('./fixtures/finance-paid-fixture');

const money = (n) => Math.round(Number(n) * 100) / 100;
const bangkokDay = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(date);

d('finance documents (real Postgres)', () => {
    const F = createFinanceFixture({ prefix: 'fd', mockActor });
    const { fx } = F;
    let twice;
    let creditNote;
    let rendered;

    beforeAll(async () => {
        await F.setup();
        F.state.app.use('/api/applications/:applicationId/quotations', require('../../routes/api/applications/quotations'));
        twice = await F.paidM1Twice('TWO');
        F.as(fx.F);
        const dup = await request(F.app).post(`/api/finance/refunds/${twice.invoice.id}/duplicate-charge`)
            .send({ amount: money(twice.extraInvoice.totalAmount), idempotencyKey: `dup-${F.sfx}` });
        expect(dup.status).toBe(201);
        creditNote = await F.raw.creditNote.findUnique({ where: { id: dup.body.data.creditNoteId } });
        jest.spyOn(invoiceTemplateService, 'generateCreditNotePdf').mockImplementation(async (note) => {
            rendered = note;
            return Buffer.from('%PDF-1.4 test');
        });
    }, 180000);
    afterAll(() => F.cleanup());

    describe('payer block', () => {
        test('finance reads the tax fields only, no contact name or phone', async () => {
            F.as(fx.F);
            const res = await request(F.app).get(`/api/applications/${twice.id}/quotations`);
            expect(res.status).toBe(200);
            expect(res.body.data.payer).toEqual(expect.objectContaining({ name: expect.any(String), address: expect.anything() }));
            expect(res.body.data.payer).not.toHaveProperty('phone');
            expect(res.body.data.payer).not.toHaveProperty('contactName');
        });

        test('finance of another organization does not read the application\'s quotation', async () => {
            F.as(fx.FX);
            const res = await request(F.app).get(`/api/applications/${twice.id}/quotations`);
            expect(res.status).toBe(404);
            expect(res.body.data).toBeUndefined();
        });

        test('the applicant\'s quotation keeps its contact line', async () => {
            F.as(fx.A);
            const res = await request(F.app).get(`/api/applications/${twice.id}/quotations`);
            expect(res.status).toBe(200);
            expect(res.body.data.payer).toHaveProperty('phone');
            expect(res.body.data.payer).toHaveProperty('contactName');
        });
    });

    describe('the credit note refers to the original tax invoice', () => {
        test('the printed reference is the TAX-PRD number of the refunded payment and its issue date', async () => {
            F.as(fx.F);
            const res = await request(F.app).get(`/api/finance/credit-notes/${creditNote.id}/pdf`);
            expect(res.status).toBe(200);
            expect(twice.extraInvoice.receiptNumber).toMatch(/^TAX-PRD-/);
            const printed = invoiceTemplateService.buildAdjustmentNoteContext(rendered, { docNumber: creditNote.creditNoteNumber });
            expect(printed.ORIGINAL_INVOICE_NUMBER).toBe(twice.extraInvoice.receiptNumber);
            expect(printed.ORIGINAL_INVOICE_NUMBER).not.toBe(twice.extraInvoice.invoiceNumber);
        });
    });

    describe('the applicant sees the second payment and its refund', () => {
        test('the second payment\'s tax invoice is in the applicant\'s list, with its receipt number', async () => {
            F.as(fx.A);
            const res = await request(F.app).get('/api/invoices/my');
            expect(res.status).toBe(200);
            const second = res.body.data.find((i) => i.id === twice.extraInvoice.id);
            expect(second).toEqual(expect.objectContaining({ receiptNumber: twice.extraInvoice.receiptNumber }));
        });

        test('negative control: a retired invoice with no tax invoice stays out of the list', async () => {
            const ghost = await F.raw.invoice.create({
                data: {
                    invoiceNumber: `INV-GHOST-${F.sfx}`, applicationId: twice.id, healthId: fx.A.canonicalId,
                    serviceType: 'CERTIFICATION_CHECKOUT_M1', subtotal: 1, vat: 0, totalAmount: 1,
                    dueDate: new Date(), status: 'cancelled', isDeleted: true, organizationId: fx.org,
                },
            });
            F.as(fx.A);
            const res = await request(F.app).get('/api/invoices/my');
            expect(res.body.data.map((i) => i.id)).not.toContain(ghost.id);
        });

        test('the credit note is listed with the tax invoice it refers to, and downloads', async () => {
            F.as(fx.A);
            const list = await request(F.app).get(`/api/finance/credit-notes?originalInvoiceId=${twice.extraInvoice.id}`);
            expect(list.status).toBe(200);
            expect(list.body.data).toEqual([expect.objectContaining({
                id: creditNote.id,
                creditNoteNumber: creditNote.creditNoteNumber,
                originalInvoice: expect.objectContaining({ receiptNumber: twice.extraInvoice.receiptNumber }),
            })]);
            const pdf = await request(F.app).get(`/api/invoices/my/${twice.extraInvoice.id}/credit-notes/${creditNote.id}/pdf`);
            expect(pdf.status).toBe(200);
            expect(pdf.headers['content-type']).toMatch(/application\/pdf/);
        });

        test('another applicant does not download it', async () => {
            const stranger = await F.raw.user.create({
                data: {
                    canonicalId: `fd-stranger-${F.sfx}`, healthId: `fd-stranger-${F.sfx}`, password: 'x', role: 'health',
                    authType: 'EMAIL_LEGACY', email: `fd-stranger-${F.sfx}@example.test`, firstName: 'ทดสอบ', lastName: 'คนอื่น',
                    organizationId: fx.org,
                },
            });
            fx.userIds.push(stranger.id);
            F.as({ ...stranger, role: 'health' });
            const pdf = await request(F.app).get(`/api/invoices/my/${twice.extraInvoice.id}/credit-notes/${creditNote.id}/pdf`);
            expect(pdf.status).toBe(404);
        });
    });

    describe('refund transferred outside the system', () => {
        const url = () => `/api/finance/credit-notes/${creditNote.id}/refund-transfer`;
        const today = () => bangkokDay(new Date());

        // Another organization's company finance officer is told the note does not exist, as for a
        // random id (R2-L2): a 403 there confirmed the id. Every other role is refused by its role.
        test('only the company finance officer records it', async () => {
            for (const [who, status, code] of [
                ['FD', 403, 'FORBIDDEN_ROLE'], ['AD', 403, 'FORBIDDEN_ROLE'], ['A', 403, 'FORBIDDEN_ROLE'],
                ['FX', 404, 'CREDIT_NOTE_NOT_FOUND'],
            ]) {
                F.as(fx[who]);
                const res = await request(F.app).post(url()).send({ transferredOn: today(), bankReference: 'KBANK-123456' });
                expect({ who, status: res.status, code: res.body.error }).toEqual({ who, status, code });
            }
            expect((await F.raw.creditNote.findUnique({ where: { id: creditNote.id } })).refundTransferredOn).toBeNull();
        });

        test.each([
            ['a future day', { transferredOn: '2999-01-01', bankReference: 'KBANK-123456' }],
            ['no bank reference', { transferredOn: '2026-10-08', bankReference: ' ' }],
            ['a day before the credit note', { transferredOn: '2020-01-01', bankReference: 'KBANK-123456' }],
            ['a malformed day', { transferredOn: '8/10/2569', bankReference: 'KBANK-123456' }],
        ])('refuses %s and writes nothing', async (_label, body) => {
            F.as(fx.F);
            const res = await request(F.app).post(url()).send(body);
            expect(res.status).toBe(400);
            expect((await F.raw.creditNote.findUnique({ where: { id: creditNote.id } })).refundTransferredOn).toBeNull();
        });

        test('records the day and the reference once; the same record again is a no-op, a different one is refused', async () => {
            F.as(fx.F);
            const first = await request(F.app).post(url()).send({ transferredOn: today(), bankReference: ' KBANK-123456 ' });
            expect(first.status).toBe(200);
            const again = await request(F.app).post(url()).send({ transferredOn: today(), bankReference: 'KBANK-123456' });
            expect(again.status).toBe(200);
            const other = await request(F.app).post(url()).send({ transferredOn: today(), bankReference: 'SCB-999' });
            expect(other.status).toBe(409);
            const row = await F.raw.creditNote.findUnique({ where: { id: creditNote.id } });
            expect(bangkokDay(row.refundTransferredOn)).toBe(today());
            expect(row.refundBankReference).toBe('KBANK-123456');
            expect(row.refundTransferRecordedBy).toBe(fx.F.id);
        });

        test('the refund view and the applicant\'s credit note show it; the applicant sees no staff id', async () => {
            F.as(fx.F);
            const status = await request(F.app).get(`/api/finance/refunds/${twice.invoice.id}/status`);
            expect(status.body.data.duplicateChargeRefunds).toEqual([expect.objectContaining({
                creditNoteId: creditNote.id, refundTransferredOn: today(), refundBankReference: 'KBANK-123456',
            })]);
            F.as(fx.A);
            const list = await request(F.app).get(`/api/finance/credit-notes?originalInvoiceId=${twice.extraInvoice.id}`);
            expect(list.body.data[0]).toEqual(expect.objectContaining({ refundBankReference: 'KBANK-123456' }));
            expect(list.body.data[0]).not.toHaveProperty('refundTransferRecordedBy');
        });
    });
});

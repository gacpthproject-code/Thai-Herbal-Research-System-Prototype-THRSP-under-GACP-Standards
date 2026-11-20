'use strict';

/**
 * B0 fix/finance-read-leaks (billing-reconciliation spec 13.5, first five rows; question ค6,
 * answer ก, order 64). Each leak through the real HTTP door on a real Postgres:
 *
 *   1  GET /api/invoices/my answers the payer's columns only: no healthId (the filer's national
 *      ID while APP_FK_USE_TOKEN is off) and no metadata (staff refund notes, the WHT payer's
 *      tax id), so a co-member of the holder never reads them (order 10).
 *   3  The staff invoice doors never return metadata. The staff invoice and quotation reads give
 *      the payer's tax id in full to the company finance officer only (order 57) and masked,
 *      first digit and last four, to every other reader (orders 10, 34). The staff PDF doors of
 *      every finance document open to the company finance officer only, because the paper prints
 *      the tax id in full by law (order 64 ค6 ก): DTAM finance and the DTAM admin get 403.
 *   4  The staff receipt and quotation PDF doors keep to the caller's organization by
 *      themselves: another organization's id answers 404 with the automatic tenant filter off.
 *   5  The customer statement masks the national ID in the order-10 shape.
 *
 * Round 2, from the security review of 1b554df0c:
 *   I6 The credit-note and debit-note doors answer another organization's id exactly as an id
 *      that does not exist (404), as the receipt and quotation doors do: a 403 confirmed that the
 *      id exists. The role refusal stays 403.
 *   L2 The payer's credit-note list and quotation doors carry named columns only, as the
 *      invoice list does: a column added to either table later stays on the server.
 *
 * Only authentication is attached by hand; the PDF renderer is replaced by a stub because
 * what is under test is who reaches it, not the paper.
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
const { raceOnRow } = require('./fixtures/row-lock-race');
const invoiceTemplateService = require('../../services/pdf/invoice-template-service');
const { getZonedParts } = require('../../utils/working-days');

// Checksum-valid (DOPA mod-11) juristic tax id, and its order-10 mask written out by hand.
const COMPANY_TAX_ID = '0105561234560';
const COMPANY_TAX_ID_MASKED = '0-XXXX-XXXX-X-4560';
const WHT_PAYER_TAX_ID = '0105561234560';

/** What the payer's own invoice list may carry: its bill, never a staff or system field. */
const APPLICANT_INVOICE_KEYS = new Set([
    'id', 'invoiceNumber', 'applicationId', 'application', 'serviceType', 'subtotal', 'vat',
    'totalAmount', 'dueDate', 'status', 'paidAt', 'receiptNumber', 'receiptIssuedAt', 'createdAt',
    'lineItems', 'erpStatus', 'canonicalServiceType', 'issuerSide', 'service',
    // TRIAL, LIVE or null, derived on the server from metadata; the enum carries no personal or tax data.
    'paymentMode',
]);
const APPLICANT_LINE_ITEM_KEYS = new Set([
    'id', 'lineNumber', 'code', 'description', 'quantity', 'unitPrice', 'amount', 'phase', 'isTaxable',
]);

/** What the payer's refund panel reads from its credit-note list (RefundVisibilitySection). */
const APPLICANT_CREDIT_NOTE_KEYS = new Set([
    'id', 'creditNoteNumber', 'originalInvoiceId', 'originalInvoice', 'reason', 'reasonCode', 'subtotal', 'vat',
    'totalAmount', 'status', 'issuedAt', 'postedAt', 'refundTransferredOn', 'refundBankReference', 'createdAt',
]);
/** What the payer's quotation screens read from a quotation row (QuotationRecord in the web app). */
const APPLICANT_QUOTATION_KEYS = new Set([
    'id', 'applicationId', 'issuerType', 'quotationNumber', 'subtotal', 'vat', 'totalAmount', 'installments',
    'status', 'validUntil', 'acceptedAt', 'acceptedSnapshot', 'phase1InvoicedAt', 'phase2InvoicedAt', 'createdAt',
    'lineItems', 'scopeMismatch', 'applicationScopeCount',
]);

const digitsOf = (value) => String(value ?? '').replace(/\D/g, '');
const extraKeys = (row, allowed) => Object.keys(row).filter((k) => !allowed.has(k));

/** With the automatic tenant read filter set as given ('false' is what the kill-switch allows). */
async function withTenantBackstop(value, run) {
    const saved = process.env.TENANT_READ_ORG_SCOPE;
    process.env.TENANT_READ_ORG_SCOPE = value;
    try { return await run(); }
    finally {
        if (saved === undefined) { delete process.env.TENANT_READ_ORG_SCOPE; } else { process.env.TENANT_READ_ORG_SCOPE = saved; }
    }
}
const withoutTenantBackstop = (run) => withTenantBackstop('false', run);

d('finance read leaks, B0 (real Postgres)', () => {
    const F = createFinanceFixture({ prefix: 'rl', mockActor });
    const { fx } = F;
    const get = (url) => request(F.app).get(url);
    const post = (url, body = {}) => request(F.app).post(url).send(body);

    const STAFF_NOTE = `staff-refund-note-${crypto.randomUUID().slice(0, 8)}`;
    const paper = Buffer.from('%PDF-1.4 stub');
    const spies = [];
    let paid;
    let creditNoteId;
    let debitNoteId;
    let statementUser;

    beforeAll(async () => {
        await F.setup();
        F.app.use('/api/applications/:applicationId/quotations', require('../../routes/api/applications/quotations'));
        await F.raw.entity.update({ where: { id: fx.C }, data: { juristicId: COMPANY_TAX_ID } });

        paid = await F.paidM1('LEAK');
        await F.raw.invoice.update({
            where: { id: paid.invoice.id },
            data: { metadata: { refund: { note: STAFF_NOTE }, whtCertificate: { issuedByTaxId: WHT_PAYER_TAX_ID } } },
        });

        F.as(fx.F);
        const cn = await post('/api/finance/credit-notes', {
            originalInvoiceId: paid.invoice.id, reasonCode: 'PRICE_REDUCTION', reason: 'ปรับยอดตามที่ตกลงกับผู้ซื้อ', subtotal: 100, vat: 7,
        });
        expect(cn.status).toBe(201);
        creditNoteId = cn.body.data.id;
        expect((await post(`/api/finance/credit-notes/${creditNoteId}/issue`)).status).toBe(200);
        const dn = await post('/api/finance/debit-notes', {
            originalInvoiceId: paid.invoice.id, reasonCode: 'CORRECTION', reason: 'เรียกเก็บส่วนที่คิดขาดตามข้อตกลง', subtotal: 100, vat: 7,
        });
        expect(dn.status).toBe(201);
        debitNoteId = dn.body.data.id;
        expect((await post(`/api/finance/debit-notes/${debitNoteId}/issue`)).status).toBe(200);

        // A person whose canonical id is a 13-digit national ID, as on a row written while
        // APP_FK_USE_TOKEN was off.
        const nationalId = `9${String(crypto.randomInt(0, 1e12)).padStart(12, '0')}`;
        statementUser = { id: crypto.randomUUID(), nationalId };
        await F.raw.user.create({
            data: {
                id: statementUser.id, canonicalId: nationalId, healthId: nationalId, password: 'x', role: 'health',
                authType: 'EMAIL_LEGACY', email: `rl-statement-${F.sfx}@example.test`, firstName: 'ทดสอบ',
                lastName: 'ใบแจ้งยอด', organizationId: fx.org,
            },
        });
        fx.userIds.push(statementUser.id);

        // The platform's own admin crosses organizations and reads no finance at all (order 47).
        const platformAdminId = crypto.randomUUID();
        await F.raw.user.create({
            data: {
                id: platformAdminId, canonicalId: `rl-adminplat-${F.sfx}`, healthId: `rl-adminplat-${F.sfx}`, password: 'x',
                role: 'system_admin_platform', authType: 'EMAIL_LEGACY', email: `rl-adminplat-${F.sfx}@example.test`,
                firstName: 'ทดสอบ', lastName: 'adminplat', organizationId: fx.org,
            },
        });
        fx.userIds.push(platformAdminId);
        fx.AP = { id: platformAdminId, canonicalId: `rl-adminplat-${F.sfx}`, role: 'system_admin_platform', organizationId: fx.org };

        for (const name of ['generateReceiptTaxInvoicePdf', 'generateQuotationPdf', 'generateCreditNotePdf', 'generateDebitNotePdf']) {
            spies.push(jest.spyOn(invoiceTemplateService, name).mockResolvedValue(paper));
        }
    }, 120000);

    afterAll(async () => {
        for (const spy of spies) { spy.mockRestore(); }
        await F.cleanup();
    });

    const rendered = () => spies.reduce((n, spy) => n + spy.mock.calls.length, 0);

    describe('1. the payer\'s invoice list carries the payer\'s columns only', () => {
        test('GET /api/invoices/my has no healthId, no metadata, no staff note and no WHT tax id', async () => {
            F.as(fx.A);
            const res = await get('/api/invoices/my');
            expect(res.status).toBe(200);
            const row = res.body.data.find((r) => r.id === paid.invoice.id);
            expect(row).toBeDefined();
            for (const r of res.body.data) {
                expect(Object.keys(r).filter((k) => !APPLICANT_INVOICE_KEYS.has(k))).toEqual([]);
                expect([null, 'TRIAL', 'LIVE']).toContain(r.paymentMode);
                for (const li of r.lineItems || []) {
                    expect(Object.keys(li).filter((k) => !APPLICANT_LINE_ITEM_KEYS.has(k))).toEqual([]);
                }
                if (r.application) { expect(Object.keys(r.application)).toEqual(['applicationNumber']); }
            }
            const text = JSON.stringify(res.body);
            expect(text).not.toContain(STAFF_NOTE);
            expect(text).not.toContain(WHT_PAYER_TAX_ID);
            expect(text).not.toContain(fx.A.canonicalId);
            expect(row).toEqual(expect.objectContaining({
                invoiceNumber: paid.invoice.invoiceNumber, receiptNumber: paid.invoice.receiptNumber,
            }));
        });
    });

    describe('3. staff reads: no metadata; the tax id in full for company finance only', () => {
        test.each([
            ['finance_officer_dtam', 'FD', COMPANY_TAX_ID_MASKED],
            ['system_admin_dtam', 'AD', COMPANY_TAX_ID_MASKED],
        ])('GET /api/invoices/:id as %s → no metadata, payer id masked', async (_role, who, masked) => {
            F.as(fx[who]);
            const res = await get(`/api/invoices/${paid.invoice.id}`);
            expect(res.status).toBe(200);
            expect(res.body.data).not.toHaveProperty('metadata');
            expect(res.body.data.payer.idPrinted).toBe(masked);
            expect(JSON.stringify(res.body)).not.toContain(COMPANY_TAX_ID);
            expect(JSON.stringify(res.body)).not.toContain(STAFF_NOTE);
        });

        test('GET /api/invoices/:id as finance_officer_platform → no metadata, payer id in full (order 57)', async () => {
            F.as(fx.F);
            const res = await get(`/api/invoices/${paid.invoice.id}`);
            expect(res.status).toBe(200);
            expect(res.body.data).not.toHaveProperty('metadata');
            expect(digitsOf(res.body.data.payer.idPrinted)).toBe(COMPANY_TAX_ID);
        });

        test('system_admin_platform reads neither the staff invoice doors nor the quotation list (order 47)', async () => {
            const answers = [];
            for (const url of ['/api/invoices', `/api/invoices/${paid.invoice.id}`, `/api/applications/${paid.id}/quotations`]) {
                F.as(fx.AP);
                answers.push([url, (await get(url)).status]);
            }
            expect(answers.map(([, status]) => status)).toEqual([403, 403, 403]);
        });

        test('GET /api/invoices (staff list) never carries metadata', async () => {
            F.as(fx.FD);
            const res = await get('/api/invoices');
            expect(res.status).toBe(200);
            const rows = res.body.data.invoices;
            expect(rows.some((r) => r.id === paid.invoice.id)).toBe(true);
            for (const r of rows) { expect(r).not.toHaveProperty('metadata'); }
            expect(JSON.stringify(res.body)).not.toContain(STAFF_NOTE);
        });

        test.each([
            ['finance_officer_dtam', 'FD'],
            ['system_admin_dtam', 'AD'],
        ])('GET /api/applications/:id/quotations as %s → payer id masked', async (_role, who) => {
            F.as(fx[who]);
            const res = await get(`/api/applications/${paid.id}/quotations`);
            expect(res.status).toBe(200);
            expect(res.body.data.payer.idPrinted).toBe(COMPANY_TAX_ID_MASKED);
            expect(JSON.stringify(res.body)).not.toContain(COMPANY_TAX_ID);
        });

        test('GET /api/applications/:id/quotations as finance_officer_platform → payer id in full', async () => {
            F.as(fx.F);
            const res = await get(`/api/applications/${paid.id}/quotations`);
            expect(res.status).toBe(200);
            expect(digitsOf(res.body.data.payer.idPrinted)).toBe(COMPANY_TAX_ID);
        });
    });

    describe('3. staff PDF doors of finance documents: company finance only (order 64 ค6 ก)', () => {
        const doors = () => [
            ['receipt', `/api/invoices/${paid.invoice.id}/receipt/pdf`],
            ['quotation', `/api/applications/${paid.id}/quotations/PLATFORM/pdf`],
            ['credit note', `/api/finance/credit-notes/${creditNoteId}/pdf`],
            ['debit note', `/api/finance/debit-notes/${debitNoteId}/pdf`],
        ];

        test.each([
            ['finance_officer_dtam', 'FD'],
            ['system_admin_dtam', 'AD'],
            ['system_admin_platform', 'AP'],
        ])('%s gets 403 at every staff finance PDF door and no paper is rendered', async (_role, who) => {
            const before = rendered();
            const answers = [];
            for (const [name, url] of doors()) {
                F.as(fx[who]);
                answers.push([name, (await get(url)).status]);
            }
            expect(answers).toEqual(doors().map(([name]) => [name, 403]));
            expect(rendered()).toBe(before);
        });

        test('finance_officer_platform downloads every one of them', async () => {
            const answers = [];
            for (const [name, url] of doors()) {
                F.as(fx.F);
                const res = await get(url);
                answers.push([name, res.status, res.headers['content-type']]);
            }
            expect(answers).toEqual(doors().map(([name]) => [name, 200, 'application/pdf']));
        });

        test('the applicant still downloads the quotation of its own application', async () => {
            F.as(fx.A);
            const res = await get(`/api/applications/${paid.id}/quotations/PLATFORM/pdf`);
            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toBe('application/pdf');
        });
    });

    describe('4. the staff receipt and quotation PDF doors keep to the caller\'s organization themselves', () => {
        test.each([
            ['receipt', () => `/api/invoices/${paid.invoice.id}/receipt/pdf`],
            ['quotation', () => `/api/applications/${paid.id}/quotations/PLATFORM/pdf`],
        ])('another organization\'s company finance officer asking for this %s gets 404 and no paper', async (_name, url) => {
            await withoutTenantBackstop(async () => {
                const before = rendered();
                F.as(fx.FX);
                const res = await get(url());
                expect(res.status).toBe(404);
                expect(rendered()).toBe(before);
            });
        });
    });

    describe('4b. the credit-note and debit-note doors answer another organization\'s id as one that does not exist (I6, R2-L2)', () => {
        const doors = () => [
            ['credit-note PDF', `/api/finance/credit-notes/${creditNoteId}/pdf`, `/api/finance/credit-notes/${crypto.randomUUID()}/pdf`],
            ['debit-note PDF', `/api/finance/debit-notes/${debitNoteId}/pdf`, `/api/finance/debit-notes/${crypto.randomUUID()}/pdf`],
            ['credit-note detail', `/api/finance/credit-notes/${creditNoteId}`, `/api/finance/credit-notes/${crypto.randomUUID()}`],
            ['debit-note detail', `/api/finance/debit-notes/${debitNoteId}`, `/api/finance/debit-notes/${crypto.randomUUID()}`],
            ['refund status', `/api/finance/refunds/${paid.invoice.id}/status`, `/api/finance/refunds/${crypto.randomUUID()}/status`],
        ];

        test.each(['false', 'true'])('TENANT_READ_ORG_SCOPE=%s: another organization\'s company finance officer gets the not-found answer, and no paper', async (backstop) => {
            await withTenantBackstop(backstop, async () => {
                const before = rendered();
                const answers = [];
                for (const [name, url, missingUrl] of doors()) {
                    F.as(fx.FX);
                    const res = await get(url);
                    F.as(fx.FX);
                    const missing = await get(missingUrl);
                    answers.push([name, res.status, res.body, missing.status, missing.body]);
                }
                expect(answers).toEqual(answers.map(([name, , , status, body]) => [name, 404, body, status, body]));
                expect(answers.map(([, , , status]) => status)).toEqual([404, 404, 404, 404, 404]);
                expect(rendered()).toBe(before);
            });
        });

        test('the role refusal stays 403: DTAM finance of another organization asking for the PDFs', async () => {
            const answers = [];
            for (const [name, url] of doors().slice(0, 2)) {
                F.as(fx.ADX);
                answers.push([name, (await get(url)).status]);
            }
            expect(answers).toEqual([['credit-note PDF', 403], ['debit-note PDF', 403]]);
        });

        test('the company finance officer of the organization still opens all four', async () => {
            const answers = [];
            for (const [name, url] of doors()) {
                F.as(fx.F);
                answers.push([name, (await get(url)).status]);
            }
            expect(answers).toEqual(doors().map(([name]) => [name, 200]));
        });

        // R2-L2 (security re-review of 33d8c40fe): the WRITE doors answered 403 FORBIDDEN_TENANT for
        // another organization's real id and 404 for a random one, so the answer confirmed the id.
        // Each door is asked twice, once with the real id and once with a random one, and the two
        // answers must be the same answer: status, code and body.
        const whtCertificate = (invoiceId) => ({
            invoiceId, certificateNumber: `WHT-RL-${F.sfx}`, issuedByTaxId: WHT_PAYER_TAX_ID,
            issuedByName: 'บริษัท ผู้ซื้อทดสอบ จำกัด', certificateDate: '2026-10-01', whtAmount: 15,
        });
        const writeDoors = () => {
            const missing = crypto.randomUUID();
            const note = (kind, id, verb) => `/api/finance/${kind}/${id}/${verb}`;
            const create = (kind, invoiceId) => [`/api/finance/${kind}`, {
                originalInvoiceId: invoiceId, reasonCode: 'CORRECTION', reason: 'ทดสอบประตูเขียนขององค์กรอื่น', subtotal: 10, vat: 0.7,
            }];
            const transfer = { transferredOn: '2026-10-01', bankReference: 'REF-0001' };
            const duplicate = { amount: 1, idempotencyKey: `rl-dup-${F.sfx}` };
            const cancellation = { reasonCode: 'COMPANY_STOPPED_SERVICE', note: 'ทดสอบประตูคืนเงินขององค์กรอื่น' };
            return [
                ['credit-note issue', [note('credit-notes', creditNoteId, 'issue'), {}], [note('credit-notes', missing, 'issue'), {}]],
                ['credit-note post', [note('credit-notes', creditNoteId, 'post'), {}], [note('credit-notes', missing, 'post'), {}]],
                ['credit-note cancel', [note('credit-notes', creditNoteId, 'cancel'), { reason: 'ยกเลิกทดสอบ' }], [note('credit-notes', missing, 'cancel'), { reason: 'ยกเลิกทดสอบ' }]],
                ['credit-note refund-transfer', [note('credit-notes', creditNoteId, 'refund-transfer'), transfer], [note('credit-notes', missing, 'refund-transfer'), transfer]],
                ['debit-note issue', [note('debit-notes', debitNoteId, 'issue'), {}], [note('debit-notes', missing, 'issue'), {}]],
                ['debit-note post', [note('debit-notes', debitNoteId, 'post'), {}], [note('debit-notes', missing, 'post'), {}]],
                ['debit-note cancel', [note('debit-notes', debitNoteId, 'cancel'), { reason: 'ยกเลิกทดสอบ' }], [note('debit-notes', missing, 'cancel'), { reason: 'ยกเลิกทดสอบ' }]],
                ['credit-note create', create('credit-notes', paid.invoice.id), create('credit-notes', missing)],
                ['debit-note create', create('debit-notes', paid.invoice.id), create('debit-notes', missing)],
                // The refund doors write a credit note too, and asked the same way.
                ['refund duplicate-charge', [`/api/finance/refunds/${paid.invoice.id}/duplicate-charge`, duplicate], [`/api/finance/refunds/${missing}/duplicate-charge`, duplicate]],
                ['refund provider-cancellation', [`/api/finance/refunds/${paid.invoice.id}/provider-cancellation`, cancellation], [`/api/finance/refunds/${missing}/provider-cancellation`, cancellation]],
                // The WHT certificate door writes the invoice too (review of 163f352e9, L2).
                ['WHT certificate', ['/api/finance/wht/certificate', whtCertificate(paid.invoice.id)], ['/api/finance/wht/certificate', whtCertificate(missing)]],
            ];
        };
        const askBoth = async (as) => {
            const answers = [];
            for (const [name, [url, body], [missingUrl, missingBody]] of writeDoors()) {
                as();
                const real = await post(url, body);
                as();
                const random = await post(missingUrl, missingBody);
                answers.push({ door: name, real: [real.status, real.body], random: [random.status, random.body] });
            }
            return answers;
        };
        const sameAnswer = (answers) => answers.map(({ door, random }) => ({ door, real: random, random }));

        test('another organization`s company finance officer gets the not-found answer from every write door, and nothing changes', async () => {
            const before = await F.raw.creditNote.findUnique({ where: { id: creditNoteId } });
            const answers = await askBoth(() => F.as(fx.FX));
            expect(answers).toEqual(sameAnswer(answers));
            expect(answers.map(({ door, real }) => [door, real[0]])).toEqual(writeDoors().map(([door]) => [door, 404]));
            const after = await F.raw.creditNote.findUnique({ where: { id: creditNoteId } });
            expect(after.status).toBe(before.status);
            expect(await F.raw.creditNote.count({ where: { originalInvoiceId: paid.invoice.id } })).toBe(1);
            expect(await F.raw.debitNote.count({ where: { originalInvoiceId: paid.invoice.id } })).toBe(1);
        });

        // Jev, second opinion on the final head: the refund doors and the credit-note create door took a
        // row lock on the invoice before asking whose it was, so another organization's request waited
        // on this organization's transaction, and the wait itself told it the id exists. The answer must
        // come while the lock is still held. The refund-transfer door locked the credit note and the WHT
        // certificate door the invoice the same way (review of 163f352e9, L1 and L2).
        test('another organization`s request never waits on this organization`s locks on the invoice and its credit note', async () => {
            let lockTaken;
            const locked = new Promise((resolve) => { lockTaken = resolve; });
            let releasedAt = 0;
            const holder = F.raw.$transaction(async (tx) => {
                await tx.$queryRaw`SELECT id FROM "invoices" WHERE id = ${paid.invoice.id} FOR UPDATE`;
                await tx.$queryRaw`SELECT id FROM "credit_notes" WHERE id = ${creditNoteId} FOR UPDATE`;
                lockTaken();
                await new Promise((resolve) => { setTimeout(resolve, 4000); });
                releasedAt = Date.now();
            }, { timeout: 20000 });
            await locked;

            const answers = [];
            for (const [door, send] of [
                ['refund duplicate-charge', () => post(`/api/finance/refunds/${paid.invoice.id}/duplicate-charge`, { amount: 1, idempotencyKey: `rl-lock-${F.sfx}` })],
                ['credit-note create', () => post('/api/finance/credit-notes', {
                    originalInvoiceId: paid.invoice.id, reasonCode: 'CORRECTION', reason: 'ทดสอบล็อกขององค์กรอื่น', subtotal: 10, vat: 0.7,
                })],
                ['credit-note refund-transfer', () => post(`/api/finance/credit-notes/${creditNoteId}/refund-transfer`, {
                    transferredOn: '2026-10-01', bankReference: 'REF-LOCK-1',
                })],
                ['WHT certificate', () => post('/api/finance/wht/certificate', whtCertificate(paid.invoice.id))],
            ]) {
                F.as(fx.FX);
                const res = await send();
                answers.push({ door, status: res.status, answeredAt: Date.now() });
            }
            await holder;
            expect(answers.map(({ door, status, answeredAt }) => ({ door, status, beforeRelease: answeredAt < releasedAt })))
                .toEqual([
                    { door: 'refund duplicate-charge', status: 404, beforeRelease: true },
                    { door: 'credit-note create', status: 404, beforeRelease: true },
                    { door: 'credit-note refund-transfer', status: 404, beforeRelease: true },
                    { door: 'WHT certificate', status: 404, beforeRelease: true },
                ]);
        });

        // Check of f45c9a987, Low-1: a row can move to another organization or be deleted while this
        // organization's request waits on its lock, so each door asks again under the lock and answers as
        // it does for a row already in that state.
        const lockedDoors = {
            'credit-note refund-transfer': async () => {
                const { invoice } = await F.paidM1(crypto.randomUUID().slice(0, 8));
                F.as(fx.F);
                const made = await post('/api/finance/credit-notes', {
                    originalInvoiceId: invoice.id, reasonCode: 'PRICE_REDUCTION', reason: 'ปรับยอดตามที่ตกลงกับผู้ซื้อ', subtotal: 100, vat: 7,
                });
                expect(made.status).toBe(201);
                const id = made.body.data.id;
                for (const verb of ['issue', 'post']) { expect((await post(`/api/finance/credit-notes/${id}/${verb}`)).status).toBe(200); }
                return {
                    row: { table: 'credit_notes', model: 'creditNote', id },
                    url: `/api/finance/credit-notes/${id}/refund-transfer`,
                    body: { transferredOn: getZonedParts(new Date()).isoDate, bankReference: 'REF-WAITED-1' },
                    written: async () => (await F.raw.creditNote.findUnique({ where: { id } })).refundTransferredOn !== null,
                };
            },
            'WHT certificate': async () => {
                const { invoice } = await F.paidM1(crypto.randomUUID().slice(0, 8));
                // The WHT door writes only a legacy platform-fee invoice today (check of f45c9a987, Info 2).
                await F.raw.invoice.update({ where: { id: invoice.id }, data: { serviceType: 'PHASE_1_PLATFORM_FEE' } });
                return {
                    row: { table: 'invoices', model: 'invoice', id: invoice.id },
                    url: '/api/finance/wht/certificate',
                    body: whtCertificate(invoice.id),
                    written: async () => Boolean((await F.raw.invoice.findUnique({ where: { id: invoice.id } })).metadata?.whtCertificate),
                };
            },
            // The duplicate-charge refund credits the extra payment's own invoice, so nothing after the
            // milestone invoice's lock asks again whose that invoice is.
            'refund duplicate-charge': async () => {
                const { invoice, extraInvoice } = await F.paidM1Twice(crypto.randomUUID().slice(0, 8));
                return {
                    row: { table: 'invoices', model: 'invoice', id: invoice.id },
                    url: `/api/finance/refunds/${invoice.id}/duplicate-charge`,
                    body: { amount: 1, idempotencyKey: crypto.randomUUID() },
                    written: async () => (await F.raw.creditNote.count({
                        where: { originalInvoiceId: { in: [invoice.id, extraInvoice.id] } },
                    })) > 0,
                };
            },
        };
        const changesWhileWaiting = {
            'moved to another organization': () => ({ organizationId: fx.otherOrg }),
            'soft-deleted': () => ({ isDeleted: true }),
        };

        test.each([
            ['credit-note refund-transfer', 'moved to another organization', 404, 'CREDIT_NOTE_NOT_FOUND'],
            ['credit-note refund-transfer', 'soft-deleted', 404, 'CREDIT_NOTE_NOT_FOUND'],
            ['WHT certificate', 'moved to another organization', 404, 'INVOICE_NOT_FOUND'],
            ['WHT certificate', 'soft-deleted', 410, 'INVOICE_DELETED'],
            ['refund duplicate-charge', 'moved to another organization', 404, 'INVOICE_NOT_FOUND'],
            ['refund duplicate-charge', 'soft-deleted', 410, 'INVOICE_DELETED'],
        ])('%s: a row %s while the request waited on its lock answers %i %s and nothing is written', async (door, change, status, code) => {
            const { row, url, body, written } = await lockedDoors[door]();
            const [answer] = await raceOnRow(F.raw, row, [() => { F.as(fx.F); return post(url, body).then((res) => res); }], {
                beforeRelease: (tx) => tx[row.model].update({ where: { id: row.id }, data: changesWhileWaiting[change]() }),
            });
            expect({ status: answer.status, code: answer.body.error, written: await written() })
                .toEqual({ status, code, written: false });
        }, 60000);

        test('the role refusal stays 403 and does not depend on the id: DTAM admin of another organization', async () => {
            const answers = await askBoth(() => F.as(fx.ADX));
            expect(answers).toEqual(sameAnswer(answers));
            expect(answers.map(({ door, real }) => [door, real[0], real[1].error])).toEqual(
                writeDoors().map(([door]) => [door, 403, 'FORBIDDEN_ROLE']),
            );
        });

        test('a company finance officer with no organization is refused 403 whatever the id', async () => {
            // A user row always carries an organization, and the tenant middleware fills a missing
            // claim from it, so the caller with none is one the database does not know.
            const noOrganization = { id: crypto.randomUUID(), canonicalId: `rl-noorg-${F.sfx}`, role: 'finance_officer_platform', organizationId: null };
            const answers = await askBoth(() => F.as(noOrganization));
            expect(answers).toEqual(sameAnswer(answers));
            expect(answers.map(({ door, real }) => [door, real[0], real[1].error])).toEqual(
                writeDoors().map(([door]) => [door, 403, 'FORBIDDEN_TENANT']),
            );
        });
    });

    describe('6. the payer\'s credit-note list and quotation doors carry named columns only (L2)', () => {
        test('GET /api/finance/credit-notes?originalInvoiceId= as the applicant', async () => {
            F.as(fx.A);
            const res = await get(`/api/finance/credit-notes?originalInvoiceId=${paid.invoice.id}`);
            expect(res.status).toBe(200);
            expect(res.body.data.map((r) => r.id)).toContain(creditNoteId);
            for (const row of res.body.data) {
                expect(extraKeys(row, APPLICANT_CREDIT_NOTE_KEYS)).toEqual([]);
                expect(Object.keys(row.originalInvoice).sort()).toEqual(['id', 'invoiceNumber', 'receiptIssuedAt', 'receiptNumber']);
            }
        });

        test('GET /api/applications/:id/quotations as the applicant', async () => {
            F.as(fx.A);
            const res = await get(`/api/applications/${paid.id}/quotations`);
            expect(res.status).toBe(200);
            const row = res.body.data.platform;
            expect(row).toEqual(expect.objectContaining({ applicationId: paid.id, issuerType: 'PLATFORM' }));
            expect(extraKeys(row, APPLICANT_QUOTATION_KEYS)).toEqual([]);
        });

        test('POST /api/applications/:id/quotations/PLATFORM/accept answers the applicant with the same columns', async () => {
            F.as(fx.A);
            const res = await post(`/api/applications/${paid.id}/quotations/PLATFORM/accept`);
            expect(res.status).toBe(200);
            expect(res.body.data).toEqual(expect.objectContaining({ applicationId: paid.id, issuerType: 'PLATFORM' }));
            expect(extraKeys(res.body.data, APPLICANT_QUOTATION_KEYS)).toEqual([]);
        });

        test('staff readers keep the whole row on both lists', async () => {
            F.as(fx.F);
            const notes = await get(`/api/finance/credit-notes?originalInvoiceId=${paid.invoice.id}`);
            F.as(fx.F);
            const quotations = await get(`/api/applications/${paid.id}/quotations`);
            expect([notes.status, quotations.status]).toEqual([200, 200]);
            expect(notes.body.data.find((r) => r.id === creditNoteId)).toHaveProperty('organizationId', fx.org);
            expect(quotations.body.data.platform).toHaveProperty('organizationId', fx.org);
        });
    });

    describe('5. the customer statement masks the national ID in the order-10 shape', () => {
        test('GET /api/finance/customer-statement → first digit and last four, never the 13 digits', async () => {
            F.as(fx.F);
            const res = await get(`/api/finance/customer-statement?applicantHealthId=${statementUser.nationalId}`);
            expect(res.status).toBe(200);
            const id = statementUser.nationalId;
            expect(res.body.data.applicant.healthIdMasked).toBe(`${id[0]}-XXXX-XXXX-X-${id.slice(9)}`);
            expect(JSON.stringify(res.body)).not.toContain(id);
        });
    });
});

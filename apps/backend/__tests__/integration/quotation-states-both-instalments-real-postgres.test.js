'use strict';

/**
 * Order 54 (operator 2026-10-09): "ใบเสนอราคาคือยอดเต็ม รวมสองงวด สิ่งที่ต้องอ้างอิงตอนจ่ายเงินคือใบแจ้งหนี้".
 * One quotation number is one document: both instalments, each with its service fee and its VAT,
 * and the grand total of the two. The PDF door picked one instalment from `?phase=` (default 1), so
 * the same number printed the first instalment or the second and never the whole price (Jev, B0
 * review, finding 2).
 *
 * Real Postgres: the quotation is priced, issued and accepted by the real services, the PDF is
 * rendered by the real renderer through the HTTP door, and every assertion reads the printed text
 * back out of the PDF. The expected figures come from the stored row, not from a fee table. The
 * invoice and the receipt of the paid first instalment are the control: they print their own
 * instalment only.
 */

process.env.PAYMENT_ADAPTER = 'mock';
process.env.STRIPE_CHECKOUT_ENABLED = 'true';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
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
const { issueQuotationOnSubmit } = require('../../services/quotation-issuance-on-submit');
const { numberToThaiText } = require('../../utils/number-to-thai-text');
const pdfGenerator = require('../../services/pdf/pdf-generator.service');

jest.setTimeout(180000);

const baht = (n) => Number(n).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');

// pdfjs writes sara am (ำ) as nikhahit + sara aa; fold it back. In Thai words it also drops a
// tone mark, or leaves a NUL in its place, and a word may wrap inside a table cell, so `flat`
// removes tone marks, NULs and white space from both sides of a Thai-words comparison.
const normalize = (s) => s.replace(/ํา/g, 'ำ').replace(/[ \t]+/g, ' ');
const DROPPED_BY_PDFJS = new Set(['\u0E48', '\u0E49', '\u0E4A', '\u0E4B', '\u0000']);
const flat = (s) => [...s].filter((c) => !DROPPED_BY_PDFJS.has(c) && c.trim() !== '').join('');

/** The PDF's text, read by pdf-parse in a child process (its pdfjs needs ESM dynamic import). */
function pdfText(buffer) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qt-both-'));
    const file = path.join(dir, 'paper.pdf');
    fs.writeFileSync(file, buffer);
    const script = [
        "import { createRequire } from 'node:module';",
        "import fs from 'node:fs';",
        `const { PDFParse } = createRequire(${JSON.stringify(path.join(__dirname, '../../package.json'))})('pdf-parse');`,
        `const parser = new PDFParse({ data: fs.readFileSync(${JSON.stringify(file)}) });`,
        'const text = await parser.getText();',
        'process.stdout.write(JSON.stringify(text.text));',
        'await parser.destroy();',
    ].join('\n');
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
    fs.rmSync(dir, { recursive: true, force: true });
    return normalize(JSON.parse(out));
}

d('the quotation states the full amount of both instalments (order 54, real Postgres)', () => {
    const F = createFinanceFixture({ prefix: 'qtb', mockActor });
    const { fx } = F;
    const getPdf = (url) => request(F.app).get(url).buffer(true).parse((res, cb) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
    });

    let paid;
    let unaccepted;

    /** A quotation issued by the real issuance door and left unaccepted. */
    async function issuedNotAccepted(label) {
        const row = await F.raw.application.create({
            data: {
                applicationNumber: `APP-qtb-${label}-${F.sfx}`, healthId: fx.A.canonicalId, areaType: 'OUTDOOR',
                organizationId: fx.org, entityId: fx.C, submitterId: fx.A.id, status: 'PENDING_DOC_FEE',
                formData: { workflowState: 'PENDING_DOC_FEE' },
            },
        });
        fx.appIds.push(row.id);
        await issueQuotationOnSubmit({ application: row, actorId: null });
        return row.id;
    }

    const storedRow = (applicationId) => F.raw.quotation.findFirst({ where: { applicationId, isDeleted: false } });

    beforeAll(async () => {
        await F.setup();
        F.app.use('/api/applications/:applicationId/quotations', require('../../routes/api/applications/quotations'));
        paid = await F.paidM1('PAID');
        unaccepted = await issuedNotAccepted('OPEN');
    });

    afterAll(async () => {
        const instance = pdfGenerator.default || pdfGenerator;
        if (instance.browser) { await instance.browser.close(); instance.browser = null; }
        await F.cleanup();
    });

    describe.each([
        ['accepted and partly paid (the frozen snapshot)', () => paid.id, (row) => row.acceptedSnapshot.installments],
        ['issued, not yet accepted (the row\'s own instalments)', () => unaccepted, (row) => row.installments],
    ])('a quotation %s', (_label, applicationId, instalmentsOf) => {
        let row;
        let instalments;
        const texts = {};

        beforeAll(async () => {
            row = await storedRow(applicationId());
            instalments = instalmentsOf(row);
            F.as(fx.A);
            for (const query of ['', '?phase=1', '?phase=2']) {
                const res = await getPdf(`/api/applications/${applicationId()}/quotations/PLATFORM/pdf${query}`);
                expect([query, res.status, res.headers['content-type']]).toEqual([query, 200, 'application/pdf']);
                texts[query] = pdfText(res.body);
            }
        });

        test('the stored row prices both instalments and its total is their sum', () => {
            expect(instalments.map((it) => it.phase)).toEqual(['PHASE_1', 'PHASE_2']);
            const sum = instalments.reduce((acc, it) => acc + Number(it.amount), 0);
            expect(Number(row.totalAmount)).toBe(sum);
        });

        test.each(['', '?phase=1', '?phase=2'])('PDF%s prints each instalment with its service fee, its VAT and its total', (query) => {
            const text = texts[query];
            expect(text).toContain(row.quotationNumber);
            const missing = [];
            for (const it of instalments) {
                for (const [what, value] of [['service fee', it.serviceFeeAmount], ['VAT', it.vatAmount], ['instalment total', it.amount]]) {
                    if (!text.includes(baht(value))) { missing.push(`${it.phase} ${what} ${baht(value)}`); }
                }
            }
            expect(missing).toEqual([]);
        });

        test.each(['', '?phase=1', '?phase=2'])('PDF%s prints the full total of both instalments, in figures and in words', (query) => {
            const text = texts[query];
            expect(text).toContain(baht(row.totalAmount));
            expect(flat(text)).toContain(flat(numberToThaiText(Number(row.totalAmount))));
        });

        test('one quotation number gives one document: the three renders print the same text', () => {
            expect(texts['?phase=1']).toBe(texts['']);
            expect(texts['?phase=2']).toBe(texts['']);
        });
    });

    describe('control: the invoice and the receipt of the paid first instalment print that instalment only', () => {
        let m1;
        let full;
        let m2;

        beforeAll(async () => {
            const row = await storedRow(paid.id);
            const byPhase = Object.fromEntries(row.acceptedSnapshot.installments.map((it) => [it.phase, it]));
            m1 = baht(byPhase.PHASE_1.amount);
            m2 = baht(byPhase.PHASE_2.amount);
            full = baht(row.totalAmount);
        });

        test.each([
            ['invoice', () => `/api/invoices/${paid.invoice.id}/pdf`],
            ['receipt / tax invoice', () => `/api/invoices/my/${paid.invoice.id}/receipt/pdf`],
        ])('the %s', async (_name, url) => {
            F.as(fx.A);
            const res = await getPdf(url());
            expect(res.status).toBe(200);
            const text = pdfText(res.body);
            expect([text.includes(m1), text.includes(m2), text.includes(full)]).toEqual([true, false, false]);
        });
    });
});

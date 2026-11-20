'use strict';

/**
 * B0 fix/finance-read-leaks, spec 13.5 row 2: a generated finance PDF is never served from a
 * public path.
 *
 * Measured on staging 2026-10-09: GET https://staging.gacpth.com/uploads/gacp-pdfs/receipts-null.pdf
 * answered 200 application/pdf with no login. The renderer used to copy every paper into
 * `gacp-pdfs`, which local storage keeps under the static `/uploads` mount, and
 * classifyUploadsPath called that folder public. Nothing ever read the copy back: every door
 * renders the paper from the database row.
 *
 *   - `/uploads/gacp-pdfs/*` needs a session and then still answers 404: the papers are served by
 *     the finance doors that check role and organization, never by the static mount.
 *   - the signed-URL mint refuses those paths, so a session cannot turn into a bearer link.
 *   - rendering a paper writes nothing to storage, whatever the caller asks.
 *
 * The /uploads chain is the one server.js mounts, over HTTP; only authentication and the
 * database are stand-ins.
 */

const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');

process.env.UPLOADS_URL_SIGNING_SECRET = 'b0-test-only-uploads-signing-secret-0123456789';

jest.mock('../../middleware/auth-middleware', () => {
    const attach = (req, res, next) => {
        const role = req.headers['x-test-role'];
        if (!role) { return res.status(401).json({ success: false, error: 'Unauthorized', code: 'NO_TOKEN' }); }
        req.user = { id: `u-${role}`, canonicalId: `tok-${role}`, role, canonicalRole: role, organizationId: 'org-1' };
        return next();
    };
    return { authenticateAny: attach, authenticateHealth: attach, authenticateProvider: attach };
});
jest.mock('../../services/prisma-database', () => {
    const none = () => Promise.resolve(null);
    return {
        prisma: {
            application: { findFirst: jest.fn(none) },
            attachment: { findFirst: jest.fn(none) },
            applicationDocument: { findFirst: jest.fn(none) },
            applicationDraft: { findFirst: jest.fn(none) },
            user: { findUnique: jest.fn(none) },
        },
    };
});
jest.mock('../../shared/logger', () => {
    const noop = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
    return { ...noop, createLogger: () => noop };
});
const storageService = require('../../services/storage-service');
const pdfGenerator = require('../../services/pdf/pdf-generator.service');
const { gateSensitiveUploads, gateUploadsObjectAccess, classifyUploadsPath } = require('../../middleware/uploads-access');
const uploadsSecurityHeaders = require('../../middleware/uploads-security-headers');
const tpl = require('../../services/pdf/invoice-template-service');
const { generateLotLabelPdf } = require('../../services/pdf/lot-label-template-service');

const RECEIPT = 'gacp-pdfs/receipts-null.pdf';
const RECEIPT_BYTES = '%PDF-1.4 a receipt that once landed in the public folder';

describe('the /uploads mount never serves a generated finance PDF', () => {
    let root;
    let app;

    beforeAll(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'b0-uploads-'));
        fs.mkdirSync(path.join(root, 'gacp-pdfs'));
        fs.writeFileSync(path.join(root, RECEIPT), RECEIPT_BYTES);
        fs.mkdirSync(path.join(root, 'lab-results'));
        fs.writeFileSync(path.join(root, 'lab-results', 'report.pdf'), '%PDF-1.4 a public lab report');
        app = express();
        app.use(express.json());
        app.use('/uploads', gateSensitiveUploads, gateUploadsObjectAccess, uploadsSecurityHeaders, express.static(root));
        app.use('/api/files', require('../../routes/api/files/files'));
    });

    afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

    test('gacp-pdfs/ is classified sensitive', () => {
        expect(classifyUploadsPath(RECEIPT)).toEqual({ kind: 'generated', sensitive: true });
        expect(classifyUploadsPath('gacp-pdfs/quotations-QT-2569-000001.pdf')).toEqual({ kind: 'generated', sensitive: true });
    });

    test.each([
        [`/uploads/${RECEIPT}`],
        ['/uploads/gacp-pdfs/receipts%2Dnull.pdf'],
        ['/uploads/gacp%2Dpdfs/receipts-null.pdf'],
    ])('no session: GET %s answers 401 and sends no PDF bytes', async (url) => {
        const res = await request(app).get(url);
        expect(res.status).toBe(401);
        expect(res.text).not.toContain('%PDF');
    });

    test.each([
        ['health'],
        ['finance_officer_platform'],
        ['finance_officer_dtam'],
    ])('a %s session gets 404: the static mount is not a finance door', async (role) => {
        const res = await request(app).get(`/uploads/${RECEIPT}`).set('x-test-role', role);
        expect(res.status).toBe(404);
        expect(res.text).not.toContain('%PDF');
    });

    test('the signed-URL mint refuses a gacp-pdfs path', async () => {
        const res = await request(app).post('/api/files/signed-url')
            .set('x-test-role', 'health').send({ fileUrl: `/uploads/${RECEIPT}` });
        expect(res.status).toBe(404);
        expect(res.body.data).toBeUndefined();
    });

    test('a lab report stays public for the consumer trace page', async () => {
        const res = await request(app).get('/uploads/lab-results/report.pdf');
        expect(res.status).toBe(200);
    });

    // Security review of 1b554df0c, M2. supertest always sends origin form, so a raw socket.
    test('an absolute-form request target answers 400 and sends no PDF bytes', async () => {
        const server = app.listen(0, '127.0.0.1');
        await new Promise((resolve) => server.once('listening', resolve));
        const raw = await new Promise((resolve, reject) => {
            const socket = net.connect(server.address().port, '127.0.0.1');
            let out = '';
            socket.setEncoding('latin1');
            socket.on('data', (chunk) => { out += chunk; });
            socket.on('end', () => resolve(out));
            socket.on('error', reject);
            socket.write(`GET http://127.0.0.1/uploads/${RECEIPT} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`);
        });
        await new Promise((resolve) => server.close(resolve));
        expect([raw.slice(0, 12), raw.includes('%PDF')]).toEqual(['HTTP/1.1 400', false]);
    });
});

describe('rendering a finance paper writes nothing to storage', () => {
    let upload;
    let print;
    beforeEach(() => {
        upload = jest.spyOn(storageService, 'uploadBuffer').mockResolvedValue({});
        print = jest.spyOn(pdfGenerator, 'generatePDF').mockResolvedValue(Buffer.from('%PDF-1.4 stub'));
    });
    afterEach(() => { upload.mockRestore(); print.mockRestore(); });

    const invoice = {
        id: 'inv-b0-1', invoiceNumber: 'INV-CO-B0-M1', receiptNumber: 'TAX-PRD-2569-000001',
        serviceType: 'CERTIFICATION_CHECKOUT_M1', totalAmount: 5885, subtotal: 5500, vat: 385,
        createdAt: new Date('2026-09-27T00:00:00Z'), dueDate: new Date('2026-10-04T00:00:00Z'),
        paidAt: new Date('2026-09-27T00:00:00Z'), receiptIssuedAt: new Date('2026-09-27T00:00:00Z'),
        application: { applicationNumber: 'APP-B0-1' }, applicant: {},
    };
    const note = (extra) => ({
        id: 'note-b0-1', originalInvoiceId: invoice.id, originalInvoice: invoice, reason: 'ปรับยอดตามที่ตกลงกับผู้ซื้อ',
        subtotal: 100, vat: 7, totalAmount: 107, status: 'ISSUED', issuedAt: new Date('2026-10-01T00:00:00Z'),
        createdAt: new Date('2026-10-01T00:00:00Z'), ...extra,
    });

    test.each([
        ['invoice', () => tpl.generateInvoicePdf(invoice)],
        ['receipt', () => tpl.generateReceiptTaxInvoicePdf(invoice)],
        ['credit note', () => tpl.generateCreditNotePdf(note({ creditNoteNumber: 'CN-PRD-2569-000001' }))],
        ['debit note', () => tpl.generateDebitNotePdf(note({ debitNoteNumber: 'DN-PRD-2569-000001' }))],
        ['invoice, even when a caller asks to upload', () => tpl.generateInvoicePdf(invoice, { upload: true })],
        ['lot label, even when a caller asks to upload', () => generateLotLabelPdf({
            id: 'lot-b0-1', lotNumber: 'LOT-B0-1', trackingUrl: 'https://demo.gacpth.com/trace/lot/lot-b0-1',
            createdAt: new Date('2026-10-01T00:00:00Z'), batch: { farm: { farmName: 'ฟาร์มทดสอบ' } },
        }, { upload: true })],
    ])('%s: the paper comes back and nothing is stored', async (_name, render) => {
        const buffer = await render();
        expect(Buffer.isBuffer(buffer)).toBe(true);
        expect(upload.mock.calls.map(([bucket, key]) => `${bucket}/${key}`)).toEqual([]);
    });
});

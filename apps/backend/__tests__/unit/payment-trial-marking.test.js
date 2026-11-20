'use strict';

const mockCapture = { html: '' };

jest.mock('../../services/pdf/pdf-generator.service', () => {
    const actual = jest.requireActual('../../services/pdf/pdf-generator.service');
    return {
        readTemplateCached: (p) => actual.readTemplateCached(p),
        replaceTemplateVariables: (tpl, data) => actual.replaceTemplateVariables(tpl, data),
        generatePDF: async (html) => { mockCapture.html = html; return Buffer.from('PDF'); },
    };
});

const tpl = require('../../services/pdf/invoice-template-service');
const { getPaymentMode } = require('../../services/payment/payment-adapter');
const { PAYMENT_MODES, describePaymentMode } = require('../../shared/payment-mode');

const MARK = 'เอกสารทดลอง';
const MARK_DETAIL = 'ไม่ใช่เอกสารทางภาษี';

const savedEnv = { ...process.env };
afterEach(() => {
    process.env = { ...savedEnv };
});

function useTrialKeys() {
    process.env.PAYMENT_ADAPTER = 'stripe';
    process.env.STRIPE_SECRET_KEY = 'sk_test_stub';
}
function useLiveKeys() {
    process.env.PAYMENT_ADAPTER = 'stripe';
    process.env.STRIPE_SECRET_KEY = 'sk_live_stub';
}

/** A paid company invoice; `livemode` is what its settlement recorded (undefined: paid before the record existed). */
function companyInvoice({ livemode } = {}) {
    return {
        metadata: livemode === undefined ? null : { checkoutOrderId: 'ord-1', livemode },
        id: 'inv-trial',
        invoiceNumber: 'INV-CO-TRIAL-M1',
        serviceType: 'CERTIFICATION_CHECKOUT_M1',
        totalAmount: 5885,
        subtotal: 5500,
        vat: 385,
        status: 'RECEIPT_ISSUED',
        receiptNumber: 'TAX-PRD-2026-000009',
        receiptIssuedAt: new Date('2026-10-21T03:00:00Z'),
        paidAt: new Date('2026-10-21T03:00:00Z'),
        createdAt: new Date('2026-10-21T02:00:00Z'),
        dueDate: new Date('2026-10-30T00:00:00Z'),
        paymentMethod: 'STRIPE',
        lineItems: [{ lineNumber: 1, description: 'ค่าบริการ GACP', quantity: 1, unitPrice: 5500, amount: 5500 }],
        application: {
            applicationNumber: 'APP-2569-TRIAL',
            cultivationScopeCount: 1,
            formData: { plantName: 'ขิง', farmName: 'แปลงทดลอง' },
            entity: { id: 'entity-co', type: 'JURISTIC', displayName: 'บริษัท ทดลอง จำกัด', juristicId: '0105561234560' },
        },
        applicant: {},
    };
}

function adjustmentNote(numberField, number, originalInvoice = companyInvoice()) {
    return {
        id: `note-${number}`,
        [numberField]: number,
        subtotal: 5500,
        vat: 385,
        totalAmount: 5885,
        reason: 'ปรับยอดค่าบริการ',
        status: 'ISSUED',
        issuedAt: new Date('2026-10-21T03:00:00Z'),
        createdAt: new Date('2026-10-21T03:00:00Z'),
        originalInvoice,
    };
}

const QUOTATION_ROW = {
    quotationNumber: 'QT-PRD-2026-000009',
    issuerType: 'PLATFORM',
    status: 'PENDING',
    totalAmount: '35310.00',
    installments: [
        { phase: 'PHASE_1', amount: 5885, serviceFeeAmount: 5500, vatAmount: 385, scopeCount: 1 },
        { phase: 'PHASE_2', amount: 29425, serviceFeeAmount: 27500, vatAmount: 1925, scopeCount: 1 },
    ],
    acceptedSnapshot: null,
};

/** The five papers; the paid ones were settled in `livemode`, the unpaid ones have no settlement. */
const papers = (livemode) => [
    ['ใบเสนอราคา (quotation.html)', () => tpl.generateQuotationPdf({
        application: {
            id: 'app-trial', applicationNumber: 'APP-2569-TRIAL', totalAreaTypes: 1,
            formData: { cultivationMethods: ['OUTDOOR'], farmName: 'แปลงทดลอง' },
        },
        issuerSide: 'PLATFORM',
        quotationRow: QUOTATION_ROW,
    })],
    ['ใบวางบิล / ใบแจ้งหนี้ (invoice.html)', () => tpl.generateInvoicePdf({ ...companyInvoice(), status: 'PENDING', paidAt: null, receiptNumber: null })],
    ['ใบเสร็จรับเงิน / ใบกำกับภาษี (receipt-tax-invoice.html)', () => tpl.generateReceiptTaxInvoicePdf(companyInvoice({ livemode }))],
    ['ใบลดหนี้ (credit-note.html)', () => tpl.generateCreditNotePdf(adjustmentNote('creditNoteNumber', 'CN-PRD-2026-000009', companyInvoice({ livemode })))],
    ['ใบเพิ่มหนี้ (debit-note.html)', () => tpl.generateDebitNotePdf(adjustmentNote('debitNoteNumber', 'DN-PRD-2026-000009', companyInvoice({ livemode })))],
];

async function render(paper) {
    mockCapture.html = '';
    await paper();
    return mockCapture.html;
}

describe('the payment mode is the active adapter key\'s own mode', () => {
    it.each([
        ['mock adapter', { PAYMENT_ADAPTER: 'mock' }, PAYMENT_MODES.TRIAL],
        ['stripe with a test secret key', { PAYMENT_ADAPTER: 'stripe', STRIPE_SECRET_KEY: 'sk_test_stub' }, PAYMENT_MODES.TRIAL],
        ['stripe with a test restricted key', { PAYMENT_ADAPTER: 'stripe', STRIPE_SECRET_KEY: 'rk_test_stub' }, PAYMENT_MODES.TRIAL],
        ['stripe with no secret key (nothing can be charged)', { PAYMENT_ADAPTER: 'stripe', STRIPE_SECRET_KEY: '' }, PAYMENT_MODES.TRIAL],
        ['stripe with an unreadable key', { PAYMENT_ADAPTER: 'stripe', STRIPE_SECRET_KEY: 'not-a-key' }, PAYMENT_MODES.TRIAL],
        ['an unknown adapter (nothing can be charged)', { PAYMENT_ADAPTER: 'paypal' }, PAYMENT_MODES.TRIAL],
        ['stripe with a live secret key', { PAYMENT_ADAPTER: 'stripe', STRIPE_SECRET_KEY: 'sk_live_stub' }, PAYMENT_MODES.LIVE],
        ['stripe with a live restricted key', { PAYMENT_ADAPTER: 'stripe', STRIPE_SECRET_KEY: 'rk_live_stub' }, PAYMENT_MODES.LIVE],
    ])('%s', (_label, env, expected) => {
        Object.assign(process.env, env);
        expect(getPaymentMode()).toBe(expected);
    });

    it('a live publishable key beside a test secret is still trial: the secret decides who is charged', () => {
        useTrialKeys();
        process.env.STRIPE_PUBLISHABLE_KEY = 'pk_live_stub';
        expect(getPaymentMode()).toBe(PAYMENT_MODES.TRIAL);
    });

    it('the served description carries the mode and the trial copy in both modes: a screen on live keys still stamps a document recorded in test mode', () => {
        const copy = {
            notice: 'ช่วงทดลองระบบ ยังไม่มีการเก็บเงินจริง',
            documentMark: MARK,
            documentMarkDetail: `${MARK_DETAIL} ยังไม่มีการเก็บเงินจริง`,
        };
        expect(describePaymentMode(PAYMENT_MODES.TRIAL)).toEqual({ mode: 'TRIAL', ...copy });
        expect(describePaymentMode(PAYMENT_MODES.LIVE)).toEqual({ mode: 'LIVE', ...copy });
    });
});

describe('a paid row remembers the mode of its settlement', () => {
    const { settledPaymentMode } = require('../../shared/payment-mode');
    const paid = (metadata) => ({ ...companyInvoice(), metadata });

    it.each([
        ['recorded as test mode', { checkoutOrderId: 'ord-1', livemode: false }, PAYMENT_MODES.TRIAL],
        ['recorded as live', { livemode: true }, PAYMENT_MODES.LIVE],
        ['paid before the record existed (every settlement then was test mode)', { checkoutOrderId: 'ord-1' }, PAYMENT_MODES.TRIAL],
        ['paid with no metadata at all', null, PAYMENT_MODES.TRIAL],
        ['a legacy row whose metadata is a JSON string', JSON.stringify({ livemode: true }), PAYMENT_MODES.LIVE],
    ])('%s', (_label, metadata, expected) => {
        expect(settledPaymentMode(paid(metadata))).toBe(expected);
    });

    it('a row no money has reached yet has no settlement to remember', () => {
        expect(settledPaymentMode({ ...companyInvoice(), paidAt: null, metadata: { livemode: false } })).toBeNull();
        expect(settledPaymentMode({ ...companyInvoice(), paidAt: null, receiptNumber: null, metadata: null })).toBeNull();
    });
});

describe('a document about money that moved prints the mode recorded at its settlement, not the key of the day', () => {
    const SETTLED_PAPERS = [
        ['ใบเสร็จรับเงิน / ใบกำกับภาษี', (inv) => tpl.generateReceiptTaxInvoicePdf(inv)],
        ['ใบลดหนี้ of that invoice', (inv) => tpl.generateCreditNotePdf(adjustmentNote('creditNoteNumber', 'CN-PRD-2026-000009', inv))],
        ['ใบเพิ่มหนี้ of that invoice', (inv) => tpl.generateDebitNotePdf(adjustmentNote('debitNoteNumber', 'DN-PRD-2026-000009', inv))],
    ];

    describe.each(SETTLED_PAPERS)('%s', (_label, paper) => {
        it('settled in test mode, reprinted on live keys: still marked', async () => {
            useLiveKeys();
            const html = await render(() => paper(companyInvoice({ livemode: false })));
            expect(html).toContain('data-gacp-trial-mark');
            expect(html).toContain(MARK);
        });

        it('settled live, printed on test keys: no mark', async () => {
            useTrialKeys();
            const html = await render(() => paper(companyInvoice({ livemode: true })));
            expect(html).toContain('</body>');
            expect(html).not.toContain('data-gacp-trial-mark');
            expect(html).not.toContain(MARK);
        });

        it('paid before the record existed, printed on live keys: marked, because every settlement before the record was test mode', async () => {
            useLiveKeys();
            const html = await render(() => paper({ ...companyInvoice(), metadata: null }));
            expect(html).toContain('data-gacp-trial-mark');
        });
    });

    it('an unpaid invoice has no settlement to remember and follows the key: live keys, no mark', async () => {
        useLiveKeys();
        const html = await render(() => tpl.generateInvoicePdf({ ...companyInvoice(), status: 'PENDING', paidAt: null, receiptNumber: null, metadata: null }));
        expect(html).not.toContain('data-gacp-trial-mark');
    });

    it('an unpaid invoice on test keys is marked', async () => {
        useTrialKeys();
        const html = await render(() => tpl.generateInvoicePdf({ ...companyInvoice(), status: 'PENDING', paidAt: null, receiptNumber: null, metadata: null }));
        expect(html).toContain('data-gacp-trial-mark');
    });
});

describe('every finance paper carries the trial mark on test keys', () => {
    it.each(papers(false))('%s', async (_label, paper) => {
        useTrialKeys();
        const html = await render(paper);
        expect(html).toContain('data-gacp-trial-mark');
        expect(html).toContain(MARK);
        expect(html).toContain(MARK_DETAIL);
        expect(html.indexOf('data-gacp-trial-mark')).toBeLessThan(html.lastIndexOf('</body>'));
    });
});

describe('no finance paper carries the mark on live keys when the paid ones were settled live', () => {
    it.each(papers(true))('%s', async (_label, paper) => {
        useLiveKeys();
        const html = await render(paper);
        expect(html).toContain('</body>');
        expect(html).not.toContain('data-gacp-trial-mark');
        expect(html).not.toContain(MARK);
    });
});

describe('GET /api/payments/mode', () => {
    const express = require('express');
    const request = require('supertest');

    function app() {
        const a = express();
        a.use('/api/payments', require('../../routes/api/finance/payments'));
        return a;
    }

    it('answers trial with the notice and the mark, with no session', async () => {
        useTrialKeys();
        const res = await request(app()).get('/api/payments/mode');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, data: describePaymentMode(PAYMENT_MODES.TRIAL) });
        expect(res.headers['cache-control']).toBe('no-store');
    });

    it('answers live with the mode and the same copy, so a screen can still stamp a document recorded in test mode', async () => {
        useLiveKeys();
        const res = await request(app()).get('/api/payments/mode');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, data: describePaymentMode(PAYMENT_MODES.LIVE) });
        expect(res.body.data.mode).toBe('LIVE');
        expect(res.body.data.documentMark).toBe(MARK);
    });

    it('never echoes the key', async () => {
        useLiveKeys();
        const res = await request(app()).get('/api/payments/mode');
        expect(JSON.stringify(res.body)).not.toContain('sk_live_stub');
    });
});

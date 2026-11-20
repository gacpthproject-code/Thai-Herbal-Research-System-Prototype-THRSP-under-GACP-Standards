'use strict';
/**
 * Order 105(3), round 2 finding 1, the read behind the paper: a credit or debit note prints
 * the mode its original invoice's settlement recorded (invoice.metadata.livemode). The
 * document reads load that invoice through a select, so a select without `metadata`
 * stamps every note of live money as a trial document. The fake honours the select the
 * way Prisma does, which a mock handing over whole rows cannot.
 */
const mockCapture = { html: '' };
jest.mock('../../services/pdf/pdf-generator.service', () => {
    const actual = jest.requireActual('../../services/pdf/pdf-generator.service');
    return {
        readTemplateCached: (p) => actual.readTemplateCached(p),
        replaceTemplateVariables: (tpl, data) => actual.replaceTemplateVariables(tpl, data),
        generatePDF: async (html) => { mockCapture.html = html; return Buffer.from('PDF'); },
    };
});

const PAID_AT = new Date('2026-10-21T03:00:00Z');
const invoiceRow = (livemode) => ({
    id: 'inv-1', invoiceNumber: 'INV-CO-1', serviceType: 'CERTIFICATION_CHECKOUT_M1',
    subtotal: 5500, vat: 385, totalAmount: 5885, status: 'paid', organizationId: 'org-1',
    paidAt: PAID_AT, receiptNumber: 'TAX-PRD-2026-000009', receiptIssuedAt: PAID_AT,
    billingName: null, billingAddress: null, certificateNumber: null,
    metadata: { checkoutOrderId: 'ord-1', livemode },
    application: {
        applicationNumber: 'APP-2569-1', cultivationScopeCount: 1, formData: {},
        entity: { id: 'entity-co', type: 'JURISTIC', displayName: 'บริษัท ทดลอง จำกัด', juristicId: '0105561234560' },
    },
});
const noteRow = (numberField, livemode) => ({
    id: 'note-1', [numberField]: `${numberField}-1`, organizationId: 'org-1', originalInvoiceId: 'inv-1',
    subtotal: 5500, vat: 385, totalAmount: 5885, reason: 'ปรับยอดค่าบริการ', status: 'ISSUED',
    issuedAt: PAID_AT, createdAt: PAID_AT, originalInvoice: invoiceRow(livemode),
});

/** What Prisma returns for `include: { originalInvoice: { select } }`: only the selected columns. */
function mockSelected(row, args) {
    const select = args.include.originalInvoice.select;
    const original = Object.fromEntries(Object.keys(select).filter((k) => k in row.originalInvoice).map((k) => [k, row.originalInvoice[k]]));
    return { ...row, originalInvoice: original };
}

let mockRow = null;
jest.mock('../../services/prisma-database', () => ({
    prisma: {
        creditNote: {
            create: jest.fn(),
            findUnique: jest.fn(async (args) => mockSelected(mockRow, args)),
            findFirst: jest.fn(async (args) => mockSelected(mockRow, args)),
        },
        debitNote: { create: jest.fn(), findUnique: jest.fn(async (args) => mockSelected(mockRow, args)) },
    },
}));

const tpl = require('../../services/pdf/invoice-template-service');
const creditNotes = require('../../services/credit-note-service');
const debitNotes = require('../../services/debit-note-service');

const ACTOR = { canonicalRole: 'finance_officer_platform', organizationId: 'org-1' };
const savedEnv = { ...process.env };
afterEach(() => { process.env = { ...savedEnv }; });

async function paperOf(read, render) {
    const note = await read();
    expect(note).not.toBeNull();
    mockCapture.html = '';
    await render(note);
    return mockCapture.html;
}

const DOORS = [
    ['credit note, staff door', 'creditNoteNumber', () => creditNotes.findCreditNoteForDocument('note-1', { actor: ACTOR }), (n) => tpl.generateCreditNotePdf(n)],
    ['credit note, holder door', 'creditNoteNumber', () => creditNotes.findIssuedCreditNoteOfInvoiceForDocument('note-1', 'inv-1'), (n) => tpl.generateCreditNotePdf(n)],
    ['debit note, staff door', 'debitNoteNumber', () => debitNotes.findDebitNoteForDocument('note-1', { actor: ACTOR }), (n) => tpl.generateDebitNotePdf(n)],
];

describe.each(DOORS)('%s', (_label, numberField, read, render) => {
    it('a note of money settled live, read through the door, prints no trial mark on test keys', async () => {
        process.env.PAYMENT_ADAPTER = 'stripe';
        process.env.STRIPE_SECRET_KEY = 'sk_test_stub';
        mockRow = noteRow(numberField, true);
        const html = await paperOf(read, render);
        expect(html).toContain('</body>');
        expect(html).not.toContain('data-gacp-trial-mark');
    });

    it('a note of money settled in test mode, read through the door, keeps the mark on live keys', async () => {
        process.env.PAYMENT_ADAPTER = 'stripe';
        process.env.STRIPE_SECRET_KEY = 'sk_live_stub';
        mockRow = noteRow(numberField, false);
        const html = await paperOf(read, render);
        expect(html).toContain('data-gacp-trial-mark');
    });
});

test('the JSON reads of a note still carry no invoice metadata', async () => {
    mockRow = noteRow('creditNoteNumber', true);
    expect(await creditNotes.findCreditNoteById('note-1', { actor: ACTOR })).not.toHaveProperty('originalInvoice.metadata');
    mockRow = noteRow('debitNoteNumber', true);
    expect(await debitNotes.findDebitNoteById('note-1', { actor: ACTOR })).not.toHaveProperty('originalInvoice.metadata');
});

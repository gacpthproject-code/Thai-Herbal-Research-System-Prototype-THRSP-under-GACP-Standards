const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const backend = path.resolve(__dirname, '../../../apps/backend');
const tpl = require(path.join(backend, 'services/pdf/invoice-template-service'));
const pdfGenerator = require(path.join(backend, 'services/pdf/pdf-generator.service'));
const { getPaymentMode } = require(path.join(backend, 'services/payment/payment-adapter'));
const { settledPaymentMode } = require(path.join(backend, 'shared/payment-mode'));

const [, , outDir] = process.argv;
fs.mkdirSync(outDir, { recursive: true });

const KEYS = { test: 'sk_test_stub', live: 'sk_live_stub' };
const PAID_AT = new Date('2026-10-21T03:00:00Z');

function invoice(metadata, paid = true) {
    return {
        id: 'inv-view', invoiceNumber: 'INV-CO-09246C23-M1', serviceType: 'CERTIFICATION_CHECKOUT_M1',
        totalAmount: 5885, subtotal: 5500, vat: 385, status: paid ? 'RECEIPT_ISSUED' : 'PENDING',
        receiptNumber: paid ? 'TAX-PRD-2026-000002' : null, receiptIssuedAt: paid ? PAID_AT : null,
        paidAt: paid ? PAID_AT : null, createdAt: new Date('2026-10-21T02:00:00Z'),
        dueDate: new Date('2026-10-30T00:00:00Z'), paymentMethod: paid ? 'STRIPE' : null, metadata,
        lineItems: [{ lineNumber: 1, description: 'ค่าบริการ GACP', quantity: 1, unitPrice: 5500, amount: 5500 }],
        application: {
            applicationNumber: 'APP-2569-MUJZRHP3-69A796', cultivationScopeCount: 1,
            formData: {
                plantName: 'ขิง', farmName: 'แปลงทดสอบขิง',
                applicantData: { address: '99 หมู่ 1 ตำบลทดสอบ', district: 'อำเภอเมืองนนทบุรี', province: 'จังหวัดนนทบุรี', postalCode: '11000' },
            },
            entity: { id: 'entity-co', type: 'JURISTIC', displayName: 'บริษัท ทดสอบพร้อมเพย์สเตจจิ้ง จำกัด', juristicId: '0105561234560' },
        },
        applicant: {},
    };
}
const creditNote = (original) => ({
    id: 'note-1', creditNoteNumber: 'CN-PRD-2026-000001', subtotal: 5500, vat: 385, totalAmount: 5885,
    reason: 'คืนค่าบริการ', status: 'ISSUED', issuedAt: PAID_AT, createdAt: PAID_AT, originalInvoice: original,
});

const SCENES = [
    ['receipt-settled-test-reprinted-on-live-keys', 'live', { checkoutOrderId: 'ord-1', livemode: false }, (inv) => tpl.generateReceiptTaxInvoicePdf(inv), true],
    ['receipt-paid-before-the-record-reprinted-on-live-keys', 'live', { checkoutOrderId: 'ord-1' }, (inv) => tpl.generateReceiptTaxInvoicePdf(inv), true],
    ['receipt-settled-live-printed-on-test-keys', 'test', { checkoutOrderId: 'ord-1', livemode: true }, (inv) => tpl.generateReceiptTaxInvoicePdf(inv), true],
    ['credit-note-of-test-money-on-live-keys', 'live', { checkoutOrderId: 'ord-1', livemode: false }, (inv) => tpl.generateCreditNotePdf(creditNote(inv)), true],
    ['credit-note-of-live-money-on-test-keys', 'test', { checkoutOrderId: 'ord-1', livemode: true }, (inv) => tpl.generateCreditNotePdf(creditNote(inv)), true],
    ['unpaid-invoice-on-live-keys', 'live', null, (inv) => tpl.generateInvoicePdf(inv), false],
    ['unpaid-invoice-on-test-keys', 'test', null, (inv) => tpl.generateInvoicePdf(inv), false],
];

let lastHtml = '';
const generatePDF = pdfGenerator.generatePDF.bind(pdfGenerator);
pdfGenerator.generatePDF = async (html, options) => { lastHtml = html; return generatePDF(html, options); };

(async () => {
    process.env.PAYMENT_ADAPTER = 'stripe';
    for (const [name, key, metadata, render, paid] of SCENES) {
        process.env.STRIPE_SECRET_KEY = KEYS[key];
        const inv = invoice(metadata, paid);
        const pdf = await render(inv);
        const file = path.join(outDir, `${name}.pdf`);
        fs.writeFileSync(file, pdf);
        execFileSync('pdftoppm', ['-png', '-r', '90', '-f', '1', '-l', '1', file, path.join(outDir, name)]);
        console.log(`${name}: key of the day=${getPaymentMode()} recorded=${settledPaymentMode(inv)} metadata=${JSON.stringify(metadata)} trial mark in the printed html=${lastHtml.includes('data-gacp-trial-mark')}`);
    }
    await (pdfGenerator.default || pdfGenerator).close();
    delete process.env.STRIPE_SECRET_KEY;
})().catch((err) => { console.error(err); process.exit(1); });

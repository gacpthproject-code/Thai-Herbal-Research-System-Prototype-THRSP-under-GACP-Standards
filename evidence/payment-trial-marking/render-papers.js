const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const backend = path.resolve(__dirname, '../../apps/backend');
const tpl = require(path.join(backend, 'services/pdf/invoice-template-service'));
const pdfGenerator = require(path.join(backend, 'services/pdf/pdf-generator.service'));

const [, , outDir] = process.argv;
fs.mkdirSync(outDir, { recursive: true });

function invoice() {
    return {
        id: 'inv-view', invoiceNumber: 'INV-CO-09246C23-M1', serviceType: 'CERTIFICATION_CHECKOUT_M1',
        totalAmount: 5885, subtotal: 5500, vat: 385, status: 'RECEIPT_ISSUED',
        receiptNumber: 'TAX-PRD-2026-000002', receiptIssuedAt: new Date('2026-10-21T03:00:00Z'),
        paidAt: new Date('2026-10-21T03:00:00Z'), createdAt: new Date('2026-10-21T02:00:00Z'),
        dueDate: new Date('2026-10-30T00:00:00Z'), paymentMethod: 'STRIPE',
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
const note = (field, number) => ({
    id: `note-${number}`, [field]: number, subtotal: 5500, vat: 385, totalAmount: 5885,
    reason: 'ปรับยอดค่าบริการ', status: 'ISSUED', issuedAt: new Date('2026-10-21T03:00:00Z'),
    createdAt: new Date('2026-10-21T03:00:00Z'), originalInvoice: invoice(),
});

const PAPERS = [
    ['quotation', () => tpl.generateQuotationPdf({
        application: { id: 'app-view', applicationNumber: 'APP-2569-MUJZRHP3-69A796', totalAreaTypes: 1, formData: { cultivationMethods: ['OUTDOOR'], farmName: 'แปลงทดสอบขิง' } },
        issuerSide: 'PLATFORM',
        quotationRow: {
            quotationNumber: 'QT-PRD-2026-000002', issuerType: 'PLATFORM', status: 'PENDING', totalAmount: '35310.00', acceptedSnapshot: null,
            installments: [
                { phase: 'PHASE_1', amount: 5885, serviceFeeAmount: 5500, vatAmount: 385, scopeCount: 1 },
                { phase: 'PHASE_2', amount: 29425, serviceFeeAmount: 27500, vatAmount: 1925, scopeCount: 1 },
            ],
        },
    })],
    ['invoice', () => tpl.generateInvoicePdf({ ...invoice(), status: 'PENDING' })],
    ['receipt-tax-invoice', () => tpl.generateReceiptTaxInvoicePdf(invoice())],
    ['credit-note', () => tpl.generateCreditNotePdf(note('creditNoteNumber', 'CN-PRD-2026-000001'))],
    ['debit-note', () => tpl.generateDebitNotePdf(note('debitNoteNumber', 'DN-PRD-2026-000001'))],
];

const MODES = {
    trial: { PAYMENT_ADAPTER: 'stripe', STRIPE_SECRET_KEY: 'sk_test_stub' },
    live: { PAYMENT_ADAPTER: 'stripe', STRIPE_SECRET_KEY: 'sk_live_stub' },
};

(async () => {
    const { getPaymentMode } = require(path.join(backend, 'services/payment/payment-adapter'));
    for (const [mode, env] of Object.entries(MODES)) {
        Object.assign(process.env, env);
        console.log(`mode ${mode}: getPaymentMode() = ${getPaymentMode()}`);
        for (const [name, render] of PAPERS) {
            const pdf = await render();
            const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length;
            const file = path.join(outDir, `${mode}-${name}.pdf`);
            fs.writeFileSync(file, pdf);
            execFileSync('pdftoppm', ['-png', '-r', '90', '-f', '1', '-l', '1', file, path.join(outDir, `${mode}-${name}`)]);
            console.log(`${mode}-${name}.pdf pages=${pages}`);
        }
    }
    await (pdfGenerator.default || pdfGenerator).close();
    delete process.env.STRIPE_SECRET_KEY;
})().catch((err) => { console.error(err); process.exit(1); });

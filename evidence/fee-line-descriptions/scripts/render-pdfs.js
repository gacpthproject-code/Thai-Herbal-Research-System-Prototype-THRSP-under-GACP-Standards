// Render real PDFs from the branch (no upload). Fixture data only.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://x:x@127.0.0.1:1/x';
const fs = require('fs');
const path = require('path');
const out = process.argv[2];
const tpl = require(path.resolve('services/pdf/invoice-template-service'));
const NEW_APP = { id: 'app-view-new', applicationNumber: 'APP-2569-VIEW-NEW', submittedAt: new Date('2026-10-03T03:00:00Z'),
  totalAreaTypes: 2,
  formData: { plantId: 'cannabis', farmName: 'ฟาร์มตัวอย่าง', cultivationMethods: ['OUTDOOR', 'GREENHOUSE'], applicantType: 'INDIVIDUAL', applicantData: { firstName: 'สมชาย', lastName: 'ทดสอบ' } } };
const REN_APP = { ...NEW_APP, id: 'app-view-ren', applicationNumber: 'APP-2569-VIEW-REN', totalAreaTypes: 1,
  formData: { ...NEW_APP.formData, cultivationMethods: ['OUTDOOR'], renewalOf: 'cert-old-1' } };
const newRow = { quotationNumber: 'QT-PRD-2569-VIEW01', issuerType: 'PLATFORM', status: 'PENDING', totalAmount: '70620.00', validUntil: new Date('2026-10-14T00:00:00Z'),
  installments: [ { phase: 'PHASE_1', amount: 11770, serviceFeeAmount: 11000, vatAmount: 770, scopeCount: 2 }, { phase: 'PHASE_2', amount: 58850, serviceFeeAmount: 55000, vatAmount: 3850, scopeCount: 2 } ] };
const renRow = { quotationNumber: 'QT-PRD-2569-VIEW02', issuerType: 'PLATFORM', status: 'PENDING', totalAmount: '35310.00', validUntil: new Date('2026-10-14T00:00:00Z'),
  installments: [ { phase: 'PHASE_2', amount: 35310, serviceFeeAmount: 33000, vatAmount: 2310, scopeCount: 1 } ] };
const inv = (milestone, application, a) => ({ id: 'inv-' + milestone, invoiceNumber: 'INV-CO-VIEW-' + application.id.slice(-3).toUpperCase() + '-' + milestone, serviceType: 'CERTIFICATION_CHECKOUT_' + milestone, ...a,
  createdAt: new Date('2026-10-03T03:00:00Z'), dueDate: new Date('2026-10-14T00:00:00Z'), application, applicant: {} });
(async () => {
  const jobs = [
    ['quotation-phase1-new.pdf', () => tpl.generateQuotationPdf({ application: NEW_APP, issuerSide: 'PLATFORM', phase: 1, quotationRow: newRow }, { upload: false })],
    ['quotation-renewal.pdf', () => tpl.generateQuotationPdf({ application: REN_APP, issuerSide: 'PLATFORM', phase: 2, quotationRow: renRow }, { upload: false })],
    ['invoice-phase1-new.pdf', () => tpl.generateInvoicePdf(inv('M1', NEW_APP, { subtotal: 11000, vat: 770, totalAmount: 11770 }), { upload: false })],
    ['invoice-renewal.pdf', () => tpl.generateInvoicePdf(inv('M2', REN_APP, { subtotal: 33000, vat: 2310, totalAmount: 35310 }), { upload: false })],
  ];
  for (const [name, fn] of jobs) {
    const buf = await fn();
    fs.writeFileSync(path.join(out, name), buf);
    console.log('wrote', name, buf.length);
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

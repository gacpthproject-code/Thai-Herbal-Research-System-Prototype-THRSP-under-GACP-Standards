// Render credit/debit note PDFs (renewal and phase-2) from the tree in cwd. Fixture data only.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://x:x@127.0.0.1:1/x';
const fs = require('fs'); const path = require('path');
const out = process.argv[2];
const tpl = require(path.resolve('services/pdf/invoice-template-service'));
const NEW_APP = { applicationNumber: 'APP-2569-NOTE-NEW', formData: { plantId: 'cannabis', applicantType: 'INDIVIDUAL', applicantData: { firstName: 'สมชาย', lastName: 'ทดสอบ' } } };
const REN_APP = { applicationNumber: 'APP-2569-NOTE-REN', formData: { ...NEW_APP.formData, renewalOf: 'cert-old-1' } };
const note = (kind, application) => ({ id: kind + '-v', [kind === 'credit' ? 'creditNoteNumber' : 'debitNoteNumber']: (kind === 'credit' ? 'CN' : 'DN') + '-PRD-2569-000077',
  subtotal: 3300, vat: 231, totalAmount: 3531, reason: 'ปรับปรุงยอดตามที่ตกลง', issuedAt: new Date('2026-10-03T05:00:00Z'),
  originalInvoice: { invoiceNumber: 'INV-CO-NOTE-M2', serviceType: 'CERTIFICATION_CHECKOUT_M2', subtotal: 33000, vat: 2310, totalAmount: 35310, paidAt: new Date('2026-10-02T05:00:00Z'), application } });
(async () => {
  for (const [name, fn] of [
    ['credit-note-renewal.pdf', () => tpl.generateCreditNotePdf(note('credit', REN_APP), { upload: false })],
    ['debit-note-renewal.pdf', () => tpl.generateDebitNotePdf(note('debit', REN_APP), { upload: false })],
    ['credit-note-phase2.pdf', () => tpl.generateCreditNotePdf(note('credit', NEW_APP), { upload: false })],
  ]) { const b = await fn(); fs.writeFileSync(path.join(out, name), b); console.log('wrote', name); }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

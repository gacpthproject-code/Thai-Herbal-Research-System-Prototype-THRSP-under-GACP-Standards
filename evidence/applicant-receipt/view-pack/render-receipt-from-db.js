// View-pack, receipt half: the applicant's receipt rendered through the REAL
// service path (invoice-service.generateReceiptPdf → getForDocument select →
// applicant-resolver → receipt.html → Puppeteer) from rows in a scratch
// Postgres 17 (127.0.0.1:5442, migrated with `prisma migrate deploy`, removed
// after the run). Also renders the invoice of the same row for the one-page
// check. Usage (from apps/backend):
//   DATABASE_URL=<scratch> NODE_ENV=test node ../../evidence/applicant-receipt/view-pack/render-receipt-from-db.js <outdir> [JURISTIC|COMMUNITY_ENTERPRISE]
// JURISTIC (default) writes <outdir>/receipt.pdf + invoice.pdf; COMMUNITY_ENTERPRISE
// writes <outdir>/receipt-community-enterprise.pdf. Prints page counts. Seeds and
// deletes its own rows.
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const B = path.resolve(__dirname, '../../../apps/backend');
const { PrismaClient } = require(path.join(B, 'node_modules/@prisma/client'));
const invoiceService = require(path.join(B, 'services/invoice-service'));
const pdfGen = require(path.join(B, 'services/pdf/pdf-generator.service'));
const outDir = process.argv[2];
const buyerType = process.argv[3] || 'JURISTIC';
fs.mkdirSync(outDir, { recursive: true });
const pages = (buf) => (buf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length;

(async () => {
  const raw = new PrismaClient();
  const s = crypto.randomUUID().slice(0, 8);
  const ids = {};
  try {
    const org = await raw.organization.create({ data: { name: `vp-${s}`, slug: `vp-${s}`, code: `VP_${s}`.toUpperCase() } });
    ids.org = org.id;
    const user = await raw.user.create({ data: { canonicalId: `vp-${s}`, password: 'x', role: 'health', authType: 'EMAIL_LEGACY', organizationId: org.id, firstName: 'ทดสอบ', lastName: 'ภาพ' } });
    ids.user = user.id;
    const entity = await raw.entity.create({ data: buyerType === 'COMMUNITY_ENTERPRISE'
      ? { type: 'COMMUNITY_ENTERPRISE', displayName: 'วิสาหกิจชุมชนสมุนไพรทดสอบ', communityRegNo: '58012345678', organizationId: org.id }
      : { type: 'JURISTIC', displayName: 'บริษัท ทดสอบพร้อมเพย์สเตจจิ้ง จำกัด', juristicId: '0105561234560', organizationId: org.id } });
    ids.entity = entity.id;
    const app = await raw.application.create({ data: {
      applicationNumber: 'APP-2569-MUJZRHP3-69A796', healthId: user.canonicalId, areaType: 'OUTDOOR', organizationId: org.id,
      entityId: entity.id, status: 'DOC_FEE_PAID', cultivationScopeCount: 1,
      formData: { plantName: 'ขิง', farmName: 'แปลงทดสอบขิง วอล์ค 863400fc', applicantData: { address: '99 หมู่ 1 ตำบลทดสอบ', district: 'อำเภอเมืองนนทบุรี', province: 'จังหวัดนนทบุรี', postalCode: '11000' } },
    } });
    ids.app = app.id;
    const inv = await raw.invoice.create({ data: {
      invoiceNumber: 'INV-CO-09246C23-M1', applicationId: app.id, healthId: user.canonicalId, serviceType: 'CERTIFICATION_CHECKOUT_M1',
      subtotal: 5500, vat: 385, totalAmount: 5885, dueDate: new Date('2026-10-08T00:00:00Z'), organizationId: org.id,
      createdAt: new Date('2026-09-29T08:13:00Z'),
      status: 'RECEIPT_ISSUED', paidAt: new Date('2026-09-29T08:14:45Z'), receiptNumber: 'TAX-PRD-2026-000002',
      receiptIssuedAt: new Date('2026-09-29T08:14:45Z'), receiptIssuedBy: 'stripe-webhook', receiptStatus: 'ISSUED', paymentMethod: 'STRIPE', // what checkout settlement writes
      lineItems: { create: [{ lineNumber: 1, code: 'PLATFORM_FEE', description: 'ค่าบริการ GACP', quantity: 1, unitPrice: 5500, amount: 5500, isTaxable: true, organizationId: org.id }] },
    } });
    ids.inv = inv.id;
    const receipt = await invoiceService.generateReceiptPdf(inv.id);
    const receiptName = buyerType === 'COMMUNITY_ENTERPRISE' ? 'receipt-community-enterprise.pdf' : 'receipt.pdf';
    fs.writeFileSync(path.join(outDir, receiptName), receipt);
    console.log(`${receiptName} pages=${pages(receipt)} bytes=${receipt.length}`);
    if (buyerType !== 'COMMUNITY_ENTERPRISE') {
      const invoice = await invoiceService.generatePdf(inv.id);
      fs.writeFileSync(path.join(outDir, 'invoice.pdf'), invoice);
      console.log(`invoice.pdf pages=${pages(invoice)} bytes=${invoice.length}`);
    }
  } finally {
    if (ids.inv) { await raw.invoiceLineItem.deleteMany({ where: { invoiceId: ids.inv } }); await raw.invoice.delete({ where: { id: ids.inv } }); }
    if (ids.app) await raw.application.delete({ where: { id: ids.app } });
    if (ids.entity) await raw.entity.delete({ where: { id: ids.entity } });
    if (ids.user) await raw.user.delete({ where: { id: ids.user } });
    if (ids.org) await raw.organization.delete({ where: { id: ids.org } });
    await raw.$disconnect();
    const inst = pdfGen.default || pdfGen;
    if (inst.browser) await inst.browser.close();
  }
})().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });

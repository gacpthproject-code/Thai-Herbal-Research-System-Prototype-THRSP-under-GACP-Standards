// Validates each hostile nested-relation payload against the generated Prisma client by
// running application.create in a transaction that is always rolled back.
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const org = await p.organization.create({ data: { name: 'shape-probe', slug: `shape-${Date.now()}`, code: `SHAPE_${Date.now()}` } });
  const user = await p.user.create({ data: { canonicalId: `shape-${Date.now()}`, password: 'x', role: 'health', authType: 'EMAIL_LEGACY', email: `shape-${Date.now()}@example.test`, firstName: 'a', lastName: 'b', organizationId: org.id, status: 'ACTIVE' } });
  const f = 'FORGED-SHAPE';
  const farm = await p.farm.create({ data: { ownerId: user.id, organizationId: org.id, farmName: 'shape', farmType: 'CULTIVATION', address: '1', province: 'p', district: 'd', subDistrict: 's', postalCode: '10540', totalArea: 1, cultivationArea: 1, cultivationMethod: 'OUTDOOR', status: 'ACTIVE' } });
  const shapes = {
    certificates: { create: [{ certificateNumber: f, verificationCode: f, qrData: 'qr', userId: user.id, farmName: 'f', applicantName: 'a', cropType: 'cannabis', farmSize: 1, province: 'p', district: 'd', subDistrict: 's', standardId: 'std', standardName: 'GACP', validityMonths: 12, expiryDate: new Date('2099-01-01'), issuedBy: user.id, status: 'active', organizationId: org.id, farmId: farm.id }] },
    documents: { create: [{ documentType: 'LAND_RIGHTS', slotId: 'land_rights', fileUrl: '/uploads/forged.pdf' }] },
    paymentTransactions: { create: [{ phase: 'PHASE_1', gateway: 'STRIPE', amount: 588500, status: 'COMPLETED', organizationId: org.id }] },
    invoices: { create: [{ invoiceNumber: f, healthId: user.canonicalId, serviceType: 'X', subtotal: 0, totalAmount: 0, dueDate: new Date('2099-01-01'), status: 'PAID', organizationId: org.id }] },
    quotations: { create: [{ issuerType: 'PLATFORM', quotationNumber: f, subtotal: 0, vat: 0, totalAmount: 0, installments: [], status: 'ACCEPTED', validUntil: new Date('2099-01-01'), organizationId: org.id }] },
    checkoutOrders: { create: [{ milestone: 'M1', status: 'SETTLED', platformFeeNet: 0, platformFeeVat: 0, platformFeeGross: 0, totalPayableAmount: 0, organizationId: org.id }] },
    workActivities: { create: [{ workType: 'FORGED', candidateGroup: 'FORGED', triggeredAtStage: 'FORGED', organizationId: org.id }] },
    comments: { create: [{ content: 'forged', authorId: user.id, role: 'document_reviewer', organizationId: org.id }] },
    revisionDeadline: { create: { revisionDue: new Date('2099-01-01'), organizationId: org.id } },
    correctionRounds: { create: [{ stage: 'DOC_REVIEW', roundNo: 1, decidedAt: new Date(), dueAt: new Date('2099-01-01'), organizationId: org.id }] },
  };
  const out = {};
  for (const [rel, shape] of Object.entries(shapes)) {
    try {
      await p.$transaction(async (tx) => {
        await tx.application.create({ data: { applicationNumber: `SHAPE-${rel}-${Date.now()}`, healthId: user.canonicalId, areaType: 'OUTDOOR', organizationId: org.id, [rel]: shape } });
        throw new Error('ROLLBACK_OK');
      });
    } catch (e) {
      out[rel] = e.message === 'ROLLBACK_OK' ? 'valid' : e.message.slice(-400).replace(/\s+/g, ' ');
    }
  }
  console.log(JSON.stringify(out, null, 1));
  await p.farm.delete({ where: { id: farm.id } });
  await p.user.delete({ where: { id: user.id } });
  await p.organization.delete({ where: { id: org.id } });
  await p.$disconnect();
})().catch(async (e) => { console.error(e.message); process.exit(1); });

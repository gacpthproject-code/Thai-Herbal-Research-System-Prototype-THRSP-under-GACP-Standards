'use strict';
// Seeds one scratch database for the A8 walk-fix proof. Run from <tree>/apps/backend with the
// stack's env sourced. Writes ids to $R/<phase>/fixtures.json and passwords to a 0600 file only.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const R = '/home/ubuntu/work/state/reviews/a8-walk-fixes-1-runs';
const phase = process.argv[2];
const tree = process.cwd();
const OUT = path.join(R, phase);
fs.mkdirSync(OUT, { recursive: true });

const { prisma } = require(path.join(tree, 'services/prisma-database'));
const authService = require(path.join(tree, 'services/prisma-auth-service'));
const { createWorkspaceEntity } = require(path.join(tree, 'services/entity-service'));
const { deriveDimensions } = require(path.join(tree, 'services/application-requirements-service'));
const { syncApplicationDocument } = require(path.join(tree, 'services/application-document-sync'));
const { settleMilestones } = require(path.join(tree, 'test-support/settled-milestones'));
const { filedFormData, grantFilingConsents } = require(path.join(tree, 'test-support/filed-application'));
const { thaiIdCheckDigit } = require('module').createRequire(path.join(tree, 'package.json'))('@gacp/validation/thai-id-checksum');

const nid = (prefix) => { const f = (prefix + crypto.randomInt(1e11).toString().padStart(11, '0')).slice(0, 12); return f + thaiIdCheckDigit(f); };
const pw = () => `A8f!${crypto.randomBytes(9).toString('base64url')}`;
const UPLOADS = path.join(tree, 'public/uploads');

function pdf(label) {
  const body = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 60>>stream\nBT /F1 18 Tf 60 760 Td (TEST DOCUMENT - A8 FIX ${label}) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n`;
  const pad = '%' + 'x'.repeat(78) + '\n';
  return Buffer.from(body + pad.repeat(40) + 'trailer<</Root 1 0 R>>\n%%EOF\n');
}
function writeUpload(rel, label) {
  const abs = path.join(UPLOADS, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, pdf(label));
  return `/uploads/${rel}`;
}

async function person(role, label) {
  const id13 = nid(role === 'health' ? '1' : '3');
  const password = pw();
  const user = await authService.register({
    ...(role === 'health' ? { healthId: id13 } : { providerId: id13, accountType: 'PROVIDER' }),
    role, password, firstName: 'ทดสอบ-A8F', lastName: label,
    email: `a8f-${label}-${crypto.randomBytes(3).toString('hex')}@example.test`, phoneNumber: '0800000000',
  });
  await prisma.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } });
  return { id: user.id, canonicalId: user.canonicalId, organizationId: user.organizationId, login: id13, password };
}

(async () => {
  if (!(await prisma.organization.findUnique({ where: { slug: 'default' } }))) {
    await prisma.organization.create({ data: { name: 'ทดสอบ A8F', slug: 'default', code: 'DEFAULT' } });
  }
  const applicant = await person('health', 'ผู้ยื่น');
  const reviewer = await person('document_reviewer', 'ผู้ตรวจเอกสาร');
  const inspector = await person('field_inspector', 'ผู้ตรวจพื้นที่');
  const org = applicant.organizationId;
  await grantFilingConsents(prisma, { userIds: [applicant.id], organizationId: org });
  const { entity } = await createWorkspaceEntity({
    user: { id: applicant.id, organizationId: org }, type: 'JURISTIC',
    applicantData: { taxId: nid('0'), companyName: 'บริษัท ทดสอบ-A8F จำกัด' },
  });

  const plantCode = deriveDimensions({ id: 'probe', areaType: 'OUTDOOR', formData: { plantId: 'cannabis' } }).plantCode;
  await prisma.requirementRule.create({
    data: { plantCode, slotId: 'sop_manual', isRequired: true, effectiveFrom: new Date('2020-01-01'), createdBy: reviewer.id, reason: 'A8F walk fixture' },
  }).catch(() => {});

  const location = { latitude: 13.8622, longitude: 100.5145, farmAddress: '99 หมู่ 1 บางพลี สมุทรปราการ' };
  let seq = 0;
  async function application(status, extra = {}, formExtra = {}) {
    seq += 1;
    const row = await prisma.application.create({
      data: {
        applicationNumber: `APP-2569-A8F${phase.toUpperCase().slice(0, 1)}${seq}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
        healthId: applicant.canonicalId, entityId: entity.id, submitterId: applicant.id, status,
        serviceType: 'CERTIFICATION', areaType: 'OUTDOOR', organizationId: org, reviewerId: reviewer.id,
        certificationPurposes: ['EXPORT'],
        formData: { ...filedFormData(), serverRequirementSnapshot: undefined, workflowState: status, locationData: location, ...formExtra },
        ...extra,
      },
    });
    await settleMilestones(prisma, row, status === 'ASSIGNED_FOR_REVIEW' ? ['M1'] : ['M1', 'M2']);
    return row;
  }

  const out = { phase, entityId: entity.id, users: { applicant: applicant.id, reviewer: reviewer.id, inspector: inspector.id }, revision: [], inspect: null, car: null, carNone: null };

  for (const label of ['desk', 'phone']) {
    const app = await application('ASSIGNED_FOR_REVIEW');
    for (const slotId of ['sop_manual', 'land_rights', 'company_reg']) {
      const fileUrl = writeUpload(`application-drafts/a8f-${app.id.slice(0, 8)}-${slotId}.pdf`, `${slotId} first`);
      await syncApplicationDocument(prisma, { applicationId: app.id, documentId: crypto.randomUUID(), slotId, fileName: `${slotId}-first.pdf`, fileUrl, mimeType: 'application/pdf', uploadedBy: applicant.id });
    }
    out.revision.push({ label, id: app.id, number: app.applicationNumber });
  }

  const insp = await application('AUDIT_CONFIRMED', { auditorId: inspector.id, scheduledDate: new Date() });
  const audit = await prisma.auditChecklist.create({ data: { applicationId: insp.id, templateName: 'GACP_GENERAL', sections: [], auditorId: inspector.id, organizationId: org, status: 'IN_PROGRESS' } });
  out.inspect = { id: insp.id, number: insp.applicationNumber, auditId: audit.id };

  const askedAt = new Date(Date.now() - 86400000).toISOString();
  const carPath = writeUpload('car/CAR-a8f-evidence.pdf', 'CAR evidence');
  const car = await application('CAR_REVIEWING', { auditorId: inspector.id, scheduledDate: new Date() }, {
    carRequestedAt: askedAt, carDueAt: new Date(Date.now() + 29 * 86400000).toISOString(),
    carDocuments: [{ filename: 'CAR-a8f-evidence.pdf', originalName: 'car_evidence.pdf', path: carPath, size: 4000, uploadedAt: new Date().toISOString() }],
    carNotes: 'ทดสอบ-A8F: จัดทำแนวกันชนแล้ว แนบภาพและบันทึก',
  });
  out.car = { id: car.id, number: car.applicationNumber };
  const carNone = await application('CAR_REVIEWING', { auditorId: inspector.id, scheduledDate: new Date() }, {
    carRequestedAt: askedAt, carDueAt: new Date(Date.now() + 29 * 86400000).toISOString(), carDocuments: [],
  });
  out.carNone = { id: carNone.id, number: carNone.applicationNumber };

  fs.writeFileSync(path.join(OUT, 'fixtures.json'), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(OUT, 'creds.json'), JSON.stringify({ applicant, reviewer, inspector }), { mode: 0o600 });
  console.log(`fixtures ${phase}: revision=${out.revision.length} inspect=${out.inspect.number} car=${out.car.number} carNone=${out.carNone.number}`);
  await prisma.$disconnect();
})().catch(async (e) => { console.error('FIXTURE ERR', e.code || '', e.message); process.exit(1); });

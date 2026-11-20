'use strict';
// Seeds the scratch database for the launch-guards-1 screenshots. Run from <tree>/apps/backend with the
// stack env sourced: node fixtures.js <phase>. Ids to $R/<phase>/fixtures.json, logins to a 0600 file.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const R = '/home/ubuntu/work/state/reviews/launch-guards-1-runs';
const phase = process.argv[2];
const tree = process.cwd();
const OUT = path.join(R, phase);
fs.mkdirSync(OUT, { recursive: true });

const { prisma } = require(path.join(tree, 'services/prisma-database'));
const authService = require(path.join(tree, 'services/prisma-auth-service'));
const { createWorkspaceEntity } = require(path.join(tree, 'services/entity-service'));
const { settleMilestones } = require(path.join(tree, 'test-support/settled-milestones'));
const { filedFormData, grantFilingConsents } = require(path.join(tree, 'test-support/filed-application'));
const auditOnsiteService = require(path.join(tree, 'services/audit-onsite-service'));
const decisions = require(path.join(tree, 'services/certification-decision-service'));
const { thaiIdCheckDigit } = require('module').createRequire(path.join(tree, 'package.json'))('@gacp/validation/thai-id-checksum');

const nid = (prefix) => { const f = (prefix + crypto.randomInt(1e11).toString().padStart(11, '0')).slice(0, 12); return f + thaiIdCheckDigit(f); };
const pw = () => `Lg1!${crypto.randomBytes(9).toString('base64url')}`;

async function person(role, label, organizationId) {
  const id13 = nid(role === 'health' ? '1' : '3');
  const password = pw();
  const user = await authService.register({
    ...(role === 'health' ? { healthId: id13 } : { providerId: id13, accountType: 'PROVIDER' }),
    role, password, firstName: 'ทดสอบ-LG1', lastName: label,
    email: `lg1-${label}-${crypto.randomBytes(3).toString('hex')}@example.test`, phoneNumber: '0800000000',
  });
  await prisma.user.update({ where: { id: user.id }, data: { status: 'ACTIVE', ...(organizationId ? { organizationId } : {}) } });
  return { id: user.id, canonicalId: user.canonicalId, organizationId: organizationId || user.organizationId, role, canonicalRole: role, login: id13, password };
}

(async () => {
  const applicant = await person('health', 'ผู้ยื่น');
  const org = applicant.organizationId;
  const reviewer = await person('document_reviewer', 'ผู้ตรวจเอกสาร', org);
  const inspector = await person('field_inspector', 'ผู้ตรวจพื้นที่', org);
  const approver = await person('certificate_approver', 'ผู้อนุมัติ', org);
  await grantFilingConsents(prisma, { userIds: [applicant.id], organizationId: org });
  const { entity } = await createWorkspaceEntity({
    user: { id: applicant.id, organizationId: org }, type: 'JURISTIC',
    applicantData: { taxId: nid('0'), companyName: 'บริษัท ทดสอบ-LG1 จำกัด' },
  });
  for (const [code, nameTH, nameEN] of [['CAN', 'กัญชา', 'Cannabis'], ['GIN', 'ขิง', 'Ginger'], ['TUR', 'ขมิ้นชัน', 'Turmeric']]) {
    if (!(await prisma.plantSpecies.findUnique({ where: { code } }))) {
      await prisma.plantSpecies.create({ data: { code, nameTH, nameEN } });
    }
  }

  let seq = 0;
  async function passedWithEvidence() {
    seq += 1;
    const row = await prisma.application.create({
      data: {
        applicationNumber: `APP-2569-LG1${phase.toUpperCase().slice(0, 1)}${seq}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
        healthId: applicant.canonicalId, entityId: entity.id, submitterId: applicant.id, status: 'AUDIT_CONFIRMED',
        serviceType: 'CERTIFICATION', areaType: 'OUTDOOR', organizationId: org, reviewerId: reviewer.id, auditorId: inspector.id,
        certificationPurposes: ['RESEARCH'], scheduledDate: new Date(),
        formData: {
          ...filedFormData(), serverRequirementSnapshot: undefined, workflowState: 'AUDIT_CONFIRMED', plantId: 'cannabis',
          locationType: 'OUTDOOR', cultivationMethods: ['outdoor'],
          farmData: {
            farmName: 'ฟาร์มทดสอบ LG1', address: '123 หมู่ 4', province: 'สมุทรปราการ', district: 'บางพลี',
            subdistrict: 'บางพลีใหญ่', postalCode: '10540', totalAreaSize: '5', totalAreaUnit: 'Rai', gpsLat: '13.12', gpsLng: '100.65',
          },
          plots: [{ id: 'p1', name: 'แปลงที่ 1', areaSize: '2', areaUnit: 'Rai', solarSystem: 'OUTDOOR' }],
        },
      },
    });
    await settleMilestones(prisma, row, ['M1', 'M2']);
    const audit = await prisma.auditChecklist.create({
      data: { applicationId: row.id, templateName: 'GACP_GENERAL', sections: [], auditorId: inspector.id, organizationId: org, status: 'IN_PROGRESS' },
    });
    for (const item of auditOnsiteService.CHECKLIST_TEMPLATE_2026) {
      await auditOnsiteService.submitChecklistItem({ auditId: audit.id, itemCode: item.itemCode, response: 'PASS', actorId: inspector.id, prisma });
    }
    for (let i = 0; i < auditOnsiteService.DEFAULT_MIN_PHOTOS; i += 1) {
      await auditOnsiteService.uploadPhoto({
        auditId: audit.id, fileBuffer: Buffer.from(`lg1-${audit.id}-${i}`), fileName: `e-${i}.jpg`,
        gpsLat: 13.12 + i * 1e-5, gpsLng: 100.65 + i * 1e-5, capturedAt: new Date(), uploadedBy: inspector.id, organizationId: org, prisma,
      });
    }
    await auditOnsiteService.submitDecision({ auditId: audit.id, decision: 'PASS', summary: 'ผ่านทุกข้อ แปลงตรงตามที่ยื่น', actorId: inspector.id, actorRole: 'field_inspector', prisma });
    return prisma.application.findUnique({ where: { id: row.id }, select: { id: true, applicationNumber: true, status: true } });
  }

  const decide = await passedWithEvidence();
  const certified = await passedWithEvidence();
  await decisions.markDecisionFileViewed({ prisma, applicationRef: certified.id, organizationId: org, approverId: approver.id });
  const issued = await decisions.approveCertification({ applicationRef: certified.id, actor: approver, reason: 'หลักฐานครบ ผลตรวจผ่านทุกข้อ', prisma });

  const out = { phase, decide, certified: issued };
  fs.writeFileSync(path.join(OUT, 'fixtures.json'), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(OUT, 'creds.json'), JSON.stringify({ applicant, approver }), { mode: 0o600 });
  console.log(`fixtures ${phase}: decide=${decide.applicationNumber} ${decide.status} certified=${issued.applicationNumber} ${issued.status}`);
  await prisma.$disconnect();
  process.exit(0);
})().catch(async (e) => { console.error('FIXTURE ERR', e.code || '', e.message); process.exit(1); });

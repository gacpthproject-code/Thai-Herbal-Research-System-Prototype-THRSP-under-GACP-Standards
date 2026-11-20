// Seeds the CERTIFIED application + active certificate that unlocks /health/planting
// (PlantingCertGate), and links the cycle to it. Run from apps/backend with the scratch DATABASE_URL.
// Usage: node seed-active-certificate.js <userId> <entityId> <farmId> <cycleId>
const { PrismaClient } = require('@prisma/client');
(async () => {
  const p = new PrismaClient();
  const [userId, entityId, farmId, cycleId] = process.argv.slice(2);
  const u = await p.user.findUnique({ where: { id: userId }, select: { id: true, organizationId: true, canonicalId: true, healthId: true } });
  const app = await p.application.create({ data: {
    applicationNumber: 'APP-VP7B-0001', healthId: u.canonicalId || u.healthId, areaType: 'OUTDOOR', organizationId: u.organizationId,
    entityId, submitterId: u.id, status: 'CERTIFIED', formData: { steps: {}, workflowState: 'CERTIFIED' } } });
  const cert = await p.certificate.create({ data: {
    certificateNumber: 'GACP-TH-2569-VP7B01', verificationCode: 'V-VP7B01', qrData: 'qr', applicationId: app.id, userId: u.id,
    farmId, farmName: 'ฟาร์มทดสอบไฟล์แนบ', applicantName: 'สมชาย ทดสอบ', cropType: 'cannabis', farmSize: 1,
    province: 'สมุทรปราการ', district: 'บางพลี', subDistrict: 'บางพลีใหญ่', standardId: 'std', standardName: 'GACP',
    expiryDate: new Date(Date.now() + 365 * 86400e3), issuedBy: u.id, status: 'active', organizationId: u.organizationId,
    holderDisplayName: 'บริษัท สวนสมุนไพรทดสอบ จำกัด', holderType: 'JURISTIC', submittedByUserId: u.id } });
  await p.plantingCycle.update({ where: { id: cycleId }, data: { certificateId: cert.id } });
  console.log(JSON.stringify({ applicationId: app.id, certificateId: cert.id }));
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });

const { PrismaClient } = require('@prisma/client');
(async () => {
  const p = new PrismaClient();
  const u = await p.user.findUnique({ where: { id: process.argv[2] }, select: { id: true, organizationId: true } });
  const org = u.organizationId;
  const C = await p.entity.create({ data: { type: 'JURISTIC', displayName: 'บริษัท สวนสมุนไพรทดสอบ จำกัด', organizationId: org } });
  await p.entityMembership.create({ data: { userId: u.id, entityId: C.id, role: 'OWNER', status: 'ACTIVE', organizationId: org } });
  const farm = await p.farm.create({ data: {
    ownerId: u.id, farmName: 'ฟาร์มทดสอบไฟล์แนบ', farmType: 'CULTIVATION', address: '1 หมู่ 2', province: 'สมุทรปราการ',
    district: 'บางพลี', subDistrict: 'บางพลีใหญ่', postalCode: '10540', totalArea: 1, cultivationArea: 1,
    cultivationMethod: 'OUTDOOR', organizationId: org, entityId: C.id } });
  const sp = await p.plantSpecies.create({ data: { code: 'VP7B', nameTH: 'กัญชา' } });
  const cycle = await p.plantingCycle.create({ data: { cycleName: 'รอบปลูกที่ 1', farmId: farm.id, plantSpeciesId: sp.id, startDate: new Date(), organizationId: org } });
  console.log(JSON.stringify({ entityId: C.id, farmId: farm.id, cycleId: cycle.id, hasOrg: Boolean(org) }));
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });

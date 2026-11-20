// Gives the walk cycle one plot, so the activity form's default PLOT scope has a plot to pick.
// Usage (from apps/backend, scratch DATABASE_URL): node seed-plot.js <farmId> <cycleId>
const { PrismaClient } = require('@prisma/client');
(async () => {
  const p = new PrismaClient();
  const [farmId, cycleId] = process.argv.slice(2);
  const farm = await p.farm.findUnique({ where: { id: farmId }, select: { organizationId: true } });
  const plot = await p.plot.create({ data: { farmId, name: 'แปลง A', area: 1, areaUnit: 'Rai', organizationId: farm.organizationId } });
  await p.plantingCyclePlot.create({ data: { cycleId, plotId: plot.id, allocatedAreaSqm: 1600, plannedPlantCount: 100, organizationId: farm.organizationId } });
  console.log(JSON.stringify({ plotId: plot.id }));
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });

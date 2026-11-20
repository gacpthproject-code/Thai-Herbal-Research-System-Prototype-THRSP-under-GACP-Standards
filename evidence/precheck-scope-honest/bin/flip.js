'use strict';
const fs = require('fs');
const path = require('path');
const { prisma } = require(path.join(process.cwd(), 'services/prisma-database'));
const fx = JSON.parse(fs.readFileSync(path.join(process.env.PSH_PRIVATE, 'fixtures.json'), 'utf8'));
(async () => {
    await prisma.application.update({ where: { id: fx.app.id }, data: { status: 'ASSIGNED_FOR_REVIEW', reviewerId: fx.reviewerId } });
    const rows = await prisma.documentPrecheck.findMany({ where: { applicationId: fx.app.id }, select: { slotId: true, status: true } });
    console.log(`flip: ASSIGNED_FOR_REVIEW; prechecks ${JSON.stringify(rows)}`);
    await prisma.$disconnect();
})().catch((error) => { console.error('FLIP FAILED', error.message); process.exit(1); });

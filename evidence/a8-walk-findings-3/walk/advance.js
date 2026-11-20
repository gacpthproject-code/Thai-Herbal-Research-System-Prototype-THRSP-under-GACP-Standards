'use strict';
const fs = require('fs');
const fromTree = require('module').createRequire(`${process.cwd()}/`);
const { PrismaClient } = fromTree('@prisma/client');
const { writeApplicationStatus } = fromTree('./services/application-status-writer');

(async () => {
    const fx = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    const p = new PrismaClient();
    await writeApplicationStatus({
        prisma: p, applicationId: fx.reviewApp.id, fromStatus: 'ASSIGNED_FOR_REVIEW', toStatus: 'DOC_APPROVED',
        actorId: fx.reviewer.id, actorRole: 'document_reviewer', reason: 'WALK_DOCS_ACCEPTED',
    });
    const row = await p.application.findUnique({ where: { id: fx.reviewApp.id }, select: { status: true } });
    const work = await p.workActivity.findMany({ where: { applicationId: fx.reviewApp.id }, orderBy: { createdAt: 'asc' }, select: { workType: true, state: true, triggeredAtStage: true } });
    console.log(`advance: ${fx.reviewApp.number} status=${row.status} work=${JSON.stringify(work)}`);
    await p.$disconnect();
})().catch((e) => { console.error('advance failed:', e.message); process.exit(1); });

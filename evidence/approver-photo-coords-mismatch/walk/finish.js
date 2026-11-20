'use strict';
// After the browser uploaded the photographs: answer every checklist item PASS and record the
// inspector's PASS through the same service the inspect page's doors call, so the application
// reaches AUDIT_PASSED and the approver's file is decidable. cwd = <tree>/apps/backend.
const fs = require('fs');
const fx = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const fromTree = require('module').createRequire(`${process.cwd()}/`);
const onsite = fromTree('./services/audit-onsite-service');
const { prisma } = fromTree('./services/prisma-database');

(async () => {
    for (const item of onsite.CHECKLIST_TEMPLATE_2026) {
        await onsite.submitChecklistItem({ auditId: fx.auditId, itemCode: item.itemCode, response: 'PASS', actorId: fx.inspectorId, prisma });
    }
    await onsite.submitDecision({
        auditId: fx.auditId, decision: 'PASS', summary: 'ผ่านทุกข้อ แปลงตรงตามที่ยื่น', actorId: fx.inspectorId, actorRole: 'field_inspector', prisma,
    });
    const row = await prisma.application.findUnique({ where: { id: fx.applicationId }, select: { status: true } });
    console.log(`finish: application status ${row.status}`);
    await prisma.$disconnect();
    process.exit(0);
})().catch((e) => { console.error('finish failed:', e.message); process.exit(1); });

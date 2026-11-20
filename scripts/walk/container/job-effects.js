const { prisma } = require('./services/prisma-database');
const { withoutTenantScope } = require('./services/tenant-context');
const { runCorrectionDeadlineSweep } = require('./jobs/correction-deadline-sweep');
const graceMs = input.graceHours * 60 * 60 * 1000;
try {
    const sweep = await runCorrectionDeadlineSweep({ now: new Date(Date.now() - graceMs), dryRun: true });
    const waiting = await withoutTenantScope(() => prisma.application.groupBy({
        by: ['status'], where: { isDeleted: false, status: { in: ['REVISION_REQUESTED', 'CAR_PENDING'] } }, _count: true,
    }));
    const closedBySweep = await withoutTenantScope(() => prisma.application.count({
        where: { status: 'EXPIRED', closedReason: 'REVISION_OVERDUE' },
    }));
    const expiredCerts = await withoutTenantScope(() => prisma.certificate.findMany({
        where: { expiryDate: { lt: new Date() } }, select: { certificateNumber: true, expiryDate: true, status: true },
        orderBy: { expiryDate: 'desc' }, take: 3,
    }));
    return {
        overdue: sweep.expired.map((a) => ({ number: a.applicationNumber, status: a.status })),
        waiting: Object.fromEntries(waiting.map((w) => [w.status, w._count])),
        closedBySweep,
        expiredCerts: expiredCerts.map((c) => ({ number: c.certificateNumber, expiryDate: c.expiryDate, status: c.status })),
    };
} finally { await prisma.$disconnect(); }

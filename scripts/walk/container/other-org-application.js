const { prisma } = require('./services/prisma-database');
const { withoutTenantScope } = require('./services/tenant-context');
try {
    const mine = await withoutTenantScope(() => prisma.application.findUnique({ where: { id: input.applicationId }, select: { organizationId: true, entityId: true, healthId: true } }));
    if (!mine) { return { found: false }; }
    const other = await withoutTenantScope(() => prisma.application.findFirst({
        where: { isDeleted: false, healthId: { not: mine.healthId }, ...(mine.entityId ? { OR: [{ entityId: null }, { entityId: { not: mine.entityId } }] } : {}) },
        select: { id: true, applicationNumber: true, organizationId: true },
        orderBy: { createdAt: 'desc' },
    }));
    return { found: !!other, id: other?.id, number: other?.applicationNumber, sameOrganization: other ? other.organizationId === mine.organizationId : null };
} finally { await prisma.$disconnect(); }

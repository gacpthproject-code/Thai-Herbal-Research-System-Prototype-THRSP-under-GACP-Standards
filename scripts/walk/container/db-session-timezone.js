const { prisma } = require('./services/prisma-database');
const { withoutTenantScope } = require('./services/tenant-context');
const SHOW_TIMEZONE = 'SHOW timezone';
try {
    const rows = await withoutTenantScope(() => prisma.$queryRawUnsafe(SHOW_TIMEZONE));
    return { timezone: Object.values(rows[0] || {})[0] ?? null };
} catch (err) {
    return { error: String(err && (err.code || err.name)) };
} finally { await prisma.$disconnect(); }

'use strict';
// The register door refuses without the `default` organisation row (prisma-auth-service NO_DEFAULT_ORG).
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.organization.upsert({
    where: { slug: 'default' },
    update: {},
    create: { name: 'Default Organization', slug: 'default', code: 'DEFAULT', type: 'INTERNAL', isolationTier: 'SHARED', status: 'ACTIVE', createdBy: 'system' },
}).then((org) => { console.log('default org', org.id); return prisma.$disconnect(); });

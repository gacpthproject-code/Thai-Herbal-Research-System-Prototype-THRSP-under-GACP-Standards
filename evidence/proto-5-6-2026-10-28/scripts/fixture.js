'use strict';
// Walk fixture: one organisation, one applicant (health) and one field inspector on the walk
// database, with real access tokens minted by the backend's own signer. Writes fixture.json
// (0600) next to the secrets and prints ids only.
const crypto = require('crypto');
const fs = require('fs');
const BACKEND = '/home/ubuntu/work/wt-proto56/apps/backend';
const { PrismaClient } = require(`${BACKEND}/node_modules/@prisma/client`);
const jwtConfig = require(`${BACKEND}/config/jwt-security`);

(async () => {
    const prisma = new PrismaClient();
    const sfx = crypto.randomUUID().slice(0, 8);
    const org = await prisma.organization.create({ data: { name: `walk-${sfx}`, slug: `walk-${sfx}`, code: `WALK_${sfx}`.toUpperCase() } });
    const users = {};
    for (const [key, role, firstName] of [['farmer', 'health', 'สมชาย'], ['inspector', 'field_inspector', 'สมหญิง']]) {
        const id = crypto.randomUUID();
        const canonicalId = `walk-${key}-${sfx}`;
        await prisma.user.create({
            data: {
                id, canonicalId, healthId: role === 'health' ? canonicalId : null, password: 'x', role,
                authType: 'EMAIL_LEGACY', email: `walk-${key}-${sfx}@example.test`,
                firstName, lastName: 'ทดสอบ', organizationId: org.id, status: 'ACTIVE',
            },
        });
        const token = jwtConfig.generateToken({ id, userId: id, role, canonicalRole: role }, role === 'health' ? 'public' : 'provider');
        users[key] = { id, canonicalId, role, firstName, lastName: 'ทดสอบ', email: `walk-${key}-${sfx}@example.test`, organizationId: org.id, token };
    }
    fs.writeFileSync('/tmp/proto56/secret/fixture.json', JSON.stringify(users, null, 1), { mode: 0o600 });
    console.log(JSON.stringify({ org: org.id, farmer: users.farmer.id, inspector: users.inspector.id }));
    await prisma.$disconnect();
})().catch((error) => { console.error(error.message); process.exit(1); });

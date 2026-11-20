'use strict';
// Walk fixture on the scratch database: the holder-scope fixture (user A, complete juristic
// holder C, drafts D/D2) with the drafts made resumable at step 3. Writes ids and A's token to
// fixture.json (0600) and prints ids only.
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('/home/ubuntu/work/wt-filingfields/apps/backend/node_modules/@prisma/client');
const { seedHolderScopeFixture } = require('/home/ubuntu/work/wt-filingfields/apps/backend/__tests__/integration/fixtures/holder-scope-fixture');

(async () => {
    const raw = new PrismaClient();
    const fx = await seedHolderScopeFixture(raw);
    const formData = {
        plantId: 'cannabis', requestType: 'NEW', certScope: 'PLANTING', applicantType: 'JURISTIC',
        certificationPurposes: [], farmData: {}, varieties: [], workflowState: 'DRAFT',
    };
    for (const id of [fx.apps.D, fx.apps.D2]) {
        await raw.application.update({ where: { id }, data: { formData, updatedAt: new Date() } });
    }
    const user = await raw.user.findUnique({ where: { id: fx.users.A.id }, select: { id: true, canonicalId: true, firstName: true, lastName: true, email: true, role: true, organizationId: true } });
    const out = { orgId: fx.orgId, userA: user, entityC: fx.entities.C, drafts: [fx.apps.D, fx.apps.D2], token: fx.tokens.A };
    const file = path.join(__dirname, 'fixture.json');
    fs.writeFileSync(file, JSON.stringify(out, null, 1), { mode: 0o600 });
    console.log(JSON.stringify({ orgId: out.orgId, userA: user.id, entityC: out.entityC, drafts: out.drafts }));
    await raw.$disconnect();
})().catch((error) => { console.error(error.message); process.exit(1); });

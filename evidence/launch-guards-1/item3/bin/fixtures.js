'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const backendDir = process.cwd();
const PRIVATE = process.env.LG1U_PRIVATE;
const phases = process.argv.slice(2);
const { prisma } = require(path.join(backendDir, 'services/prisma-database'));
const authService = require(path.join(backendDir, 'services/prisma-auth-service'));
const { createWorkspaceEntity } = require(path.join(backendDir, 'services/entity-service'));
const { grantFilingConsents } = require(path.join(backendDir, 'test-support/filed-application'));
const { thaiIdCheckDigit } = require('module').createRequire(path.join(backendDir, 'package.json'))('@gacp/validation/thai-id-checksum');

const nid = (prefix) => { const f = (prefix + crypto.randomInt(1e11).toString().padStart(11, '0')).slice(0, 12); return f + thaiIdCheckDigit(f); };

(async () => {
    if (!(await prisma.organization.findUnique({ where: { slug: 'default' } }))) {
        await prisma.organization.create({ data: { name: 'ทดสอบ LG1U', slug: 'default', code: 'DEFAULT' } });
    }
    const out = {};
    for (const phase of phases) {
        const login = nid('1');
        const password = `Lg1u!${crypto.randomBytes(9).toString('base64url')}`;
        const user = await authService.register({
            healthId: login, role: 'health', password, firstName: 'ทดสอบ-LG1U', lastName: `ผู้ยื่น-${phase}`,
            email: `lg1u-${phase}-${crypto.randomBytes(3).toString('hex')}@example.test`, phoneNumber: '0800000000',
        });
        await prisma.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } });
        await grantFilingConsents(prisma, { userIds: [user.id], organizationId: user.organizationId });
        const taxId = nid('0');
        const { entity } = await createWorkspaceEntity({
            user: { id: user.id, organizationId: user.organizationId }, type: 'JURISTIC',
            applicantData: { taxId, companyName: `บริษัท ทดสอบ-LG1U-${phase} จำกัด` },
        });
        out[phase] = { login, password, entityId: entity.id, taxId };
    }
    fs.writeFileSync(path.join(PRIVATE, 'creds.json'), JSON.stringify(out), { mode: 0o600 });
    console.log(`fixtures: ${phases.join(', ')}`);
    await prisma.$disconnect();
})().catch((error) => { console.error('FIXTURE FAILED', error.code || '', error.message); process.exit(1); });

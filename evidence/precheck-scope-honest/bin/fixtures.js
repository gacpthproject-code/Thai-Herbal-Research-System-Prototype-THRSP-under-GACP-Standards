'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PRIVATE = process.env.PSH_PRIVATE;
const tree = process.cwd();
const { prisma } = require(path.join(tree, 'services/prisma-database'));
const authService = require(path.join(tree, 'services/prisma-auth-service'));
const { ROLES, defaultPermissionsFor } = require(path.join(tree, 'services/entity-service'));
const { filedFormData, filedHolderData, grantFilingConsents } = require(path.join(tree, 'test-support/filed-application'));
const { thaiIdCheckDigit } = require('module').createRequire(path.join(tree, 'package.json'))('@gacp/validation/thai-id-checksum');

const nid = (prefix) => { const f = (prefix + crypto.randomInt(1e11).toString().padStart(11, '0')).slice(0, 12); return f + thaiIdCheckDigit(f); };
const pw = () => `Psh!${crypto.randomBytes(9).toString('base64url')}`;

async function person(role, label) {
    const id13 = nid(role === 'health' ? '1' : '3');
    const password = pw();
    const user = await authService.register({
        ...(role === 'health' ? { healthId: id13 } : { providerId: id13, accountType: 'PROVIDER' }),
        role, password, firstName: 'ทดสอบ', lastName: label,
        email: `psh-${crypto.randomBytes(3).toString('hex')}@example.test`, phoneNumber: '0800000000',
    });
    await prisma.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } });
    return { id: user.id, canonicalId: user.canonicalId, organizationId: user.organizationId, login: id13, password };
}

(async () => {
    if (!(await prisma.organization.findUnique({ where: { slug: 'default' } }))) {
        await prisma.organization.create({ data: { name: 'ทดสอบ PSH', slug: 'default', code: 'DEFAULT' } });
    }
    const applicant = await person('health', 'ผู้ยื่น');
    const reviewer = await person('document_reviewer', 'ผู้ตรวจเอกสาร');
    const org = applicant.organizationId;
    await grantFilingConsents(prisma, { userIds: [applicant.id], organizationId: org });
    const entity = await prisma.entity.create({
        data: {
            type: 'INDIVIDUAL', displayName: 'ทดสอบ ผู้ยื่น', slug: `psh-${crypto.randomBytes(4).toString('hex')}`,
            status: 'ACTIVE', createdBy: applicant.id, organizationId: org, ...filedHolderData('INDIVIDUAL'),
        },
    });
    await prisma.entityMembership.create({
        data: { userId: applicant.id, entityId: entity.id, role: ROLES.OWNER, status: 'ACTIVE', acceptedAt: new Date(), organizationId: org, permissions: defaultPermissionsFor(ROLES.OWNER) },
    });
    const app = await prisma.application.create({
        data: {
            applicationNumber: `APP-2569-PSH-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
            healthId: applicant.canonicalId, entityId: entity.id, submitterId: applicant.id, status: 'DRAFT',
            serviceType: 'CERTIFICATION', areaType: 'OUTDOOR', organizationId: org,
            certificationPurposes: ['EXPORT'],
            formData: filedFormData({ applicantType: 'INDIVIDUAL', applicantData: { firstName: 'ทดสอบ', lastName: 'ผู้ยื่น', phone: '0812345678' } }),
        },
    });
    const out = { entityId: entity.id, reviewerId: reviewer.id, app: { id: app.id, number: app.applicationNumber } };
    fs.writeFileSync(path.join(PRIVATE, 'fixtures.json'), JSON.stringify(out, null, 2));
    fs.writeFileSync(path.join(PRIVATE, 'creds.json'), JSON.stringify({ applicant, reviewer }), { mode: 0o600 });
    console.log(`fixtures: app=${app.applicationNumber}`);
    await prisma.$disconnect();
})().catch((error) => { console.error('FIXTURE FAILED', error.code || '', error.message); process.exit(1); });

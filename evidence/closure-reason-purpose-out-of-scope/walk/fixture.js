'use strict';
const crypto = require('crypto');
const fs = require('fs');
const fromTree = require('module').createRequire(`${process.cwd()}/`);
const bcrypt = fromTree('bcryptjs');
const { PrismaClient } = fromTree('@prisma/client');
const { identityLookupColumns, AUTH_TYPE_PROVIDER, AUTH_TYPE_HEALTH } = fromTree('./services/auth/identity-lookup-columns');

const OUT = process.argv[2];
if (!OUT) { throw new Error('usage: fixture.js <out.json>'); }
const digits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
const thaiId = () => {
    const body = `1${digits(11)}`;
    const sum = [...body].reduce((acc, d, i) => acc + Number(d) * (13 - i), 0);
    return `${body}${(11 - (sum % 11)) % 10}`;
};

(async () => {
    const p = new PrismaClient();
    const sfx = crypto.randomBytes(3).toString('hex');
    const password = `Cr!${crypto.randomBytes(9).toString('base64url')}9a`;
    const hash = await bcrypt.hash(password, 10);
    const org = await p.organization.create({ data: { name: `cr-${sfx}`, slug: `cr-${sfx}`, code: `CR_${sfx}`.toUpperCase() } });
    const adminProviderId = `7${digits(12)}`;
    await p.user.create({
        data: {
            ...identityLookupColumns(adminProviderId, AUTH_TYPE_PROVIDER),
            canonicalId: `cr-admin-${sfx}`, providerId: adminProviderId, password: hash, role: 'system_admin_dtam', authType: AUTH_TYPE_PROVIDER,
            email: `cr-admin-${sfx}@example.test`, firstName: 'ผู้ดูแล', lastName: 'ระบบ', organizationId: org.id, status: 'ACTIVE', accountType: 'PROVIDER',
        },
    });
    const healthId = thaiId();
    const applicant = await p.user.create({
        data: {
            ...identityLookupColumns(healthId, AUTH_TYPE_HEALTH),
            canonicalId: `cr-app-${sfx}`, healthId, password: hash, role: 'health', authType: AUTH_TYPE_HEALTH,
            email: `cr-app-${sfx}@example.test`, firstName: 'สมชาย', lastName: 'ปลูกขิง', organizationId: org.id, status: 'ACTIVE',
        },
    });
    const entity = await p.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท สวนขิง ${sfx} จำกัด`, organizationId: org.id } });
    await p.entityMembership.create({ data: { userId: applicant.id, entityId: entity.id, role: 'OWNER', organizationId: org.id } });
    const application = await p.application.create({
        data: {
            applicationNumber: `APP-CR-${sfx}`, healthId: applicant.canonicalId, areaType: 'OUTDOOR', organizationId: org.id,
            entityId: entity.id, submitterId: applicant.id, status: 'ASSIGNED_FOR_REVIEW',
            formData: { workflowState: 'ASSIGNED_FOR_REVIEW', plantId: 'ginger', certificationPurposes: ['MEDICAL'] },
        },
    });
    const out = {
        applicationId: application.id, applicationNumber: application.applicationNumber, applicantId: applicant.id,
        adminProviderId, healthId, password,
    };
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2), { mode: 0o600 });
    console.log(`fixture: ${application.applicationNumber} ASSIGNED_FOR_REVIEW ginger purposes=[MEDICAL]`);
    await p.$disconnect();
    process.exit(0);
})().catch((e) => { console.error('fixture failed:', e.message); process.exit(1); });

'use strict';
// One กทล.1 filing waiting on CAR evidence, filed before the holder registry existed: its
// entity is a JURISTIC row with a display name and nothing in payload.holder, the shape every
// in-flight application on staging/demo has (F-A8c-06). cwd must be <tree>/apps/backend and
// DATABASE_URL must point at the scratch Postgres. Writes ids + scratch credentials (0600).
const crypto = require('crypto');
const fs = require('fs');
const fromTree = require('module').createRequire(`${process.cwd()}/`);
const bcrypt = fromTree('bcryptjs');
const { PrismaClient } = fromTree('@prisma/client');
const { identityLookupColumns, AUTH_TYPE_PROVIDER, AUTH_TYPE_HEALTH } = fromTree('./services/auth/identity-lookup-columns');
const { filedFormData, grantFilingConsents } = fromTree('./test-support/filed-application');

const OUT = process.argv[2];
if (!OUT) { throw new Error('usage: fixture.js <out.json>'); }
const digits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
const thaiId = () => {
    const body = `1${digits(11)}`;
    const sum = body.split('').reduce((s, d, i) => s + Number(d) * (13 - i), 0);
    return `${body}${(11 - (sum % 11)) % 10}`;
};

(async () => {
    const p = new PrismaClient();
    const sfx = crypto.randomBytes(3).toString('hex');
    const password = `Cm!${crypto.randomBytes(9).toString('base64url')}9a`;
    const hash = await bcrypt.hash(password, 10);
    const org = await p.organization.create({ data: { name: `cm-${sfx}`, slug: `cm-${sfx}`, code: `CM_${sfx}`.toUpperCase() } });
    const providerId = `7${digits(12)}`;
    const inspector = await p.user.create({
        data: {
            ...identityLookupColumns(providerId, AUTH_TYPE_PROVIDER),
            canonicalId: `cm-inspector-${sfx}`, providerId, password: hash, role: 'field_inspector', authType: AUTH_TYPE_PROVIDER,
            email: `cm-inspector-${sfx}@example.test`, firstName: 'เจ้าหน้าที่', lastName: 'ผู้ตรวจพื้นที่', organizationId: org.id,
            status: 'ACTIVE', accountType: 'PROVIDER',
        },
    });
    const idCard = thaiId();
    const applicant = await p.user.create({
        data: {
            ...identityLookupColumns(idCard, AUTH_TYPE_HEALTH),
            canonicalId: `cm-health-${sfx}`, healthId: idCard, password: hash, role: 'health', authType: AUTH_TYPE_HEALTH,
            email: `cm-health-${sfx}@example.test`, firstName: 'สมชาย', lastName: 'ปลูกดี', organizationId: org.id, status: 'ACTIVE',
        },
    });
    await grantFilingConsents(p, { userIds: [applicant.id], organizationId: org.id });
    const entity = await p.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท สวนสมุนไพร ${sfx} จำกัด`, organizationId: org.id } });
    await p.entityMembership.create({ data: { userId: applicant.id, entityId: entity.id, role: 'OWNER', permissions: [], status: 'ACTIVE', organizationId: org.id } });

    const application = await p.application.create({
        data: {
            applicationNumber: `APP-CM-${sfx}`, healthId: applicant.canonicalId, areaType: 'OUTDOOR', organizationId: org.id, entityId: entity.id,
            submitterId: applicant.id, status: 'CAR_PENDING', auditorId: inspector.id, certificationPurposes: ['EXPORT'],
            formData: filedFormData({
                // FIXTURE_VARIANT=no-area-types: a form still short of a field the CAR door does ask (step 2).
                ...(process.env.FIXTURE_VARIANT === 'no-area-types' ? { farmData: { ...filedFormData().farmData, areaTypes: [] } } : {}),
                workflowState: 'CAR_PENDING',
                carRequest: { items: [{ nonConformity: 'ไม่มีป้ายแสดงเขตแปลงปลูก', correctiveAction: 'ติดป้ายแสดงเขตแปลงและถ่ายภาพ' }] },
            }),
        },
    });
    for (const milestone of ['M1', 'M2']) {
        const invoice = await p.invoice.create({
            data: {
                invoiceNumber: `INV-CM-${milestone}-${sfx}`, applicationId: application.id, healthId: applicant.canonicalId,
                serviceType: `CERTIFICATION_CHECKOUT_${milestone}`, subtotal: 0, totalAmount: 0, dueDate: new Date(),
                status: 'PAID', paidAt: new Date(), organizationId: org.id, metadata: {},
            },
        });
        await p.checkoutOrder.create({
            data: {
                applicationId: application.id, milestone, platformFeeNet: 0, platformFeeVat: 0, platformFeeGross: 0,
                totalPayableAmount: 0, status: 'SETTLED', settledAt: new Date(), invoiceId: invoice.id, organizationId: org.id,
            },
        });
    }
    const out = { orgId: org.id, entityId: entity.id, applicationId: application.id, applicationNumber: application.applicationNumber, idCard, password };
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2), { mode: 0o600 });
    console.log(`fixture: application ${application.applicationNumber} (${application.id}) entity ${entity.id}`);
    await p.$disconnect();
})().catch((e) => { console.error('fixture failed:', e.message); process.exit(1); });

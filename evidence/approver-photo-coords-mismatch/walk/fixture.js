'use strict';
// One filing at the visit, the way the กทล.๑ wizard leaves it: site under formData.farmData,
// both fees settled, the inspector assigned, evidence row open. cwd must be <tree>/apps/backend
// and DATABASE_URL must point at the scratch Postgres. Writes ids + scratch credentials (0600).
const crypto = require('crypto');
const fs = require('fs');
const fromTree = require('module').createRequire(`${process.cwd()}/`);
const bcrypt = fromTree('bcryptjs');
const { PrismaClient } = fromTree('@prisma/client');
const { identityLookupColumns, AUTH_TYPE_PROVIDER } = fromTree('./services/auth/identity-lookup-columns');

const OUT = process.argv[2];
if (!OUT) { throw new Error('usage: fixture.js <out.json>'); }
const digits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

(async () => {
    const p = new PrismaClient();
    const sfx = crypto.randomBytes(3).toString('hex');
    const password = `Pc!${crypto.randomBytes(9).toString('base64url')}9a`;
    const hash = await bcrypt.hash(password, 10);
    const org = await p.organization.create({ data: { name: `pc-${sfx}`, slug: `pc-${sfx}`, code: `PC_${sfx}`.toUpperCase() } });
    const staff = async (role, lastName, providerId = `7${digits(12)}`) => p.user.create({
        data: {
            ...identityLookupColumns(providerId, AUTH_TYPE_PROVIDER),
            canonicalId: `pc-${role}-${sfx}`, providerId, password: hash, role, authType: 'PROVIDER_ID',
            email: `pc-${role}-${sfx}@example.test`, firstName: 'เจ้าหน้าที่', lastName, organizationId: org.id,
            status: 'ACTIVE', accountType: 'PROVIDER',
        },
    });
    const reviewer = await staff('document_reviewer', 'ผู้ตรวจเอกสาร');
    const inspector = await staff('field_inspector', 'ผู้ตรวจพื้นที่');
    const approver = await staff('certificate_approver', 'ผู้อนุมัติ');
    const applicantKey = `pc-health-${sfx}`;
    const applicant = await p.user.create({
        data: {
            canonicalId: applicantKey, healthId: applicantKey, password: hash, role: 'health', authType: 'EMAIL_LEGACY',
            email: `${applicantKey}@example.test`, firstName: 'สมชาย', lastName: 'ปลูกดี', organizationId: org.id, status: 'ACTIVE',
        },
    });
    const entity = await p.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท สวนสมุนไพร ${sfx} จำกัด`, organizationId: org.id } });
    await p.entityMembership.create({ data: { userId: applicant.id, entityId: entity.id, role: 'OWNER', permissions: [], status: 'ACTIVE', organizationId: org.id } });

    const application = await p.application.create({
        data: {
            applicationNumber: `APP-PC-${sfx}`, healthId: applicantKey, areaType: 'OUTDOOR', organizationId: org.id, entityId: entity.id,
            submitterId: applicant.id, status: 'AUDIT_CONFIRMED', auditorId: inspector.id, reviewerId: reviewer.id,
            certificationPurposes: ['RESEARCH'],
            formData: {
                workflowState: 'AUDIT_CONFIRMED', plantId: 'cannabis', locationType: 'OUTDOOR', cultivationMethods: ['outdoor'],
                farmData: {
                    siteName: 'สวนสมุนไพรบางเขน', siteAddress: '99 หมู่ 2', province: 'กรุงเทพมหานคร', district: 'บางเขน',
                    subDistrict: 'อนุสาวรีย์', postalCode: '10220', areaSqm: '3200', gpsLat: '13.8621', gpsLng: '100.5144',
                    areaTypes: ['OUTDOOR'],
                },
                plots: [{ id: 'p1', name: 'แปลงที่ 1', areaSize: '2', areaUnit: 'Rai', solarSystem: 'OUTDOOR' }],
            },
        },
    });
    for (const milestone of ['M1', 'M2']) {
        const invoice = await p.invoice.create({
            data: {
                invoiceNumber: `INV-PC-${milestone}-${sfx}`, applicationId: application.id, healthId: applicantKey,
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
    const audit = await p.auditChecklist.create({
        data: { applicationId: application.id, templateName: 'GACP_GENERAL', sections: [], auditorId: inspector.id, organizationId: org.id, status: 'IN_PROGRESS' },
    });
    const out = {
        orgId: org.id, applicationId: application.id, applicationNumber: application.applicationNumber, auditId: audit.id,
        inspectorId: inspector.id, inspectorProviderId: inspector.providerId, approverProviderId: approver.providerId, password,
    };
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2), { mode: 0o600 });
    console.log(`fixture: application ${application.applicationNumber} (${application.id}) audit ${audit.id}`);
    await p.$disconnect();
})().catch((e) => { console.error('fixture failed:', e.message); process.exit(1); });

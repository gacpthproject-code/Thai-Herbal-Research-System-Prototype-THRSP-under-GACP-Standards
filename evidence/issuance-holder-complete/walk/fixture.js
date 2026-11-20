'use strict';
const crypto = require('crypto');
const fs = require('fs');
const fromTree = require('module').createRequire(`${process.cwd()}/`);
const bcrypt = fromTree('bcryptjs');
const { PrismaClient } = fromTree('@prisma/client');
const { identityLookupColumns, AUTH_TYPE_PROVIDER } = fromTree('./services/auth/identity-lookup-columns');
const { PLANT_SLUG_TO_CODE } = fromTree('./config/plant-species-slugs');
const auditOnsite = fromTree('./services/audit-onsite-service');

const OUT = process.argv[2];
if (!OUT) { throw new Error('usage: fixture.js <out.json>'); }
const digits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

(async () => {
    const p = new PrismaClient();
    const sfx = crypto.randomBytes(3).toString('hex');
    const password = `Ih!${crypto.randomBytes(9).toString('base64url')}9a`;
    const hash = await bcrypt.hash(password, 10);
    const org = await p.organization.create({ data: { name: `ih-${sfx}`, slug: `ih-${sfx}`, code: `IH_${sfx}`.toUpperCase() } });
    const staff = async (role, lastName) => {
        const providerId = `7${digits(12)}`;
        const user = await p.user.create({
            data: {
                ...identityLookupColumns(providerId, AUTH_TYPE_PROVIDER),
                canonicalId: `ih-${role}-${sfx}`, providerId, password: hash, role, authType: AUTH_TYPE_PROVIDER,
                email: `ih-${role}-${sfx}@example.test`, firstName: 'เจ้าหน้าที่', lastName, organizationId: org.id,
                status: 'ACTIVE', accountType: 'PROVIDER',
            },
        });
        return { ...user, providerId };
    };
    const reviewer = await staff('document_reviewer', 'ผู้ตรวจเอกสาร');
    const inspector = await staff('field_inspector', 'ผู้ตรวจพื้นที่');
    const approver = await staff('certificate_approver', 'ผู้อนุมัติ');
    const applicant = await p.user.create({
        data: {
            canonicalId: `ih-app-${sfx}`, healthId: `ih-app-${sfx}`, password: hash, role: 'health', authType: 'EMAIL_LEGACY',
            email: `ih-app-${sfx}@example.test`, firstName: 'สมชาย', lastName: 'ปลูกดี', organizationId: org.id,
        },
    });
    const entity = await p.entity.create({ data: { type: 'JURISTIC', displayName: `บริษัท สวนสมุนไพร ${sfx} จำกัด`, organizationId: org.id } });
    const plantCode = PLANT_SLUG_TO_CODE.cannabis;
    if (!(await p.plantSpecies.findUnique({ where: { code: plantCode } }))) {
        await p.plantSpecies.create({ data: { code: plantCode, nameTH: 'กัญชา', nameEN: 'Cannabis' } });
    }

    const application = await p.application.create({
        data: {
            applicationNumber: `APP-IH-${sfx}`, healthId: applicant.canonicalId, areaType: 'OUTDOOR', organizationId: org.id,
            entityId: entity.id, submitterId: applicant.id, status: 'AUDIT_CONFIRMED', auditorId: inspector.id, reviewerId: reviewer.id,
            formData: {
                workflowState: 'AUDIT_CONFIRMED', plantId: 'cannabis', locationType: 'OUTDOOR', cultivationMethods: ['outdoor'],
                farmData: {
                    farmName: `ไร่สวนสมุนไพร ${sfx}`, address: '123 หมู่ 4', province: 'สมุทรปราการ', district: 'บางพลี',
                    subdistrict: 'บางพลีใหญ่', postalCode: '10540', totalAreaSize: '5', totalAreaUnit: 'Rai', gpsLat: '13.12', gpsLng: '100.65',
                },
                plots: [{ id: 'p1', name: 'แปลงที่ 1', areaSize: '2', areaUnit: 'Rai', solarSystem: 'OUTDOOR' }],
            },
        },
    });
    for (const milestone of ['M1', 'M2']) {
        const invoice = await p.invoice.create({
            data: {
                invoiceNumber: `INV-IH-${milestone}-${sfx}`, applicationId: application.id, healthId: applicant.canonicalId,
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
    for (const item of auditOnsite.CHECKLIST_TEMPLATE_2026) {
        await auditOnsite.submitChecklistItem({ auditId: audit.id, itemCode: item.itemCode, response: 'PASS', actorId: inspector.id, prisma: p });
    }
    for (let i = 0; i < auditOnsite.DEFAULT_MIN_PHOTOS; i += 1) {
        await auditOnsite.uploadPhoto({
            auditId: audit.id, fileBuffer: Buffer.from(`ih-${audit.id}-${i}`), fileName: `e-${i}.jpg`,
            gpsLat: 13.12 + i * 1e-4, gpsLng: 100.65 + i * 1e-4, capturedAt: new Date(),
            uploadedBy: inspector.id, organizationId: org.id, prisma: p,
        });
    }
    await auditOnsite.submitDecision({ auditId: audit.id, decision: 'PASS', summary: 'ผ่านการตรวจ', actorId: inspector.id, actorRole: 'field_inspector', prisma: p });
    const status = (await p.application.findUnique({ where: { id: application.id }, select: { status: true } })).status;
    if (status !== 'AUDIT_PASSED') { throw new Error(`fixture stopped at ${status}, not AUDIT_PASSED`); }

    const out = { orgId: org.id, entityId: entity.id, applicationId: application.id, applicationNumber: application.applicationNumber, providerId: approver.providerId, password };
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2), { mode: 0o600 });
    console.log(`fixture: application ${application.applicationNumber} (${application.id}) AUDIT_PASSED, holder entity ${entity.id} (JURISTIC, payload.holder empty)`);
    await p.$disconnect();
    process.exit(0);
})().catch((e) => { console.error('fixture failed:', e.message); process.exit(1); });

'use strict';
// Seeds the browser walk on the scratch database: the holder-scope fixture, its user A given a
// 13-digit sign-in number (random, checksum-valid, never printed) and a random password, and one
// application waiting in CAR_PENDING after an earlier document round. Secrets go to a 0600 file.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const WT = '/home/ubuntu/work/wt-filing-legs/apps/backend';
const bcrypt = require(path.join(WT, 'node_modules/bcryptjs'));
const { PrismaClient } = require(path.join(WT, 'node_modules/@prisma/client'));
const { seedHolderScopeFixture } = require(path.join(WT, '__tests__/integration/fixtures/holder-scope-fixture'));
const { ConsentVersions } = require(path.join(WT, 'middleware/consent-manager'));

const DAY = 86400000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const ahead = (ms) => new Date(Date.now() + ms);
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
function thaiId() {
    const digits = [1 + crypto.randomInt(9), ...Array.from({ length: 11 }, () => crypto.randomInt(10))];
    const sum = digits.reduce((acc, d, i) => acc + d * (13 - i), 0);
    return digits.join('') + String((11 - (sum % 11)) % 10);
}
// The company number printed on the evidence screens is a stand-in: its last digit is chosen to FAIL
// the Mod-11 check, so no image in the pack shows a number that could belong to a real company.
function taxId() {
    const digits = [0, 1 + crypto.randomInt(9), ...Array.from({ length: 10 }, () => crypto.randomInt(10))];
    const sum = digits.reduce((acc, d, i) => acc + d * (13 - i), 0);
    const valid = (11 - (sum % 11)) % 10;
    return digits.join('') + String((valid + 1 + crypto.randomInt(9)) % 10);
}

(async () => {
    const raw = new PrismaClient();
    await raw.$connect();
    const fx = await seedHolderScopeFixture(raw);
    const id = thaiId();
    const password = crypto.randomBytes(12).toString('base64url');
    await raw.user.update({
        where: { id: fx.users.A.id },
        data: { healthId: id, healthIdHash: sha256(id), idCard: id, idCardHash: sha256(id), authType: 'HEALTH_ID', password: await bcrypt.hash(password, 10) },
    });
    for (const category of ['TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'PAYMENT_TERMS']) {
        await raw.userConsent.create({ data: { userId: fx.users.A.id, organizationId: fx.orgId, category, version: ConsentVersions[category], granted: true, grantedAt: new Date() } });
    }
    const app = await raw.application.create({
        data: {
            applicationNumber: `APP-WALK-${fx.sfx}`.toUpperCase(), healthId: fx.users.A.canonicalId, areaType: 'OUTDOOR',
            organizationId: fx.orgId, entityId: fx.entities.C, submitterId: fx.users.A.id, status: 'CAR_PENDING',
            formData: {
                plantId: 'cannabis', certificationPurposes: ['EXPORT'], applicantType: 'JURISTIC', requestType: 'NEW', certScope: 'PLANTING',
                applicantData: { companyName: 'บริษัท เดินจริง จำกัด', taxId: taxId(), directorName: 'สมชาย ใจดี', phone: '0812345678', address: '99 หมู่ 1 บางพลี สมุทรปราการ 10540' },
                farmData: {
                    siteName: 'แปลงบางพลี', siteAddress: '99 หมู่ 1', areaSqm: '1600', province: 'สมุทรปราการ', district: 'บางพลี', subDistrict: 'บางพลีใหญ่', postalCode: '10540',
                    landOwnership: 'OWN', areaTypes: ['OUTDOOR'], siteContactName: 'สมชาย ใจดี', sitePhone: '0812345678', siteContactIsApplicant: true,
                },
                consentedPDPA: true, acknowledgedStandards: true,
                workflowState: 'CAR_PENDING',
                serverRequirementSnapshot: { stampedAt: ago(30 * DAY), ruleIds: [], slotIds: [] },
                declarationsAcceptedAt: ago(30 * DAY),
                revisionRequestedAt: ago(20 * DAY), revisionDueAt: ago(10 * DAY), revision_requested_at: ago(20 * DAY), revision_due_at: ago(10 * DAY),
                carRequestedAt: ago(2 * DAY), carDueAt: ahead(28 * DAY).toISOString(), car_due_at: ahead(28 * DAY).toISOString(),
                _lastReviewComment: 'ป้ายชื่อแปลงและรั้วกั้นสัตว์ยังไม่ครบ ส่งหลักฐานการแก้ไขภายใน 30 วัน',
            },
        },
    });
    let seq = 0;
    for (const milestone of ['M1', 'M2']) {
        seq += 1;
        const invoice = await raw.invoice.create({ data: { invoiceNumber: `INV-WALK-${seq}-${fx.sfx}`.toUpperCase(), applicationId: app.id, healthId: fx.users.A.canonicalId, serviceType: `CERTIFICATION_CHECKOUT_${milestone}`, subtotal: 0, totalAmount: 0, dueDate: new Date(), status: 'PAID', paidAt: new Date(), organizationId: fx.orgId, metadata: {} } });
        await raw.checkoutOrder.create({ data: { applicationId: app.id, milestone, platformFeeNet: 0, platformFeeVat: 0, platformFeeGross: 0, totalPayableAmount: 0, status: 'SETTLED', settledAt: new Date(), invoiceId: invoice.id, organizationId: fx.orgId } });
    }
    // A CAR round follows a passed document round: every paper the register requires is already on file,
    // so the wizard's own "missing papers" gate does not stand between the applicant and the hand-off.
    const { syncApplicationDocument } = require(path.join(WT, 'services/application-document-sync'));
    const { purposeLicenceSlotId } = require(path.join(WT, 'shared/certification-purposes'));
    for (const slotId of ['juristic_reg_6m', purposeLicenceSlotId('cannabis', 'EXPORT')]) {
        await syncApplicationDocument(raw, {
            applicationId: app.id, documentId: crypto.randomUUID(), slotId,
            fileName: `${slotId}.pdf`, fileUrl: `/uploads/walk/${app.id.slice(0, 8)}/${slotId}.pdf`,
            mimeType: 'application/pdf', uploadedBy: fx.users.A.id,
        });
    }
    await raw.revisionDeadline.create({ data: { applicationId: app.id, organizationId: fx.orgId, revisionDue: ahead(28 * DAY), status: 'PENDING', revisionCount: 2, createdBy: fx.users.F.id } });
    fs.writeFileSync('/tmp/flt/env/walk.env', `WALK_ID=${id}\nWALK_PASSWORD=${password}\nWALK_APP=${app.id}\nWALK_ORG=${fx.orgId}\nWALK_USER=${fx.users.A.id}\n`, { mode: 0o600 });
    console.log(JSON.stringify({ seeded: true, applicationNumber: app.applicationNumber, status: app.status }));
    await raw.$disconnect();
})().catch((e) => { console.error('seed failed:', e.message); process.exit(1); });

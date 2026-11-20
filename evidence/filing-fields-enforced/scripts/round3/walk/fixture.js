'use strict';
// Round-3 walk fixture on the scratch database: a fresh holder-scope fixture (user A, complete
// juristic holder C), a live certificate of C, and draft D as a RENEWAL of it with step 3 complete,
// a purpose chosen and no variety. shots.js flips D to a REPLACEMENT between scenes.
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('/home/ubuntu/work/wt-filingfields/apps/backend/node_modules/@prisma/client');
const { seedHolderScopeFixture } = require('/home/ubuntu/work/wt-filingfields/apps/backend/__tests__/integration/fixtures/holder-scope-fixture');
const { ConsentVersions } = require('/home/ubuntu/work/wt-filingfields/apps/backend/middleware/consent-manager');

const site = {
    siteName: 'แปลงสมุนไพรบ้านทดสอบ', siteAddress: '99/9 หมู่ 3', areaSqm: '1600', province: 'เชียงใหม่',
    district: 'สันทราย', subDistrict: 'หนองหาร', postalCode: '50290', areaTypes: ['OUTDOOR'],
    siteContactName: 'สมชาย ใจดี', sitePhone: '0812345678', siteContactIsApplicant: true,
};
const sectionTwo = { landOwnership: 'OWNED', landDocumentDetail: { type: 'โฉนด', number: '12345' }, coordinates: '18.7883, 98.9853', plantsPerCycle: '500', cyclesPerYear: '2' };

(async () => {
    const raw = new PrismaClient();
    const fx = await seedHolderScopeFixture(raw);
    for (const category of ['TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'PAYMENT_TERMS']) {
        await raw.userConsent.create({
            data: { userId: fx.users.A.id, organizationId: fx.orgId, category, version: ConsentVersions[category], granted: true, grantedAt: new Date() },
        });
    }
    const dayAgo = new Date(Date.now() - 86400000);
    const certified = await raw.application.create({
        data: {
            applicationNumber: `APP-R3-WALK-C-${fx.sfx}`.toUpperCase(), healthId: fx.users.A.canonicalId, areaType: 'OUTDOOR',
            organizationId: fx.orgId, entityId: fx.entities.C, submitterId: fx.users.A.id, status: 'CERTIFIED',
            formData: { plantId: 'cannabis', workflowState: 'CERTIFIED' },
        },
    });
    const cert = await raw.certificate.create({
        data: {
            certificateNumber: `GACP-R3-${fx.sfx}`.toUpperCase(), verificationCode: `V-R3-WALK-${fx.sfx}`, qrData: 'qr',
            applicationId: certified.id, userId: fx.users.A.id, farmId: fx.more.farm, farmName: 'ฟาร์มโฮลเดอร์',
            applicantName: 'ทดสอบ', cropType: 'cannabis', farmSize: 1, province: 'เชียงใหม่', district: 'สันทราย',
            subDistrict: 'หนองหาร', standardId: 'std', standardName: 'GACP', validityMonths: 12,
            expiryDate: new Date(Date.now() + 365 * 86400e3), issuedBy: fx.users.F.id, status: 'active',
            organizationId: fx.orgId, holderType: 'JURISTIC', holderDisplayName: 'บริษัท โฮลเดอร์ จำกัด', submittedByUserId: fx.users.A.id,
        },
    });
    const common = {
        plantId: 'cannabis', applicantType: 'JURISTIC', certificationPurposes: ['EXPORT'], varieties: [], workflowState: 'DRAFT',
        previousCertificateNumber: cert.certificateNumber, renewalOfCertificateNumber: cert.certificateNumber,
    };
    const renewal = { ...common, requestType: 'RENEWAL', renewalOf: cert.id, replacementOf: null, farmData: { ...site, ...sectionTwo } };
    const replacement = { ...common, requestType: 'REPLACEMENT', replacementOf: cert.id, renewalOf: null, farmData: site };
    await raw.application.update({ where: { id: fx.apps.D2 }, data: { formData: { plantId: 'cannabis', requestType: 'NEW', certScope: 'PLANTING', workflowState: 'DRAFT' }, updatedAt: dayAgo } });
    await raw.application.update({ where: { id: fx.apps.D }, data: { formData: renewal, updatedAt: new Date() } });
    const user = await raw.user.findUnique({ where: { id: fx.users.A.id }, select: { id: true, canonicalId: true, firstName: true, lastName: true, email: true, role: true, organizationId: true } });
    const out = { orgId: fx.orgId, userA: user, entityC: fx.entities.C, draftD: fx.apps.D, certificate: cert.id, token: fx.tokens.A, replacement };
    fs.writeFileSync(path.join(__dirname, 'fixture.json'), JSON.stringify(out, null, 1), { mode: 0o600 });
    console.log(JSON.stringify({ orgId: out.orgId, userA: user.id, draftD: out.draftD, certificate: cert.id }));
    await raw.$disconnect();
})().catch((error) => { console.error(error.message); process.exit(1); });

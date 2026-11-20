'use strict';
// Round-2 walk fixture on the scratch database: a fresh holder-scope fixture (user A, complete
// juristic holder C) with draft D started at step 3 and missing its กทล.1 fields (M4), and an
// application R in REVISION_REQUESTED whose requested paper is replaced but whose site has no
// coordinates (I2 at the revision door). Writes ids and A's token to fixture.json (0600).
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

(async () => {
    const raw = new PrismaClient();
    const fx = await seedHolderScopeFixture(raw);
    for (const category of ['TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'PAYMENT_TERMS']) {
        await raw.userConsent.create({
            data: { userId: fx.users.A.id, organizationId: fx.orgId, category, version: ConsentVersions[category], granted: true, grantedAt: new Date() },
        });
    }
    const hourAgo = new Date(Date.now() - 3600000);
    const dayAgo = new Date(Date.now() - 86400000);
    await raw.application.update({
        where: { id: fx.apps.D2 },
        data: { formData: { plantId: 'cannabis', requestType: 'NEW', certScope: 'PLANTING', workflowState: 'DRAFT' }, updatedAt: dayAgo },
    });
    await raw.application.update({
        where: { id: fx.apps.D },
        data: {
            formData: {
                plantId: 'cannabis', requestType: 'NEW', certScope: 'PLANTING', applicantType: 'JURISTIC',
                certificationPurposes: [], farmData: site, varieties: [], workflowState: 'DRAFT',
            },
            updatedAt: new Date(),
        },
    });
    const r = await raw.application.create({
        data: {
            applicationNumber: `APP-R2-WALK-${fx.sfx}`.toUpperCase(), healthId: fx.users.A.canonicalId, areaType: 'OUTDOOR',
            organizationId: fx.orgId, entityId: fx.entities.C, submitterId: fx.users.A.id, status: 'REVISION_REQUESTED',
            formData: {
                plantId: 'cannabis', requestType: 'NEW', certScope: 'PLANTING', applicantType: 'JURISTIC',
                certificationPurposes: ['EXPORT'],
                farmData: { ...site, landOwnership: 'OWNED', landDocumentDetail: { type: 'โฉนด', number: '12345' }, plantsPerCycle: '500', cyclesPerYear: '2' },
                varieties: [{ kind: 'SEED', name: 'หางกระรอกภูพาน', origin: 'DOMESTIC', source: 'ศูนย์พันธุ์พืช', quantity: '500', unit: 'ต้น' }],
                workflowState: 'REVISION_REQUESTED',
                serverRequirementSnapshot: { stampedAt: dayAgo.toISOString(), ruleIds: [], slotIds: [] },
                declarationsAcceptedAt: dayAgo.toISOString(),
            },
        },
    });
    const invoice = await raw.invoice.create({
        data: {
            invoiceNumber: `INV-R2-WALK-${fx.sfx}`.toUpperCase(), applicationId: r.id, healthId: fx.users.A.canonicalId,
            serviceType: 'CERTIFICATION_CHECKOUT_M1', subtotal: 0, totalAmount: 0, dueDate: new Date(), status: 'PAID', paidAt: new Date(),
            organizationId: fx.orgId, metadata: {},
        },
    });
    await raw.checkoutOrder.create({
        data: {
            applicationId: r.id, milestone: 'M1', platformFeeNet: 0, platformFeeVat: 0, platformFeeGross: 0, totalPayableAmount: 0,
            status: 'SETTLED', settledAt: new Date(), invoiceId: invoice.id, organizationId: fx.orgId,
        },
    });
    await raw.applicationDocumentReview.create({
        data: {
            applicationId: r.id, slotId: 'juristic_reg_6m', verdict: 'MORE_REQUESTED', reason: 'หนังสือรับรองบริษัทอ่านไม่ออก',
            dueDate: new Date(Date.now() + 5 * 86400000), reviewerId: fx.users.F.id, round: 1, createdAt: hourAgo, organizationId: fx.orgId,
        },
    });
    await raw.applicationDocument.create({
        data: { applicationId: r.id, slotId: 'juristic_reg_6m', documentType: 'COMPANY_REG', fileUrl: `/uploads/test/r2-walk-company-${fx.sfx}.pdf` },
    });
    const user = await raw.user.findUnique({ where: { id: fx.users.A.id }, select: { id: true, canonicalId: true, firstName: true, lastName: true, email: true, role: true, organizationId: true } });
    const out = { orgId: fx.orgId, userA: user, entityC: fx.entities.C, draftD: fx.apps.D, revision: r.id, token: fx.tokens.A };
    fs.writeFileSync(path.join(__dirname, 'fixture.json'), JSON.stringify(out, null, 1), { mode: 0o600 });
    console.log(JSON.stringify({ orgId: out.orgId, userA: user.id, draftD: out.draftD, revision: out.revision }));
    await raw.$disconnect();
})().catch((error) => { console.error(error.message); process.exit(1); });

'use strict';
// F-A8c-08 walk on a scratch Postgres: certify, open a cycle, renew, issue the renewal, then
// photograph the farmer's cycle page. The applicant's draft and submit go through the running
// backend's real HTTP doors; the staff steps between submit and issuance are recorded in-process
// with the same tree's services, as the integration suite records them.
//   DATABASE_URL=... SIGNING_KEY_DIR=... node walk.js <backend-dir> <api-base> <web-base> <label> <out-dir>
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const [TREE, API, WEB, LABEL, OUT] = process.argv.slice(2);
const req = (rel) => require(path.join(TREE, rel));
const { PrismaClient } = req('node_modules/@prisma/client');
const bcrypt = req('node_modules/bcryptjs');
const { filedFormData, filedHolderData } = req('test-support/filed-application');
const { chromium } = require('/home/ubuntu/work/GACP-Certification-Application/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');

const raw = new PrismaClient();
const sfx = crypto.randomUUID().slice(0, 6);
const PASSWORD = `Walk-${crypto.randomUUID()}`;
const NID = (() => {
    const body = `11017${String(crypto.randomInt(1e7)).padStart(7, '0')}`;
    const sum = [...body].reduce((acc, d, i) => acc + Number(d) * (13 - i), 0);
    return `${body}${(11 - (sum % 11)) % 10}`;
})();
const PAPERS = [['JURISTIC_REG_6M', 'juristic_reg_6m'], ['LICENCE_PT10', 'licence_pt10'], ['LAND_RIGHTS', 'land_rights']];
const record = {};

async function http(method, url, token, body) {
    const res = await fetch(`${API}${url}`, {
        method,
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) { json = { text: text.slice(0, 300) }; }
    return { status: res.status, body: json };
}

async function attachPapers(applicationId) {
    for (const [documentType, slotId] of PAPERS) {
        await raw.applicationDocument.create({
            data: { applicationId, documentType, slotId, fileName: `${slotId}.pdf`, fileUrl: `/uploads/${slotId}.pdf`, currentForSlot: slotId },
        });
    }
}

async function auditPassedAndIssue(applicationId, fx) {
    const auditOnsiteService = req('services/audit-onsite-service');
    const certificateService = req('services/certificate-service');
    await raw.application.update({ where: { id: applicationId }, data: { status: 'AUDIT_PASSED', auditResult: 'PASS' } });
    const audit = await raw.auditChecklist.create({
        data: { applicationId, templateName: 'GACP_GENERAL', sections: [], auditorId: fx.auditorId, organizationId: fx.org, status: 'IN_PROGRESS' },
    });
    for (const item of auditOnsiteService.CHECKLIST_TEMPLATE_2026) {
        await auditOnsiteService.submitChecklistItem({
            onlyDuringVisit: false, auditId: audit.id, itemCode: item.itemCode, response: 'PASS', actorId: fx.auditorId, prisma: raw,
        });
    }
    for (let i = 0; i < auditOnsiteService.DEFAULT_MIN_PHOTOS; i += 1) {
        await auditOnsiteService.uploadPhoto({
            onlyDuringVisit: false, auditId: audit.id, fileBuffer: Buffer.from(`walk-${audit.id}-${i}`, 'utf8'),
            fileName: `walk-${i}.jpg`, gpsLat: 13.6069 + i * 0.0001, gpsLng: 100.7061 + i * 0.0001,
            capturedAt: new Date(), uploadedBy: fx.auditorId, organizationId: fx.org, prisma: raw,
        });
    }
    return certificateService.generateCertificate(applicationId, fx.auditorId, { prisma: raw });
}

async function main() {
    await req('services/prisma-database').connect();
    const fx = {};
    fx.org = (await raw.organization.create({ data: { name: `walk-${sfx}`, slug: `walk-${sfx}`, code: `WALK_${sfx}`.toUpperCase() } })).id;
    const user = await raw.user.create({
        data: {
            canonicalId: `walk-${sfx}`, healthId: `walk-${sfx}`, healthIdHash: crypto.createHash('sha256').update(NID).digest('hex'),
            password: await bcrypt.hash(PASSWORD, 10), role: 'health', authType: 'HEALTH_ID', status: 'ACTIVE',
            email: `walk-${sfx}@example.test`, firstName: 'สมชาย', lastName: 'ต่ออายุ', organizationId: fx.org,
        },
    });
    fx.auditorId = (await raw.user.create({
        data: { canonicalId: `walk-auditor-${sfx}`, password: 'x', organizationId: fx.org, authType: 'EMAIL_LEGACY', role: 'auditor', firstName: 'ผู้ตรวจ', lastName: 'ทดสอบ' },
    })).id;
    const { ConsentCategory, ConsentVersions } = req('middleware/consent-manager');
    for (const category of [ConsentCategory.TERMS_OF_SERVICE, ConsentCategory.PRIVACY_POLICY, ConsentCategory.PAYMENT_TERMS]) {
        await raw.userConsent.create({ data: { userId: user.id, organizationId: fx.org, category, version: ConsentVersions[category] || '1.0', granted: true, grantedAt: new Date() } });
    }
    const entity = await raw.entity.create({
        data: { type: 'JURISTIC', displayName: 'บริษัท สวนบางพลี จำกัด', organizationId: fx.org, createdBy: user.id, ...filedHolderData('JURISTIC') },
    });
    await raw.entityMembership.create({ data: { userId: user.id, entityId: entity.id, role: 'OWNER', status: 'ACTIVE', organizationId: fx.org } });

    const login = await http('POST', '/api/auth/health/login', null, { identifier: NID, password: PASSWORD });
    const token = login.body?.data?.tokens?.accessToken;
    record.login = login.status;
    if (!token) { throw new Error(`login ${login.status} ${login.body?.code || ''}`); }

    const original = await raw.application.create({
        data: {
            applicationNumber: `APP-WALK-${sfx}`, healthId: user.canonicalId, areaType: 'OUTDOOR', organizationId: fx.org,
            entityId: entity.id, submitterId: user.id, status: 'DRAFT',
            formData: filedFormData({
                requestType: 'NEW', certScope: 'PLANTING', workflowState: 'DRAFT',
                farmData: { ...filedFormData().farmData, landOwnership: 'OWNED' },
                declarationsAcceptedAt: undefined, serverRequirementSnapshot: undefined,
            }),
        },
    });
    await attachPapers(original.id);
    const sub1 = await http('POST', '/api/applications/submit', token, { applicationId: original.id, declarationsAccepted: true });
    record.originalSubmit = sub1.status;
    if (sub1.status !== 200) { throw new Error(`original submit ${sub1.status} ${JSON.stringify(sub1.body).slice(0, 400)}`); }
    const oldCert = await auditPassedAndIssue(original.id, fx);

    const species = await raw.plantSpecies.findFirst({ where: { code: 'CAN' } });
    const plot = await raw.plot.create({ data: { farmId: oldCert.farmId, organizationId: fx.org, name: 'แปลงที่ปลูกอยู่', area: 100, areaSqm: 100, solarSystem: 'OUTDOOR' } });
    const cycle = await raw.plantingCycle.create({
        data: {
            farmId: oldCert.farmId, plantSpeciesId: species.id, organizationId: fx.org, cycleName: 'รอบฝนปี 2569',
            startDate: new Date(Date.now() - 60 * 86400e3), status: 'GROWING', cultivationType: 'OUTDOOR', certificateId: oldCert.id, plotId: plot.id,
        },
    });
    await raw.plantingCyclePlot.create({ data: { cycleId: cycle.id, plotId: plot.id, allocatedAreaSqm: 100, plannedPlantCount: 0, organizationId: fx.org } });

    const draft = await http('POST', '/api/applications/draft', token, {
        entityId: entity.id, step: 2, saveSession: `walk-${sfx}`, saveSeq: 1,
        formData: { requestType: 'RENEWAL', previousCertificateNumber: oldCert.certificateNumber, certScope: null, plantId: null, farmData: null },
    });
    const renewalId = draft.body?.data?.draftId;
    if (draft.status !== 200 || !renewalId) { throw new Error(`renewal draft ${draft.status} ${JSON.stringify(draft.body).slice(0, 300)}`); }
    const filled = (await raw.application.findUnique({ where: { id: renewalId } })).formData;
    await http('POST', '/api/applications/draft', token, {
        applicationId: renewalId, step: 4, saveSession: `walk-${sfx}`, saveSeq: 2, renewalPrefillLoaded: true,
        formData: { farmData: { ...filled.farmData, siteContactInformed: true } },
    });
    await attachPapers(renewalId);
    const sub2 = await http('POST', '/api/applications/submit', token, { applicationId: renewalId, declarationsAccepted: true, renewalChangeDeclaration: { changed: false } });
    record.renewalSubmit = sub2.status;
    if (sub2.status !== 200) { throw new Error(`renewal submit ${sub2.status} ${JSON.stringify(sub2.body).slice(0, 400)}`); }
    const renewalFiled = (await raw.application.findUnique({ where: { id: renewalId } })).formData;
    const newCert = await auditPassedAndIssue(renewalId, fx);
    const after = await raw.plantingCycle.findUnique({ where: { id: cycle.id }, select: { certificateId: true } });

    Object.assign(record, {
        label: LABEL,
        oldCertificate: { number: oldCert.certificateNumber, farmId: oldCert.farmId },
        renewalFilingFarmId: renewalFiled.farmId,
        newCertificate: { number: newCert.certificateNumber, farmId: newCert.farmId },
        farmsOfHolder: await raw.farm.count({ where: { entityId: entity.id, isDeleted: false } }),
        cycleId: cycle.id,
        cycleCertificate: after.certificateId === newCert.id ? 'new' : (after.certificateId === oldCert.id ? 'old' : after.certificateId),
    });

    const browser = await chromium.launch({ executablePath: undefined });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'th-TH' });
    const page = await context.newPage();
    await page.goto(`${WEB}/auth`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const webLogin = await page.request.post(`${WEB}/api/auth/health/login`, { data: { identifier: NID, password: PASSWORD } });
    record.webLogin = webLogin.status();
    await page.goto(`${WEB}/health/planting/${cycle.id}`, { waitUntil: 'networkidle', timeout: 180000 });
    await page.waitForTimeout(3000);
    fs.mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: path.join(OUT, `${LABEL}-cycle-page.png`), fullPage: false });
    await page.screenshot({ path: path.join(OUT, `${LABEL}-cycle-page-full.png`), fullPage: true });
    record.warningBadgeShown = await page.getByText('ยังไม่ผูกใบรับรองที่ใช้งานได้').count();
    await browser.close();
    fs.writeFileSync(path.join(OUT, `${LABEL}-record.json`), `${JSON.stringify(record, null, 2)}\n`);
    console.log(JSON.stringify(record, null, 2));
}

main().then(() => raw.$disconnect()).then(() => process.exit(0), async (error) => {
    console.error(error && error.stack ? error.stack : error);
    console.log(JSON.stringify(record, null, 2));
    await raw.$disconnect();
    process.exit(1);
});

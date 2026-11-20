'use strict';
const path = require('path');
const fs = require('fs');
const BACKEND = '/home/ubuntu/work/wt-supersede/apps/backend';
process.env.NODE_ENV = 'test';
process.env.STORAGE_TYPE = 'local';
process.env.STORAGE_LOCAL_PATH = '/tmp/gacp-supersede-fix5-uploads';
process.env.ENABLE_QUEUE = 'false';
process.env.ENABLE_CACHE = 'false';
process.env.ENCRYPTION_KEY = 'visual-only-encryption-key-32-chars';
process.env.SIGNING_KEY_DIR = '/tmp/gacp-supersede-fix5-signing-key';
process.env.RATE_LIMIT_MAX = '1000000';
process.env.PAYMENT_ADAPTER = 'mock';
const r = (m) => require(path.join(BACKEND, m));
const { PrismaClient } = r('node_modules/@prisma/client');
const request = r('node_modules/supertest');
const DAY_MS = 24 * 3600e3;
const daysFromNow = (d) => new Date(Date.now() + d * DAY_MS);

(async () => {
    const app = r('server');
    await r('services/prisma-database').connect();
    const prisma = new PrismaClient();
    const certificateService = r('services/certificate-service');
    const audit = r('services/audit-onsite-service');
    const jwt = r('config/jwt-security');
    const { phaseBApplicationData, phaseBWizardAnswers } = r('test-support/phase-b-application-seed');
    if (!(await prisma.plantSpecies.findFirst({ where: { code: 'CAN' } }))) {
        await prisma.plantSpecies.create({ data: { code: 'CAN', nameTH: 'กัญชา', nameEN: 'Cannabis' } });
    }
    const org = await prisma.organization.create({ data: { name: 'visual org', slug: 'visual-f5', code: 'VISUAL_F5' } });
    const user = (canonicalId, role, firstName) => prisma.user.create({ data: { canonicalId, password: 'x', organizationId: org.id, authType: 'EMAIL_LEGACY', role, firstName, lastName: 'ทดสอบ', status: 'ACTIVE' } });
    const auditorId = (await user('v-aud', 'auditor', 'ผู้ตรวจ')).id;
    const applicant = await user('v-app', 'health', 'สมชาย');
    const reviewer = await user('v-rev', 'document_reviewer', 'ผู้ตรวจเอกสาร');
    const admin = await user('v-adm', 'system_admin_dtam', 'ผู้ดูแลระบบ');
    const entityId = (await prisma.entity.create({ data: { type: 'JURISTIC', displayName: 'บริษัท ไร่ต่ออายุ จำกัด', organizationId: org.id, createdBy: applicant.id } })).id;
    await prisma.entityMembership.create({ data: { userId: applicant.id, entityId, role: 'OWNER', permissions: [], status: 'ACTIVE', organizationId: org.id } });
    let n = 0;
    async function passed(renewalOf) {
        n += 1;
        const formData = phaseBWizardAnswers({
            farmData: { ...phaseBWizardAnswers().farmData, farmName: 'ไร่ต่ออายุ', areaTypes: ['OUTDOOR'] },
            purposes: ['RESEARCH'], applicantType: 'JURISTIC',
            ...(renewalOf ? { requestType: 'RENEWAL', renewalOf } : {}),
        });
        const a = await prisma.application.create({ data: phaseBApplicationData({ applicationNumber: `VIS5-${n}`, healthId: applicant.canonicalId, organizationId: org.id }, { status: 'AUDIT_PASSED', auditResult: 'PASS', areaType: 'OUTDOOR', formData, entityId }) });
        const c = await prisma.auditChecklist.create({ data: { applicationId: a.id, templateName: 'GACP_GENERAL', sections: [], auditorId, organizationId: org.id, status: 'IN_PROGRESS' } });
        for (const item of audit.CHECKLIST_TEMPLATE_2026) {
            await audit.submitChecklistItem({ onlyDuringVisit: false, auditId: c.id, itemCode: item.itemCode, response: 'PASS', actorId: auditorId, prisma });
        }
        for (let i = 0; i < audit.DEFAULT_MIN_PHOTOS; i += 1) {
            await audit.uploadPhoto({ onlyDuringVisit: false, auditId: c.id, fileBuffer: Buffer.from(`v5-${c.id}-${i}`), fileName: `v-${i}.jpg`, gpsLat: 13.75 + i * 1e-4, gpsLng: 100.5 + i * 1e-4, capturedAt: new Date(), uploadedBy: auditorId, organizationId: org.id, prisma });
        }
        return a.id;
    }
    const issue = (id) => prisma.$transaction((tx) => certificateService.generateCertificate(id, auditorId, { prisma: tx }), { timeout: 60000 });
    const old = await prisma.certificate.update({ where: { id: (await issue(await passed(null))).id }, data: { issuedDate: daysFromNow(-400), expiryDate: daysFromNow(300) } });
    const species = await prisma.plantSpecies.findFirst({ where: { code: 'CAN' } });
    const plot = await prisma.plot.create({ data: { farmId: old.farmId, organizationId: org.id, name: 'แปลงกลางแจ้ง 1', area: 100, solarSystem: 'OUTDOOR' } });
    const cycle = await prisma.plantingCycle.create({ data: { farmId: old.farmId, plantSpeciesId: species.id, organizationId: org.id, cycleName: 'รอบปลูกที่ 1/2569', startDate: daysFromNow(-200), status: 'GROWING', cultivationType: 'OUTDOOR', certificateId: old.id, plotId: plot.id } });
    await prisma.plantingCyclePlot.create({ data: { cycleId: cycle.id, plotId: plot.id, allocatedAreaSqm: 100, plannedPlantCount: 0, organizationId: org.id } });
    const farmer = jwt.generateToken({ id: applicant.id, userId: applicant.id, role: 'health', canonicalRole: 'health' }, 'public');
    const harvest = (days) => request(app).post('/api/harvest-batches').set('Authorization', `Bearer ${farmer}`)
        .send({ farmId: cycle.farmId, cycleId: cycle.id, harvestDate: daysFromNow(days).toISOString(), freshWeight: 5, plantCode: 'CAN' });
    const before = await harvest(-25);
    const renewal = await issue(await passed(old.id));
    const backdated = await harvest(-10);
    const current = await harvest(0);
    const statuses = [before.status, backdated.status, current.status];
    const staff = (u) => jwt.generateToken({ id: u.id, userId: u.id, role: u.role, canonicalRole: u.role }, 'provider');
    fs.writeFileSync(process.env.TOKENS, JSON.stringify({ reviewer: staff(reviewer), admin: staff(admin) }), { mode: 0o600 });
    fs.writeFileSync(process.env.OUT, JSON.stringify({
        old: old.certificateNumber, renewal: renewal.certificateNumber, cycleId: cycle.id, statuses,
        backdatedBatch: backdated.body?.data?.batchNumber, currentBatch: current.body?.data?.batchNumber,
    }, null, 2));
    app.listen(Number(process.env.PORT), '127.0.0.1', () => console.log(`ready ${process.env.PORT}`));
})().catch((e) => { console.error('seed failed', e && e.code, e && e.message); process.exit(1); });

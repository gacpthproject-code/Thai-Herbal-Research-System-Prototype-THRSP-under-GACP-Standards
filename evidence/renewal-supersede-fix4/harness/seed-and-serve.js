'use strict';
// Backend from the worktree on a scratch Postgres: MEDIUM-1, a lot harvested on an open cycle under the old
// certificate before a renewal moves that cycle; serve on PORT.
const path = require('path');
const BACKEND = '/home/ubuntu/work/wt-supersede/apps/backend';
process.env.NODE_ENV = 'test';
process.env.STORAGE_TYPE = 'local';
process.env.STORAGE_LOCAL_PATH = '/tmp/gacp-supersede-fix4-uploads';
process.env.ENABLE_QUEUE = 'false';
process.env.ENABLE_CACHE = 'false';
process.env.ENCRYPTION_KEY = 'visual-only-encryption-key-32-chars';
process.env.SIGNING_KEY_DIR = '/tmp/gacp-supersede-fix4-signing-key';
process.env.RATE_LIMIT_MAX = '1000000';
process.env.PAYMENT_ADAPTER = 'mock';
const r = (m) => require(path.join(BACKEND, m));
const { PrismaClient } = r('node_modules/@prisma/client');

(async () => {
    const app = r('server');
    await r('services/prisma-database').connect();
    const prisma = new PrismaClient();
    const certificateService = r('services/certificate-service');
    const audit = r('services/audit-onsite-service');
    const { phaseBApplicationData, phaseBWizardAnswers } = r('test-support/phase-b-application-seed');
    if (!(await prisma.plantSpecies.findFirst({ where: { code: 'CAN' } }))) {
        await prisma.plantSpecies.create({ data: { code: 'CAN', nameTH: 'กัญชา', nameEN: 'Cannabis' } });
    }
    const org = await prisma.organization.create({ data: { name: 'visual org', slug: 'visual-o107', code: 'VISUAL_O107' } });
    const auditorId = (await prisma.user.create({ data: { canonicalId: 'v-aud', password: 'x', organizationId: org.id, authType: 'EMAIL_LEGACY', role: 'auditor', firstName: 'ผู้ตรวจ', lastName: 'ทดสอบ' } })).id;
    const applicant = await prisma.user.create({ data: { canonicalId: 'v-app', password: 'x', organizationId: org.id, authType: 'EMAIL_LEGACY', role: 'health', firstName: 'สมชาย', lastName: 'ต่ออายุ' } });
    const entityId = (await prisma.entity.create({ data: { type: 'JURISTIC', displayName: 'บริษัท ไร่ต่ออายุ จำกัด', organizationId: org.id, createdBy: applicant.id } })).id;
    let n = 0;
    async function passed(renewalOf) {
        n += 1;
        const formData = phaseBWizardAnswers({
            farmData: { ...phaseBWizardAnswers().farmData, farmName: 'ไร่ต่ออายุ', areaTypes: ['OUTDOOR'] },
            purposes: ['RESEARCH'], applicantType: 'JURISTIC',
            ...(renewalOf ? { requestType: 'RENEWAL', renewalOf } : {}),
        });
        const a = await prisma.application.create({ data: phaseBApplicationData({ applicationNumber: `VIS-${n}`, healthId: applicant.canonicalId, organizationId: org.id }, { status: 'AUDIT_PASSED', auditResult: 'PASS', areaType: 'OUTDOOR', formData, entityId }) });
        const c = await prisma.auditChecklist.create({ data: { applicationId: a.id, templateName: 'GACP_GENERAL', sections: [], auditorId, organizationId: org.id, status: 'IN_PROGRESS' } });
        for (const item of audit.CHECKLIST_TEMPLATE_2026) {
            await audit.submitChecklistItem({ onlyDuringVisit: false, auditId: c.id, itemCode: item.itemCode, response: 'PASS', actorId: auditorId, prisma });
        }
        for (let i = 0; i < audit.DEFAULT_MIN_PHOTOS; i += 1) {
            await audit.uploadPhoto({ onlyDuringVisit: false, auditId: c.id, fileBuffer: Buffer.from(`v-${c.id}-${i}`), fileName: `v-${i}.jpg`, gpsLat: 13.75 + i * 1e-4, gpsLng: 100.5 + i * 1e-4, capturedAt: new Date(), uploadedBy: auditorId, organizationId: org.id, prisma });
        }
        return a.id;
    }
    const issue = (id) => prisma.$transaction((tx) => certificateService.generateCertificate(id, auditorId, { prisma: tx }), { timeout: 60000 });
    const species = await prisma.plantSpecies.findFirst({ where: { code: 'CAN' } });
    const bkk = (iso) => new Date(`${iso}+07:00`);
    const old = await issue(await passed(null));
    await prisma.certificate.update({ where: { id: old.id }, data: { issuedDate: bkk('2026-01-01T10:00:00'), expiryDate: bkk('2027-01-01T10:00:00') } });
    const plot = await prisma.plot.create({ data: { farmId: old.farmId, organizationId: org.id, name: 'แปลงกลางแจ้ง', area: 100, solarSystem: 'OUTDOOR' } });
    const cycle = await prisma.plantingCycle.create({ data: { farmId: old.farmId, plantSpeciesId: species.id, organizationId: org.id, cycleName: 'รอบที่เก็บไม่หมด', startDate: new Date('2026-05-01'), status: 'GROWING', cultivationType: 'OUTDOOR', certificateId: old.id, plotId: plot.id } });
    const batch = await prisma.harvestBatch.create({ data: { farmId: old.farmId, cycleId: cycle.id, organizationId: org.id, batchNumber: 'HB-VIS-M1', harvestDate: bkk('2026-07-01T09:00:00'), freshWeight: 10, dryWeight: 3, plantCode: 'CAN', status: 'HARVESTED' } });
    const lot = await prisma.lot.create({ data: { batchId: batch.id, organizationId: org.id, lotNumber: 'LOT-VIS-M1', packageType: 'BAG', quantity: 1, unitWeight: 1, totalWeight: 1, qrCode: 'qr-vis-m1', status: 'PACKAGED' } });
    const renewal = await issue(await passed(old.id));
    const moved = (await prisma.plantingCycle.findUnique({ where: { id: cycle.id } })).certificateId === renewal.id;
    require('fs').writeFileSync(process.env.OUT, JSON.stringify({
        medium1: { old: old.certificateNumber, renewal: renewal.certificateNumber, cycleMovedToRenewal: moved, lotId: lot.id, lotQr: lot.qrCode },
    }, null, 2));
    app.listen(Number(process.env.PORT), '127.0.0.1', () => console.log(`ready ${process.env.PORT}`));
})().catch((e) => { console.error('seed failed', e && e.code, e && e.message); process.exit(1); });

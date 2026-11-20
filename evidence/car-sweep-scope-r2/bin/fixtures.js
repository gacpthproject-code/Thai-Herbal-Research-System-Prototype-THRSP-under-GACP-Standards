'use strict';
// Seeds the scratch database for the order-138 screenshots. Run from <tree>/apps/backend with the
// stack's env sourced. One CAR round per viewport, due in 5 days (end of the Bangkok day), holding one
// file uploaded 3 days ago, so the page shows both rules: 7 days after upload, and the round deadline.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PRIVATE = process.env.CSR_PRIVATE;
const CAR_DIR = process.env.CSR_CAR_DIR;
const tree = process.cwd();
const { prisma } = require(path.join(tree, 'services/prisma-database'));
const authService = require(path.join(tree, 'services/prisma-auth-service'));
const { createWorkspaceEntity } = require(path.join(tree, 'services/entity-service'));
const { settleMilestones } = require(path.join(tree, 'test-support/settled-milestones'));
const { filedFormData, grantFilingConsents } = require(path.join(tree, 'test-support/filed-application'));
const { getZonedParts, startOfLocalCalendarDay, endOfLocalDay } = require(path.join(tree, 'utils/working-days'));
const { thaiIdCheckDigit } = require('module').createRequire(path.join(tree, 'package.json'))('@gacp/validation/thai-id-checksum');

const DAY = 86400000;
const nid = (prefix) => { const f = (prefix + crypto.randomInt(1e11).toString().padStart(11, '0')).slice(0, 12); return f + thaiIdCheckDigit(f); };
const pw = () => `Csr!${crypto.randomBytes(9).toString('base64url')}`;
const FINDINGS = [
    { nonConformity: 'ป้ายแปลงไม่ระบุชื่อสายพันธุ์และวันปลูก', correctiveAction: 'ติดป้ายทุกแปลงให้ครบ แล้วถ่ายภาพป้ายทุกแปลง' },
    { nonConformity: 'ไม่มีบันทึกการใช้ปุ๋ยและสารชีวภัณฑ์ย้อนหลัง', correctiveAction: 'จัดทำสมุดบันทึกตามแบบ และแนบสำเนาหน้าที่บันทึกแล้ว' },
];

(async () => {
    if (!(await prisma.organization.findUnique({ where: { slug: 'default' } }))) {
        await prisma.organization.create({ data: { name: 'ทดสอบ CSR', slug: 'default', code: 'DEFAULT' } });
    }
    const login = nid('1');
    const password = pw();
    const user = await authService.register({
        healthId: login, role: 'health', password, firstName: 'ทดสอบ-CSR', lastName: 'ผู้ยื่น',
        email: `csr-${crypto.randomBytes(3).toString('hex')}@example.test`, phoneNumber: '0800000000',
    });
    await prisma.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } });
    const org = user.organizationId;
    await grantFilingConsents(prisma, { userIds: [user.id], organizationId: org });
    const { entity } = await createWorkspaceEntity({
        user: { id: user.id, organizationId: org }, type: 'JURISTIC',
        applicantData: { taxId: nid('0'), companyName: 'บริษัท ทดสอบ-CSR จำกัด' },
    });
    const now = new Date();
    const { year, month, day } = getZonedParts(now);
    const dueAt = endOfLocalDay(startOfLocalCalendarDay(year, month, day + 5)).toISOString();
    const askedAt = new Date(now.getTime() - 25 * DAY).toISOString();
    fs.mkdirSync(CAR_DIR, { recursive: true });
    const out = { apps: {}, dueAt };
    for (const label of ['desktop', 'mobile']) {
        const filename = `CAR-${Date.now()}-${crypto.randomInt(1e9)}.pdf`;
        fs.copyFileSync(process.env.CSR_PDF, path.join(CAR_DIR, filename));
        const earlier = {
            id: filename, filename, path: `/uploads/car/${filename}`, findingNo: 1, originalName: 'ภาพป้ายแปลง.pdf',
            size: fs.statSync(path.join(CAR_DIR, filename)).size, mimeType: 'application/pdf',
            uploadedAt: new Date(now.getTime() - 3 * DAY).toISOString(), uploadedBy: user.id,
        };
        const row = await prisma.application.create({
            data: {
                applicationNumber: `APP-2569-CSR-${label.toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
                healthId: user.canonicalId, entityId: entity.id, submitterId: user.id, status: 'CAR_PENDING',
                serviceType: 'CERTIFICATION', areaType: 'OUTDOOR', organizationId: org,
                certificationPurposes: ['EXPORT'], scheduledDate: new Date(now.getTime() - 26 * DAY),
                formData: {
                    ...filedFormData(), workflowState: 'CAR_PENDING',
                    carRequestedAt: askedAt, carDueAt: dueAt,
                    carRequest: { message: null, requestedAt: askedAt, items: FINDINGS },
                    carStagedFiles: [earlier],
                },
            },
        });
        await settleMilestones(prisma, row, ['M1', 'M2']);
        out.apps[label] = { id: row.id, number: row.applicationNumber, earlierUploadedAt: earlier.uploadedAt };
    }
    fs.writeFileSync(path.join(PRIVATE, 'fixtures.json'), JSON.stringify(out, null, 2));
    fs.writeFileSync(path.join(PRIVATE, 'creds.json'), JSON.stringify({ applicant: { login, password } }), { mode: 0o600 });
    console.log(`fixtures: desktop=${out.apps.desktop.number} mobile=${out.apps.mobile.number} dueAt=${dueAt}`);
    await prisma.$disconnect();
})().catch((error) => { console.error('FIXTURE FAILED', error.code || '', error.message); process.exit(1); });

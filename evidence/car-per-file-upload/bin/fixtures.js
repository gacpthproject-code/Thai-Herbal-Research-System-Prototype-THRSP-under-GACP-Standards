'use strict';
// Seeds the scratch database for the CAR per-file walk. Run from <tree>/apps/backend with the
// stack's env sourced. Ids go to $CPF_PRIVATE/fixtures.json, passwords to creds.json (0600 only).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PRIVATE = process.env.CPF_PRIVATE;
const tree = process.cwd();
const { prisma } = require(path.join(tree, 'services/prisma-database'));
const authService = require(path.join(tree, 'services/prisma-auth-service'));
const { createWorkspaceEntity } = require(path.join(tree, 'services/entity-service'));
const { settleMilestones } = require(path.join(tree, 'test-support/settled-milestones'));
const { filedFormData, grantFilingConsents } = require(path.join(tree, 'test-support/filed-application'));
const { thaiIdCheckDigit } = require('module').createRequire(path.join(tree, 'package.json'))('@gacp/validation/thai-id-checksum');

const nid = (prefix) => { const f = (prefix + crypto.randomInt(1e11).toString().padStart(11, '0')).slice(0, 12); return f + thaiIdCheckDigit(f); };
const pw = () => `Cpf!${crypto.randomBytes(9).toString('base64url')}`;

const FINDINGS = [
    { nonConformity: 'ป้ายแปลงไม่ระบุชื่อสายพันธุ์และวันปลูก', correctiveAction: 'ติดป้ายทุกแปลงให้ครบ แล้วถ่ายภาพป้ายทุกแปลง' },
    { nonConformity: 'ไม่มีบันทึกการใช้ปุ๋ยและสารชีวภัณฑ์ย้อนหลัง', correctiveAction: 'จัดทำสมุดบันทึกตามแบบ และแนบสำเนาหน้าที่บันทึกแล้ว' },
    { nonConformity: 'จุดเก็บสารเคมีไม่มีป้ายเตือนและไม่ได้ล็อก', correctiveAction: 'ติดป้ายเตือน ติดตั้งกุญแจ และถ่ายภาพจุดเก็บ' },
];

async function person(role, label) {
    const id13 = nid(role === 'health' ? '1' : '3');
    const password = pw();
    const user = await authService.register({
        ...(role === 'health' ? { healthId: id13 } : { providerId: id13, accountType: 'PROVIDER' }),
        role, password, firstName: 'ทดสอบ-CPF', lastName: label,
        email: `cpf-${label}-${crypto.randomBytes(3).toString('hex')}@example.test`, phoneNumber: '0800000000',
    });
    await prisma.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } });
    return { id: user.id, canonicalId: user.canonicalId, organizationId: user.organizationId, login: id13, password };
}

(async () => {
    if (!(await prisma.organization.findUnique({ where: { slug: 'default' } }))) {
        await prisma.organization.create({ data: { name: 'ทดสอบ CPF', slug: 'default', code: 'DEFAULT' } });
    }
    const applicant = await person('health', 'ผู้ยื่น');
    const reviewer = await person('document_reviewer', 'ผู้ตรวจเอกสาร');
    const inspector = await person('field_inspector', 'ผู้ตรวจพื้นที่');
    const org = applicant.organizationId;
    await grantFilingConsents(prisma, { userIds: [applicant.id], organizationId: org });
    const { entity } = await createWorkspaceEntity({
        user: { id: applicant.id, organizationId: org }, type: 'JURISTIC',
        applicantData: { taxId: nid('0'), companyName: 'บริษัท ทดสอบ-CPF จำกัด' },
    });
    const askedAt = new Date(Date.now() - 86400000).toISOString();
    const out = { entityId: entity.id, users: { applicant: applicant.id, inspector: inspector.id }, apps: {} };
    for (const label of ['desktop', 'mobile']) {
        const row = await prisma.application.create({
            data: {
                applicationNumber: `APP-2569-CPF-${label.toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
                healthId: applicant.canonicalId, entityId: entity.id, submitterId: applicant.id, status: 'CAR_PENDING',
                serviceType: 'CERTIFICATION', areaType: 'OUTDOOR', organizationId: org, reviewerId: reviewer.id, auditorId: inspector.id,
                certificationPurposes: ['EXPORT'], scheduledDate: new Date(Date.now() - 2 * 86400000),
                formData: {
                    ...filedFormData(), workflowState: 'CAR_PENDING',
                    carRequestedAt: askedAt, carDueAt: new Date(Date.now() + 29 * 86400000).toISOString(),
                    carRequest: { message: null, requestedAt: askedAt, items: FINDINGS },
                    carStagedFiles: [],
                },
            },
        });
        await settleMilestones(prisma, row, ['M1', 'M2']);
        out.apps[label] = { id: row.id, number: row.applicationNumber };
    }
    fs.writeFileSync(path.join(PRIVATE, 'fixtures.json'), JSON.stringify(out, null, 2));
    fs.writeFileSync(path.join(PRIVATE, 'creds.json'), JSON.stringify({ applicant, inspector }), { mode: 0o600 });
    console.log(`fixtures: desktop=${out.apps.desktop.number} mobile=${out.apps.mobile.number}`);
    await prisma.$disconnect();
})().catch((error) => { console.error('FIXTURE FAILED', error.code || '', error.message); process.exit(1); });

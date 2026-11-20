'use strict';

const crypto = require('crypto');
const path = require('path');

const backend = path.resolve(__dirname, '..', '..', '..', 'apps', 'backend');
const fromBackend = (name) => require(require.resolve(name, { paths: [backend] }));
const bcrypt = fromBackend('bcryptjs');
const { PrismaClient } = fromBackend('@prisma/client');

const password = process.env.QA_PASSWORD;
if (!password) { throw new Error('QA_PASSWORD is not set'); }
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function thaiNationalId() {
    const digits = Array.from({ length: 12 }, () => crypto.randomInt(0, 10));
    digits[0] = crypto.randomInt(1, 9);
    const sum = digits.reduce((acc, digit, i) => acc + digit * (13 - i), 0);
    digits.push((11 - (sum % 11)) % 10);
    return digits.join('');
}

const STATES = [
    { role: 'document_reviewer', firstName: 'สมศรี', lastName: 'ลงทะเบียนแล้ว', twoFactorEnabled: true, twoFactorMethod: 'TOTP', twoFactorSecret: 'JBSWY3DPEHPK3PXP', lastLoginAt: new Date('2026-10-19T02:30:00Z') },
    { role: 'dispatcher', firstName: 'สมชาย', lastName: 'ยังไม่ลงทะเบียน', lastLoginAt: new Date('2026-10-18T09:00:00Z') },
    { role: 'field_inspector', firstName: 'วิภา', lastName: 'วิธีเดิมที่ปลดแล้ว', twoFactorEnabled: true, twoFactorMethod: 'EMAIL' },
    { role: 'certificate_approver', firstName: 'ประเสริฐ', lastName: 'ไม่เคยเข้าระบบ' },
    { role: 'finance_officer_dtam', firstName: 'กมล', lastName: 'ปิดใช้งาน', status: 'DISABLED', twoFactorEnabled: true, twoFactorMethod: 'TOTP', twoFactorSecret: 'JBSWY3DPEHPK3PXP' },
    { role: 'system_admin_dtam', firstName: 'อรทัย', lastName: 'ผู้ดูแลกรม', twoFactorEnabled: true, twoFactorMethod: 'TOTP', twoFactorSecret: 'JBSWY3DPEHPK3PXP' },
    { role: 'finance_officer_platform', firstName: 'ณัฐ', lastName: 'การเงินบริษัท', org: 'platform' },
    { role: 'system_admin_platform', firstName: 'พิมพ์', lastName: 'ผู้ดูแลบริษัท', org: 'platform', twoFactorEnabled: true, twoFactorMethod: 'TOTP', twoFactorSecret: 'JBSWY3DPEHPK3PXP' },
    { role: 'health', firstName: 'เกษตรกร', lastName: 'ไม่ใช่เจ้าหน้าที่' },
    { role: 'document_reviewer', firstName: 'test-mfa-check', lastName: 'บัญชีทดสอบ', qa: true },
];

async function main() {
    const prisma = new PrismaClient();
    const sfx = crypto.randomUUID().slice(0, 8);
    const orgs = {
        dtam: await prisma.organization.create({ data: { name: 'กรมตัวอย่าง (scratch)', slug: `s2fa-dtam-${sfx}`, code: `S2FA_DTAM_${sfx}` } }),
        platform: await prisma.organization.create({ data: { name: 'บริษัทตัวอย่าง (scratch)', slug: `s2fa-co-${sfx}`, code: `S2FA_CO_${sfx}` } }),
    };
    const hash = bcrypt.hashSync(password, 4);
    let qaId = null;
    let n = 0;
    for (const state of STATES) {
        n += 1;
        const { org = 'dtam', qa = false, ...fields } = state;
        const nationalId = thaiNationalId();
        const isStaff = fields.role !== 'health';
        await prisma.user.create({
            data: {
                canonicalId: `s2fa-seed-${n}-${sfx}`, password: hash, status: 'ACTIVE',
                email: `s2fa-seed-${n}-${sfx}@example.test`, organizationId: orgs[org].id,
                ...(isStaff
                    ? { accountType: 'PROVIDER', authType: 'PROVIDER_ID', providerId: nationalId, providerIdHash: sha256(nationalId) }
                    : { accountType: 'INDIVIDUAL', authType: 'HEALTH_ID', healthId: nationalId, healthIdHash: sha256(nationalId) }),
                ...fields,
            },
        });
        if (qa) { qaId = nationalId; }
    }
    process.stdout.write(`seeded ${n} accounts in 2 organizations\nQA_ID=${qaId}\n`);
    await prisma.$disconnect();
}

main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exit(1); });

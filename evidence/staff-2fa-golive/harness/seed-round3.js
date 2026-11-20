'use strict';

// Round 3 seed for the production-mode server and the screenshots: one DTAM admin plus a newcomer
// and a mover per viewport, all in one organization. Writes ids, the sign-in numbers, the password, the enrolled account's secret and
// backup codes to $ROUND3_STATE (0600, under scratch, deleted with it). Nothing is printed.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const backend = path.resolve(process.env.ROUND3_TREE, 'apps', 'backend');
const fromBackend = (name) => require(require.resolve(name, { paths: [backend] }));
const bcrypt = fromBackend('bcryptjs');
const { PrismaClient } = fromBackend('@prisma/client');
const { mfaService } = require(path.join(backend, 'middleware', 'mfa-service'));
const { computeLookupHmac } = require(path.join(backend, 'utils', 'field-encryption'));

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function thaiNationalId() {
    const digits = Array.from({ length: 12 }, () => crypto.randomInt(0, 10));
    digits[0] = crypto.randomInt(1, 9);
    const sum = digits.reduce((acc, digit, i) => acc + digit * (13 - i), 0);
    digits.push((11 - (sum % 11)) % 10);
    return digits.join('');
}

async function main() {
    const prisma = new PrismaClient();
    const password = crypto.randomBytes(18).toString('base64url');
    const hash = bcrypt.hashSync(password, 4);
    const sfx = crypto.randomUUID().slice(0, 8);
    const org = await prisma.organization.create({ data: { name: `กรมตัวอย่าง รอบ 3 ${sfx}`, slug: `s2fa-r3-${sfx}`, code: `S2FA_R3_${sfx}` } });
    let seq = 0;
    async function account(role, { firstName, lastName, secret = null, codes = [] }) {
        seq += 1;
        const nationalId = thaiNationalId();
        const row = await prisma.user.create({
            data: {
                canonicalId: `s2fa-r3-${seq}-${sfx}`, password: hash, role, status: 'ACTIVE', firstName, lastName,
                email: `s2fa-r3-${seq}-${sfx}@example.test`, organizationId: org.id, idCardHmac: computeLookupHmac(nationalId),
                accountType: 'PROVIDER', authType: 'PROVIDER_ID', providerId: nationalId, providerIdHash: sha256(nationalId),
                ...(secret ? { twoFactorEnabled: true, twoFactorMethod: 'TOTP', twoFactorSecret: secret, twoFactorBackupCodes: codes.map((c) => mfaService.hashBackupCode(c)) } : {}),
            },
        });
        return { id: row.id, nationalId, secret, codes };
    }
    // One newcomer and one mover per viewport: the first pass enrols the newcomer and moves the
    // mover's factor, so the second viewport needs accounts still in their starting state.
    const people = async () => ({
        newcomer: await account('document_reviewer', { firstName: 'สมชาย', lastName: 'ยังไม่ลงทะเบียน' }),
        mover: await account('field_inspector', { firstName: 'วิภา', lastName: 'ทำเครื่องหาย', secret: mfaService.generateSecret(), codes: mfaService.generateBackupCodes(10) }),
    });
    const state = {
        password,
        orgId: org.id,
        admin: await account('system_admin_dtam', { firstName: 'อรทัย', lastName: 'ผู้ดูแลกรม', secret: mfaService.generateSecret(), codes: mfaService.generateBackupCodes(10) }),
        byViewport: { '390x844': await people(), '1440x900': await people() },
    };
    fs.writeFileSync(process.env.ROUND3_STATE, JSON.stringify(state), { mode: 0o600 });
    process.stdout.write(`seeded ${seq} staff accounts in 1 organization\n`);
    await prisma.$disconnect();
}

main().catch((error) => {
    process.stderr.write(`seed failed: ${error.message}\n`);
    process.exit(1);
});

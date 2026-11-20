'use strict';

/**
 * คำสั่ง operator 89 ข (2026-10-20): ทางฉุกเฉินเมื่อไม่มีรหัสสำรองเหลือ คือสคริปต์ ops ที่ operator อนุมัติทีละครั้ง
 * ไม่มีประตู HTTP · ล้างเฉพาะปัจจัยที่สองของบัญชีที่ระบุ · ไม่แตะรหัสผ่าน บทบาท หรือสิทธิ์ แต่ตัดการเข้าสู่ระบบและ
 * token ที่ค้างอยู่ทั้งหมดของบัญชีนั้น (คำสั่ง 93 แก้ 89 ข3) · บันทึกว่าใครขอ ใครอนุมัติ รันเมื่อไร และตัดเมื่อไร
 * · การเข้าสู่ระบบครั้งถัดไปได้แค่ตั๋วลงทะเบียน · การตัด session วัดผ่าน HTTP ใน staff-2fa-sessions-revoked-real-postgres
 *
 * Postgres จริง · สคริปต์รันเป็นโปรเซสลูกเหมือนในคอนเทนเนอร์ (DATABASE_URL อยู่ใน environment ไม่อยู่ใน argv)
 * · ประตูรหัสผ่านเจ้าหน้าที่และ /api/mfa ตัวจริงผ่าน supertest สำหรับการเข้าสู่ระบบครั้งถัดไป
 */

const crypto = require('crypto');
const path = require('path');
const { spawnSync } = require('child_process');
const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { CANONICAL_ROLES } = require('../../shared/canonical-rbac');
const { computeLookupHmac } = require('../../utils/field-encryption');
const { mfaService } = require('../../middleware/mfa-service');

const BACKEND = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(BACKEND, 'scripts', 'ops', 'staff-2fa-emergency-reset.js');
const PASSWORD = 'Gacp#Emergency2026x';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);
const CONFIRMATION = 'บันทึกข้อความ ที่ สธ 0509/ว123 ลงวันที่ 20 ต.ค. 2569';
const APPROVAL = 'operator 2026-10-20 แชต 14:05 อนุมัติล้าง 2FA';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function thaiNationalId() {
    const digits = Array.from({ length: 12 }, () => crypto.randomInt(0, 10));
    digits[0] = crypto.randomInt(1, 9);
    const sum = digits.reduce((acc, digit, i) => acc + digit * (13 - i), 0);
    digits.push((11 - (sum % 11)) % 10);
    return digits.join('');
}

function runScript(args, { flag = 'true' } = {}) {
    const result = spawnSync(process.execPath, [SCRIPT, ...args], {
        cwd: BACKEND,
        encoding: 'utf8',
        timeout: 120000,
        env: { ...process.env, REQUIRE_MFA_FOR_PRIVILEGED: flag },
    });
    return { status: result.status, stdout: (result.stdout || '').trim(), stderr: (result.stderr || '').trim() };
}

const resetArgs = (target, requester) => [
    '--target', target.id, '--requester', requester.id, '--confirmation', CONFIRMATION, '--approval', APPROVAL,
];

d('order 89 ข: the emergency script clears only the second factor of one staff account (real Postgres)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    let envBackup;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { userIds: [], orgIds: [] };
    const orgs = {};
    const who = {};
    let seq = 0;

    async function organization(label) {
        const row = await raw.organization.create({
            data: { name: `หน่วยงาน ${label} ${sfx}`, slug: `s2fa-er-${label}-${sfx}`.toLowerCase(), code: `S2FAER_${label}_${sfx}`.toUpperCase() },
        });
        fx.orgIds.push(row.id);
        return row.id;
    }

    async function account(role, organizationId, { secret = null, backupCodes = [] } = {}) {
        seq += 1;
        const id = crypto.randomUUID();
        const nationalId = thaiNationalId();
        const isStaff = role !== CANONICAL_ROLES.HEALTH;
        const identity = isStaff
            ? { accountType: 'PROVIDER', authType: 'PROVIDER_ID', providerId: nationalId, providerIdHash: sha256(nationalId) }
            : { accountType: 'INDIVIDUAL', authType: 'HEALTH_ID', healthId: nationalId, healthIdHash: sha256(nationalId), idCardHash: sha256(nationalId) };
        await raw.user.create({
            data: {
                id, canonicalId: `s2fa-er-${seq}-${sfx}`, password: PASSWORD_HASH, role, status: 'ACTIVE',
                email: `s2fa-er-${seq}-${sfx}@example.test`, firstName: `ชื่อ${seq}`, lastName: `สกุล${sfx}`,
                organizationId, idCardHmac: computeLookupHmac(nationalId), ...identity,
                ...(secret ? {
                    twoFactorEnabled: true, twoFactorMethod: 'TOTP', twoFactorSecret: secret,
                    twoFactorBackupCodes: backupCodes.map((code) => mfaService.hashBackupCode(code)),
                } : {}),
            },
        });
        fx.userIds.push(id);
        return { id, nationalId };
    }

    const fullRow = (id) => raw.user.findUnique({ where: { id } });
    const resetAudits = (targetId) => raw.auditLog.findMany({ where: { action: 'MFA_EMERGENCY_RESET', resourceId: targetId } });
    // The epoch is rounded up to the next whole second (utils/session-epoch SF-2), so a ticket
    // minted in the same second as the clear is refused by design; the next sign-in waits it out.
    async function untilAfter(revokedAt) {
        const wait = revokedAt.getTime() - Date.now();
        if (wait > 0) { await new Promise((resolve) => setTimeout(resolve, wait + 50)); }
    }

    beforeAll(async () => {
        envBackup = { ...process.env };
        process.env.REQUIRE_MFA_FOR_PRIVILEGED = 'true';
        raw = new PrismaClient();
        orgs.a = await organization('A');
        orgs.b = await organization('B');
        who.dtamAdminA = await account(CANONICAL_ROLES.SYSTEM_ADMIN_DTAM, orgs.a);
        who.dtamAdminB = await account(CANONICAL_ROLES.SYSTEM_ADMIN_DTAM, orgs.b);
        who.platformAdmin = await account(CANONICAL_ROLES.SYSTEM_ADMIN_PLATFORM, orgs.b);
        who.reviewerA = await account(CANONICAL_ROLES.DOCUMENT_REVIEWER, orgs.a, { secret: mfaService.generateSecret() });
        who.otherReviewerA = await account(CANONICAL_ROLES.DOCUMENT_REVIEWER, orgs.a, { secret: mfaService.generateSecret() });
        who.applicant = await account(CANONICAL_ROLES.HEALTH, orgs.a, { secret: mfaService.generateSecret() });
        who.inspectorWithCode = await account(CANONICAL_ROLES.FIELD_INSPECTOR, orgs.a, { secret: mfaService.generateSecret(), backupCodes: ['AAAA-1111'] });
        who.unenrolled = await account(CANONICAL_ROLES.DISPATCHER, orgs.a);
        who.selfAdmin = await account(CANONICAL_ROLES.SYSTEM_ADMIN_DTAM, orgs.a, { secret: mfaService.generateSecret() });
        app = express();
        app.use(express.json());
        app.use(cookieParser());
        app.use('/api/auth/provider', require('../../routes/api/auth/auth-provider'));
        app.use('/api/mfa', require('../../routes/api/identity/mfa'));
    });

    afterAll(async () => {
        if (raw) {
            await raw.notification.deleteMany({ where: { userId: { in: fx.userIds } } });
            if (fx.orgIds.length) { await raw.auditLog.deleteMany({ where: { organizationId: { in: fx.orgIds } } }); }
            await raw.user.deleteMany({ where: { id: { in: fx.userIds } } });
            for (const id of fx.orgIds) { await raw.organization.delete({ where: { id } }).catch(() => {}); }
            await raw.$disconnect();
        }
        for (const key of Object.keys(process.env)) {
            if (!(key in envBackup)) { delete process.env[key]; }
        }
        Object.assign(process.env, envBackup);
    });

    test('a DTAM admin of the same organization resets a reviewer whose codes are used up: only the three second-factor columns and the session epoch change, one audit row names requester, approver, confirmation and the revocation, and the next sign-in yields the setup ticket only', async () => {
        const admin = who.dtamAdminA;
        const target = await account(CANONICAL_ROLES.DOCUMENT_REVIEWER, orgs.a, { secret: mfaService.generateSecret() });
        const before = await fullRow(target.id);
        const startedAt = Date.now();

        const run = runScript(resetArgs(target, admin));
        expect({ status: run.status, refused: /ไม่ล้าง|ล้างไม่สำเร็จ/.test(run.stderr) }).toEqual({ status: 0, refused: false });
        const resultLines = run.stdout.split('\n').filter((line) => line.includes('ล้างการยืนยันตัวตนสองชั้น'));
        expect(resultLines).toHaveLength(1);
        expect(resultLines[0]).toContain(target.id);
        expect(resultLines[0]).toContain(admin.id);
        expect(resultLines[0]).toContain(CONFIRMATION);
        expect(resultLines[0]).toContain(APPROVAL);
        expect(resultLines[0]).toContain('ลงทะเบียนแอปยืนยันตัวตนใหม่');
        expect(resultLines[0]).toContain('ตัดการเข้าสู่ระบบ');
        expect(run.stdout).not.toContain(before.twoFactorSecret);
        expect(run.stdout).not.toContain(target.nationalId);

        const after = await fullRow(target.id);
        expect(after).toEqual({
            ...before,
            twoFactorEnabled: false,
            twoFactorSecret: null,
            twoFactorBackupCodes: null,
            sessionsRevokedAt: after.sessionsRevokedAt,
            updatedAt: after.updatedAt,
        });
        expect(after.sessionsRevokedAt).toBeInstanceOf(Date);
        expect(after.sessionsRevokedAt.getTime()).toBeGreaterThanOrEqual(startedAt);
        expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(before.updatedAt.getTime());

        const rows = await resetAudits(target.id);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toEqual(expect.objectContaining({
            category: 'SECURITY', actorId: admin.id, actorRole: CANONICAL_ROLES.SYSTEM_ADMIN_DTAM,
            resourceType: 'USER', resourceId: target.id, organizationId: orgs.a, result: 'SUCCESS',
        }));
        expect(rows[0].createdAt.getTime()).toBeGreaterThanOrEqual(startedAt - 1000);
        const metadata = JSON.parse(rows[0].metadata);
        expect(metadata).toEqual(expect.objectContaining({
            approvalReference: APPROVAL, confirmationReference: CONFIRMATION, requesterId: admin.id,
            cleared: ['twoFactorEnabled', 'twoFactorSecret', 'twoFactorBackupCodes'],
            sessionsRevokedAt: after.sessionsRevokedAt.toISOString(),
        }));
        expect(metadata.revoked).toEqual(expect.objectContaining({ sessions: 'all issued before sessionsRevokedAt' }));
        expect(new Date(metadata.runAt).getTime()).toBeGreaterThanOrEqual(startedAt - 1000);
        expect(JSON.stringify(rows[0])).not.toContain(before.twoFactorSecret);

        await untilAfter(after.sessionsRevokedAt);
        const login = await request(app).post('/api/auth/provider/login').send({ providerId: target.nationalId, password: PASSWORD });
        expect(login.status).toBe(200);
        expect(login.body.data.mfa_setup_required).toBe(true);
        expect(typeof login.body.data.setup_token).toBe('string');
        expect(login.body.data.mfa_required).toBeUndefined();
        expect(login.body.data.token).toBeUndefined();
        expect((login.headers['set-cookie'] || []).filter((c) => /^(provider_token|auth_token|refresh_token)=[^;]/.test(c))).toEqual([]);
        const setup = await request(app).post('/api/mfa/setup').set('Authorization', `Bearer ${login.body.data.setup_token}`).send({});
        expect(setup.status).toBe(200);
        expect(setup.body.data.backupCodes).toHaveLength(10);
    });

    test('the platform admin resets a company finance officer of another organization (that admin crosses organizations, order 17)', async () => {
        const target = await account(CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM, orgs.a, { secret: mfaService.generateSecret() });
        const run = runScript(resetArgs(target, who.platformAdmin));
        expect({ status: run.status, refused: /ไม่ล้าง|ล้างไม่สำเร็จ/.test(run.stderr) }).toEqual({ status: 0, refused: false });
        const after = await fullRow(target.id);
        expect(after.twoFactorEnabled).toBe(false);
        expect(after.twoFactorSecret).toBeNull();
        expect(await resetAudits(target.id)).toHaveLength(1);
    });

    describe('every refusal leaves the row byte-for-byte as it was and writes no audit row', () => {
        test.each([
            ['the flag is off', 'reviewerA', 'dtamAdminA', { flag: 'false' }, /REQUIRE_MFA_FOR_PRIVILEGED/],
            ['the target is an applicant account', 'applicant', 'dtamAdminA', {}, /ไม่ใช่บัญชีเจ้าหน้าที่/],
            ['the requester is not an admin', 'reviewerA', 'otherReviewerA', {}, /คำสั่ง 13/],
            ['the admin of the other side asks', 'reviewerA', 'platformAdmin', {}, /คำสั่ง 13/],
            ['the DTAM admin of another organization asks', 'reviewerA', 'dtamAdminB', {}, /คำสั่ง 17/],
            ['the target still has an unused backup code', 'inspectorWithCode', 'dtamAdminA', {}, /ขั้นตอน ก/],
            ['the target never enrolled', 'unenrolled', 'dtamAdminA', {}, /ไม่ได้เปิดการยืนยันตัวตนสองชั้น/],
            ['the requester names itself as the target', 'selfAdmin', 'selfAdmin', {}, /ผู้ขอเป็นบัญชีเป้าหมายเอง/],
        ])('refuses when %s', async (_name, targetKey, requesterKey, options, pattern) => {
            const target = who[targetKey];
            const before = await fullRow(target.id);
            const run = runScript(resetArgs(target, who[requesterKey]), options);
            expect(run.status).toBe(2);
            expect(run.stderr).toMatch(pattern);
            expect(run.stdout).not.toContain('ล้างการยืนยันตัวตนสองชั้นของบัญชี');
            expect(await fullRow(target.id)).toEqual(before);
            expect(await resetAudits(target.id)).toHaveLength(0);
        });

        test('a missing input is refused with the usage line before the database is touched', () => {
            const run = runScript(['--target', who.reviewerA.id]);
            expect(run.status).toBe(2);
            expect(run.stderr).toMatch(/--requester --confirmation --approval/);
            expect(run.stderr).toContain('วิธีใช้');
        });
    });
});

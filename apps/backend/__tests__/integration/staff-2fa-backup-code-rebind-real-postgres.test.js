'use strict';

/**
 * คำสั่ง operator 89 ก (2026-10-20): เจ้าหน้าที่ที่ทำอุปกรณ์ยืนยันตัวตนหาย ย้าย 2FA ไปเครื่องใหม่ได้เอง
 * ด้วยรหัสสำรอง 1 รหัส · เครื่องเดิมและรหัสสำรองชุดเดิมตายทันทีที่ยืนยันเครื่องใหม่ · เจ้าของได้รับแจ้ง
 * ในระบบแบบปิดเสียงไม่ได้ และมีแถวบันทึกการตรวจสอบ · การลงทะเบียนจบได้เมื่อยืนยันว่าบันทึกรหัสสำรองแล้ว
 *
 * Postgres จริง · ประตูรหัสผ่านเจ้าหน้าที่และ /api/mfa ตัวจริง · ยามจริง · HTTP ผ่าน supertest
 * สิ่งเดียวที่อยู่ในหน่วยความจำคือช่องพัก secret ใหม่ (mfa-reenrol-store) เพราะด่าน gate ไม่มี Redis
 * ตั้ง GACP_TEST_REDIS_URL แล้วชุดนี้ใช้ช่องพักของจริงบน Redis นั้นแทน
 */

const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');
const { CANONICAL_ROLES } = require('../../shared/canonical-rbac');
const { computeLookupHmac } = require('../../utils/field-encryption');
const { mfaService } = require('../../middleware/mfa-service');

const mockPending = new Map();
const mockAttempts = new Map();
jest.mock('../../services/auth/mfa-reenrol-store', () => {
    if (process.env.GACP_TEST_REDIS_URL) { return jest.requireActual('../../services/auth/mfa-reenrol-store'); }
    const MAX_FAILED_CODES = 5;
    return {
        MAX_FAILED_CODES,
        start: jest.fn(async (userId, entry) => {
            mockAttempts.delete(userId);
            mockPending.set(userId, { ...entry, expiresAt: Date.now() + 600000 });
            return mockPending.get(userId);
        }),
        read: jest.fn(async (userId) => mockPending.get(userId) || null),
        claimAttempt: jest.fn(async (userId) => {
            const attempt = (mockAttempts.get(userId) || 0) + 1;
            mockAttempts.set(userId, attempt);
            return { attempt, allowed: attempt <= MAX_FAILED_CODES };
        }),
        recordFailure: jest.fn(async (userId, attempt) => {
            if (attempt >= MAX_FAILED_CODES) {
                mockPending.delete(userId);
                mockAttempts.delete(userId);
                return { exhausted: true, failures: attempt };
            }
            return { exhausted: false, failures: attempt };
        }),
        clear: jest.fn(async (userId) => { mockPending.delete(userId); mockAttempts.delete(userId); }),
    };
});
jest.mock('../../config/redis', () => null);

const PASSWORD = 'Gacp#Rebind2026x';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);
const SESSION_COOKIES = ['provider_token', 'auth_token', 'refresh_token'];

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const hashes = (codes) => codes.map((code) => mfaService.hashBackupCode(code));
const maskedPrefix = (ip) => `${ip.split('.').slice(0, 2).join('.')}.x.x`;

function thaiNationalId() {
    const digits = Array.from({ length: 12 }, () => crypto.randomInt(0, 10));
    digits[0] = crypto.randomInt(1, 9);
    const sum = digits.reduce((acc, digit, i) => acc + digit * (13 - i), 0);
    digits.push((11 - (sum % 11)) % 10);
    return digits.join('');
}

function sessionCookies(res) {
    return (res.headers['set-cookie'] || [])
        .filter((c) => SESSION_COOKIES.some((name) => c.startsWith(`${name}=`)))
        .filter((c) => !/^[^=]+=;/.test(c) && !/expires=thu, 01 jan 1970/i.test(c));
}

d('order 89 ก: a staff member moves 2FA to a new device with one backup code (real Postgres, real HTTP)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    let envBackup;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { userIds: [], orgId: null, rebind: null };
    let seq = 0;
    let ipSeq = 0;
    const freshIp = () => { ipSeq += 1; return `10.${20 + Math.floor(ipSeq / 250)}.7.${ipSeq % 250}`; };

    async function account(role, { secret = null, backupCodes = [] } = {}) {
        seq += 1;
        const id = crypto.randomUUID();
        const nationalId = thaiNationalId();
        await raw.user.create({
            data: {
                id, canonicalId: `s2fa-rb-${seq}-${sfx}`, password: PASSWORD_HASH, role, status: 'ACTIVE',
                email: `s2fa-rb-${seq}-${sfx}@example.test`, firstName: `ชื่อ${seq}`, lastName: `สกุล${sfx}`,
                organizationId: fx.orgId, idCardHmac: computeLookupHmac(nationalId),
                accountType: 'PROVIDER', authType: 'PROVIDER_ID', providerId: nationalId, providerIdHash: sha256(nationalId),
                ...(secret ? { twoFactorEnabled: true, twoFactorMethod: 'TOTP', twoFactorSecret: secret, twoFactorBackupCodes: hashes(backupCodes) } : {}),
            },
        });
        fx.userIds.push(id);
        return { id, nationalId };
    }

    const factor = (id) => raw.user.findUnique({
        where: { id },
        select: { twoFactorEnabled: true, twoFactorSecret: true, twoFactorBackupCodes: true, sessionsRevokedAt: true },
    });

    const login = (user, ip) => request(app).post('/api/auth/provider/login').set('x-test-ip', ip)
        .send({ providerId: user.nationalId, password: PASSWORD });

    async function signIn(user, { code, isBackupCode = false }) {
        const ip = freshIp();
        const first = await login(user, ip);
        expect(first.status).toBe(200);
        expect(first.body.data.mfa_required).toBe(true);
        return request(app).post('/api/mfa/verify').set('x-test-ip', ip)
            .send({ mfa_session: first.body.data.mfa_session, code, isBackupCode });
    }

    const mfaSetup = (bearer, body) => request(app).post('/api/mfa/setup').set('Authorization', bearer).set('x-test-ip', freshIp()).send(body);
    const mfaVerifySetup = (bearer, body, ip = freshIp()) => request(app).post('/api/mfa/verify-setup').set('Authorization', bearer).set('x-test-ip', ip).send(body);

    async function untilAfter(revokedAt) {
        const wait = revokedAt.getTime() - Date.now();
        if (wait > 0) { await new Promise((resolve) => setTimeout(resolve, wait + 50)); }
    }

    beforeAll(async () => {
        envBackup = { ...process.env };
        process.env.REQUIRE_MFA_FOR_PRIVILEGED = 'true';
        if (process.env.GACP_TEST_REDIS_URL) {
            process.env.REDIS_URL = process.env.GACP_TEST_REDIS_URL;
            await require('../../services/redis-service').connect();
        }
        raw = new PrismaClient();
        const org = await raw.organization.create({
            data: { name: `หน่วยงานทดสอบย้าย 2FA ${sfx}`, slug: `s2fa-rb-${sfx}`, code: `S2FARB_${sfx.toUpperCase()}` },
        });
        fx.orgId = org.id;
        app = express();
        app.use(express.json());
        app.use(cookieParser());
        app.use((req, _res, next) => { req.clientIp = req.headers['x-test-ip'] || '10.0.0.1'; next(); });
        app.use('/api/auth/provider', require('../../routes/api/auth/auth-provider'));
        app.use('/api/mfa', require('../../routes/api/identity/mfa'));
    });

    afterAll(async () => {
        if (raw) {
            await raw.notification.deleteMany({ where: { userId: { in: fx.userIds } } });
            if (fx.orgId) { await raw.auditLog.deleteMany({ where: { organizationId: fx.orgId } }); }
            await raw.user.deleteMany({ where: { id: { in: fx.userIds } } });
            if (fx.orgId) { await raw.organization.delete({ where: { id: fx.orgId } }).catch(() => {}); }
            await raw.$disconnect();
        }
        for (const key of Object.keys(process.env)) {
            if (!(key in envBackup)) { delete process.env[key]; }
        }
        Object.assign(process.env, envBackup);
    });

    describe('ก1 enrolment', () => {
        test('the backup codes are shown once at /setup; /verify-setup refuses to enable 2FA until the person confirms they saved them; the codes shown are the ones that sign in afterwards', async () => {
            const staff = await account(CANONICAL_ROLES.DOCUMENT_REVIEWER);
            const first = await login(staff, freshIp());
            expect(first.status).toBe(200);
            expect(first.body.data.mfa_setup_required).toBe(true);
            const bearer = `Bearer ${first.body.data.setup_token}`;

            const setup = await mfaSetup(bearer, {});
            expect(setup.status).toBe(200);
            expect(setup.body.data.backupCodes).toHaveLength(10);
            expect((await factor(staff.id)).twoFactorEnabled).toBe(false);
            // pending codes open no door: the password still yields only the setup ticket
            const pending = await login(staff, freshIp());
            expect(pending.body.data).toEqual(expect.objectContaining({ mfa_setup_required: true }));
            expect(pending.body.data.mfa_required).toBeUndefined();
            const code = mfaService.generateTOTP(setup.body.data.secret);

            const unconfirmed = await mfaVerifySetup(bearer, { code });
            expect(unconfirmed.status).toBe(400);
            expect(unconfirmed.body.code).toBe('MFA_BACKUP_CODES_NOT_CONFIRMED');
            expect((await factor(staff.id)).twoFactorEnabled).toBe(false);

            const confirmed = await mfaVerifySetup(bearer, { code, backupCodesSaved: true });
            expect(confirmed.status).toBe(200);
            expect(confirmed.body.data.backupCodes).toBeUndefined();
            const after = await factor(staff.id);
            expect(after.twoFactorEnabled).toBe(true);
            expect(after.twoFactorSecret).toBe(setup.body.data.secret);
            expect(after.twoFactorBackupCodes).toEqual(hashes(setup.body.data.backupCodes));

            const signedIn = await signIn(staff, { code: setup.body.data.backupCodes[0], isBackupCode: true });
            expect(signedIn.status).toBe(200);
            expect(sessionCookies(signedIn)).toHaveLength(1);
        });
    });

    describe('ก2 ก3 ก4 moving the factor with a backup code', () => {
        const OLD_CODES = mfaService.generateBackupCodes(10);
        let staff;
        let oldSecret;

        beforeAll(async () => {
            oldSecret = mfaService.generateSecret();
            staff = await account(CANONICAL_ROLES.FIELD_INSPECTOR, { secret: oldSecret, backupCodes: OLD_CODES });
            // the owner muted the notice type beforehand; it must arrive anyway (orders 48, 52, 73(1), 89 ก3)
            await raw.user.update({ where: { id: staff.id }, data: { notificationSettings: { channels: { SECOND_FACTOR_MOVED: { inApp: false } } } } });
        });

        test('one unused backup code starts the move and is consumed; the same code, a wrong code, or no code at all is refused; five wrong codes from one address trip the limiter', async () => {
            const session = await signIn(staff, { code: OLD_CODES[0], isBackupCode: true });
            expect(session.status).toBe(200);
            const bearer = `Bearer ${session.body.data.token}`;
            expect((await factor(staff.id)).twoFactorBackupCodes).toEqual(hashes(OLD_CODES.slice(1)));

            for (const body of [{}, { code: '000000' }, { backupCode: 'ZZZZ-0000' }]) {
                const refused = await mfaSetup(bearer, body);
                expect({ body, status: refused.status, code: refused.body.code }).toEqual({ body, status: 401, code: 'MFA_CODE_REQUIRED' });
            }
            expect((await factor(staff.id)).twoFactorBackupCodes).toEqual(hashes(OLD_CODES.slice(1)));

            const started = await mfaSetup(bearer, { backupCode: OLD_CODES[1] });
            expect(started.status).toBe(200);
            expect(started.body.data).toEqual(expect.objectContaining({ reenrol: true, method: 'BACKUP_CODE' }));
            expect(started.body.data.backupCodes).toHaveLength(10);
            expect(started.body.data.secret).not.toBe(oldSecret);
            const mid = await factor(staff.id);
            expect(mid.twoFactorSecret).toBe(oldSecret);
            expect(mid.twoFactorBackupCodes).toEqual(hashes(OLD_CODES.slice(2)));

            const again = await mfaSetup(bearer, { backupCode: OLD_CODES[1] });
            expect(again.status).toBe(401);
            expect(again.body.code).toBe('MFA_CODE_REQUIRED');

            const oneAddress = freshIp();
            const statuses = [];
            for (let i = 0; i < 6; i += 1) {
                const res = await request(app).post('/api/mfa/setup').set('Authorization', bearer).set('x-test-ip', oneAddress).send({ backupCode: 'ZZZZ-0001' });
                statuses.push(res.status);
            }
            expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
            expect((await factor(staff.id)).twoFactorBackupCodes).toEqual(hashes(OLD_CODES.slice(2)));

            fx.rebind = { bearer, newSecret: started.body.data.secret, newCodes: started.body.data.backupCodes };
        });

        test('confirming the new device moves the factor in one transaction: the old app and the old codes stop working, the new ones work, the audit row names the method and a masked address, and the notice reaches the owner despite the mute', async () => {
            const { bearer, newSecret, newCodes } = fx.rebind;
            const startedAt = Date.now();

            const unconfirmed = await mfaVerifySetup(bearer, { code: mfaService.generateTOTP(newSecret) });
            expect(unconfirmed.status).toBe(400);
            expect(unconfirmed.body.code).toBe('MFA_BACKUP_CODES_NOT_CONFIRMED');
            expect((await factor(staff.id)).twoFactorSecret).toBe(oldSecret);

            const ip = freshIp();
            const done = await mfaVerifySetup(bearer, { code: mfaService.generateTOTP(newSecret), backupCodesSaved: true }, ip);
            expect(done.status).toBe(200);
            expect(done.body.data.method).toBe('BACKUP_CODE');
            expect(done.body.data.backupCodes).toBeUndefined();

            const after = await factor(staff.id);
            expect(after.twoFactorEnabled).toBe(true);
            expect(after.twoFactorSecret).toBe(newSecret);
            expect(after.twoFactorBackupCodes).toEqual(hashes(newCodes));
            expect(after.sessionsRevokedAt).toBeInstanceOf(Date);
            await untilAfter(after.sessionsRevokedAt);

            expect((await signIn(staff, { code: mfaService.generateTOTP(oldSecret) })).status).toBe(401);
            expect((await signIn(staff, { code: OLD_CODES[5], isBackupCode: true })).status).toBe(401);
            expect((await signIn(staff, { code: mfaService.generateTOTP(newSecret) })).status).toBe(200);
            expect((await signIn(staff, { code: newCodes[0], isBackupCode: true })).status).toBe(200);
            expect((await factor(staff.id)).twoFactorBackupCodes).toEqual(hashes(newCodes.slice(1)));

            const audit = await raw.auditLog.findFirst({ where: { action: 'MFA_REENROLLED', resourceId: staff.id }, orderBy: { createdAt: 'desc' } });
            expect(audit).toBeTruthy();
            expect(audit.actorId).toBe(staff.id);
            expect(audit.category).toBe('SECURITY');
            expect(audit.organizationId).toBe(fx.orgId);
            expect(audit.ipAddress).toBe(maskedPrefix(ip));
            expect(audit.createdAt.getTime()).toBeGreaterThanOrEqual(startedAt - 1000);
            const metadata = JSON.parse(audit.metadata);
            expect(metadata).toEqual(expect.objectContaining({ method: 'BACKUP_CODE', methodLabel: 'รหัสสำรอง', otherSessionsRevoked: true }));
            expect(new Date(metadata.movedAt).getTime()).toBeGreaterThanOrEqual(startedAt - 1000);
            expect(JSON.stringify(audit)).not.toContain(ip);

            const notice = await raw.notification.findFirst({ where: { userId: staff.id, type: 'SECOND_FACTOR_MOVED' } });
            expect(notice).toBeTruthy();
            expect(notice.organizationId).toBe(fx.orgId);
            expect(notice.message).toContain('รหัสสำรอง');
            expect(notice.message).toContain(maskedPrefix(ip));
            expect(notice.message).toContain('หากไม่ใช่คุณ');
            expect(notice.message).not.toContain(ip);
            expect(notice.message).not.toContain(newSecret);
        });
    });
});

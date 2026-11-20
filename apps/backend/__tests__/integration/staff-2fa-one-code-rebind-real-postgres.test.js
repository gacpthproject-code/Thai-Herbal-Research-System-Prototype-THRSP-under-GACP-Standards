'use strict';

/**
 * รอบ 3 ของ chore/staff-2fa-golive: รหัสสำรอง 1 รหัสพอสำหรับทาง ก (คำสั่ง 89 ก · ข้อแนะนำ A ของผู้ตรวจอิสระ)
 * รหัสสำรองใช้ได้ครั้งเดียวแม้ยิงพร้อมกัน (M1) · เจ้าหน้าที่ปิด 2FA เองไม่ได้ขณะธงเปิด (L3) · บัญชีที่ค้างวิธี EMAIL
 * ลงทะเบียน TOTP ใหม่ได้ (I6) · ตั๋วลงทะเบียน 15 นาที หมดเวลาแล้วบอกว่าหมดเวลา (ไม่ใช่รหัสผิด) และยาม
 * ของตั๋วอ่านเฉพาะตั๋ว ตรวจ epoch และสถานะบัญชี (I3)
 *
 * Postgres จริง · ประตูรหัสผ่านเจ้าหน้าที่และ /api/mfa ตัวจริงผ่าน supertest · ช่องพักและหลักฐานการเข้าสู่ระบบ
 * อยู่ในหน่วยความจำ เว้นแต่ตั้ง GACP_TEST_REDIS_URL
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
const { sessionEpochStamp } = require('../../utils/session-epoch');
const jwtConfig = require('../../config/jwt-security');

const mockPending = new Map();
const mockAttempts = new Map();
jest.mock('../../services/auth/mfa-reenrol-store', () => {
    if (process.env.GACP_TEST_REDIS_URL) { return jest.requireActual('../../services/auth/mfa-reenrol-store'); }
    const MAX_FAILED_CODES = 5;
    return {
        MAX_FAILED_CODES,
        keyFor: (userId) => `mfa:reenrol:${userId}`,
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
const mockProofs = new Map();
jest.mock('../../services/auth/mfa-rebind-proof-store', () => {
    if (process.env.GACP_TEST_REDIS_URL) { return jest.requireActual('../../services/auth/mfa-rebind-proof-store'); }
    return {
        REBIND_PROOF_TTL_SECONDS: 600,
        keyFor: (userId) => `mfa:rebind-proof:${userId}`,
        grant: jest.fn(async (userId, session) => { mockProofs.set(userId, { session, expiresAt: Date.now() + 600000 }); }),
        peek: jest.fn(async (userId, session) => {
            const entry = mockProofs.get(userId);
            return Boolean(entry && entry.session === session && entry.expiresAt > Date.now());
        }),
        consume: jest.fn(async (userId, session) => {
            const entry = mockProofs.get(userId);
            if (!entry || entry.session !== session || entry.expiresAt <= Date.now()) { return false; }
            mockProofs.delete(userId);
            return true;
        }),
        clear: jest.fn(async (userId) => { mockProofs.delete(userId); }),
    };
});
jest.mock('../../config/redis', () => null);

const PASSWORD = 'Gacp#OneCode2026x';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);
const STAFF_DOOR = '/api/auth/provider/me/notification-prefs';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const hashes = (codes) => codes.map((code) => mfaService.hashBackupCode(code));
const payload = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));

function thaiNationalId() {
    const digits = Array.from({ length: 12 }, () => crypto.randomInt(0, 10));
    digits[0] = crypto.randomInt(1, 9);
    const sum = digits.reduce((acc, digit, i) => acc + digit * (13 - i), 0);
    digits.push((11 - (sum % 11)) % 10);
    return digits.join('');
}

d('round 3: one backup code moves the factor; codes are single-use under concurrency; staff cannot self-disable; retired-method accounts re-enrol; the setup ticket (real Postgres, real HTTP)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    let envBackup;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { userIds: [], orgId: null };
    let seq = 0;
    let ipSeq = 0;
    const freshIp = () => { ipSeq += 1; return `10.${60 + Math.floor(ipSeq / 250)}.3.${ipSeq % 250}`; };

    async function account(role, { secret = null, backupCodes = [], twoFactorMethod = 'TOTP', twoFactorEnabled = Boolean(secret), status = 'ACTIVE' } = {}) {
        seq += 1;
        const id = crypto.randomUUID();
        const nationalId = thaiNationalId();
        await raw.user.create({
            data: {
                id, canonicalId: `s2fa-oc-${seq}-${sfx}`, password: PASSWORD_HASH, role, status,
                email: `s2fa-oc-${seq}-${sfx}@example.test`, firstName: `ชื่อ${seq}`, lastName: `สกุล${sfx}`,
                organizationId: fx.orgId, idCardHmac: computeLookupHmac(nationalId),
                accountType: 'PROVIDER', authType: 'PROVIDER_ID', providerId: nationalId, providerIdHash: sha256(nationalId),
                twoFactorEnabled, twoFactorMethod, twoFactorSecret: secret, twoFactorBackupCodes: hashes(backupCodes),
            },
        });
        fx.userIds.push(id);
        return { id, role, nationalId, secret };
    }

    const login = (user, ip = freshIp()) => request(app).post('/api/auth/provider/login').set('x-test-ip', ip)
        .send({ providerId: user.nationalId, password: PASSWORD });
    async function challenge(user) {
        const ip = freshIp();
        const first = await login(user, ip);
        expect(first.body.data.mfa_required).toBe(true);
        return { ip, mfaSession: first.body.data.mfa_session };
    }
    const verify = (c, code, isBackupCode = false) => request(app).post('/api/mfa/verify').set('x-test-ip', c.ip).send({ mfa_session: c.mfaSession, code, isBackupCode });
    async function signIn(user, { code, isBackupCode = false }) {
        const res = await verify(await challenge(user), code, isBackupCode);
        expect(res.status).toBe(200);
        return res.body.data.token;
    }
    const bearer = (token) => `Bearer ${token}`;
    const status = (token) => request(app).get('/api/mfa/status').set('Authorization', bearer(token));
    const mfaSetup = (token, body, ip = freshIp()) => request(app).post('/api/mfa/setup').set('Authorization', bearer(token)).set('x-test-ip', ip).send(body);
    const mfaVerifySetup = (token, body) => request(app).post('/api/mfa/verify-setup').set('Authorization', bearer(token)).set('x-test-ip', freshIp()).send(body);
    const disable = (token, code) => request(app).delete('/api/mfa/disable').set('Authorization', bearer(token)).set('x-test-ip', freshIp()).send({ code });
    const door = (token) => request(app).get(STAFF_DOOR).set('Authorization', bearer(token));
    const factor = (id) => raw.user.findUnique({ where: { id }, select: { twoFactorEnabled: true, twoFactorSecret: true, twoFactorMethod: true, twoFactorBackupCodes: true } });
    const codesLeft = async (id) => (await factor(id)).twoFactorBackupCodes;
    const ticketFor = (user, expiresIn) => jwtConfig.generateToken({ id: user.id, purpose: 'mfa_setup' }, 'provider', { expiresIn });
    async function untilAfter(revokedAt) {
        const wait = revokedAt.getTime() - Date.now();
        if (wait > 0) { await new Promise((resolve) => setTimeout(resolve, wait + 50)); }
    }
    async function expireProof(userId) {
        if (process.env.GACP_TEST_REDIS_URL) {
            const redisService = require('../../services/redis-service');
            const key = require('../../services/auth/mfa-rebind-proof-store').keyFor(userId);
            const entry = await redisService.getStrict(key);
            await redisService.setStrict(key, { ...entry, expiresAt: Date.now() - 1000 }, 60);
            return;
        }
        mockProofs.get(userId).expiresAt = Date.now() - 1000;
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
            data: { name: `หน่วยงานทดสอบรหัสเดียว ${sfx}`, slug: `s2fa-oc-${sfx}`, code: `S2FAOC_${sfx.toUpperCase()}` },
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

    describe('one backup code is enough (order 89 ก, review option A)', () => {
        test('the sign-in with a backup code proves the move: status says so, /setup accepts the proof once and consumes no second code, a reuse and an expired proof are refused, a TOTP sign-in holds no proof', async () => {
            const CODES = mfaService.generateBackupCodes(10);
            const staff = await account(CANONICAL_ROLES.DOCUMENT_REVIEWER, { secret: mfaService.generateSecret(), backupCodes: CODES });
            const byCode = await signIn(staff, { code: CODES[0], isBackupCode: true });
            const byTotp = await signIn(staff, { code: mfaService.generateTOTP(staff.secret) });
            expect(await codesLeft(staff.id)).toEqual(hashes(CODES.slice(1)));

            expect((await status(byCode)).body.data).toEqual(expect.objectContaining({ enabled: true, rebindProofAvailable: true }));
            expect((await status(byTotp)).body.data).toEqual(expect.objectContaining({ enabled: true, rebindProofAvailable: false }));

            const fromTotp = await mfaSetup(byTotp, { useSignInProof: true });
            expect({ status: fromTotp.status, code: fromTotp.body.code }).toEqual({ status: 401, code: 'MFA_CODE_REQUIRED' });

            const started = await mfaSetup(byCode, { useSignInProof: true });
            expect(started.status).toBe(200);
            expect(started.body.data).toEqual(expect.objectContaining({ reenrol: true, method: 'BACKUP_CODE' }));
            expect(started.body.data.backupCodes).toHaveLength(10);
            expect(await codesLeft(staff.id)).toEqual(hashes(CODES.slice(1)));
            expect((await status(byCode)).body.data.rebindProofAvailable).toBe(false);

            const again = await mfaSetup(byCode, { useSignInProof: true });
            expect({ status: again.status, code: again.body.code }).toEqual({ status: 401, code: 'MFA_CODE_REQUIRED' });

            const done = await mfaVerifySetup(byCode, { code: mfaService.generateTOTP(started.body.data.secret), backupCodesSaved: true });
            expect(done.status).toBe(200);
            expect(done.body.data.method).toBe('BACKUP_CODE');
            const audit = await raw.auditLog.findFirst({ where: { action: 'MFA_REENROLLED', resourceId: staff.id }, orderBy: { createdAt: 'desc' } });
            expect(JSON.parse(audit.metadata).method).toBe('BACKUP_CODE');

            // The move stamped the epoch (next whole second, order 93 item 4): a challenge minted in
            // that same second is refused by design, so the next sign-in waits for the epoch to pass.
            await untilAfter((await raw.user.findUnique({ where: { id: staff.id }, select: { sessionsRevokedAt: true } })).sessionsRevokedAt);
            const later = await signIn(staff, { code: started.body.data.backupCodes[0], isBackupCode: true });
            await expireProof(staff.id);
            const expired = await mfaSetup(later, { useSignInProof: true });
            expect({ status: expired.status, code: expired.body.code }).toEqual({ status: 401, code: 'MFA_CODE_REQUIRED' });
            expect((await status(later)).body.data.rebindProofAvailable).toBe(false);
        });

        test('a proof request counts in the /setup limiter like a code', async () => {
            const staff = await account(CANONICAL_ROLES.DISPATCHER, { secret: mfaService.generateSecret(), backupCodes: [] });
            const session = await signIn(staff, { code: mfaService.generateTOTP(staff.secret) });
            const oneAddress = freshIp();
            const statuses = [];
            for (let i = 0; i < 6; i += 1) { statuses.push((await mfaSetup(session, { useSignInProof: true }, oneAddress)).status); }
            expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
        });
    });

    describe('M1: a backup code is consumed exactly once, whatever runs in parallel', () => {
        test('/setup: the same code twice at once gives one 200 and one 401; two different codes at once both vanish from the row', async () => {
            const CODES = mfaService.generateBackupCodes(10);
            const staff = await account(CANONICAL_ROLES.FIELD_INSPECTOR, { secret: mfaService.generateSecret(), backupCodes: CODES });
            const session = await signIn(staff, { code: mfaService.generateTOTP(staff.secret) });

            const same = await Promise.all([mfaSetup(session, { backupCode: CODES[0] }), mfaSetup(session, { backupCode: CODES[0] })]);
            expect(same.map((r) => r.status).sort()).toEqual([200, 401]);
            expect(await codesLeft(staff.id)).toEqual(hashes(CODES.slice(1)));

            const different = await Promise.all([mfaSetup(session, { backupCode: CODES[1] }), mfaSetup(session, { backupCode: CODES[2] })]);
            expect(different.map((r) => r.status)).toEqual([200, 200]);
            expect(await codesLeft(staff.id)).toEqual(hashes(CODES.slice(3)));
            expect((await signIn(staff, { code: CODES[3], isBackupCode: true })).length).toBeGreaterThan(0);
            const reused = await verify(await challenge(staff), CODES[1], true);
            expect(reused.status).toBe(401);
        });

        test('/verify: the same code on two challenges at once signs in once', async () => {
            const CODES = mfaService.generateBackupCodes(4);
            const staff = await account(CANONICAL_ROLES.CERTIFICATE_APPROVER, { secret: mfaService.generateSecret(), backupCodes: CODES });
            const [c1, c2] = [await challenge(staff), await challenge(staff)];
            const results = await Promise.all([verify(c1, CODES[0], true), verify(c2, CODES[0], true)]);
            expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
            expect(await codesLeft(staff.id)).toEqual(hashes(CODES.slice(1)));
        });
    });

    describe('L3: a staff member cannot turn 2FA off while the flag is on', () => {
        test('DELETE /disable answers 403 with a Thai pointer to path ก even with the right code; status says disableAllowed false; the flag off keeps the old behaviour', async () => {
            const staff = await account(CANONICAL_ROLES.FINANCE_OFFICER_DTAM, { secret: mfaService.generateSecret() });
            const session = await signIn(staff, { code: mfaService.generateTOTP(staff.secret) });
            expect((await status(session)).body.data.disableAllowed).toBe(false);
            const refused = await disable(session, mfaService.generateTOTP(staff.secret));
            expect({ status: refused.status, code: refused.body.code }).toEqual({ status: 403, code: 'MFA_DISABLE_NOT_FOR_STAFF' });
            expect(refused.body.errorTh).toMatch(/ย้าย/);
            expect((await factor(staff.id)).twoFactorEnabled).toBe(true);
            expect((await door(session)).status).toBe(200);

            process.env.REQUIRE_MFA_FOR_PRIVILEGED = 'false';
            try {
                expect((await status(session)).body.data.disableAllowed).toBe(true);
                const wrong = await disable(session, '000000');
                expect(wrong.status).toBe(401);
                expect((await factor(staff.id)).twoFactorEnabled).toBe(true);
                expect((await disable(session, mfaService.generateTOTP(staff.secret))).status).toBe(200);
                expect((await factor(staff.id)).twoFactorEnabled).toBe(false);
            } finally {
                process.env.REQUIRE_MFA_FOR_PRIVILEGED = 'true';
            }
        });
    });

    describe('I6: an account left on the retired EMAIL method', () => {
        test('gets the setup ticket and enrols a TOTP at its next sign-in instead of being stuck', async () => {
            const stuck = await account(CANONICAL_ROLES.DOCUMENT_REVIEWER, { twoFactorEnabled: true, twoFactorMethod: 'EMAIL' });
            const first = await login(stuck);
            expect(first.body.data.mfa_setup_required).toBe(true);
            const ticket = first.body.data.setup_token;
            const setup = await mfaSetup(ticket, {});
            expect({ status: setup.status, hasSecret: typeof setup.body.data?.secret === 'string' }).toEqual({ status: 200, hasSecret: true });
            const enabled = await mfaVerifySetup(ticket, { code: mfaService.generateTOTP(setup.body.data.secret), backupCodesSaved: true });
            expect(enabled.status).toBe(200);
            const after = await factor(stuck.id);
            expect({ enabled: after.twoFactorEnabled, method: after.twoFactorMethod, secret: after.twoFactorSecret }).toEqual({ enabled: true, method: 'TOTP', secret: setup.body.data.secret });
            expect((await signIn(stuck, { code: mfaService.generateTOTP(setup.body.data.secret) })).length).toBeGreaterThan(0);
        });
    });

    describe('the setup ticket (I3 and section 6)', () => {
        test('the login door issues a 15-minute ticket', async () => {
            const staff = await account(CANONICAL_ROLES.DISPATCHER);
            const first = await login(staff);
            const claims = payload(first.body.data.setup_token);
            expect(claims.exp - claims.iat).toBe(15 * 60);
        });

        test('an expired ticket is told in Thai that time ran out, never that the code is wrong', async () => {
            const staff = await account(CANONICAL_ROLES.DISPATCHER);
            const expired = ticketFor(staff, -1);
            const res = await mfaSetup(expired, {});
            expect({ status: res.status, code: res.body.code }).toEqual({ status: 401, code: 'MFA_SETUP_TICKET_EXPIRED' });
            expect(res.body.errorTh).toMatch(/หมดเวลา/);
            expect(res.body.errorTh).toMatch(/เข้าสู่ระบบ/);
            expect(res.body.errorTh).not.toMatch(/รหัส.*ไม่ถูกต้อง/);
            const verify2 = await mfaVerifySetup(expired, { code: '123456', backupCodesSaved: true });
            expect(verify2.body.code).toBe('MFA_SETUP_TICKET_EXPIRED');
        });

        test('a ticket issued before the account epoch is refused, and so is a disabled account\'s ticket', async () => {
            const staff = await account(CANONICAL_ROLES.DISPATCHER);
            const ticket = (await login(staff)).body.data.setup_token;
            const stamp = sessionEpochStamp();
            await raw.user.update({ where: { id: staff.id }, data: { sessionsRevokedAt: stamp } });
            await untilAfter(stamp);
            const revoked = await mfaSetup(ticket, {});
            expect({ status: revoked.status, code: revoked.body.code }).toEqual({ status: 401, code: 'TOKEN_REVOKED' });
            expect((await factor(staff.id)).twoFactorSecret).toBeNull();

            const disabled = await account(CANONICAL_ROLES.DISPATCHER);
            const ticket2 = (await login(disabled)).body.data.setup_token;
            await raw.user.update({ where: { id: disabled.id }, data: { status: 'INACTIVE' } });
            const refused = await mfaSetup(ticket2, {});
            expect(refused.status).toBeGreaterThanOrEqual(401);
            expect(refused.status).toBeLessThanOrEqual(403);
            expect((await factor(disabled.id)).twoFactorSecret).toBeNull();
        });

        test('the guard reads the ticket in the Authorization header, not a provider_token cookie of another account', async () => {
            const other = await account(CANONICAL_ROLES.DOCUMENT_REVIEWER, { secret: mfaService.generateSecret() });
            const otherSession = await signIn(other, { code: mfaService.generateTOTP(other.secret) });
            const newcomer = await account(CANONICAL_ROLES.DISPATCHER);
            const ticket = (await login(newcomer)).body.data.setup_token;
            const res = await request(app).post('/api/mfa/setup').set('Authorization', bearer(ticket)).set('Cookie', `provider_token=${otherSession}`).set('x-test-ip', freshIp()).send({});
            expect(res.status).toBe(200);
            expect((await factor(newcomer.id)).twoFactorSecret).toBe(res.body.data.secret);
            expect((await factor(other.id)).twoFactorSecret).toBe(other.secret);
        });
    });
});

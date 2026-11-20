'use strict';

/**
 * คำสั่ง operator 93 (2026-10-20): ทาง ข ตัดการเข้าสู่ระบบและ token ที่ค้างอยู่ทั้งหมดของบัญชี · ทาง ก ตัดทุกเครื่อง
 * ยกเว้นเครื่องที่กำลังย้าย · บันทึกการตัดไว้ในแถว audit เดียวกับการล้างหรือการย้าย · ผู้ดูแลระบบฝั่งเดียวกัน
 * ได้รับแจ้งทุกครั้งที่ย้าย และเมื่อลงทะเบียนใหม่ครั้งแรกหลังทาง ข (ผลตรวจอิสระ M2, M3, L2)
 *
 * Postgres จริง · ประตูรหัสผ่านเจ้าหน้าที่ · /api/mfa · /api/auth/health/refresh · /api/notifications ตัวจริง
 * ผ่าน supertest · ช่องพักการย้ายและ blocklist อยู่ในหน่วยความจำ เว้นแต่ตั้ง GACP_TEST_REDIS_URL
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
// Without Redis every /refresh fails closed on the blocklist read (503) and the door's own
// rules would never run; a healthy in-memory blocklist lets the epoch and role gates answer.
jest.mock('../../services/token-revocation-service', () => {
    if (process.env.GACP_TEST_REDIS_URL) { return jest.requireActual('../../services/token-revocation-service'); }
    const actual = jest.requireActual('../../services/token-revocation-service');
    return {
        ...actual,
        issueRefreshToken: jest.fn(async () => require('crypto').randomBytes(32).toString('hex')),
        isRefreshTokenBlocklisted: jest.fn(async () => false),
        isSessionFamilyBlocklisted: jest.fn(async () => false),
        blocklistRefreshToken: jest.fn(async () => undefined),
        blocklistAccessToken: jest.fn(async () => undefined),
        isAccessTokenBlocklisted: jest.fn(async () => false),
        invalidateSessionFamily: jest.fn(async () => undefined),
        revokeAllUserTokens: jest.fn(async () => undefined),
    };
});
jest.mock('../../config/redis', () => null);

const BACKEND = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(BACKEND, 'scripts', 'ops', 'staff-2fa-emergency-reset.js');
const FLAG_ON_SCRIPT = path.join(BACKEND, 'scripts', 'ops', 'staff-sessions-revoke-at-flag-on.js');
const REPORT_SCRIPT = path.join(BACKEND, 'scripts', 'ops', 'staff-first-signin-report.js');
const ROSTER_SCRIPT = path.join(BACKEND, 'scripts', 'ops', 'staff-mfa-roster.js');
const PASSWORD = 'Gacp#Revoke2026x';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);
const STAFF_DOOR = '/api/auth/provider/me/notification-prefs';
const ADMIN_NOTICE = 'STAFF_SECOND_FACTOR_CHANGED';

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

d('order 93: a 2FA clear or move leaves no old sign-in alive (real Postgres, real HTTP)', () => {
    /** @type {import('@prisma/client').PrismaClient} */
    let raw;
    let app;
    let envBackup;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { userIds: [], orgIds: [] };
    const orgs = {};
    const who = {};
    let seq = 0;
    let ipSeq = 0;
    const freshIp = () => { ipSeq += 1; return `10.${40 + Math.floor(ipSeq / 250)}.9.${ipSeq % 250}`; };

    async function organization(label) {
        const row = await raw.organization.create({
            data: { name: `หน่วยงาน ${label} ${sfx}`, slug: `s2fa-rv-${label}-${sfx}`.toLowerCase(), code: `S2FARV_${label}_${sfx}`.toUpperCase() },
        });
        fx.orgIds.push(row.id);
        return row.id;
    }

    async function account(role, organizationId, { secret = null, backupCodes = [] } = {}) {
        seq += 1;
        const id = crypto.randomUUID();
        const nationalId = thaiNationalId();
        await raw.user.create({
            data: {
                id, canonicalId: `s2fa-rv-${seq}-${sfx}`, password: PASSWORD_HASH, role, status: 'ACTIVE',
                email: `s2fa-rv-${seq}-${sfx}@example.test`, firstName: `ชื่อ${seq}`, lastName: `สกุล${sfx}`,
                organizationId, idCardHmac: computeLookupHmac(nationalId),
                accountType: 'PROVIDER', authType: 'PROVIDER_ID', providerId: nationalId, providerIdHash: sha256(nationalId),
                ...(secret ? { twoFactorEnabled: true, twoFactorMethod: 'TOTP', twoFactorSecret: secret, twoFactorBackupCodes: hashes(backupCodes) } : {}),
            },
        });
        fx.userIds.push(id);
        return { id, role, organizationId, nationalId, secret };
    }

    async function passwordOnlySession() {
        process.env.REQUIRE_MFA_FOR_PRIVILEGED = 'false';
        try {
            const res = await login(await account(CANONICAL_ROLES.DISPATCHER, orgs.a));
            expect(typeof res.body.data.token).toBe('string');
        } finally {
            process.env.REQUIRE_MFA_FOR_PRIVILEGED = 'true';
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
    }

    const login = (user, ip = freshIp()) => request(app).post('/api/auth/provider/login').set('x-test-ip', ip)
        .send({ providerId: user.nationalId, password: PASSWORD });
    async function challenge(user) {
        const ip = freshIp();
        const first = await login(user, ip);
        expect(first.status).toBe(200);
        expect(first.body.data.mfa_required).toBe(true);
        return { ip, mfaSession: first.body.data.mfa_session };
    }
    async function signIn(user, { code, isBackupCode = false }) {
        const { ip, mfaSession } = await challenge(user);
        const res = await request(app).post('/api/mfa/verify').set('x-test-ip', ip).send({ mfa_session: mfaSession, code, isBackupCode });
        expect(res.status).toBe(200);
        return res.body.data.token;
    }
    const verifyChallenge = (c, code) => request(app).post('/api/mfa/verify').set('x-test-ip', c.ip).send({ mfa_session: c.mfaSession, code });
    const door = (token) => request(app).get(STAFF_DOOR).set('Authorization', `Bearer ${token}`);
    const inbox = (token) => request(app).get('/api/notifications').set('Authorization', `Bearer ${token}`);
    const mfaSetup = (token, body) => request(app).post('/api/mfa/setup').set('Authorization', `Bearer ${token}`).set('x-test-ip', freshIp()).send(body);
    const mfaVerifySetup = (token, body) => request(app).post('/api/mfa/verify-setup').set('Authorization', `Bearer ${token}`).set('x-test-ip', freshIp()).send(body);
    const refresh = (refreshToken) => request(app).post('/api/auth/health/refresh').send({ refreshToken });
    const forgedRefreshToken = (user) => jwtConfig.generateRefreshToken({
        id: user.id, role: user.role, canonicalRole: user.role, authType: 'PROVIDER_ID', userType: 'PROVIDER_ID',
        organizationId: user.organizationId, sessionFamilyId: crypto.randomUUID(),
    }, 'public');
    const row = (id) => raw.user.findUnique({ where: { id }, select: { twoFactorEnabled: true, twoFactorSecret: true, twoFactorMethod: true, twoFactorBackupCodes: true, sessionsRevokedAt: true } });
    const adminNotices = (userIds) => raw.notification.findMany({ where: { type: ADMIN_NOTICE, userId: { in: userIds } }, orderBy: { createdAt: 'asc' } });
    async function untilAfter(revokedAt) {
        const wait = revokedAt.getTime() - Date.now();
        if (wait > 0) { await new Promise((resolve) => setTimeout(resolve, wait + 50)); }
    }
    function runReset(target, requester) {
        const env = { ...process.env, REQUIRE_MFA_FOR_PRIVILEGED: 'true' };
        if (process.env.GACP_TEST_REDIS_URL) { env.REDIS_URL = process.env.GACP_TEST_REDIS_URL; }
        const result = spawnSync(process.execPath, [SCRIPT, '--target', target.id, '--requester', requester.id,
            '--confirmation', 'บันทึกข้อความ ที่ สธ 0509/ว321', '--approval', 'operator 2026-10-20 แชต 23:10 อนุมัติ'], {
            cwd: BACKEND, encoding: 'utf8', timeout: 120000, env,
        });
        return { status: result.status, stdout: (result.stdout || '').trim(), stderr: (result.stderr || '').trim() };
    }

    beforeAll(async () => {
        envBackup = { ...process.env };
        process.env.REQUIRE_MFA_FOR_PRIVILEGED = 'true';
        if (process.env.GACP_TEST_REDIS_URL) {
            process.env.REDIS_URL = process.env.GACP_TEST_REDIS_URL;
            await require('../../services/redis-service').connect();
        }
        raw = new PrismaClient();
        await raw.auditLog.deleteMany({ where: { action: { in: ['STAFF_SESSIONS_REVOKED_AT_FLAG_ON', 'STAFF_MFA_FLAG_ROLLED_BACK'] } } });
        orgs.a = await organization('A');
        orgs.b = await organization('B');
        who.dtamAdminA1 = await account(CANONICAL_ROLES.SYSTEM_ADMIN_DTAM, orgs.a);
        who.dtamAdminA2 = await account(CANONICAL_ROLES.SYSTEM_ADMIN_DTAM, orgs.a);
        who.dtamAdminB = await account(CANONICAL_ROLES.SYSTEM_ADMIN_DTAM, orgs.b);
        who.platformAdmin = await account(CANONICAL_ROLES.SYSTEM_ADMIN_PLATFORM, orgs.b);
        app = express();
        app.use(express.json());
        app.use(cookieParser());
        app.use((req, _res, next) => { req.clientIp = req.headers['x-test-ip'] || '10.0.0.1'; next(); });
        app.use('/api/auth/provider', require('../../routes/api/auth/auth-provider'));
        app.use('/api/auth/health', require('../../routes/api/auth/auth-health'));
        app.use('/api/mfa', require('../../routes/api/identity/mfa'));
        app.use('/api/notifications', require('../../routes/api/system/notifications'));
    });

    afterAll(async () => {
        if (raw) {
            await raw.notification.deleteMany({ where: { userId: { in: fx.userIds } } });
            if (fx.orgIds.length) { await raw.auditLog.deleteMany({ where: { organizationId: { in: fx.orgIds } } }); }
            await raw.auditLog.deleteMany({ where: { action: { in: ['STAFF_SESSIONS_REVOKED_AT_FLAG_ON', 'STAFF_MFA_FLAG_ROLLED_BACK'] } } });
            await raw.user.deleteMany({ where: { id: { in: fx.userIds } } });
            for (const id of fx.orgIds) { await raw.organization.delete({ where: { id } }).catch(() => {}); }
            await raw.$disconnect();
        }
        for (const key of Object.keys(process.env)) {
            if (!(key in envBackup)) { delete process.env[key]; }
        }
        Object.assign(process.env, envBackup);
    });

    describe('path ข (order 93 items 1-3)', () => {
        test('after the script, both devices, the pending challenge, a refresh token and the re-bind slot are dead; the audit row records it; the next sign-in enrols and the same-side admins are told', async () => {
            const target = await account(CANONICAL_ROLES.DOCUMENT_REVIEWER, orgs.a, { secret: mfaService.generateSecret() });
            const totp = () => mfaService.generateTOTP(target.secret);
            const device1 = await signIn(target, { code: totp() });
            const device2 = await signIn(target, { code: totp() });
            const pending = await challenge(target);
            const refreshToken = forgedRefreshToken(target);
            const slot = await mfaSetup(device1, { code: totp() });
            expect(slot.status).toBe(200);
            expect((await door(device1)).status).toBe(200);
            expect((await door(device2)).status).toBe(200);
            expect((await inbox(device2)).status).toBe(200);
            if (process.env.GACP_TEST_REDIS_URL) {
                const redisService = require('../../services/redis-service');
                expect(await redisService.getStrict(`mfa:reenrol:${target.id}`)).not.toBeNull();
            }
            const startedAt = Date.now();

            const run = runReset(target, who.dtamAdminA1);
            expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: '' });
            expect(run.stdout).toContain('ตัดการเข้าสู่ระบบ');
            const after = await row(target.id);
            expect(after.twoFactorEnabled).toBe(false);
            expect(after.sessionsRevokedAt).toBeInstanceOf(Date);
            expect(after.sessionsRevokedAt.getTime()).toBeGreaterThanOrEqual(startedAt);
            await untilAfter(after.sessionsRevokedAt);

            expect({ door1: (await door(device1)).body.code, door2: (await door(device2)).body.code, inbox2: (await inbox(device2)).status })
                .toEqual({ door1: 'TOKEN_REVOKED', door2: 'TOKEN_REVOKED', inbox2: 401 });
            // M2: the surviving session can no longer enrol a factor of its own
            expect((await mfaSetup(device1, {})).status).toBe(401);
            expect((await mfaVerifySetup(device1, { code: '000000', backupCodesSaved: true })).status).toBe(401);
            expect((await verifyChallenge(pending, totp())).body.code).toBe('TOKEN_REVOKED');
            expect((await refresh(refreshToken)).status).toBe(401);
            if (process.env.GACP_TEST_REDIS_URL) {
                const redisService = require('../../services/redis-service');
                expect(await redisService.getStrict(`mfa:reenrol:${target.id}`)).toBeNull();
            }

            const audits = await raw.auditLog.findMany({ where: { action: 'MFA_EMERGENCY_RESET', resourceId: target.id } });
            expect(audits).toHaveLength(1);
            const metadata = JSON.parse(audits[0].metadata);
            expect(metadata.cleared).toEqual(['twoFactorEnabled', 'twoFactorSecret', 'twoFactorBackupCodes']);
            expect(new Date(metadata.sessionsRevokedAt).getTime()).toBe(after.sessionsRevokedAt.getTime());
            expect(metadata.revoked).toEqual(expect.objectContaining({ sessions: 'all issued before sessionsRevokedAt' }));
            expect(metadata.revoked.refreshTokensInStore).toBeDefined();
            expect(JSON.stringify(audits[0])).not.toContain(device1.split('.')[2]);

            // the owner enrols again at the next sign-in, and that first enrolment after a clear reaches the same-side admins
            const next = await login(target);
            expect(next.body.data.mfa_setup_required).toBe(true);
            const ticket = next.body.data.setup_token;
            const setup = await mfaSetup(ticket, {});
            expect(setup.status).toBe(200);
            const enabled = await mfaVerifySetup(ticket, { code: mfaService.generateTOTP(setup.body.data.secret), backupCodesSaved: true });
            expect(enabled.status).toBe(200);
            const told = await adminNotices([who.dtamAdminA1.id, who.dtamAdminA2.id, who.dtamAdminB.id, who.platformAdmin.id]);
            expect(told.map((n) => n.userId).sort()).toEqual([who.dtamAdminA1.id, who.dtamAdminA2.id].sort());
            expect(told[0].message).toContain('ลงทะเบียน');
            expect(told[0].message).not.toContain(target.nationalId);
            expect(told[0].message).not.toContain(setup.body.data.secret);
        });

        test('the script refuses an admin who names itself as the target (L2) and changes nothing', async () => {
            const self = await account(CANONICAL_ROLES.SYSTEM_ADMIN_DTAM, orgs.a, { secret: mfaService.generateSecret() });
            const before = await row(self.id);
            const run = runReset(self, self);
            expect(run.status).toBe(2);
            expect(run.stderr).toMatch(/ผู้ขอเป็นบัญชีเป้าหมายเอง/);
            expect(await row(self.id)).toEqual(before);
            expect(await raw.auditLog.count({ where: { action: 'MFA_EMERGENCY_RESET', resourceId: self.id } })).toBe(0);
        });

        test('control: a staff member\'s first enrolment with no clear before it tells no admin', async () => {
            const fresh = await account(CANONICAL_ROLES.DISPATCHER, orgs.a);
            const first = await login(fresh);
            const ticket = first.body.data.setup_token;
            const setup = await mfaSetup(ticket, {});
            const enabled = await mfaVerifySetup(ticket, { code: mfaService.generateTOTP(setup.body.data.secret), backupCodesSaved: true });
            expect(enabled.status).toBe(200);
            const told = await adminNotices([who.dtamAdminA1.id, who.dtamAdminA2.id]);
            expect(told.filter((n) => JSON.stringify(n.metadata || n.data || {}).includes(fresh.id))).toEqual([]);
        });
    });

    describe('path ก (order 93 item 4)', () => {
        test('device A moves the factor; B, the pending challenge and a refresh token die; A keeps a session no longer than the one it had; the audit row and the admin notices record it', async () => {
            const CODES = mfaService.generateBackupCodes(10);
            const oldSecret = mfaService.generateSecret();
            const staff = await account(CANONICAL_ROLES.FIELD_INSPECTOR, orgs.a, { secret: oldSecret, backupCodes: CODES });
            const totp = () => mfaService.generateTOTP(oldSecret);
            const deviceA = await signIn(staff, { code: CODES[0], isBackupCode: true });
            const deviceB = await signIn(staff, { code: totp() });
            const pending = await challenge(staff);
            const refreshToken = forgedRefreshToken(staff);
            expect((await door(deviceA)).status).toBe(200);
            expect((await door(deviceB)).status).toBe(200);
            const beforeNotices = (await adminNotices([who.dtamAdminA1.id])).length;

            const started = await mfaSetup(deviceA, { backupCode: CODES[1] });
            expect(started.status).toBe(200);
            const newSecret = started.body.data.secret;
            const done = await mfaVerifySetup(deviceA, { code: mfaService.generateTOTP(newSecret), backupCodesSaved: true });
            expect(done.status).toBe(200);
            const fresh = done.body.data.token;
            const after = await row(staff.id);
            await untilAfter(after.sessionsRevokedAt);

            expect({ doorB: (await door(deviceB)).body.code, inboxB: (await inbox(deviceB)).status, doorAOld: (await door(deviceA)).body.code })
                .toEqual({ doorB: 'TOKEN_REVOKED', inboxB: 401, doorAOld: 'TOKEN_REVOKED' });
            expect((await door(fresh)).status).toBe(200);
            expect((await inbox(fresh)).status).toBe(200);
            const old = payload(deviceA);
            const kept = payload(fresh);
            expect(kept.exp).toBe(old.exp);
            expect(kept.iat).toBe(Math.floor(after.sessionsRevokedAt.getTime() / 1000));
            expect([kept.role, kept.organizationId]).toEqual([old.role, old.organizationId]);
            expect(done.headers['set-cookie'].find((c) => c.startsWith('provider_token='))).toMatch(/Max-Age=(\d+)/);
            const maxAge = Number(/Max-Age=(\d+)/.exec(done.headers['set-cookie'].find((c) => c.startsWith('provider_token=')))[1]);
            expect(maxAge).toBeLessThanOrEqual(old.exp - kept.iat);
            expect((await verifyChallenge(pending, totp())).body.code).toBe('TOKEN_REVOKED');
            expect((await refresh(refreshToken)).status).toBe(401);

            const audit = await raw.auditLog.findFirst({ where: { action: 'MFA_REENROLLED', resourceId: staff.id }, orderBy: { createdAt: 'desc' } });
            const metadata = JSON.parse(audit.metadata);
            expect(new Date(metadata.sessionsRevokedAt).getTime()).toBe(after.sessionsRevokedAt.getTime());
            expect(metadata.otherSessionsRevoked).toBe(true);
            const owner = await raw.notification.findFirst({ where: { userId: staff.id, type: 'SECOND_FACTOR_MOVED' } });
            expect(owner.message).toContain('ออกจากระบบ');
            expect(owner.message).toContain('ติดต่อผู้ดูแลระบบ');
            const told = await adminNotices([who.dtamAdminA1.id, who.dtamAdminA2.id, who.dtamAdminB.id, who.platformAdmin.id]);
            const mine = told.filter((n) => n.message.includes('ย้าย') && n.createdAt.getTime() >= audit.createdAt.getTime() - 1000);
            expect(mine.map((n) => n.userId).sort()).toEqual([who.dtamAdminA1.id, who.dtamAdminA2.id].sort());
            expect((await adminNotices([who.dtamAdminA1.id])).length).toBe(beforeNotices + 1);
            expect(mine[0].message).not.toContain(newSecret);
            expect(mine[0].message).not.toContain(staff.nationalId);
        });

        test('a company-side move is told to the platform admins, not to the DTAM admins', async () => {
            const CODES = mfaService.generateBackupCodes(10);
            const staff = await account(CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM, orgs.b, { secret: mfaService.generateSecret(), backupCodes: CODES });
            const session = await signIn(staff, { code: CODES[0], isBackupCode: true });
            const started = await mfaSetup(session, { backupCode: CODES[1] });
            expect(started.status).toBe(200);
            const done = await mfaVerifySetup(session, { code: mfaService.generateTOTP(started.body.data.secret), backupCodesSaved: true });
            expect(done.status).toBe(200);
            const told = (await adminNotices([who.dtamAdminA1.id, who.dtamAdminA2.id, who.dtamAdminB.id, who.platformAdmin.id]))
                .filter((n) => n.message.includes(staff.id) || JSON.stringify(n.metadata || {}).includes(staff.id));
            expect(told.map((n) => n.userId)).toEqual([who.platformAdmin.id]);
        });
    });

    describe('order 94 item 2: the flag-on run revokes every staff and admin session', () => {
        function runFlagOn({ flag = 'true', event = 'flag-on' } = {}) {
            const result = spawnSync(process.execPath, [FLAG_ON_SCRIPT, ...(event ? ['--event', event] : []), '--note', 'deploy 2026-10-20 flag on'], {
                cwd: BACKEND, encoding: 'utf8', timeout: 120000, env: { ...process.env, REQUIRE_MFA_FOR_PRIVILEGED: flag },
            });
            return { status: result.status, stdout: (result.stdout || '').trim(), stderr: (result.stderr || '').trim() };
        }
        async function applicant() {
            seq += 1;
            const id = crypto.randomUUID();
            const nationalId = thaiNationalId();
            await raw.user.create({
                data: {
                    id, canonicalId: `s2fa-rv-${seq}-${sfx}`, password: PASSWORD_HASH, role: CANONICAL_ROLES.HEALTH, status: 'ACTIVE',
                    email: `s2fa-rv-${seq}-${sfx}@example.test`, firstName: `เกษตรกร${seq}`, lastName: `สกุล${sfx}`,
                    organizationId: orgs.a, idCardHmac: computeLookupHmac(nationalId),
                    accountType: 'INDIVIDUAL', authType: 'HEALTH_ID', healthId: nationalId, healthIdHash: sha256(nationalId), idCardHash: sha256(nationalId),
                },
            });
            fx.userIds.push(id);
            return { id };
        }

        test('a staff session and an admin session issued before the run are refused after it; one audit row carries the count; applicants are untouched; the flag off refuses the run', async () => {
            const staff = await account(CANONICAL_ROLES.DISPATCHER, orgs.a, { secret: mfaService.generateSecret() });
            const admin = await account(CANONICAL_ROLES.SYSTEM_ADMIN_DTAM, orgs.b, { secret: mfaService.generateSecret() });
            const farmer = await applicant();
            const staffSession = await signIn(staff, { code: mfaService.generateTOTP(staff.secret) });
            const adminSession = await signIn(admin, { code: mfaService.generateTOTP(admin.secret) });
            expect((await door(staffSession)).status).toBe(200);
            expect((await door(adminSession)).status).toBe(200);
            const startedAt = Date.now();

            const refused = runFlagOn({ flag: 'false' });
            expect(refused.status).toBe(2);
            expect(refused.stderr).toMatch(/REQUIRE_MFA_FOR_PRIVILEGED/);
            expect((await door(staffSession)).status).toBe(200);
            const noEvent = runFlagOn({ event: null });
            expect({ status: noEvent.status, stderr: noEvent.stderr }).toMatchObject({ status: 2, stderr: expect.stringMatching(/--event/) });
            expect((await door(staffSession)).status).toBe(200);

            const run = runFlagOn();
            expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: '' });
            expect(run.stdout).toMatch(/ตัดการเข้าสู่ระบบ/);
            const stamped = await row(staff.id);
            expect(stamped.sessionsRevokedAt.getTime()).toBeGreaterThanOrEqual(startedAt);
            expect((await row(admin.id)).sessionsRevokedAt.getTime()).toBe(stamped.sessionsRevokedAt.getTime());
            expect((await raw.user.findUnique({ where: { id: farmer.id }, select: { sessionsRevokedAt: true } })).sessionsRevokedAt).toBeNull();
            await untilAfter(stamped.sessionsRevokedAt);
            expect({ staff: (await door(staffSession)).body.code, admin: (await door(adminSession)).body.code }).toEqual({ staff: 'TOKEN_REVOKED', admin: 'TOKEN_REVOKED' });

            const audits = await raw.auditLog.findMany({ where: { action: 'STAFF_SESSIONS_REVOKED_AT_FLAG_ON' }, orderBy: { createdAt: 'desc' }, take: 1 });
            expect(audits).toHaveLength(1);
            const metadata = JSON.parse(audits[0].metadata);
            expect(metadata.accounts).toBeGreaterThanOrEqual(2);
            expect(new Date(metadata.sessionsRevokedAt).getTime()).toBe(stamped.sessionsRevokedAt.getTime());
            expect(metadata.note).toBe('deploy 2026-10-20 flag on');
            expect(metadata.event).toBe('flag-on');
            expect(run.stdout).toContain(String(metadata.accounts));
            expect(run.stdout).not.toContain(staff.nationalId);

            expect((await signIn(staff, { code: mfaService.generateTOTP(staff.secret) })).length).toBeGreaterThan(0);
        });

        test('order 105 item 4: a second run on the same database is refused, stamps nothing and writes no second audit row', async () => {
            const staff = await account(CANONICAL_ROLES.DISPATCHER, orgs.a, { secret: mfaService.generateSecret() });
            const session = await signIn(staff, { code: mfaService.generateTOTP(staff.secret) });
            expect((await door(session)).status).toBe(200);
            const before = (await row(staff.id)).sessionsRevokedAt;

            const again = runFlagOn();
            expect(again.status).toBe(2);
            expect(again.stderr).toMatch(/ตัด session ตอนเปิดธงไปแล้วเมื่อ .+ รันได้ครั้งเดียวต่อเครื่อง/);
            expect((await row(staff.id)).sessionsRevokedAt).toEqual(before);
            expect(await raw.auditLog.count({ where: { action: 'STAFF_SESSIONS_REVOKED_AT_FLAG_ON' } })).toBe(1);
            expect((await door(session)).status).toBe(200);
        });

        describe('order 108(1): every flag-on revokes, a rollback is the cause of the next one', () => {
            const ON = 'STAFF_SESSIONS_REVOKED_AT_FLAG_ON';
            const OFF = 'STAFF_MFA_FLAG_ROLLED_BACK';
            const flagOn = () => runFlagOn();
            const rollback = () => runFlagOn({ flag: 'false', event: 'flag-off' });
            const trail = async () => (await raw.auditLog.findMany({ where: { action: { in: [ON, OFF] } }, orderBy: { createdAt: 'asc' }, select: { action: true } })).map((r) => r.action);
            const ok = (result) => ({ status: result.status, stderr: result.stderr });

            beforeEach(async () => { await raw.auditLog.deleteMany({ where: { action: { in: [ON, OFF] } } }); });

            test('(a) on → rollback → on revokes twice: a session issued during the rollback dies at the second flag-on, two revoke rows with the rollback row between', async () => {
                const staff = await account(CANONICAL_ROLES.DISPATCHER, orgs.a, { secret: mfaService.generateSecret() });
                expect(ok(rollback())).toEqual({ status: 0, stderr: '' });
                expect(await trail()).toEqual([]);

                expect(ok(flagOn())).toEqual({ status: 0, stderr: '' });
                const first = (await row(staff.id)).sessionsRevokedAt;
                await untilAfter(first);

                expect(runFlagOn({ event: 'flag-off' }).status).toBe(2);
                const back = rollback();
                expect(ok(back)).toEqual({ status: 0, stderr: '' });
                expect(back.stdout).toMatch(/บันทึกการย้อนธง/);
                const duringRollback = await signIn(staff, { code: mfaService.generateTOTP(staff.secret) });
                expect((await door(duringRollback)).status).toBe(200);

                const again = flagOn();
                expect(ok(again)).toEqual({ status: 0, stderr: '' });
                expect(again.stdout).toMatch(/ตัดการเข้าสู่ระบบ/);
                const second = (await row(staff.id)).sessionsRevokedAt;
                expect(second.getTime()).toBeGreaterThan(first.getTime());
                await untilAfter(second);
                expect((await door(duringRollback)).body.code).toBe('TOKEN_REVOKED');
                expect(await trail()).toEqual([ON, OFF, ON]);
            });

            test('(b) on → on refuses the second without stamping or writing a row', async () => {
                const staff = await account(CANONICAL_ROLES.DISPATCHER, orgs.a, { secret: mfaService.generateSecret() });
                expect(ok(flagOn())).toEqual({ status: 0, stderr: '' });
                const stamped = (await row(staff.id)).sessionsRevokedAt;
                const again = flagOn();
                expect(again.status).toBe(2);
                expect(again.stderr).toMatch(/ตัด session ตอนเปิดธงไปแล้วเมื่อ/);
                expect((await row(staff.id)).sessionsRevokedAt).toEqual(stamped);
                expect(await trail()).toEqual([ON]);
            });

            test('review L3: three flag-on runs started together revoke once, five times over: one exit 0, two refused, one revoke row', async () => {
                const { run: flagOnRun } = require(FLAG_ON_SCRIPT);
                const env = { REQUIRE_MFA_FOR_PRIVILEGED: 'true' };
                const trials = [];
                for (let trial = 0; trial < 5; trial += 1) {
                    await raw.auditLog.deleteMany({ where: { action: { in: [ON, OFF] } } });
                    const exits = (await Promise.all([1, 2, 3].map(() => flagOnRun(['--event', 'flag-on', '--note', `concurrency ${trial}`], env)))).map((r) => r.exitCode).sort();
                    trials.push({ exits, trail: await trail() });
                }
                expect(trials).toEqual(Array(5).fill({ exits: [0, 2, 2], trail: [ON] }));
            });

            test('(c) on → rollback → on → on refuses the last; a second rollback in a row records nothing', async () => {
                const staff = await account(CANONICAL_ROLES.DISPATCHER, orgs.a, { secret: mfaService.generateSecret() });
                expect(ok(flagOn())).toEqual({ status: 0, stderr: '' });
                expect(ok(rollback())).toEqual({ status: 0, stderr: '' });
                expect(ok(rollback())).toEqual({ status: 0, stderr: '' });
                expect(ok(flagOn())).toEqual({ status: 0, stderr: '' });
                const stamped = (await row(staff.id)).sessionsRevokedAt;
                const last = flagOn();
                expect(last.status).toBe(2);
                expect((await row(staff.id)).sessionsRevokedAt).toEqual(stamped);
                expect(await trail()).toEqual([ON, OFF, ON]);
            });
        });
    });

    describe('order 94 item 5: the first-sign-in report reads the audit trail', () => {
        test('an account that enrolled before its first session passes, one that held a session before enrolling fails, one that never signed in is listed as such', async () => {
            // The report counts from the first PROVIDER_LOGIN_SESSION_ISSUED row; accounts created before it are "ไม่ทราบ".
            await passwordOnlySession();
            const good = await account(CANONICAL_ROLES.DOCUMENT_REVIEWER, orgs.a);
            const bad = await account(CANONICAL_ROLES.DISPATCHER, orgs.a);
            const never = await account(CANONICAL_ROLES.FIELD_INSPECTOR, orgs.a);

            const ticket = (await login(good)).body.data.setup_token;
            const setup = await mfaSetup(ticket, {});
            expect((await mfaVerifySetup(ticket, { code: mfaService.generateTOTP(setup.body.data.secret), backupCodesSaved: true })).status).toBe(200);
            expect((await signIn(good, { code: mfaService.generateTOTP(setup.body.data.secret) })).length).toBeGreaterThan(0);

            process.env.REQUIRE_MFA_FOR_PRIVILEGED = 'false';
            try {
                const early = await login(bad);
                expect(typeof early.body.data.token).toBe('string');
            } finally {
                process.env.REQUIRE_MFA_FOR_PRIVILEGED = 'true';
            }
            const ticket2 = (await login(bad)).body.data.setup_token;
            const setup2 = await mfaSetup(ticket2, {});
            expect((await mfaVerifySetup(ticket2, { code: mfaService.generateTOTP(setup2.body.data.secret), backupCodesSaved: true })).status).toBe(200);

            const run = spawnSync(process.execPath, [REPORT_SCRIPT], { cwd: BACKEND, encoding: 'utf8', timeout: 120000, env: { ...process.env } });
            expect({ status: run.status, stderr: (run.stderr || '').trim() }).toEqual({ status: 0, stderr: '' });
            const rowsByName = Object.fromEntries(run.stdout.split('\n').filter((line) => line.includes(`สกุล${sfx}`)).map((line) => [line.split('\t')[2], line.split('\t')]));
            const nameOf = async (user) => {
                const row = await raw.user.findUnique({ where: { id: user.id }, select: { firstName: true, lastName: true } });
                return `${row.firstName} ${row.lastName}`;
            };
            expect(rowsByName[await nameOf(good)][4]).toBe('ผ่าน');
            expect(rowsByName[await nameOf(bad)][4]).toBe('ไม่ผ่าน');
            expect(rowsByName[await nameOf(never)][4]).toBe('ยังไม่เคยเข้าระบบ');
            expect(run.stdout).toMatch(/^สรุป: ผ่าน \d+ บัญชี ไม่ผ่าน \d+ บัญชี ยังไม่เคยเข้าระบบ \d+ บัญชี/m);
            expect(run.stdout).not.toContain(good.nationalId);
            expect(run.stdout).not.toContain(setup.body.data.secret);
        });
    });

    describe('order 94 item 5 (review L2): sign-ins before the report starts counting are unknown, not passed', () => {
        test('the report prints its start date, and an account created before it is "ไม่ทราบ" even with an enrolment and a recorded session', async () => {
            await passwordOnlySession();
            const old = await account(CANONICAL_ROLES.DOCUMENT_REVIEWER, orgs.a);
            const ticket = (await login(old)).body.data.setup_token;
            const setup = await mfaSetup(ticket, {});
            expect((await mfaVerifySetup(ticket, { code: mfaService.generateTOTP(setup.body.data.secret), backupCodesSaved: true })).status).toBe(200);
            expect((await signIn(old, { code: mfaService.generateTOTP(setup.body.data.secret) })).length).toBeGreaterThan(0);
            const before = spawnSync(process.execPath, [REPORT_SCRIPT], { cwd: BACKEND, encoding: 'utf8', timeout: 120000, env: { ...process.env } });
            await raw.user.update({ where: { id: old.id }, data: { createdAt: new Date('2020-01-01T00:00:00Z') } });
            const run = spawnSync(process.execPath, [REPORT_SCRIPT], { cwd: BACKEND, encoding: 'utf8', timeout: 120000, env: { ...process.env } });
            expect({ status: run.status, stderr: (run.stderr || '').trim() }).toEqual({ status: 0, stderr: '' });
            const row = (out) => out.split('\n').find((line) => line.includes(`สกุล${sfx}`) && line.split('\t')[2] === `ชื่อ${seq} สกุล${sfx}`);
            expect(row(before.stdout).split('\t')[4]).toBe('ผ่าน');
            expect(run.stdout.split('\n').find((line) => line.split('\t')[2] === row(before.stdout).split('\t')[2]).split('\t')[4]).toBe('ไม่ทราบ');
            expect(run.stdout).toMatch(/^เริ่มนับตั้งแต่ .+ \(เหตุการณ์ PROVIDER_LOGIN_SESSION_ISSUED แรกในบันทึก\)/m);
            expect(run.stdout).toMatch(/ไม่ทราบ \d+ บัญชี \(ทั้งหมด/);
        });
    });

    describe('order 94 item 5 (review round 7 L1): an account that existed before the count started is unknown, however recent its last sign-in', () => {
        test('enrolled and signed in after the start date, but created before it: "ไม่ทราบ", because its earlier password-only sessions left no record', async () => {
            await passwordOnlySession();
            const veteran = await account(CANONICAL_ROLES.DOCUMENT_REVIEWER, orgs.a);
            const ticket = (await login(veteran)).body.data.setup_token;
            const setup = await mfaSetup(ticket, {});
            expect((await mfaVerifySetup(ticket, { code: mfaService.generateTOTP(setup.body.data.secret), backupCodesSaved: true })).status).toBe(200);
            expect((await signIn(veteran, { code: mfaService.generateTOTP(setup.body.data.secret) })).length).toBeGreaterThan(0);
            const report = () => spawnSync(process.execPath, [REPORT_SCRIPT], { cwd: BACKEND, encoding: 'utf8', timeout: 120000, env: { ...process.env } });
            const name = `ชื่อ${seq} สกุล${sfx}`;
            const verdictOf = (out) => out.split('\n').find((line) => line.split('\t')[2] === name).split('\t')[4];
            expect(verdictOf(report().stdout)).toBe('ผ่าน');

            await raw.user.update({ where: { id: veteran.id }, data: { createdAt: new Date('2020-01-01T00:00:00Z') } });
            const run = report();
            expect({ status: run.status, stderr: (run.stderr || '').trim() }).toEqual({ status: 0, stderr: '' });
            expect(verdictOf(run.stdout)).toBe('ไม่ทราบ');
            expect((await raw.user.findUnique({ where: { id: veteran.id }, select: { lastLoginAt: true } })).lastLoginAt.getTime()).toBeGreaterThan(Date.now() - 600000);
        });
    });

    describe('order 95 item 2: the roster counts the active DTAM admins of each organization (go-live gate row 7)', () => {
        test('an organization with one DTAM admin, a platform admin and a disabled DTAM admin is marked below the threshold; organization A is not', async () => {
            const orgC = await organization('C');
            await account(CANONICAL_ROLES.SYSTEM_ADMIN_DTAM, orgC);
            await account(CANONICAL_ROLES.SYSTEM_ADMIN_PLATFORM, orgC);
            const disabled = await account(CANONICAL_ROLES.SYSTEM_ADMIN_DTAM, orgC);
            await raw.user.update({ where: { id: disabled.id }, data: { status: 'INACTIVE' } });
            const run = spawnSync(process.execPath, [ROSTER_SCRIPT], { cwd: BACKEND, encoding: 'utf8', timeout: 120000, env: { ...process.env } });
            expect({ status: run.status, stderr: (run.stderr || '').trim() }).toEqual({ status: 0, stderr: '' });
            const lines = run.stdout.split('\n');
            expect(lines).toContain(`หน่วยงาน หน่วยงาน C ${sfx}: ผู้ดูแลระบบฝั่งกรมที่ใช้งานอยู่ 1 บัญชี (ต่ำกว่าเกณฑ์ 2 บัญชี)`);
            const lineA = lines.find((line) => line.startsWith(`หน่วยงาน หน่วยงาน A ${sfx}:`));
            expect(lineA).toMatch(/ผู้ดูแลระบบฝั่งกรมที่ใช้งานอยู่ [2-9]\d* บัญชี$/);
        });
    });

    describe('order 95 item 2 (review L1): only an organization that holds DTAM-side staff accounts is counted', () => {
        test('a company-side organization prints no line; one with only a DTAM dispatcher prints 0 below the threshold', async () => {
            const companyOnly = await organization('D');
            await account(CANONICAL_ROLES.SYSTEM_ADMIN_PLATFORM, companyOnly);
            await account(CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM, companyOnly);
            const dispatcherOnly = await organization('E');
            await account(CANONICAL_ROLES.DISPATCHER, dispatcherOnly);
            const run = spawnSync(process.execPath, [ROSTER_SCRIPT], { cwd: BACKEND, encoding: 'utf8', timeout: 120000, env: { ...process.env } });
            expect({ status: run.status, stderr: (run.stderr || '').trim() }).toEqual({ status: 0, stderr: '' });
            const lines = run.stdout.split('\n');
            expect(lines.filter((line) => line.startsWith(`หน่วยงาน หน่วยงาน D ${sfx}:`))).toEqual([]);
            expect(lines).toContain(`หน่วยงาน หน่วยงาน E ${sfx}: ผู้ดูแลระบบฝั่งกรมที่ใช้งานอยู่ 0 บัญชี (ต่ำกว่าเกณฑ์ 2 บัญชี)`);
        });
    });

    describe('refresh door (I4)', () => {
        test('a refresh token naming a staff account is refused by the role the database holds, even with no epoch', async () => {
            const staff = await account(CANONICAL_ROLES.CERTIFICATE_APPROVER, orgs.a);
            const res = await refresh(forgedRefreshToken(staff));
            expect({ status: res.status, code: res.body.code }).toEqual({ status: 401, code: 'REFRESH_NOT_FOR_STAFF' });
        });
    });
});

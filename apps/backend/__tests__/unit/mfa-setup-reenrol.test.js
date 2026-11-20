'use strict';

/**
 * POST /api/mfa/setup ต้องไม่ปิดหรือเขียนทับ 2FA ที่เปิดอยู่โดยไม่มีหลักฐาน (round 4, 2026-09-26)
 * และการย้ายเครื่องด้วยรหัสสำรองตามคำสั่ง operator 89 ก (2026-10-20)
 *
 * สัญญาที่ตรึง:
 *   - บัญชีที่เปิด 2FA อยู่: /setup ต้องมีรหัส TOTP ปัจจุบัน หรือรหัสสำรอง 1 รหัสที่ยังไม่ใช้ (ผิด/ไม่มี → 401)
 *     รหัสสำรองที่รับแล้วถูกใช้ทิ้งทันที ใช้ซ้ำไม่ได้ ถ้าช่องพักล่ม (503) รหัสยังไม่ถูกใช้
 *   - secret ใหม่และรหัสสำรองชุดใหม่ (แสดงครั้งเดียวที่ /setup) ไม่แทนของเดิมจนกว่า /verify-setup ยืนยัน
 *     ด้วยรหัสจาก secret ใหม่พร้อมคำยืนยัน backupCodesSaved: true ระหว่างนั้น 2FA เดิมยังใช้งาน
 *   - เปลี่ยนสำเร็จ → identity-service.moveSecondFactor รับ audit MFA_REENROLLED (วิธีที่ใช้ IP แบบปิดบางส่วน)
 *     และข้อมูลแจ้งเตือนเจ้าของ ในธุรกรรมเดียว · ถูกปฏิเสธ → audit MFA_REENROL_REFUSED
 *   - บัญชีที่ยังไม่เปิด 2FA: /setup คืน secret + รหัสสำรอง · /verify-setup เปิดให้เมื่อมีคำยืนยันเท่านั้น
 *
 * router จริงผ่าน supertest · แถว users และ redis อยู่ในหน่วยความจำ (ไม่มี Postgres/Redis ในเครื่องที่รัน)
 */

const express = require('express');
const request = require('supertest');
const { mfaService } = require('../../middleware/mfa-service');

const mockUsers = new Map();
const mockRedis = new Map();
const mockRedisState = { down: false };
const mockLimiterCalls = [];

jest.mock('../../shared/logger', () => {
    const l = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    return { ...l, createLogger: () => l };
});

jest.mock('../../middleware/auth-middleware', () => {
    const fromHeaders = (req, res, next) => {
        const id = req.headers['x-test-user-id'];
        if (!id) { return res.status(401).json({ success: false, code: 'AUTH_ERROR' }); }
        // jti: the session's token id — a re-enrol is bound to the session that started it (round 5)
        req.user = { id, role: 'document_reviewer', canonicalRole: 'document_reviewer', email: `${id}@example.test`, jti: `session-of-${id}` };
        return next();
    };
    return { authenticateProvider: fromHeaders, authenticateAny: fromHeaders, isTokenBeforeSessionEpoch: () => false };
});

// The limiter is observed, not exercised: the file records which requests pass through it.
jest.mock('../../middleware/rate-limiter', () => ({
    createRateLimiter: () => (req, _res, next) => { mockLimiterCalls.push(`${req.method} ${req.path}`); next(); },
}));

jest.mock('../../services/redis-service', () => {
    class RedisUnavailableError extends Error {}
    const guard = () => { if (mockRedisState.down) { throw new RedisUnavailableError('redis down'); } };
    // raw client for the atomic attempt counter (round 6): INCR in a pipeline
    const client = {
        pipeline() {
            const ops = [];
            const p = {
                incr(k) { ops.push(() => { const n = Number(mockRedis.get(k) || 0) + 1; mockRedis.set(k, String(n)); return n; }); return p; },
                pexpire() { ops.push(() => 1); return p; },
                async exec() { guard(); return ops.map((op) => [null, op()]); },
            };
            return p;
        },
    };
    const svc = {
        client,
        get isConnected() { return !mockRedisState.down; },
        getStrict: jest.fn(async (k) => { guard(); return mockRedis.has(k) ? JSON.parse(mockRedis.get(k)) : null; }),
        setStrict: jest.fn(async (k, v) => { guard(); mockRedis.set(k, JSON.stringify(v)); return true; }),
        delStrict: jest.fn(async (k) => { guard(); mockRedis.delete(k); return true; }),
        del: jest.fn(async (k) => { mockRedis.delete(k); return true; }),
        setNX: jest.fn(async () => true),
    };
    return Object.assign(svc, { RedisUnavailableError });
});

jest.mock('../../services/identity-service', () => {
    const row = (id) => mockUsers.get(id);
    return {
        getMfaStatus: jest.fn(async (id) => (row(id) ? { twoFactorEnabled: row(id).twoFactorEnabled } : null)),
        findMfaSecretForDisable: jest.fn(async (id) => (row(id) ? { twoFactorSecret: row(id).twoFactorSecret, twoFactorEnabled: row(id).twoFactorEnabled } : null)),
        findSecondFactorForRebind: jest.fn(async (id) => (row(id)
            ? { twoFactorSecret: row(id).twoFactorSecret, twoFactorEnabled: row(id).twoFactorEnabled, twoFactorBackupCodes: row(id).twoFactorBackupCodes }
            : null)),
        updateBackupCodes: jest.fn(async (id, hashes) => Object.assign(row(id), { twoFactorBackupCodes: hashes })),
        consumeBackupCode: jest.fn(async (id, hash) => {
            const list = Array.isArray(row(id)?.twoFactorBackupCodes) ? row(id).twoFactorBackupCodes : [];
            if (!row(id)?.twoFactorEnabled || !list.includes(hash)) { return false; }
            row(id).twoFactorBackupCodes = list.filter((h) => h !== hash);
            return true;
        }),
        restoreBackupCode: jest.fn(async (id, hash) => { row(id).twoFactorBackupCodes = [...(row(id).twoFactorBackupCodes || []), hash]; }),
        storePendingSecondFactor: jest.fn(async (id, { secret, hashedBackupCodes }) => Object.assign(row(id), {
            twoFactorSecret: secret, twoFactorEnabled: false, twoFactorBackupCodes: hashedBackupCodes,
        })),
        findPendingSecondFactor: jest.fn(async (id) => ({ twoFactorSecret: row(id)?.twoFactorSecret })),
        enableSecondFactor: jest.fn(async (id) => Object.assign(row(id), { twoFactorEnabled: true })),
        moveSecondFactor: jest.fn(async (id, { secret, hashedBackupCodes, sessionsRevokedAt }) => Object.assign(row(id), {
            twoFactorSecret: secret, twoFactorEnabled: true, twoFactorBackupCodes: hashedBackupCodes, sessionsRevokedAt,
        })),
        disableMfa: jest.fn(),
    };
});

const mockAudit = jest.fn(async () => {});
jest.mock('../../middleware/audit-logger', () => ({
    auditLogger: { log: (...a) => mockAudit(...a) },
    AuditCategory: { SECURITY: 'SECURITY' },
    AuditSeverity: { INFO: 'INFO', WARNING: 'WARNING' },
    ResourceType: { USER: 'USER' },
}));

const identityService = require('../../services/identity-service');

const app = express();
app.use(express.json());
app.use('/api/mfa', require('../../routes/api/identity/mfa'));

const hash = (code) => mfaService.hashBackupCode(code);
const OLD_CODES = ['AAAA-1111', 'BBBB-2222'];
let OLD_SECRET;
const as = (req, id = 'staff-1') => req.set('x-test-user-id', id);
const actions = () => mockAudit.mock.calls.map(([e]) => e.action);
const setup = (body, id) => as(request(app).post('/api/mfa/setup'), id).send(body);
const verifySetup = (body, id) => as(request(app).post('/api/mfa/verify-setup'), id).send({ backupCodesSaved: true, ...body });

beforeEach(() => {
    jest.clearAllMocks();
    mockLimiterCalls.length = 0;
    mockRedis.clear();
    mockRedisState.down = false;
    mockUsers.clear();
    OLD_SECRET = mfaService.generateSecret();
    mockUsers.set('staff-1', { id: 'staff-1', twoFactorEnabled: true, twoFactorSecret: OLD_SECRET, twoFactorBackupCodes: OLD_CODES.map(hash) });
    mockUsers.set('fresh-1', { id: 'fresh-1', twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodes: null });
});

function expectOldFactorIntact() {
    const r = mockUsers.get('staff-1');
    expect(r.twoFactorEnabled).toBe(true);
    expect(r.twoFactorSecret).toBe(OLD_SECRET);
    // a code put back after a store outage lands at the end of the list; the set is what matters
    expect([...r.twoFactorBackupCodes].sort()).toEqual(OLD_CODES.map(hash).sort());
}

describe('enabled 2FA: /setup needs the current code', () => {
    test('a session without a code cannot re-run setup — 401, the enabled factor is untouched', async () => {
        const res = await setup({});
        expect(res.status).toBe(401);
        expect(res.body.data?.secret).toBeUndefined();
        expectOldFactorIntact();
        expect(actions()).toContain('MFA_REENROL_REFUSED');
    });

    test('a wrong current code → 401, untouched (same verifier and answer as /disable)', async () => {
        const res = await setup({ code: '000000' });
        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Invalid code');
        expectOldFactorIntact();
    });

    test('the right current code starts a re-enrol with a new secret and new backup codes, but the old factor stays active until the new one is confirmed', async () => {
        const res = await setup({ code: mfaService.generateTOTP(OLD_SECRET) });
        expect(res.status).toBe(200);
        const newSecret = res.body.data.secret;
        expect(newSecret).toBeTruthy();
        expect(newSecret).not.toBe(OLD_SECRET);
        expect(res.body.data.backupCodes).toHaveLength(10);
        expect(res.body.data.method).toBe('TOTP');
        expectOldFactorIntact();
        expect(actions()).toContain('MFA_REENROL_INITIATED');
    });

    test('verify-setup with a code from the NEW secret swaps the factor and the backup codes shown at /setup, in one service call that carries the audit event and the owner notice', async () => {
        const started = await setup({ code: mfaService.generateTOTP(OLD_SECRET) });
        const { secret: newSecret, backupCodes: newCodes } = started.body.data;
        const res = await verifySetup({ code: mfaService.generateTOTP(newSecret) });
        expect(res.status).toBe(200);
        expect(res.body.data.backupCodes).toBeUndefined();
        const r = mockUsers.get('staff-1');
        expect(r.twoFactorEnabled).toBe(true);
        expect(r.twoFactorSecret).toBe(newSecret);
        expect(r.twoFactorBackupCodes).toEqual(newCodes.map(hash));
        expect(mockRedis.size).toBe(0); // the pending secret and its attempt counter are gone
        expect(identityService.moveSecondFactor).toHaveBeenCalledWith(
            'staff-1',
            expect.objectContaining({ secret: newSecret, hashedBackupCodes: newCodes.map(hash) }),
            expect.objectContaining({
                auditEvent: expect.objectContaining({
                    action: 'MFA_REENROLLED', actorId: 'staff-1', resourceId: 'staff-1',
                    metadata: expect.objectContaining({ method: 'TOTP', otherSessionsRevoked: true }),
                }),
                noticeData: expect.objectContaining({ method: 'TOTP' }),
            }),
        );
    });

    test('verify-setup with a wrong code keeps the old factor', async () => {
        await setup({ code: mfaService.generateTOTP(OLD_SECRET) });
        const res = await verifySetup({ code: '000000' });
        expect(res.status).toBe(400);
        expectOldFactorIntact();
    });

    test('verify-setup with no re-enrol in progress changes nothing', async () => {
        const res = await verifySetup({ code: mfaService.generateTOTP(OLD_SECRET) });
        expect(res.status).toBe(400);
        expectOldFactorIntact();
    });

    test('the store for the pending secret is down → 503, nothing changed', async () => {
        mockRedisState.down = true;
        const res = await setup({ code: mfaService.generateTOTP(OLD_SECRET) });
        expect(res.status).toBe(503);
        expectOldFactorIntact();
    });

    test('the store goes down between /setup and /verify-setup → 503 at verify, the old factor stays (round 6: the attempt counter is a store write too)', async () => {
        const started = await setup({ code: mfaService.generateTOTP(OLD_SECRET) });
        mockRedisState.down = true;
        const res = await verifySetup({ code: mfaService.generateTOTP(started.body.data.secret) });
        expect(res.status).toBe(503);
        expect(res.body.code).toBe('MFA_REENROL_UNAVAILABLE');
        expectOldFactorIntact();
    });

    test('a /setup that carries a code or a backup code goes through the MFA limiter (the one /disable uses)', async () => {
        await setup({ code: '000000' });
        await setup({ backupCode: 'ZZZZ-9999' });
        expect(mockLimiterCalls.filter((c) => c === 'POST /setup')).toHaveLength(2);
    });
});

describe('order 89 ก: one backup code moves the factor to a new device', () => {
    test('one unused backup code starts the move and is used up; the same code is refused the second time', async () => {
        const res = await setup({ backupCode: 'AAAA-1111' });
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual(expect.objectContaining({ reenrol: true, method: 'BACKUP_CODE' }));
        expect(res.body.data.backupCodes).toHaveLength(10);
        const r = mockUsers.get('staff-1');
        expect(r.twoFactorEnabled).toBe(true);
        expect(r.twoFactorSecret).toBe(OLD_SECRET);
        expect(r.twoFactorBackupCodes).toEqual([hash('BBBB-2222')]);
        expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'MFA_REENROL_INITIATED', metadata: expect.objectContaining({ method: 'BACKUP_CODE' }) }));

        const again = await setup({ backupCode: 'AAAA-1111' });
        expect(again.status).toBe(401);
        expect(again.body.code).toBe('MFA_CODE_REQUIRED');
        expect(mockUsers.get('staff-1').twoFactorBackupCodes).toEqual([hash('BBBB-2222')]);
    });

    test('a backup code is read with or without its dash', async () => {
        const res = await setup({ backupCode: 'AAAA1111' });
        expect(res.status).toBe(200);
        expect(mockUsers.get('staff-1').twoFactorBackupCodes).toEqual([hash('BBBB-2222')]);
    });

    test('an unknown or non-string backup code is refused, counts in the limiter, and changes nothing', async () => {
        for (const backupCode of ['ZZZZ-9999', { not: 'a string' }, 12345678]) {
            const res = await setup({ backupCode });
            expect(res.status).toBe(401);
            expect(res.body.code).toBe('MFA_CODE_REQUIRED');
        }
        expectOldFactorIntact();
        expect(mockLimiterCalls.filter((c) => c === 'POST /setup')).toHaveLength(3);
        expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'MFA_REENROL_REFUSED', metadata: { reason: 'Invalid backup code' } }));
    });

    test('when the store is down the backup code is not used up', async () => {
        mockRedisState.down = true;
        const res = await setup({ backupCode: 'AAAA-1111' });
        expect(res.status).toBe(503);
        expectOldFactorIntact();
    });

    test('the move finishes only with the saved-codes confirmation, which spends no attempt, and the audit event and the notice name the backup-code method and a masked address', async () => {
        const started = await setup({ backupCode: 'AAAA-1111' });
        const { secret: newSecret, backupCodes: newCodes } = started.body.data;

        const unconfirmed = await as(request(app).post('/api/mfa/verify-setup')).send({ code: mfaService.generateTOTP(newSecret) });
        expect(unconfirmed.status).toBe(400);
        expect(unconfirmed.body.code).toBe('MFA_BACKUP_CODES_NOT_CONFIRMED');
        expect(mockUsers.get('staff-1').twoFactorSecret).toBe(OLD_SECRET);
        expect(mockRedis.get('mfa:reenrol:staff-1:attempts')).toBeUndefined();

        const done = await verifySetup({ code: mfaService.generateTOTP(newSecret) });
        expect(done.status).toBe(200);
        expect(done.body.data.method).toBe('BACKUP_CODE');
        const r = mockUsers.get('staff-1');
        expect(r.twoFactorSecret).toBe(newSecret);
        expect(r.twoFactorBackupCodes).toEqual(newCodes.map(hash));
        expect(identityService.moveSecondFactor).toHaveBeenCalledWith('staff-1', expect.anything(), expect.objectContaining({
            auditEvent: expect.objectContaining({
                action: 'MFA_REENROLLED',
                ipAddress: expect.stringMatching(/\.x\.x$/),
                metadata: expect.objectContaining({ method: 'BACKUP_CODE', methodLabel: 'รหัสสำรอง' }),
            }),
            noticeData: expect.objectContaining({ method: 'BACKUP_CODE', methodLabel: 'รหัสสำรอง', ipMasked: expect.stringMatching(/\.x\.x$/) }),
        }));
    });
});

describe('control: 2FA not enabled — first enrolment', () => {
    test('/setup shows the backup codes once; /verify-setup enables only with the saved-codes confirmation, and nothing goes through the limiter', async () => {
        const started = await setup({}, 'fresh-1');
        expect(started.status).toBe(200);
        expect(started.body.data.backupCodes).toHaveLength(10);
        expect(mockUsers.get('fresh-1')).toEqual(expect.objectContaining({
            twoFactorEnabled: false,
            twoFactorSecret: started.body.data.secret,
            twoFactorBackupCodes: started.body.data.backupCodes.map(hash),
        }));
        const code = mfaService.generateTOTP(started.body.data.secret);

        const unconfirmed = await as(request(app).post('/api/mfa/verify-setup'), 'fresh-1').send({ code });
        expect(unconfirmed.status).toBe(400);
        expect(unconfirmed.body.code).toBe('MFA_BACKUP_CODES_NOT_CONFIRMED');
        expect(mockUsers.get('fresh-1').twoFactorEnabled).toBe(false);

        const res = await verifySetup({ code }, 'fresh-1');
        expect(res.status).toBe(200);
        expect(res.body.data.backupCodes).toBeUndefined();
        expect(mockUsers.get('fresh-1').twoFactorEnabled).toBe(true);
        expect(mockLimiterCalls).not.toContain('POST /setup');
    });

    test('first enrolment never touches the pending store: it completes with the store down', async () => {
        mockRedisState.down = true;
        const started = await setup({}, 'fresh-1');
        expect(started.status).toBe(200);
        const res = await verifySetup({ code: mfaService.generateTOTP(started.body.data.secret) }, 'fresh-1');
        expect(res.status).toBe(200);
        expect(mockUsers.get('fresh-1').twoFactorEnabled).toBe(true);
    });

    test('the confirmation must be exactly true', async () => {
        const started = await setup({}, 'fresh-1');
        const code = mfaService.generateTOTP(started.body.data.secret);
        for (const backupCodesSaved of ['true', 1, 'yes']) {
            const res = await as(request(app).post('/api/mfa/verify-setup'), 'fresh-1').send({ code, backupCodesSaved });
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('MFA_BACKUP_CODES_NOT_CONFIRMED');
        }
        expect(mockUsers.get('fresh-1').twoFactorEnabled).toBe(false);
    });
});

/**
 * MFA HTTP round-trip integration test
 *
 * System deep-dive Tier 5 — QA Engineer C-1 (2026-05-15):
 *
 * The closing-review NEW-5 source-text regex tests verified that the
 * production code uses the canonical `twoFactorSecret/twoFactorEnabled/
 * twoFactorBackupCodes` columns — but they did NOT exercise the actual
 * `POST /setup → POST /verify-setup → POST /verify` HTTP flow. A logic
 * bug in TOTP verification (wrong window, wrong encoding, wrong column
 * read, wrong response shape) would pass all the source-text tests
 * while breaking real users.
 *
 * This integration test mounts the live `mfa.js` router with mocked
 * Prisma + mocked mfa-service so the test runs in-process without a
 * real DB or TOTP-clock dependency. It asserts the wire-level contract:
 *
 *   1. POST /setup → 200, response.data.{secret,qrCodeUri,message}
 *   2. POST /verify-setup with invalid code → 400 "Invalid code"
 *   3. POST /verify-setup with valid code → 200, backupCodes array
 *      issued, `twoFactorEnabled: true` written, `twoFactorBackupCodes`
 *      written as a NATIVE ARRAY (not JSON.stringify'd, per the Tier 2
 *      HIGH-1 fix to honor the Prisma Json column type)
 *   4. DELETE /disable with valid code → 200, all twoFactor* columns
 *      nulled
 *
 * If the canonical column names ever regress to `mfaSecret`/`mfaEnabled`/
 * `mfaBackupCodes` (the production bug Closing-review NEW-5 fixed), this
 * test fails immediately because Prisma's mock would receive the wrong
 * data shape and the response would diverge.
 */

const request = require('supertest');
const express = require('express');

// Mock the auth middleware — the MFA routes need an authenticated user.
// PR6 moved /status, /email/*, /disable onto authenticateAny, so the mock must
// export BOTH names; exporting only authenticateProvider makes authenticateAny
// `undefined` at router mount ("Route.get() requires a callback function") and
// the whole suite fails to load (0 tests run).
jest.mock('../../middleware/auth-middleware', () => {
    const attachUser = (req, _res, next) => {
        req.user = {
            id: 'user-provider-1',
            email: 'provider@example.test',
            role: 'document_reviewer',
        };
        next();
    };
    return { authenticateProvider: attachUser, authenticateAny: attachUser };
});

// Mock the MFA service — generateSecret + verifyTOTP + generateBackupCodes
// + hashBackupCode are externalized so we can control them deterministically.
jest.mock('../../middleware/mfa-service', () => ({
    mfaService: {
        generateSecret: jest.fn(() => 'MOCK_TOTP_SECRET_ABCDEFGHIJKL'),
        generateQRCodeUri: jest.fn(
            (_secret, email) => `otpauth://totp/GACP:${email}?secret=MOCK&issuer=GACP`,
        ),
        verifyTOTP: jest.fn((_secret, code) => code === '123456'),
        generateBackupCodes: jest.fn(() => [
            'bk-1111-2222', 'bk-3333-4444', 'bk-5555-6666',
            'bk-7777-8888', 'bk-9999-0000', 'bk-aaaa-bbbb',
        ]),
        hashBackupCode: jest.fn((code) => `HASH(${code})`),
    },
}));

// Mock audit logger — we don't need to verify audit writes here (those are
// covered separately by the AC6 admin-override tests).
jest.mock('../../middleware/audit-logger', () => ({
    auditLogger: { log: jest.fn().mockResolvedValue({ id: 'audit-1' }), logWithin: jest.fn().mockResolvedValue({ id: 'audit-2' }) },
    AuditCategory: { SECURITY: 'SECURITY', AUTHENTICATION: 'AUTHENTICATION' },
    AuditSeverity: { INFO: 'INFO', WARNING: 'WARNING' },
}));

// Mock token revocation service for the /verify path.
jest.mock('../../services/token-revocation-service', () => ({
    consumeMfaChallenge: jest.fn(async (token) =>
        token === 'valid-challenge-token' ? 'user-provider-1' : null,
    ),
    issueRefreshToken: jest.fn(async () => 'refresh-jti-1'),
}));

jest.mock('../../config/jwt-security', () => ({
    generateToken: jest.fn(() => 'mock-access-token'),
    generateRefreshToken: jest.fn(() => 'mock-refresh-token'),
}));

// In-memory mock for the User row this test mutates.
const userRow = {
    id: 'user-provider-1',
    email: 'provider@example.test',
    role: 'document_reviewer',
    accountType: 'INDIVIDUAL',
    accountTier: 'NORMAL',
    authType: 'PROVIDER_ID',
    healthId: null,
    providerId: '1234567890123',
    twoFactorSecret: null,
    twoFactorEnabled: false,
    twoFactorBackupCodes: null,
};

// Batch 15 (2026-05-16): identity-service uses `findFirst` (not
// `findUnique`) so it can also enforce `isDeleted: false`. The mock
// exposes both methods so this test stays compatible with either
// path (legacy + post-refactor).
jest.mock('../../services/prisma-database', () => {
    const prismaMock = {
        user: {
            update: jest.fn(async ({ data }) => {
                Object.assign(userRow, data);
                return userRow;
            }),
            findUnique: jest.fn(async () => userRow),
            findFirst: jest.fn(async () => userRow),
            findMany: jest.fn(async () => []),
        },
        // enableSecondFactor runs in a transaction that reads the audit trail (round 3).
        auditLog: { findFirst: jest.fn(async () => null), count: jest.fn(async () => 0) },
    };
    prismaMock.$transaction = jest.fn(async (fn) => fn(prismaMock));
    return { prisma: prismaMock };
});

jest.mock('../../middleware/rate-limiter', () => ({
    createRateLimiter: () => (_req, _res, next) => next(),
}));

jest.mock('../../shared/logger', () => {
    const l = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    return { ...l, createLogger: () => l };
});

jest.mock('../../shared/canonical-rbac', () => ({
    normalizeRole: (r) => r,
    isProviderRole: () => true,
    CANONICAL_ROLES: { HEALTH: 'health' },
}));

const { mfaService: _mfaService } = require('../../middleware/mfa-service');
const { prisma } = require('../../services/prisma-database');
const mfaRouter = require('../../routes/api/identity/mfa');

describe('[Tier 5] MFA HTTP round-trip integration', () => {
    let app;

    beforeAll(() => {
        app = express();
        app.use(express.json());
        app.use('/api/identity/mfa', mfaRouter);
    });

    beforeEach(() => {
        // Reset the mock user state to fresh-install before each test.
        Object.assign(userRow, {
            twoFactorSecret: null,
            twoFactorEnabled: false,
            twoFactorBackupCodes: null,
        });
        jest.clearAllMocks();
    });

    it('POST /setup issues a TOTP secret + QR URI and stores secret with enabled:false', async () => {
        const res = await request(app)
            .post('/api/identity/mfa/setup')
            .send({});

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.secret).toBe('MOCK_TOTP_SECRET_ABCDEFGHIJKL');
        expect(res.body.data.qrCodeUri).toContain('otpauth://totp/GACP:provider@example.test');
        expect(res.body.data.message).toContain('Scan QR code');

        // NEW-5 regression: must write to CANONICAL columns
        expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'user-provider-1' },
            data: expect.objectContaining({
                twoFactorSecret: 'MOCK_TOTP_SECRET_ABCDEFGHIJKL',
                twoFactorEnabled: false,
            }),
        }));
        // And NOT to legacy names.
        const writtenData = prisma.user.update.mock.calls[0][0].data;
        expect(writtenData.mfaSecret).toBeUndefined();
        expect(writtenData.mfaEnabled).toBeUndefined();
        // Order 89 ก1: the backup codes are shown once, here. HIGH-1 regression: their
        // hashes go in as a NATIVE ARRAY, never JSON.stringify(array).
        expect(res.body.data.backupCodes).toEqual([
            'bk-1111-2222', 'bk-3333-4444', 'bk-5555-6666',
            'bk-7777-8888', 'bk-9999-0000', 'bk-aaaa-bbbb',
        ]);
        expect(Array.isArray(writtenData.twoFactorBackupCodes)).toBe(true);
        expect(writtenData.twoFactorBackupCodes).toHaveLength(6);
        expect(writtenData.twoFactorBackupCodes[0]).toBe('HASH(bk-1111-2222)');
    });

    it('POST /verify-setup with invalid TOTP returns 400, leaves twoFactorEnabled:false', async () => {
        // Prime: a previous /setup already wrote twoFactorSecret.
        userRow.twoFactorSecret = 'MOCK_TOTP_SECRET_ABCDEFGHIJKL';

        const res = await request(app)
            .post('/api/identity/mfa/verify-setup')
            .send({ code: '000000', backupCodesSaved: true });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/invalid code/i);
        // No "enable MFA" write happened.
        const enabledWrites = prisma.user.update.mock.calls.filter(
            (call) => call[0]?.data?.twoFactorEnabled === true,
        );
        expect(enabledWrites).toHaveLength(0);
    });

    it('POST /verify-setup with valid TOTP and the saved-codes confirmation enables MFA; the codes were shown once at /setup', async () => {
        userRow.twoFactorSecret = 'MOCK_TOTP_SECRET_ABCDEFGHIJKL';
        userRow.twoFactorBackupCodes = ['HASH(bk-1111-2222)'];

        const res = await request(app)
            .post('/api/identity/mfa/verify-setup')
            .send({ code: '123456', backupCodesSaved: true });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.backupCodes).toBeUndefined();

        const enableCall = prisma.user.update.mock.calls.find(
            (call) => call[0]?.data?.twoFactorEnabled === true,
        );
        expect(enableCall).toBeDefined();
        expect(enableCall[0].data.twoFactorSecret).toBeUndefined();
        expect(userRow.twoFactorBackupCodes).toEqual(['HASH(bk-1111-2222)']);
    });

    it('POST /verify-setup without the saved-codes confirmation is refused and enables nothing (order 89 ก1)', async () => {
        userRow.twoFactorSecret = 'MOCK_TOTP_SECRET_ABCDEFGHIJKL';

        const res = await request(app)
            .post('/api/identity/mfa/verify-setup')
            .send({ code: '123456' });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('MFA_BACKUP_CODES_NOT_CONFIRMED');
        expect(res.body.errorTh).toContain('รหัสสำรอง');
        expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('DELETE /disable with valid TOTP nulls twoFactorSecret + twoFactorBackupCodes + sets twoFactorEnabled:false', async () => {
        // Prime: MFA fully enabled.
        Object.assign(userRow, {
            twoFactorSecret: 'MOCK_TOTP_SECRET_ABCDEFGHIJKL',
            twoFactorEnabled: true,
            twoFactorBackupCodes: ['HASH(bk-1111-2222)'],
        });

        const res = await request(app)
            .delete('/api/identity/mfa/disable')
            .send({ code: '123456' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toMatch(/disabled successfully/i);

        const disableCall = prisma.user.update.mock.calls.find(
            (call) => call[0]?.data?.twoFactorEnabled === false
                && call[0]?.data?.twoFactorSecret === null,
        );
        expect(disableCall).toBeDefined();
        expect(disableCall[0].data.twoFactorBackupCodes).toBeNull();
        // Legacy names must not appear.
        expect(disableCall[0].data.mfaSecret).toBeUndefined();
        expect(disableCall[0].data.mfaBackupCodes).toBeUndefined();
    });

    it('DELETE /disable with invalid TOTP returns 401 and does NOT touch the MFA state', async () => {
        Object.assign(userRow, {
            twoFactorSecret: 'MOCK_TOTP_SECRET_ABCDEFGHIJKL',
            twoFactorEnabled: true,
            twoFactorBackupCodes: ['HASH(bk-1111-2222)'],
        });

        const res = await request(app)
            .delete('/api/identity/mfa/disable')
            .send({ code: '999999' });

        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/invalid code/i);
        // No state mutation.
        expect(userRow.twoFactorEnabled).toBe(true);
        expect(userRow.twoFactorSecret).toBe('MOCK_TOTP_SECRET_ABCDEFGHIJKL');
    });
});

'use strict';

/**
 * ผลตรวจอิสระ I4 (2026-10-20): จุดออก token กลาง issueTokensForAuthenticatedUser ไม่มีด่านธง
 * วันนี้ไม่มีผู้เรียกที่ส่งบัญชีเจ้าหน้าที่เข้ามา (ประตูผู้ยื่นและ ThaID ปฏิเสธก่อน) แต่ทาง ค ในอนาคต
 * (ผูกเจ้าหน้าที่กับหมอพร้อมหรือ ThaID) จะผ่านจุดนี้ ด่านจึงต้องอยู่ที่จุดออก token เอง:
 * ขณะ REQUIRE_MFA_FOR_PRIVILEGED เปิด บัญชีเจ้าหน้าที่ที่ไม่มีปัจจัยที่สองที่ใช้ได้ ไม่ได้ session จากที่นี่
 */

process.env.HEALTH_JWT_SECRET = process.env.HEALTH_JWT_SECRET || 'test-only-health-jwt-secret-32-bytes-exactly-here!!';
process.env.PROVIDER_JWT_SECRET = process.env.PROVIDER_JWT_SECRET || 'test-only-provider-jwt-secret-32-bytes-exactly-ok';

jest.mock('../../services/prisma-database', () => ({ prisma: { user: {} } }));
jest.mock('../../shared/logger', () => {
    const l = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    return { ...l, createLogger: () => l, stream: { write: jest.fn() } };
});
jest.mock('../../services/token-revocation-service', () => ({
    issueRefreshToken: jest.fn(async () => 'refresh-jti-1'),
}));
jest.mock('../../services/entity-service', () => ({ ensurePersonalIndividualEntity: jest.fn() }));
jest.mock('../../middleware/audit-logger', () => ({ auditLogger: { log: jest.fn(), logAuth: jest.fn() }, AuditCategory: {}, AuditSeverity: {} }));

const AuthService = require('../../services/prisma-auth-service');

const staff = (extra = {}) => ({
    id: 'staff-1', role: 'document_reviewer', status: 'ACTIVE', isDeleted: false, authType: 'PROVIDER_ID',
    accountType: 'PROVIDER', email: 's@example.test', organizationId: 'org-1', twoFactorEnabled: false, twoFactorMethod: 'TOTP', ...extra,
});
const applicant = () => ({
    id: 'farmer-1', role: 'health', status: 'ACTIVE', isDeleted: false, authType: 'HEALTH_ID',
    accountType: 'INDIVIDUAL', email: 'f@example.test', organizationId: 'org-1', twoFactorEnabled: false,
});

describe('the central issuer enforces the staff second-factor flag', () => {
    let flag;
    beforeEach(() => { flag = process.env.REQUIRE_MFA_FOR_PRIVILEGED; });
    afterEach(() => {
        if (flag === undefined) { delete process.env.REQUIRE_MFA_FOR_PRIVILEGED; } else { process.env.REQUIRE_MFA_FOR_PRIVILEGED = flag; }
    });

    test('flag on: a staff account without a usable second factor gets no token, with its own error code', async () => {
        process.env.REQUIRE_MFA_FOR_PRIVILEGED = 'true';
        await expect(AuthService.issueTokensForAuthenticatedUser(staff())).rejects.toMatchObject({ code: 'AUTH_STAFF_SECOND_FACTOR_REQUIRED', statusCode: 403 });
        await expect(AuthService.issueTokensForAuthenticatedUser(staff({ twoFactorEnabled: true, twoFactorMethod: 'EMAIL' }))).rejects.toMatchObject({ code: 'AUTH_STAFF_SECOND_FACTOR_REQUIRED' });
    });

    test('flag on: an enrolled staff account is still sent to the challenge, and an applicant still gets tokens', async () => {
        process.env.REQUIRE_MFA_FOR_PRIVILEGED = 'true';
        await expect(AuthService.issueTokensForAuthenticatedUser(staff({ twoFactorEnabled: true }))).resolves.toMatchObject({ mfaRequired: true });
        const issued = await AuthService.issueTokensForAuthenticatedUser(applicant());
        expect(typeof issued.token).toBe('string');
        expect(typeof issued.refreshToken).toBe('string');
    });

    test('flag off: a staff account without a second factor keeps today\'s behaviour', async () => {
        process.env.REQUIRE_MFA_FOR_PRIVILEGED = 'false';
        const issued = await AuthService.issueTokensForAuthenticatedUser(staff());
        expect(typeof issued.token).toBe('string');
    });
});

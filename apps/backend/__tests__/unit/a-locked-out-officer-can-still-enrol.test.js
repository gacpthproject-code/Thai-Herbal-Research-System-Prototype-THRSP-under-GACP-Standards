'use strict';

/**
 * บัญชีที่ระบบสั่งให้ "ตั้ง MFA ก่อน" ต้องตั้งได้จริง
 *
 * วัดจริงบน demo 2026-09-07 (REQUIRE_MFA_FOR_PRIVILEGED=true ทั้ง demo และ production
 * ส่วน staging ปิดอยู่ จึงไม่มีใครเห็น):
 *
 *   POST /auth/provider/login  → 200 {"mfa_setup_required":true,"setup_token":"…"}
 *   POST /mfa/setup  (ตั๋วใบนั้น) → 401 "This token cannot be used to authenticate a session"
 *
 * ประตูทางออกเดียวปฏิเสธตั๋วใบเดียวที่ผู้ใช้มี ⇒ **พนักงานทุกคนบนดีโมและโปรดักชันเข้าระบบ
 * ไม่ได้ถาวร** ทดสอบครบทั้งห้าบทบาท ได้คำตอบเดียวกันหมด
 *
 * ด่านที่ปฏิเสธ (rejectPurposeScopedToken) ถูกต้องและต้องอยู่ต่อ — มันปิดช่องข้าม 2FA
 * (PENTEST A1) ที่เอา mfa_challenge มาใช้เป็น session · สิ่งที่ผิดคือ /mfa/setup กับ
 * /mfa/verify-setup ใช้ยาม "ของ session" ทั้งที่ผู้ใช้ที่ยังไม่ได้ลงทะเบียนถือได้แค่ตั๋วเฉพาะกิจ
 * /mfa/verify แก้ปัญหานี้ไปแล้วด้วยการตรวจ token เอง ไม่ผ่าน middleware — คู่ setup ไม่เคยได้
 * การปฏิบัติแบบเดียวกัน
 *
 * รอบ 3 (ผลตรวจอิสระ I3, 2026-10-20): ยามอ่านตั๋วจาก Authorization เท่านั้น ไม่อ่านคุกกี้ของบัญชีอื่นก่อน ·
 * ตั๋วที่ออกก่อน epoch ของบัญชี บัญชีที่ใช้งานไม่ได้ และ jti ที่ถูก blocklist ถูกปฏิเสธ · ตั๋วหมดอายุตอบเป็นไทย
 * ว่าหมดเวลา ไม่ใช่รหัสผิด · อายุตั๋ว 15 นาทีเป็นค่าคงที่ตัวเดียว
 */

const jwtConfig = require('../../config/jwt-security');
const { authenticateForMfaSetup, MFA_SETUP_TICKET_TTL_SECONDS } = require('../../middleware/mfa-setup-guard');

const mockRows = {
    'officer-1': { id: 'officer-1', email: 'reviewer@gacp.go.th', role: 'document_reviewer', providerId: '1111111111111', status: 'ACTIVE', isDeleted: false, sessionsRevokedAt: null, organizationId: 'org-1' },
    'officer-inactive': { id: 'officer-inactive', email: 'gone@gacp.go.th', role: 'document_reviewer', providerId: '1111111111112', status: 'INACTIVE', isDeleted: false, sessionsRevokedAt: null, organizationId: 'org-1' },
    'officer-epoch': { id: 'officer-epoch', email: 'reset@gacp.go.th', role: 'dispatcher', providerId: '1111111111113', status: 'ACTIVE', isDeleted: false, sessionsRevokedAt: new Date(Date.now() + 5000), organizationId: 'org-1' },
};
jest.mock('../../services/prisma-database', () => ({
    prisma: {
        user: {
            findFirst: jest.fn(async ({ where, select }) => {
                const row = mockRows[where.id];
                if (!row) { return null; }
                if (!select) { return { ...row }; }
                return Object.fromEntries(Object.entries(row).filter(([key]) => select[key]));
            }),
        },
    },
}));
jest.mock('../../services/token-revocation-service', () => ({
    isAccessTokenBlocklisted: jest.fn(async (jti) => jti === 'blocked-jti'),
}));

function resFor() {
    const res = { statusCode: null, body: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
}
const reqWith = (token, cookies = {}) => ({ headers: token ? { authorization: `Bearer ${token}` } : {}, cookies });

const setupTicket = (id = 'officer-1', overrides = {}) => jwtConfig.generateToken(
    { id, purpose: 'mfa_setup' }, 'provider', { expiresIn: '10m', ...overrides },
);

describe('ประตูลงทะเบียน MFA', () => {
    it('รับตั๋วที่ประตูล็อกอินเพิ่งยื่นให้ — ไม่งั้นทางออกไม่มีอยู่จริง', async () => {
        const req = reqWith(setupTicket());
        const res = resFor();
        const next = jest.fn();

        await authenticateForMfaSetup(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.statusCode).toBeNull();
        expect(req.user.id).toBe('officer-1');
        expect(req.user.email).toBe('reviewer@gacp.go.th');
        expect(req.user.mfaSetupTicket).toBe(true);
    });

    it('ตั๋วของ MFA challenge ใช้ที่นี่ไม่ได้ — คนละเรื่องกับการลงทะเบียน', async () => {
        const challenge = jwtConfig.generateToken(
            { id: 'officer-1', purpose: 'mfa_challenge' }, 'provider', { expiresIn: '5m' },
        );
        const res = resFor();
        const next = jest.fn();

        await authenticateForMfaSetup(reqWith(challenge), res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(401);
    });

    it('ไม่มีตั๋วเลย = ไม่ผ่าน', async () => {
        const res = resFor();
        const next = jest.fn();
        await authenticateForMfaSetup(reqWith(null), res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(401);
    });

    it('ตั๋วชี้ไปยังบัญชีที่ไม่มีอยู่ = ไม่ผ่าน', async () => {
        const ghost = jwtConfig.generateToken({ id: 'nobody', purpose: 'mfa_setup' }, 'provider', { expiresIn: '10m' });
        const res = resFor();
        const next = jest.fn();
        await authenticateForMfaSetup(reqWith(ghost), res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(401);
    });

    it('สองประตูของการลงทะเบียนใช้ยามตัวนี้ ไม่ใช่ยามของ session', () => {
        const src = require('fs').readFileSync(
            require('path').join(__dirname, '..', '..', 'routes', 'api', 'identity', 'mfa.js'), 'utf8',
        );
        // limitSetupWhenProving (2026-09-26) sits in front: it rate-limits only a /setup
        // that carries a current code (re-enrol); the guard is still authenticateForMfaSetup.
        expect(src).toMatch(/router\.post\('\/setup',\s*limitSetupWhenProving,\s*authenticateForMfaSetup/);
        // mfaVerifyLimiter (round 5, 2026-09-26) sits in front of the guard on /verify-setup.
        expect(src).toMatch(/router\.post\('\/verify-setup',\s*mfaVerifyLimiter,\s*authenticateForMfaSetup/);
    });

    it('ยามของ session ยังปฏิเสธตั๋วเฉพาะกิจเหมือนเดิม — ช่องข้าม 2FA ต้องปิดอยู่', () => {
        expect(jwtConfig.classifyTokenForAccessPath({ purpose: 'mfa_setup', tokenType: 'access' }))
            .not.toBe('ok');
        expect(jwtConfig.classifyTokenForAccessPath({ purpose: 'mfa_challenge', tokenType: 'access' }))
            .not.toBe('ok');
    });
});

describe('รอบ 3 (I3): ยามของตั๋วอ่านเฉพาะตั๋ว และตรวจเหมือนยามของ session', () => {
    it('อายุตั๋วเป็นค่าคงที่ตัวเดียว 15 นาที ที่ประตูล็อกอินใช้', () => {
        expect(MFA_SETUP_TICKET_TTL_SECONDS).toBe(15 * 60);
        const door = require('fs').readFileSync(
            require('path').join(__dirname, '..', '..', 'routes', 'api', 'auth', 'auth-provider.js'), 'utf8',
        );
        expect(door).toContain('MFA_SETUP_TICKET_TTL_SECONDS');
        expect(door).not.toMatch(/expiresIn:\s*'10m'/);
    });

    it('ตั๋วหมดอายุ → 401 MFA_SETUP_TICKET_EXPIRED พร้อมประโยคไทยว่าหมดเวลาและให้เข้าสู่ระบบใหม่ ไม่ใช่ว่ารหัสผิด', async () => {
        const res = resFor();
        const next = jest.fn();
        await authenticateForMfaSetup(reqWith(setupTicket('officer-1', { expiresIn: -1 })), res, next);
        expect(next).not.toHaveBeenCalled();
        expect({ status: res.statusCode, code: res.body.code }).toEqual({ status: 401, code: 'MFA_SETUP_TICKET_EXPIRED' });
        expect(res.body.errorTh).toMatch(/หมดเวลา/);
        expect(res.body.errorTh).toMatch(/เข้าสู่ระบบ/);
        expect(res.body.errorTh).not.toMatch(/รหัส.*ไม่ถูกต้อง/);
    });

    it('ตั๋วที่ออกก่อน epoch ของบัญชี (ปิดใช้งาน ล้าง 2FA เปลี่ยนรหัสผ่าน) → 401 TOKEN_REVOKED', async () => {
        const res = resFor();
        const next = jest.fn();
        await authenticateForMfaSetup(reqWith(setupTicket('officer-epoch')), res, next);
        expect(next).not.toHaveBeenCalled();
        expect({ status: res.statusCode, code: res.body.code }).toEqual({ status: 401, code: 'TOKEN_REVOKED' });
    });

    it('บัญชีที่ใช้งานไม่ได้ลงทะเบียนไม่ได้ แม้ตั๋วยังไม่หมดอายุ', async () => {
        const res = resFor();
        const next = jest.fn();
        await authenticateForMfaSetup(reqWith(setupTicket('officer-inactive')), res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBeGreaterThanOrEqual(401);
        expect(res.statusCode).toBeLessThanOrEqual(403);
    });

    it('jti ที่ถูก blocklist (ออกจากระบบแล้ว) → 401 TOKEN_REVOKED', async () => {
        const res = resFor();
        const next = jest.fn();
        await authenticateForMfaSetup(reqWith(setupTicket('officer-1', { jwtid: 'blocked-jti' })), res, next);
        expect(next).not.toHaveBeenCalled();
        expect({ status: res.statusCode, code: res.body.code }).toEqual({ status: 401, code: 'TOKEN_REVOKED' });
    });

    it('ตั๋วใน Authorization ชนะคุกกี้ provider_token ที่ค้างอยู่ของบัญชีอื่น', async () => {
        const req = reqWith(setupTicket(), { provider_token: 'stale-cookie-of-someone-else' });
        const res = resFor();
        const next = jest.fn();
        await authenticateForMfaSetup(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(req.user.id).toBe('officer-1');
        expect(req.user.mfaSetupTicket).toBe(true);
    });
});

'use strict';

/**
 * เดินวงลงทะเบียน MFA ให้ครบวง ผ่าน router จริง ไม่ใช่เรียก guard ตรง ๆ
 *
 * ที่พังจริงบน demo/production คือ "วง" ไม่ใช่ฟังก์ชันเดี่ยว:
 *   ประตูล็อกอินยื่นตั๋ว purpose='mfa_setup' ให้ → ประตูตั้ง MFA ปฏิเสธตั๋วใบนั้น (401)
 * เทสตัวนี้จึงประกอบ router ของ /api/mfa ตัวจริงขึ้นมา แล้วเดินสามด่านต่อกันด้วยตั๋วใบเดียว
 * ที่ผลิตจาก jwtConfig ตัวจริง — ถ้าวงยังขาด เทสนี้แดง ต่อให้ unit ของ guard เขียวหมด
 *
 * คำสั่ง operator 89 ก1 (2026-10-20): วงจะปิดได้ก็ต่อเมื่อผู้ลงทะเบียนยืนยันว่าบันทึกรหัสสำรองแล้ว
 */

const express = require('express');
const request = require('supertest');
const jwtConfig = require('../../config/jwt-security');
const { mfaService } = require('../../middleware/mfa-service');

jest.mock('../../shared/logger', () => {
    const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { ...l, createLogger: jest.fn(() => l) };
});

jest.mock('../../middleware/audit-logger', () => ({
    auditLogger: { log: jest.fn(async () => {}) },
    AuditCategory: { SECURITY: 'SECURITY' },
    AuditSeverity: { INFO: 'INFO' },
    ResourceType: { USER: 'USER' },
}));

const OFFICER = {
    id: 'officer-1',
    status: 'ACTIVE',
    isDeleted: false,
    sessionsRevokedAt: null,
    email: 'reviewer@gacp.go.th',
    role: 'document_reviewer',
    providerId: '1111111111111',
    organizationId: 'org-1',
};

// สถานะที่เซิร์ฟเวอร์เก็บระหว่างขั้นตอน — พอสำหรับเดินวง
const store = { pendingSecret: null, pendingCodes: null, enabled: false, backupCodes: null };

jest.mock('../../services/prisma-database', () => ({
    prisma: { user: { findFirst: jest.fn(async ({ where }) => (where.id === OFFICER.id ? OFFICER : null)) } },
}));

jest.mock('../../services/identity-service', () => ({
    storePendingSecondFactor: jest.fn(async (_id, { secret, hashedBackupCodes }) => { store.pendingSecret = secret; store.pendingCodes = hashedBackupCodes; }),
    findPendingSecondFactor: jest.fn(async () => ({ twoFactorSecret: store.pendingSecret })),
    enableSecondFactor: jest.fn(async () => { store.enabled = true; store.backupCodes = store.pendingCodes; }),
    getMfaStatus: jest.fn(async () => ({ twoFactorEnabled: store.enabled })),
    findSecondFactorForRebind: jest.fn(async () => ({ twoFactorEnabled: store.enabled, twoFactorMethod: 'TOTP', twoFactorSecret: store.enabled ? store.pendingSecret : null, twoFactorBackupCodes: store.backupCodes || [] })),
}));

const app = express();
app.use(express.json());
app.use('/api/mfa', require('../../routes/api/identity/mfa'));

const setupTicket = () => jwtConfig.generateToken(
    { id: OFFICER.id, purpose: 'mfa_setup' }, 'provider', { expiresIn: '10m' },
);

describe('วงลงทะเบียน MFA ต้องปิดครบวง', () => {
    beforeEach(() => { Object.assign(store, { pendingSecret: null, pendingCodes: null, enabled: false, backupCodes: null }); });

    it('ตั๋วที่ประตูล็อกอินยื่นให้ เปิด /mfa/setup ได้ และได้ secret + QR + รหัสสำรอง 10 รหัสกลับมา', async () => {
        const res = await request(app)
            .post('/api/mfa/setup')
            .set('Authorization', `Bearer ${setupTicket()}`)
            .send({});

        expect(res.status).toBe(200);
        expect(res.body?.data?.secret).toBeTruthy();
        expect(String(res.body?.data?.qrCodeUri || '')).toContain('otpauth://');
        // ชื่อบัญชีในแอป authenticator มาจากอีเมลจริงของแถวนั้น ไม่ใช่ค่าว่าง
        expect(String(res.body.data.qrCodeUri)).toContain(encodeURIComponent(OFFICER.email));
        expect(res.body.data.backupCodes).toHaveLength(10);
        expect(store.pendingCodes).toEqual(res.body.data.backupCodes.map((c) => mfaService.hashBackupCode(c)));
    });

    it('รหัส 6 หลักที่คิดจาก secret นั้น พร้อมคำยืนยันว่าบันทึกรหัสสำรองแล้ว ผ่าน /mfa/verify-setup ด้วยตั๋วใบเดิม', async () => {
        const ticket = setupTicket();
        const setup = await request(app).post('/api/mfa/setup').set('Authorization', `Bearer ${ticket}`).send({});
        const code = mfaService.generateTOTP(setup.body.data.secret);

        const verify = await request(app)
            .post('/api/mfa/verify-setup')
            .set('Authorization', `Bearer ${ticket}`)
            .send({ code, backupCodesSaved: true });

        expect(verify.status).toBe(200);
        expect(verify.body.data.backupCodes).toBeUndefined();
        expect(store.enabled).toBe(true);
        expect(store.backupCodes).toEqual(setup.body.data.backupCodes.map((c) => mfaService.hashBackupCode(c)));
    });

    it('ไม่มีคำยืนยันว่าบันทึกรหัสสำรองแล้ว → 400 และยังไม่เปิด (คำสั่ง 89 ก1)', async () => {
        const ticket = setupTicket();
        const setup = await request(app).post('/api/mfa/setup').set('Authorization', `Bearer ${ticket}`).send({});
        const code = mfaService.generateTOTP(setup.body.data.secret);

        const verify = await request(app)
            .post('/api/mfa/verify-setup')
            .set('Authorization', `Bearer ${ticket}`)
            .send({ code });

        expect(verify.status).toBe(400);
        expect(verify.body.code).toBe('MFA_BACKUP_CODES_NOT_CONFIRMED');
        expect(verify.body.errorTh).toContain('รหัสสำรอง');
        expect(store.enabled).toBe(false);
    });

    it('รหัสผิดยังถูกปฏิเสธ — ตั๋วเปิดประตูได้ ไม่ได้แปลว่าผ่านโดยไม่ต้องพิสูจน์', async () => {
        const ticket = setupTicket();
        await request(app).post('/api/mfa/setup').set('Authorization', `Bearer ${ticket}`).send({});

        const verify = await request(app)
            .post('/api/mfa/verify-setup')
            .set('Authorization', `Bearer ${ticket}`)
            .send({ code: '000000', backupCodesSaved: true });

        expect(verify.status).toBe(400);
        expect(store.enabled).toBe(false);
    });

    it('ตั๋วของ MFA challenge เปิดประตูลงทะเบียนไม่ได้', async () => {
        const challenge = jwtConfig.generateToken(
            { id: OFFICER.id, purpose: 'mfa_challenge' }, 'provider', { expiresIn: '5m' },
        );
        const res = await request(app).post('/api/mfa/setup').set('Authorization', `Bearer ${challenge}`).send({});
        expect(res.status).toBe(401);
    });
});

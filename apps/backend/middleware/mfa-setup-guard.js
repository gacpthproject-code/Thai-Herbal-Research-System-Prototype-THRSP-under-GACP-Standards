'use strict';

/**
 * ยามของ "ประตูทางออก" — ด่านลงทะเบียน MFA
 *
 * เมื่อ REQUIRE_MFA_FOR_PRIVILEGED เปิด บัญชีพนักงานที่ยังไม่ได้ลงทะเบียนสองปัจจัย จะได้รับ
 * ตั๋วเฉพาะกิจ (purpose='mfa_setup' อายุ MFA_SETUP_TICKET_TTL_SECONDS ออกให้หลังกรอกรหัสผ่านถูกแล้วเท่านั้น)
 * แทนที่จะได้ session — auth-provider.js
 *
 * ตั๋วใบนั้นคือสิ่งเดียวที่ผู้ใช้มี · แต่ /mfa/setup กับ /mfa/verify-setup เฝ้าด้วย
 * authenticateProvider ซึ่งเป็นยามของ session และปฏิเสธ token ที่มี purpose ทุกใบโดยเจตนา
 * (rejectPurposeScopedToken — PENTEST A1 ปิดช่องเอา mfa_challenge ไปใช้เป็น session)
 * ⇒ ทางออกเดียวปฏิเสธตั๋วใบเดียวที่มี · วัดจริงบน demo 2026-09-07: พนักงานทั้งห้าบทบาท
 * ล็อกอินแล้วได้ 200 พร้อมตั๋ว แล้ว /mfa/setup ตอบ 401 ทุกคน ⇒ เข้าระบบไม่ได้ถาวร
 *
 * ด่าน PENTEST A1 ถูกและต้องอยู่ต่อ สิ่งที่ต้องแก้คือด่านนี้ต้องเป็นยาม "ของการลงทะเบียน"
 * ไม่ใช่ยามของ session — วิธีเดียวกับที่ POST /mfa/verify ทำอยู่แล้ว คือตรวจ token เอง
 *
 * ขอบเขตที่ยอมรับ:
 *   1. ตั๋ว purpose='mfa_setup' ใน Authorization ที่ยังไม่หมดอายุ ชี้ไปยังบัญชีเจ้าหน้าที่ที่ใช้งานได้
 *      ออกหลัง epoch ของบัญชี และ jti ไม่ถูก blocklist (ผลตรวจอิสระ I3 รอบ 3: ตรวจเหมือนยามของ session)
 *   2. session ปกติของ provider (คนที่ล็อกอินอยู่แล้วอยากเปิดสองปัจจัยเอง)
 * ตั๋วอ่านจาก Authorization เท่านั้น ไม่อ่านคุกกี้ provider_token ก่อน: คุกกี้ที่ค้างของบัญชีอื่นเคยทำให้
 * ลงทะเบียนผิดบัญชีได้ · ตั๋วหมดอายุตอบว่าหมดเวลา ไม่ใช่รหัสผิด
 *
 * @module middleware/mfa-setup-guard
 */

const jwt = require('jsonwebtoken');
const jwtConfig = require('../config/jwt-security');
const { normalizeRole, isProviderRole } = require('../shared/canonical-rbac');
const { canAccountHoldSession } = require('../shared/account-status');
const { lookup: lookupErrorCode } = require('../shared/error-codes');
const { isTokenBeforeSessionEpoch } = require('../utils/session-epoch');
const { isAccessTokenBlocklisted } = require('../services/token-revocation-service');
// ใช้ logger ตัวรวมโดยตรง ไม่ผ่าน createLogger — ชุดเทสของ MFA mock โมดูล logger แบบไม่มี
// createLogger ไว้ การเรียกมันตอนโหลดโมดูลจะทำให้ทุกเทสในไฟล์นั้นพังตั้งแต่ require
const logger = require('../shared/logger');

const MFA_SETUP_PURPOSE = 'mfa_setup';
const MFA_SETUP_TICKET_TTL_SECONDS = 15 * 60;

function unauthorized(res, code, message, errorTh) {
    return res.status(401).json({ success: false, error: 'Unauthorized', message, code, ...(errorTh ? { errorTh } : {}) });
}

function bearerFrom(req) {
    const header = req.headers?.['authorization'];
    const headerToken = header && String(header).split(' ')[1];
    return headerToken || null;
}

/**
 * @type {import('express').RequestHandler}
 */
async function authenticateForMfaSetup(req, res, next) {
    // ทุกกรณีที่ไม่ใช่ "ตั๋วลงทะเบียน" ตกไปที่ยามของ session ตัวเดิม เพื่อให้คำปฏิเสธ
    // (ไม่มี token / token เสีย / บทบาทไม่ใช่พนักงาน) มีคำตอบเดียวกันทั้งระบบ และเพื่อให้
    // ผู้ที่ล็อกอินอยู่แล้วเปิดสองปัจจัยเองได้ตามปกติ
    const sessionGuard = () => {
        const { authenticateProvider } = require('./auth-middleware');
        return authenticateProvider(req, res, next);
    };

    const token = bearerFrom(req);
    if (!token) { return sessionGuard(); }

    let decoded = null;
    try {
        decoded = jwtConfig.verifyToken(token, 'provider');
    } catch (err) {
        if (err.code === 'TOKEN_EXPIRED' && jwt.decode(token)?.purpose === MFA_SETUP_PURPOSE) {
            return unauthorized(res, 'MFA_SETUP_TICKET_EXPIRED', 'The enrolment ticket has expired. Sign in again to get a new one.',
                'หมดเวลาลงทะเบียนแล้ว กรุณาเข้าสู่ระบบใหม่อีกครั้งเพื่อเริ่มลงทะเบียน');
        }
        logger.warn(`[MFA setup] token rejected: ${err.message}`);
        return sessionGuard();
    }

    if (decoded?.purpose !== MFA_SETUP_PURPOSE) { return sessionGuard(); }

    if (decoded.jti && await isAccessTokenBlocklisted(decoded.jti)) {
        return unauthorized(res, 'TOKEN_REVOKED', 'Token has been revoked');
    }

    const { prisma } = require('../services/prisma-database');
    const user = await prisma.user.findFirst({
        where: { id: decoded.id, isDeleted: false },
        select: { id: true, email: true, role: true, providerId: true, organizationId: true, status: true, isDeleted: true, sessionsRevokedAt: true },
    });

    if (!user?.id) {
        return unauthorized(res, 'INVALID_TOKEN', 'Invalid or expired token');
    }
    if (!isProviderRole(user.role)) {
        return res.status(403).json({
            success: false, error: 'Forbidden', message: 'Provider access only', code: 'INVALID_ROLE',
        });
    }
    if (!canAccountHoldSession(user)) {
        const row = lookupErrorCode('ACCOUNT_INACTIVE');
        return res.status(row.httpStatus).json({ success: false, error: 'Forbidden', message: `${row.messageTh} / ${row.messageEn}`, code: row.code });
    }
    if (isTokenBeforeSessionEpoch(decoded, user.sessionsRevokedAt)) {
        return unauthorized(res, 'TOKEN_REVOKED', 'Session was revoked. Please log in again.');
    }

    // เท่าที่สองเส้นทางนี้ต้องใช้จริง: id (เก็บ secret), email (ชื่อในแอป authenticator),
    // role (บันทึก audit) · ไม่แนบอะไรเกินนั้น ตั๋วนี้ไม่ใช่ session
    req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        canonicalRole: normalizeRole(user.role),
        providerId: user.providerId,
        organizationId: user.organizationId || null,
        mfaSetupTicket: true,
    };
    return next();
}

module.exports = { authenticateForMfaSetup, MFA_SETUP_PURPOSE, MFA_SETUP_TICKET_TTL_SECONDS };

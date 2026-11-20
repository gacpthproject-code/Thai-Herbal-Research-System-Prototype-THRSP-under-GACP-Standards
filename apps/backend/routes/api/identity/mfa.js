/**
 * MFA API Routes (V2)
 * For provider accounts (User model with providerId identity)
 * Prisma Implementation
 */

const express = require('express');
const router = express.Router();
const { mfaService } = require('../../../middleware/mfa-service');
// ยามของด่านลงทะเบียน: รับตั๋ว purpose='mfa_setup' ที่ประตูล็อกอินยื่นให้ หรือ session ปกติ
// ถ้าใช้ยามของ session อย่างเดียว คนที่ยังไม่ได้ลงทะเบียนจะไม่มีทางลงทะเบียนได้เลย
const { authenticateForMfaSetup } = require('../../../middleware/mfa-setup-guard');
const { auditLogger, AuditCategory } = require('../../../middleware/audit-logger');
const identityService = require('../../../services/identity-service');
const { getRequestIp, maskIp } = require('../../../utils/client-ip');
const { isSecureCookie } = require('../../../utils/cookie-security');
const { computeMfaChallengeBinding, isMfaChallengeBindingEnforced } = require('../../../shared/mfa-challenge-binding');
const logger = require('../../../shared/logger');
const jwtConfig = require('../../../config/jwt-security');
const { normalizeRole, isProviderRole } = require('../../../shared/canonical-rbac');

const { authenticateAny } = require('../../../middleware/auth-middleware');
const { isTokenBeforeSessionEpoch, sessionEpochStamp } = require('../../../utils/session-epoch');
const redisService = require('../../../services/redis-service');
const { createRateLimiter } = require('../../../middleware/rate-limiter');
const reenrolStore = require('../../../services/auth/mfa-reenrol-store');
const proofStore = require('../../../services/auth/mfa-rebind-proof-store');
const { hasUsableSecondFactor } = require('../../../shared/second-factor');

// Rate limiters — defined here so they are in scope for every route below.
// 5/15min per IP on the verification + state-change surfaces (mirrors /verify).
const mfaVerifyLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts
    message: 'Too many MFA verification attempts. Please try again in 15 minutes.',
});

const SESSION_COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1000;
const REBIND_METHOD_LABELS_TH = Object.freeze({ TOTP: 'รหัสจากแอปเครื่องเดิม', BACKUP_CODE: 'รหัสสำรอง' });

const staffFlagOn = () => process.env.REQUIRE_MFA_FOR_PRIVILEGED === 'true';
// Review L3: while the flag is on, a staff member moves the factor (path ก) instead of turning it off.
const staffMayNotDisable = (req) => staffFlagOn() && isProviderRole(req.user.role);
// An account moves its factor only when it holds one that still works; an enabled row on the
// retired EMAIL method (review I6) has no seed and enrols afresh like a new account.
const holdsUsableFactor = (current) => hasUsableSecondFactor(current) && Boolean(current?.twoFactorSecret);

// The session that is asking: the token id (stable for a provider access token).
const sessionIdOf = (req) => {
    const sid = req.user?.sessionFamilyId || req.user?.jti;
    return typeof sid === 'string' && sid.trim() ? sid.trim() : null;
};

function reenrolUnavailable(res) {
    return res.status(503).json({
        success: false,
        code: 'MFA_REENROL_UNAVAILABLE',
        error: 'Cannot start re-enrolment right now. Your current 2FA is unchanged; try again later.',
    });
}

async function auditMfa(req, action, metadata) {
    await auditLogger.log({
        category: AuditCategory.SECURITY,
        action,
        actorId: req.user.id,
        actorRole: req.user.role,
        resourceType: 'USER',
        resourceId: req.user.id,
        ipAddress: getRequestIp(req),
        userAgent: req.headers['user-agent'],
        ...(metadata ? { metadata } : {}),
    });
}

/**
 * GET /status
 * Read-only check: does the current provider have MFA enabled?
 * Used by the security settings page so it can render either the
 * "enable" CTA or the "disable" form without first calling /setup
 * (which would overwrite an in-progress secret).
 */
// authenticateAny: both portals (health + provider) can read/manage their 2FA.
router.get('/status', authenticateAny, async (req, res) => {
    try {
        const user = await identityService.getMfaStatus(req.user.id);
        const enabled = Boolean(user?.twoFactorEnabled);
        res.json({
            success: true,
            data: {
                enabled,
                disableAllowed: !staffMayNotDisable(req),
                rebindProofAvailable: enabled && await proofStore.peek(req.user.id, sessionIdOf(req)),
            },
        });
    } catch (error) {
        logger.error('[MFA] Status error:', error);
        res.status(500).json({ success: false, error: 'Status read failed' });
    }
});

function newFactor() {
    const secret = mfaService.generateSecret();
    const backupCodes = mfaService.generateBackupCodes();
    return { secret, backupCodes, hashedBackupCodes: backupCodes.map((code) => mfaService.hashBackupCode(code)) };
}

/**
 * What proves the start of a move: one unused backup code (spent here, atomically), the proof
 * left by a sign-in with a backup code (spent here, once), or a code from the current app.
 * @returns {Promise<{ method: 'TOTP'|'BACKUP_CODE', consumedHash: string|null }|null>}
 */
async function proveRebind(userId, session, current, body) {
    const backupCode = typeof body?.backupCode === 'string' ? body.backupCode.trim() : '';
    if (backupCode) {
        const hash = mfaService.hashBackupCode(backupCode);
        return (await identityService.consumeBackupCode(userId, hash)) ? { method: 'BACKUP_CODE', consumedHash: hash } : null;
    }
    if (body?.useSignInProof === true) {
        return (await proofStore.consume(userId, session)) ? { method: 'BACKUP_CODE', consumedHash: null } : null;
    }
    const code = body?.code;
    if (typeof code === 'string' && mfaService.verifyTOTP(current.twoFactorSecret, code)) {
        return { method: 'TOTP', consumedHash: null };
    }
    return null;
}

function rebindRefusalReason(body) {
    if (body?.backupCode !== undefined) { return 'Invalid backup code'; }
    if (body?.useSignInProof !== undefined) { return 'No usable sign-in proof'; }
    if (body?.code) { return 'Invalid current code'; }
    return 'Current code missing';
}

const limitSetupWhenProving = (req, res, next) => (
    req.body && (req.body.code !== undefined || req.body.backupCode !== undefined || req.body.useSignInProof !== undefined)
        ? mfaVerifyLimiter(req, res, next)
        : next()
);

/**
 * POST /setup
 * First enrolment: a secret and the backup codes, shown once. On an enabled account: start
 * moving the factor to a new device.
 */
router.post('/setup', limitSetupWhenProving, authenticateForMfaSetup, async (req, res) => {
    try {
        const userId = req.user.id;
        const email = req.user.email;

        const current = await identityService.findSecondFactorForRebind(userId);
        if (holdsUsableFactor(current)) {
            const session = sessionIdOf(req);
            if (!session) {
                // A re-enrol must be finishable only by the session that started it.
                await auditMfa(req, 'MFA_REENROL_REFUSED', { reason: 'Session has no token id' });
                return res.status(403).json({
                    success: false,
                    code: 'MFA_REENROL_SESSION_MISMATCH',
                    error: 'Sign in again to move your 2FA to a new device.',
                });
            }
            const proof = await proveRebind(userId, session, current, req.body);
            if (!proof) {
                await auditMfa(req, 'MFA_REENROL_REFUSED', { reason: rebindRefusalReason(req.body) });
                return res.status(401).json({
                    success: false,
                    code: 'MFA_CODE_REQUIRED',
                    error: 'Invalid code',
                });
            }
            const factor = newFactor();
            try {
                await reenrolStore.start(userId, {
                    secret: factor.secret, session, method: proof.method, backupHashes: factor.hashedBackupCodes,
                });
            } catch (storeErr) {
                if (storeErr instanceof redisService.RedisUnavailableError) {
                    if (proof.consumedHash) { await identityService.restoreBackupCode(userId, proof.consumedHash); }
                    return reenrolUnavailable(res);
                }
                throw storeErr;
            }
            await auditMfa(req, 'MFA_REENROL_INITIATED', { method: proof.method, provedBy: proof.consumedHash ? 'CODE' : (req.body?.useSignInProof === true ? 'SIGN_IN_PROOF' : 'TOTP') });
            return res.json({
                success: true,
                data: {
                    secret: factor.secret,
                    qrCodeUri: mfaService.generateQRCodeUri(factor.secret, email),
                    backupCodes: factor.backupCodes,
                    reenrol: true,
                    method: proof.method,
                    message: 'Scan the QR code with the new authenticator and save these backup codes, then verify with a code from the new entry. Your current 2FA stays active until then.',
                },
            });
        }

        const factor = newFactor();
        await identityService.storePendingSecondFactor(userId, {
            secret: factor.secret, hashedBackupCodes: factor.hashedBackupCodes,
        });

        await auditLogger.log({
            category: AuditCategory.SECURITY,
            action: 'MFA_SETUP_INITIATED',
            actorId: userId,
            actorRole: req.user.role,
            resourceType: 'USER',
            resourceId: userId,
            ipAddress: getRequestIp(req),
            userAgent: req.headers['user-agent'],
        });

        res.json({
            success: true,
            data: {
                secret: factor.secret,
                qrCodeUri: mfaService.generateQRCodeUri(factor.secret, email),
                backupCodes: factor.backupCodes,
                message: 'Scan QR code with authenticator app and save these backup codes, then verify with a code',
            },
        });
    } catch (error) {
        logger.error('[MFA] Setup error:', error);
        res.status(500).json({ success: false, error: 'Setup failed' });
    }
});

/**
 * POST /verify-setup
 * Confirm the device with its first code. Needs `backupCodesSaved: true` (order 89 ก1).
 */
router.post('/verify-setup', mfaVerifyLimiter, authenticateForMfaSetup, async (req, res) => {
    try {
        const { code } = req.body;
        const userId = req.user.id;

        if (!code || code.length !== 6) {
            return res.status(400).json({
                success: false,
                error: 'Invalid code format',
            });
        }
        if (req.body.backupCodesSaved !== true) {
            return res.status(400).json({
                success: false,
                code: 'MFA_BACKUP_CODES_NOT_CONFIRMED',
                error: 'Confirm that you saved your backup codes before enabling 2FA.',
                errorTh: 'กรุณายืนยันว่าบันทึกรหัสสำรองแล้ว ก่อนเปิดใช้งานการยืนยันตัวตนสองชั้น',
            });
        }

        const current = await identityService.findSecondFactorForRebind(userId);
        if (holdsUsableFactor(current)) {
            let pending;
            try {
                pending = await reenrolStore.read(userId);
            } catch (storeErr) {
                if (storeErr instanceof redisService.RedisUnavailableError) {
                    return reenrolUnavailable(res);
                }
                throw storeErr;
            }
            if (!pending?.secret || !Array.isArray(pending.backupHashes)) {
                return res.status(400).json({
                    success: false,
                    error: 'MFA is already enabled. To move to a new device, start setup with your current code or a backup code first.',
                });
            }
            const session = sessionIdOf(req);
            if (!session || !pending.session || session !== pending.session) {
                await auditMfa(req, 'MFA_REENROL_REFUSED', { reason: 'Different session' });
                return res.status(403).json({
                    success: false,
                    code: 'MFA_REENROL_SESSION_MISMATCH',
                    error: 'Finish moving your 2FA from the same sign-in that started it.',
                });
            }
            // Claim the attempt BEFORE checking the code (atomic INCR): at most 5 code
            // checks against this pending secret, however many run in parallel.
            let claim;
            try {
                claim = await reenrolStore.claimAttempt(userId, pending);
            } catch (storeErr) {
                if (storeErr instanceof redisService.RedisUnavailableError) {
                    return reenrolUnavailable(res);
                }
                throw storeErr;
            }
            if (!claim.allowed) {
                await reenrolStore.clear(userId, 'attempts-exhausted');
                return res.status(400).json({
                    success: false,
                    code: 'MFA_REENROL_RESTART',
                    error: 'Too many wrong codes. Start again with the code from your current app. Your current 2FA is unchanged.',
                });
            }
            if (!mfaService.verifyTOTP(pending.secret, code)) {
                let outcome;
                try {
                    outcome = await reenrolStore.recordFailure(userId, claim.attempt);
                } catch (storeErr) {
                    if (storeErr instanceof redisService.RedisUnavailableError) {
                        return reenrolUnavailable(res);
                    }
                    throw storeErr;
                }
                await auditMfa(req, 'MFA_SETUP_FAILED', {
                    reason: 'Invalid verification code', reenrol: true, failedCodes: outcome.failures,
                });
                if (outcome.exhausted) {
                    return res.status(400).json({
                        success: false,
                        code: 'MFA_REENROL_RESTART',
                        error: 'Too many wrong codes. Start again with the code from your current app. Your current 2FA is unchanged.',
                    });
                }
                return res.status(400).json({
                    success: false,
                    error: 'Invalid code. Please try again.',
                });
            }
            const method = pending.method === 'BACKUP_CODE' ? 'BACKUP_CODE' : 'TOTP';
            const movedAt = new Date();
            const ipMasked = maskIp(getRequestIp(req));
            const stamp = sessionEpochStamp();
            const changeData = { method, methodLabel: REBIND_METHOD_LABELS_TH[method], movedAt: movedAt.toISOString(), ipMasked };
            await identityService.moveSecondFactor(userId, {
                secret: pending.secret,
                hashedBackupCodes: pending.backupHashes,
                sessionsRevokedAt: stamp,
            }, {
                auditEvent: {
                    category: AuditCategory.SECURITY,
                    action: 'MFA_REENROLLED',
                    actorId: userId,
                    actorRole: req.user.role,
                    resourceType: 'USER',
                    resourceId: userId,
                    ipAddress: ipMasked,
                    userAgent: req.headers['user-agent'],
                    metadata: { ...changeData, otherSessionsRevoked: true, sessionsRevokedAt: stamp.toISOString() },
                },
                noticeData: changeData,
                adminNoticeData: changeData,
            });
            await reenrolStore.clear(userId, 'reenrolled');
            try {
                await require('../../../services/token-revocation-service').revokeAllUserTokens(userId);
            } catch (revokeErr) {
                logger.warn('[MFA] re-enrol: refresh-token revocation failed (epoch still applies):', revokeErr.message);
            }
            // Keep THIS session: a fresh provider token issued AT the stamp, so the epoch check
            // (iat < stamp → refused) lets it through. It expires when the token it replaces would
            // have (order 93 item 4: the performing device gets no longer sign-in than it had).
            const stampSec = Math.floor(stamp.getTime() / 1000);
            const remainingSec = typeof req.user.exp === 'number' ? Math.max(1, req.user.exp - stampSec) : null;
            const freshToken = jwtConfig.generateToken({
                id: req.user.id,
                uuid: req.user.uuid,
                email: req.user.email,
                role: req.user.role,
                canonicalRole: req.user.canonicalRole,
                authType: req.user.authType || 'PROVIDER_ID',
                userType: req.user.userType || 'PROVIDER_ID',
                organizationId: req.user.organizationId || null,
                iat: stampSec,
            }, 'provider', remainingSec ? { expiresIn: remainingSec } : {});
            res.cookie('provider_token', freshToken, {
                httpOnly: true,
                secure: isSecureCookie(),
                sameSite: 'lax',
                maxAge: remainingSec ? Math.min(SESSION_COOKIE_MAX_AGE_MS, remainingSec * 1000) : SESSION_COOKIE_MAX_AGE_MS,
                path: '/',
            });
            return res.json({
                success: true,
                data: {
                    message: 'MFA moved to the new authenticator. The old device and the old backup codes no longer work. You were signed out everywhere else.',
                    token: freshToken,
                    method,
                },
            });
        }

        const pendingRow = await identityService.findPendingSecondFactor(userId);
        if (!pendingRow?.twoFactorSecret) {
            return res.status(400).json({
                success: false,
                error: 'MFA not initialized. Please start setup first.',
            });
        }

        if (!mfaService.verifyTOTP(pendingRow.twoFactorSecret, code)) {
            await auditLogger.log({
                category: AuditCategory.SECURITY,
                action: 'MFA_SETUP_FAILED',
                actorId: userId,
                actorRole: req.user.role,
                resourceType: 'USER',
                resourceId: userId,
                ipAddress: getRequestIp(req),
                userAgent: req.headers['user-agent'],
                metadata: { reason: 'Invalid verification code' },
            });

            return res.status(400).json({
                success: false,
                error: 'Invalid code. Please try again.',
            });
        }

        const ipMasked = maskIp(getRequestIp(req));
        await identityService.enableSecondFactor(userId, {
            auditEvent: {
                category: AuditCategory.SECURITY,
                action: 'MFA_ENABLED',
                actorId: userId,
                actorRole: req.user.role,
                resourceType: 'USER',
                resourceId: userId,
                ipAddress: getRequestIp(req),
                userAgent: req.headers['user-agent'],
            },
            adminNoticeData: { enrolledAt: new Date().toISOString(), ipMasked },
        });

        res.json({
            success: true,
            data: {
                message: 'MFA enabled successfully',
            },
        });
    } catch (error) {
        logger.error('[MFA] Verify setup error:', error);
        res.status(500).json({ success: false, error: 'Verification failed' });
    }
});

/**
 * POST /verify
 * Verify MFA code during login and complete authentication.
 * Accepts a signed mfa_session token (not raw userId) for security.
 * On success, issues full auth JWT tokens + sets cookies.
 * Rate limited: 5 attempts per 15 minutes per IP
 */
router.post('/verify', mfaVerifyLimiter, async (req, res) => {
    try {
        const { mfa_session, code, isBackupCode } = req.body;

        // Phase 2 #2.13: the legacy `userId` body field is no longer
        // accepted. Before this commit, callers could bypass the signed
        // mfa_session token by sending a plaintext userId — an MFA bypass
        // for any client that knew the target user's ID. The signed
        // session token (purpose='mfa_challenge', short TTL, audience-
        // bound to provider/public) is now the only path.
        let userId;
        let challengeBind = null;
        let challengeMethod = null; // from the JWT challenge (decoded.method) — only 'TOTP' can be minted since 2026-09-15
        let challengeJti = null;    // single-use key (M-2 replay guard)
        let challengeExp = null;    // unix seconds — bounds the jti's Redis TTL
        let challengeIat = null;    // unix seconds — compared with the owner's session epoch (SECU-03)

        if (!mfa_session || typeof mfa_session !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'MFA session token is required. Please log in again.',
                errorTh: 'ต้องการ MFA session token กรุณาเข้าสู่ระบบใหม่',
            });
        }
        // Type-guard the code up front: a non-string (e.g. {} or number) would
        // otherwise reach hashBackupCode(code).replace()/verifyTOTP and throw a
        // 500 instead of a clean 400 (no bypass — no token is issued on bad input).
        if (code !== undefined && code !== null && typeof code !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Verification code must be a string',
                errorTh: 'รหัสยืนยันไม่ถูกต้อง',
            });
        }

        // Verify the signed MFA session token. Provider audience first,
        // then public. Mismatched purpose / expired / wrong audience all
        // surface as 401 — never a soft fallback.
        try {
            let decoded;
            try {
                decoded = jwtConfig.verifyToken(mfa_session, 'provider');
            } catch {
                decoded = jwtConfig.verifyToken(mfa_session, 'public');
            }

            if (decoded.purpose !== 'mfa_challenge') {
                return res.status(403).json({
                    success: false,
                    error: 'Invalid MFA session token',
                });
            }

            // Enforce JTI on the MFA challenge token. This verifies the token
            // directly rather than through the central middleware, so it needs
            // its own jti check to keep the revocation gate consistent. Honour
            // the LEGACY_NO_JTI_GRACE_UNTIL rollout window.
            const jti = decoded && typeof decoded.jti === 'string' ? decoded.jti.trim() : '';
            if (!jti) {
                const graceRaw = process.env.LEGACY_NO_JTI_GRACE_UNTIL;
                const graceUntil = graceRaw ? Date.parse(String(graceRaw).trim()) : NaN;
                const inGrace = Number.isFinite(graceUntil) && Date.now() < graceUntil;
                if (!inGrace) {
                    return res.status(401).json({
                        success: false,
                        code: 'TOKEN_NO_JTI',
                        error: 'MFA session token missing JTI claim',
                        errorTh: 'โทเค็น MFA ไม่มี JTI claim กรุณาเข้าสู่ระบบใหม่',
                    });
                }
                console.warn(
                    `[AUTH] /mfa/verify accepting legacy mfa_session without jti during grace window ` +
                    `(until=${new Date(graceUntil).toISOString()}). Revocation cannot be enforced.`,
                );
            }

            userId = decoded.id;
            challengeBind = typeof decoded.bind === 'string' ? decoded.bind : null;
            challengeMethod = typeof decoded.method === 'string' ? decoded.method : null;
            challengeJti = jti || null;
            challengeExp = typeof decoded.exp === 'number' ? decoded.exp : null;
            challengeIat = typeof decoded.iat === 'number' ? decoded.iat : null;
        } catch (_tokenError) {
            return res.status(401).json({
                success: false,
                error: 'MFA session expired. Please login again.',
                errorTh: 'เซสชัน MFA หมดอายุ กรุณาเข้าสู่ระบบใหม่',
            });
        }

        // AUTH-5: enforce the IP/User-Agent binding the challenge was issued
        // with. A mismatch means the mfa_session is being completed from a
        // different network/agent than the one that passed the password step —
        // the classic challenge-hijack signal. Legacy tokens minted before this
        // rollout carry no `bind` claim and pass through (they expire in 5 min);
        // enforcement can be relaxed via MFA_CHALLENGE_BIND_ENFORCE=false.
        if (challengeBind) {
            const expectedBind = computeMfaChallengeBinding(getRequestIp(req), req.headers['user-agent']);
            if (challengeBind !== expectedBind) {
                await auditLogger.log({
                    category: AuditCategory.SECURITY,
                    action: 'MFA_CHALLENGE_BINDING_MISMATCH',
                    actorId: userId,
                    actorRole: 'UNKNOWN',
                    resourceType: 'USER',
                    resourceId: userId,
                    ipAddress: getRequestIp(req),
                    userAgent: req.headers['user-agent'],
                    result: 'FAILURE',
                }).catch(() => {});
                if (isMfaChallengeBindingEnforced()) {
                    return res.status(401).json({
                        success: false,
                        code: 'MFA_CHALLENGE_BINDING_MISMATCH',
                        error: 'MFA session does not match this device or network. Please log in again.',
                        errorTh: 'เซสชัน MFA ไม่ตรงกับอุปกรณ์หรือเครือข่ายนี้ กรุณาเข้าสู่ระบบใหม่',
                    });
                }
                logger.warn('[AUTH] /mfa/verify binding mismatch (monitor mode — allowed)', { userId });
            }
        }

        if (!code) {
            return res.status(400).json({
                success: false,
                error: 'Verification code required',
            });
        }

        const user = await identityService.findUserForMfaVerify(userId);

        // SECU-03: a challenge minted before the owner's sessions were revoked
        // (password change/reset, disable, role change, the emergency clear) is dead
        // like every access/refresh token of that age. Checked before any other reading
        // of the row, so a backup code is not consumed and an account the clear left
        // without a factor answers TOKEN_REVOKED, not "not enabled" (order 93 item 5).
        if (isTokenBeforeSessionEpoch({ iat: challengeIat }, user?.sessionsRevokedAt || null)) {
            return res.status(401).json({
                success: false,
                code: 'TOKEN_REVOKED',
                error: 'MFA session has been revoked. Please log in again.',
                errorTh: 'เซสชัน MFA ถูกเพิกถอนแล้ว กรุณาเข้าสู่ระบบใหม่',
            });
        }

        if (!user?.twoFactorEnabled) {
            return res.status(400).json({
                success: false,
                error: 'MFA not enabled for this user',
            });
        }

        let isValid = false;

        // Which factor to verify: the JWT challenge carries `method` (minted by
        // mintMfaChallengeToken); fall back to the user row, then TOTP for legacy.
        // Since 2026-09-15 TOTP is the only factor (operator: no email second factor).
        // A challenge or row still naming the retired EMAIL method cannot be
        // verified by anything — refuse it rather than pretend to check a code.
        const method = challengeMethod || user.twoFactorMethod || 'TOTP';
        if (method !== 'TOTP') {
            return res.status(400).json({
                success: false,
                code: 'MFA_METHOD_RETIRED',
                error: 'This second-factor method has been retired. Please log in again.',
                errorTh: 'วิธียืนยันตัวตนนี้ถูกยกเลิกแล้ว กรุณาเข้าสู่ระบบใหม่',
            });
        }

        if (isBackupCode) {
            isValid = await identityService.consumeBackupCode(userId, mfaService.hashBackupCode(code));
        } else {
            // Verify TOTP (authenticator app). Guard the null-secret case: a row a
            // not-yet-run migration left without a seed would otherwise hit
            // verifyTOTP(null,…) → base32 decode throws → 500. Return a clean 400 (still no bypass — isValid stays false).
            if (!user.twoFactorSecret) {
                return res.status(400).json({
                    success: false,
                    code: 'MFA_METHOD_MISMATCH',
                    error: 'MFA method mismatch. Please log in again.',
                    errorTh: 'วิธียืนยันตัวตนไม่ตรงกัน กรุณาเข้าสู่ระบบใหม่',
                });
            }
            isValid = mfaService.verifyTOTP(user.twoFactorSecret, code);
        }

        // Log attempt
        await auditLogger.log({
            category: AuditCategory.AUTHENTICATION,
            action: isValid ? 'MFA_VERIFY_SUCCESS' : 'MFA_VERIFY_FAILED',
            actorId: userId,
            actorRole: user.role,
            resourceType: 'USER',
            resourceId: userId,
            ipAddress: getRequestIp(req),
            userAgent: req.headers['user-agent'],
            result: isValid ? 'SUCCESS' : 'FAILURE',
            ...(isValid && isBackupCode ? { metadata: { method: 'BACKUP_CODE' } } : {}),
        });

        if (!isValid) {
            return res.status(401).json({
                success: false,
                error: 'Invalid code',
                errorTh: 'รหัส MFA ไม่ถูกต้อง',
            });
        }

        // M-2 (replay guard): single-use the challenge jti now that the code
        // verified. The mfa_session JWT is otherwise valid for its full ~5-min
        // TTL, and TOTP stays valid across its time window — so a captured
        // SUCCESSFUL /verify could be replayed to mint extra 8h sessions. Backup
        // codes are already single-use (one conditional UPDATE); this
        // closes the TOTP gap. Fail OPEN if Redis is unreachable (the IP/UA bind
        // + 5/15min limiter still constrain replay; 2FA is opt-in) but REJECT a
        // confirmed reuse.
        //
        // W1-5 (2026-08-22): setNX returns false on BOTH "exists" and
        // "redis-down". This used to be disambiguated by a follow-up `get`
        // whose null could ALSO mean either — it happened to land on "allow"
        // because both unknowns collapse to null, which is right by luck, not
        // by construction. `getStrict` makes it explicit: a rejection is the
        // outage (documented fail-open, now logged as such), a null is a
        // genuinely absent key, and a value is a confirmed replay.
        //
        // OPERATOR NOTE: this fail-open is inherited from the original design
        // and is the one MFA-adjacent path still allowed to pass during an
        // outage. It guards replay of an ALREADY-verified challenge, not the
        // code check itself, which reads the TOTP seed or backup codes from the
        // database and cannot pass on a store outage. Worth revisiting alongside
        // the access-token blocklist policy.
        if (challengeJti) {
            try {
                const jtiKey = `mfa-jti:${challengeJti}`;
                const nowSec = Math.floor(Date.now() / 1000);
                const ttl = challengeExp && challengeExp > nowSec ? (challengeExp - nowSec) : 300;
                const claimed = await redisService.setNX(jtiKey, '1', ttl);
                if (!claimed && (await redisService.getStrict(jtiKey))) {
                    await auditLogger.log({
                        category: AuditCategory.SECURITY,
                        action: 'MFA_CHALLENGE_REPLAY_BLOCKED',
                        actorId: userId,
                        actorRole: user.role,
                        resourceType: 'USER',
                        resourceId: userId,
                        ipAddress: getRequestIp(req),
                        userAgent: req.headers['user-agent'],
                        result: 'FAILURE',
                    }).catch(() => {});
                    return res.status(401).json({
                        success: false,
                        code: 'MFA_CHALLENGE_REUSED',
                        error: 'This verification was already used. Please log in again.',
                        errorTh: 'การยืนยันนี้ถูกใช้ไปแล้ว กรุณาเข้าสู่ระบบใหม่',
                    });
                }
            } catch (jtiErr) {
                logger.warn('[MFA] jti single-use check failed (allowing — Redis issue):', jtiErr?.message || jtiErr);
            }
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // MFA verified — complete login by issuing full auth tokens
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const canonicalRole = normalizeRole(user.role);
        const isProvider = isProviderRole(canonicalRole);
        const jwtTokenType = isProvider ? 'provider' : 'public';

        // PDPA Sprint 6 (final sweep): JWTs no longer carry raw 13-digit
        // identifiers — see prisma-auth-service.js for the canonical login
        // payload shape. Embedding `healthId`/`providerId` in the JWT here
        // meant every downstream service that decoded the token saw the
        // bare national ID, undoing the Batch 1 fix on the MFA path.
        // Identity is now resolved server-side from `id` (UUID).
        const sessionJti = jwtConfig.generateJti();
        const tokenPayload = {
            id: user.id,
            uuid: user.uuid,
            email: user.email,
            role: user.role,
            canonicalRole,
            authType: isProvider ? 'PROVIDER_ID' : 'HEALTH_ID',
            userType: isProvider ? 'PROVIDER_ID' : 'HEALTH_ID',
            // ADR-014: tenant claim — see tenant-context-middleware.
            organizationId: user.organizationId || null,
            jti: sessionJti,
        };

        const fullToken = jwtConfig.generateToken(tokenPayload, jwtTokenType);

        // Set auth cookie
        const isSecure = isSecureCookie();
        const cookieName = isProvider ? 'provider_token' : 'auth_token';
        res.cookie(cookieName, fullToken, {
            httpOnly: true,
            secure: isSecure,
            sameSite: 'lax',
            maxAge: SESSION_COOKIE_MAX_AGE_MS,
            path: '/',
        });

        // A sign-in with a backup code is what proves a move to a new device (order 89 ก):
        // the proof is bound to this session and spent once by /setup.
        if (isBackupCode) {
            await proofStore.grant(user.id, sessionJti);
        }

        // Update last login
        await identityService.touchLastLogin(userId);

        logger.info(`[MFA] Login completed after MFA verification for: ${user.role} ${userId}`);

        // PDPA Sprint 6 (final sweep): never echo raw 13-digit identifier
        // in the response. Clients that need a display value should call
        // the profile endpoint, which returns a masked form.
        res.json({
            success: true,
            message: 'MFA verification successful',
            data: {
                token: fullToken,
                user: {
                    id: user.id,
                    uuid: user.uuid,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    role: user.role,
                    canonicalRole,
                    authType: tokenPayload.authType,
                    userType: tokenPayload.userType,
                },
            },
        });
    } catch (error) {
        logger.error('[MFA] Verify error:', error);
        res.status(500).json({ success: false, error: 'Verification failed' });
    }
});

/**
 * DELETE /disable
 * Disable MFA (requires current code)
 */
router.delete('/disable', mfaVerifyLimiter, authenticateAny, async (req, res) => {
    try {
        const { code } = req.body;
        const userId = req.user.id;

        if (staffMayNotDisable(req)) {
            return res.status(403).json({
                success: false,
                code: 'MFA_DISABLE_NOT_FOR_STAFF',
                error: 'Staff accounts keep two-factor sign-in. To change device, move it to the new authenticator instead.',
                errorTh: 'บัญชีเจ้าหน้าที่ปิดการยืนยันตัวตนสองชั้นเองไม่ได้ หากเปลี่ยนเครื่อง ให้ใช้การย้ายไปเครื่องใหม่ด้วยรหัสจากแอปเดิมหรือรหัสสำรองแทน',
            });
        }

        const user = await identityService.findMfaSecretForDisable(userId);

        if (!user?.twoFactorEnabled) {
            return res.status(400).json({
                success: false,
                error: 'MFA is not enabled',
            });
        }

        // Verify the current TOTP code before disabling. A legacy row still on the
        // retired EMAIL method (no seed) cannot prove anything — refuse; the
        // migration turns such rows off anyway.
        const isValid = user.twoFactorSecret ? mfaService.verifyTOTP(user.twoFactorSecret, code) : false;

        if (!isValid) {
            return res.status(401).json({
                success: false,
                error: 'Invalid code',
            });
        }

        // Disable MFA
        await identityService.disableMfa(userId);
        // A half-finished move to a new device must not outlive the factor it was replacing.
        await reenrolStore.clear(userId, 'disable');

        // Log
        await auditLogger.log({
            category: AuditCategory.SECURITY,
            action: 'MFA_DISABLED',
            actorId: userId,
            actorRole: req.user.role,
            resourceType: 'USER',
            resourceId: userId,
            ipAddress: getRequestIp(req),
            userAgent: req.headers['user-agent'],
        });

        res.json({
            success: true,
            message: 'MFA disabled successfully',
        });
    } catch (error) {
        logger.error('[MFA] Disable error:', error);
        res.status(500).json({ success: false, error: 'Failed to disable MFA' });
    }
});

module.exports = router;

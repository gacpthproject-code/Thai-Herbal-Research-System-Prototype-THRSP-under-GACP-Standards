/**
 * Identity Service
 *
 * Owns the per-user identity reads/writes that the MFA + consent routes
 * issued directly against `prisma.user.*`. Built for Batch 15 of the
 * prisma-bypass cleanup (2026-05-16) to replace direct prisma access in:
 *
 *   - routes/api/identity/mfa.js
 *
 * Service-boundary invariants:
 *   - Soft-delete on User is enforced (`isDeleted: false`) on every read.
 *     A deleted user must not be able to enable MFA, verify TOTP, or
 *     mark a backup code as used — those paths sit between the JWT verify
 *     gate and the auth-token issue, so the check has to live here.
 *   - Column projection is intentionally narrow per-method. Anything that
 *     does not need `twoFactorSecret` or `twoFactorBackupCodes` (e.g. the
 *     status check) MUST NOT select them — these are sensitive and a
 *     route bug that returns the result wholesale would leak the TOTP
 *     secret to the client.
 *   - There is no path here that returns `password`, `healthId`, or
 *     `providerId` in plain form. Identity resolution (e.g. for JWT
 *     issuance) goes through `user-lookup-service`, which masks those
 *     columns by default — see PDPA Sprint 6.
 */

const { prisma } = require('./prisma-database');
const { canAccountHoldSession } = require('../shared/account-status');
const { auditLogger } = require('../middleware/audit-logger');
const { sendNotification, NotifyType } = require('./notification-service');
const { CANONICAL_ROLES, adminManagesRole } = require('../shared/canonical-rbac');
const { withoutTenantScope } = require('./tenant-context');
const { maskEmail } = require('../utils/field-encryption');
const { staffRoleLabel } = require('../shared/role-labels-th');

// Sensitive fields that may only appear in the verify-login payload.
// Kept as a single source of truth so multiple methods can't drift on
// which columns they return.
const MFA_VERIFY_USER_SELECT = Object.freeze({
    id: true,
    uuid: true,
    email: true,
    healthId: true,
    providerId: true,
    firstName: true,
    lastName: true,
    role: true,
    authType: true,
    ministryVerified: true,
    twoFactorSecret: true,
    twoFactorEnabled: true,
    twoFactorBackupCodes: true,
    // 2FA method discriminator. TOTP is the only factor since 2026-09-15; the
    // /mfa/verify handler reads this only to refuse a row still on a retired method.
    twoFactorMethod: true,
    // ADR-014 tenant claim. Without this, the MFA-completed session token
    // carried organizationId:null (claim-poorer than a normal login → an extra
    // tenant-context DB lookup on every request). User has organizationId
    // (auth.prisma model User), so select it to mint a parity session token.
    organizationId: true,
    // SECU-03: read by findUserForMfaVerify's status gate (staff vs applicant
    // rule follows `role` above) and by the route's session-epoch check on the
    // challenge. The route never echoes either.
    status: true,
    sessionsRevokedAt: true,
});

// What the same-side admins' notice names about the account (never an ID number or a secret).
const SUBJECT_SELECT = Object.freeze({ id: true, role: true, organizationId: true, firstName: true, lastName: true, email: true });
const ADMIN_ROLES = Object.freeze([CANONICAL_ROLES.SYSTEM_ADMIN_DTAM, CANONICAL_ROLES.SYSTEM_ADMIN_PLATFORM]);

/**
 * The admins who may act on this account (orders 13 and 17): system_admin_dtam of the same
 * organization for a DTAM-side account, every active system_admin_platform for a company-side
 * one. The account itself is never a recipient of its own notice.
 */
async function sameSideAdminsOf(db, subject) {
    const sides = ADMIN_ROLES.filter((adminRole) => adminManagesRole(adminRole, subject.role)).map((adminRole) => (
        adminRole === CANONICAL_ROLES.SYSTEM_ADMIN_DTAM
            ? { role: adminRole, organizationId: subject.organizationId }
            : { role: adminRole }
    ));
    if (!sides.length) { return []; }
    return withoutTenantScope(() => db.user.findMany({
        where: { isDeleted: false, status: 'ACTIVE', id: { not: subject.id }, OR: sides },
        select: { id: true, organizationId: true },
    }));
}

async function notifySameSideAdmins(db, subject, noticeData) {
    const admins = await sameSideAdminsOf(db, subject);
    const data = {
        ...noticeData,
        subjectUserId: subject.id,
        subjectName: [subject.firstName, subject.lastName].filter(Boolean).join(' ') || '-',
        subjectRoleLabel: staffRoleLabel(subject.role),
        subjectEmailMasked: maskEmail(subject.email) || '',
    };
    for (const admin of admins) {
        const notice = await sendNotification(admin.id, NotifyType.STAFF_SECOND_FACTOR_CHANGED, data, {}, {
            db, organizationId: admin.organizationId,
        });
        if (!notice) {
            throw new Error('second-factor change: an admin notice was not written, so the change is rolled back');
        }
    }
    return admins.length;
}

/** True when the latest emergency clear of this account has no enrolment or move after it. */
async function followsEmergencyReset(db, userId) {
    return withoutTenantScope(async () => {
        const reset = await db.auditLog.findFirst({
            where: { resourceId: userId, action: 'MFA_EMERGENCY_RESET' },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
        });
        if (!reset) { return false; }
        const since = await db.auditLog.count({
            where: { resourceId: userId, action: { in: ['MFA_ENABLED', 'MFA_REENROLLED'] }, createdAt: { gt: reset.createdAt } },
        });
        return since === 0;
    });
}

class IdentityService {
    /**
     * Replaces routes/api/identity/mfa.js:27 prisma.user.findUnique
     * Read-only MFA status check used by the security settings page —
     * returns only the `twoFactorEnabled` boolean. The TOTP secret is
     * intentionally NOT included.
     */
    async getMfaStatus(userId) {
        return prisma.user.findFirst({
            where: { id: userId, isDeleted: false },
            // The email column is not read: it only served the email-2FA enrol
            // page, retired 2026-09-15 (no email in the system).
            select: { twoFactorEnabled: true },
        });
    }

    async storePendingSecondFactor(userId, { secret, hashedBackupCodes }) {
        return prisma.user.update({
            where: { id: userId },
            data: {
                twoFactorSecret: secret,
                twoFactorEnabled: false,
                twoFactorBackupCodes: hashedBackupCodes,
            },
        });
    }

    async findPendingSecondFactor(userId) {
        return prisma.user.findFirst({
            where: { id: userId, isDeleted: false },
            select: { twoFactorSecret: true },
        });
    }

    /**
     * First enrolment, in one transaction with its audit row. When the latest emergency clear
     * (order 89 ข) has no enrolment after it, the same-side admins are told in the same
     * transaction (review M3): the person who enrols after a clear must be the owner.
     */
    async enableSecondFactor(userId, { auditEvent, adminNoticeData } = {}) {
        return prisma.$transaction(async (tx) => {
            const user = await tx.user.update({
                where: { id: userId },
                data: {
                    twoFactorEnabled: true,
                    twoFactorMethod: 'TOTP',
                },
                select: SUBJECT_SELECT,
            });
            if (!auditEvent) { return user; }
            const afterReset = await followsEmergencyReset(tx, userId);
            await auditLogger.logWithin({
                ...auditEvent,
                organizationId: user.organizationId,
                metadata: { ...(auditEvent.metadata || {}), afterEmergencyReset: afterReset },
            }, tx);
            if (afterReset) {
                await notifySameSideAdmins(tx, user, { ...adminNoticeData, event: 'ENROLLED_AFTER_EMERGENCY_RESET' });
            }
            return user;
        });
    }

    async findSecondFactorForRebind(userId) {
        return prisma.user.findFirst({
            where: { id: userId, isDeleted: false },
            select: { twoFactorSecret: true, twoFactorEnabled: true, twoFactorMethod: true, twoFactorBackupCodes: true },
        });
    }

    /**
     * Spend one backup code: a single conditional UPDATE that removes exactly that hash and
     * reports whether it removed anything. Two requests carrying the same code cannot both
     * succeed, whatever order they run in (review M1). Shared by /mfa/setup and /mfa/verify.
     * @returns {Promise<boolean>} true when the code was unused until now
     */
    async consumeBackupCode(userId, hash) {
        const needle = JSON.stringify([hash]);
        const changed = await prisma.$executeRaw`
            UPDATE "users"
            SET "twoFactorBackupCodes" = "twoFactorBackupCodes" - ${hash}::text
            WHERE "id" = ${userId}
              AND "isDeleted" = false
              AND "twoFactorEnabled" = true
              AND jsonb_typeof("twoFactorBackupCodes") = 'array'
              AND "twoFactorBackupCodes" @> ${needle}::jsonb`;
        return changed === 1;
    }

    /** Put a spent code back when the step after spending it could not start (the slot store was down). */
    async restoreBackupCode(userId, hash) {
        const addition = JSON.stringify([hash]);
        await prisma.$executeRaw`
            UPDATE "users"
            SET "twoFactorBackupCodes" = COALESCE("twoFactorBackupCodes", '[]'::jsonb) || ${addition}::jsonb
            WHERE "id" = ${userId}`;
    }

    async moveSecondFactor(userId, { secret, hashedBackupCodes, sessionsRevokedAt }, { auditEvent, noticeData, adminNoticeData }) {
        return prisma.$transaction(async (tx) => {
            const user = await tx.user.update({
                where: { id: userId },
                data: {
                    twoFactorSecret: secret,
                    twoFactorEnabled: true,
                    twoFactorMethod: 'TOTP',
                    twoFactorBackupCodes: hashedBackupCodes,
                    sessionsRevokedAt,
                },
                select: SUBJECT_SELECT,
            });
            await auditLogger.logWithin({ ...auditEvent, organizationId: user.organizationId }, tx);
            const notice = await sendNotification(userId, NotifyType.SECOND_FACTOR_MOVED, noticeData, {}, {
                db: tx, organizationId: user.organizationId,
            });
            if (!notice) {
                throw new Error('second-factor move: the owner notice was not written, so the move is rolled back');
            }
            await notifySameSideAdmins(tx, user, { ...adminNoticeData, event: 'MOVED' });
            return user;
        });
    }

    /**
     * Replaces routes/api/identity/mfa.js:276 prisma.user.findUnique
     * Full identity slice used after a successful MFA verify so the
     * route can issue auth tokens + return the safe user payload.
     * Soft-deleted users get null so the route falls through to the
     * "MFA not enabled" branch — preferable to a 500.
     * SECU-03: so do disabled / suspended accounts — a challenge issued just
     * before an admin disabled the account must not complete into a session.
     * The status rule is applied here in JS rather than as a Prisma `in`
     * filter: that filter is case-sensitive, while login() (the same shared
     * rule) upper-cases — a legacy lowercase 'active' row got the challenge
     * and then could never complete it.
     */
    async findUserForMfaVerify(userId) {
        const user = await prisma.user.findFirst({
            where: { id: userId, isDeleted: false },
            select: MFA_VERIFY_USER_SELECT,
        });
        return canAccountHoldSession(user) ? user : null;
    }

    /**
     * Replaces routes/api/identity/mfa.js:391 prisma.user.update
     * Last-login timestamp bump after a successful MFA verify completes
     * the auth flow.
     */
    async touchLastLogin(userId) {
        return prisma.user.update({
            where: { id: userId },
            data: { lastLoginAt: new Date() },
        });
    }

    /**
     * Replaces routes/api/identity/mfa.js:434 prisma.user.findUnique
     * Pre-disable check — returns just enough to verify the current TOTP
     * code and confirm MFA is actually active. No backup-code column.
     */
    async findMfaSecretForDisable(userId) {
        return prisma.user.findFirst({
            where: { id: userId, isDeleted: false },
            // /disable decides on the TOTP seed alone: a row without one cannot
            // prove a code, whatever method it still names.
            select: { twoFactorSecret: true, twoFactorEnabled: true },
        });
    }

    /**
     * Replaces routes/api/identity/mfa.js:457 prisma.user.update
     * Disables MFA and wipes the TOTP secret + backup codes. Caller has
     * already verified the supplied code.
     */
    async disableMfa(userId) {
        return prisma.user.update({
            where: { id: userId },
            data: {
                twoFactorEnabled: false,
                twoFactorMethod: 'TOTP', // reset the discriminator to the default
                twoFactorSecret: null,
                twoFactorBackupCodes: null,
            },
        });
    }
}

module.exports = new IdentityService();
module.exports.followsEmergencyReset = followsEmergencyReset;

'use strict';

/**
 * Makes one account's data identify no one (privacy notice v1.4 §7 item 1). The retention sweep
 * (jobs/pdpa-retention-job.js) and the confirmed erasure (services/pdpa-erasure-service.js) both
 * call anonymizeAccount, so the two cannot drift. It touches exactly:
 *   - the users row: every column that can point at the person is cleared or replaced;
 *   - each INDIVIDUAL entity the account OWNs (the personal entity registration created from the
 *     person's name and national ID): the same, except the name while a receipt or tax invoice
 *     inside its retention still prints it; the retention sweep clears that name on a later run;
 *   - the account's identity_links rows, deleted: a ThaID link's subject is a keyed HMAC of the
 *     national ID, and a live link would sign the person back into the anonymized account;
 *   - its application drafts (the unsent working copy, no legal retention) and its notifications
 *     other than official letters (permanent archive, operator decision D-9), deleted;
 *   - its survey answers: unlinked and free text dropped (survey-service anonymiseResponsesOfUser);
 *   - the IP address and user agent on its consent, membership-event and workspace-switch rows,
 *     cleared; each row stays, keyed to the anonymized User.id, as consent proof and audit trail
 *     (operator order 96(2)). audit_logs keep theirs: those columns are inside the hash chain;
 *   - its avatar file, deleted (operator order 96(3); services/account-avatar.js).
 * Nothing else: applications, their documents, farms, certificates and audit rows are §7 items
 * 3-5 and stay as they are. Columns left alone, and why, are listed in
 * test-support/account-columns-kept.js; a pin compares both against the Prisma schema.
 *
 * Must run inside the caller's transaction (`tx`): everything above changes together or not at
 * all. The users write is conditional on legalHold = false and isAnonymized = false, so a hold
 * placed after the caller read the row still wins; anonymizeAccount then changes nothing and
 * returns null.
 */

const { sessionEpochStamp } = require('../utils/session-epoch');
const { withoutTenantScope } = require('./tenant-context');
const { addLocalMonths } = require('../utils/working-days');
const { withDeletedRows } = require('./soft-delete-context');
const { anonymiseResponsesOfUser } = require('./survey-service');
const { deleteAvatarFile } = require('./account-avatar');
const { NOTIFICATION_KIND } = require('../shared/notification-kind');

const ERASED = 'PDPA_ERASED';

// users_auth_type_identity_ck: HEALTH_ID needs a healthId and PROVIDER_ID a providerId; only
// EMAIL_LEGACY lets a row carry neither, which is what an anonymized account is.
const NO_IDENTITY_AUTH_TYPE = 'EMAIL_LEGACY';

// Receipts and tax invoices print the payer's name from entities.displayName when they are
// printed (utils/applicant-resolver.js), so the name must outlive the account while one of them
// is inside its retention: five years, ป.รัษฎากร ม.87/3 (§7 item 2; operator orders 64 ค9,
// 85(2) and 96(1)).
const TAX_DOCUMENT_RETENTION_YEARS = 5;

const PERSONAL_ENTITY_DATA = Object.freeze({
    slug: null,
    thaiCitizenId: null,
    thaiCitizenIdHash: null,
    thaiCitizenIdHmac: null,
    juristicId: null,
    juristicIdHash: null,
    communityRegNo: null,
    communityRegNoHash: null,
    payload: null,
});

function anonymizedUserData(userId, now) {
    return {
        authType: NO_IDENTITY_AUTH_TYPE,
        // Unique and the target of the applications, invoices and bundles foreign keys (ON UPDATE
        // CASCADE): the account's own id keeps it unique and can never equal a national ID or an
        // HMAC token.
        canonicalId: userId,
        canonicalIdLegacy: null,
        healthId: null,
        healthIdHash: null,
        healthIdHmac: null,
        providerId: null,
        providerIdHash: null,
        providerIdHmac: null,
        idCard: null,
        idCardHash: null,
        idCardHmac: null,
        laserCode: null,
        taxId: null,
        taxIdHash: null,
        taxIdHmac: null,
        communityRegistrationNo: null,
        communityRegistrationNoHash: null,
        communityRegistrationNoHmac: null,
        firstName: ERASED,
        lastName: ERASED,
        email: null,
        phoneNumber: null,
        address: null,
        province: null,
        district: null,
        subdistrict: null,
        zipCode: null,
        companyName: null,
        representativeName: null,
        representativePosition: null,
        communityName: null,
        createdByIp: null,
        updatedByIp: null,
        deleteReason: null,
        privacySettings: null,
        password: ERASED,
        sessionsRevokedAt: sessionEpochStamp(),
        twoFactorSecret: null,
        twoFactorBackupCodes: null,
        twoFactorEnabled: false,
        emailVerificationToken: null,
        emailVerificationExpiry: null,
        passwordResetToken: null,
        passwordResetExpiry: null,
        isAnonymized: true,
        anonymizedAt: now,
    };
}

async function payerNameOnTaxDocumentInRetention(tx, entityId, now) {
    const since = addLocalMonths(now, -12 * TAX_DOCUMENT_RETENTION_YEARS);
    const issuedSince = { OR: [{ createdAt: { gt: since } }, { issuedAt: { gt: since } }] };
    // Every organization's documents count, whatever tenant the erasure request runs under:
    // clearing the name cannot be undone.
    const inRetention = await withoutTenantScope(async () => tx.invoice.count({
        where: {
            application: { entityId },
            OR: [
                { createdAt: { gt: since } },
                { receiptIssuedAt: { gt: since } },
                { creditNotes: { some: issuedSince } },
                { debitNotes: { some: issuedSince } },
            ],
        },
    }));
    return inRetention > 0;
}

/**
 * Clears the personal entity; its name too, unless a tax document still prints it.
 * @returns {Promise<boolean>} whether the name was cleared
 */
async function anonymizePersonalEntity(tx, entityId, now) {
    const keepName = await payerNameOnTaxDocumentInRetention(tx, entityId, now);
    await tx.entity.update({
        where: { id: entityId },
        data: keepName ? PERSONAL_ENTITY_DATA : { ...PERSONAL_ENTITY_DATA, displayName: ERASED },
    });
    return !keepName;
}

const NO_REQUEST_CONTEXT = Object.freeze({ ipAddress: null, userAgent: null });

/**
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {string} userId User.id
 * @param {Date} now
 * @returns {Promise<null | {
 *   entities: number, identityLinks: number, applicationDrafts: number, notifications: number,
 *   surveyResponses: number, consents: number, membershipEvents: number, contextSwitches: number,
 *   avatarDeleted: boolean }>} null when the account is under legal hold or already anonymized
 */
async function anonymizeAccount(tx, userId, now) {
    // Every row keyed to the account, whatever tenant the caller runs under and closed ones too.
    return withoutTenantScope(() => withDeletedRows(async () => {
        const before = await tx.user.findUnique({ where: { id: userId }, select: { privacySettings: true } });
        const written = await tx.user.updateMany({
            where: { id: userId, legalHold: false, isAnonymized: false },
            data: anonymizedUserData(userId, now),
        });
        if (written.count === 0) {return null;}
        const owned = await tx.entityMembership.findMany({
            where: { userId, role: 'OWNER', entity: { type: 'INDIVIDUAL' } },
            select: { entityId: true },
        });
        for (const { entityId } of owned) {
            await anonymizePersonalEntity(tx, entityId, now);
        }
        const links = await tx.identityLink.deleteMany({ where: { userId } });
        const drafts = await tx.applicationDraft.deleteMany({ where: { userId } });
        const notifications = await tx.notification.deleteMany({
            where: { userId, kind: { not: NOTIFICATION_KIND.OFFICIAL_LETTER } },
        });
        const surveyResponses = await anonymiseResponsesOfUser(tx, userId);
        const consents = await tx.userConsent.updateMany({ where: { userId }, data: NO_REQUEST_CONTEXT });
        const membershipEvents = await tx.entityMembershipEvent.updateMany({
            where: { actorUserId: userId }, data: NO_REQUEST_CONTEXT,
        });
        const contextSwitches = await tx.entityContextSwitch.updateMany({ where: { userId }, data: NO_REQUEST_CONTEXT });
        const avatarDeleted = await deleteAvatarFile(before?.privacySettings?.avatar);
        return {
            entities: owned.length,
            identityLinks: links.count,
            applicationDrafts: drafts.count,
            notifications: notifications.count,
            surveyResponses,
            consents: consents.count,
            membershipEvents: membershipEvents.count,
            contextSwitches: contextSwitches.count,
            avatarDeleted,
        };
    }));
}

module.exports = { anonymizeAccount, anonymizePersonalEntity, ERASED };

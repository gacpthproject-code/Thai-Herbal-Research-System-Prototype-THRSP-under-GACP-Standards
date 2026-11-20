#!/usr/bin/env node
'use strict';

/**
 * Make a company-side account the platform admin (system_admin_platform), outside the API.
 *
 * No admin door gives this role (orders 13 and 34(2); canonical-rbac rolesAssignableBy), so
 * the operator gives it with this script. Runbook: docs/operations/runbooks/admin-bootstrap.md.
 *
 * Usage:
 *   node scripts/grant-platform-admin.js --id <user uuid>                 # dry run (default)
 *   node scripts/grant-platform-admin.js --id <user uuid> --apply         # write
 *   node scripts/grant-platform-admin.js --email <address> [--apply]      # find the account by email
 *
 * Safety:
 *   - Dry run by default; --apply writes.
 *   - Writes the canonical role word only, and refuses an account whose stored role is not a
 *     current role word: the provider login door cannot read a retired word such as
 *     PLATFORM_ADMIN, which this script used to write.
 *   - An account never crosses sides: only a company-side staff account is promoted. DTAM-side
 *     staff and applicants are refused.
 *   - Idempotent: an account that already holds the role is left as it is.
 *   - The role, the session epoch (the account's open sessions end) and the audit row are
 *     written in one transaction.
 *   - Prints names and yes/no answers only: no email, no national ID.
 */

process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'warn';

const { prisma } = require('../services/prisma-database');
const { auditLogger, AuditCategory, AuditSeverity, ResourceType } = require('../middleware/audit-logger');
const {
    CANONICAL_ROLES, ROLE_AFFILIATIONS, normalizeRole, roleAffiliation,
} = require('../shared/canonical-rbac');
const { sessionEpochStamp } = require('../utils/session-epoch');

const TARGET_ROLE = CANONICAL_ROLES.SYSTEM_ADMIN_PLATFORM;
const TAG = '[grant-platform-admin]';

function argValue(argv, flag) {
    const at = argv.indexOf(flag);
    return at >= 0 ? String(argv[at + 1] || '').trim() : '';
}

function refuse(message) {
    console.error(`${TAG} REFUSED: ${message}`);
    process.exitCode = 1;
}

async function main(argv) {
    const apply = argv.includes('--apply');
    const id = argValue(argv, '--id');
    const email = argValue(argv, '--email').toLowerCase();
    if (!id && !email) {
        refuse('name the account with --id <user uuid> or --email <address>');
        return;
    }

    const matches = await prisma.user.findMany({
        where: { isDeleted: false, ...(id ? { id } : { email }) },
        select: {
            id: true, role: true, accountType: true, providerId: true, organizationId: true, firstName: true, lastName: true,
        },
    });
    if (matches.length !== 1) {
        refuse(matches.length === 0 ? 'no account matched' : `${matches.length} accounts matched; name one with --id`);
        return;
    }
    const user = matches[0];
    const currentRole = normalizeRole(user.role);
    console.log(`${TAG} mode: ${apply ? 'APPLY' : 'DRY RUN (add --apply to write)'}`);
    console.log(`${TAG} account: ${user.firstName} ${user.lastName}`);
    console.log(`${TAG} role is a current role word: ${currentRole ? 'yes' : 'no'}`);

    if (!currentRole) {
        refuse('the stored role is not a current role word; the login door cannot read it either. Ask the developers to repair the row.');
        return;
    }
    if (currentRole === TARGET_ROLE) {
        console.log(`${TAG} already ${TARGET_ROLE}: yes, nothing to do`);
        return;
    }
    const companySide = roleAffiliation(currentRole) === ROLE_AFFILIATIONS.PLATFORM_OPERATOR;
    console.log(`${TAG} company-side staff account: ${companySide && user.accountType === 'PROVIDER' && user.providerId ? 'yes' : 'no'}`);
    if (!companySide || user.accountType !== 'PROVIDER' || !user.providerId) {
        refuse('only a company-side staff account becomes the platform admin; an account never crosses sides (orders 13, 34(2))');
        return;
    }
    console.log(`${TAG} will change the role from ${currentRole} to ${TARGET_ROLE}: yes`);
    if (!apply) {
        console.log(`${TAG} dry run complete, nothing written`);
        return;
    }

    await prisma.$transaction(async (tx) => {
        await tx.user.update({
            where: { id: user.id },
            data: { role: TARGET_ROLE, sessionsRevokedAt: sessionEpochStamp() },
        });
        await auditLogger.logWithin({
            category: AuditCategory.ADMIN,
            action: 'USER_ROLE_GRANTED',
            severity: AuditSeverity.WARNING,
            actorId: 'SYSTEM',
            actorRole: CANONICAL_ROLES.SYSTEM,
            actorType: 'SYSTEM',
            resourceType: ResourceType.USER,
            resourceId: user.id,
            organizationId: user.organizationId,
            metadata: { source: 'scripts/grant-platform-admin.js', previousRole: currentRole, newRole: TARGET_ROLE },
        }, tx);
    });
    console.log(`${TAG} done: ${user.firstName} ${user.lastName} is ${TARGET_ROLE}. Their open sessions ended; they sign in again.`);
}

main(process.argv.slice(2))
    .catch((error) => {
        console.error(`${TAG} FAILED: ${error.code || error.name}`);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());

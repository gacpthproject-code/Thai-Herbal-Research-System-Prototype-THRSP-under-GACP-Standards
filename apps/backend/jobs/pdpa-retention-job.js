/**
 * PDPA Retention Enforcement Job
 *
 * Sprint 6 (healthId audit H6, 2026-05-15)
 *
 * Thai PDPA Section 37 requires that personal data be deleted (or rendered
 * non-identifying) once the retention purpose has expired. The `User.retainUntil`
 * column already records each user's expiry timestamp: five years from account creation
 * (the column default). Previously that column was written but
 * never READ — there was no automated process to enforce it.
 *
 * This job runs daily and, for each expired user, calls anonymizeAccount
 * (services/account-anonymization.js), the same routine a confirmed erasure runs, so what it
 * clears and deletes is listed there once; `isAnonymized` / `anonymizedAt` record that it
 * happened.
 *
 * Accounts closed earlier (isDeleted: by the erasure door before it finished the job itself,
 * or by the one-step delete door that existed until 2026-10) are selected too, on purpose:
 * the read runs in withDeletedRows, past the soft-delete filter. Closing an account never
 * moved it out of retention.
 *
 * LEGAL HOLD (R-HOTFIX-PDPA): rows with `User.legalHold = true`
 * (prisma/schema/auth.prisma:162) are NEVER touched by this sweep. Because anonymizeAccount
 * nulls the hash columns as well, anonymization is irreversible and un-correlatable
 * — running it over a held record destroys exactly the evidence the hold exists to
 * preserve. The erasure door already refuses under a hold
 * (services/pdpa-erasure-service.js → PDPA_LEGAL_HOLD); this cron path matches it.
 *
 * The rule itself lives in shared/legal-hold-guard.js, not inline here, so the
 * next sweep anyone writes inherits it. This job applies it twice: the
 * `legalHoldExclusion()` predicate in the query, and anonymizeAccount's conditional
 * write (legalHold = false), so a hold placed mid-sweep wins.
 *
 * Operator decision, 2026-08-03: the skip is PERMANENT, not a deferral. A held row
 * is passed over however long ago `retainUntil` elapsed, and only a human clearing
 * the flag makes it eligible again. Accordingly this job never writes `retainUntil`
 * or `legalHold` — it has no mechanism to extend a retention window or release a
 * hold, and must not grow one.
 *
 * Scope: this job writes the rows anonymizeAccount names and, for the same expired user,
 * the document pre-check text described below. The other models carrying a `legalHold` column (see LEGAL_HOLD_MODELS) have no
 * retention sweep of their own.
 *
 * DOCUMENT PRE-CHECK TEXT (document pre-check Task 10, 2026-09-28): a pre-check
 * stores the text read off the applicant's papers (`DocumentPrecheck.extractedText`)
 * and a short quote per observation (`DocumentPrecheckFlag.evidenceSnippet`); both
 * can hold the person's name, address and id numbers. For every user this sweep
 * anonymizes, both are set to null on every pre-check of that user's applications.
 * The pre-check row, its status and each observation's check/result/reasonTH/
 * confidence stay: they record that a check ran and what it said, and carry no
 * text off the page. An application under legal hold keeps its text
 * (`legalHoldExclusion()` on the application; services/document-precheck/clear-text.js,
 * shared with the user-initiated erasure). The clear and the anonymization run in
 * one transaction: if either fails, nothing of that user changes, the user is
 * counted in `stats.errors`, and the next run retries both.
 *
 * No retention rule deletes ApplicationDocument rows or their files today; the
 * user's retention window is the only retention rule this codebase enforces,
 * so it is the rule the pre-check text follows.
 *
 * The row itself is NOT deleted: applications, invoices and certificates keep pointing at it.
 * After anonymization it exists only to satisfy referential integrity.
 *
 * COMPLETION MARKER (R-HOTFIX-PDPA step 2, 2026-08-03): `User.isAnonymized`
 * (NOT NULL, default false) and `User.anonymizedAt` are declared at
 * prisma/schema/auth.prisma:164-182 and created by migration
 * 20260803130000_add_user_anonymization_markers. Until that migration they were
 * referenced here but existed nowhere — the mocked unit suite accepted any field
 * name, so the sweep only failed once it met a real Postgres.
 *
 * The marker is what makes this job idempotent. Anonymization never moves
 * `retainUntil` (see the legal-hold note above), so an anonymized row would stay a
 * candidate and be re-swept every night, forever, with nothing recording that it
 * had already been done.
 *
 * Both sides now fail closed. A read that cannot apply the `isAnonymized` /
 * `legalHold` predicates aborts the whole run rather than falling back to an
 * unfiltered scan; a write that fails is counted in `stats.errors` and logged,
 * never retried with the markers stripped out. Completing the irreversible
 * null-out while losing the record of having done it is worse than failing.
 *
 * @module jobs/pdpa-retention-job
 */

const { prisma } = require('../services/prisma-database');
const logger = require('../shared/logger');
const { maskThaiId } = require('../utils/field-encryption');
const { withoutTenantScope } = require('../services/tenant-context');
const {
    legalHoldExclusion,
} = require('../shared/legal-hold-guard');
const { clearPrecheckText } = require('../services/document-precheck/clear-text');
const { withDeletedRows } = require('../services/soft-delete-context');
const { anonymizeAccount, anonymizePersonalEntity, ERASED } = require('../services/account-anonymization');

/**
 * Anonymize users whose retention window has expired.
 *
 * The User table is a platform-global resource — the PDPA retention sweep
 * operates across every tenant by design (Section 37 enforcement applies to
 * any record whose retention window has expired, regardless of org). We
 * therefore wrap the entire sweep in `withoutTenantScope` so the Prisma
 * tenant-scope extension does not silently filter the result set down to
 * whatever ambient AsyncLocalStorage context a calling cron runner may have
 * (e.g. when invoked from a queue worker that established a tenant on the
 * previous tick). See ADR-014 / docs/adr/ADR-014-phase-3-handoff.md.
 *
 * @returns {Promise<{ scanned: number, anonymized: number, errors: number, legalHoldSkipped: number, precheckTextsCleared: number }>}
 */
async function runPdpaRetentionSweep() {
    return withoutTenantScope(() => runPdpaRetentionSweepInternal());
}

async function runPdpaRetentionSweepInternal() {
    const now = new Date();
    const stats = { scanned: 0, anonymized: 0, errors: 0, legalHoldSkipped: 0, precheckTextsCleared: 0, personalNamesCleared: 0, failedUserIds: [] };

    // Find users whose retainUntil is in the past, who are not under legal hold, and
    // who have not already been anonymized, closed accounts included (withDeletedRows).
    // Batches of 200 keep the query and transaction sizes bounded.
    let cursor;
    while (true) {
        // FAIL CLOSED: this query intentionally has no `.catch()` fallback. The
        // previous fallback re-queried on `retainUntil` alone whenever the error
        // message mentioned `isAnonymized`, which dropped every other predicate —
        // including the legal-hold filter — and anonymized held rows anyway. If the
        // filters cannot be applied we must destroy nothing. The error propagates to
        // the scheduler's try/catch (jobs/scheduler.js:194), which logs and ends the run.
        // async: a Prisma query runs when awaited, and that must happen inside withDeletedRows,
        // or the soft-delete filter applies after all.
        const batch = await withDeletedRows(async () => prisma.user.findMany({
            where: {
                retainUntil: { lte: now },
                // Guard layer 1: never select a row an operator has frozen. ANDed
                // with the date predicate above, so no `retainUntil` value however
                // ancient can bring a held row back into the candidate set.
                ...legalHoldExclusion(),
                // Skip rows a previous run already finished. The column is NOT NULL
                // with a default of false (prisma/schema/auth.prisma:181), so there
                // is no NULL state to also test for — and testing for one would be
                // worse than redundant: Prisma rejects a null predicate on a required
                // scalar before the query reaches Postgres, and this sweep has no
                // read-side fallback, so it would abort every nightly run outright.
                isAnonymized: false,
            },
            select: {
                id: true,
                healthId: true,
                providerId: true,
                retainUntil: true,
            },
            orderBy: { id: 'asc' },
            take: 200,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        }));

        if (!batch.length) {break;}
        stats.scanned += batch.length;

        for (const user of batch) {
            try {
                logger.info('[pdpa-retention] Anonymizing user', {
                    userId: user.id,
                    healthIdMasked: maskThaiId(user.healthId),
                    retainUntil: user.retainUntil,
                });

                // Guard layer 2 is inside the write: anonymizeAccount updates the users row only
                // where legalHold is still false, so a hold placed after the findMany above wins,
                // and then nothing of the user changes, the pre-check text included.
                const cleared = await prisma.$transaction(async (tx) => {
                    const account = await anonymizeAccount(tx, user.id, new Date());
                    return account && clearPrecheckText(tx, user.id);
                });
                if (cleared === null) {
                    stats.legalHoldSkipped += 1;
                    logger.warn('[pdpa-retention] Skipping user placed under legal hold during the sweep', { userId: user.id });
                    continue;
                }
                stats.precheckTextsCleared += cleared;
                stats.anonymized += 1;
            } catch (err) {
                stats.errors += 1;
                stats.failedUserIds.push(user.id);
                // Not err.message: a Postgres constraint error carries the whole failing row,
                // names and national ID included.
                logger.error('[pdpa-retention] Failed to anonymize user', { userId: user.id, errorCode: err.code || err.name });
            }
        }

        cursor = batch[batch.length - 1].id;
        if (batch.length < 200) {break;}
    }

    // Names anonymizeAccount kept because a receipt still printed them: cleared once it no longer does.
    const namedEntities = await withDeletedRows(async () => prisma.entity.findMany({
        where: {
            type: 'INDIVIDUAL',
            displayName: { not: ERASED },
            members: { some: { role: 'OWNER', user: { isAnonymized: true, ...legalHoldExclusion() } } },
        },
        select: { id: true },
    }));
    for (const { id } of namedEntities) {
        try {
            const cleared = await prisma.$transaction(async (tx) => {
                const held = await withDeletedRows(async () => tx.entityMembership.count({
                    where: { entityId: id, role: 'OWNER', user: { legalHold: true } },
                }));
                return held === 0 && anonymizePersonalEntity(tx, id, now);
            });
            if (cleared) {stats.personalNamesCleared += 1;}
        } catch (err) {
            stats.errors += 1;
            logger.error('[pdpa-retention] Failed to clear a kept personal entity name', { entityId: id, errorCode: err.code || err.name });
        }
    }

    // Operator decision 2026-08-03: one failing row must NOT abort the batch —
    // the other rows are past their PDPA retention window and must not be held
    // hostage by a single bad record. The cost of that choice is that a failure
    // would otherwise be a number in an info-level line nobody reads, so a run
    // that dropped any row reports at ERROR level and names the rows: "counted
    // quietly" is exactly the failure mode this whole work item exists to close.
    if (stats.errors > 0) {
        logger.error('[pdpa-retention] Sweep complete WITH FAILURES — these rows are still un-anonymized and will be retried on the next run', {
            ...stats,
            failedUserIds: stats.failedUserIds,
        });
    } else {
        logger.info('[pdpa-retention] Sweep complete', stats);
    }
    return stats;
}

module.exports = { runPdpaRetentionSweep, clearPrecheckText };

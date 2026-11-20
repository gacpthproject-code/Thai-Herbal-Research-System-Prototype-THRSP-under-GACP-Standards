/**
 * Legal-hold guard — the rule every retention sweep must inherit.
 *
 * R-HOTFIX-PDPA (2026-08-03)
 *
 * POLICY — OPERATOR DECISION, 2026-08-03
 * --------------------------------------
 * A row under legal hold is skipped PERMANENTLY. Not deferred, not granted a
 * grace period: `legalHold = true` means automated deletion never touches the row
 * again, however long ago `retainUntil` elapsed, and the only thing that restores
 * eligibility is a human clearing the flag.
 *
 * Implement it as an exclusion, never as a date. Extending `retainUntil`, or
 * skipping "until date X", would put the row back on a countdown to automatic
 * destruction — which is the exact failure this guard was written to stop. No
 * function in this module writes anything, and no caller should write
 * `retainUntil` or `legalHold` as a way of honouring a hold.
 *
 * WHY THIS EXISTS AS A SHARED MODULE
 * ----------------------------------
 * The PDPA retention sweep (jobs/pdpa-retention-job.js) selected rows purely on
 * `retainUntil <= now` and then nulled the identity columns AND their hash
 * columns. Applied to a row under legal hold that is irreversible: the plaintext
 * is gone and, because the hashes go too, nothing can correlate the row back to
 * the data subject. A hold exists precisely to preserve that evidence, so a sweep
 * that ignores it destroys the thing it was told to keep.
 *
 * The obvious fix — an inline `legalHold: false` in that one job — would not
 * survive contact with the next sweep. Six models carry a `legalHold` column
 * today (see LEGAL_HOLD_MODELS) and only `User` has a sweep at all; the other
 * five are safe by accident, not by design. Whoever writes the second sweep must
 * inherit this rule instead of rediscovering the incident, so the predicate lives
 * here and the reasoning lives with it.
 *
 * HOW TO USE IT — both layers, not one
 * ------------------------------------
 *   const { legalHoldExclusion } = require('...');
 *
 *   const rows = await prisma.<model>.findMany({
 *       where: { ...yourFilters, ...legalHoldExclusion() },   // layer 1
 *       select: { id: true },
 *   });
 *   for (const row of rows) {
 *       const written = await tx.<model>.updateMany({         // layer 2 (race)
 *           where: { id: row.id, ...legalHoldExclusion() },
 *           data: ...destructive work...,
 *       });
 *       if (written.count === 0) { continue; }                 // held since the read
 *   }
 *
 * Layer 1 keeps held rows out of the candidate set. Layer 2 covers the window
 * between the read and the write, where an operator may place a hold on a row the
 * sweep has already fetched. It has to be in the write's own `where`: re-checking
 * the fetched row in memory reads the value layer 1 already filtered, so it can
 * never see a hold placed later. services/account-anonymization.js is the User
 * instance.
 *
 * FAIL CLOSED
 * -----------
 * If a query using `legalHoldExclusion()` throws because the column is absent,
 * the caller must let the error propagate and destroy nothing. Never "fall back"
 * to an unfiltered query: an error here means the guard could not be applied,
 * which is the one situation in which the sweep is most dangerous.
 *
 * RELATIONSHIP TO THE ERASURE PATHS
 * ---------------------------------
 * This module is the batch/sweep side of the rule. The user-initiated erasure
 * paths refuse a held account by throwing `PDPA_LEGAL_HOLD`
 * (services/pdpa-service.js:291, services/pdpa-erasure-service.js:260,533). Those
 * answer one request at a time and owe the caller an error code; a sweep skips and
 * moves on. Same policy, different mechanics — this module deliberately does not
 * duplicate their error handling.
 *
 * @module shared/legal-hold-guard
 */

/** The Prisma field name carrying the hold flag. */
const LEGAL_HOLD_FIELD = 'legalHold';

/**
 * Every Prisma model that declares a `legalHold` column.
 *
 * Kept in sync with prisma/schema/*.prisma by
 * __tests__/unit/legal-hold-guard.test.js, which parses the schema and fails if
 * this list drifts. The schema stays the single source of truth; this constant
 * exists so a new `legalHold` column cannot be added without someone being asked
 * whether that model's destructive paths honour the hold.
 *
 * As of R-HOTFIX-PDPA only `User` has a retention sweep. The other five have no
 * automated deletion path at all — they are unguarded but also unswept.
 */
const LEGAL_HOLD_MODELS = Object.freeze([
    'Application',
    'Certificate',
    'Invoice',
    'Organization',
    'User',
]);

/**
 * Prisma `where` fragment excluding rows under legal hold. Spread into a filter.
 *
 * Unconditional by design (operator decision, 2026-08-03): it is ANDed with
 * whatever date predicate the caller already has, so no `retainUntil` value can
 * override it. Do not replace this with a date comparison.
 *
 * Returns a fresh object each call so a caller that mutates the result cannot
 * disable the guard for everyone else.
 *
 * @returns {{ legalHold: false }}
 */
function legalHoldExclusion() {
    return { [LEGAL_HOLD_FIELD]: false };
}

module.exports = {
    LEGAL_HOLD_FIELD,
    LEGAL_HOLD_MODELS,
    legalHoldExclusion,
};

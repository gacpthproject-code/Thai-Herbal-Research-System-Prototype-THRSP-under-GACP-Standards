/**
 * Period Close Service — monthly accounting close (Iter 24, 2026-05-16).
 *
 * Owns the close → reopen workflow that finance staff exercise after a
 * calendar month has fully elapsed. Once a (organizationId, year, month)
 * triple is CLOSED, the journal-entry layer REJECTS new entries whose
 * `entryDate` falls inside that period — preventing back-dating fraud
 * and sealing the ภ.พ.30 / TFRS for NPAEs financial statements for the
 * period.
 *
 * State machine:
 *
 *   ┌──────┐  closePeriod  ┌────────┐  reopenPeriod (2nd)    ┌──────────┐
 *   │ OPEN │ ────────────▶ │ CLOSED │ ─────────────────────▶ │ REOPENED │
 *   └──────┘               └────────┘                        └──────────┘
 *                                                                  │
 *                                                                  │ closePeriod
 *                                                                  ▼
 *                                                             ┌────────┐
 *                                                             │ CLOSED │
 *                                                             └────────┘
 *
 *   - OPEN: implicit when no row exists for (organizationId, year, month).
 *   - CLOSED: journal-entry insertion REJECTED for that period (entryDate
 *     within boundaries → throws PERIOD_CLOSED unless the caller supplies
 *     meta.allowClosedPeriod = true via the ADMIN recovery path).
 *   - REOPENED: temporary unlock for late posting (audit-finding, etc.).
 *     The same period can be re-closed once corrections are posted.
 *
 * Separation of duties (TFRS for NPAEs ch.2; order 29):
 *   - Close and reopen are the company finance officer's, in its own
 *     organization, checked HERE from the signed-in actor.
 *   - The user who CLOSED a period MUST NOT be the user who REOPENS it
 *     (a second company finance officer), enforced HERE.
 *
 * Validation rules on closePeriod:
 *   1. Month must be FULLY PAST — finance closes May 2026 in early June
 *      2026, not May 2026 in the middle of May. Current/future months
 *      are rejected with FUTURE_PERIOD.
 *   2. No PENDING invoices in the period — delegated to
 *      vat-report-service.checkPeriodClosable; if it returns
 *      closable=false we surface PENDING_INVOICES_IN_PERIOD, and if it
 *      fails or cannot load the close is refused (PERIOD_CHECK_UNAVAILABLE).
 *   3. The period must not already be CLOSED — surfaces ALREADY_CLOSED.
 *   4. The month's lock (services/finance/books-locks.js) is held while the
 *      CLOSED row is written, so no journal post into it interleaves.
 *
 * Compliance basis:
 *   - TFRS for NPAEs ch.5 — year-end close (monthly close supports it).
 *   - TFRS for NPAEs ch.2 — internal controls + segregation of duties.
 *   - ป.รัษฎากร ม.86/4 — VAT period closure aligns with monthly ภ.พ.30.
 *   - ป.รัษฎากร ม.87/3 — 5-year retention; status transitions are part of
 *     the audit trail and survive the full retention window.
 *   - Thai e-Transactions Act §31 — every close + reopen audit-logged.
 *
 * Boundary:
 *   - READS vat-report-service (checkPeriodClosable).
 *   - WRITES PeriodClose rows via Prisma in an atomic $transaction.
 *   - EMITS audit log via middleware/audit-logger (PERIOD_CLOSED /
 *     PERIOD_REOPENED).
 *   - Does NOT touch JournalEntry directly — journal-entry-service
 *     calls back into `isPeriodClosed` to enforce the lock.
 *
 * @module services/period-close-service
 */

'use strict';

const logger = require('../shared/logger');
const { getZonedParts, localMonthRange } = require('../utils/working-days');
const {
    assertBooksWriter, booksOrganizationWhere, assertRowInCallerOrganization,
} = require('./finance/company-books-access');
const { lockAccountingPeriodForClose } = require('./finance/books-locks');
const { periodCheckUnavailable } = require('./period-guard-loader');

let prismaModule;
try {
    prismaModule = require('./prisma-database');
} catch (_e) {
    prismaModule = { prisma: null };
}

// Audit-logger is loaded lazily so the service stays loadable when the
// middleware module is missing (CI bootstrap, isolated test). Tests can
// jest.doMock the middleware before the require below.
let auditLoggerModule;
try {
    auditLoggerModule = require('../middleware/audit-logger');
} catch (_e) {
    auditLoggerModule = null;
}

let vatReportService;
try {
    vatReportService = require('./vat-report-service');
} catch (_e) {
    vatReportService = null;
}

// ── Constants ──────────────────────────────────────────────────────────────

const STATUS = Object.freeze({
    OPEN: 'OPEN',
    CLOSED: 'CLOSED',
    REOPENED: 'REOPENED',
});

const ACTIONS = Object.freeze({
    CLOSED: 'PERIOD_CLOSED',
    REOPENED: 'PERIOD_REOPENED',
});

// Audit category is 'FINANCE' per the iteration brief. The audit-logger
// schema also accepts 'PAYMENT' as the canonical category for finance
// events; we pass 'FINANCE' as a string so the audit-logger can route or
// fall back without coupling this service to the AuditCategory enum.
const AUDIT_CATEGORY = 'FINANCE';

// ── Pure helpers ───────────────────────────────────────────────────────────

function validateYearMonth(year, month) {
    const y = Number(year);
    const m = Number(month);
    // Accept any reasonable accounting year (1900..2100). Do NOT use a tight
    // hard-coded upper bound — it causes a code-change requirement every decade
    // and a prod incident if overlooked. 1900..2100 catches typos (e.g. 20026)
    // while covering all realistic fiscal years.
    if (!Number.isInteger(y) || y < 1900 || y > 2100) {
        throw Object.assign(new Error(`Invalid year ${year} — expected 1900..2100`), {
            code: 'VALIDATION_ERROR',
        });
    }
    if (!Number.isInteger(m) || m < 1 || m > 12) {
        throw Object.assign(new Error(`Invalid month ${month} — expected 1..12`), {
            code: 'VALIDATION_ERROR',
        });
    }
    return { year: y, month: m };
}

/**
 * Returns true when (year, month) is in the past relative to `now` — i.e.,
 * the LAST day of (year, month) is strictly before the first moment of
 * `now`'s current month. Finance can close May 2026 starting June 1 2026
 * but not before.
 *
 * Implementation note: we compare the FIRST day of the month AFTER (year,
 * month) against the FIRST day of `now`'s current month. If the after-
 * month boundary is ≤ now's current month-start, the period is fully
 * elapsed.
 */
function isMonthFullyElapsed(year, month, now = new Date()) {
    // Bangkok months, the same months the period guard and ภ.พ.30 use.
    const afterPeriod = localMonthRange(year, month).end;
    const { year: nowYear, month: nowMonth } = getZonedParts(now);
    const currentMonthStart = localMonthRange(nowYear, nowMonth).start;
    return afterPeriod.getTime() <= currentMonthStart.getTime();
}

function resolvePrisma(tx) {
    const candidate = tx || (prismaModule && prismaModule.prisma);
    if (!candidate) {
        return null;
    }
    const model = candidate.periodClose;
    if (!model || typeof model !== 'object' || typeof model.findFirst !== 'function') {
        return null;
    }
    return candidate;
}

async function safeAudit({ action, severity, actorId, organizationId, payload }) {
    if (!auditLoggerModule || !auditLoggerModule.auditLogger) {
        return;
    }
    try {
        await auditLoggerModule.auditLogger.log({
            category: AUDIT_CATEGORY,
            action,
            severity,
            actorId: actorId || 'SYSTEM',
            actorType: 'USER',
            actorRole: payload?.actorRole || 'UNKNOWN',
            resourceType: 'SYSTEM',
            resourceId: payload?.periodCloseId || `${payload?.year}-${payload?.month}`,
            organizationId: organizationId || null,
            metadata: payload || {},
        });
    } catch (err) {
        logger.warn(`[period-close] audit log failed (non-fatal): ${err?.message}`);
    }
}

/**
 * The signed-in company finance officer who closes or reopens a month, and its organization
 * (order 29; security review 2026-10-09, L5): whatever door calls in, no caller names either.
 */
function booksWriterOf(actor) {
    assertBooksWriter(actor);
    const { organizationId } = booksOrganizationWhere(actor);
    if (!actor.id || !organizationId) {
        throw Object.assign(new Error('The signed-in actor has no id or no organization'), { code: 'VALIDATION_ERROR' });
    }
    return { actorId: actor.id, organizationId };
}

/**
 * Whether the month has no pending invoice, answered or refused: a check that failed or could
 * not load never reads as "closable".
 */
async function assertNoPendingInvoices({ year, month, organizationId }) {
    if (!vatReportService || typeof vatReportService.checkPeriodClosable !== 'function') {
        throw periodCheckUnavailable('the pending-invoice check (vat-report-service) did not load');
    }
    let closability;
    try {
        closability = await vatReportService.checkPeriodClosable({ year, month, organizationId });
    } catch (err) {
        logger.warn(`[period-close] checkPeriodClosable failed: ${err?.message}`);
        throw periodCheckUnavailable('the pending-invoice check failed');
    }
    if (closability?.closable === false) {
        throw Object.assign(
            new Error(
                `Cannot close period ${year}-${String(month).padStart(2, '0')} — `
                + `${closability.openInvoices} pending invoice(s) in the period. `
                + 'Resolve before filing ภ.พ.30.',
            ),
            {
                code: 'PENDING_INVOICES_IN_PERIOD',
                openInvoices: closability.openInvoices,
                warnings: closability.warnings || [],
            },
        );
    }
    if (closability?.closable !== true) {
        throw periodCheckUnavailable('the pending-invoice check gave no answer');
    }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Close an accounting period of the signed-in finance officer's organization.
 *
 * @param {object} args
 * @param {number} args.year
 * @param {number} args.month
 * @param {object} args.actor            — the signed-in company finance officer (the closer)
 * @param {string} [args.notes]
 * @returns {Promise<{ id, year, month, closedAt }>}
 */
async function closePeriod({ year, month, actor, notes } = {}) {
    const { actorId, organizationId } = booksWriterOf(actor);
    const { year: y, month: m } = validateYearMonth(year, month);

    // 1. Month must be fully past. Finance closes May 2026 in June 2026,
    //    not in the middle of May. Prevents premature close that would
    //    miss late-month transactions.
    if (!isMonthFullyElapsed(y, m)) {
        throw Object.assign(
            new Error(`Cannot close period ${y}-${String(m).padStart(2, '0')} — month is not fully elapsed yet`),
            { code: 'FUTURE_PERIOD' },
        );
    }

    // 2. No PENDING invoices in the period. Delegate to
    //    vat-report-service.checkPeriodClosable so this service stays
    //    decoupled from the invoice schema details.
    await assertNoPendingInvoices({ year: y, month: m, organizationId });

    const prisma = resolvePrisma();
    if (!prisma) {
        throw Object.assign(new Error('Prisma client not available'), { code: 'DB_UNAVAILABLE' });
    }

    // 3. Atomic upsert. If a row already exists in CLOSED status we
    //    surface ALREADY_CLOSED. REOPENED rows can be re-closed by
    //    flipping the status forward. The month's lock first: a journal writer that found
    //    the month open finishes before this close commits.
    const result = await prisma.$transaction(async (tx) => {
        await lockAccountingPeriodForClose(tx, { organizationId, year: y, month: m });
        const existing = await tx.periodClose.findFirst({
            where: { organizationId, year: y, month: m },
        });
        if (existing && existing.status === STATUS.CLOSED) {
            throw Object.assign(
                new Error(`Period ${y}-${String(m).padStart(2, '0')} is already CLOSED`),
                { code: 'ALREADY_CLOSED', periodCloseId: existing.id },
            );
        }
        if (existing) {
            // REOPENED → CLOSED transition. Preserve reopen history fields
            // (reopenedAt, reopenedBy, reopenReason) so the auditor can see
            // the full close/reopen/close trail on a single row. Conditional on
            // the status read above: a close that committed in between leaves
            // nothing to match, and this one is ALREADY_CLOSED.
            const claimed = await tx.periodClose.updateMany({
                where: { id: existing.id, status: existing.status },
                data: {
                    status: STATUS.CLOSED,
                    closedAt: new Date(),
                    closedBy: actorId,
                    notes: notes || existing.notes || null,
                },
            });
            if (claimed.count !== 1) {
                throw Object.assign(
                    new Error(`Period ${y}-${String(m).padStart(2, '0')} was closed concurrently`),
                    { code: 'ALREADY_CLOSED', periodCloseId: existing.id },
                );
            }
            return tx.periodClose.findUnique({ where: { id: existing.id } });
        }
        // A first close that lost the race to another first close of the same month meets
        // the (organizationId, year, month) key: the month is closed, by the other one.
        return tx.periodClose.create({
            data: {
                organizationId,
                year: y,
                month: m,
                status: STATUS.CLOSED,
                closedBy: actorId,
                notes: notes || null,
            },
        }).catch((err) => {
            if (err?.code !== 'P2002') { throw err; }
            throw Object.assign(
                new Error(`Period ${y}-${String(m).padStart(2, '0')} was closed concurrently`),
                { code: 'ALREADY_CLOSED' },
            );
        });
    });

    await safeAudit({
        action: ACTIONS.CLOSED,
        severity: 'INFO',
        actorId,
        organizationId,
        payload: {
            periodCloseId: result.id,
            year: y,
            month: m,
            closedAt: result.closedAt,
        },
    });

    logger.info(
        `[period-close] CLOSED ${y}-${String(m).padStart(2, '0')} org=${organizationId} by=${actorId}`,
        { periodCloseId: result.id },
    );

    return {
        id: result.id,
        year: y,
        month: m,
        closedAt: result.closedAt,
        status: result.status,
    };
}

/**
 * Reopen a previously-closed period of the signed-in finance officer's organization. The
 * reopener is a second company finance officer, never the one who closed the period
 * (segregation of duties, enforced HERE).
 *
 * @param {string} periodCloseId
 * @param {object} args
 * @param {string} args.reason     — required, ≥ 10 chars (audit anchor)
 * @param {object} args.actor      — the signed-in reopener (≠ closedBy)
 * @returns {Promise<object>}      — updated PeriodClose row
 */
async function reopenPeriod(periodCloseId, args = {}) {
    const { reason, actor } = args;
    const { actorId } = booksWriterOf(actor);
    if (!periodCloseId || typeof periodCloseId !== 'string') {
        throw Object.assign(new Error('periodCloseId is required'), { code: 'VALIDATION_ERROR' });
    }
    if (!reason || typeof reason !== 'string' || reason.trim().length < 10) {
        throw Object.assign(
            new Error('reason is required and must be at least 10 characters'),
            { code: 'VALIDATION_ERROR' },
        );
    }

    const prisma = resolvePrisma();
    if (!prisma) {
        throw Object.assign(new Error('Prisma client not available'), { code: 'DB_UNAVAILABLE' });
    }

    const existing = await prisma.periodClose.findUnique({ where: { id: periodCloseId } });
    if (!existing) {
        throw Object.assign(new Error(`PeriodClose ${periodCloseId} not found`), { code: 'NOT_FOUND' });
    }
    assertRowInCallerOrganization(actor, existing);
    if (existing.status !== STATUS.CLOSED) {
        throw Object.assign(
            new Error(`PeriodClose ${periodCloseId} is not in CLOSED status (current: ${existing.status})`),
            { code: 'INVALID_STATE' },
        );
    }
    // SEPARATION OF DUTIES — the reopener MUST be a different user from
    // the closer. TFRS for NPAEs ch.2 internal controls demand this gap
    // so a single insider cannot close + reopen + back-date.
    if (String(actorId) === String(existing.closedBy)) {
        throw Object.assign(
            new Error('Reopener must be different from the original closer (segregation of duties)'),
            { code: 'SELF_REOPEN_FORBIDDEN' },
        );
    }

    // Once, and the close checked above only: a second reopen that read CLOSED too matches
    // nothing here, and neither does a close made in between by someone else (reopened and
    // closed again by this reopener, the segregation check would have refused it).
    const claimed = await prisma.periodClose.updateMany({
        where: { id: periodCloseId, status: STATUS.CLOSED, closedBy: existing.closedBy },
        data: {
            status: STATUS.REOPENED,
            reopenedAt: new Date(),
            reopenedBy: actorId,
            reopenReason: reason.trim(),
        },
    });
    if (claimed.count !== 1) {
        throw Object.assign(
            new Error(`PeriodClose ${periodCloseId} was reopened concurrently`),
            { code: 'INVALID_STATE' },
        );
    }
    const updated = await prisma.periodClose.findUnique({ where: { id: periodCloseId } });

    await safeAudit({
        action: ACTIONS.REOPENED,
        severity: 'WARNING',
        actorId,
        organizationId: existing.organizationId,
        payload: {
            periodCloseId,
            year: existing.year,
            month: existing.month,
            originalCloser: existing.closedBy,
            reason: reason.trim(),
        },
    });

    logger.warn(
        `[period-close] REOPENED ${existing.year}-${String(existing.month).padStart(2, '0')} `
        + `org=${existing.organizationId} by=${actorId} reason="${reason.trim()}"`,
        { periodCloseId },
    );

    return updated;
}

/**
 * Predicate — is the (organizationId, year, month) period CLOSED right now?
 *
 * Returns true ONLY when a row exists with status='CLOSED'. OPEN
 * (no row) or REOPENED returns false — those periods accept new entries.
 *
 * Used by journal-entry-service / manual-journal-entry-service to gate
 * insertion of new entries whose `entryDate` lands in a closed period.
 *
 * @param {object} args
 * @param {number} args.year
 * @param {number} args.month
 * @param {string} [args.organizationId]
 * @param {object} [args.client]  the transaction to read through (the journal writer's own)
 * @returns {Promise<boolean>}
 */
async function isPeriodClosed({ year, month, organizationId, client = null } = {}) {
    if (!Number.isInteger(year) || !Number.isInteger(month)) {
        // Reject invalid args silently as "not closed" — defensive: a
        // bogus date should not block journal posting, the caller's date
        // validator will surface the real error.
        return false;
    }
    // organizationId is required to scope the check to the correct tenant.
    // A missing organizationId previously fell through to a cross-tenant query
    // that could let one tenant's period close block another tenant's GL writes.
    if (!organizationId) {
        logger.warn('[period-close] isPeriodClosed called without organizationId — defaulting to NOT closed to avoid cross-tenant block');
        return false;
    }
    // A check that cannot read close rows cannot say the month is open: no client, or one with no
    // periodClose model, refuses exactly like a failed read (security review of a46baa286, L2).
    const unavailable = () => Object.assign(new Error('Period-close status check unavailable — cannot confirm the period is open'), {
        code: 'PERIOD_CHECK_UNAVAILABLE',
        // Bug 7.4 (adversarial-verify finding 5): carry the HTTP status so
        // sendServiceError-based routes (credit-notes / debit-notes) and any
        // generic catch that honours statusCode return 503 (transient), not 500.
        statusCode: 503,
        httpStatus: 503,
        year,
        month,
        organizationId,
    });
    const prisma = resolvePrisma(client);
    if (!prisma) {
        logger.error('[period-close] isPeriodClosed has no client that reads close rows — failing CLOSED');
        throw unavailable();
    }
    const where = { year, month, status: STATUS.CLOSED, organizationId };
    let row;
    try {
        row = await prisma.periodClose.findFirst({ where, select: { id: true } });
    } catch (err) {
        // Bug 7.4: FAIL CLOSED. The old code swallowed this error and returned
        // null → Boolean(null) === false → the period read as OPEN, letting a
        // journal entry post into a period we could not confirm was open. A
        // transient DB failure must BLOCK the post, not wave it through.
        logger.error(`[period-close] isPeriodClosed query failed — failing CLOSED: ${err?.message}`);
        throw unavailable();
    }
    return Boolean(row);
}

/**
 * List period-close records for reporting. Used by the finance dashboard
 * + AUDITOR review screens.
 *
 * @param {object} args
 * @param {string} [args.organizationId]
 * @param {number} [args.fromYear]
 * @param {number} [args.toYear]
 * @returns {Promise<Array>}
 */
async function getPeriodCloseStatus({ organizationId, fromYear, toYear } = {}) {
    const prisma = resolvePrisma();
    if (!prisma) {
        return [];
    }
    const where = {};
    if (organizationId) {
        where.organizationId = organizationId;
    }
    if (Number.isInteger(fromYear) || Number.isInteger(toYear)) {
        where.year = {};
        if (Number.isInteger(fromYear)) {where.year.gte = fromYear;}
        if (Number.isInteger(toYear)) {where.year.lte = toYear;}
    }
    return prisma.periodClose.findMany({
        where,
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        take: 500,
    }).catch((err) => {
        logger.warn(`[period-close] getPeriodCloseStatus query failed: ${err?.message}`);
        return [];
    });
}

/** One close record by id, or null. */
async function getPeriodCloseById(periodCloseId) {
    const prisma = resolvePrisma();
    if (!prisma || !periodCloseId) { return null; }
    return prisma.periodClose.findUnique({ where: { id: String(periodCloseId) } });
}

module.exports = {
    STATUS,
    ACTIONS,
    closePeriod,
    getPeriodCloseById,
    reopenPeriod,
    isPeriodClosed,
    getPeriodCloseStatus,
    // Pure helpers exposed for unit tests
    _internals: {
        validateYearMonth,
        isMonthFullyElapsed,
    },
};

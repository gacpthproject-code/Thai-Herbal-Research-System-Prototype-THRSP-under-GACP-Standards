/**
 * Manual Journal Entry Service — workflow for non-slip-driven entries.
 *
 * Batch B20-C (2026-05-16). Finance staff need to record entries that
 * aren't tied to a slip approval — bank charges, FX gain/loss, accrual
 * reversals, manual corrections after appropriate approval. This service
 * owns the draft → approval → posting workflow with strict separation
 * of duties.
 *
 * State machine:
 *
 *   ┌─────────┐  approve   ┌──────────┐   post   ┌────────┐
 *   │ DRAFT   │ ─────────▶ │ APPROVED │ ───────▶ │ POSTED │
 *   └────┬────┘            └─────┬────┘          └────────┘
 *        │                       │                    │
 *        │ reject                │ reject             │ (terminal)
 *        ▼                       ▼                    ▼
 *   ┌──────────┐            ┌──────────┐         (immutable)
 *   │ REJECTED │            │ REJECTED │
 *   └──────────┘            └──────────┘
 *
 *   - POSTED is terminal — TFRS for NPAEs forbids editing a posted entry.
 *     Corrections must be entered as a SEPARATE reversing entry.
 *   - Separation of duties: the approver MUST NOT be the same user as
 *     the creator. Enforced in approveManualEntry below.
 *
 * Compliance basis:
 *   - TFRS for NPAEs ch.2 — internal controls require segregation of
 *     incompatible functions: the staff member who creates a journal
 *     entry cannot be the one who approves it. This service enforces
 *     that gate (approverId !== createdBy).
 *   - TFRS for NPAEs ch.18 — once posted, a journal entry is part of
 *     the chronological accounting record and is immutable. Corrections
 *     are made via reversing entries.
 *   - TAS 1 (Presentation of Financial Statements) — manual entries
 *     must reference the same chart of accounts as auto entries
 *     (chart-of-accounts-service.js).
 *   - ป.รัษฎากร ม.86/4 — sequential numbering on tax-bearing documents;
 *     `draftNumber` (MJE-yyyy-nnnnnn) preserves the audit trail even
 *     when an entry is rejected (gap is meaningful — auditor can see
 *     "MJE-2026-000005 was rejected" rather than not knowing it existed).
 *   - ป.รัษฎากร ม.87/3 — 5-year retention; the draft row survives the
 *     full window with rejectedAt / rejectionReason populated.
 *
 * Schema (see prisma/schema/billing.prisma — model ManualJournalEntryDraft):
 *   - Draft row carries linesJson (validated per-line debit/credit + CoA
 *     account code).
 *   - When POSTED, a JournalEntry + JournalLine cascade is written; the
 *     resulting journalEntryId is back-stamped on the draft row so the
 *     auditor can hop from manual-entry list → posted GL entry.
 *
 * Boundary:
 *   - READS chart-of-accounts-service for CoA validation.
 *   - WRITES ManualJournalEntryDraft (this service owns the table).
 *   - WRITES JournalEntry + JournalLine on `postManualEntry` only.
 *   - Does NOT call journal-entry-service.recordPaymentEntry — that's
 *     the slip-flow path. This service writes directly via prisma
 *     inside a $transaction with description prefix '[MANUAL]' so a
 *     trial-balance dump can filter manual vs auto rows even before
 *     the dedicated entryType discriminator column lands.
 *
 * @module services/manual-journal-entry-service
 */

'use strict';

let prismaModule;
try {
    prismaModule = require('./prisma-database');
} catch (_e) {
    prismaModule = { prisma: null };
}

const logger = require('../shared/logger');
const chartOfAccounts = require('./chart-of-accounts-service');
const {
    booksOrganizationWhere, assertNotMaker, assertBooksReader, assertBooksWriter, assertRowInCallerOrganization,
} = require('./finance/company-books-access');
const { lockManualJournalNumberSeries } = require('./finance/books-locks');
const { localYear } = require('../utils/working-days');

// Iter 24 — Period-close guard, loaded at CALL time and FAILING CLOSED
// (controller ruling 2026-09-26): a guard that cannot load refuses the post
// with PERIOD_CHECK_UNAVAILABLE instead of being skipped.
const { loadPeriodGuardOrRefuse } = require('./period-guard-loader');

// Status state-machine values. Frozen so callers can't mutate.
const STATUS = Object.freeze({
    DRAFT: 'DRAFT',
    APPROVED: 'APPROVED',
    POSTED: 'POSTED',
    REJECTED: 'REJECTED',
});

// Audit action names — kept centralised so audit-logger callers + tests
// can import the canonical strings.
const ACTIONS = Object.freeze({
    DRAFT_CREATED: 'MANUAL_JE_DRAFT_CREATED',
    APPROVED: 'MANUAL_JE_APPROVED',
    POSTED: 'MANUAL_JE_POSTED',
    REJECTED: 'MANUAL_JE_REJECTED',
});

function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Resolve the current Prisma client (or null in stubbed/test envs).
 */
function resolvePrisma(tx) {
    const candidate = tx || (prismaModule && prismaModule.prisma);
    if (!candidate) {
        return null;
    }
    const model = candidate.manualJournalEntryDraft;
    if (!model || typeof model !== 'object' || typeof model.create !== 'function') {
        return null;
    }
    return candidate;
}

/**
 * Validate the lines array — each must have accountCode (existing in
 * canonical CoA), and exactly one of debit / credit > 0. Sum of debits
 * MUST equal sum of credits (TFRS for NPAEs ch.2 — double-entry
 * invariant).
 *
 * Returns { totalDebit, totalCredit, normalizedLines } on success;
 * throws { code: 'VALIDATION_ERROR' } on failure.
 */
function validateLines(lines) {
    if (!Array.isArray(lines) || lines.length < 2) {
        throw Object.assign(
            new Error('lines must be an array with at least 2 entries (one debit + one credit)'),
            { code: 'VALIDATION_ERROR' },
        );
    }

    let totalDebit = 0;
    let totalCredit = 0;
    const normalizedLines = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNumber = Number(line.lineNumber || (i + 1));
        const accountCode = String(line.accountCode || '').trim();
        const debit = round2(line.debit || 0);
        const credit = round2(line.credit || 0);

        if (!accountCode) {
            throw Object.assign(
                new Error(`line ${lineNumber}: accountCode is required`),
                { code: 'VALIDATION_ERROR' },
            );
        }

        if (!chartOfAccounts.accountExists(accountCode)) {
            throw Object.assign(
                new Error(`line ${lineNumber}: accountCode '${accountCode}' is not in the canonical chart of accounts`),
                { code: 'UNKNOWN_ACCOUNT_CODE' },
            );
        }

        if (debit < 0 || credit < 0) {
            throw Object.assign(
                new Error(`line ${lineNumber}: debit/credit cannot be negative`),
                { code: 'VALIDATION_ERROR' },
            );
        }

        if (debit > 0 && credit > 0) {
            throw Object.assign(
                new Error(`line ${lineNumber}: cannot have both debit and credit on a single line`),
                { code: 'VALIDATION_ERROR' },
            );
        }

        if (debit === 0 && credit === 0) {
            throw Object.assign(
                new Error(`line ${lineNumber}: at least one of debit/credit must be > 0`),
                { code: 'VALIDATION_ERROR' },
            );
        }

        const account = chartOfAccounts.getAccountByCode(accountCode);
        normalizedLines.push({
            lineNumber,
            accountCode,
            accountName: account.name,
            debit,
            credit,
        });

        totalDebit = round2(totalDebit + debit);
        totalCredit = round2(totalCredit + credit);
    }

    if (Math.abs(totalDebit - totalCredit) >= 0.005) {
        throw Object.assign(
            new Error(`unbalanced entry: Dr ${totalDebit} != Cr ${totalCredit}`),
            { code: 'UNBALANCED_ENTRY' },
        );
    }

    return { totalDebit, totalCredit, normalizedLines };
}

/** The signed-in actor's id: who made, approved, posted or rejected an entry. */
function signedInId(actor) {
    if (!actor?.id) {
        throw Object.assign(new Error('The signed-in actor has no id'), { code: 'VALIDATION_ERROR' });
    }
    return actor.id;
}

/**
 * The draft a signed-in company finance officer approves, posts or rejects: refused unless the
 * actor writes the books and the draft is of the actor's organization (orders 17, 29), whatever
 * door called in (security review 2026-10-09, L5).
 */
async function draftForBooksWriter(prisma, draftId, actor) {
    assertBooksWriter(actor);
    const draft = await prisma.manualJournalEntryDraft.findUnique({ where: { id: draftId } });
    if (!draft) {
        throw Object.assign(new Error(`draft ${draftId} not found`), { code: 'NOT_FOUND' });
    }
    assertRowInCallerOrganization(actor, draft);
    return draft;
}

/**
 * Move a draft out of `from`, once. The conditional write takes the row lock and Postgres
 * re-checks the status after any concurrent writer commits: of two transitions that both
 * read `from`, only the first applies and the other is refused (INVALID_STATE, 409).
 */
async function claimTransition(client, draftId, from, data) {
    const claimed = await client.manualJournalEntryDraft.updateMany({ where: { id: draftId, status: from }, data });
    if (claimed.count !== 1) {
        throw Object.assign(
            new Error(`draft ${draftId} is no longer ${from}: it changed concurrently`),
            { code: 'INVALID_STATE' },
        );
    }
}

/**
 * Allocate the next draft number — MJE-{yearAD}-{seq6}: one after the highest of the year.
 * Called inside the transaction that inserts the draft, under a lock held to its end, so
 * two drafts made at once read the series one after the other (counting rows and adding
 * one, unlocked, gave both the same number and the second create died on the unique key).
 */
async function allocateDraftNumber(tx) {
    const prefix = `MJE-${localYear()}-`; // Bangkok year
    await lockManualJournalNumberSeries(tx, prefix);
    const last = await tx.manualJournalEntryDraft.findFirst({
        where: { draftNumber: { startsWith: prefix } },
        orderBy: { draftNumber: 'desc' },
        select: { draftNumber: true },
    });
    const next = last ? Number(last.draftNumber.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(next).padStart(6, '0')}`;
}

/**
 * Create a DRAFT manual journal entry.
 *
 * The maker and the organization are the signed-in actor's (security review 2026-10-09,
 * L2): segregation of duties is only as good as the maker id, so no caller supplies it.
 *
 * @param {object} args
 * @param {string} args.description       free-form (becomes [MANUAL] + description on the posted entry)
 * @param {Array}  args.lines             [{ accountCode, debit, credit }]
 * @param {object} args.actor             the signed-in company finance officer
 * @param {string|Date} args.postingDate  accounting date (defaults to today)
 * @param {string} args.reason            business reason (e.g. "Bank charge 2026-05-15")
 * @returns {Promise<object>}             persisted draft row
 */
async function createDraftManualEntry(args = {}) {
    const {
        description,
        lines,
        actor,
        postingDate,
        reason,
    } = args;

    if (!description || typeof description !== 'string') {
        throw Object.assign(new Error('description is required'), { code: 'VALIDATION_ERROR' });
    }
    const actorId = signedInId(actor);
    assertBooksWriter(actor);
    const organizationId = booksOrganizationWhere(actor).organizationId || null;
    if (!reason || typeof reason !== 'string') {
        throw Object.assign(new Error('reason is required'), { code: 'VALIDATION_ERROR' });
    }

    const { totalDebit, totalCredit, normalizedLines } = validateLines(lines);

    const prisma = resolvePrisma();
    if (!prisma) {
        throw Object.assign(new Error('Prisma client not available'), { code: 'DB_UNAVAILABLE' });
    }

    const postingDateValue = postingDate
        ? (postingDate instanceof Date ? postingDate : new Date(postingDate))
        : new Date();

    const draft = await prisma.$transaction(async (tx) => tx.manualJournalEntryDraft.create({
        data: {
            draftNumber: await allocateDraftNumber(tx),
            description: description.trim(),
            postingDate: postingDateValue,
            reason: reason.trim(),
            status: STATUS.DRAFT,
            linesJson: normalizedLines,
            totalDebit,
            totalCredit,
            createdBy: actorId,
            organizationId,
        },
    }));

    logger.info(`[manual-je] DRAFT created ${draft.draftNumber} (Dr=${totalDebit} Cr=${totalCredit})`, {
        draftId: draft.id,
        actorId,
        organizationId,
    });

    return draft;
}

/**
 * Approve a DRAFT manual entry.
 *
 * Separation of duties — TFRS for NPAEs ch.2 internal controls require
 * that the staff member who CREATED the entry cannot be the one who
 * APPROVES it. Enforced here: the signed-in approver !== draft.createdBy.
 *
 * @param {string} draftId
 * @param {object} args
 * @param {object} args.actor            the signed-in approver; never the maker
 */
async function approveManualEntry(draftId, args = {}) {
    const { actor } = args;
    const approverId = signedInId(actor);

    const prisma = resolvePrisma();
    if (!prisma) {
        throw Object.assign(new Error('Prisma client not available'), { code: 'DB_UNAVAILABLE' });
    }

    const draft = await draftForBooksWriter(prisma, draftId, actor);
    if (draft.status !== STATUS.DRAFT) {
        throw Object.assign(
            new Error(`draft ${draftId} is not in DRAFT status (current: ${draft.status})`),
            { code: 'INVALID_STATE' },
        );
    }
    // SEPARATION OF DUTIES — the approver MUST be a different user.
    assertNotMaker(actor, draft.createdBy, 'SELF_APPROVAL_FORBIDDEN');

    await claimTransition(prisma, draftId, STATUS.DRAFT, {
        status: STATUS.APPROVED,
        approvedBy: approverId,
        approvedAt: new Date(),
    });
    const updated = await prisma.manualJournalEntryDraft.findUnique({ where: { id: draftId } });

    logger.info(`[manual-je] APPROVED ${draft.draftNumber} by ${approverId}`, {
        draftId,
        createdBy: draft.createdBy,
        approverId,
    });

    return updated;
}

/**
 * Post an APPROVED draft to the journal. Writes the JournalEntry +
 * JournalLine rows inside a $transaction alongside the draft status
 * update. After posting, the draft is terminal (POSTED) and corrections
 * must be entered as a separate reversing entry.
 *
 * @param {string} draftId
 * @param {object} args
 * @param {object} args.actor            the signed-in officer clicking POST; the entry's
 *                                       createdBy (need not differ from the approver)
 */
async function postManualEntry(draftId, args = {}) {
    const { actor, allowClosedPeriod = false } = args;
    const actorId = signedInId(actor);
    const prisma = resolvePrisma();
    if (!prisma) {
        throw Object.assign(new Error('Prisma client not available'), { code: 'DB_UNAVAILABLE' });
    }

    const draft = await draftForBooksWriter(prisma, draftId, actor);
    if (draft.status !== STATUS.APPROVED) {
        throw Object.assign(
            new Error(`draft ${draftId} is not in APPROVED status (current: ${draft.status})`),
            { code: 'INVALID_STATE' },
        );
    }
    const periodGuard = loadPeriodGuardOrRefuse();

    // Re-validate the lines defensively — they were validated at draft
    // time, but the CoA could have changed between create and post.
    const linesArray = Array.isArray(draft.linesJson) ? draft.linesJson : [];
    const { totalDebit, totalCredit, normalizedLines } = validateLines(linesArray);

    // Atomic write — JournalEntry + lines + draft.status update commit
    // together or roll back together. The status flip is a claim made before the
    // journal write: a second post that read APPROVED too waits on the row lock, then
    // matches nothing and is refused, so the entry is written once.
    const result = await prisma.$transaction(async (tx) => {
        await claimTransition(tx, draftId, STATUS.APPROVED, { status: STATUS.POSTED, postedAt: new Date() });
        // Iter 24 — Period-close guard, in this transaction under the month's lock: a post
        // into a CLOSED month is refused (PERIOD_CLOSED, 409) unless allowClosedPeriod=true
        // (recovery flag, audit-logged elsewhere), and a close of the month waits for it.
        await periodGuard.checkPeriodOpen({
            entryDate: draft.postingDate,
            organizationId: draft.organizationId || null,
            allowClosedPeriod: allowClosedPeriod === true,
            tx,
        });
        const entry = await tx.journalEntry.create({
            data: {
                entryDate: draft.postingDate,
                reference: draft.draftNumber,
                // entryType discriminator: while a dedicated `entryType`
                // column hasn't been added to JournalEntry yet (DBA
                // change), the `[MANUAL]` description prefix is the
                // wire-format flag that trial-balance + financial-
                // statements aggregators read on (B19-B). Documented in
                // docs/accounting/manual-je-and-daily-cash-2026-05-16.md.
                description: `[MANUAL] ${draft.description}`,
                totalDebit,
                totalCredit,
                organizationId: draft.organizationId,
                createdBy: actorId,
                lines: {
                    create: normalizedLines.map((l) => ({
                        lineNumber: l.lineNumber,
                        accountCode: l.accountCode,
                        accountName: l.accountName,
                        debit: l.debit,
                        credit: l.credit,
                        metadata: {
                            kind: 'MANUAL',
                            draftNumber: draft.draftNumber,
                            draftId: draft.id,
                        },
                    })),
                },
            },
            include: { lines: true },
        });

        const updatedDraft = await tx.manualJournalEntryDraft.update({
            where: { id: draftId },
            data: { postedJournalEntryId: entry.id },
        });

        return { entry, draft: updatedDraft };
    });

    logger.info(`[manual-je] POSTED ${draft.draftNumber} → journalEntryId=${result.entry.id}`, {
        draftId,
        journalEntryId: result.entry.id,
        actorId,
    });

    return result;
}

/**
 * Reject a draft. Valid from DRAFT or APPROVED. Records the rejector +
 * timestamp + reason; the row is preserved (audit trail) but cannot be
 * resurrected — finance must create a fresh draft if needed.
 *
 * @param {string} draftId
 * @param {object} args
 * @param {string} args.reason          ≥ 10 chars
 * @param {object} args.actor           the signed-in rejector
 */
async function rejectManualEntry(draftId, args = {}) {
    const { reason, actor } = args;
    if (!reason || typeof reason !== 'string' || reason.trim().length < 10) {
        throw Object.assign(
            new Error('reason is required and must be at least 10 characters'),
            { code: 'VALIDATION_ERROR' },
        );
    }
    const rejectorId = signedInId(actor);

    const prisma = resolvePrisma();
    if (!prisma) {
        throw Object.assign(new Error('Prisma client not available'), { code: 'DB_UNAVAILABLE' });
    }

    const draft = await draftForBooksWriter(prisma, draftId, actor);
    if (draft.status !== STATUS.DRAFT && draft.status !== STATUS.APPROVED) {
        throw Object.assign(
            new Error(`draft ${draftId} cannot be rejected from ${draft.status}`),
            { code: 'INVALID_STATE' },
        );
    }

    // The draft in the status read above only: an approval or a post that committed in
    // between is not overwritten (re-read it before rejecting).
    await claimTransition(prisma, draftId, draft.status, {
        status: STATUS.REJECTED,
        rejectedAt: new Date(),
        rejectedBy: rejectorId,
        rejectionReason: reason.trim(),
    });
    const updated = await prisma.manualJournalEntryDraft.findUnique({ where: { id: draftId } });

    logger.info(`[manual-je] REJECTED ${draft.draftNumber} by ${rejectorId}`, {
        draftId,
        priorStatus: draft.status,
        reason: reason.trim(),
    });

    return updated;
}

/**
 * List drafts, optionally by status, in the signed-in reader's organization (order 17):
 * a caller with no organization, or no books role, gets nothing.
 */
async function listDrafts(args = {}) {
    const { status = null, limit = 100, actor } = args;
    assertBooksReader(actor);
    const where = { ...booksOrganizationWhere(actor) };
    const prisma = resolvePrisma();
    if (!prisma) {
        return [];
    }
    if (status) {
        where.status = status;
    }
    return prisma.manualJournalEntryDraft.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        take: Math.min(Math.max(1, Math.floor(Number(limit) || 100)), 500),
    });
}

/**
 * Fetch a single draft by id (with full linesJson).
 */
async function getDraftById(draftId) {
    const prisma = resolvePrisma();
    if (!prisma) {
        return null;
    }
    return prisma.manualJournalEntryDraft.findUnique({ where: { id: draftId } });
}

module.exports = {
    STATUS,
    ACTIONS,
    validateLines,
    createDraftManualEntry,
    approveManualEntry,
    postManualEntry,
    rejectManualEntry,
    listDrafts,
    getDraftById,
};

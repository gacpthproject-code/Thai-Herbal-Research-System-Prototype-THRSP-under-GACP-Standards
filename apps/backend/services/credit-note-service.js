/**
 * Credit Note Service — ใบลดหนี้ (Credit Note)
 *
 * Batch B20-A (Finance + Compliance + Backend, 2026-05-16).
 *
 * Responsibility:
 *   - Create / issue / post / cancel Credit Notes (ใบลดหนี้) against a
 *     previously issued PLATFORM full tax invoice (ใบกำกับภาษีเต็มรูป).
 *   - Allocate the canonical CN number via receipt-numbering-service
 *     (documentType='CREDIT_NOTE_PLATFORM' → format `CN-PRD-{yearAD}-{seq6}`).
 *   - Drive the document state machine:
 *
 *         DRAFT ──issue──▶ ISSUED ──post──▶ POSTED
 *           │                 │
 *           └─cancel─▶ CANCELLED ◀─cancel──┘
 *
 *     POSTED is terminal — any further correction must be issued as a new
 *     CN or DN (standard accounting practice: never edit a posted entry,
 *     always reverse).
 *
 *   - Tenancy + role gating: a credit note is a document of the company's
 *     books, so only finance_officer_platform writes one (order 29: the DTAM
 *     admin writes nothing in the company's books), inside its own
 *     organization (order 17; no organization = deny). Read operations accept
 *     both finance roles + system_admin_dtam (operator 2026-09-11 / 2026-09-27),
 *     each inside its own organization; only system_admin_platform crosses
 *     organizations, and it holds no finance read role.
 *   - The manual door (createCreditNote / issueCreditNote) adjusts a price or
 *     corrects an amount and leaves something on the invoice. Cancelling a
 *     service and crediting a whole invoice go through refund-service only,
 *     which records the refund that makes the milestone count as unpaid.
 *
 * Legal basis (ป.รัษฎากร):
 *   - ม.86/10 — ใบลดหนี้: a VAT-registered seller that has issued a tax
 *     invoice and subsequently reduces the taxable amount MUST issue a
 *     credit note to the buyer in the same VAT period where the change
 *     occurs. The CN must:
 *       1. Reference the ORIGINAL tax-invoice number;
 *       2. State the reason for the adjustment (เหตุที่ออกใบลดหนี้);
 *       3. Show the reduced amount + VAT separately;
 *       4. Be reported in ภ.พ.30 as a DEDUCTION from output VAT.
 *   - ม.86/4 — sequential numbering + 5-year retention.
 *   - ม.87/3 — retention of CN evidence for 5 years.
 *   - TFRS for NPAEs ch.18 (รายได้) — revenue is REDUCED at the period in
 *     which the CN is recognised; the original invoice + journal entry
 *     stay immutable, the CN posts a REVERSING entry instead.
 *
 * Scope: PLATFORM only. DTAM (state-fee) invoices are corrected via the
 * กรมบัญชีกลาง refund process (out of platform scope), so this service
 * REJECTS any attempt to create a CN against a STATE-issuer invoice.
 *
 * Journal-entry shape (POSTED state — REVERSING entry):
 *
 *     Dr. Revenue — Platform Fee         <subtotal>
 *     Dr. Output VAT 7%                  <vat>
 *       Cr. Cash / Customer Refund Payable        <totalAmount>
 *
 * Posted via `journalEntryService.recordCreditNoteEntry({...})` — see
 * services/journal-entry-service.js. If that function is not yet wired by
 * batch B20-B, this service falls back to a clearly-marked
 * `[credit-note][journal-fallback]` log line so finance can reconcile
 * manually. See `_postReversingJournalEntry()` below.
 *
 * @module services/credit-note-service
 */

'use strict';

const logger = require('../shared/logger');
const { normalizeRole } = require('../shared/canonical-rbac');
// What the payer block needs from the original invoice's application (never thaiCitizenId).
const { PAYER_APPLICATION_SELECT } = require('../utils/applicant-resolver');
const receiptNumbering = require('./receipt-numbering-service');
const journalEntryService = require('./journal-entry-service');
const { auditLogger, AuditCategory, AuditSeverity, ResourceType } = require('../middleware/audit-logger');
const {
    BOOKS_WRITE_ROLES, BOOKS_READ_ROLES, booksOrganizationWhere, isRowInCallerOrganization, rowInCallerOrganization,
} = require('./finance/company-books-access');
const { getZonedParts, parseLocalIsoDate, dbDateIsoDay } = require('../utils/working-days');

let prismaModule;
try {
    prismaModule = require('./prisma-database');
} catch (_e) {
    prismaModule = { prisma: null };
}

// ── State machine ──────────────────────────────────────────────────────────

const STATUS = Object.freeze({
    DRAFT: 'DRAFT',
    ISSUED: 'ISSUED',
    POSTED: 'POSTED',
    CANCELLED: 'CANCELLED',
});

const VALID_REASON_CODES = Object.freeze([
    'CANCELLATION',      // service cancelled by buyer
    'PRICE_REDUCTION',   // agreed price discount post-invoice
    'CORRECTION',        // over-billing / arithmetic error
    'RETURN',            // partial return of supplied service
]);

// Allowed transitions out of each state.
const ALLOWED_TRANSITIONS = Object.freeze({
    [STATUS.DRAFT]:     new Set([STATUS.ISSUED, STATUS.CANCELLED]),
    [STATUS.ISSUED]:    new Set([STATUS.POSTED, STATUS.CANCELLED]),
    [STATUS.POSTED]:    new Set(),
    [STATUS.CANCELLED]: new Set(),
});

// Roles allowed to mutate (create / issue / post / cancel): the company's books (order 29).
const WRITE_ROLES = BOOKS_WRITE_ROLES;

// Reason codes the manual door refuses: a cancellation is recorded as a refund kind.
const REFUND_ONLY_REASON_CODES = new Set(['CANCELLATION']);

// Roles allowed to read.
// อ่าน — การเงินสองบทบาทเห็นเท่ากัน (operator 2026-09-11 / 2026-09-27 (A)) · ผู้ตรวจประเมินไม่อยู่ในชุดอ่านเรื่องเงิน (operator 2026-09-27)
const READ_ROLES = BOOKS_READ_ROLES;

// ── Pure helpers ───────────────────────────────────────────────────────────

function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
}

function makeError(code, message, status = 400) {
    const e = new Error(message);
    e.code = code;
    e.statusCode = status;
    return e;
}

function resolvePrisma(tx) {
    const client = tx || (prismaModule && prismaModule.prisma);
    if (!client) {return null;}
    if (!client.creditNote || typeof client.creditNote.create !== 'function') {
        return null;
    }
    return client;
}

/**
 * Order 17: the caller's own organization only. An actor with no organization,
 * and an invoice or note with none, is nobody's.
 */
function assertInCallerOrganization(actor, row) {
    if (!isRowInCallerOrganization(actor, row)) {
        throw makeError(
            'FORBIDDEN_TENANT',
            'Cross-tenant access denied — credit notes are scoped to the invoice owner',
            403,
        );
    }
}

function assertWriteRole(actor) {
    const role = normalizeRole(actor?.canonicalRole || actor?.role);
    if (!role || !WRITE_ROLES.has(role)) {
        throw makeError(
            'FORBIDDEN_ROLE',
            'The platform finance role is required to write credit notes',
            403,
        );
    }
}

/**
 * A write door's caller, checked before any row is read: the company's finance officer
 * (order 29) of an organization (order 17). Neither 403 depends on the id that was sent.
 */
function assertWriter(actor) {
    assertWriteRole(actor);
    booksOrganizationWhere(actor);
}


/**
 * The manual door adjusts; it never cancels. A CANCELLATION note, or one that
 * would leave nothing on the invoice, is a refund: refund-service records it,
 * so the milestone counts as unpaid and the application closes (order 20).
 */
async function assertManualAdjustment({ prisma, originalInvoice, reasonCode, subtotal, vat, excludeCreditNoteId }) {
    if (REFUND_ONLY_REASON_CODES.has(reasonCode)) {
        throw makeError(
            'CREDIT_NOTE_CANCELLATION_VIA_REFUND',
            'A cancellation is recorded as a refund (POST /api/finance/refunds/:invoiceId/provider-cancellation), not as a manual credit note',
            409,
        );
    }
    const prior = await priorCredited({ prisma, originalInvoiceId: originalInvoice.id, excludeCreditNoteId });
    const left = round2(round2(originalInvoice.subtotal || 0) + round2(originalInvoice.vat || 0)
        - prior.subtotal - prior.vat - round2(subtotal) - round2(vat));
    if (left <= 0) {
        throw makeError(
            'CREDIT_NOTE_FULL_CREDIT_VIA_REFUND',
            'This note would credit everything left on the invoice; a full credit is recorded as a refund, not as a manual credit note',
            409,
        );
    }
}

function assertReadAccess(actor) {
    const role = normalizeRole(actor?.canonicalRole || actor?.role);
    if (!role || !READ_ROLES.has(role)) {
        throw makeError(
            'FORBIDDEN_ROLE',
            'A finance or admin role is required to read credit notes',
            403,
        );
    }
}

/**
 * Validate that the supplied invoice is eligible for a credit note. Rules:
 *   - Must exist + not soft-deleted. A refund (acceptRetiredCharge) may credit
 *     a retired invoice that a late payment still settled: that payment issued
 *     its own tax invoice, and its duplicate refund is credited against it.
 *   - Status === 'paid' — you cannot credit-note an unpaid invoice.
 *   - Issuer === PLATFORM — STATE-fee invoices go through Treasury refund.
 *
 * The PLATFORM check is made via `journalEntryService.resolveIssuerType` on
 * `serviceType` (the same helper the journal layer uses), so the boundary
 * is identical to the one in the payment / VAT-report flows.
 */
function assertInvoiceEligible(invoice, { acceptRetiredCharge = false } = {}) {
    if (!invoice) {
        throw makeError('INVOICE_NOT_FOUND', 'Original invoice not found', 404);
    }
    if (invoice.isDeleted && !acceptRetiredCharge) {
        throw makeError('INVOICE_DELETED', 'Original invoice has been soft-deleted', 410);
    }
    const status = String(invoice.status || '').toLowerCase();
    if (status !== 'paid') {
        throw makeError(
            'INVOICE_NOT_PAID',
            `Credit note requires a PAID original invoice (current status: ${invoice.status})`,
            409,
        );
    }
    const issuerType = journalEntryService.resolveIssuerType(invoice.serviceType);
    if (issuerType !== journalEntryService.ISSUER.PLATFORM) {
        throw makeError(
            'NOT_PLATFORM_INVOICE',
            'Credit notes are issued only against PLATFORM tax invoices. '
            + 'STATE-fee corrections are handled via the กรมบัญชีกลาง refund process.',
            422,
        );
    }
}

/**
 * Validate the requested adjustment does not exceed the original invoice's
 * subtotal + vat. ม.86/10 ป.รัษฎากร allows reductions only up to the
 * originally invoiced taxable amount — a CN can never "go negative" past
 * the original transaction.
 *
 * Existing posted CNs are summed in so a series of partial credit notes
 * cannot drift past the original invoice in aggregate.
 */
async function assertWithinInvoiceCap({
    prisma, originalInvoice, subtotal, vat, excludeCreditNoteId,
}) {
    const reqSubtotal = round2(subtotal);
    const reqVat = round2(vat);
    if (reqSubtotal < 0 || reqVat < 0) {
        throw makeError(
            'INVALID_AMOUNT',
            'subtotal and vat must be non-negative (credit note amounts are positive numbers)',
        );
    }
    if (reqSubtotal === 0 && reqVat === 0) {
        throw makeError(
            'EMPTY_CREDIT_NOTE',
            'subtotal + vat must be greater than zero',
        );
    }

    const originalSubtotal = round2(originalInvoice.subtotal || 0);
    const originalVat = round2(originalInvoice.vat || 0);
    const { subtotal: priorSubtotal, vat: priorVat } = await priorCredited({
        prisma, originalInvoiceId: originalInvoice.id, excludeCreditNoteId,
    });

    if (round2(priorSubtotal + reqSubtotal) > originalSubtotal + 0.005) {
        throw makeError(
            'EXCEEDS_INVOICE_SUBTOTAL',
            `Credit-note subtotal exceeds remaining invoice subtotal `
            + `(requested ${reqSubtotal}, prior ${priorSubtotal}, original ${originalSubtotal})`,
        );
    }
    if (round2(priorVat + reqVat) > originalVat + 0.005) {
        throw makeError(
            'EXCEEDS_INVOICE_VAT',
            `Credit-note VAT exceeds remaining invoice VAT `
            + `(requested ${reqVat}, prior ${priorVat}, original ${originalVat})`,
        );
    }
}

/**
 * Sum of the ISSUED and POSTED credit notes against an invoice. Drafts are
 * excluded so a stale draft does not block a new CN; cancelled rows are
 * excluded by definition. Bug 5.2: the issue-time re-check excludes the CN
 * being issued, so its own amount is added once and not double-counted when it
 * has already flipped to ISSUED inside the tx.
 */
async function priorCredited({ prisma, originalInvoiceId, excludeCreditNoteId }) {
    if (!prisma || !prisma.creditNote || typeof prisma.creditNote.aggregate !== 'function') {
        return { subtotal: 0, vat: 0 };
    }
    const where = {
        originalInvoiceId,
        isDeleted: false,
        status: { in: [STATUS.ISSUED, STATUS.POSTED] },
    };
    if (excludeCreditNoteId) {
        where.id = { not: excludeCreditNoteId };
    }
    const prior = await prisma.creditNote.aggregate({ where, _sum: { subtotal: true, vat: true } });
    return {
        subtotal: round2(Number(prior._sum?.subtotal) || 0),
        vat: round2(Number(prior._sum?.vat) || 0),
    };
}

/** What may still be credited against an invoice: its amounts less every issued or posted note. */
async function creditableRemainder({ prisma, originalInvoice }) {
    const prior = await priorCredited({ prisma, originalInvoiceId: originalInvoice.id });
    const subtotal = round2(round2(originalInvoice.subtotal || 0) - prior.subtotal);
    const vat = round2(round2(originalInvoice.vat || 0) - prior.vat);
    return { subtotal, vat, total: round2(subtotal + vat) };
}

/** Run `work` on the caller's transaction when it passed one, else in a new one. */
function inTransaction(prisma, tx, work) {
    return tx ? work(tx) : prisma.$transaction(work);
}

function assertReason(reason, reasonCode) {
    if (typeof reason !== 'string' || reason.trim().length < 3) {
        throw makeError(
            'INVALID_REASON',
            'reason is required (Thai-language free-text, min 3 chars)',
        );
    }
    if (!VALID_REASON_CODES.includes(reasonCode)) {
        throw makeError(
            'INVALID_REASON_CODE',
            `reasonCode must be one of: ${VALID_REASON_CODES.join(', ')}`,
        );
    }
}

async function safeAudit(action, severity, actor, resourceId, metadata) {
    try {
        await auditLogger.log({
            category: AuditCategory.PAYMENT,
            action,
            severity,
            actorId: actor?.id || 'SYSTEM',
            actorEmail: actor?.email || null,
            actorRole: actor?.canonicalRole || actor?.role || 'UNKNOWN',
            actorType: actor?.providerId ? 'PROVIDER' : 'USER',
            resourceType: ResourceType.INVOICE,
            resourceId,
            organizationId: actor?.organizationId || null,
            metadata: metadata || {},
        });
    } catch (err) {
        logger.warn(`[credit-note] audit log failed (non-fatal): ${err?.message}`);
    }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Create a Credit Note in DRAFT status, through the manual door: a price
 * reduction, a correction or a return that leaves something on the invoice.
 *
 *   {
 *     originalInvoiceId,
 *     reasonCode,    // one of VALID_REASON_CODES except CANCELLATION
 *     reason,        // Thai-language free-text (printed on the PDF)
 *     subtotal,      // positive, < remaining invoice subtotal + VAT in total
 *     vat,           // positive, ≤ remaining invoice VAT
 *     actor,         // { id, canonicalRole, organizationId, ... }
 *   }
 *
 * The note's organization is the invoice's; no caller chooses it.
 *
 * @returns {Promise<object>}  the created CreditNote row (DRAFT)
 */
async function createCreditNote(args = {}) {
    return _createCreditNote(args, { manual: true });
}

async function _createCreditNote({
    originalInvoiceId, reasonCode, reason, subtotal, vat, actor, tx,
} = {}, { manual }) {
    if (!originalInvoiceId) {
        throw makeError('VALIDATION_ERROR', 'originalInvoiceId is required');
    }
    assertReason(reason, reasonCode);
    assertWriter(actor);

    const prisma = resolvePrisma(tx);
    if (!prisma) {
        throw makeError('DB_UNAVAILABLE', 'Prisma client unavailable for credit-note creation', 503);
    }

    const subtotalDec = round2(subtotal);
    const vatDec = round2(vat);
    const totalDec = round2(subtotalDec + vatDec);

    // A DRAFT consumes no document number (operator/controller 2026-09-26:
    // number year = printed year). The number is allocated at ISSUE, from the
    // same instant the note prints as its issue date — a draft made on 31 Dec
    // and issued on 2 Jan is a 2570 document with a 2570-series number, and an
    // abandoned draft leaves no gap in the CN-PRD series. A draft shows "ร่าง".
    //
    // The invoice row is locked before the credited total is read, as refund-service locks it, so a
    // note and a refund against one invoice read it one after the other. Whose invoice it is is read
    // before the lock: another organization's id neither waits on this organization's transaction
    // nor learns that it exists (R2-L2).
    const { created, originalInvoice } = await inTransaction(prisma, tx, async (client) => {
        const owned = rowInCallerOrganization(actor, await client.invoice.findUnique({
            where: { id: originalInvoiceId }, select: { organizationId: true },
        }));
        if (owned) {
            await client.$queryRaw`SELECT id FROM "invoices" WHERE id = ${originalInvoiceId} FOR UPDATE`;
        }
        const invoice = owned && rowInCallerOrganization(actor, await client.invoice.findUnique({
            where: { id: originalInvoiceId },
            select: {
                id: true,
                invoiceNumber: true,
                organizationId: true,
                serviceType: true,
                subtotal: true,
                vat: true,
                totalAmount: true,
                status: true,
                isDeleted: true,
            },
        }));
        assertInvoiceEligible(invoice, { acceptRetiredCharge: !manual });
        await assertWithinInvoiceCap({ prisma: client, originalInvoice: invoice, subtotal, vat });
        if (manual) {
            await assertManualAdjustment({ prisma: client, originalInvoice: invoice, reasonCode, subtotal, vat });
        }
        const row = await client.creditNote.create({
            data: {
                creditNoteNumber: null,
                originalInvoiceId,
                reason: String(reason).trim(),
                reasonCode,
                subtotal: subtotalDec,
                vat: vatDec,
                totalAmount: totalDec,
                status: STATUS.DRAFT,
                organizationId: invoice.organizationId,
            },
        });
        return { created: row, originalInvoice: invoice };
    });

    await safeAudit('CREDIT_NOTE_CREATED', AuditSeverity.INFO, actor,
        `CREDIT_NOTE:${created.id}`, {
            creditNoteNumber: created.creditNoteNumber,
            originalInvoiceId,
            originalInvoiceNumber: originalInvoice.invoiceNumber,
            reasonCode,
            subtotal: subtotalDec,
            vat: vatDec,
            totalAmount: totalDec,
        });

    logger.info(
        `[credit-note] DRAFT created (${created.id}, no number until issue) against `
        + `${originalInvoice.invoiceNumber} — Dr<<reverse>> ${totalDec} THB `
        + `(subtotal=${subtotalDec}, vat=${vatDec}), reasonCode=${reasonCode}`,
    );
    return created;
}

/**
 * Transition DRAFT → ISSUED. Records issuedAt + issuedBy and stamps the
 * row immutable from a status-perspective (the PDF can now safely be
 * generated and delivered; the financials are frozen).
 */
async function issueCreditNote(creditNoteId, { actor, tx } = {}) {
    return _issueCreditNote(creditNoteId, { actor, tx }, { manual: true });
}

async function _issueCreditNote(creditNoteId, { actor, tx }, { manual }) {
    if (!creditNoteId) {
        throw makeError('VALIDATION_ERROR', 'creditNoteId is required');
    }
    assertWriter(actor);
    const prisma = resolvePrisma(tx);
    if (!prisma) {
        throw makeError('DB_UNAVAILABLE', 'Prisma client unavailable', 503);
    }

    const cn = await prisma.creditNote.findUnique({
        where: { id: creditNoteId },
        include: {
            originalInvoice: {
                select: {
                    id: true, organizationId: true, invoiceNumber: true,
                    subtotal: true, vat: true,
                },
            },
        },
    });
    if (!rowInCallerOrganization(actor, cn, cn?.originalInvoice)) {
        throw makeError('CREDIT_NOTE_NOT_FOUND', 'Credit note not found', 404);
    }

    if (!ALLOWED_TRANSITIONS[cn.status]?.has(STATUS.ISSUED)) {
        throw makeError(
            'INVALID_TRANSITION',
            `Cannot issue credit note from status ${cn.status}`,
            409,
        );
    }

    // Bug 5.2 (cap-bypass TOCTOU): the create-time cap check only counted
    // prior ISSUED/POSTED. Two DRAFT CNs both pass at create, then both issue
    // → aggregate exceeds the original invoice, over-reversing output VAT.
    // Re-run the cap check INSIDE a $transaction — aggregating prior
    // ISSUED/POSTED (EXCLUDING this CN) + this CN's own subtotal/vat.
    // MF-2 (adversarial-verify): flipping THIS CN's status atomically does NOT
    // serialize two concurrent issues of DIFFERENT CNs — under READ COMMITTED the
    // non-locking aggregate lets both see prior=0 (write-skew). We must take a
    // SHARED-ROW LOCK on the ORIGINAL INVOICE so concurrent CN issues against the
    // same invoice serialize behind it (mirrors the 5.3 batch FOR UPDATE lock).
    const updated = await inTransaction(prisma, tx, async (client) => {
        await client.$queryRaw`SELECT id FROM "invoices" WHERE id = ${cn.originalInvoice.id} FOR UPDATE`;
        await assertWithinInvoiceCap({
            prisma: client,
            originalInvoice: cn.originalInvoice,
            subtotal: cn.subtotal,
            vat: cn.vat,
            excludeCreditNoteId: creditNoteId,
        });
        if (manual) {
            await assertManualAdjustment({
                prisma: client,
                originalInvoice: cn.originalInvoice,
                reasonCode: cn.reasonCode,
                subtotal: cn.subtotal,
                vat: cn.vat,
                excludeCreditNoteId: creditNoteId,
            });
        }
        // ONE instant: the printed issue date and the number's (Bangkok) year.
        const issuedAt = new Date();
        // CLAIM the draft before any number is drawn: the conditional update
        // takes this note's row lock and only matches while it is still DRAFT.
        // A concurrent issue of the SAME draft waits on the lock, then matches
        // nothing and is refused — its transaction never reaches the allocator,
        // so it cannot burn a number (re-review 2, New 1).
        const claimed = await client.creditNote.updateMany({
            where: { id: creditNoteId, status: STATUS.DRAFT },
            data: { status: STATUS.ISSUED, issuedAt, issuedBy: actor?.id || 'SYSTEM' },
        });
        if (claimed.count !== 1) {
            throw makeError('INVALID_TRANSITION', 'Credit note is no longer a DRAFT — it was issued or cancelled concurrently', 409);
        }
        // A draft made before numbers moved to issue (2026-09-26) already holds
        // one: keep it, so that number never becomes a gap in the series.
        // Otherwise allocate now, inside this transaction — a failure after this
        // point rolls the sequence back with the claim (no gap).
        const creditNoteNumber = cn.creditNoteNumber || (await receiptNumbering.allocateReceiptNumber({
            issuer: receiptNumbering.ISSUER.CREDIT_NOTE_PLATFORM,
            dateOrYear: issuedAt,
            prismaClient: client,
        })).number;
        return client.creditNote.update({
            where: { id: creditNoteId },
            data: { creditNoteNumber },
        });
    });

    await safeAudit('CREDIT_NOTE_ISSUED', AuditSeverity.INFO, actor,
        `CREDIT_NOTE:${updated.id}`, {
            creditNoteNumber: updated.creditNoteNumber,
            originalInvoiceNumber: cn.originalInvoice?.invoiceNumber,
        });
    logger.info(
        `[credit-note] ${updated.creditNoteNumber} ISSUED — PDF generation `
        + `eligible. Original invoice ${cn.originalInvoice?.invoiceNumber}.`,
    );
    return updated;
}

/**
 * Transition ISSUED → POSTED. Writes the REVERSING journal entry into the
 * GL and marks the CN immutable.
 *
 * REVERSING shape (PLATFORM only — STATE invoices are never CN-able):
 *     Dr. Revenue — Platform Fee         <subtotal>
 *     Dr. Output VAT 7%                  <vat>
 *       Cr. Cash / Customer Refund Payable    <totalAmount>
 *
 * Delegates to `journalEntryService.recordCreditNoteEntry(...)`. If that
 * method is not yet present (B20-B not yet wired by the journal owner), we
 * fall back to a structured `[credit-note][journal-fallback]` log so the
 * accounting team can reconcile manually and the next batch can wire the
 * persistence atomically. The CN status STILL transitions to POSTED in
 * either case — the document state machine should not stall on a missing
 * downstream service; the fallback marker carries enough information for
 * the next-batch wire-in to back-fill the GL entry.
 */
async function postCreditNote(creditNoteId, { actor, tx } = {}) {
    if (!creditNoteId) {
        throw makeError('VALIDATION_ERROR', 'creditNoteId is required');
    }
    assertWriter(actor);
    const prisma = resolvePrisma(tx);
    if (!prisma) {
        throw makeError('DB_UNAVAILABLE', 'Prisma client unavailable', 503);
    }

    const cn = await prisma.creditNote.findUnique({
        where: { id: creditNoteId },
        include: {
            originalInvoice: {
                select: {
                    id: true, organizationId: true, invoiceNumber: true,
                    serviceType: true, subtotal: true, vat: true, totalAmount: true,
                },
            },
        },
    });
    if (!rowInCallerOrganization(actor, cn, cn?.originalInvoice)) {
        throw makeError('CREDIT_NOTE_NOT_FOUND', 'Credit note not found', 404);
    }

    if (!ALLOWED_TRANSITIONS[cn.status]?.has(STATUS.POSTED)) {
        throw makeError(
            'INVALID_TRANSITION',
            `Cannot post credit note from status ${cn.status}`,
            409,
        );
    }

    const subtotal = round2(Number(cn.subtotal));
    const vatAmount = round2(Number(cn.vat));
    const total = round2(Number(cn.totalAmount));

    // Run the status flip + GL write atomically. The flip is a claim on the note while it
    // is still ISSUED, made before the GL write: a second post (or a cancel) that read
    // ISSUED too waits on the row lock, then matches nothing and is refused, so the
    // reversing entry is written once.
    const journalResult = await inTransaction(prisma, tx, async (client) => {
        const claimed = await client.creditNote.updateMany({
            where: { id: creditNoteId, status: STATUS.ISSUED },
            data: { status: STATUS.POSTED, postedAt: new Date(), postedBy: actor?.id || 'SYSTEM' },
        });
        if (claimed.count !== 1) {
            throw makeError('INVALID_TRANSITION', 'Credit note is no longer ISSUED: it was posted or cancelled concurrently', 409);
        }
        const updated = await client.creditNote.findUnique({ where: { id: creditNoteId } });
        const entry = await _postReversingJournalEntry({
            tx: client,
            creditNote: updated,
            originalInvoice: cn.originalInvoice,
            subtotal,
            vat: vatAmount,
            total,
            actor,
        });
        return { updated, entry };
    });

    await safeAudit('CREDIT_NOTE_POSTED', AuditSeverity.INFO, actor,
        `CREDIT_NOTE:${journalResult.updated.id}`, {
            creditNoteNumber: journalResult.updated.creditNoteNumber,
            originalInvoiceNumber: cn.originalInvoice?.invoiceNumber,
            journalEntryId: journalResult.entry?.journalEntryId || null,
            journalPersisted: !!journalResult.entry?.persisted,
            subtotal, vat: vatAmount, total,
        });
    logger.info(
        `[credit-note] ${journalResult.updated.creditNoteNumber} POSTED — `
        + `reversing entry Dr Revenue ${subtotal} / Dr VAT ${vatAmount} / `
        + `Cr Cash ${total} against invoice ${cn.originalInvoice?.invoiceNumber}.`,
    );
    return journalResult.updated;
}

/**
 * Soft-cancel a credit note. Allowed only from DRAFT or ISSUED — POSTED is
 * terminal (corrections require another CN/DN). Sets status=CANCELLED but
 * preserves the row so the audit trail is intact (ม.87/3 retention).
 */
async function cancelCreditNote(creditNoteId, { actor, reason } = {}) {
    if (!creditNoteId) {
        throw makeError('VALIDATION_ERROR', 'creditNoteId is required');
    }
    assertWriter(actor);
    const prisma = resolvePrisma();
    if (!prisma) {
        throw makeError('DB_UNAVAILABLE', 'Prisma client unavailable', 503);
    }

    const cn = await prisma.creditNote.findUnique({
        where: { id: creditNoteId },
        include: { originalInvoice: { select: { id: true, organizationId: true } } },
    });
    if (!rowInCallerOrganization(actor, cn, cn?.originalInvoice)) {
        throw makeError('CREDIT_NOTE_NOT_FOUND', 'Credit note not found', 404);
    }

    if (!ALLOWED_TRANSITIONS[cn.status]?.has(STATUS.CANCELLED)) {
        throw makeError(
            'INVALID_TRANSITION',
            `Cannot cancel credit note from status ${cn.status} `
            + '(POSTED is terminal — issue a new CN/DN to correct).',
            409,
        );
    }

    // Conditional write (fix round 4): cancel only the note in the status the
    // caller read — DRAFT or ISSUED, per ALLOWED_TRANSITIONS. The old
    // unconditional update let a cancel that read ISSUED overwrite a note a
    // concurrent post had just made POSTED (terminal: a posted note is
    // corrected by a new CN/DN, never cancelled), and let a cancel that read a
    // DRAFT void a note a concurrent issue had just numbered. The row lock
    // makes Postgres re-check the WHERE after the other writer commits; a
    // changed status matches nothing and is refused, so the caller re-reads.
    const cancelled = await prisma.creditNote.updateMany({
        where: { id: creditNoteId, status: cn.status },
        data: { status: STATUS.CANCELLED },
    });
    if (cancelled.count !== 1) {
        throw makeError(
            'INVALID_TRANSITION',
            `Credit note changed from ${cn.status} while it was being cancelled — re-read it before cancelling`,
            409,
        );
    }
    const updated = await prisma.creditNote.findUnique({ where: { id: creditNoteId } });

    await safeAudit('CREDIT_NOTE_CANCELLED', AuditSeverity.WARNING, actor,
        `CREDIT_NOTE:${updated.id}`, {
            creditNoteNumber: updated.creditNoteNumber,
            cancelReason: reason || null,
        });
    return updated;
}

/**
 * The credit note a recorded refund issues (refund-service only): created,
 * issued and posted inside the refund's transaction. It may cancel or credit a
 * whole invoice, and it may credit the retired invoice of a duplicate payment
 * the gateway settled late, since that payment issued its own tax invoice.
 */
async function recordRefundCreditNote({ tx, originalInvoiceId, reasonCode, reason, subtotal, vat, actor }) {
    const draft = await _createCreditNote({ originalInvoiceId, reasonCode, reason, subtotal, vat, actor, tx }, { manual: false });
    const issued = await _issueCreditNote(draft.id, { actor, tx }, { manual: false });
    return postCreditNote(issued.id, { actor, tx });
}

// The original invoice as the JSON detail route returns it. No applicant
// data: formData carries the wizard's personal fields (national ID included).
const ORIGINAL_INVOICE_SELECT = Object.freeze({
    id: true, invoiceNumber: true, serviceType: true,
    subtotal: true, vat: true, totalAmount: true,
    paidAt: true, organizationId: true, billingName: true,
    billingAddress: true, certificateNumber: true,
    // The original TAX INVOICE a note refers to (ม.86/9, ม.86/10): the settlement's TAX-PRD number.
    receiptNumber: true, receiptIssuedAt: true,
});

/**
 * INTERNAL ONLY: the original invoice as a note's paper reads it. `metadata` holds the mode
 * its settlement recorded (shared/payment-mode settledPaymentMode), which decides the trial
 * mark; it also holds staff refund notes, so this select never feeds a JSON response.
 */
const DOCUMENT_ORIGINAL_INVOICE_SELECT = Object.freeze({
    ...ORIGINAL_INVOICE_SELECT,
    metadata: true,
    application: { select: PAYER_APPLICATION_SELECT },
});

async function _findCreditNoteWith(creditNoteId, actor, originalInvoiceSelect) {
    assertReadAccess(actor);
    const prisma = resolvePrisma();
    if (!prisma) {return null;}
    const cn = await prisma.creditNote.findUnique({
        where: { id: creditNoteId },
        include: {
            originalInvoice: { select: originalInvoiceSelect },
        },
    });
    // Another organization's note answers as one that does not exist, as the receipt and
    // quotation doors do: a 403 here confirmed the id (security review of 1b554df0c, I6).
    return cn && isRowInCallerOrganization(actor, cn) ? cn : null;
}

async function findCreditNoteById(creditNoteId, { actor } = {}) {
    return _findCreditNoteWith(creditNoteId, actor, ORIGINAL_INVOICE_SELECT);
}

/**
 * INTERNAL ONLY — the credit note with its original invoice's applying entity, for
 * rendering the PDF. Never return this object from a route: the application's
 * formData carries the wizard's personal fields.
 *
 * The payer printed on a credit note is the ORIGINAL invoice's entity, resolved by
 * utils/applicant-resolver.js like every other finance document (operator rule
 * 2026-09-27, AUDIT_LEDGER L-083) — not the `billingName` snapshot, which no
 * writer in this repo populates. `thaiCitizenId` is never selected
 * (PAYER_ENTITY_SELECT).
 */
async function findCreditNoteForDocument(creditNoteId, { actor } = {}) {
    return _findCreditNoteWith(creditNoteId, actor, DOCUMENT_ORIGINAL_INVOICE_SELECT);
}

const BANK_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ./-]{2,63}$/;

/** A Bangkok calendar day 'YYYY-MM-DD' as the Date Postgres stores for @db.Date. */
function parseTransferDay(value) {
    const parts = parseLocalIsoDate(value);
    if (!parts) {return null;}
    const day = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    return dbDateIsoDay(day) === String(value).trim() ? day : null;
}

const bangkokDay = (date) => getZonedParts(date).isoDate;

/**
 * Invoice.metadata as an object. A legacy row holds it double-encoded as a JSON string (the old
 * holdInvoice JSON.stringify); read as-is, its refund block is invisible and spreading it writes
 * a char-indexed object back (mirrors wht-service, refund-service._readMetadata).
 */
function invoiceMetadataObject(metadata) {
    if (typeof metadata !== 'string') { return metadata || {}; }
    try {
        return JSON.parse(metadata || '{}') || {};
    } catch {
        return {};
    }
}

/**
 * Record that the company's bank paid the refund this credit note documents (order 20:
 * the system never moves the money; order 29: finance records the day and the bank's
 * reference). Once: the same record again is a no-op, a different one is refused.
 * A provider-cancellation refund on the original invoice turns COMPLETED.
 */
async function recordRefundTransfer(creditNoteId, { transferredOn, bankReference, actor } = {}) {
    assertWriter(actor);
    const day = parseTransferDay(transferredOn);
    if (!day) {
        throw makeError('REFUND_TRANSFER_DATE_INVALID', 'transferredOn must be a day YYYY-MM-DD');
    }
    const reference = typeof bankReference === 'string' ? bankReference.trim() : '';
    if (!BANK_REFERENCE_PATTERN.test(reference)) {
        throw makeError('REFUND_TRANSFER_REFERENCE_INVALID', 'bankReference: 3 to 64 letters, digits, spaces or . / -');
    }
    const prisma = resolvePrisma();
    if (!prisma) {
        throw makeError('DB_UNAVAILABLE', 'Prisma client unavailable', 503);
    }
    // liveNote runs before the lock, so another organization's id neither waits on this organization's
    // transaction nor learns that it exists (review of 163f352e9, L1), and again under the lock, because
    // the note can move or be deleted while this request waits (check of f45c9a987, Low-1).
    const liveNote = (row) => {
        const note = rowInCallerOrganization(actor, row);
        if (!note || note.isDeleted) {
            throw makeError('CREDIT_NOTE_NOT_FOUND', 'Credit note not found', 404);
        }
        return note;
    };
    return prisma.$transaction(async (tx) => {
        liveNote(await tx.creditNote.findUnique({
            where: { id: String(creditNoteId) }, select: { organizationId: true, isDeleted: true },
        }));
        await tx.$queryRaw`SELECT id FROM "credit_notes" WHERE id = ${String(creditNoteId)} FOR UPDATE`;
        const note = liveNote(await tx.creditNote.findUnique({ where: { id: String(creditNoteId) } }));
        if (note.status !== STATUS.POSTED) {
            throw makeError('REFUND_TRANSFER_NOTE_NOT_POSTED', 'Only a posted credit note documents a refund', 409);
        }
        const isoDay = dbDateIsoDay(day);
        if (isoDay > bangkokDay(new Date())) {
            throw makeError('REFUND_TRANSFER_DATE_INVALID', 'transferredOn is in the future');
        }
        if (isoDay < bangkokDay(note.issuedAt || note.createdAt)) {
            throw makeError('REFUND_TRANSFER_DATE_INVALID', 'transferredOn is before the credit note was issued');
        }
        if (note.refundTransferredOn) {
            const same = dbDateIsoDay(note.refundTransferredOn) === isoDay
                && note.refundBankReference === reference;
            if (same) {return note;}
            throw makeError('REFUND_TRANSFER_ALREADY_RECORDED', 'The refund transfer is already recorded with other details', 409);
        }
        const updated = await tx.creditNote.update({
            where: { id: note.id },
            data: {
                refundTransferredOn: day, refundBankReference: reference,
                refundTransferRecordedBy: actor?.id || null, refundTransferRecordedAt: new Date(),
            },
        });
        // The invoice's metadata is rewritten whole below: lock the row first, as every
        // other writer of it does (refund-service, the WHT record), so a write that lands
        // in between is read, not lost.
        await tx.$queryRaw`SELECT id FROM "invoices" WHERE id = ${note.originalInvoiceId} FOR UPDATE`;
        const invoice = await tx.invoice.findUnique({ where: { id: note.originalInvoiceId }, select: { id: true, metadata: true } });
        const metadata = invoiceMetadataObject(invoice?.metadata);
        const refund = metadata.refund;
        if (refund && refund.creditNoteId === note.id) {
            await tx.invoice.update({
                where: { id: invoice.id },
                data: { metadata: { ...metadata, refund: { ...refund, status: 'COMPLETED', transferredOn: isoDay } } },
            });
        }
        await safeAudit('REFUND_TRANSFER_RECORDED', AuditSeverity.INFO, actor, `CREDIT_NOTE:${note.id}`, {
            creditNoteNumber: note.creditNoteNumber, transferredOn: isoDay, bankReference: reference,
        });
        return updated;
    });
}

/**
 * INTERNAL ONLY — an issued credit note of `invoiceId`, with what its PDF prints, for the
 * payer's own download. The caller has already proved the payer reads that invoice
 * (invoice-helpers.findHealthInvoice). A draft or cancelled note is not the payer's.
 */
async function findIssuedCreditNoteOfInvoiceForDocument(creditNoteId, invoiceId) {
    const prisma = resolvePrisma();
    if (!prisma || !creditNoteId || !invoiceId) {return null;}
    return prisma.creditNote.findFirst({
        where: {
            id: String(creditNoteId), originalInvoiceId: String(invoiceId),
            isDeleted: false, status: { in: [STATUS.ISSUED, STATUS.POSTED] },
        },
        include: {
            originalInvoice: { select: DOCUMENT_ORIGINAL_INVOICE_SELECT },
        },
    });
}

/** The tax invoice a note refers to (ม.86/10), as the note prints it. */
const NOTED_TAX_INVOICE_SELECT = Object.freeze({
    id: true, invoiceNumber: true, receiptNumber: true, receiptIssuedAt: true,
});

/**
 * What the holder's refund panel reads from its credit-note list: the note, the refund transfer
 * (the day and the bank reference, to find it on a statement) and the tax invoice it refers to.
 * Read as a select, so a column added to CreditNote later stays on the server until someone
 * names it here (security review of 1b554df0c, L2). Gone: the tenancy and soft-delete columns,
 * updatedAt, the staff actor ids and when finance recorded the transfer.
 */
const HOLDER_CREDIT_NOTE_SELECT = Object.freeze({
    id: true, creditNoteNumber: true, originalInvoiceId: true, reason: true, reasonCode: true,
    subtotal: true, vat: true, totalAmount: true, status: true, issuedAt: true, postedAt: true,
    refundTransferredOn: true, refundBankReference: true, createdAt: true,
    originalInvoice: { select: NOTED_TAX_INVOICE_SELECT },
});

async function listCreditNotesForInvoice(originalInvoiceId, { actor, holderScope = null } = {}) {
    const prisma = resolvePrisma();
    if (!prisma) {return [];}
    const role = normalizeRole(actor?.canonicalRole || actor?.role);
    const hasReadRole = Boolean(role && READ_ROLES.has(role));
    if (!hasReadRole) {
        // Owner fallback: a HEALTH applicant may read credit notes for an invoice
        // they OWN (powers the applicant refund-visibility panel). Verify ownership
        // against Invoice.healthId so one applicant can never read another's notes.
        // Post-detokenize (APP_FK_USE_TOKEN): Invoice.healthId stores the
        // keyed-HMAC TOKEN == actor.canonicalId, NOT the plaintext id — the old
        // plaintext-only compare 403'd every real owner (walkthrough 2026-07-10:
        // 2x console 403 on /health/payments). Compare the token first; keep the
        // plaintext term for legacy pre-token rows.
        //
        // R2 Task 12 (spec 2026-09-30 §3.1, operator: co-members see the company's
        // finance documents): a health door passes its holder scope, and the invoice
        // being within it is the ownership answer. A caller with no scope keeps the
        // healthId compare.
        const scoped = Boolean(holderScope) && Array.isArray(holderScope.readIds);
        const invoice = await prisma.invoice.findUnique({
            where: {
                id: String(originalInvoiceId),
                ...require('./holder-access').holderReadWhereIfScoped(holderScope, 'Invoice'),
            },
            select: { healthId: true },
        });
        const ownerKeys = [actor?.canonicalId, actor?.healthId].filter(Boolean);
        const owns = scoped
            ? Boolean(invoice)
            : Boolean(invoice) && ownerKeys.length > 0 && ownerKeys.includes(invoice.healthId);
        if (!owns) {
            throw makeError(
                'FORBIDDEN_ROLE',
                'A finance or admin role (or the invoice owner) is required to read credit notes',
                403,
            );
        }
    }
    if (hasReadRole) { await assertInvoiceInCallerOrg(prisma, originalInvoiceId, actor); }
    // A draft or a cancelled note is not the holder's, as on its PDF door
    // (findIssuedCreditNoteOfInvoiceForDocument); staff readers see every note.
    const holderStatuses = hasReadRole ? {} : { status: { in: [STATUS.ISSUED, STATUS.POSTED] } };
    return prisma.creditNote.findMany({
        where: { originalInvoiceId, isDeleted: false, ...holderStatuses },
        orderBy: { createdAt: 'desc' },
        ...(hasReadRole
            ? { include: { originalInvoice: { select: NOTED_TAX_INVOICE_SELECT } } }
            : { select: HOLDER_CREDIT_NOTE_SELECT }),
    });
}

async function assertInvoiceInCallerOrg(prisma, originalInvoiceId, actor) {
    // Every reader sees notes of its own organization's invoices only (order 17).
    const invoice = await prisma.invoice.findUnique({
        where: { id: String(originalInvoiceId) },
        select: { organizationId: true },
    });
    assertInCallerOrganization(actor, invoice);
}

async function listCreditNotes({ status, from, to, actor } = {}) {
    assertReadAccess(actor);
    const prisma = resolvePrisma();
    if (!prisma) {return [];}
    const where = { isDeleted: false };
    if (status) {where.status = status;}
    // Order 17: every reader reads its own organization's notes; no caller names another.
    Object.assign(where, booksOrganizationWhere(actor));
    if (from || to) {
        where.createdAt = {};
        if (from) {where.createdAt.gte = new Date(from);}
        if (to) {where.createdAt.lt = new Date(to);}
    }
    return prisma.creditNote.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
            originalInvoice: { select: { id: true, invoiceNumber: true } },
        },
    });
}

// ── Journal-entry post (internal) ──────────────────────────────────────────

/**
 * Post the REVERSING journal entry that mirrors the original PLATFORM
 * payment entry. Prefers `journalEntryService.recordCreditNoteEntry(...)`
 * when available; falls back to a structured log marker so the next batch
 * can wire the persistence atomically.
 *
 * The reversing-shape contract (PLATFORM only — STATE invoices are never
 * eligible for CN, enforced upstream in `assertInvoiceEligible`):
 *
 *     Dr. Revenue — Platform Fee   <subtotal>
 *     Dr. Output VAT 7%            <vat>
 *       Cr. Cash / Bank                  <total>
 *
 * @private
 */
async function _postReversingJournalEntry({
    tx, creditNote, originalInvoice, subtotal, vat, total, actor,
}) {
    // Preferred path — the journal-entry-service in batch B20-B (or later)
    // wires `recordCreditNoteEntry`. Call signature mirrors
    // `recordPaymentEntry`: invoiceId, total, components, meta (with `tx`
    // for atomicity).
    if (typeof journalEntryService.recordCreditNoteEntry === 'function') {
        return journalEntryService.recordCreditNoteEntry(
            originalInvoice.id,
            total,
            { subtotal, vat },
            {
                creditNoteId: creditNote.id,
                creditNoteNumber: creditNote.creditNoteNumber,
                invoiceNumber: originalInvoice.invoiceNumber,
                serviceType: originalInvoice.serviceType,
                organizationId: creditNote.organizationId,
                createdBy: actor?.id || 'SYSTEM',
                tx,
            },
        );
    }

    // Fallback — the journal-entry-service has not yet been extended with
    // recordCreditNoteEntry. We log a structured marker so the next batch
    // can back-fill the GL entry, and we DO NOT throw — the document
    // state machine should continue to advance.
    //
    // TODO(B20-B journal owner): add `recordCreditNoteEntry({ invoiceId,
    //   total, components, meta })` to services/journal-entry-service.js
    //   that posts the REVERSING entry below. Shape:
    //     Dr Revenue — Platform Fee (4110-001)   <subtotal>
    //     Dr Output VAT 7%          (2131-001)   <vat>
    //       Cr Cash / Bank          (1110-001)         <total>
    //   metadata.kind = 'CREDIT_NOTE_REVERSAL'; reference = creditNoteNumber.
    logger.warn(
        '[credit-note][journal-fallback] recordCreditNoteEntry not yet '
        + `wired in journal-entry-service — manual GL reconciliation required `
        + `for ${creditNote.creditNoteNumber}. `
        + `Reversing entry: Dr Revenue ${subtotal} / Dr VAT ${vat} / `
        + `Cr Cash ${total} against invoice ${originalInvoice.invoiceNumber}.`,
        {
            creditNoteId: creditNote.id,
            creditNoteNumber: creditNote.creditNoteNumber,
            originalInvoiceId: originalInvoice.id,
            originalInvoiceNumber: originalInvoice.invoiceNumber,
            kind: 'CREDIT_NOTE_REVERSAL',
            lines: [
                { accountCode: '4110-001', accountName: 'รายได้ค่าบริการแพลตฟอร์ม', debit: subtotal, credit: 0 },
                { accountCode: '2131-001', accountName: 'ภาษีขายตั้งพัก (Output VAT 7%)', debit: vat, credit: 0 },
                { accountCode: '1110-001', accountName: 'เงินสด/เงินฝากธนาคาร · บัญชีหลัก', debit: 0, credit: total },
            ],
        },
    );
    return { persisted: false, fallback: true, fallbackReason: 'RECORD_CREDIT_NOTE_ENTRY_NOT_WIRED' };
}

module.exports = {
    STATUS,
    VALID_REASON_CODES,
    ALLOWED_TRANSITIONS,
    WRITE_ROLES,
    READ_ROLES,
    createCreditNote,
    issueCreditNote,
    recordRefundCreditNote,
    postCreditNote,
    creditableRemainder,
    cancelCreditNote,
    findCreditNoteById,
    findCreditNoteForDocument,
    findIssuedCreditNoteOfInvoiceForDocument,
    recordRefundTransfer,
    listCreditNotesForInvoice,
    listCreditNotes,
    // Exposed for tests
    _internals: {
        round2,
        assertInvoiceEligible,
        assertWithinInvoiceCap,
        assertReason,
        _postReversingJournalEntry,
    },
};

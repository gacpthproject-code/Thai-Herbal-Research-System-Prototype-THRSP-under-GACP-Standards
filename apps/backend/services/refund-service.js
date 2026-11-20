/**
 * Refund recording (order 22, operator 2026-10-06; payment terms v1.3 §7).
 *
 * The platform never moves refund money. The company refunds outside the
 * system; finance records that refund here, which issues and posts the credit
 * note (ป.รัษฎากร ม.86/10, numbered under ม.86/4) and writes its reversing
 * journal entry. Two kinds exist (shared/refund-kinds.js):
 *
 *   DUPLICATE           the gateway settled a second payment for a milestone
 *                       already paid. That payment issued its own tax invoice
 *                       (its order's invoice, retired when the order lapsed, and
 *                       the PLATFORM_TAX_INVOICE document of its settlement), so
 *                       its refund is credited against THAT invoice and never
 *                       touches what is creditable on the milestone's invoice.
 *                       Recorded in the milestone invoice's
 *                       metadata.duplicateChargeRefunds; the milestone stays paid
 *                       and the application does not move.
 *   PROVIDER_CANCELLED  the company or the state cancelled the service before the
 *                       paid milestone's service started. Everything still
 *                       creditable on the invoice is credited, the record goes to
 *                       Invoice.metadata.refund (which isInvoicePaid reads, so the
 *                       milestone counts as unpaid), and the application closes as
 *                       CANCELLED through the status writer.
 *
 * Each record is one transaction that locks the invoice row, then the
 * application row: the credit note, the invoice metadata and the status write
 * commit together or not at all, refunds against one application run one after
 * the other, and the "service not started" check reads the application as it
 * is under the lock. Every credit note stays within the credit-note rule (the
 * invoice amounts less every issued or posted note, subtotal and VAT each). So
 * a milestone paid twice can return both payments: the cancellation credits the
 * milestone invoice and the duplicate refund credits the extra payment's own
 * invoice, in either order.
 *
 * @module services/refund-service
 */

'use strict';

const logger = require('../shared/logger');
const { normalizeRole, CANONICAL_ROLES } = require('../shared/canonical-rbac');
const { MILESTONES, checkoutInvoiceServiceType } = require('../shared/checkout-status');
const { settledPaymentMode } = require('../shared/payment-mode');
const {
    REFUND_KINDS,
    PROVIDER_CANCELLATION_REASONS,
    PROVIDER_CANCELLATION_REASON_MILESTONES,
    companyInspectionDeadline,
    providerCancellationReasonText,
} = require('../shared/refund-kinds');
const creditNoteService = require('./credit-note-service');
const { fanoutToApplicationParties } = require('./notification/application-parties');
const { auditLogger, AuditCategory, AuditSeverity, ResourceType } = require('../middleware/audit-logger');
const { BOOKS_WRITE_ROLES, booksOrganizationWhere, rowInCallerOrganization } = require('./finance/company-books-access');
const { dbDateIsoDay } = require('../utils/working-days');

let prismaModule;
try {
    prismaModule = require('./prisma-database');
} catch (_e) {
    prismaModule = { prisma: null };
}

const REFUND_STATUS = Object.freeze({
    NONE: 'NONE',
    INITIATED: 'INITIATED',
    BANK_TRANSFER_PENDING: 'BANK_TRANSFER_PENDING',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
});

const ACTIVE_CANCELLATION_STATUSES = new Set([
    REFUND_STATUS.INITIATED,
    REFUND_STATUS.BANK_TRANSFER_PENDING,
    REFUND_STATUS.COMPLETED,
]);

// Refunds are company money (orders 13, 14, 17, 29): only the company's finance
// officer records one. No DTAM role writes here.
const WRITE_ROLES = BOOKS_WRITE_ROLES;

// ด่านอ่าน (สถานะการคืนเงิน) — การเงินสองบทบาทเห็นชุดเดียวกัน (operator 2026-09-11)
// แต่ละบทบาทอ่านได้เฉพาะองค์กรตัวเอง (คำสั่ง 17, organizationScope)
const READ_ROLES = new Set([
    CANONICAL_ROLES.FINANCE_OFFICER_DTAM,
    CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM,
    CANONICAL_ROLES.SYSTEM_ADMIN_DTAM,
]);
// ผู้ตรวจประเมินไม่อยู่ในชุดอ่านเรื่องเงิน (operator 2026-09-27)

/**
 * Terms v1.3 §7.2.3: a milestone whose service has started is not refunded.
 * M1's service starts when the documents enter review (anything past
 * DOC_FEE_PAID); M2's at the first on-site work (past AUDIT_CONFIRMED, or any
 * on-site record while the status still reads AUDIT_CONFIRMED, see m2ServiceStarted).
 */
const NOT_STARTED_STATES = Object.freeze({
    M1: Object.freeze(['DOC_FEE_PAID']),
    M2: Object.freeze(['AUDIT_FEE_PAID', 'AUDIT_CONFIRMED']),
});

/**
 * Whether anything was ever recorded on site for this application. The status alone cannot say:
 * a booked second visit brings an inspected application back to AUDIT_CONFIRMED
 * (CAR_REVIEWING -> AUDIT_CONFIRMED, order 27), and an inspector can record a decision or answer
 * the checklist without pressing "start" (security review 2026-10-09 F2). So any session record,
 * any on-site decision, any request for a second visit, a result from the audit-result door
 * (formData.auditResult / auditedAt), the onsite door's result column, a checklist that was decided,
 * answered or photographed, or the field app's GPS check-in on an inspection (N1) counts, whatever
 * the status reads now. Only keys the applicant cannot write count (shared/form-data-ownership.js):
 * formData.auditChecklist is the applicant's to write, so it proves nothing.
 */
async function m2ServiceStarted(tx, application) {
    const formData = application.formData && typeof application.formData === 'object' ? application.formData : {};
    const session = formData.auditExecution && typeof formData.auditExecution === 'object' ? formData.auditExecution : {};
    if (Object.keys(session).length > 0
        || (Array.isArray(formData.auditDecisions) && formData.auditDecisions.length > 0)
        || formData.reinspection
        || formData.auditResult
        || formData.auditedAt
        || application.auditResult) {
        return true;
    }
    const onsiteRecords = await tx.auditChecklist.count({
        where: {
            applicationId: application.id,
            OR: [
                { status: { in: ['COMPLETED', 'SUBMITTED'] } },
                { submittedAt: { not: null } },
                { checklistItems: { some: {} } },
                { photos: { some: {} } },
            ],
        },
    });
    if (onsiteRecords > 0) {
        return true;
    }
    const inspections = await tx.auditChecklist.findMany({ where: { applicationId: application.id }, select: { id: true } });
    if (inspections.length === 0) {
        return false;
    }
    const checkIns = await tx.gpsVerificationLog.count({
        where: { entityType: 'AUDIT_INSPECTION_START', entityId: { in: inspections.map((row) => row.id) } },
    });
    return checkIns > 0;
}

const DUPLICATE_REASON_TH = 'คืนเงินส่วนที่เรียกเก็บซ้ำหรือเกิน';
const NOTE_MIN_LENGTH = 10;

function makeError(code, message, status = 400) {
    const e = new Error(message);
    e.code = code;
    e.statusCode = status;
    return e;
}

function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
}

function resolvePrisma() {
    return prismaModule && prismaModule.prisma ? prismaModule.prisma : null;
}

function actorRole(actor) {
    return normalizeRole(actor?.canonicalRole || actor?.role);
}

/**
 * Finance records refunds for its own organization only, and an actor with no
 * organization is refused (order 17: unknown organization = deny).
 */
function assertWriteRole(actor) {
    const role = actorRole(actor);
    if (!role || !WRITE_ROLES.has(role)) {
        throw makeError('FORBIDDEN_ROLE', 'A platform finance role is required to record a refund', 403);
    }
    return role;
}

function assertReadAccess(actor) {
    const role = actorRole(actor);
    if (!role || !READ_ROLES.has(role)) {
        throw makeError('FORBIDDEN_ROLE', 'A finance or admin role is required to view refund status', 403);
    }
}

async function safeAudit(action, actor, resourceId, metadata) {
    try {
        await auditLogger.log({
            category: AuditCategory.PAYMENT,
            action,
            severity: AuditSeverity.WARNING,
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
        logger.warn(`[refund] audit log failed (non-fatal): ${err?.message}`);
    }
}

/**
 * Rows written by the retired holdInvoice hold metadata as a JSON string. Parse
 * it so the guards below still see their refund records (Bug 2.2).
 */
function _readMetadata(invoice) {
    let meta = invoice?.metadata || {};
    if (typeof meta === 'string') {
        try {
            meta = JSON.parse(meta || '{}');
        } catch (_e) {
            return null;
        }
    }
    return meta && typeof meta === 'object' ? meta : {};
}

function _readRefundBlock(invoice) {
    const meta = _readMetadata(invoice);
    return meta ? (meta.refund || null) : null;
}

function _readDuplicateRefunds(invoice) {
    const meta = _readMetadata(invoice);
    return Array.isArray(meta?.duplicateChargeRefunds) ? meta.duplicateChargeRefunds : [];
}

function milestoneOf(serviceType) {
    return MILESTONES.find((m) => checkoutInvoiceServiceType(m) === serviceType) || null;
}

/** A positive baht amount with at most two decimals, as a JSON number. */
function parseAmount(amount) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        return null;
    }
    const satang = Math.round(amount * 100);
    if (Math.abs(amount * 100 - satang) > 1e-6) {
        return null;
    }
    return satang / 100;
}

/**
 * Split a gross amount into subtotal and VAT in the invoice's own proportion,
 * inside what is still creditable. Crediting everything that is left takes the
 * remaining figures as they are, so no cent drifts between the notes.
 */
function splitWithinRemainder(amount, invoice, remainder) {
    if (round2(amount) === remainder.total) {
        return { subtotal: remainder.subtotal, vat: remainder.vat };
    }
    const invoiceTotal = Number(invoice.totalAmount) || 0;
    let vat = invoiceTotal > 0 ? round2((amount * Number(invoice.vat)) / invoiceTotal) : 0;
    vat = Math.min(vat, remainder.vat);
    let subtotal = round2(amount - vat);
    if (subtotal > remainder.subtotal) {
        subtotal = remainder.subtotal;
        vat = round2(amount - subtotal);
    }
    return { subtotal, vat };
}

const INVOICE_SELECT = Object.freeze({
    id: true,
    invoiceNumber: true,
    organizationId: true,
    serviceType: true,
    subtotal: true,
    vat: true,
    totalAmount: true,
    status: true,
    isDeleted: true,
    // paidAt and metadata decide the mode the refunded money was collected in (settledPaymentMode).
    paidAt: true,
    metadata: true,
    application: { select: { id: true, applicationNumber: true } },
    applicant: { select: { id: true } },
});

async function _lockInvoice(tx, invoiceId, actor) {
    // Another organization's invoice answers exactly as a missing one, before anything about it is
    // told and before any lock is taken (R2-L2): a 403 for a real id confirmed that it exists, and
    // waiting on that organization's row lock would confirm it too. It is asked again under the lock,
    // because the invoice can move while this request waits (check of f45c9a987, Low-1).
    const owned = rowInCallerOrganization(actor, await tx.invoice.findUnique({
        where: { id: invoiceId }, select: { organizationId: true },
    }));
    if (owned) {
        await tx.$queryRaw`SELECT id FROM "invoices" WHERE id = ${invoiceId} FOR UPDATE`;
    }
    const invoice = owned && rowInCallerOrganization(actor, await tx.invoice.findUnique({
        where: { id: invoiceId }, select: INVOICE_SELECT,
    }));
    if (!invoice) {
        throw makeError('INVOICE_NOT_FOUND', 'Invoice not found', 404);
    }
    if (invoice.isDeleted) {
        throw makeError('INVOICE_DELETED', 'Invoice is soft-deleted', 410);
    }
    if (String(invoice.status || '').toLowerCase() !== 'paid') {
        throw makeError('INVOICE_NOT_PAID', `Refund requires a PAID invoice (current: ${invoice.status})`, 409);
    }
    if (!invoice.application) {
        return invoice;
    }
    // Same order as settlement (invoice, then application), so the two never deadlock.
    await tx.$queryRaw`SELECT id FROM "applications" WHERE id = ${invoice.application.id} FOR UPDATE`;
    const application = await tx.application.findUnique({
        where: { id: invoice.application.id },
        select: { id: true, applicationNumber: true, status: true, formData: true, auditResult: true },
    });
    return { ...invoice, application };
}

/**
 * The extra payments of this invoice's milestone: every order the gateway settled
 * for it other than the one this invoice belongs to, each with its own invoice
 * (locked, oldest payment first) and what is still creditable on it. A milestone
 * paid once has none.
 */
async function extraCharges(tx, invoice) {
    const milestone = milestoneOf(invoice.serviceType);
    if (!milestone || !invoice.application) {
        return [];
    }
    const orders = await tx.checkoutOrder.findMany({
        where: {
            applicationId: invoice.application.id, milestone, status: 'SETTLED',
            invoiceId: { not: null }, NOT: { invoiceId: invoice.id },
        },
        select: { id: true, invoiceId: true },
        orderBy: { settledAt: 'asc' },
    });
    const charges = [];
    for (const order of orders) {
        await tx.$queryRaw`SELECT id FROM "invoices" WHERE id = ${order.invoiceId} FOR UPDATE`;
        const chargeInvoice = await tx.invoice.findUnique({
            where: { id: order.invoiceId },
            select: { id: true, subtotal: true, vat: true, totalAmount: true },
        });
        const remainder = await creditNoteService.creditableRemainder({ prisma: tx, originalInvoice: chargeInvoice });
        charges.push({ orderId: order.id, invoice: chargeInvoice, remainder });
    }
    return charges;
}

/** Errors the caller can act on pass through; anything else is a 500. */
async function _runRecord(label, invoiceId, work) {
    const prisma = resolvePrisma();
    if (!prisma) {
        throw makeError('DB_UNAVAILABLE', 'Prisma client unavailable for refund', 503);
    }
    try {
        return await prisma.$transaction(work, { timeout: 20000 });
    } catch (err) {
        if (err?.code === 'EXCEEDS_INVOICE_SUBTOTAL' || err?.code === 'EXCEEDS_INVOICE_VAT') {
            throw makeError('REFUND_EXCEEDS_REMAINING', err.message, 409);
        }
        if (err?.statusCode && err.statusCode < 500) {throw err;}
        logger.error(`[refund] ${label} failed for invoice ${invoiceId}: ${err?.message}`, err);
        throw makeError('REFUND_FAILED', `Refund transaction failed: ${err?.message}`, 500);
    }
}

/** The applicant's notice for each refund kind (notification-fanout-service TEMPLATES). */
const NOTICE_TYPE_BY_KIND = Object.freeze({
    [REFUND_KINDS.DUPLICATE]: 'REFUND_DUPLICATE_CHARGE',
    [REFUND_KINDS.PROVIDER_CANCELLED]: 'REFUND_PROVIDER_CANCELLED',
});

async function _notifyApplicant(invoice, record) {
    const applicationId = invoice.application?.id || null;
    if (!applicationId) {
        logger.warn(`[refund] invoice ${invoice.invoiceNumber} has no application; skipping notification`);
        return null;
    }
    try {
        // The applicant and the holder (order 32).
        return await fanoutToApplicationParties(applicationId, {
            type: NOTICE_TYPE_BY_KIND[record.kind],
            payload: {
                applicationNumber: invoice.application?.applicationNumber || null,
                invoiceId: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                creditNoteNumber: record.creditNoteNumber,
                amount: record.amount,
                reasonCode: record.reasonCode || null,
                reasonText: record.reasonText || null,
                paymentMode: settledPaymentMode(invoice),
                priority: 'HIGH',
            },
        });
    } catch (err) {
        logger.warn(`[refund] notification dispatch failed (non-fatal): ${err?.message}`);
        return null;
    }
}

function _replay(record, invoiceId) {
    return {
        kind: record.kind || REFUND_KINDS.PROVIDER_CANCELLED,
        creditNoteId: record.creditNoteId || null,
        creditNoteNumber: record.creditNoteNumber || null,
        amount: record.amount,
        invoiceId,
        notification: null,
        idempotent: true,
    };
}

/**
 * Record the refund of a duplicate or over-charge.
 *
 * @param {object} args
 * @param {string} args.invoiceId
 * @param {number} args.amount          gross baht, > 0, at most two decimals, and no
 *                                      more than what is still creditable
 * @param {string} args.idempotencyKey  one per refund the officer means to record;
 *                                      the same key again returns the first record
 * @param {object} args.actor
 */
async function recordDuplicateChargeRefund({ invoiceId, amount, idempotencyKey, actor } = {}) {
    if (!invoiceId) {
        throw makeError('VALIDATION_ERROR', 'invoiceId is required');
    }
    assertWriteRole(actor);
    booksOrganizationWhere(actor);
    const key = typeof idempotencyKey === 'string' ? idempotencyKey.trim() : '';
    if (!key || key.length > 100) {
        throw makeError('REFUND_IDEMPOTENCY_KEY_REQUIRED', 'idempotencyKey is required (one per refund, at most 100 characters)');
    }
    const value = parseAmount(amount);
    if (value === null) {
        throw makeError('REFUND_AMOUNT_INVALID', 'amount must be a number of baht greater than 0 with at most two decimals');
    }

    const result = await _runRecord('duplicate-charge refund', invoiceId, async (tx) => {
        const invoice = await _lockInvoice(tx, invoiceId, actor);
        const prior = _readDuplicateRefunds(invoice).find((r) => r.idempotencyKey === key);
        if (prior) {
            return { replay: _replay(prior, invoice.id) };
        }

        // One refund returns (part of) one extra payment, credited on that payment's invoice.
        const charges = await extraCharges(tx, invoice);
        const charge = charges.find((c) => value <= c.remainder.total);
        if (!charge) {
            const largest = Math.max(0, ...charges.map((c) => c.remainder.total));
            throw makeError(
                'REFUND_EXCEEDS_REMAINING',
                `Refund ${value} exceeds what is still unrefunded of any one extra payment on this milestone (${largest})`,
                409,
            );
        }
        const { subtotal, vat } = splitWithinRemainder(value, charge.invoice, charge.remainder);
        const creditNote = await creditNoteService.recordRefundCreditNote({
            tx, originalInvoiceId: charge.invoice.id, reasonCode: 'CORRECTION', reason: DUPLICATE_REASON_TH, subtotal, vat, actor,
        });
        const record = {
            kind: REFUND_KINDS.DUPLICATE,
            idempotencyKey: key,
            amount: value,
            subtotal,
            vat,
            chargeInvoiceId: charge.invoice.id,
            checkoutOrderId: charge.orderId,
            creditNoteId: creditNote.id,
            creditNoteNumber: creditNote.creditNoteNumber,
            recordedAt: new Date().toISOString(),
            recordedBy: actor?.id || null,
        };
        const meta = _readMetadata(invoice) || {};
        await tx.invoice.update({
            where: { id: invoice.id },
            data: { metadata: { ...meta, duplicateChargeRefunds: [..._readDuplicateRefunds(invoice), record] } },
        });
        return { invoice, creditNote, record };
    });

    if (result.replay) {return result.replay;}
    const { invoice, creditNote, record } = result;
    await safeAudit('REFUND_DUPLICATE_CHARGE_RECORDED', actor, `INVOICE:${invoice.id}`, {
        invoiceNumber: invoice.invoiceNumber,
        creditNoteNumber: creditNote.creditNoteNumber,
        amount: record.amount,
    });
    const notification = await _notifyApplicant(invoice, record);
    return {
        kind: record.kind,
        creditNoteId: creditNote.id,
        creditNoteNumber: creditNote.creditNoteNumber,
        amount: record.amount,
        invoiceId: invoice.id,
        notification,
        idempotent: false,
    };
}

/**
 * Record the full refund of a milestone whose service the company or the state
 * cancelled before it started, and close the application as CANCELLED.
 *
 * @param {object} args
 * @param {string} args.invoiceId
 * @param {string} args.reasonCode  a key of PROVIDER_CANCELLATION_REASONS
 * @param {string} args.note        what happened, in the officer's words
 * @param {object} args.actor
 */
async function recordProviderCancellationRefund({ invoiceId, reasonCode, note, actor } = {}) {
    if (!invoiceId) {
        throw makeError('VALIDATION_ERROR', 'invoiceId is required');
    }
    assertWriteRole(actor);
    booksOrganizationWhere(actor);
    if (!Object.prototype.hasOwnProperty.call(PROVIDER_CANCELLATION_REASONS, reasonCode)) {
        throw makeError(
            'REFUND_CANCELLATION_REASON_INVALID',
            `reasonCode must be one of: ${Object.keys(PROVIDER_CANCELLATION_REASONS).join(', ')}`,
        );
    }
    const noteText = typeof note === 'string' ? note.trim() : '';
    if (noteText.length < NOTE_MIN_LENGTH || noteText.length > 1000) {
        throw makeError('REFUND_CANCELLATION_NOTE_REQUIRED', `note is required (${NOTE_MIN_LENGTH} to 1000 characters)`);
    }

    const result = await _runRecord('provider-cancellation refund', invoiceId, async (tx) => {
        const invoice = await _lockInvoice(tx, invoiceId, actor);
        const existing = _readRefundBlock(invoice);
        if (existing && ACTIVE_CANCELLATION_STATUSES.has(existing.status)) {
            return { replay: _replay(existing, invoice.id) };
        }

        const milestone = milestoneOf(invoice.serviceType);
        const application = invoice.application;
        if (!milestone || !application
            || !NOT_STARTED_STATES[milestone].includes(application.status)
            || (milestone === 'M2' && await m2ServiceStarted(tx, application))) {
            throw makeError(
                'REFUND_SERVICE_ALREADY_STARTED',
                'This milestone\'s service has started (or the invoice is not a certification milestone); '
                + 'payment terms v1.3 §7.2.3 allow no refund',
                409,
            );
        }

        if (!PROVIDER_CANCELLATION_REASON_MILESTONES[reasonCode].includes(milestone)) {
            throw makeError(
                'REFUND_CANCELLATION_REASON_NOT_APPLICABLE',
                `${reasonCode} does not cancel the ${milestone} payment`,
                409,
            );
        }
        let inspectionDeadline = null;
        let reasonTH = PROVIDER_CANCELLATION_REASONS[reasonCode];
        if (reasonCode === 'COMPANY_CANNOT_INSPECT') {
            const paid = await tx.checkoutOrder.findFirst({
                where: { invoiceId: invoice.id, status: 'SETTLED' },
                select: { settledAt: true, paymentTermsVersion: true },
            });
            const deadline = companyInspectionDeadline(paid?.settledAt, paid?.paymentTermsVersion);
            inspectionDeadline = deadline ? deadline.toISOString() : null;
            reasonTH = providerCancellationReasonText(reasonCode, paid?.paymentTermsVersion);
        }

        const remainder = await creditNoteService.creditableRemainder({ prisma: tx, originalInvoice: invoice });
        if (remainder.total <= 0) {
            throw makeError('REFUND_EXCEEDS_REMAINING', 'Nothing is left to refund on this invoice', 409);
        }
        const creditNote = await creditNoteService.recordRefundCreditNote({
            tx,
            originalInvoiceId: invoice.id,
            reasonCode: 'CANCELLATION',
            reason: `ยกเลิกการให้บริการ: ${reasonTH}`,
            subtotal: remainder.subtotal,
            vat: remainder.vat,
            actor,
        });
        const record = {
            kind: REFUND_KINDS.PROVIDER_CANCELLED,
            status: REFUND_STATUS.INITIATED,
            reasonCode,
            reasonText: reasonTH,
            note: noteText,
            amount: remainder.total,
            subtotal: remainder.subtotal,
            vat: remainder.vat,
            milestone,
            ...(inspectionDeadline ? { inspectionDeadline } : {}),
            creditNoteId: creditNote.id,
            creditNoteNumber: creditNote.creditNoteNumber,
            initiatedAt: new Date().toISOString(),
            initiatedBy: actor?.id || null,
            legalBasis: 'ม.86/10 + ม.86/4 ป.รัษฎากร · เงื่อนไขการชำระค่าบริการ ฉบับที่ 1.3 ข้อ 7.2 (ฉบับที่ 1.2 ข้อ 7.2 (ค))',
        };
        const meta = _readMetadata(invoice) || {};
        await tx.invoice.update({
            where: { id: invoice.id },
            data: { metadata: { ...meta, refund: record } },
        });

        const { writeApplicationStatus } = require('./application-status-writer');
        await writeApplicationStatus({
            prisma: tx,
            applicationId: application.id,
            fromStatus: application.status,
            toStatus: 'CANCELLED',
            actorId: actor?.id || 'SYSTEM',
            actorRole: CANONICAL_ROLES.SYSTEM,
            reason: `REFUND_PROVIDER_CANCELLED:${reasonCode}`,
            assertTransition: true,
        });
        return { invoice, creditNote, record };
    });

    if (result.replay) {return result.replay;}
    const { invoice, creditNote, record } = result;
    await safeAudit('REFUND_PROVIDER_CANCELLATION_RECORDED', actor, `INVOICE:${invoice.id}`, {
        invoiceNumber: invoice.invoiceNumber,
        applicationId: invoice.application?.id || null,
        creditNoteNumber: creditNote.creditNoteNumber,
        reasonCode,
        amount: record.amount,
    });
    const notification = await _notifyApplicant(invoice, record);
    return {
        kind: record.kind,
        creditNoteId: creditNote.id,
        creditNoteNumber: creditNote.creditNoteNumber,
        amount: record.amount,
        invoiceId: invoice.id,
        notification,
        idempotent: false,
    };
}

/**
 * Every refund recorded on an invoice: the provider cancellation (if any) and
 * the duplicate-charge refunds, with the linked credit note of the cancellation.
 */
async function getRefundStatus(invoiceId, { actor } = {}) {
    assertReadAccess(actor);
    booksOrganizationWhere(actor);
    const prisma = resolvePrisma();
    if (!prisma) {return null;}

    const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        select: {
            id: true, invoiceNumber: true, organizationId: true,
            metadata: true, totalAmount: true, status: true,
        },
    });
    if (!rowInCallerOrganization(actor, invoice)) {return null;}

    const cancellation = _readRefundBlock(invoice);
    // Each refund shows whether the company's bank has paid it (recorded on its credit note).
    const duplicates = _readDuplicateRefunds(invoice);
    const notes = duplicates.length ? await prisma.creditNote.findMany({
        where: { id: { in: duplicates.map((r) => r.creditNoteId).filter(Boolean) } },
        select: { id: true, refundTransferredOn: true, refundBankReference: true },
    }) : [];
    const transferOf = new Map(notes.map((n) => [n.id, {
        refundTransferredOn: n.refundTransferredOn ? dbDateIsoDay(n.refundTransferredOn) : null,
        refundBankReference: n.refundBankReference || null,
    }]));
    const duplicateChargeRefunds = duplicates.map(({ idempotencyKey: _key, ...rest }) => ({
        ...rest, ...(transferOf.get(rest.creditNoteId) || { refundTransferredOn: null, refundBankReference: null }),
    }));
    let creditNote = null;
    if (cancellation?.creditNoteId) {
        creditNote = await creditNoteService.findCreditNoteById(cancellation.creditNoteId, { actor }).catch(() => null);
    }
    return {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        refundStatus: cancellation ? cancellation.status : REFUND_STATUS.NONE,
        cancellation: cancellation ? { ...cancellation, creditNote } : null,
        duplicateChargeRefunds,
    };
}

module.exports = {
    REFUND_STATUS,
    WRITE_ROLES,
    READ_ROLES,
    recordDuplicateChargeRefund,
    recordProviderCancellationRefund,
    getRefundStatus,
    _internals: {
        _readRefundBlock,
        _readDuplicateRefunds,
        parseAmount,
        splitWithinRemainder,
    },
};

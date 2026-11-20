const { prisma } = require('./prisma-database');
const invoiceTemplateService = require('./pdf/invoice-template-service');
const {
    normalizeInvoiceServiceType,
} = require('./phase-billing-service');
// R5-B / X4-FIX-A RC-2: receipt numbers MUST be allocated through the
// canonical per-issuer counter (ReceiptSequence). Using a shared
// `tx.invoice.count` counter let DTAM (government-revenue receipts) and
// PLATFORM (tax-invoice receipts) share one monotonic sequence — a
// silent contract drift from B16-D + R5-B. The fix is to call
// `receipt-numbering-service.allocateReceiptNumber({issuer})` inside the
// same serializable transaction so the per-issuer ReceiptSequence row
// gets the row-exclusive lock instead of a stale aggregate count.
const { BILLING_APPLICATION_SELECT, BILLING_WITH_PAYER_SELECT, toBillingWithPayer } = require('./finance/billing-select');
const { organizationScope, DENY_ALL } = require('../shared/application-visibility');
const { settledPaymentMode } = require('../shared/payment-mode');
const { getZonedParts, startOfLocalCalendarDay } = require('../utils/working-days');
const { RETIRED_BY } = require('./checkout/retire-checkout-order');
const { PAYER_ENTITY_SELECT } = require('../utils/applicant-resolver');
const { classifyIssuerSide } = require('./finance/invoice-side');

const INVOICE_STATUS = Object.freeze({
    PENDING: 'PENDING',
    PAID: 'PAID',
    PAID_PENDING_RECEIPT: 'PAID_PENDING_RECEIPT',
    RECEIPT_ISSUED: 'RECEIPT_ISSUED',
    OVERDUE: 'OVERDUE',
    CANCELLED: 'CANCELLED',
});

const RAW_STATUS_ALIAS = Object.freeze({
    pending: INVOICE_STATUS.PENDING,
    paid: INVOICE_STATUS.PAID,
    paid_pending_receipt: INVOICE_STATUS.PAID_PENDING_RECEIPT,
    receipt_issued: INVOICE_STATUS.RECEIPT_ISSUED,
    overdue: INVOICE_STATUS.OVERDUE,
    cancelled: INVOICE_STATUS.CANCELLED,
});

function normalizeStatus(value) {
    const key = String(value || '').trim().toLowerCase();
    if (!key) {
        return null;
    }
    return RAW_STATUS_ALIAS[key] || String(value || '').trim().toUpperCase();
}

function canonicalPaidStatuses() {
    return ['paid', 'PAID', INVOICE_STATUS.PAID_PENDING_RECEIPT, INVOICE_STATUS.RECEIPT_ISSUED];
}

function statusFilterForQuery(status) {
    const normalized = normalizeStatus(status);
    if (!normalized) {
        return null;
    }

    if (normalized === INVOICE_STATUS.PENDING) {
        return { in: ['pending', 'PENDING'] };
    }
    if (normalized === INVOICE_STATUS.PAID) {
        return { in: canonicalPaidStatuses() };
    }
    if (normalized === INVOICE_STATUS.PAID_PENDING_RECEIPT) {
        return { in: [INVOICE_STATUS.PAID_PENDING_RECEIPT, 'paid', 'PAID'] };
    }
    if (normalized === INVOICE_STATUS.RECEIPT_ISSUED) {
        return { in: [INVOICE_STATUS.RECEIPT_ISSUED] };
    }
    if (normalized === INVOICE_STATUS.OVERDUE) {
        return { in: ['overdue', 'OVERDUE'] };
    }
    if (normalized === INVOICE_STATUS.CANCELLED) {
        return { in: ['cancelled', 'CANCELLED'] };
    }
    return status;
}

function toErpStatus(rawStatus, hasReceipt) {
    const normalized = normalizeStatus(rawStatus);
    if (hasReceipt) {
        return INVOICE_STATUS.RECEIPT_ISSUED;
    }
    if (normalized === INVOICE_STATUS.PAID) {
        return INVOICE_STATUS.PAID_PENDING_RECEIPT;
    }
    if (normalized === INVOICE_STATUS.PENDING) {
        return INVOICE_STATUS.PENDING;
    }
    return normalized || INVOICE_STATUS.PENDING;
}

function parseAuditMetadata(metadata) {
    if (!metadata) {
        return {};
    }
    if (typeof metadata === 'string') {
        try {
            return JSON.parse(metadata);
        } catch (_error) {
            return {};
        }
    }
    if (typeof metadata === 'object') {
        return metadata;
    }
    return {};
}

function withDerivedStatus(invoice) {
    return {
        ...invoice,
        erpStatus: toErpStatus(invoice.status, !!invoice.receiptNumber || !!invoice.receiptIssuedAt),
        canonicalServiceType: normalizeInvoiceServiceType(invoice.serviceType),
        // DTAM (legacy state fee) | PLATFORM — the same value for every viewer.
        // The web uses it to hide a hold/release button the backend's side
        // guard (invoice-helpers.assertInvoiceSideWritable) would refuse.
        issuerSide: classifyIssuerSide(invoice.serviceType),
    };
}

/**
 * The service a row bills, from the one catalogue (shared/instalment-service-names.js):
 * checkout M1 = งวดที่ 1, M2 = งวดที่ 2, and a renewal's M2 = the renewal service. null for
 * any other serviceType (subscription, retired split rows). The application's formData,
 * read only to answer this, is dropped from the row (it carries personal fields).
 */
function withServiceLine(invoice) {
    const { serviceForServiceType, isRenewalFiling } = require('../shared/instalment-service-names');
    const entry = serviceForServiceType(invoice.serviceType, { isRenewal: isRenewalFiling(invoice.application) });
    const { application, ...rest } = invoice;
    return {
        ...rest,
        ...(application ? { application: { applicationNumber: application.applicationNumber ?? null } } : {}),
        service: entry ? { key: entry.key, name: entry.name, coverage: entry.coverage } : null,
    };
}

// ── Health reads by holder (spec 2026-09-30-remove-workspace-mode §3.1, Task 5) ──
// holder-access loads farm-access and the permission engine, so it is required
// lazily (the same reason as certificate-service).
function holderAccess() {
    return require('./holder-access');
}

const isHolderScope = (scope) => Boolean(scope) && Array.isArray(scope.readIds);

/**
 * The where of a health by-id Invoice read (the owner PDF doors): the holder
 * fragment alone, no filer pin (spec 2026-09-30-remove-workspace-mode §3.1).
 * @param {{ readIds: string[] }} scope
 */
/**
 * What a holder reads: live invoices, and an invoice retired with its checkout order that
 * the gateway settled anyway (a second payment of one milestone). That one carries a tax
 * invoice issued for money the payer really paid, and a refund's credit note refers to it,
 * so the payer keeps it. Any other deleted invoice stays out.
 */
const HOLDER_VISIBLE_INVOICE = Object.freeze([
    Object.freeze({ isDeleted: false }),
    Object.freeze({ deletedBy: RETIRED_BY, receiptNumber: { not: null } }),
]);

function holderOwnedInvoiceWhere(scope) {
    return {
        // The holder fragment stays at the top level, so its marker vouches for the where.
        ...holderAccess().holderReadWhere(scope, 'Invoice'),
        // Named (as undefined: no filter of its own) so the soft-delete extension, which
        // injects isDeleted:false only when the key is absent, leaves the choice to the OR.
        isDeleted: undefined,
        OR: HOLDER_VISIBLE_INVOICE,
    };
}


/**
 * What a payer's own invoice list carries (GET /api/invoices/my): the bill, never a staff or
 * system field. Read as a select, so a column added to Invoice later stays on the server until
 * someone names it here. Gone on purpose: healthId (the filer's national ID while
 * APP_FK_USE_TOKEN is off, order 10), metadata (staff refund notes, the WHT payer's tax id),
 * notes, signature and receipt-retry internals, and the audit and tenancy columns.
 */
const APPLICANT_INVOICE_SELECT = Object.freeze({
    id: true,
    invoiceNumber: true,
    applicationId: true,
    serviceType: true,
    subtotal: true,
    vat: true,
    totalAmount: true,
    dueDate: true,
    status: true,
    paidAt: true,
    receiptNumber: true,
    receiptIssuedAt: true,
    createdAt: true,
    // Read only to derive paymentMode, then dropped (withPaymentMode).
    metadata: true,
    lineItems: {
        orderBy: { lineNumber: 'asc' },
        select: {
            id: true, lineNumber: true, code: true, description: true, quantity: true,
            unitPrice: true, amount: true, phase: true, isTaxable: true,
        },
    },
    // round 5 (operator 2026-10-03): which service a row bills is renewal-aware, so the
    // application's formData is read to answer `service`, then dropped (withServiceLine).
    application: { select: { applicationNumber: true, formData: true } },
});

/** The applicant's own invoice and the invoice PDF carry the applicant's contact. */
const APPLICANT_SELECT = Object.freeze({
    id: true, firstName: true, lastName: true, email: true, phoneNumber: true,
});
/**
 * Staff (finance) invoice detail: name only, no email or phone (order 18, operator
 * 2026-10-06). Who is billed and where comes in the payer block.
 */
const STAFF_APPLICANT_SELECT = Object.freeze({ id: true, firstName: true, lastName: true });

/**
 * An invoice as staff read it: without `healthId`, which holds the filer's national ID
 * while APP_FK_USE_TOKEN is off (order 10: a national ID leaves the server only masked),
 * and without `metadata`, whose refund block carries staff notes and whose WHT block
 * carries the payer's tax id in full. No staff screen reads it: refunds and WHT
 * certificates have doors of their own that apply the reader's rules.
 */
function toStaffInvoice(invoice) {
    const { healthId: _healthId, ...rest } = invoice;
    return withPaymentMode(rest);
}

/**
 * The row with `paymentMode`, the mode its settlement recorded (TRIAL or LIVE, null before
 * money moved), in place of `metadata`, which stays on the server: a screen stamps the
 * receipt from the row, whatever key is live when it is opened.
 */
function withPaymentMode(invoice) {
    const { metadata: _metadata, ...rest } = invoice;
    return { ...rest, paymentMode: settledPaymentMode(invoice) };
}

class InvoiceService {

    /**
     * List invoices for provider with filters. `viewer` is req.user: its own
     * organization only, explicitly (order 17).
     */
    async listAll(filters = {}, limit = 50, { viewer } = {}) {
        const organization = organizationScope(viewer);
        if (organization === DENY_ALL) { return []; }
        const where = { isDeleted: false, ...organization };
        const statusFilter = statusFilterForQuery(filters.status);
        if (statusFilter) { where.status = statusFilter; }
        if (filters.startDate && filters.endDate) {
            where.createdAt = {
                gte: new Date(filters.startDate),
                lte: new Date(filters.endDate),
            };
        }

        const invoices = await prisma.invoice.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: {
                applicant: { select: { firstName: true, lastName: true } },
                // Billing columns only (S1 / F-SCOPE-01) — see services/finance/billing-select.js.
                // The applicant display name comes from Application.entity.displayName.
                application: BILLING_APPLICATION_SELECT,
                lineItems: { orderBy: { lineNumber: 'asc' } },
            },
        });

        return invoices.map((invoice) => toStaffInvoice(withDerivedStatus(invoice)));
    }

    /**
     * The invoices a health user may read (GET /api/invoices/my): those of the
     * applications filed under a holder entity in the caller's holder scope
     * (spec 2026-09-30-remove-workspace-mode §3.1; holderScope(req)). No filer
     * pin and no null-holder branch: co-members see the holder's invoices.
     *
     * No holder scope: fail closed, no query.
     * @param {{ scope: { readIds: string[] }, status?: string }} args
     */
    async listForHolders({ scope, status } = {}) {
        if (!isHolderScope(scope)) { return []; }
        const where = holderOwnedInvoiceWhere(scope);
        const statusFilter = statusFilterForQuery(status);
        if (statusFilter) { where.status = statusFilter; }

        const invoices = await prisma.invoice.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            select: APPLICANT_INVOICE_SELECT,
        });

        return invoices.map((invoice) => withPaymentMode(withServiceLine(withDerivedStatus(invoice))));
    }

    /**
     * One invoice a health user may read, by id — the billing view (the same
     * select as getById). Null when the caller's holder scope does not reach it,
     * or it is missing, or retired without a tax invoice (the doors answer 404).
     * Used by invoice-helpers.findHealthInvoice.
     * @param {string} id
     * @param {{ scope: { readIds: string[] } }} args
     */
    async getForHolder(id, { scope } = {}) {
        if (!isHolderScope(scope)) { return null; }
        return this._findOneInvoice(id, BILLING_APPLICATION_SELECT, holderOwnedInvoiceWhere(scope));
    }

    /**
     * Get Invoice Statistics
     */
    /**
     * The accounting dashboard's figures for `viewer`'s organization (order 17).
     *
     * Revenue is what the company keeps: live paid invoices by their payment date, net of
     * the credit notes (refunds and adjustments) issued against them. The month is the Bangkok month of
     * `now`; all-time is everything. A debit note is billed, not received, so it is not here.
     */
    async getSummary({ viewer, now = new Date() } = {}) {
        const scope = organizationScope(viewer);
        if (scope === DENY_ALL) {
            throw Object.assign(new Error('Organization context required'), { code: 'FORBIDDEN_TENANT', statusCode: 403 });
        }
        const org = scope ? { organizationId: scope.organizationId } : {};
        const live = { isDeleted: false, ...org };
        const paid = { ...live, status: { in: canonicalPaidStatuses() } };
        // A credit note counts against a counted invoice only: the second payment of a
        // milestone sits on a retired (soft-deleted) invoice, so neither it nor the credit
        // note that refunds it is revenue.
        const credited = { ...live, status: { in: ['ISSUED', 'POSTED'] }, originalInvoice: { isDeleted: false } };
        const { year, month } = getZonedParts(now);
        const from = startOfLocalCalendarDay(year, month, 1);
        const to = startOfLocalCalendarDay(year, month + 1, 1);
        const inMonth = { gte: from, lt: to };

        const sum = (rows) => Math.round(Number(rows._sum?.totalAmount || 0) * 100) / 100;
        const [paidAll, paidMonth, creditAll, creditMonth, pendingSum, overdueSum, pendingCount, paidCount, overdueCount, totalCount] = await Promise.all([
            prisma.invoice.aggregate({ _sum: { totalAmount: true }, where: paid }),
            prisma.invoice.aggregate({ _sum: { totalAmount: true }, where: { ...paid, paidAt: inMonth } }),
            prisma.creditNote.aggregate({ _sum: { totalAmount: true }, where: credited }),
            prisma.creditNote.aggregate({ _sum: { totalAmount: true }, where: { ...credited, issuedAt: inMonth } }),
            prisma.invoice.aggregate({ _sum: { totalAmount: true }, where: { ...live, status: { in: ['pending', 'PENDING'] } } }),
            prisma.invoice.aggregate({ _sum: { totalAmount: true }, where: { ...live, status: { in: ['overdue', 'OVERDUE'] } } }),
            prisma.invoice.count({ where: { ...live, status: { in: ['pending', 'PENDING'] } } }),
            prisma.invoice.count({ where: paid }),
            prisma.invoice.count({ where: { ...live, status: { in: ['overdue', 'OVERDUE'] } } }),
            prisma.invoice.count({ where: live }),
        ]);
        const figure = (gross, credit) => ({
            gross: sum(gross), credited: sum(credit), net: Math.round((sum(gross) - sum(credit)) * 100) / 100,
        });

        return {
            month: { year, month },
            revenue: {
                month: figure(paidMonth, creditMonth),
                allTime: figure(paidAll, creditAll),
            },
            pendingAmount: sum(pendingSum),
            overdueAmount: sum(overdueSum),
            invoiceCount: {
                total: totalCount,
                pending: pendingCount,
                paid: paidCount,
                overdue: overdueCount,
            },
        };
    }

    /**
     * Get single invoice — the staff billing view (safe to serialise to a caller).
     * The Application relation carries billing columns only (S1 / F-SCOPE-01) and
     * `payer` the tax-document block, name + address, no contact (order 18), its id in full
     * for the company finance officer only (order 57).
     * `viewer` is req.user: its own organization only, explicitly (order 17).
     * PDF generation, which needs the full application, uses getForDocument().
     */
    async getById(id, { viewer } = {}) {
        const organization = organizationScope(viewer);
        if (organization === DENY_ALL) { return null; }
        const invoice = await this._findOneInvoice(
            id, BILLING_WITH_PAYER_SELECT, organization, STAFF_APPLICANT_SELECT,
        );
        if (!invoice) { return null; }
        const { application, payer } = toBillingWithPayer(invoice.application, invoice.applicant, viewer);
        return { ...toStaffInvoice(invoice), application, payer };
    }

    /**
     * INTERNAL ONLY — the invoice with its full Application row, for rendering
     * the invoice / receipt PDF (the template reads formData for the product
     * detail). Never return this object from a route.
     *
     * Entity select carries `juristicId` + `communityRegNo` on top of the
     * billing-safe `{id, type, displayName}` triple — the invoice/receipt/
     * tax-invoice PDFs print the JURISTIC payer's tax id and the
     * COMMUNITY_ENTERPRISE payer's DOAE registration number
     * (utils/applicant-resolver.js resolveFromEntity) and neither reaches the caller as
     * JSON (getById/BILLING_APPLICATION_SELECT is the route-facing select and
     * does not carry these columns). Both are `enc:v1:`-encrypted at rest;
     * the PDPA prisma extension's generic decrypt-on-read walker
     * (services/prisma-pdpa-extension.js decryptResultTree) decrypts them
     * transparently on this same read because they are now present in the
     * result tree to walk — no extra wiring needed. Fixes the invoice/
     * receipt PDF always printing "Tax ID -" for a real juristic/community
     * payer (2026-09-27).
     *
     * `thaiCitizenId` is DELIBERATELY ABSENT — operator ruling 2026-09-27: an
     * INDIVIDUAL payer's national ID is never printed on any finance
     * document, in full or in part. A fix-round-1 version of this select DID
     * add it, which (via the resolver's then `id = entity.thaiCitizenId
     * || '-'`, since removed) started printing the full 13-digit national ID
     * as PAYER_ID on the invoice/receipt for an individual payer — a leak,
     * caught before merge. Do not re-add it.
     */
    async getForDocument(id, { scope, organizationId } = {}) {
        // A health door passes its holder scope (Task 5) and a staff door its caller's
        // organization (order 17): the document read carries the same limit as the door,
        // so another holder's or organization's id is simply not found.
        const scopeWhere = isHolderScope(scope)
            ? holderOwnedInvoiceWhere(scope)
            : (organizationId ? { organizationId } : null);
        return this._findOneInvoice(id, {
            // The discriminator column on Entity is `type`
            // (prisma/schema/entity.prisma:33), NOT `entityType` (B1).
            include: {
                // The resolver's own select — one definition for every payer read.
                entity: { select: PAYER_ENTITY_SELECT },
            },
        }, scopeWhere);
    }

    async _findOneInvoice(id, applicationArgs, scopeWhere = null, applicantSelect = APPLICANT_SELECT) {
        // findFirst (NOT findUnique) so the tenant-prisma-extension injects
        // organizationId when a tenant context is bound (TENANT_READ_ORG_SCOPE).
        // findUnique is NOT hooked by the extension, which let any INVOICE_VIEW_ALL
        // holder read another org's invoice by id (cross-org IDOR). System/no-context
        // paths are unaffected (no org injected → resolves by id as before).
        const invoice = await prisma.invoice.findFirst({
            where: scopeWhere ? { id, ...scopeWhere } : { id },
            include: {
                // NARROW SELECTS, not `true`. `include: <relation>: true` returns
                // EVERY column — which once put the applicant's bcrypt password
                // hash, TOTP secret and password-reset token, and the Entity's
                // plaintext national and juristic IDs, into an invoice-detail
                // response readable by any holder of INVOICE_VIEW_ALL.
                application: applicationArgs,
                applicant: { select: applicantSelect },
                lineItems: { orderBy: { lineNumber: 'asc' } },
            },
        });
        return invoice ? withDerivedStatus(invoice) : null;
    }

    /**
     * Find invoice by Application ID
     */
    async findByApplicationId(applicationId) {
        const invoice = await prisma.invoice.findFirst({
            where: {
                applicationId,
                isDeleted: false,
            },
            orderBy: { createdAt: 'desc' },
        });
        return invoice ? withDerivedStatus(invoice) : null;
    }

    /**
     * Generate PDF Buffer
     */
    async generatePdf(id, { scope } = {}) {
        const invoice = await this.getForDocument(id, { scope });
        if (!invoice) { throw new Error('Invoice not found'); }

        // Try queue-based generation first, fallback to direct PDFKit
        try {
            const { getPdfQueue } = require('./queue-service');
            const pdfQueue = getPdfQueue();
            if (pdfQueue) {
                const logger = require('../shared/logger');
                logger.info(`[Invoice] Offloading PDF generation to worker for ID: ${id}`);
                const job = await pdfQueue.add({ type: 'INVOICE', payload: { invoiceId: id } });
                const resultBase64 = await job.finished();
                return Buffer.from(resultBase64, 'base64');
            }
        } catch (queueError) {
            const logger = require('../shared/logger');
            logger.warn(`[Invoice] Queue PDF failed, falling back to direct PDFKit: ${queueError.message}`);
        }

        return invoiceTemplateService.generateInvoicePdf(invoice);
    }

    /**
     * The paper for a paid invoice: ใบเสร็จรับเงิน / ใบกำกับภาษีเต็มรูป, numbered with the
     * stored TAX-PRD receipt number (invoice-template-service.generateReceiptTaxInvoicePdf).
     * Served by the staff route (its caller's organization) and by the applicant's own route
     * (its holder scope) alike.
     */
    async generateReceiptPdf(invoiceId, { scope, organizationId } = {}) {
        const invoice = await this.getForDocument(invoiceId, { scope, organizationId });
        if (!invoice) { throw new Error('Invoice not found'); }
        // Precondition, not a server fault: invoice exists but no receipt issued
        // yet → 409 (respondError honours error.statusCode). Previously this plain
        // Error fell through to a generic 500.
        if (!invoice.receiptNumber) {
            throw Object.assign(new Error('Receipt not issued yet'), { statusCode: 409, code: 'RECEIPT_NOT_ISSUED' });
        }

        // Try queue-based generation first, fallback to direct PDFKit
        try {
            const { getPdfQueue } = require('./queue-service');
            const pdfQueue = getPdfQueue();
            if (pdfQueue) {
                const logger = require('../shared/logger');
                logger.info(`[Invoice] Offloading Receipt PDF generation to worker for ID: ${invoiceId}`);
                const job = await pdfQueue.add({ type: 'RECEIPT', payload: { invoiceId: invoiceId } });
                const resultBase64 = await job.finished();
                return Buffer.from(resultBase64, 'base64');
            }
        } catch (queueError) {
            const logger = require('../shared/logger');
            logger.warn(`[Invoice] Queue Receipt PDF failed, falling back to direct PDFKit: ${queueError.message}`);
        }

        return invoiceTemplateService.generateReceiptTaxInvoicePdf(invoice);
    }

    /**
     * List accounting exceptions from payment webhook audit trail.
     * Exception classes: unmatched invoice, invalid signature, processing failure.
     */
    async listReceiptExceptions(limit = 100, { viewer } = {}) {
        const scope = organizationScope(viewer);
        if (scope === DENY_ALL) {
            throw Object.assign(new Error('Organization context required'), { code: 'FORBIDDEN_TENANT', statusCode: 403 });
        }
        const logs = await prisma.auditLog.findMany({
            where: {
                ...(scope ? { organizationId: scope.organizationId } : {}),
                category: 'PAYMENT',
                action: {
                    in: [
                        'WEBHOOK_UNMATCHED',
                        'WEBHOOK_INVALID_SIGNATURE',
                        'WEBHOOK_PROCESSING_FAILED',
                    ],
                },
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });

        return logs.map((entry) => {
            const metadata = parseAuditMetadata(entry.metadata);
            return {
                id: entry.id,
                action: entry.action,
                severity: entry.severity,
                createdAt: entry.createdAt,
                invoiceId: metadata.invoiceId || metadata.gatewayRef || null,
                transactionId: metadata.transactionId || null,
                message: metadata.message || entry.errorMessage || 'Payment exception recorded',
                payloadRef: metadata.payloadHash || null,
                metadata,
            };
        });
    }

    /**
     * Fetch a thin projection of invoices for a set of applicationIds, used
     * by the auditor + scheduler dashboards to compute per-application phase
     * settlement (`computePhaseSettlement(...)`). Soft-deleted invoices are
     * filtered out so a phase that has been cancelled/written-off cannot be
     * mistaken for an unpaid balance on the queue cards.
     *
     * Replaces prisma.invoice.findMany at:
     *   - routes/api/provider/handlers/auditor-dashboard-handler.js:75
     *   - routes/api/provider/handlers/scheduler-dashboard-handler.js:70
     */
    /**
     * Fetch a thin projection of invoices for a single application, used by
     * the auditor `isPhase2ReceiptIssued` precondition check in the
     * inspection-start path. Soft-deleted invoices are filtered out so a
     * cancelled phase invoice cannot block a fresh inspection start.
     *
     * Replaces prisma.invoice.findMany at
     * routes/api/provider/handlers/auditor-handler-deps.js:33.
     */
    async listSettlementsForApplication(applicationId) {
        if (!applicationId) {return [];}
        return prisma.invoice.findMany({
            where: {
                applicationId,
                isDeleted: false,
            },
            select: {
                id: true,
                serviceType: true,
                status: true,
                receiptIssuedAt: true,
                receiptNumber: true,
                metadata: true,
                createdAt: true,
                updatedAt: true,
            },
            orderBy: { createdAt: 'asc' },
        });
    }

    async listSettlementsByApplicationIds(applicationIds) {
        if (!Array.isArray(applicationIds) || applicationIds.length === 0) {
            return [];
        }
        return prisma.invoice.findMany({
            where: {
                applicationId: { in: applicationIds },
                isDeleted: false,
            },
            select: {
                applicationId: true,
                serviceType: true,
                status: true,
                paidAt: true,
                receiptIssuedAt: true,
                receiptNumber: true,
                metadata: true,
                createdAt: true,
                updatedAt: true,
            },
        });
    }
}

module.exports = new InvoiceService();



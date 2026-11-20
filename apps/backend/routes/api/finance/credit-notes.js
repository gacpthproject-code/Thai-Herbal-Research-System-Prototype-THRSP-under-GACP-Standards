/**
 * Credit Note routes — /api/finance/credit-notes
 *
 * Batch B20-A (2026-05-16). Exposes the credit-note-service operations
 * over a thin HTTP layer. Authentication is via authenticateProvider;
 * authorization (role + tenant scope) is enforced inside the service
 * layer so the contract stays identical for any future caller (CLI,
 * cron, internal admin tool).
 *
 * Endpoints:
 *   POST   /                  create DRAFT (finance_officer_platform; adjustments only —
 *                             cancellations and full credits are refunds, routes/api/finance/refunds.js)
 *   POST   /:id/issue         DRAFT → ISSUED
 *   POST   /:id/post          ISSUED → POSTED (writes reversing GL entry)
 *   POST   /:id/cancel        soft-cancel
 *   GET    /                  list with filters (status, dateRange, ...)
 *   GET    /:id               detail
 *   GET    /:id/pdf           render ใบลดหนี้ PDF (TODO: wire PDF template
 *                             generator — placeholder returns a 501 with a
 *                             marker until the pdf/invoice-template-service
 *                             gets a `generateCreditNotePdf(...)` method.
 *                             The HTML template is already present at
 *                             apps/backend/services/pdf/templates/credit-note.html.)
 *
 * Compliance:
 *   - All routes audit-log via the credit-note-service.safeAudit hook.
 *   - Errors carry { code, statusCode } from makeError() so the HTTP
 *     status matches the cause (404 not-found, 409 invalid transition,
 *     422 not-platform-invoice, etc.).
 */

'use strict';

const express = require('express');
const router = express.Router();

const { authenticateProvider, authenticateAny } = require('../../../middleware/auth-middleware');
const creditNoteService = require('../../../services/credit-note-service');

const { sendServiceError: sendFinanceError, allowFinancePaperDownload } = require('./finance-route-helpers');

// 5xx answers a fixed message and logs the error; 4xx keeps the service's message (L2).
function sendServiceError(res, err) {
    return sendFinanceError(res, err, { label: 'credit-notes', fallback: 'Failed to process credit note request' });
}

// POST / — create a new credit note in DRAFT status.
router.post('/', authenticateProvider, async (req, res) => {
    try {
        // The note's organization is the invoice's; a body organizationId is ignored.
        const { originalInvoiceId, reasonCode, reason, subtotal, vat } = req.body || {};
        const cn = await creditNoteService.createCreditNote({
            originalInvoiceId,
            reasonCode,
            reason,
            subtotal,
            vat,
            actor: req.user,
        });
        return res.status(201).json({ success: true, data: cn });
    } catch (err) {
        return sendServiceError(res, err);
    }
});

// POST /:id/issue — DRAFT → ISSUED.
router.post('/:id/issue', authenticateProvider, async (req, res) => {
    try {
        const updated = await creditNoteService.issueCreditNote(req.params.id, {
            actor: req.user,
        });
        return res.json({ success: true, data: updated });
    } catch (err) {
        return sendServiceError(res, err);
    }
});

// POST /:id/post — ISSUED → POSTED. Writes reversing journal entry.
router.post('/:id/post', authenticateProvider, async (req, res) => {
    try {
        const updated = await creditNoteService.postCreditNote(req.params.id, {
            actor: req.user,
        });
        return res.json({ success: true, data: updated });
    } catch (err) {
        return sendServiceError(res, err);
    }
});

// POST /:id/refund-transfer — the company's bank paid the refund this note documents
// (outside the system, order 20); finance records the day and the bank reference once.
router.post('/:id/refund-transfer', authenticateProvider, async (req, res) => {
    try {
        const { transferredOn, bankReference } = req.body || {};
        const updated = await creditNoteService.recordRefundTransfer(req.params.id, {
            transferredOn, bankReference, actor: req.user,
        });
        return res.json({ success: true, data: updated });
    } catch (err) {
        return sendServiceError(res, err);
    }
});

// POST /:id/cancel — soft-cancel (DRAFT or ISSUED only — POSTED is terminal).
router.post('/:id/cancel', authenticateProvider, async (req, res) => {
    try {
        const { reason } = req.body || {};
        const updated = await creditNoteService.cancelCreditNote(req.params.id, {
            actor: req.user,
            reason,
        });
        return res.json({ success: true, data: updated });
    } catch (err) {
        return sendServiceError(res, err);
    }
});

// GET / — list with filters.
// authenticateAny: a HEALTH applicant may read the issued credit notes of THEIR OWN
// invoice via ?originalInvoiceId= (ownership enforced in the service layer —
// powers the applicant refund-visibility panel). The unfiltered list
// (status/date) stays provider-only (assertReadAccess throws 403 otherwise) and is
// read in the caller's own organization; the query names none.
router.get('/', authenticateAny, async (req, res) => {
    try {
        const { originalInvoiceId, status, from, to } = req.query || {};
        if (originalInvoiceId) {
            const list = await creditNoteService.listCreditNotesForInvoice(
                originalInvoiceId,
                {
                    actor: req.user,
                    // Spec 2026-09-30 §3.1 + order 41: the applicant's invoice read carries the
                    // holders whose money the caller may read (VIEW_FINANCIAL).
                    holderScope: await require('../../../services/holder-access').financialHolderScope(req),
                },
            );
            // A holder's rows carry the refund panel's columns only (HOLDER_CREDIT_NOTE_SELECT, which
            // names no finance officer by id: F6-R); staff readers keep the row whole.
            return res.json({ success: true, data: list });
        }
        const list = await creditNoteService.listCreditNotes({
            status,
            from, to,
            actor: req.user,
        });
        return res.json({ success: true, data: list });
    } catch (err) {
        return sendServiceError(res, err);
    }
});

// GET /:id — detail
router.get('/:id', authenticateProvider, async (req, res) => {
    try {
        const cn = await creditNoteService.findCreditNoteById(req.params.id, {
            actor: req.user,
        });
        if (!cn) {
            return res.status(404).json({
                success: false, error: 'CREDIT_NOTE_NOT_FOUND',
                message: 'Credit note not found',
            });
        }
        return res.json({ success: true, data: cn });
    } catch (err) {
        return sendServiceError(res, err);
    }
});

// GET /:id/pdf — render PDF
//
// Wiring contract: the actual PDF render is delegated to the
// pdf/invoice-template-service.js module so it reuses the shared
// {{ISSUER_LOGO_DATA_URL}}, {{APPROVER_*}} signing pipeline. Until that
// service gains a `generateCreditNotePdf(creditNote, opts)` companion
// to `generateReceiptTaxInvoicePdf`, this endpoint emits 501 with a marker
// so callers know to wait for the wire-in. The HTML template at
// apps/backend/services/pdf/templates/credit-note.html is already
// in place.
router.get('/:id/pdf', authenticateProvider, async (req, res) => {
    try {
        // The paper prints the buyer's tax id in full: company finance only (order 64 ค6 ก).
        if (!allowFinancePaperDownload(req, res)) { return undefined; }
        // The document read carries the original invoice's applying entity for
        // the payer block (internal only — never serialised; the JSON detail
        // route above keeps findCreditNoteById).
        const cn = await creditNoteService.findCreditNoteForDocument(req.params.id, {
            actor: req.user,
        });
        if (!cn) {
            return res.status(404).json({
                success: false, error: 'CREDIT_NOTE_NOT_FOUND',
                message: 'Credit note not found',
            });
        }
        // Delegate to pdf/invoice-template-service.generateCreditNotePdf
        // if available; otherwise return a structured 501 so the next
        // batch can wire it without route-level changes.
        let invoiceTemplateService;
        try {
            invoiceTemplateService = require('../../../services/pdf/invoice-template-service');
        } catch (_e) {
            invoiceTemplateService = null;
        }
        if (invoiceTemplateService && typeof invoiceTemplateService.generateCreditNotePdf === 'function') {
            const buf = await invoiceTemplateService.generateCreditNotePdf(cn);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition',
                `inline; filename="${cn.creditNoteNumber || `draft-${cn.id}`}.pdf"`); // a DRAFT has no number yet
            return res.send(buf);
        }
        return res.status(501).json({
            success: false,
            error: 'PDF_RENDER_NOT_WIRED',
            message: 'generateCreditNotePdf is not yet wired in '
                + 'services/pdf/invoice-template-service.js. '
                + 'HTML template lives at services/pdf/templates/credit-note.html — '
                + 'the next batch can wire the buffer renderer there.',
        });
    } catch (err) {
        return sendServiceError(res, err);
    }
});

module.exports = router;

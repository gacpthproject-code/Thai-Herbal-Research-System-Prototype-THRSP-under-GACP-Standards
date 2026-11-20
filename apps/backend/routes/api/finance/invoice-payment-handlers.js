/**
 * Invoice receipt + finance read routes: receipt PDF, webhook exceptions,
 * revenue summary, CSV export. All read-only. The receipt is issued by the
 * webhook settlement (checkout-settlement-service); no person issues one,
 * and no person approves, confirms, holds or marks a payment (operator 2026-10-06).
 *
 * @module routes/api/finance/invoice-payment-handlers
 */

const express = require('express');
const { respondError } = require('../../../shared/api-response');
const router = express.Router();
const invoiceService = require('../../../services/invoice-service');
const { authenticateProvider } = require('../../../middleware/auth-middleware');
const logger = require('../../../shared/logger');
const { normalizeRole, hasPermission, PERMISSIONS } = require('../../../shared/canonical-rbac');
const { exportCSV } = require('../../../services/financial-export-service');
const { readsFullTaxIds } = require('../../../services/finance/company-books-access');
const { requireOrganization, allowFinancePaperDownload } = require('./finance-route-helpers');
const { getZonedParts } = require('../../../utils/working-days');

const requirePermission = (permission) => (req, res, next) => {
    const canonicalRole = normalizeRole(req.user?.canonicalRole || req.user?.role);
    if (!canonicalRole || !hasPermission(canonicalRole, permission)) {
        return res.status(403).json({ success: false, error: 'Forbidden', message: `Permission required: ${permission}` });
    }
    req.user.canonicalRole = canonicalRole;
    return next();
};

/**
 * GET /api/invoices/:invoiceId/receipt/pdf
 * Download Receipt PDF: the company finance officer, inside its own organization. The read
 * carries the organization, so another organization's invoice id is not found (order 17).
 */
router.get('/:invoiceId/receipt/pdf', authenticateProvider, async (req, res) => {
    try {
        if (!allowFinancePaperDownload(req, res)) { return undefined; }
        const organizationId = requireOrganization(req, res);
        if (!organizationId) { return undefined; }
        const pdfBuffer = await invoiceService.generateReceiptPdf(req.params.invoiceId, { organizationId });
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="receipt-${req.params.invoiceId}.pdf"`,
            'Content-Length': pdfBuffer.length,
        });
        // nosemgrep: javascript.express.security.audit.xss.direct-response-write.direct-response-write -- binary PDF Buffer served with an explicit Content-Type: application/pdf + attachment disposition; never interpreted as HTML.
        res.send(pdfBuffer);
    } catch (error) {
        // A missing/unfinalised invoice (service throws Error('… not found') or a
        // Prisma not-found) → 404; anything else is a genuine 500. (Error path
        // returns JSON, not a PDF.)
        if (/not found/i.test(error?.message || '')) {
            return res.status(404).json({ success: false, error: 'Invoice not found' });
        }
        return respondError(res, req, error, { label: '[Invoices] receiptPdf', message: 'Failed to generate Receipt PDF' });
    }
});

/**
 * GET /api/invoices/receipts/exceptions
 * List accounting/payment exceptions from webhook pipeline
 */
router.get('/receipts/exceptions', authenticateProvider, requirePermission(PERMISSIONS.INVOICE_VIEW_ALL), async (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
        const exceptions = await invoiceService.listReceiptExceptions(limit, { viewer: req.user });
        res.json({ success: true, data: { exceptions } });
    } catch (error) {
        logger.error('[Invoices] Receipt Exceptions Error:', error);
        return respondError(res, req, error, { message: 'Failed to fetch receipt exceptions' });
    }
});

// ─── Finance Department Endpoints ────────────────────────────

/**
 * GET /api/invoices/export?format=csv&type=monthly&month=3&year=2026
 * Financial export engine — CSV reports
 */
router.get('/export', authenticateProvider, requirePermission(PERMISSIONS.INVOICE_VIEW_ALL), async (req, res) => {
    try {
        const reportType = req.query.type || 'monthly';
        // Default: the current Bangkok month (the ภ.พ.30 month).
        const nowBkk = getZonedParts(new Date());
        const month = parseInt(req.query.month) || nowBkk.month;
        const year = parseInt(req.query.year) || nowBkk.year;

        // The export reads with the module prisma client (no request-scoped org scope), so
        // the caller's organization is threaded explicitly; no organization, no export (order 17).
        const organizationId = requireOrganization(req, res);
        if (!organizationId) { return undefined; }
        const extraWhere = { organizationId };

        // The tax report prints taxpayer ids in full for the company finance officer only
        // (order 34); every other export reads the same for both finance roles (2026-09-11).
        const { buffer, filename, contentType } = reportType === 'tax'
            ? await exportCSV(reportType, month, year, extraWhere, {
                fullTaxIds: readsFullTaxIds(req.user),
            })
            : await exportCSV(reportType, month, year, extraWhere);
        res.set({
            'Content-Type': contentType,
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': buffer.length,
        });
        // nosemgrep: javascript.express.security.audit.xss.direct-response-write.direct-response-write -- binary report export (CSV/xlsx) served with the exporter's own Content-Type + attachment disposition; never interpreted as HTML.
        res.send(buffer);
    } catch (error) {
        logger.error('[Invoices] Export Error:', error);
        return respondError(res, req, error, { message: 'Failed to export report' });
    }
});

module.exports = router;

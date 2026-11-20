/**
 * Refund routes — /api/finance/refunds (order 22, operator 2026-10-06).
 *
 * Finance records a refund the company made outside the system. Authentication
 * via authenticateProvider; role + tenant are enforced in refund-service so any
 * other caller meets the same gate.
 *
 *   POST /:invoiceId/duplicate-charge       { amount, idempotencyKey }
 *       the excess of a duplicate or over-charge; status and payment unchanged
 *   POST /:invoiceId/provider-cancellation  { reasonCode, note }
 *       the company or the state cancelled a milestone whose service has not
 *       started; full refund, the application closes as CANCELLED
 *   GET  /:invoiceId/status                 every refund recorded on the invoice
 *
 * Legal basis (refund-service.js): ป.รัษฎากร ม.86/10 and ม.86/4, payment terms
 * v1.3 §7.
 */

'use strict';

const express = require('express');
const router = express.Router();

const { authenticateProvider } = require('../../../middleware/auth-middleware');
const { sendServiceError: sendFinanceServiceError } = require('./finance-route-helpers');
const refundService = require('../../../services/refund-service');

function sendServiceError(res, err) {
    return sendFinanceServiceError(res, err, { label: 'refunds', fallback: 'Failed to process refund request' });
}

function sendRecorded(res, result) {
    return res.status(result.idempotent ? 200 : 201).json({ success: true, data: result });
}

router.post('/:invoiceId/duplicate-charge', authenticateProvider, async (req, res) => {
    try {
        const { amount, idempotencyKey } = req.body || {};
        return sendRecorded(res, await refundService.recordDuplicateChargeRefund({
            invoiceId: req.params.invoiceId, amount, idempotencyKey, actor: req.user,
        }));
    } catch (err) {
        return sendServiceError(res, err);
    }
});

router.post('/:invoiceId/provider-cancellation', authenticateProvider, async (req, res) => {
    try {
        const { reasonCode, note } = req.body || {};
        return sendRecorded(res, await refundService.recordProviderCancellationRefund({
            invoiceId: req.params.invoiceId, reasonCode, note, actor: req.user,
        }));
    } catch (err) {
        return sendServiceError(res, err);
    }
});

router.get('/:invoiceId/status', authenticateProvider, async (req, res) => {
    try {
        const result = await refundService.getRefundStatus(req.params.invoiceId, { actor: req.user });
        if (!result) {
            return res.status(404).json({ success: false, error: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });
        }
        return res.json({ success: true, data: result });
    } catch (err) {
        return sendServiceError(res, err);
    }
});

module.exports = router;

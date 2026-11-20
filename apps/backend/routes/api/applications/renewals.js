/**
 * Renewal Routes.
 *
 *   GET  /api/applications/renewals/upcoming-expiry
 *        query: ?days=60&take=200
 *        - Provider / admin view of certificates approaching expiry.
 *
 * A renewal itself is filed through the wizard (requestType RENEWAL) and goes through the
 * short document check (operator order 25(11), 2026-10-06). The POST door that created a
 * priced renewal at PENDING_AUDIT_FEE was removed with that ruling.
 *
 * @module routes/api/applications/renewals
 */

'use strict';

const express = require('express');
const router = express.Router();

const logger = require('../../../shared/logger');
const { authenticateProvider } = require('../../../middleware/auth-middleware');
const renewalService = require('../../../services/renewal-service');
const { entityPermissionDeniedBody } = require('../../../shared/entity-permission-denied');

// ── Error mapper ───────────────────────────────────────────────────────────

function sendServiceError(res, err) {
    const status = err?.statusCode || 500;
    const code = err?.code || 'INTERNAL_ERROR';
    if (status >= 500) {
        logger.error(`[renewals-route] ${code}: ${err?.message}`, err);
    }
    // One answer for this code at every door (shared/entity-permission-denied.js).
    if (code === 'ENTITY_PERMISSION_DENIED') {
        return res.status(403).json(entityPermissionDeniedBody(err?.permission));
    }
    const body = {
        success: false,
        error: code,
        message: err?.message || 'Renewal request failed',
    };
    if (err?.data) {body.data = err.data;}
    return res.status(status).json(body);
}

// ── GET /upcoming-expiry — provider/admin dashboard view ───────────────────

router.get('/upcoming-expiry', authenticateProvider, async (req, res) => {
    try {
        const days = req.query?.days !== undefined
            ? Math.max(1, Math.min(365, Number.parseInt(req.query.days, 10) || 60))
            : 60;
        const take = req.query?.take !== undefined
            ? Math.max(1, Math.min(1000, Number.parseInt(req.query.take, 10) || 200))
            : 200;

        const rows = await renewalService.listUpcomingExpiry({ days, take });

        return res.json({
            success: true,
            data: rows,
            meta: {
                days,
                total: rows.length,
            },
        });
    } catch (err) {
        return sendServiceError(res, err);
    }
});

module.exports = router;

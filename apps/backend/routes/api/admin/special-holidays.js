/**
 * วันหยุดพิเศษ (operator คำสั่ง 32, 2026-10-07: ผู้ดูแลฝั่งกรมเพิ่มได้)
 *
 *   GET  /api/admin/special-holidays   list (both admin roles)
 *   POST /api/admin/special-holidays   { date: 'YYYY-MM-DD', name, reason } → 201 (system_admin_dtam only)
 *
 * Append-only: no edit or delete door (the table refuses both). Auth: authenticateProvider +
 * requireAdmin from the parent admin router.
 */

'use strict';

const express = require('express');
const { normalizeRole, CANONICAL_ROLES } = require('../../../shared/canonical-rbac');
const { listSpecialHolidays, addSpecialHoliday } = require('../../../services/special-holiday-service');
const { respondError } = require('../../../shared/api-response');

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        return res.json({ success: true, data: await listSpecialHolidays() });
    } catch (error) {
        return respondError(res, req, error);
    }
});

router.post('/', async (req, res) => {
    try {
        if (normalizeRole(req.user?.canonicalRole || req.user?.role) !== CANONICAL_ROLES.SYSTEM_ADMIN_DTAM) {
            return res.status(403).json({ success: false, code: 'SPECIAL_HOLIDAY_ADMIN_ONLY', error: 'SPECIAL_HOLIDAY_ADMIN_ONLY' });
        }
        const { date, name, reason } = req.body || {};
        const row = await addSpecialHoliday({
            date, name, reason,
            actor: { id: req.user.id, role: req.user.canonicalRole || req.user.role, organizationId: req.user.organizationId || null },
        });
        return res.status(201).json({ success: true, data: row });
    } catch (error) {
        if (error?.code === 'SPECIAL_HOLIDAY_INVALID' || error?.code === 'SPECIAL_HOLIDAY_EXISTS') {
            return res.status(error.statusCode).json({ success: false, code: error.code, error: error.code, message: error.message });
        }
        return respondError(res, req, error);
    }
});

module.exports = router;

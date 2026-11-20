const express = require('express');
const { providerRouteHandlers } = require('./route-registry');
const { authenticateProvider, logger } = require('./handlers/shared');
const { CANONICAL_ROLES, normalizeRole } = require('../../../shared/canonical-rbac');
const certificateActions = require('../../../services/certificate-approver-actions');
const {
    CERTIFICATE_SUSPENSION_REASONS, CERTIFICATE_REVOCATION_REASONS, reasonOptions,
} = require('../../../shared/certification-decision-reasons');

const router = express.Router();

router.get('/dashboard', ...providerRouteHandlers.certificatesDashboard);
router.post('/bulk-notify', ...providerRouteHandlers.certificatesBulkNotify);

// ── ใบรับรองของผู้อนุมัติ: ดู พักใช้ คืนสภาพ เพิกถอน (คำสั่ง 29 และ 34(4)) ──
// certificate_approver เท่านั้น ภายในองค์กรของตัวเอง · งานทั้งหมดอยู่ใน
// services/certificate-approver-actions.js ไฟล์นี้แปลงผลเป็น HTTP

// requireRole lets system_admin_platform through every provider gate; this decision is
// the approver's alone (order 34(4)), so the role is compared exactly.
function requireCertificateApprover(req, res, next) {
    if (normalizeRole(req.user?.canonicalRole || req.user?.role) !== CANONICAL_ROLES.CERTIFICATE_APPROVER) {
        return res.status(403).json({ success: false, error: 'การพักใช้และเพิกถอนใบรับรองเป็นหน้าที่ของผู้อนุมัติใบรับรองเท่านั้น' });
    }
    return next();
}

const approverOnly = [authenticateProvider, requireCertificateApprover];

function sendActionError(res, error) {
    const status = Number(error?.status || error?.statusCode) || 500;
    if (status >= 500) {
        logger.error('[provider] certificate action failed', { message: error?.message });
        return res.status(500).json({ success: false, error: 'ระบบไม่สามารถบันทึกรายการนี้ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง' });
    }
    const messageTh = error.messageTh || error.message;
    return res.status(status).json({ success: false, code: error.code, error: messageTh, messageTh });
}

router.get('/approver', ...approverOnly, async (req, res) => {
    try {
        const items = await certificateActions.listForApprover({ actor: req.user });
        return res.json({
            success: true,
            data: {
                items,
                suspensionReasons: reasonOptions(CERTIFICATE_SUSPENSION_REASONS),
                revocationReasons: reasonOptions(CERTIFICATE_REVOCATION_REASONS),
            },
        });
    } catch (error) {
        return sendActionError(res, error);
    }
});

const ACTIONS = Object.freeze({
    suspensions: (req) => certificateActions.suspendCertificate({
        certificateRef: req.params.id, actor: req.user, reasonCode: req.body?.reasonCode, reasonText: req.body?.reasonText, note: req.body?.note,
    }),
    reinstatements: (req) => certificateActions.reinstateCertificate({
        certificateRef: req.params.id, actor: req.user, note: req.body?.note,
    }),
    revocations: (req) => certificateActions.revokeCertificate({
        certificateRef: req.params.id, actor: req.user, reasonCode: req.body?.reasonCode, reasonText: req.body?.reasonText, note: req.body?.note,
    }),
});

for (const [path, act] of Object.entries(ACTIONS)) {
    router.post(`/:id/${path}`, ...approverOnly, async (req, res) => {
        try {
            const cert = await act(req);
            return res.json({
                success: true,
                data: { id: cert.id, certificateNumber: cert.certificateNumber, status: cert.status },
            });
        } catch (error) {
            return sendActionError(res, error);
        }
    });
}

module.exports = router;

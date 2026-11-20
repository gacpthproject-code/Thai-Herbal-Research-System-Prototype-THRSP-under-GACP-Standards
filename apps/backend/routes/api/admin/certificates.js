/**
 * Admin certificate controls — the revision door (ฉบับแก้ไขภายใต้เลขเดิม, 2026-08-27).
 *
 * The admin revoke door that lived here was removed (order 34(4), operator 2026-10-07):
 * suspending and revoking a certificate is the certificate approver's decision, with a
 * reason from a fixed list (routes/api/provider/certificates.js).
 *
 * Mounted under /api/admin (routes/api/admin/index.js), so authenticateProvider
 * + requireAdmin (canonical ADMIN only) already ran before any handler here.
 *
 * ADMIN is a per-tenant role: this door always calls the service with the
 * caller's own organizationId and crossTenant:false. The service's ORG-GUARD
 * answers a cross-tenant or missing certificate with the same 404, so nothing
 * here can be used to probe another tenant's certificates.
 *
 * The revision door (docs/superpowers/specs/2026-08-27-certificate-revision-design.md §4)
 * follows the same shape: the admin never types register values. The
 * corrected province / district / subDistrict / address come from the Farm
 * row through certificateService.previewCertificateRevision (read only) and
 * certificateService.reviseCertificateFromFarm (archive + re-sign, one
 * transaction). This file validates the free-text reason, maps the service's
 * catalogued refusals (shared/error-codes.js) to HTTP, and records the
 * administrative act (ADMIN_CERTIFICATE_REVISED). The free-text reason is
 * the archived revision's record and is never copied into the admin audit.
 */

const express = require('express');
const router = express.Router();
const logger = require('../../../shared/logger');
const { getRequestIp } = require('../../../utils/client-ip');
const {
    auditLogger,
    AuditCategory,
    AuditSeverity,
    ResourceType,
} = require('../../../middleware/audit-logger');
const certificateService = require('../../../services/certificate-service');
const { safeErrorMessage } = require('../../../shared/api-response');
const { lookup: lookupErrorCode } = require('../../../shared/error-codes');

const REVISION_REASON_MAX_LENGTH = 500;

const MESSAGES = Object.freeze({
    NOT_FOUND: 'ไม่พบใบรับรองนี้ในหน่วยงานของคุณ กรุณาตรวจสอบเลขที่ใบรับรองแล้วลองใหม่อีกครั้ง',
    REVISE_SERVER_ERROR: 'ระบบไม่สามารถออกฉบับแก้ไขใบรับรองได้ในขณะนี้ กรุณาลองใหม่อีกครั้งในอีกสักครู่',
});

function toIso(value) {
    if (!value) { return null; }
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ── Revision door ──────────────────────────────────────────────────────────

/**
 * Answer with a catalogued refusal: the catalog row owns the HTTP status and
 * the Thai copy, so the door and the UI can never drift from each other.
 */
function catalogued(res, code, fallbackStatus, extra = {}) {
    const entry = lookupErrorCode(code);
    return res.status(entry?.httpStatus || fallbackStatus).json({
        success: false,
        error: code,
        message: entry?.messageTh || MESSAGES.REVISE_SERVER_ERROR,
        ...extra,
    });
}

/**
 * Map a service refusal from the revision path to HTTP.
 *   404                      → CERTIFICATE_NOT_FOUND (missing OR another tenant's)
 *   catalogued error.code    → the catalog's httpStatus + messageTh
 *                              (+ missingFields for CERTIFICATE_FARM_LOCATION_MISSING)
 *   anything else            → 500 CERTIFICATE_REVISE_FAILED through safeErrorMessage
 */
function revisionError(res, error) {
    const statusCode = Number(error?.statusCode);
    if (statusCode === 404) {
        return res.status(404).json({
            success: false,
            error: 'CERTIFICATE_NOT_FOUND',
            message: MESSAGES.NOT_FOUND,
        });
    }
    if (error?.code && lookupErrorCode(error.code)) {
        const extra = Array.isArray(error.missingFields) && error.missingFields.length
            ? { missingFields: error.missingFields }
            : {};
        return catalogued(res, error.code, statusCode || 500, extra);
    }
    logger.error('[admin/certificates] revise failed:', error?.message);
    return res.status(500).json({
        success: false,
        error: 'CERTIFICATE_REVISE_FAILED',
        message: safeErrorMessage(error, MESSAGES.REVISE_SERVER_ERROR),
    });
}

/**
 * GET /api/admin/certificates/:id/revise-location/preview
 *
 * Read only: runs the service's resolve + tenant wall + diff without writing,
 * so the UI can show the admin what the press would change.
 *
 * 200 { success:true, data:{ current:{province,district,subDistrict,address},
 *                            corrected:{...same 4 fields}, changed:string[] } }
 *     (a no-change preview is 200 with changed: [], never a 409)
 * 404 CERTIFICATE_NOT_FOUND · 409 CERTIFICATE_NOT_REVISABLE
 * 422 CERTIFICATE_FARM_LOCATION_MISSING (+ missingFields)
 */
router.get('/:id/revise-location/preview', async (req, res) => {
    const certificateId = String(req.params.id || '').trim();
    try {
        const data = await certificateService.previewCertificateRevision(certificateId, {
            callerOrganizationId: req.user?.organizationId || null,
            crossTenant: false,
        });
        return res.json({ success: true, data });
    } catch (error) {
        return revisionError(res, error);
    }
});

/**
 * POST /api/admin/certificates/:id/revise-location
 * body: { reason: string }  (trimmed, 1..500 chars)
 *
 * 400 REVISION_REASON_REQUIRED / REVISION_REASON_TOO_LONG (catalog rows)
 * 404 CERTIFICATE_NOT_FOUND
 * 409 CERTIFICATE_NOT_REVISABLE / CERTIFICATE_REVISION_NO_CHANGE / CERTIFICATE_REVISION_CONFLICT
 * 422 CERTIFICATE_FARM_LOCATION_MISSING (+ missingFields)
 * 503 CERT_SIGNING_UNAVAILABLE (nothing written)
 * 200 { success:true, data:{ id, certificateNumber, revisionNo, revisedAt, correctedFields } }
 */
router.post('/:id/revise-location', async (req, res) => {
    const certificateId = String(req.params.id || '').trim();
    const rawReason = req.body?.reason;
    const reason = typeof rawReason === 'string' ? rawReason.trim() : '';

    if (!reason) {
        return catalogued(res, 'REVISION_REASON_REQUIRED', 400);
    }
    if (reason.length > REVISION_REASON_MAX_LENGTH) {
        return catalogued(res, 'REVISION_REASON_TOO_LONG', 400);
    }

    const actorId = String(req.user?.id || 'SYSTEM');
    const callerOrganizationId = req.user?.organizationId || null;

    try {
        const { certificate, correctedFields } = await certificateService.reviseCertificateFromFarm(certificateId, {
            reason,
            actorId,
            callerOrganizationId,
            crossTenant: false,
        });

        // The administrative act, alongside the service's lifecycle row
        // (CERTIFICATE_REVISED). Metadata carries the register facts only:
        // certificate number, the new revision number, and which fields
        // moved. The free-text reason stays on the archived revision.
        // Best-effort: the revision is already committed, so a logging outage
        // is reported in the log, not turned into a misleading 500.
        try {
            await auditLogger.log({
                category: AuditCategory.ADMIN,
                action: 'ADMIN_CERTIFICATE_REVISED',
                severity: AuditSeverity.WARNING,
                actorId,
                actorRole: req.user?.role || 'UNKNOWN',
                actorType: 'ADMIN',
                resourceType: ResourceType.CERTIFICATE,
                resourceId: certificate.id,
                organizationId: certificate.organizationId || callerOrganizationId,
                ipAddress: getRequestIp(req),
                userAgent: req.get('user-agent'),
                metadata: {
                    certificateNumber: certificate.certificateNumber,
                    revisionNo: certificate.revisionNo,
                    correctedFields,
                },
            });
        } catch (auditError) {
            logger.warn('[admin/certificates] ADMIN_CERTIFICATE_REVISED audit write failed:', auditError?.message);
        }

        return res.status(200).json({
            success: true,
            data: {
                id: certificate.id,
                certificateNumber: certificate.certificateNumber,
                revisionNo: certificate.revisionNo,
                revisedAt: toIso(certificate.revisedAt),
                correctedFields,
            },
        });
    } catch (error) {
        return revisionError(res, error);
    }
});

module.exports = router;

'use strict';

/**
 * Dataset routes — สัญญา C05F680149 ภาคผนวก 4 ข้อ 3
 * ชุดข้อมูลดิบ (API/CSV) + คู่มือการใช้ชุดข้อมูล สำหรับคลังข้อมูลวิจัยของโครงการ
 * Mounted at /api/datasets (routes/api/index.js).
 *
 * RBAC: catalog + dictionary = any provider role (read-only metadata; the
 * catalog says whether the caller may export). Every export (one domain, a
 * deletion list, the full bundle) = system_admin_dtam only, its own
 * organization only (order 17). An export leaves only once its audit row is
 * written (fail closed) and is never stored by a cache. Identifiers leave as
 * pseudonyms (dataset-export-service).
 */

const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const datasetService = require('../../../services/dataset-export-service');
const { authenticateProvider } = require('../../../middleware/auth-middleware');
const { normalizeRole, CANONICAL_ROLES } = require('../../../shared/canonical-rbac');
const { auditLogger, AuditCategory, AuditSeverity, ResourceType } = require('../../../middleware/audit-logger');
const { safeErrorMessage } = require('../../../shared/api-response');
const logger = require('../../../shared/logger');
const { getRequestIp } = require('../../../utils/client-ip');
const { organizationScope, answerNoOrganization, DENY_ALL } = require('../../../shared/application-visibility');
const { ERROR_CODES } = require('../../../shared/error-codes');

const mayExport = (user) => normalizeRole(user?.canonicalRole || user?.role) === CANONICAL_ROLES.SYSTEM_ADMIN_DTAM;

/** Export responses carry research data: no browser or proxy may keep a copy, refusals included. */
function noStore(req, res, next) {
    res.setHeader('Cache-Control', 'no-store');
    next();
}

function requireAdmin(req, res, next) {
    if (!mayExport(req.user)) {
        const row = ERROR_CODES.DATASET_EXPORT_FORBIDDEN;
        return res.status(row.httpStatus).json({ success: false, error: row.code, message: row.messageTh });
    }
    next();
}

function sendError(res, error, fallbackMessage) {
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    if (statusCode >= 500) {
        logger.error(`[Datasets] ${fallbackMessage}:`, error);
    }
    res.status(statusCode).json({
        success: false,
        error: error.code || 'DATASET_REQUEST_FAILED',
        message: statusCode >= 500 ? fallbackMessage : safeErrorMessage(error),
    });
}

/** GET /api/datasets — catalog of raw-data domains */
router.get('/', authenticateProvider, (req, res) => {
    const domains = datasetService.listDomains();
    res.json({ success: true, count: domains.length, data: { canExport: mayExport(req.user), domains } });
});

/** GET /api/datasets/dictionary — คู่มือการใช้ชุดข้อมูล (markdown) */
router.get('/dictionary', authenticateProvider, (req, res) => {
    const markdown = datasetService.generateDataDictionaryMarkdown();
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.status(200).send(markdown);
});

/**
 * Audit metadata strings pass through the audit logger's national-ID mask,
 * which rewrites any run of exactly 13 digits: 1.75% of hex sha256 values and
 * 0.23% of 16-hex fingerprints hold one (measured over 200,000 random values).
 * So a digest is recorded in SRI form (sha256-<base64>) and the key
 * fingerprint in groups of four hex digits joined by ':' (strip the ':' to
 * compare it with manifest.json).
 */
const sriOf = (hexDigest) => `sha256-${Buffer.from(hexDigest, 'hex').toString('base64')}`;
const sha256Sri = (data) => `sha256-${crypto.createHash('sha256').update(data).digest('base64')}`;
const grouped = (fingerprint) => fingerprint.match(/.{1,4}/g).join(':');

/**
 * The audit row of one export, or a refusal: auditLogger.log answers null
 * when it could not write, and an export nobody can trace back must not leave.
 */
async function stampExport(req, action, resourceId, metadata) {
    const row = await auditLogger.log({
        category: AuditCategory.ADMIN,
        action,
        severity: AuditSeverity.INFO,
        actorId: req.user?.id,
        actorEmail: req.user?.email || null,
        actorRole: normalizeRole(req.user?.canonicalRole || req.user?.role),
        resourceType: ResourceType.SYSTEM,
        resourceId,
        ipAddress: getRequestIp(req),
        userAgent: req.headers['user-agent'],
        metadata,
    }).catch(() => null);
    if (!row) {
        const refusal = ERROR_CODES.DATASET_EXPORT_AUDIT_FAILED;
        throw Object.assign(new Error(refusal.messageEn), { statusCode: refusal.httpStatus, code: refusal.code });
    }
}

/**
 * Runs one export for the admin's own organization, audits what leaves
 * (format, rows, sha256 of the exact bytes, key fingerprint), then answers.
 */
function exportDoor(action, produce) {
    return async (req, res) => {
        const scope = organizationScope(req.user);
        if (scope === DENY_ALL) {
            return answerNoOrganization(res);
        }
        try {
            const { resourceId, format, filename, contentType, body, audit } = await produce(req, scope);
            const { keyFingerprint, manifestSha256, ...counts } = audit;
            await stampExport(req, action, resourceId, {
                format, ...counts, sha256: sha256Sri(body),
                ...(manifestSha256 ? { manifestSha256: sriOf(manifestSha256) } : {}),
                keyFingerprint: grouped(keyFingerprint),
            });
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            return res.status(200).send(body);
        } catch (error) {
            return sendError(res, error, 'Failed to export dataset');
        }
    };
}

const formatOf = (req) => String(req.query.format || 'csv').toLowerCase();
const textType = (format) => (format === 'jsonl' ? 'application/x-ndjson; charset=utf-8' : 'text/csv; charset=utf-8');

/** GET /api/datasets/bundle — the full set as one ZIP with manifest.json (ADMIN, own organization) */
router.get('/bundle', noStore, authenticateProvider, requireAdmin, exportDoor('DATASET_BUNDLE_EXPORTED', async (req, scope) => {
    const { zip, manifest, manifestSha256 } = await datasetService.exportBundle({ scope });
    const day = manifest.exportedAt.slice(0, 10).replace(/-/g, '');
    const rows = Object.fromEntries(manifest.files.filter(f => f.rows !== null).map(f => [f.path, f.rows]));
    return {
        resourceId: 'bundle', format: 'zip', filename: `gacp-research-dataset-${day}.zip`, contentType: 'application/zip', body: zip,
        audit: { rows, manifestSha256, keyFingerprint: manifest.pseudonymKeyFingerprint },
    };
}));

/** GET /api/datasets/:domain/export?format=csv|jsonl — one domain (ADMIN, own organization) */
router.get('/:domain/export', noStore, authenticateProvider, requireAdmin, exportDoor('DATASET_EXPORTED', async (req, scope) => {
    const format = formatOf(req);
    const { body, rows, keyFingerprint } = await datasetService.exportDomain(req.params.domain, format, { scope });
    return {
        resourceId: req.params.domain, format, filename: `gacp-dataset-${req.params.domain}.${format}`, contentType: textType(format), body,
        audit: { rows, keyFingerprint },
    };
}));

/**
 * GET /api/datasets/:domain/:list?format=csv|jsonl — the pseudonyms the project
 * research data store deletes by: survey-responses/withdrawn, harvest-batches/deleted
 * (ADMIN, own organization)
 */
router.get('/:domain/:list(withdrawn|deleted)', noStore, authenticateProvider, requireAdmin, exportDoor('DATASET_DELETION_LIST_EXPORTED', async (req, scope) => {
    const format = formatOf(req);
    const key = `${req.params.domain}/${req.params.list}`;
    const { body, rows, keyFingerprint } = await datasetService.exportList(key, format, { scope });
    return {
        resourceId: key, format, filename: `gacp-dataset-${req.params.domain}-${req.params.list}.${format}`, contentType: textType(format), body,
        audit: { rows, keyFingerprint },
    };
}));

module.exports = router;

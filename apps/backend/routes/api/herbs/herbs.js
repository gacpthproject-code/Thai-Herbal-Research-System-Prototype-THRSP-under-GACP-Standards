'use strict';

/**
 * Herb Knowledge routes — สัญญา C05F680149 ต้นแบบที่ 5
 * "ฐานข้อมูลสมุนไพรไทย 6 ฐานข้อมูล" (มี API). Mounted at /api/herbs.
 *
 * Public reads (reference data, no auth) + ADMIN-only writes
 * (authenticateProvider + requireAdmin) with per-write audit stamp — mirrors
 * the survey/admin master-data pattern. Global reference model (no tenant
 * scope), so no organizationId handling here.
 */

const express = require('express');
const router = express.Router();
const herbService = require('../../../services/herb-knowledge-service');
const { authenticateProvider } = require('../../../middleware/auth-middleware');
const { requireAdmin } = require('../../../middleware/require-admin');
const { auditLogger, AuditCategory, AuditSeverity, ResourceType } = require('../../../middleware/audit-logger');
const { normalizeRole } = require('../../../shared/canonical-rbac');
const { safeErrorMessage } = require('../../../shared/api-response');
const logger = require('../../../shared/logger');
const { getRequestIp } = require('../../../utils/client-ip');

function sendError(res, error, fallback) {
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    if (statusCode >= 500) {
        logger.error(`[Herbs] ${fallback}:`, error);
    }
    res.status(statusCode).json({
        success: false,
        error: error.code || 'HERB_REQUEST_FAILED',
        message: statusCode >= 500 ? fallback : safeErrorMessage(error),
    });
}

async function emitAudit(req, action, resourceId, metadata) {
    try {
        await auditLogger.log({
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
        });
    } catch (error) {
        logger.error('[Herbs] audit stamp failed (non-fatal):', error);
    }
}

// ── Public reads ────────────────────────────────────────────────────

/**
 * @swagger
 * /api/herbs:
 *   get:
 *     tags: [Herbs]
 *     summary: List the six herb databases with entry counts
 *     description: Public, no token. Each herb carries entryCount (all active entries) and citedCount (entries whose source links a document).
 *     parameters:
 *       - in: query
 *         name: activeOnly
 *         schema: { type: string, enum: ['true'] }
 *         description: Only herbs marked active
 *     responses:
 *       200:
 *         description: "{ success, count, data: [{ code, nameTH, nameEN, scientificName, familyName, isPrimary, isControlled, entryCount, citedCount }] }"
 */
router.get('/', async (req, res) => {
    try {
        const species = await herbService.listSpecies({ activeOnly: req.query.activeOnly === 'true' });
        res.json({ success: true, count: species.length, data: species });
    } catch (error) {
        sendError(res, error, 'Failed to list herbs');
    }
});

/**
 * @swagger
 * /api/herbs/coverage:
 *   get:
 *     tags: [Herbs]
 *     summary: Entry count per herb against the 300-entry target, and how many cite a document
 *     responses:
 *       200:
 *         description: "{ success, data: { target, totalHerbs, herbsMeetingTarget, totalEntries, totalCited, herbs: [{ code, nameTH, count, cited, meets300 }] } }"
 */
router.get('/coverage', async (req, res) => {
    try {
        const stats = await herbService.getCoverageStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        sendError(res, error, 'Failed to compute herb coverage');
    }
});

/**
 * @swagger
 * /api/herbs/{code}:
 *   get:
 *     tags: [Herbs]
 *     summary: One herb database
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema: { type: string, enum: [CANNABIS, TURMERIC, GINGER, BLACK_GALINGALE, PLAI, KRATOM] }
 *         description: Case-insensitive
 *     responses:
 *       200:
 *         description: The herb with entryCount and citedCount
 *       404:
 *         description: HERB_NOT_FOUND
 */
router.get('/:code', async (req, res) => {
    try {
        const species = await herbService.getSpecies(req.params.code);
        res.json({ success: true, data: species });
    } catch (error) {
        sendError(res, error, 'Failed to fetch herb');
    }
});

/**
 * @swagger
 * /api/herbs/{code}/entries:
 *   get:
 *     tags: [Herbs]
 *     summary: Knowledge entries of one herb, paginated
 *     description: |
 *       A cited entry's source reads "<document> · <url> · เข้าถึง <YYYY-MM-DD>". Entries whose source starts
 *       with AI_DRAFT are drafts that no one has checked against a source.
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: category
 *         schema: { type: string, enum: [VARIETY, ACTIVE_COMPOUND, CULTIVATION, HARVEST, PROCESSING, DISEASE, LEGAL, GENERAL] }
 *       - in: query
 *         name: cited
 *         schema: { type: string, enum: ['true'] }
 *         description: Only entries whose source links a document
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, minimum: 1, maximum: 200, default: 50 }
 *     responses:
 *       200:
 *         description: "{ success, data: { herbCode, page, pageSize, total, entries: [{ id, category, title, content, valueNumber, unit, source }] } }"
 *       404:
 *         description: HERB_NOT_FOUND
 */
router.get('/:code/entries', async (req, res) => {
    try {
        const result = await herbService.listEntries(req.params.code, {
            category: req.query.category,
            citedOnly: req.query.cited === 'true',
            page: req.query.page ? Number(req.query.page) : 1,
            pageSize: req.query.pageSize ? Number(req.query.pageSize) : 50,
        });
        res.json({ success: true, data: result });
    } catch (error) {
        sendError(res, error, 'Failed to list herb entries');
    }
});

// ── ADMIN writes ────────────────────────────────────────────────────

/** POST /api/herbs/:code/entries — create one entry */
router.post('/:code/entries', authenticateProvider, requireAdmin, async (req, res) => {
    try {
        const entry = await herbService.createEntry(req.params.code, req.body, {
            actor: { id: req.user?.id },
        });
        await emitAudit(req, 'HERB_ENTRY_CREATED', entry.id, { herbCode: req.params.code, category: entry.category });
        res.status(201).json({ success: true, data: entry });
    } catch (error) {
        sendError(res, error, 'Failed to create herb entry');
    }
});

/** POST /api/herbs/:code/entries/import — bulk load (SSRU content) */
router.post('/:code/entries/import', authenticateProvider, requireAdmin, async (req, res) => {
    if (!Array.isArray(req.body?.rows)) {
        return res.status(400).json({
            success: false,
            error: 'INVALID_IMPORT_PAYLOAD',
            message: 'Body must be { rows: [...] }',
        });
    }
    try {
        const result = await herbService.bulkImportEntries(req.params.code, req.body.rows, {
            actor: { id: req.user?.id },
        });
        await emitAudit(req, 'HERB_ENTRIES_IMPORTED', req.params.code, {
            imported: result.imported, skipped: result.skipped,
        });
        res.json({ success: true, data: result });
    } catch (error) {
        sendError(res, error, 'Failed to import herb entries');
    }
});

/** PATCH /api/herbs/:code/entries/:id — update one entry */
router.patch('/:code/entries/:id', authenticateProvider, requireAdmin, async (req, res) => {
    try {
        const entry = await herbService.updateEntry(req.params.id, req.body);
        await emitAudit(req, 'HERB_ENTRY_UPDATED', entry.id, { herbCode: req.params.code });
        res.json({ success: true, data: entry });
    } catch (error) {
        sendError(res, error, 'Failed to update herb entry');
    }
});

/** DELETE /api/herbs/:code/entries/:id — delete one entry */
router.delete('/:code/entries/:id', authenticateProvider, requireAdmin, async (req, res) => {
    try {
        const result = await herbService.deleteEntry(req.params.id);
        await emitAudit(req, 'HERB_ENTRY_DELETED', req.params.id, { herbCode: req.params.code });
        res.json({ success: true, data: result });
    } catch (error) {
        sendError(res, error, 'Failed to delete herb entry');
    }
});

module.exports = router;

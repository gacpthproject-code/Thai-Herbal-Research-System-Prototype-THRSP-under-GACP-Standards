const express = require('express');
const { safeErrorMessage } = require('../../../shared/api-response');
const router = express.Router();
const standardsAnalyzer = require('../../../services/standards-analyzer-service');
const { authenticateAny, authenticateProvider } = require('../../../middleware/auth-middleware');
const { normalizeRole } = require('../../../shared/canonical-rbac');
const { organizationScope, answerNoOrganization, DENY_ALL } = require('../../../shared/application-visibility');
const { isApplicationVisibleTo } = require('../../../middleware/require-visible-application');
const { ERROR_CODES } = require('../../../shared/error-codes');
const logger = require('../../../shared/logger');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/standards
 * The three standards the analyzer compares, each with the documents it was read from.
 * Public reference content, no PII.
 */
router.get('/', (req, res) => {
    const { standards } = standardsAnalyzer.getComparison();
    res.json({ success: true, count: standards.length, data: standards });
});

/**
 * GET /api/standards/comparison
 * สัญญา C05F680149 ต้นแบบที่ 1 — ไทย · WHO · ASEAN เทียบทีละหัวข้อ พร้อมเลขข้อ แหล่งอ้างอิง
 * และสิ่งที่ผู้ผ่านมาตรฐานไทยต้องทำเพิ่ม Staff only (authenticateProvider), the same door
 * the rest of /provider/standards uses; the page and its CSV link send the provider cookie.
 */
router.get('/comparison', authenticateProvider, (req, res) => {
    res.json({ success: true, data: standardsAnalyzer.getComparison() });
});

/** GET /api/standards/comparison/export.csv — the same table for a spreadsheet. */
router.get('/comparison/export.csv', authenticateProvider, (req, res) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="gacp-standards-comparison.csv"');
    res.send(standardsAnalyzer.comparisonCsv());
});

/**
 * GET /api/standards/asean/comparison
 * สัญญา C05F680149 ต้นแบบที่ 1.3 — ตารางเปรียบเทียบ 10 ประเทศอาเซียน (ฉบับร่าง)
 * NOTE: must be declared BEFORE the parameterized /:code route.
 */
router.get('/asean/comparison', (req, res) => {
    const rows = standardsAnalyzer.getAseanComparison();
    res.json({
        success: true,
        count: rows.length,
        data: rows,
        note: 'ฉบับร่าง เรียบเรียงเมื่อ ก.ค. 2569 ยังไม่ได้ตรวจกับแหล่งทางการของแต่ละประเทศ',
    });
});

/**
 * GET /api/standards/:code/analyze/:applicationId
 * สัญญา C05F680149 ต้นแบบที่ 1.1/1.2 — gap analysis ของคำขอหนึ่งใบเทียบมาตรฐาน
 * (WHO / THAI_GACP / ASEAN / FDA).
 * Who may read: a health caller within its holder scope; staff inside their own
 * organization (order 17; system_admin_platform crosses organizations, ADR-014) and only
 * the rows their role works (isApplicationVisibleTo: reviewer/inspector by assignment,
 * dispatcher/approver by lifecycle slice, DTAM admin organization-wide, finance never).
 */
router.get('/:code/analyze/:applicationId', authenticateAny, async (req, res) => {
    const { code, applicationId } = req.params;

    if (!UUID_RE.test(applicationId)) {
        return res.status(400).json({
            success: false,
            error: 'INVALID_APPLICATION_ID',
            message: 'applicationId must be a UUID',
        });
    }

    try {
        const actor = {
            role: normalizeRole(req.user?.canonicalRole || req.user?.role),
            canonicalId: req.user?.canonicalId,
        };
        // Spec 2026-09-30 §3.1: a health caller reads within its holder scope.
        let holderScope = null;
        let organizationWhere = null;
        if (actor.role === 'health') {
            holderScope = await require('../../../services/holder-access').holderScope(req);
        } else {
            organizationWhere = organizationScope(req.user);
            if (organizationWhere === DENY_ALL) { return answerNoOrganization(res); }
            if (!await isApplicationVisibleTo(req.user, applicationId)) {
                const row = ERROR_CODES.APPLICATION_NOT_FOUND;
                return res.status(row.httpStatus).json({ success: false, error: row.code, message: row.messageTh });
            }
        }
        const result = await standardsAnalyzer.analyzeApplication(applicationId, code, { actor, holderScope, organizationWhere });
        res.json({ success: true, data: result });
    } catch (error) {
        const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
        if (statusCode >= 500) {
            logger.error('[StandardsAnalyzer] analyze failed:', error);
        }
        res.status(statusCode).json({
            success: false,
            error: error.code || 'STANDARDS_ANALYZE_FAILED',
            message: statusCode >= 500 ? 'Failed to analyze application' : safeErrorMessage(error),
        });
    }
});

module.exports = router;

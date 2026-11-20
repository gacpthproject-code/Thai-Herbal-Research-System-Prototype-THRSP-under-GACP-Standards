'use strict';

/**
 * Survey routes — สัญญา C05F680149 ต้นแบบที่ 2 "ระบบสำรวจความต้องการ (1 ชุด)"
 * Mounted at /api/surveys (routes/api/index.js).
 *
 * RBAC (operator order 34(5) + order 17, 2026-10-07):
 *   - Template master data + interview records (mutations) = system_admin_dtam
 *   - Raw answers (CSV export) + interviews                 = system_admin_dtam
 *   - Templates + aggregate statistics                      = any provider role
 *     (small cells hidden, see survey-service.getTemplateStats)
 *   - Every provider read is filtered to the caller's own organization here,
 *     not only by the tenant extension; only system_admin_platform crosses
 *     organizations, and it still reads aggregates only. No organization = deny.
 *   - Respondent surface (/active, research notice, submit, withdraw)
 *     = authenticateAny; a response needs the current research consent, an
 *     account the template's target group admits (survey-service
 *     RESPONDENT_RULES), and is one per account per template.
 * Admin mutations are audit-stamped via auditLogger.log (non-fatal, mirrors
 * admin-work-config.js).
 */

const express = require('express');
const router = express.Router();
const surveyService = require('../../../services/survey-service');
const stakeholderInsights = require('../../../services/stakeholder-insight-service');
const { authenticateAny, authenticateProvider } = require('../../../middleware/auth-middleware');
const { normalizeRole, CANONICAL_ROLES } = require('../../../shared/canonical-rbac');
const { auditLogger, AuditCategory, AuditSeverity, ResourceType } = require('../../../middleware/audit-logger');
const { safeErrorMessage } = require('../../../shared/api-response');
const { lookup } = require('../../../shared/error-codes');
const { organizationScope, answerNoOrganization, DENY_ALL } = require('../../../shared/application-visibility');
const { RESEARCH_CONSENT_NOTICE } = require('../../../shared/research-consent-notice');
const logger = require('../../../shared/logger');
const { getRequestIp } = require('../../../utils/client-ip');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function actorOf(req) {
    return {
        id: req.user?.id,
        role: normalizeRole(req.user?.canonicalRole || req.user?.role),
        canonicalId: req.user?.canonicalId,
        organizationId: req.user?.organizationId,
    };
}

function isOrganizationAdmin(req) {
    return normalizeRole(req.user?.canonicalRole || req.user?.role) === CANONICAL_ROLES.SYSTEM_ADMIN_DTAM;
}

function requireAdmin(req, res, next) {
    if (!isOrganizationAdmin(req)) {
        return res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: 'Only the DTAM system admin can access survey master data and insights',
        });
    }
    next();
}

function requireUuidParam(name) {
    return (req, res, next) => {
        if (!UUID_RE.test(req.params[name])) {
            return res.status(400).json({
                success: false,
                error: 'INVALID_ID',
                message: `${name} must be a UUID`,
            });
        }
        next();
    };
}

/** The caller's organization as a where-fragment; answers and returns null when there is none. */
function scopeOrDeny(req, res) {
    const scope = organizationScope(req.user);
    if (scope === DENY_ALL) {
        answerNoOrganization(res);
        return undefined;
    }
    return scope;
}

function sendError(res, error, fallbackMessage) {
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    if (statusCode >= 500) {
        logger.error(`[Surveys] ${fallbackMessage}:`, error);
    }
    const row = statusCode < 500 && typeof error.code === 'string' ? lookup(error.code) : undefined;
    res.status(statusCode).json({
        success: false,
        error: error.code || 'SURVEY_REQUEST_FAILED',
        message: statusCode >= 500 ? fallbackMessage : safeErrorMessage(error),
        ...(row?.messageTh ? { messageTh: row.messageTh } : {}),
    });
}

/** Non-fatal admin-mutation audit stamp (mirrors admin-work-config.js). */
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
        logger.error('[Surveys] audit stamp failed (non-fatal):', error);
    }
}

// ── Respondent surface (authenticateAny) — declare BEFORE param routes ──

/** GET /api/surveys/active — open templates the caller may answer, each with alreadyAnswered */
router.get('/active', authenticateAny, async (req, res) => {
    try {
        const templates = await surveyService.listActiveTemplates({ actor: actorOf(req) });
        res.json({ success: true, count: templates.length, data: templates });
    } catch (error) {
        sendError(res, error, 'Failed to list active surveys');
    }
});

/** GET /api/surveys/research-consent — the notice a respondent reads and accepts before answering */
router.get('/research-consent', authenticateAny, (req, res) => {
    res.json({ success: true, data: RESEARCH_CONSENT_NOTICE });
});

/** POST /api/surveys/research-consent/withdraw — the respondent withdraws consent for all their answers */
router.post('/research-consent/withdraw', authenticateAny, async (req, res) => {
    try {
        const result = await surveyService.withdrawResearchConsent(req.user?.id);
        res.json({ success: true, data: result });
    } catch (error) {
        sendError(res, error, 'Failed to withdraw research consent');
    }
});

/** POST /api/surveys/templates/:templateId/responses — submit (posted document) */
router.post('/templates/:templateId/responses', authenticateAny, requireUuidParam('templateId'), async (req, res) => {
    try {
        const response = await surveyService.submitResponse(
            req.params.templateId, req.body, { actor: actorOf(req) },
        );
        res.status(201).json({ success: true, data: response });
    } catch (error) {
        sendError(res, error, 'Failed to submit survey response');
    }
});

// ── Template master data (provider) ─────────────────────────────────

/** POST /api/surveys/templates — create (ADMIN) */
router.post('/templates', authenticateProvider, requireAdmin, async (req, res) => {
    try {
        const template = await surveyService.createTemplate(req.body, { actor: actorOf(req) });
        await emitAudit(req, 'SURVEY_TEMPLATE_CREATED', template.id, { code: template.code });
        res.status(201).json({ success: true, data: template });
    } catch (error) {
        sendError(res, error, 'Failed to create survey template');
    }
});

/** POST /api/surveys/templates/:templateId/activate — DRAFT→ACTIVE (ADMIN) */
router.post('/templates/:templateId/activate', authenticateProvider, requireAdmin, requireUuidParam('templateId'), async (req, res) => {
    try {
        const scope = scopeOrDeny(req, res);
        if (scope === undefined) { return; }
        await surveyService.getTemplate(req.params.templateId, { scope });
        const template = await surveyService.activateTemplate(req.params.templateId);
        await emitAudit(req, 'SURVEY_TEMPLATE_ACTIVATED', template.id, { status: template.status });
        res.json({ success: true, data: template });
    } catch (error) {
        sendError(res, error, 'Failed to activate survey template');
    }
});

/** POST /api/surveys/templates/:templateId/close — ACTIVE→CLOSED (ADMIN) */
router.post('/templates/:templateId/close', authenticateProvider, requireAdmin, requireUuidParam('templateId'), async (req, res) => {
    try {
        const scope = scopeOrDeny(req, res);
        if (scope === undefined) { return; }
        await surveyService.getTemplate(req.params.templateId, { scope });
        const template = await surveyService.closeTemplate(req.params.templateId);
        await emitAudit(req, 'SURVEY_TEMPLATE_CLOSED', template.id, { status: template.status });
        res.json({ success: true, data: template });
    } catch (error) {
        sendError(res, error, 'Failed to close survey template');
    }
});

/** GET /api/surveys/templates — list (any provider role) */
router.get('/templates', authenticateProvider, async (req, res) => {
    try {
        const scope = scopeOrDeny(req, res);
        if (scope === undefined) { return; }
        const templates = await surveyService.listTemplates({ status: req.query.status, scope });
        res.json({ success: true, count: templates.length, data: templates });
    } catch (error) {
        sendError(res, error, 'Failed to list survey templates');
    }
});

/** GET /api/surveys/templates/:templateId — detail with questions */
router.get('/templates/:templateId', authenticateProvider, requireUuidParam('templateId'), async (req, res) => {
    try {
        const scope = scopeOrDeny(req, res);
        if (scope === undefined) { return; }
        const template = await surveyService.getTemplate(req.params.templateId, { scope });
        res.json({ success: true, data: template });
    } catch (error) {
        sendError(res, error, 'Failed to fetch survey template');
    }
});

/** GET /api/surveys/templates/:templateId/stats — aggregates + text-mining 3.1 (small cells hidden except for the admin) */
router.get('/templates/:templateId/stats', authenticateProvider, requireUuidParam('templateId'), async (req, res) => {
    try {
        const scope = scopeOrDeny(req, res);
        if (scope === undefined) { return; }
        const stats = await surveyService.getTemplateStats(req.params.templateId, {
            scope, aggregateOnly: !isOrganizationAdmin(req),
        });
        res.json({ success: true, data: stats });
    } catch (error) {
        sendError(res, error, 'Failed to compute survey stats');
    }
});

/** GET /api/surveys/templates/:templateId/export — raw answers as CSV (formula-guarded, BOM) (ADMIN) */
router.get('/templates/:templateId/export', authenticateProvider, requireAdmin, requireUuidParam('templateId'), async (req, res) => {
    try {
        const scope = scopeOrDeny(req, res);
        if (scope === undefined) { return; }
        const csv = await surveyService.exportResponsesCsv(req.params.templateId, { scope });
        await emitAudit(req, 'SURVEY_RESPONSES_EXPORTED', req.params.templateId, { format: 'csv' });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="survey-${req.params.templateId}.csv"`);
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).send(csv);
    } catch (error) {
        sendError(res, error, 'Failed to export survey responses');
    }
});

// ── Stakeholder insight (ต้นแบบ 3) ──────────────────────────────────

/**
 * GET /api/surveys/insights?basis=SYSTEM|CORPUS — keywords, need themes and an extractive
 * summary over the organization's free-text answers and interview transcripts, or over the
 * published-statement corpus (ADMIN: free text is the admin's only, as in the stats door).
 */
router.get('/insights', authenticateProvider, requireAdmin, async (req, res) => {
    try {
        const scope = scopeOrDeny(req, res);
        if (scope === undefined) { return; }
        const basis = typeof req.query.basis === 'string' && req.query.basis !== '' ? req.query.basis.toUpperCase() : null;
        const insights = await stakeholderInsights.getStakeholderInsights({ basis, scope });
        if (insights.basis === stakeholderInsights.BASIS.SYSTEM) {
            await emitAudit(req, 'STAKEHOLDER_INSIGHTS_VIEWED', null, { documents: insights.documentCount });
        }
        res.json({ success: true, data: insights });
    } catch (error) {
        sendError(res, error, 'Failed to analyze stakeholder text');
    }
});

// ── Expert interviews (ต้นแบบ 2.2) ──────────────────────────────────

/** POST /api/surveys/interviews — record an interview (ADMIN) */
router.post('/interviews', authenticateProvider, requireAdmin, async (req, res) => {
    try {
        const interview = await surveyService.createInterview(req.body, { actor: actorOf(req) });
        await emitAudit(req, 'EXPERT_INTERVIEW_RECORDED', interview.id, { title: req.body?.title });
        res.status(201).json({ success: true, data: interview });
    } catch (error) {
        sendError(res, error, 'Failed to record interview');
    }
});

/** GET /api/surveys/interviews — list (ADMIN, own organization) */
router.get('/interviews', authenticateProvider, requireAdmin, async (req, res) => {
    try {
        const scope = scopeOrDeny(req, res);
        if (scope === undefined) { return; }
        const interviews = await surveyService.listInterviews({ scope });
        res.json({ success: true, count: interviews.length, data: interviews });
    } catch (error) {
        sendError(res, error, 'Failed to list interviews');
    }
});

/** POST /api/surveys/interviews/:interviewId/anonymise — the interviewee withdrew consent (ADMIN) */
router.post('/interviews/:interviewId/anonymise', authenticateProvider, requireAdmin, requireUuidParam('interviewId'), async (req, res) => {
    try {
        const scope = scopeOrDeny(req, res);
        if (scope === undefined) { return; }
        const interview = await surveyService.anonymiseInterview(req.params.interviewId, { scope });
        await emitAudit(req, 'EXPERT_INTERVIEW_ANONYMISED', interview.id, {});
        res.json({ success: true, data: interview });
    } catch (error) {
        sendError(res, error, 'Failed to anonymise interview');
    }
});

module.exports = router;

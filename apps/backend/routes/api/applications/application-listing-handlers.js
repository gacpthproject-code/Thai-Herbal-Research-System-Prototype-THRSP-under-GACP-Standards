/**
 * Application Listing & Tracking Routes
 * Extracted from applications.js for readability.
 *
 * Routes: GET /, GET /my, GET /my/statuses, GET /:id/status, GET /:id/history
 *
 * @module routes/api/applications/application-listing-handlers
 */

const express = require('express');
const router = express.Router();
const applicationService = require('../../../services/application-service');
const { authenticateAny: authenticateHealth } = require('../../../middleware/auth-middleware');
const { prisma } = require('../../../services/prisma-database');
const logger = require('../../../shared/logger');
const { normalizeRole, isProviderRole } = require('../../../shared/canonical-rbac');
const { withVisibility } = require('../../../shared/application-visibility');
const {
    mapHealthApplication,
    mapMyApplication,
    getHealthScopeOptions,
} = require('../helpers/applications-helpers');
const {
    _asObject,
    isMissingApplicationCommentsTableError,
} = require('../helpers/application-constants');
const {
    buildApplicationHistoryPayload,
    buildTrackingPayload,
} = require('../helpers/application-payload-builders');
const { respondError } = require('../../../shared/api-response');
// Spec 2026-09-30 §3.1: every health read spreads the holder fragment, called
// inside the handler (after authentication).
const { holderScope, financialHolderScope, holderReadWhere } = require('../../../services/holder-access');

// LISTING & TRACKING

router.get('/', authenticateHealth, async (req, res) => {
    try {
        const hasHealthId = String(req.user?.healthId || '').trim();
        if (!hasHealthId) {
            // Staff branch. Each role reads only the rows the one visibility filter grants it,
            // the same rows its /api/provider/applications doors return.
            const canonicalRole = normalizeRole(req.user?.canonicalRole || req.user?.role);
            if (!canonicalRole || !isProviderRole(canonicalRole)) {
                logger.warn('[Applications List] Provider-branch access denied', {
                    userId: req.user?.id,
                    canonicalRole,
                });
                return res.status(403).json({
                    success: false,
                    error: 'Forbidden',
                    code: 'PROVIDER_ROLE_REQUIRED',
                });
            }
            const allApps = await prisma.application.findMany({
                where: withVisibility({ isDeleted: false }, req.user),
                orderBy: { createdAt: 'desc' },
                take: 100,
                include: { certificates: { select: { id: true } } },
            });
            return res.json({ success: true, data: allApps.map((app) => mapHealthApplication(app)), viewType: 'provider' });
        }
        const applications = await applicationService.getHealthApplications(req.user.id, { holderScope: await holderScope(req) });
        res.json({ success: true, data: applications.map((app) => mapHealthApplication(app)) });
    } catch (error) {
        logger.error('[Applications List] Error:', error);
        return respondError(res, req, error, { message: 'Failed to fetch list' });
    }
});

router.get('/my', authenticateHealth, async (req, res) => {
    try {
        if (!String(req.user?.healthId || '').trim()) { return res.status(403).json({ success: false, error: 'Health healthId is required' }); }
        const limit = Number.parseInt(String(req.query.limit || ''), 10);
        const applications = await applicationService.getHealthApplications(req.user.id, { take: Number.isFinite(limit) && limit > 0 ? limit : undefined, holderScope: await holderScope(req) });
        res.json({
            success: true,
            // round 4: no `fees` — see applications-helpers.mapMyApplication
            data: applications.map(mapMyApplication),
        });
    } catch (error) {
        logger.error('[Applications My] Error:', error);
        return respondError(res, req, error, { message: 'Failed to fetch applications' });
    }
});

router.get('/my/statuses', authenticateHealth, async (req, res) => {
    try {
        if (!String(req.user?.healthId || '').trim()) { return res.status(403).json({ success: false, error: 'Health healthId is required' }); }
        // The identity check stays (an unresolvable caller is refused as before).
        await applicationService.resolveHealthIdentity(req.user.id, getHealthScopeOptions(req.user));
        const limit = Number.parseInt(String(req.query.limit || ''), 10);
        const take = Number.isFinite(limit) && limit > 0 ? limit : undefined;

        // Review Focus 4 (R2 Task 9 fix round 1): the statuses of the list are the
        // list's rows. The where is exactly GET /my's (getHealthApplications):
        // the holder fragment and isDeleted false, nothing else.
        const applications = await prisma.application.findMany({
            where: {
                ...holderReadWhere(await holderScope(req), 'Application'),
                isDeleted: false,
            },
            orderBy: { createdAt: 'desc' },
            ...(take ? { take } : {}),
            select: { id: true, applicationNumber: true, status: true, phase1Status: true, phase2Status: true, formData: true },
        });

        const now = new Date();
        return res.json({ success: true, data: applications.map((app) => buildTrackingPayload(app, { now })) });
    } catch (error) {
        logger.error('[Applications My Statuses] Error:', error);
        return respondError(res, req, error, { message: 'Failed to fetch application statuses' });
    }
});

router.get('/:id/status', authenticateHealth, async (req, res) => {
    try {
        await applicationService.resolveHealthIdentity(req.user.id, getHealthScopeOptions(req.user));
        const idOrNumber = String(req.params.id || '').trim();
        const application = await prisma.application.findFirst({
            where: {
                OR: [{ id: idOrNumber }, { applicationNumber: idOrNumber }],
                ...holderReadWhere(await holderScope(req), 'Application'),
                isDeleted: false,
            },
            select: { id: true, applicationNumber: true, status: true, phase1Status: true, phase2Status: true, formData: true },
        });

        if (!application) { return res.status(404).json({ success: false, error: 'Application not found' }); }
        return res.json({ success: true, data: buildTrackingPayload(application, { now: new Date() }) });
    } catch (error) {
        logger.error('[Applications Tracking Status] Error:', error);
        return respondError(res, req, error, { message: 'Failed to load application status' });
    }
});

// B20-D (customer-statement, 2026-05-16): applicant-facing customer
// statement for ONE application. The application's holder must be in the
// caller's holder scope (spec 2026-09-30 §3.1), like the rest of this
// listing handler. The statement returns the same
// shape as the finance-team endpoint but unfiltered (applicant sees
// BOTH sides of their own bill — DTAM state fee + PLATFORM service fee
// — because they paid for both).
router.get('/:applicationId/statement', authenticateHealth, async (req, res) => {
    try {
        await applicationService.resolveHealthIdentity(
            req.user.id,
            getHealthScopeOptions(req.user),
        );
        const applicationId = String(req.params.applicationId || '').trim();
        if (!applicationId) {
            return res.status(400).json({ success: false, error: 'applicationId required' });
        }
        // Ownership guard — confirm this application's holder is one whose money the
        // caller may read (VIEW_FINANCIAL, operator order 41) before we hand the
        // statement to them. Verifying here first means the audit trail records a
        // clean 404 for cross-applicant attempts.
        const scope = await financialHolderScope(req);
        const applicationWhere = holderReadWhere(scope, 'Application');
        const application = await prisma.application.findFirst({
            where: {
                id: applicationId,
                ...applicationWhere,
                isDeleted: false,
            },
            select: { id: true, organizationId: true },
        });
        if (!application) {
            return res.status(404).json({ success: false, error: 'Application not found' });
        }
        const customerStatementService = require('../../../services/customer-statement-service');
        const statement = await customerStatementService.generateApplicationStatement({
            applicationId: application.id,
            organizationId: application.organizationId,
            applicationWhere,
            holderScope: scope,
        });
        return res.json({ success: true, data: statement });
    } catch (error) {
        if (error.code === 'NOT_FOUND') {
            return res.status(404).json({ success: false, error: 'Application not found' });
        }
        logger.error('[Application Statement] Error:', error?.message);
        return respondError(res, req, error, { message: 'Failed to load application statement' });
    }
});

router.get('/:id/history', authenticateHealth, async (req, res) => {
    try {
        await applicationService.resolveHealthIdentity(req.user.id, getHealthScopeOptions(req.user));
        const where = {
            id: req.params.id,
            ...holderReadWhere(await holderScope(req), 'Application'),
            isDeleted: false,
        };
        let application;
        try {
            // P1-G leak-guard: applicant history must never include internal
            // staff notes (ApplicationComment.internalOnly) — see the identical
            // guard on GET /:id in application-workflow-handlers.js.
            application = await prisma.application.findFirst({ where, include: { comments: { where: { internalOnly: false, isDeleted: false }, orderBy: { createdAt: 'asc' } } } });
        } catch (error) {
            if (!isMissingApplicationCommentsTableError(error)) { throw error; }
            logger.warn('[Applications History] application_comments table missing; fallback without comments');
            application = await prisma.application.findFirst({ where });
            if (application) { application.comments = []; }
        }
        if (!application) { return res.status(404).json({ success: false, error: 'Application not found' }); }
        return res.json({ success: true, data: buildApplicationHistoryPayload(application) });
    } catch (error) {
        logger.error('[Applications History] Error:', error);
        return respondError(res, req, error, { message: 'Failed to load application history' });
    }
});

module.exports = router;

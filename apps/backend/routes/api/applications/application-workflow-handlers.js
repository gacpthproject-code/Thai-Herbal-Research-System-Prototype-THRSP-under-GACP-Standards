/**
 * Application Workflow Routes
 * Extracted from applications.js for readability.
 *
 * @module routes/api/applications/application-workflow-handlers
 */

const express = require('express');
const { respondError } = require('../../../shared/api-response');
const router = express.Router();
const applicationService = require('../../../services/application-service');
const { authenticateAny: authenticateHealth } = require('../../../middleware/auth-middleware');
const { prisma } = require('../../../services/prisma-database');
const logger = require('../../../shared/logger');
const { getHealthScopeOptions } = require('../helpers/applications-helpers');
// Spec 2026-09-30 §3.1: health reads spread the holder fragment. holderScope is
// called inside each handler, after authentication.
const { holderScope, holderReadWhere, mayViewHolderFinance } = require('../../../services/holder-access');
const { isMissingApplicationCommentsTableError } = require('../helpers/application-constants');
const {
    buildApplicationDetailPayload,
} = require('../helpers/application-payload-builders');

router.get('/:id', authenticateHealth, async (req, res) => {
    try {
        // The identity check stays (an unresolvable caller is refused as before).
        await applicationService.resolveHealthIdentity(req.user.id, getHealthScopeOptions(req.user));
        const where = {
            id: req.params.id,
            ...holderReadWhere(await holderScope(req), 'Application'),
            isDeleted: false,
        };
        let app;
        try {
            // P1-G leak-guard: applicant reads must never include internal
            // staff notes (ApplicationComment.internalOnly). Latent until the
            // chatter composer ships — guard the WHERE before writes can exist.
            app = await prisma.application.findFirst({ where, include: { comments: { where: { internalOnly: false, isDeleted: false }, orderBy: { createdAt: 'asc' } }, auditor: { select: { firstName: true, lastName: true } } } });
        } catch (error) {
            if (!isMissingApplicationCommentsTableError(error)) { throw error; }
            logger.warn('[Get By Id] application_comments table missing; fallback without comments');
            app = await prisma.application.findFirst({ where });
            if (app) { app.comments = []; }
        }
        if (!app) { return res.status(404).json({ success: false, error: 'Not Found' }); }
        const payload = buildApplicationDetailPayload(app);
        // Order 41: the price is the holder's money, shown only to a member with VIEW_FINANCIAL.
        if (!(await mayViewHolderFinance(req, app.entityId))) { payload.renewalPriceEstimate = null; }
        return res.json({ success: true, data: payload });
    } catch (error) {
        logger.error('[Get By Id] Error:', error);
        return respondError(res, req, error);
    }
});

// HEALTH-side activity timeline (ADR-016 Phase 6).
// Same applicationId scope as GET /:id (the user must own the application),
// but the response is REDACTED — no assignee names, no internal notes,
// no candidateGroup. Just "what stage of work is happening, and when".
//
// Existing /api/provider/applications/:id/activities returns the full
// internal view for staff. This endpoint is the public-facing twin.
router.get('/:id/activities', authenticateHealth, async (req, res) => {
    try {
        await applicationService.resolveHealthIdentity(req.user.id, getHealthScopeOptions(req.user));
        const owned = await prisma.application.findFirst({
            where: {
                id: req.params.id,
                ...holderReadWhere(await holderScope(req), 'Application'),
                isDeleted: false,
            },
            select: { id: true },
        });
        if (!owned) {
            return res.status(404).json({ success: false, error: 'Application not found' });
        }

        const rows = await prisma.workActivity.findMany({
            where: { applicationId: req.params.id },
            orderBy: [{ createdAt: 'asc' }],
            select: {
                id: true,
                workType: true,
                state: true,
                createdAt: true,
                claimedAt: true,
                completedAt: true,
                cancelledAt: true,
                dueAt: true,
            },
        });

        const WORK_TYPE_LABEL_TH = {
            SCHEDULING: 'จัดคิวมอบหมายเจ้าหน้าที่',
            DOC_REVIEW: 'ตรวจเอกสารใบสมัคร',
            FIELD_AUDIT: 'ตรวจประเมินภาคสนาม',
            CAR_REVIEW: 'ตรวจการแก้ไขข้อบกพร่อง',
            FINAL_APPROVAL: 'ตัดสินให้การรับรอง',
            // No payment task: the gateway webhook settles and issues the receipt.
        };

        // Map internal state → coarser public status. The applicant
        // doesn't need to distinguish CLAIMED vs IN_PROGRESS — just
        // "someone is working on it".
        function publicStatus(state) {
            switch (state) {
                case 'TODO': return 'pending';
                case 'CLAIMED':
                case 'IN_PROGRESS': return 'in_progress';
                case 'DONE': return 'done';
                case 'CANCELLED': return 'cancelled';
                default: return 'pending';
            }
        }

        const now = new Date();
        const data = rows.map((r) => ({
            id: r.id,
            workType: r.workType,
            workTypeLabel: WORK_TYPE_LABEL_TH[r.workType] || r.workType,
            status: publicStatus(r.state),
            createdAt: r.createdAt,
            startedAt: r.claimedAt,
            completedAt: r.completedAt,
            cancelledAt: r.cancelledAt,
            // Show "approaching deadline" hint without leaking the exact
            // SLA hours — just a boolean for the badge.
            isOverdue: r.dueAt && r.dueAt < now && !['DONE', 'CANCELLED'].includes(r.state),
        }));

        return res.json({ success: true, data });
    } catch (error) {
        logger.error('[Health Get Activities] Error:', error);
        return respondError(res, req, error);
    }
});

/**
 * The applicant's own filing, on the ministry's form.
 *
 * Both doors below render แบบกัญชา กทล.๑ from ONE renderer
 * (services/pdf/katorlor1-template-service), so the form a farmer reads on
 * screen and the PDF the department receives cannot say different things. The
 * ส่วนที่ ๓ checklist comes from the requirement engine rather than being
 * recomputed here, for the same reason: two answers to "is this paper attached?"
 * is how a screen ends up disagreeing with the submit gate.
 */
async function loadFilingForKatorlor1(req) {
    await applicationService.resolveHealthIdentity(req.user.id, getHealthScopeOptions(req.user));
    // Application has no `documents` Prisma relation — uploaded documents live
    // as JSON in `formData.documents`, and as ApplicationDocument rows. Including
    // `documents: true` here used to 500 every PDF download (UAT 2026-05-03).
    const scope = await holderScope(req);
    const app = await prisma.application.findFirst({
        where: {
            id: req.params.id,
            ...holderReadWhere(scope, 'Application'),
            isDeleted: false,
        },
        include: { applicant: true, entity: true, invoices: { orderBy: { createdAt: 'asc' } } },
    });
    if (!app) { return { app: null, requirements: null }; }

    // The engine's answer, or none. A form must still render for a filing whose
    // requirements cannot be resolved — printing four ส่วน with an empty
    // checklist is honest; refusing the whole document over it is not.
    let requirements = null;
    try {
        // eslint-disable-next-line global-require
        const { resolveApplicationRequirements } = require('../../../services/application-requirements-service');
        const documentRows = await prisma.applicationDocument.findMany({
            where: {
                applicationId: app.id,
                ...holderReadWhere(scope, 'ApplicationDocument'),
            },
            select: {
                documentType: true, fileUrl: true, fileName: true,
                createdAt: true, currentForSlot: true, supersededAt: true,
            },
        });
        requirements = await resolveApplicationRequirements(app, documentRows);
    } catch (err) {
        logger.warn(`[katorlor1] requirements unavailable for ${app.id}: ${err && err.message}`);
    }
    return { app, requirements };
}

// The form as HTML, for the review page, the officer page and [id]/preview.
router.get('/:id/katorlor1', authenticateHealth, async (req, res) => {
    try {
        const { app, requirements } = await loadFilingForKatorlor1(req);
        if (!app) { return res.status(404).json({ success: false, error: 'Application not found' }); }

        const { renderKatorlor1Html } = require('../../../services/pdf/katorlor1-template-service');
        return res.json({ success: true, data: { html: renderKatorlor1Html(app, requirements) } });
    } catch (error) {
        logger.error('[Applications katorlor1] Error:', error);
        return respondError(res, req, error, { message: 'Failed to assemble the กทล.1 form' });
    }
});

router.get('/:id/pdf', authenticateHealth, async (req, res) => {
    try {
        const { app, requirements } = await loadFilingForKatorlor1(req);
        if (!app) { return res.status(404).json({ success: false, error: 'Application not found' }); }

        // Was generateApplicationSummaryPdf — a summary the platform invented.
        // What the department receives is its own form.
        const { renderKatorlor1Pdf } = require('../../../services/pdf/katorlor1-template-service');
        const buffer = await renderKatorlor1Pdf(app, requirements);
        const filename = `katorlor1-${app.applicationNumber || app.id}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', buffer.length);
        return res.send(buffer);
    } catch (error) {
        logger.error('[Applications PDF] Error:', error);
        return respondError(res, req, error, { message: 'Failed to generate PDF' });
    }
});

module.exports = router;

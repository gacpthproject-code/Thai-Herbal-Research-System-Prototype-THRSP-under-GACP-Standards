/**
 * ส่งกลับให้เจ้าหน้าที่ตรวจ — the applicant returns the papers the officer asked for.
 *
 *   POST /api/applications/:id/revision-resubmit
 *
 * The other end of routes/api/provider/document-reviews.js. The rules of a revision answer (the
 * revision clock, every requested paper replaced since the request, the one gate list) live in
 * services/application-filing-gates judgeFiling, which POST /submit runs for the same edge, so the
 * two doors cannot judge the same filing differently.
 *
 * Authority first: a resubmit is a submit (spec 2026-09-30 §3.3), so the submit guard runs before
 * this door decides anything. Then the wrong state: an applicant on the wrong screen should hear
 * that, not a list of papers that has nothing to do with their problem.
 *
 * @module routes/api/applications/revision-resubmit
 */

'use strict';

const express = require('express');

const { prisma } = require('../../../services/prisma-database');
const logger = require('../../../shared/logger');
const { lookup, getMessage } = require('../../../shared/error-codes');
const { authenticateHealth } = require('../../../middleware/auth-middleware');
const { requireConsent } = require('../../../middleware/consent-manager');
const { judgeFiling } = require('../../../services/application-filing-gates');
const applicationService = require('../../../services/application-service');
const { getHealthScopeOptions } = require('../helpers/applications-helpers');
const { holderScope, holderReadWhere } = require('../../../services/holder-access');
const { assertSubmitAllowed, SubmitGuardError } = require('../../../services/application-submit-guard');
const { respondError } = require('../../../shared/api-response');
const { writeApplicationStatus } = require('../../../services/application-status-writer');
const { withRevisionAnswered } = require('../../../shared/form-data-ownership');

const router = express.Router();

/** The state a revision resubmit walks out of, and into. */
const FROM_STATE = 'REVISION_REQUESTED';
const TO_STATE = 'ASSIGNED_FOR_REVIEW';
const WRONG_STATE = 'REVISION_RESUBMIT_WRONG_STATE';

const ANSWERABLE = new Set([WRONG_STATE, 'VALIDATION_ERROR']);

function answer(res, err, where) {
    const code = err && err.code;
    if (code && ANSWERABLE.has(code)) {
        const row = lookup(code);
        return res.status(row ? row.httpStatus : 409).json({
            success: false,
            error: code,
            code,
            message: err.message,
            // `message` is a reserved envelope key stripped from non-2xx bodies
            // by the browser client; messageTh survives into .meta.
            messageTh: err.messageTh || (row ? getMessage(code, 'th') : null),
        });
    }
    logger.error(`[revision-resubmit] ${where} failed: ${err && err.message}`, { stack: err && err.stack });
    return res.status(500).json({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        code: 'REVISION_RESUBMIT_FAILED',
        messageTh: 'ระบบส่งคำขอกลับให้เจ้าหน้าที่ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
    });
}

router.post('/:id/revision-resubmit', authenticateHealth, requireConsent, async (req, res) => {
    try {
        const identity = await applicationService.resolveHealthIdentity(
            req.user.id, getHealthScopeOptions(req.user),
        );
        const scope = await holderScope(req);
        const application = await prisma.application.findFirst({
            where: {
                id: req.params.id,
                // Spec 2026-09-30 §3.1: visible to every ACTIVE member of its holder.
                ...holderReadWhere(scope, 'Application'),
                isDeleted: false,
            },
        });
        if (!application) {
            return res.status(404).json({ success: false, error: 'Application not found' });
        }

        // Who may resubmit (spec §3.3): SUBMIT_APPLICATION on the filing's holder,
        // through the same submit guard as every other submit door. A refusal is
        // 403 ENTITY_PERMISSION_DENIED (audited by the guard) and writes nothing.
        try {
            await assertSubmitAllowed({
                userId: identity.userId || req.user.id,
                application,
                holderScope: scope,
                auditContext: {
                    actorType: 'USER',
                    actorRole: req.user?.canonicalRole || req.user?.role || null,
                    ipAddress: req.ip || null,
                    userAgent: typeof req.get === 'function' ? req.get('user-agent') : null,
                    organizationId: req.user?.organizationId || null,
                    route: `${req.method} ${req.baseUrl || ''}${req.path || ''}`,
                },
            });
        } catch (guardErr) {
            if (guardErr instanceof SubmitGuardError) {
                return respondError(res, req, guardErr, { message: guardErr.message });
            }
            throw guardErr;
        }

        const fromStatus = String(application.status || '').toUpperCase();
        if (fromStatus !== FROM_STATE) {
            return answer(res, Object.assign(
                new Error(`A revision resubmit needs the filing to be ${FROM_STATE}, not ${fromStatus}`),
                {
                    code: WRONG_STATE,
                    messageTh: 'คำขอนี้ไม่ได้อยู่ในสถานะรอแก้ไขเอกสาร จึงส่งกลับให้เจ้าหน้าที่ไม่ได้',
                },
            ), 'POST /:id/revision-resubmit');
        }

        const verdict = await judgeFiling({ prisma, application, fromStatus, payload: req.body, holderScope: scope });
        if (verdict.refusal) { return res.status(verdict.refusal.httpStatus).json(verdict.refusal.body); }

        // Never a raw status write: the transition service owns the edge, the
        // audit row and the workflow history.
        await writeApplicationStatus({
            prisma,
            applicationId: application.id,
            fromStatus,
            toStatus: TO_STATE,
            actorId: identity.userId,
            actorRole: req.user.canonicalRole || req.user.role || 'health',
            reason: 'REVISION_RESUBMITTED',
            holderScope: scope,
            additionalData: { formData: withRevisionAnswered(application.formData) },
        });

        // The next round opens on the officer's next verdict, not here: writing
        // empty round-N+1 rows now would put a round in the record that nobody
        // has judged.
        return res.json({ success: true, data: { status: TO_STATE } });
    } catch (error) {
        return answer(res, error, 'POST /:id/revision-resubmit');
    }
});

module.exports = router;

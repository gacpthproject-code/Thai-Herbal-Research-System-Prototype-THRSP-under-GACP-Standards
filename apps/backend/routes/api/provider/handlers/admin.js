const {
    prisma,
    authenticateProvider,
    requireRole,
    logger,
    adminRoles,
    obj,
    arr,
} = require('./shared');
const { writeApplicationStatus } = require('../../../../services/application-status-writer');
// FU-1 (full-system audit H-class follow-up, 2026-07-07): the status-override
// escape hatch must land in the immutable AuditLog hash chain, atomic with the
// status flip — same treatment as the auditor path (Blocker H) and the
// force-status sibling in routes/api/admin/applications.js.
const { statusTransitionAuditHook } = require('../../../../middleware/audit-logger');
// Batch 10 — Prisma bypass cleanup. Direct prisma.revisionDeadline /
// prisma.application reads + the workflow-history append now go through
// admin-application-service. `prisma` is kept ONLY as the transaction handle
// passed to writeApplicationStatus (canonical writer convention).
const adminApplicationService = require('../../../../services/admin-application-service');
const { notifyApplicationClosedByAdmin } = require('../../../../services/application-closure-notify');
const { recordAssignment } = require('../../../../services/assignment-ledger-service');
const { assertAssignableStaff } = require('../../../../services/assignable-staff-service');
const { CANONICAL_ROLES } = require('../../../../shared/canonical-rbac');
const { assertReviewerIsNotInspector, answerSeparation } = require('../../../../shared/reviewer-inspector-separation');
const { organizationScope, answerNoOrganization, DENY_ALL } = require('../../../../shared/application-visibility');
const { ERROR_CODES } = require('../../../../shared/error-codes');
const { answerTypedRefusal } = require('../../../../shared/api-response');
// The reviewer's workload cap (order 56(1) 2.1, 2.2).
const {
    assertWithinCapOrStated, recordStatedReasons, statedReasonsRecord, answerAssignmentRefusal,
} = require('../../../../services/assignment-policy');
const { withoutTenantScope } = require('../../../../services/tenant-context');

// Roles a target user must hold to receive a document-review assignment
// (mirrors scheduler-assign-reviewer-handler / scheduler-reviewer-reassign-handler).
// Document review goes to a document reviewer only (order 27); an admin is not in the workflow.
const BATCH_ASSIGN_ELIGIBLE_ROLES = [CANONICAL_ROLES.DOCUMENT_REVIEWER];

/**
 * What each batch action may do: the one state it starts from and the state it
 * writes. Anything else in the batch refuses the whole batch before any write
 * (security review 2026-10-06, F1: ASSIGN used to move an unpaid PENDING_DOC_FEE
 * filing straight into review). There is no batch "request documents": a revision
 * request is the document reviewer's decision (order 31), made per paper on the
 * document-check screen.
 */
const BATCH_ACTION_EDGES = Object.freeze({
    ASSIGN: { from: 'DOC_FEE_PAID', to: 'ASSIGNED_FOR_REVIEW' },
});

function refuseBatch(res, row, extra = {}) {
    return res.status(row.httpStatus).json({
        success: false, code: row.code, error: row.code, message: row.messageTh, messageTh: row.messageTh, ...extra,
    });
}

const adminBatchActions = [
    authenticateProvider,
    requireRole(adminRoles),
    // system_admin_platform is the one role that crosses organizations (order 17). The
    // tenant read extension would narrow its reads to its own organization, so its batch
    // runs outside the bound scope, the way every other platform-admin door does.
    (req, res) => (organizationScope(req.user) === null
        ? withoutTenantScope(() => runBatch(req, res))
        : runBatch(req, res)),
];

async function runBatch(req, res) {
    try {
        const ids = Array.isArray(req.body?.applicationIds) ? [...new Set(req.body.applicationIds)] : [];
        const action = String(req.body?.action || '').toUpperCase();
        const assignTo = req.body?.assignTo || req.body?.providerId || null;
        const reason = req.body?.reason || null;
        if (ids.length === 0) {
            return res.status(400).json({ success: false, error: 'No applications specified' });
        }
        const edge = BATCH_ACTION_EDGES[action];
        if (!edge) {
            return res.status(400).json({ success: false, error: 'Invalid action' });
        }
        if (action === 'ASSIGN' && !assignTo) {
            return res.status(400).json({ success: false, error: 'assignTo is required for ASSIGN' });
        }
        const organizationWhere = organizationScope(req.user);
        if (organizationWhere === DENY_ALL) { return answerNoOrganization(res); }

        // An id outside the caller's organization answers exactly like an id that does
        // not exist, so the batch cannot be used to probe another organization.
        const apps = await adminApplicationService.findApplicationsByIds(ids, organizationWhere);
        if (apps.length !== ids.length) {
            return refuseBatch(res, ERROR_CODES.APPLICATION_NOT_FOUND);
        }
        const wrongState = apps.filter((application) => String(application.status).toUpperCase() !== edge.from);
        if (wrongState.length > 0) {
            return refuseBatch(res, ERROR_CODES.BATCH_ACTION_WRONG_STATE, {
                applicationIds: wrongState.map((application) => application.id),
            });
        }

        // assignTo must be an ACTIVE, eligible reviewer of the organization that owns every
        // application in the batch, checked BEFORE anything is written. The organization is
        // the applications', not the caller's: a platform admin crosses organizations but
        // assigns only staff of the filing's own organization (order 17).
        if (action === 'ASSIGN') {
            try {
                for (const organizationId of new Set(apps.map((application) => application.organizationId))) {
                    await assertAssignableStaff({ userId: assignTo, roles: BATCH_ASSIGN_ELIGIBLE_ROLES, organizationId });
                }
            } catch (staffError) {
                if (staffError.code !== 'STAFF_NOT_ASSIGNABLE') { throw staffError; }
                return res.status(staffError.statusCode).json({ success: false, code: staffError.code, error: staffError.messageTh });
            }
            // Separation of duties (operator ruling 2026-10-05), for the whole batch before
            // anything is written.
            try {
                for (const application of apps) {
                    assertReviewerIsNotInspector({ reviewerId: assignTo, auditorId: application.auditorId });
                }
            } catch (sodError) {
                if (answerSeparation(res, sodError)) { return undefined; }
                throw sodError;
            }
        }

        const timestamp = new Date().toISOString();
        // One transaction for the whole batch: the checks above refuse a bad batch before
        // it starts, and a refusal from the status writer (an unpaid milestone) rolls back
        // every row instead of leaving half a batch written.
        await prisma.$transaction(async (tx) => {
            for (const application of apps) {
                const formData = obj(application.formData);
                // Each application counts the ones this batch already gave the reviewer: past the cap
                // the batch goes ahead only with the confirmation and reason (order 56(1) 2.1, 2.2).
                const overCap = action === 'ASSIGN'
                    ? await assertWithinCapOrStated(tx, {
                        role: CANONICAL_ROLES.DOCUMENT_REVIEWER, officerId: assignTo, excludeApplicationId: application.id,
                        overCap: req.body?.overCap,
                    })
                    : null;
                const formDataPatch = action === 'ASSIGN'
                    ? {
                        PROVIDERAssignment: {
                            ...obj(formData.PROVIDERAssignment),
                            reviewerId: assignTo,
                            assignedBy: req.user.id,
                            assignedAt: timestamp,
                            statedReasons: statedReasonsRecord({ overCap }),
                        },
                    }
                    : {};
                await writeApplicationStatus({
                    prisma: tx,
                    applicationId: application.id,
                    fromStatus: application.status,
                    toStatus: edge.to,
                    // A cancellation that committed since the read above rolls the whole batch back.
                    expectedVersion: application.version,
                    actorId: req.user.id,
                    actorRole: req.user.canonicalRole || req.user.role || 'ADMIN',
                    reason: `BATCH_${action}`,
                    assertTransition: true,
                    onAudit: statusTransitionAuditHook({
                        tx,
                        metadata: { batchAction: `BATCH_${action}`, reason, decidedBy: req.user.id, reviewerId: assignTo || undefined },
                    }),
                    additionalData: {
                        updatedBy: req.user.id,
                        // The canonical column: the assigned-reviewer check and separation
                        // of duties read it, not formData.
                        ...(action === 'ASSIGN' ? { reviewerId: assignTo } : {}),
                        formData: { ...formData, ...formDataPatch },
                        workflowHistory: [
                            ...arr(application.workflowHistory),
                            {
                                timestamp,
                                action: `BATCH_${action}`,
                                reason,
                                reviewerId: assignTo,
                                actorId: req.user.id,
                            },
                        ],
                    },
                });
                if (overCap) {
                    await recordStatedReasons(tx, {
                        actor: req.user, application, officerId: assignTo, role: CANONICAL_ROLES.DOCUMENT_REVIEWER, overCap,
                    });
                }
            }
        });

        // Work-distribution ledger (best-effort; never throws). Only ASSIGN is an
        // assignment event; this endpoint is the canonical ADMIN_BATCH channel.
        if (action === 'ASSIGN') {
            for (const application of apps) {
                await recordAssignment({
                    prisma,
                    entityType: 'APPLICATION',
                    entityId: application.id,
                    action: 'ASSIGN',
                    assigneeUserId: assignTo,
                    assignedByUserId: req.user.id,
                    role: 'document_reviewer',
                    source: 'ADMIN_BATCH',
                    reason: reason || `BATCH_${action}`,
                    organizationId: application.organizationId,
                });
            }
        }

        return res.json({
            success: true,
            message: `${apps.length} applications updated`,
            data: { affected: apps.length },
        });
    } catch (error) {
        if (error && error.code === ERROR_CODES.MILESTONE_NOT_PAID.code) {
            return refuseBatch(res, ERROR_CODES.MILESTONE_NOT_PAID, { milestones: error.milestones });
        }
        if (error?.code === 'CONCURRENCY_CONFLICT') {
            return refuseBatch(res, ERROR_CODES.APPLICATION_STATE_CHANGED);
        }
        if (answerAssignmentRefusal(res, error) || answerTypedRefusal(res, error)) { return undefined; }
        logger.error('[provider] admin batch action failed:', error);
        return res.status(500).json({
            success: false,
            error: 'Batch action failed',
        });
    }
}

/**
 * Admin Status Override
 * Force-transition application status (admin-only, with full audit trail).
 */
const adminStatusOverride = [
    authenticateProvider,
    requireRole(adminRoles),
    async (req, res) => {
        try {
            const { applicationId, newStatus, reason, closureReasonCode } = req.body || {};
            if (!applicationId || !newStatus) {
                return res.status(400).json({ success: false, error: 'applicationId and newStatus are required' });
            }
            if (!reason || String(reason).trim().length < 5) {
                return res.status(400).json({ success: false, error: 'Reason is required (min 5 chars)' });
            }

            if (!adminApplicationService.ALLOWED_FORCE_STATUSES.has(newStatus)) {
                return res.status(400).json({
                    success: false,
                    error: `Invalid status: ${newStatus}`,
                    validStatuses: [...adminApplicationService.ALLOWED_FORCE_STATUSES],
                });
            }

            // adminApplicationService.findApplicationStatusOverrideSlice —
            // replaces prisma.application.findUnique for the status-override slice.
            // Only inside the admin's own organization (order 17); the platform admin crosses.
            const organizationWhere = organizationScope(req.user);
            if (organizationWhere === DENY_ALL) { return answerNoOrganization(res); }
            const application = await adminApplicationService.findApplicationStatusOverrideSlice(applicationId, organizationWhere);
            if (!application) {
                return res.status(404).json({ success: false, error: 'Application not found' });
            }

            const previousStatus = application.status;
            const history = Array.isArray(application.workflowHistory) ? application.workflowHistory : [];
            const now = new Date().toISOString();

            // FU-1: run the override in ONE transaction with an immutable
            // AuditLog row (previously: root prisma, ZERO AuditLog emission —
            // attribution lived only in logger.warn + mutable workflowHistory).
            await prisma.$transaction(async (tx) => {
                await writeApplicationStatus({
                    prisma: tx,
                    applicationId,
                    fromStatus: previousStatus,
                    toStatus: newStatus,
                    actorId: req.user.id,
                    actorRole: req.user.canonicalRole || req.user.role || 'ADMIN',
                    reason: 'ADMIN_STATUS_OVERRIDE',
                    // Force-transition: admin-only override path bypasses normal SLA guard.
                    assertTransition: false,
                    closureReasonCode: closureReasonCode ?? null,
                    // Do NOT auto-issue a cert when an admin force-sets AUDIT_PASSED here —
                    // cert issuance is the single-auditor's act (SoD); a back-door mint via this
                    // legacy override contradicts AUDIT-001. Matches the force-status + PATCH
                    // /admin/applications/:id/status siblings. (multi-role system test 2026-06-24)
                    autoIssueCertificate: false,
                    // Immutable hash-chain record, atomic with the status write.
                    onAudit: statusTransitionAuditHook({
                        tx,
                        metadata: {
                            override: 'ADMIN_STATUS_OVERRIDE',
                            closureReasonCode: closureReasonCode ?? null,
                            reason: String(reason).trim(),
                            decidedBy: req.user.id,
                        },
                    }),
                    additionalData: {
                        updatedBy: req.user.id,
                        workflowHistory: [
                            ...history,
                            {
                                timestamp: now,
                                action: 'ADMIN_STATUS_OVERRIDE',
                                previousStatus,
                                newStatus,
                                reason: String(reason).trim(),
                                actorId: req.user.id,
                                actorName: [req.user.firstName, req.user.lastName].filter(Boolean).join(' '),
                            },
                        ],
                    },
                });
            });

            logger.warn({ applicationId, previousStatus, newStatus, actorId: req.user.id, reason }, '[admin] status override');
            if (newStatus === 'CANCELLED') { await notifyApplicationClosedByAdmin({ applicationId: application.id }); }

            return res.json({
                success: true,
                message: `Status changed from ${previousStatus} to ${newStatus}`,
                data: { applicationId, previousStatus, newStatus },
            });
        } catch (error) {
            if (answerTypedRefusal(res, error)) { return undefined; }
            logger.error('[admin] status override failed:', error);
            return res.status(500).json({ success: false, error: 'Failed to override status' });
        }
    },
];

module.exports = {
    adminBatchActions,
    adminStatusOverride,
};

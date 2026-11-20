const {
    authenticateProvider,
    logger,
    PERMISSIONS,
    requireCanonicalPermission,
    obj,
    arr,
    prisma,
    workflowTransitionService,
    getRequestIp,
    auditLogger,
    AuditCategory,
    AuditSeverity,
    ResourceType,
    getRevisionDueAt,
} = require('./workflow-handler-deps');
const { writeApplicationStatus } = require('../../../../services/application-status-writer');
const { notifyApplicationClosedByAdmin } = require('../../../../services/application-closure-notify');
const { answerSeparation } = require('../../../../shared/reviewer-inspector-separation');
const { refuseUnlessAssignedInspector } = require('../../../../shared/assigned-inspector');
const { lookup: lookupErrorCode } = require('../../../../shared/error-codes');
const { assertOnsiteEvidenceForPass } = require('../../../../services/onsite-evidence-gate');
const { onsiteEvidenceRefusal } = require('../../../../services/audit-decision-error-response');
const { assertCarEvidenceToJudge } = require('../../../../services/inspection-result-service');
const { answerTypedRefusal } = require('../../../../shared/api-response');
const { statusTransitionAuditHook } = require('../../../../middleware/audit-logger');
// A2 (integrity-audit 2026-07-06): void the auto-issued certificate when a pass
// is reversed on this canonical endpoint (AUDIT_PASSED -> CAR_REVIEWING). Mirrors
// the auditor.js reject-to-auditor path — required directly (not via
// workflow-handler-deps) so the reversal void stays co-located with its caller.
const certificateService = require('../../../../services/certificate-service');
const { withVisibility } = require('../../../../shared/application-visibility');
// Batch 10 — Prisma bypass cleanup. The workflow handler's direct entity
// reads (application lookup + re-fetch, comment insert, revisionDeadline
// updateMany) now route through application-service + admin-application-service.
// `prisma` is preserved only as the transaction handle for canonical writers
// (writeApplicationStatus) and passed-through helpers.
const applicationService = require('../../../../services/application-service');
const adminApplicationService = require('../../../../services/admin-application-service');

const { requestOnsiteCorrection } = require('../../../../services/onsite-correction');

/**
 * Edges this generic door does not walk, `force` included: each is owned by the door that writes
 * what the edge needs, and the refusal names that door.
 */
const EDGE_DOOR = Object.freeze({
    // The per-slot document check (POST /:id/document-decision): approving needs every required
    // paper accepted, and a request for more names the papers (staging 2026-10-06).
    'ASSIGNED_FOR_REVIEW->DOC_APPROVED': 'DOCUMENT_DECISION_USE_CHECK',
    'ASSIGNED_FOR_REVIEW->REVISION_REQUESTED': 'DOCUMENT_DECISION_USE_CHECK',
    // The inspector's "ไม่ผ่าน" carries its findings: the job sheet or the field screen (order 56(2)).
    'AUDIT_CONFIRMED->AUDIT_NOT_PASSED': 'INSPECTION_RESULT_USE_RESULT_DOOR',
    // The certificate approver's decisions: the decision file, opened, with a reason (order 29).
    'AUDIT_PASSED->APPROVED': 'CERTIFICATION_DECISION_USE_FILE',
    'AUDIT_PASSED->REJECTED': 'CERTIFICATION_DECISION_USE_FILE',
    'AUDIT_NOT_PASSED->REJECTED': 'CERTIFICATION_DECISION_USE_FILE',
    'AUDIT_NOT_PASSED->CAR_PENDING': 'CERTIFICATION_DECISION_USE_FILE',
    'APPROVED->CERTIFIED': 'CERTIFICATION_DECISION_USE_FILE',
    // The dispatcher's edges: the document reviewer, or the visit date, the field inspector and
    // the armed evidence chain (order 27, R1).
    'DOC_FEE_PAID->ASSIGNED_FOR_REVIEW': 'REVIEWER_ASSIGNMENT_USE_ASSIGN',
    'AUDIT_FEE_PAID->AUDIT_CONFIRMED': 'AUDIT_BOOKING_USE_CALENDAR',
    'CAR_REVIEWING->AUDIT_CONFIRMED': 'REINSPECTION_USE_CALENDAR',
});

const getCarDueAt = (formData) => {
    const payload = obj(formData);
    const value = payload.carDueAt || payload.car_due_at || payload.carRequest?.dueAt || null;
    if (!value) {
        return null;
    }
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
};

const applicationsWorkflowTransitions = [
    authenticateProvider,
    requireCanonicalPermission(PERMISSIONS.APPLICATION_WORKFLOW_TRANSITION),
    async (req, res) => {
        try {
            const idOrNumber = String(req.params.id || '').trim();
            const toState = String(req.body?.toState || '').trim().toUpperCase();
            const comment = req.body?.comment || null;
            const reasonCode = req.body?.reasonCode || null;
            const metadata = obj(req.body?.metadata);
            const revisionCategory = String(req.body?.revisionCategory || metadata.revisionCategory || '').trim() || null;
            const revisionMessage = String(req.body?.revisionMessage || metadata.revisionMessage || '').trim() || null;
            const revisionItems = arr(req.body?.revisionItems || metadata.revisionItems)
                .map((item) => String(item || '').trim())
                .filter(Boolean);
            const force = !!req.body?.force;
            const requestedState = workflowTransitionService.normalizeWorkflowStateInput(toState) || toState;
            const effectiveComment = comment || revisionMessage || null;
            const transitionMetadata = {
                ...metadata,
                ...(requestedState === 'REVISION_REQUESTED'
                    ? {
                        revisionCategory,
                        revisionMessage: revisionMessage || effectiveComment,
                        revisionItems,
                    }
                    : {}),
            };
            if (!idOrNumber || !toState) {
                return res.status(400).json({
                    success: false,
                    error: 'application id and toState are required',
                });
            }
            if (force && (!reasonCode || !comment)) {
                return res.status(400).json({
                    success: false,
                    error: 'force transition requires reasonCode and comment',
                });
            }
            // The application inside the caller's visibility (organization, and for an
            // inspector the audits assigned to it).
            const application = await applicationService.findFirstWithWhere({
                where: withVisibility(
                    {
                        OR: [{ id: idOrNumber }, { applicationNumber: idOrNumber }],
                        isDeleted: false,
                    },
                    req.user,
                ),
                select: {
                    id: true,
                    applicationNumber: true,
                    healthId: true,
                    status: true,
                    formData: true,
                    workflowHistory: true,
                    reviewerId: true,
                    // auditorId retained for queue/visibility context (the former
                    // ISO 17065 §7.6 two-person check was removed 2026-06-05).
                    auditorId: true,
                },
            });
            if (!application) {
                return res.status(404).json({
                    success: false,
                    error: 'Application not found',
                });
            }
            const currentState = workflowTransitionService.resolveStateFromApplication(application);
            const currentFormData = obj(application.formData);

            const ownDoor = EDGE_DOOR[`${currentState}->${requestedState}`];
            if (ownDoor) {
                const row = lookupErrorCode(ownDoor);
                return res.status(row.httpStatus).json({
                    success: false, code: row.code, error: row.code, message: row.messageTh, messageTh: row.messageTh,
                });
            }
            if (!force && refuseUnlessAssignedInspector(res, application, req.user)) { return undefined; }

            const markAsCancelledExpired = async (expiredReason, fromState) => {
                const ts = new Date().toISOString();
                await writeApplicationStatus({
                    prisma,
                    applicationId: application.id,
                    fromStatus: application.status,
                    toStatus: 'EXPIRED',
                    actorId: req.user.id,
                    actorRole: req.user.canonicalRole || req.user.role || null,
                    reason: expiredReason === 'REVISION_OVERDUE' ? 'REVISION_DEADLINE_EXPIRED' : 'CAR_DEADLINE_EXPIRED',
                    additionalData: {
                        updatedBy: req.user.id,
                        formData: {
                            ...currentFormData,
                            workflowState: 'EXPIRED',
                            workflowStateUpdatedAt: ts,
                            canceledExpiredAt: ts,
                            cancelReason: expiredReason,
                        },
                        workflowHistory: [
                            ...arr(application.workflowHistory),
                            {
                                timestamp: ts,
                                action: expiredReason === 'REVISION_OVERDUE'
                                    ? 'REVISION_DEADLINE_EXPIRED'
                                    : 'CAR_DEADLINE_EXPIRED',
                                fromState,
                                toState: 'EXPIRED',
                                actorId: req.user.id,
                                actorRole: req.user.canonicalRole || req.user.role || null,
                            },
                        ],
                    },
                });

                if (expiredReason === 'REVISION_OVERDUE') {
                    // adminApplicationService.bulkUpdateRevisionDeadlineStatus —
                    // replaces prisma.revisionDeadline.updateMany.
                    await adminApplicationService.bulkUpdateRevisionDeadlineStatus({
                        applicationId: application.id,
                        fromStatuses: ['PENDING', 'EXTENDED'],
                        data: { status: 'FAILED', updatedBy: req.user.id },
                    });
                }
            };

            if (!force && currentState === 'REVISION_REQUESTED' && requestedState === 'ASSIGNED_FOR_REVIEW') {
                const dueAt = getRevisionDueAt(currentFormData);
                if (dueAt && new Date() > dueAt) {
                    await markAsCancelledExpired('REVISION_OVERDUE', currentState);
                    return res.status(400).json({
                        success: false,
                        error: 'Revision deadline exceeded. Application has been cancelled.',
                    });
                }
            }

            if (!force && currentState === 'CAR_PENDING' && requestedState === 'CAR_REVIEWING') {
                const carDueAt = getCarDueAt(currentFormData);
                if (carDueAt && new Date() > carDueAt) {
                    await markAsCancelledExpired('CAR_OVERDUE', currentState);
                    return res.status(400).json({
                        success: false,
                        error: 'CAR deadline exceeded. Application has been cancelled.',
                    });
                }
            }

            const transition = workflowTransitionService.buildTransitionUpdate({
                application,
                toState,
                actorId: req.user.id,
                actorRole: req.user.canonicalRole,
                reasonCode,
                comment: effectiveComment,
                metadata: transitionMetadata,
                force,
            });

            // Use the canonical writer instead of a direct prisma.update so
            // every transition spawns its corresponding work-activity row
            // (ADR-016 Phase 1A) and cancels open activities on terminal
            // states (REJECTED / EXPIRED / CERTIFIED). Bypassing this
            // wrapper meant the work queue stayed populated with rows for
            // applications that had already moved on, and the new-stage
            // owner saw nothing in their queue for the freshly-arrived
            // transition. transition.updateData already has the right
            // shape; we just split status off so writeApplicationStatus
            // gets toStatus separately.
            const { status: toStatus, ...transitionExtras } = transition.updateData;
            // A1 (integrity-audit 2026-07-06): an ADMIN `force` transition bypasses
            // the role/edge gate, so a FORCED landing on AUDIT_PASSED (or APPROVED)
            // must NOT let the writer's cert hook auto-mint a certificate with no
            // fresh audit — that is the single-auditor SoD back-door. This is the
            // 4th sibling of the 3 admin force/revert paths that already pass
            // autoIssueCertificate:false (admin.js, admin/applications.js,
            // admin-application-service.js force+revert). The legitimate issuance is
            // the approver's decision file, which this door refuses above.
            const writeArgs = {
                applicationId: application.id,
                fromStatus: application.status,
                toStatus,
                actorId: req.user.id,
                actorRole: req.user.canonicalRole || req.user.role || null,
                reason: reasonCode || `WORKFLOW_${transition.nextState}`,
                additionalData: transitionExtras,
                autoIssueCertificate: !force,
                // An admin closing as CANCELLED names a reason from the fixed list (order 35).
                closureReasonCode: req.body?.closureReasonCode ?? null,
            };

            // Full-system audit area H (2026-07-11): this canonical DOCUMENT_REVIEWER
            // + admin-force transition path previously wrote its ONLY AuditLog row
            // AFTER commit, best-effort (workflow-side-effects.logTransitionAudit,
            // swallows failure) — so a DOC_APPROVED/REVISION_REQUESTED/APPROVED/force
            // transition could commit with NO immutable hash-chained attribution on a
            // transient fault. Wire the same in-$transaction onAudit hook every
            // consequential sibling uses (auditor cert path #646 audits.js, admin
            // force/revert admin-application-service.js) so the transition row is
            // written through the tx, atomic with the status flip. (The post-commit
            // rich WORKFLOW_TRANSITION event below is kept as extra operational
            // context — additive, no behavior removed.)
            const transitionAuditMetadata = {
                applicationNumber: application.applicationNumber,
                previousWorkflowState: transition.previousState,
                nextWorkflowState: transition.nextState,
                reasonCode: reasonCode || null,
                comment: effectiveComment || null,
                force,
            };

            // A role reversing a verdict along its own edge (the inspector or the
            // certificate approver: AUDIT_PASSED -> CAR_REVIEWING) voids any live
            // certificate in the same transaction, so /verify and the QR never report a
            // certificate for an application under corrective action. `force` is admin
            // recovery and never revokes (order 34(4): the certificate approver suspends
            // or revokes); the writer refuses a person leaving the certificate track off
            // their own edge, so a force never strands a valid certificate either.
            const CERT_LIVE = new Set(['AUDIT_PASSED', 'APPROVED', 'CERTIFIED']);
            const CERT_KEEP = new Set(['APPROVED', 'CERTIFIED']);
            const isCertVoidingReversal = !force
                && CERT_LIVE.has(transition.previousState) && !CERT_KEEP.has(transition.nextState);

            if (isCertVoidingReversal) {
                await prisma.$transaction(async (tx) => {
                    await writeApplicationStatus({
                        ...writeArgs,
                        prisma: tx,
                        onAudit: statusTransitionAuditHook({ tx, metadata: transitionAuditMetadata }),
                    });
                    await certificateService.revokeCertificateForApplication(application.id, {
                        revokedBy: req.user.id,
                        reason: `Audit pass reversed: ${effectiveComment || reasonCode || 'CAR review'}`,
                        prisma: tx,
                    });
                });
            } else {
                await prisma.$transaction(async (tx) => {
                    // The inspector's PASS through this door asks the same onsite-evidence
                    // question as the job sheet and the audit-result door; a refusal writes
                    // nothing. `force` is admin recovery, which this door has always kept
                    // outside the evidence rules.
                    if (transition.nextState === 'AUDIT_PASSED' && !force) {
                        assertCarEvidenceToJudge({ fromStatus: currentState, verdict: 'PASS', formData: application.formData, inspectorId: writeArgs.actorId });
                        await assertOnsiteEvidenceForPass({ prisma: tx, application });
                    }
                    if (transition.nextState === 'CAR_PENDING') {
                        await requestOnsiteCorrection(tx, {
                            application, fromStatus: application.status, actorId: writeArgs.actorId, actorRole: writeArgs.actorRole,
                            reason: writeArgs.reason, additionalData: transitionExtras, note: effectiveComment,
                            onAudit: statusTransitionAuditHook({ tx, metadata: transitionAuditMetadata }),
                        });
                        return;
                    }
                    await writeApplicationStatus({
                        ...writeArgs,
                        prisma: tx,
                        onAudit: statusTransitionAuditHook({ tx, metadata: transitionAuditMetadata }),
                    });
                });
            }
            if (transition.nextState === 'CANCELLED') { await notifyApplicationClosedByAdmin({ applicationId: application.id }); }
            // Re-fetch with the original select shape since writeApplicationStatus
            // returns the full row. Downstream side-effects below
            // (handleRevisionDeadlines, sendTransitionNotifications,
            // logTransitionAudit) all read from
            // this `updated` reference.
            // applicationService.getById — replaces prisma.application.findUnique
            // re-fetch after writeApplicationStatus.
            const updated = await applicationService.getById(application.id, {
                select: {
                    id: true,
                    applicationNumber: true,
                    status: true,
                    updatedAt: true,
                    updatedBy: true,
                },
            });

            // Persist ApplicationComment for revision/CAR transitions (audit trail)
            if (['REVISION_REQUESTED', 'CAR_PENDING'].includes(transition.nextState) && effectiveComment) {
                // applicationService.isApplicationCommentModelAvailable +
                // applicationService.createApplicationCommentIfAvailable —
                // replaces direct prisma.applicationComment.create. Split into
                // two calls so the "model unavailable" branch still emits the
                // same dedicated warning as before.
                if (applicationService.isApplicationCommentModelAvailable()) {
                    await applicationService.createApplicationCommentIfAvailable({
                        applicationId: application.id,
                        authorId: req.user.id,
                        role: req.user.canonicalRole || req.user.role || 'PROVIDER',
                        // commentType (DOC_REVISION/FIELD_CAR) + revisionItems are
                        // persisted in the transition metadata/formData; the comment
                        // row carries the human-readable text.
                        content: effectiveComment,
                    }).catch((commentErr) => {
                        logger.warn('[provider] ApplicationComment creation failed', {
                            message: commentErr.message,
                            applicationId: application.id,
                        });
                    });
                } else {
                    logger.warn('[provider] ApplicationComment model unavailable, skip comment persistence', {
                        applicationId: application.id,
                        transition: transition.nextState,
                    });
                }
            }
            // ─── Side Effects (extracted to workflow-side-effects.js) ───
            const sideEffects = require('./workflow-side-effects');

            await sideEffects.handleRevisionDeadlines(prisma, {
                application, transition, reqUser: req.user, getRevisionDueAt,
                updated, arr, logger,
            });

            await sideEffects.sendTransitionNotifications(prisma, logger, {
                application, transition,
                getRevisionDueAt, revisionCategory, revisionMessage, effectiveComment, revisionItems,
            });

            await sideEffects.logTransitionAudit(auditLogger, logger, {
                AuditCategory, AuditSeverity, ResourceType,
                application, transition, reqUser: req.user,
                reasonCode, effectiveComment, force,
                getRequestIp, req,
            });

            // Without the filing: it carries national IDs, which leave the server masked or not at all
            // (order 10). The auto-chain above may have laid formData on `updated`.
            const { formData: _filing, ...shownApplication } = updated || {};
            return res.json({
                success: true,
                data: {
                    application: shownApplication,
                    transition: {
                        fromState: transition.previousState,
                        toState: transition.nextState,
                        fromStatus: application.status,
                        toStatus: transition.nextLegacyStatus,
                    },
                },
            });
        } catch (error) {
            // Separation of duties raised by the status writer (reviewer == inspector, no force bypass).
            if (answerSeparation(res, error)) { return undefined; }
            if ((error?.code === 'CAR_EVIDENCE_MISSING' || error?.code === 'CAR_EVIDENCE_NOT_OPENED') && answerTypedRefusal(res, error)) { return undefined; }
            // Workflow transition-guard errors (buildTransitionUpdate throws plain
            // Errors with these messages, no .status/.code) → 422 INVALID_TRANSITION,
            // matching the cert-workflow contract + the sibling auditor.js handler.
            // A genuine server fault (unmatched message) stays 500.
            const evidenceRefusal = onsiteEvidenceRefusal(error);
            if (evidenceRefusal) {
                logger.warn('[provider] workflow transition refused on onsite evidence', { code: error.code });
                return res.status(evidenceRefusal.status).json({
                    ...evidenceRefusal.body,
                    message: evidenceRefusal.body.messageTh,
                });
            }
            const msg = String(error.message || '');
            const isTransitionGuard = /cannot transition|Invalid transition|already in workflow state|Only admin can force|Unknown actor role|Invalid workflow state|requires a mandatory comment/i.test(msg);
            const statusCode = error.status || (isTransitionGuard ? 422 : 500);
            logger.error('[provider] workflow transition failed', { message: error.message });
            // Surface the transition-guard reason (422 INVALID_TRANSITION) — the FE
            // error-translator keys off this string. On a genuine 500, return a
            // generic message so an internal/Prisma error never leaks to the client
            // (the real cause is logged above).
            return res.status(statusCode).json({
                success: false,
                error: 'Workflow transition failed',
                code: error.code || (isTransitionGuard ? 'INVALID_TRANSITION' : undefined),
                message: statusCode >= 500 ? 'Workflow transition failed' : error.message,
            });
        }
    },
];

module.exports = {
    applicationsWorkflowTransitions,
    EDGE_DOOR,
};

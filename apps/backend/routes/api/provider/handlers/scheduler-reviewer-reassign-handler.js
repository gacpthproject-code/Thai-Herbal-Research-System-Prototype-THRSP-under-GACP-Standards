/**
 * Scheduler/Admin: Reassign Document Reviewer
 *
 * The reviewer-side mirror of routes/api/audit/audits-reassign.js. Moves the
 * assigned document reviewer (Application.reviewerId) on an application whose
 * document review is in flight (ASSIGNED_FOR_REVIEW) to a different reviewer —
 * WITHOUT changing the workflow state (a columns + formData metadata update
 * only, exactly like the auditor reassign). SCHEDULER + ADMIN only.
 *
 * Why this exists: prior to this, only the AUDITOR could be reassigned. If the
 * assigned document reviewer was unavailable, a scheduler had no first-class
 * way to hand the work to someone else — closing that accountability gap is
 * Phase 1B-part-3 of the work-distribution ledger.
 */

const { assignedOfficerName } = require('../../../../shared/assigned-officer-name');
const {
    authenticateProvider,
    requireRole,
    prisma,
    logger,
    normalizeRole,
    CANONICAL_ROLES,
    getRequestIp,
    auditLogger,
    AuditCategory,
    AuditSeverity,
    ResourceType,
    applicationService,
} = require('./scheduler-handler-deps');
const { assertAssignableStaff } = require('../../../../services/assignable-staff-service');
const { organizationScope, answerNoOrganization, DENY_ALL } = require('../../../../shared/application-visibility');
const { trackedUpdate } = require('../../../../services/tracked-writer');
const { createNotification } = require('../../../../services/notification-service');
const { notifyApplicationParties } = require('../../../../services/notification/application-parties');
const workActivityService = require('../../../../services/work-activity-service');
const { recordAssignment } = require('../../../../services/assignment-ledger-service');
const { lookup: lookupErrorCode } = require('../../../../shared/error-codes');
// A reviewer may not also inspect the same application (operator ruling 2026-10-05).
const { assertReviewerIsNotInspector, answerSeparation } = require('../../../../shared/reviewer-inspector-separation');
// The new reviewer's workload cap (order 56(1) 2.1, 2.2).
const {
    assertWithinCapOrStated, recordStatedReasons, statedReasonsRecord, answerAssignmentRefusal,
} = require('../../../../services/assignment-policy');

// Only scheduler and admin roles may reassign reviewers (mirror audits-reassign.js).
// NOTE: the unit test scheduler-reviewer-reassign-auth.test.js re-declares this
// same list — keep them in sync.
const REASSIGN_ROLES = [CANONICAL_ROLES.SYSTEM_ADMIN_DTAM, CANONICAL_ROLES.DISPATCHER];

// Reviewer reassignment is valid while the document review is in flight — i.e.
// the reviewerId is still the active binding. That covers BOTH ASSIGNED_FOR_REVIEW
// AND REVISION_REQUESTED: when a review goes to REVISION_REQUESTED the same
// reviewerId stays bound (the resubmit transition REVISION_REQUESTED→
// ASSIGNED_FOR_REVIEW does not re-assign), so if that reviewer becomes
// unavailable during the 5-working-day revision window the scheduler must be
// able to swap them (else the app can only expire → re-apply → re-pay Phase 1).
// Waiver-reopen (2026-07-08): EXPIRED included so a departed reviewer's
// expired application can be handed to a new inspector who can then open
// the reopen request (initiator dead-spot, decision-doc risk #8).
const REASSIGNABLE_STATES = new Set(['ASSIGNED_FOR_REVIEW', 'REVISION_REQUESTED', 'EXPIRED']);

// Roles a target user must hold to receive a document-review assignment
// (mirror scheduler-assign-reviewer-handler eligibility).
// Document review goes to a document reviewer only (order 27); an admin is not in the workflow.
const ELIGIBLE_REVIEWER_ROLES = [CANONICAL_ROLES.DOCUMENT_REVIEWER];

/**
 * GET /api/provider/scheduler/reviewer-assignments/reassignable
 * Applications currently in ASSIGNED_FOR_REVIEW whose reviewer can be swapped.
 */
const schedulerReassignableReviewers = [
    authenticateProvider,
    // 2026-09-07 — this read had NO role guard, only authentication, while the POST
    // that acts on its output is limited to scheduler/admin (REASSIGN_ROLES, checked
    // inline below). So the list of applications whose reviewer can be swapped was
    // readable by every staff account, finance included. A listing and the action it
    // feeds have to be guarded by the same names, or the guard on the action is a
    // formality — the list IS the sensitive part.
    requireRole(REASSIGN_ROLES),
    async (req, res) => {
        try {
            const organizationWhere = organizationScope(req.user);
            if (organizationWhere === DENY_ALL) { return answerNoOrganization(res); }
            const applications = await applicationService.listReassignableReviewers(organizationWhere);

            const formatted = applications.map((app) => {
                const formData = typeof app.formData === 'object' && app.formData ? app.formData : {};
                return {
                    id: app.id,
                    applicationNumber: app.applicationNumber,
                    applicantName: app.applicant
                        ? `${app.applicant.firstName} ${app.applicant.lastName}`
                        : 'ไม่ระบุ',
                    plantType: formData.plantName || 'ไม่ระบุ',
                    status: app.status,
                    currentReviewerId: app.reviewerId,
                    currentReviewer: assignedOfficerName({
                        officerId: app.reviewerId,
                        officer: app.reviewer,
                        storedName: formData.reviewerName,
                    }),
                    updatedAt: app.updatedAt,
                };
            });

            return res.json({ success: true, data: { applications: formatted } });
        } catch (error) {
            logger.error('[ReassignableReviewers] Error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch applications' });
        }
    },
];

/**
 * POST /api/provider/scheduler/reviewer-assignments/:id/reassign
 * Body: { newReviewerId, reason }
 */
const schedulerReviewerReassign = [
    authenticateProvider,
    async (req, res) => {
        // Only scheduler/admin can reassign (mirror audits-reassign.js:69-76).
        const callerRole = normalizeRole(req.user?.role);
        if (!callerRole || !REASSIGN_ROLES.includes(callerRole)) {
            return res.status(403).json({
                success: false,
                error: 'Only schedulers and admins can reassign reviewers',
            });
        }
        try {
            const { id } = req.params;
            const { newReviewerId, reason } = req.body;

            if (!newReviewerId || !reason) {
                return res.status(400).json({
                    success: false,
                    error: 'newReviewerId and reason are required',
                });
            }

            // The application inside the caller's organization, and the new reviewer
            // inside the application's (order 17): an unknown organization is refused.
            const organizationWhere = organizationScope(req.user);
            if (organizationWhere === DENY_ALL) { return answerNoOrganization(res); }
            const application = await applicationService.findAuditApplication({
                where: { id, ...organizationWhere },
                include: {
                    applicant: { select: { id: true, firstName: true, lastName: true } },
                },
            });

            if (!application) {
                return res.status(404).json({ success: false, error: 'Application not found' });
            }

            // State gate (non-negotiable): a reviewer can only be swapped while
            // the document review is in flight (reviewerId is the active binding) —
            // ASSIGNED_FOR_REVIEW or REVISION_REQUESTED. Outside these the reviewerId
            // is no longer the active assignment.
            if (!REASSIGNABLE_STATES.has(application.status)) {
                return res.status(409).json({
                    success: false,
                    error: `Application is in ${application.status}, expected one of: ${[...REASSIGNABLE_STATES].join(', ')}`,
                });
            }

            let newReviewer;
            try {
                newReviewer = await assertAssignableStaff({
                    userId: newReviewerId, roles: ELIGIBLE_REVIEWER_ROLES, organizationId: application.organizationId,
                });
            } catch (staffError) {
                if (staffError.code !== 'STAFF_NOT_ASSIGNABLE') { throw staffError; }
                return res.status(staffError.statusCode).json({ success: false, code: staffError.code, error: staffError.messageTh });
            }

            try {
                assertReviewerIsNotInspector({ reviewerId: newReviewerId, auditorId: application.auditorId });
            } catch (sodError) {
                if (answerSeparation(res, sodError)) { return undefined; }
                throw sodError;
            }

            const oldReviewerId = application.reviewerId;
            const currentFormData = typeof application.formData === 'object' && application.formData
                ? application.formData
                : {};

            // Route the reviewerId change through trackedUpdate so the field
            // change is recorded in the AuditLog via the canonical writer
            // (mirror audits-reassign.js:135-180). The formData metadata patch
            // piggybacks in the same atomic update without change tracking.
            //
            // Compare-and-set on what this swap was decided on, the status and the reviewer, and the
            // document-review task moves in the same transaction (security review 2026-10-09 F6): a
            // decision or another swap that committed first refuses this one, and the application and
            // its task never name two different reviewers.
            try {
                await prisma.$transaction(async (tx) => {
                    const overCap = await assertWithinCapOrStated(tx, {
                        role: CANONICAL_ROLES.DOCUMENT_REVIEWER, officerId: newReviewerId, excludeApplicationId: application.id,
                        overCap: req.body?.overCap,
                    });
                    await trackedUpdate({
                        prisma: tx,
                        model: 'application',
                        where: { id, status: application.status, reviewerId: oldReviewerId ?? null },
                        data: {
                            reviewerId: newReviewerId,
                            formData: {
                                ...currentFormData,
                                reviewerName: `${newReviewer.firstName} ${newReviewer.lastName}`,
                                PROVIDERAssignment: {
                                    ...(currentFormData.PROVIDERAssignment && typeof currentFormData.PROVIDERAssignment === 'object'
                                        ? currentFormData.PROVIDERAssignment : {}),
                                    reviewerId: newReviewerId,
                                    reviewerName: `${newReviewer.firstName} ${newReviewer.lastName}`,
                                    assignedAt: new Date().toISOString(),
                                    assignedBy: req.user?.id || null,
                                },
                                _reviewerReassignmentHistory: [
                                    ...(Array.isArray(currentFormData._reviewerReassignmentHistory)
                                        ? currentFormData._reviewerReassignmentHistory
                                        : []),
                                    {
                                        from: oldReviewerId,
                                        to: newReviewerId,
                                        reason,
                                        statedReasons: statedReasonsRecord({ overCap }),
                                        reassignedBy: req.user?.id,
                                        reassignedAt: new Date().toISOString(),
                                    },
                                ],
                            },
                        },
                        trackedFields: ['reviewerId'],
                        beforeState: { reviewerId: oldReviewerId },
                        actorId: req.user?.id || null,
                        actorRole: req.user?.canonicalRole || req.user?.role || null,
                        reason: `REVIEWER_REASSIGNED: ${reason || ''}`.trim(),
                        onAudit: async ({ recordId, changes, actorId, actorRole, reason: auditReason }) => {
                            for (const c of changes) {
                                await auditLogger.log({
                                    category: AuditCategory.APPLICATION,
                                    severity: AuditSeverity.HIGH,
                                    action: `application.${c.field}.changed`,
                                    resourceType: ResourceType.APPLICATION,
                                    resourceId: recordId,
                                    actorId,
                                    actorRole,
                                    metadata: {
                                        field: c.field,
                                        before: c.before,
                                        after: c.after,
                                        reason: auditReason,
                                    },
                                });
                            }
                        },
                    });

                    // The document-review task goes with the case: the new reviewer holds it, the old one
                    // no longer sees it in their task list or carries its due date.
                    await workActivityService.reassignOpenWork({
                        prisma: tx,
                        applicationId: application.id,
                        workType: 'DOC_REVIEW',
                        toUserId: newReviewerId,
                        byUserId: req.user?.id || null,
                        organizationId: application.organizationId,
                    });
                    await recordStatedReasons(tx, {
                        actor: req.user, application, officerId: newReviewerId, role: CANONICAL_ROLES.DOCUMENT_REVIEWER, overCap,
                    });
                });
            } catch (swapError) {
                if (answerAssignmentRefusal(res, swapError)) { return undefined; }
                if (swapError?.code !== 'P2025') { throw swapError; }
                const row = lookupErrorCode('APPLICATION_STATE_CHANGED');
                return res.status(row.httpStatus).json({ success: false, code: row.code, error: row.messageTh });
            }

            // Notifications (best-effort). No REVIEWER_* NotifyType exists, so —
            // like scheduler-assign-reviewer-handler — emit generic 'INFO'
            // notifications with Thai copy to the new reviewer, the old reviewer
            // (if any), and the applicant.
            await Promise.all([
                createNotification({
                    userId: newReviewerId,
                    type: 'INFO',
                    title: 'ได้รับมอบหมายตรวจเอกสาร (มอบหมายใหม่)',
                    message: `คำขอ ${application.applicationNumber}: คุณได้รับมอบหมายให้ตรวจเอกสาร (มอบหมายใหม่)`,
                    priority: 2,
                    data: {
                        applicationId: application.id,
                        applicationNumber: application.applicationNumber,
                        action: 'REVIEWER_REASSIGNED',
                    },
                }).catch((e) => logger.warn('[reviewer-reassign] new-reviewer notify failed:', e.message)),
                oldReviewerId
                    ? createNotification({
                        userId: oldReviewerId,
                        type: 'INFO',
                        title: 'การมอบหมายตรวจเอกสารถูกเปลี่ยน',
                        message: `คำขอ ${application.applicationNumber}: งานตรวจเอกสารถูกมอบหมายให้ผู้ตรวจท่านอื่น`,
                        data: {
                            applicationId: application.id,
                            applicationNumber: application.applicationNumber,
                            action: 'REVIEWER_REASSIGNED_AWAY',
                        },
                    }).catch((e) => logger.warn('[reviewer-reassign] old-reviewer notify failed:', e.message))
                    : Promise.resolve(),
                // The applicant and the holder (order 27: a dispatcher's notice reaches both).
                notifyApplicationParties(application.id, {
                    type: 'INFO',
                    title: 'เปลี่ยนผู้ตรวจเอกสารของคำขอแล้ว',
                    message: `คำขอเลขที่ ${application.applicationNumber}: เปลี่ยนผู้ตรวจเอกสารแล้ว รอผลการพิจารณา`,
                    data: { applicationNumber: application.applicationNumber, action: 'REVIEWER_CHANGED' },
                }).catch((e) => logger.warn('[reviewer-reassign] applicant notify failed:', e.message)),
            ]);

            // Resource-level audit row (mirror scheduler-assign-reviewer-handler).
            try {
                auditLogger.log({
                    action: 'REVIEWER_REASSIGNED',
                    category: AuditCategory.APPLICATION,
                    severity: AuditSeverity.MEDIUM,
                    resourceType: ResourceType.APPLICATION,
                    resourceId: application.id,
                    actorId: req.user.id,
                    actorRole: req.user.canonicalRole || req.user.role,
                    ip: getRequestIp(req),
                    metadata: {
                        applicationNumber: application.applicationNumber,
                        fromReviewerId: oldReviewerId,
                        toReviewerId: newReviewerId,
                        reason,
                    },
                });
            } catch (_auditErr) {
                // non-fatal
            }

            // Work-distribution ledger (best-effort; never blocks the reassignment).
            // source = the channel (SCHEDULER reassign route); the actor (scheduler
            // vs admin) is captured in assignedByUserId, not in source.
            await recordAssignment({
                prisma,
                entityType: 'APPLICATION',
                entityId: application.id,
                action: 'REASSIGN',
                assigneeUserId: newReviewerId,
                assignedByUserId: req.user.id,
                role: 'document_reviewer',
                previousAssigneeUserId: oldReviewerId || null,
                source: 'SCHEDULER',
                reason,
                organizationId: application.organizationId,
            });

            logger.info(
                `[reviewer-reassign] ${application.applicationNumber} reviewer ${oldReviewerId || '∅'} → ${newReviewerId} by ${req.user.id}`,
            );

            return res.json({
                success: true,
                message: 'Reviewer reassigned successfully',
                data: {
                    applicationId: application.id,
                    newReviewer: {
                        id: newReviewer.id,
                        name: `${newReviewer.firstName} ${newReviewer.lastName}`,
                    },
                },
            });
        } catch (error) {
            logger.error('[reviewer-reassign] error:', error);
            return res.status(error.status || 500).json({
                success: false,
                error: 'Failed to reassign reviewer',
            });
        }
    },
];

module.exports = { schedulerReviewerReassign, schedulerReassignableReviewers };

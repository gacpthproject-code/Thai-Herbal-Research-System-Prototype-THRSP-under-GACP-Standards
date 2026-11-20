/**
 * Scheduler: Assign Document Reviewer
 *
 * Transitions an application from DOC_FEE_PAID → ASSIGNED_FOR_REVIEW
 * by assigning a document reviewer.
 */

const {
    authenticateProvider,
    logger,
    PERMISSIONS,
    requireCanonicalPermission,
    prisma: _prisma,
    workflowTransitionService,
    getApplicantName,
    getRequestIp,
    auditLogger,
    AuditCategory,
    AuditSeverity,
    ResourceType,
    normalizeRole,
} = require('./scheduler-handler-deps');
const { buildWorkflowEvent: _buildWorkflowEvent } = require('../../../../shared/workflow-event-builder');
const { safeObject, safeArray: _safeArray } = require('../../../../shared/safe-coerce');
const { createNotification } = require('../../../../services/notification-service');
const { notifyApplicationParties } = require('../../../../services/notification/application-parties');
// The application + reviewer lookups go through service modules; the status
// write goes through the one status writer, never around it.
const applicationService = require('../../../../services/application-service');
const providerUserService = require('../../../../services/provider-user-service');
const { assertAssignableStaff } = require('../../../../services/assignable-staff-service');
const { recordAssignment } = require('../../../../services/assignment-ledger-service');
const { CANONICAL_ROLES } = require('../../../../shared/canonical-rbac');
const { writeApplicationStatus } = require('../../../../services/application-status-writer');
const { answerStateChanged } = require('../../../../shared/api-response');
const { organizationScope, answerNoOrganization, DENY_ALL } = require('../../../../shared/application-visibility');
// A reviewer may not also inspect the same application (operator ruling 2026-10-05).
const { assertReviewerIsNotInspector, answerSeparation } = require('../../../../shared/reviewer-inspector-separation');
// The reviewer's workload cap (order 56(1) 2.1, 2.2).
const {
    assertWithinCapOrStated, recordStatedReasons, statedReasonsRecord, answerAssignmentRefusal,
} = require('../../../../services/assignment-policy');

// บทบาทที่รับงานตรวจเอกสารได้ · ผู้ตรวจพื้นที่ไม่อยู่ในรายชื่อ: งานตรวจเอกสารเป็นของผู้ตรวจเอกสาร
// คนเดียว (คำสั่ง 27, operator 2026-10-06) · ผู้อนุมัติใบรับรองก็ไม่อยู่: เขามีแต่หน้าที่ตัดสิน
// Document review goes to a document reviewer only (order 27); an admin is not in the workflow.
const ELIGIBLE_REVIEWER_ROLES = [CANONICAL_ROLES.DOCUMENT_REVIEWER];

/** ตัวเลือกในดรอปดาวน์ผู้ตรวจเอกสาร — ไม่รวม admin ซึ่งรับงานได้แต่ไม่ใช่ตัวเลือกปกติ */
const REVIEWER_PICKLIST_ROLES = [CANONICAL_ROLES.DOCUMENT_REVIEWER];

const schedulerAssignReviewer = [
    authenticateProvider,
    requireCanonicalPermission(PERMISSIONS.APPLICATION_SCHEDULE),
    async (req, res) => {
        try {
            const { applicationId, reviewerId } = req.body;

            if (!applicationId || !reviewerId) {
                return res.status(400).json({
                    success: false,
                    error: 'applicationId and reviewerId are required',
                });
            }

            // 1. Find the application
            // Order 17: the lookup itself is inside the caller's organization, so an id
            // from another organization answers exactly like one that does not exist.
            const organizationWhere = organizationScope(req.user);
            if (organizationWhere === DENY_ALL) { return answerNoOrganization(res); }
            const application = await applicationService.findFirstWithWhere({
                where: {
                    OR: [{ id: applicationId }, { applicationNumber: applicationId }],
                    isDeleted: false,
                    ...organizationWhere,
                },
                select: {
                    id: true,
                    applicationNumber: true,
                    status: true,
                    version: true,
                    healthId: true,
                    formData: true,
                    workflowHistory: true,
                    organizationId: true,
                    auditorId: true,
                    applicant: { select: { id: true, firstName: true, lastName: true } },
                },
            });

            if (!application) {
                return res.status(404).json({ success: false, error: 'Application not found' });
            }

            // 2. Verify application is in DOC_FEE_PAID state
            const currentState = workflowTransitionService.resolveStateFromApplication(application);
            if (currentState !== 'DOC_FEE_PAID') {
                return res.status(409).json({
                    success: false,
                    error: `Application is in ${currentState}, expected DOC_FEE_PAID`,
                });
            }

            // 3. The reviewer: an active account of an eligible role in the application's
            //    own organization (order 17). Refused as STAFF_NOT_ASSIGNABLE otherwise.
            let reviewer;
            try {
                reviewer = await assertAssignableStaff({
                    userId: reviewerId, roles: ELIGIBLE_REVIEWER_ROLES, organizationId: application.organizationId,
                });
            } catch (staffError) {
                if (staffError.code !== 'STAFF_NOT_ASSIGNABLE') { throw staffError; }
                return res.status(staffError.statusCode).json({ success: false, code: staffError.code, error: staffError.messageTh });
            }

            // 3b. Separation of duties: whoever is already this application's field inspector
            //     cannot also read its papers. (The inspector side is refused at inspector
            //     assignment when the reviewer comes first — whichever is second is refused.)
            try {
                assertReviewerIsNotInspector({ reviewerId: reviewer.id, auditorId: application.auditorId });
            } catch (sodError) {
                if (answerSeparation(res, sodError)) { return undefined; }
                throw sodError;
            }

            // 4. Build transition via canonical service (edge + role guards), then
            //    write it through the status writer, which refuses an unpaid M1.
            const transition = workflowTransitionService.buildTransitionUpdate({
                application,
                toState: 'ASSIGNED_FOR_REVIEW',
                actorId: req.user.id,
                actorRole: req.user.canonicalRole || req.user.role,
                metadata: { reviewerId: reviewer.id, reviewerName: getApplicantName(reviewer) },
            });
            const { status: toStatus, ...transitionExtras } = transition.updateData;

            // 5. The reviewer goes on the canonical Application.reviewerId column (the
            //    visibility filter and separation of duties read it) and into formData
            //    (the REV-11 ownership check in workflow-transitions-handler).
            //    Past the reviewer's workload cap the assignment goes ahead only with the
            //    dispatcher's confirmation and reason, counted and written in one transaction.
            const formData = safeObject(application.formData);
            const updated = await _prisma.$transaction(async (tx) => {
                const overCap = await assertWithinCapOrStated(tx, {
                    role: CANONICAL_ROLES.DOCUMENT_REVIEWER, officerId: reviewer.id, excludeApplicationId: application.id,
                    overCap: req.body?.overCap,
                });
                const written = await writeApplicationStatus({
                    prisma: tx,
                    applicationId: application.id,
                    fromStatus: application.status,
                    toStatus,
                    // A refund cancellation or a second assigner committed since the read above must not be overwritten.
                    expectedVersion: application.version,
                    actorId: req.user.id,
                    actorRole: req.user.canonicalRole || req.user.role,
                    reason: 'SCHEDULER_ASSIGN_REVIEWER',
                    additionalData: {
                        ...transitionExtras,
                        reviewerId: reviewer.id,
                        formData: {
                            ...transitionExtras.formData,
                            PROVIDERAssignment: {
                                ...safeObject(formData.PROVIDERAssignment),
                                reviewerId: reviewer.id,
                                reviewerName: getApplicantName(reviewer),
                                assignedAt: new Date().toISOString(),
                                assignedBy: req.user.id,
                                statedReasons: statedReasonsRecord({ overCap }),
                            },
                        },
                    },
                });
                await recordStatedReasons(tx, {
                    actor: req.user, application, officerId: reviewer.id, role: CANONICAL_ROLES.DOCUMENT_REVIEWER, overCap,
                });
                return written;
            });

            // 7. Notify the reviewer, and the applicant with the holder (order 27: a dispatcher's
            //    notice reaches both). Parallel, both non-fatal.
            await Promise.all([
                createNotification({
                    userId: reviewer.id,
                    type: 'INFO',
                    title: 'ได้รับมอบหมายตรวจเอกสาร',
                    message: `คำขอ ${application.applicationNumber}: ได้รับมอบหมายให้ตรวจเอกสาร (${getApplicantName(application.applicant)})`,
                    priority: 2,
                    data: {
                        applicationId: application.id,
                        applicationNumber: application.applicationNumber,
                        action: 'REVIEWER_ASSIGNED',
                    },
                }).catch((notifyErr) => {
                    logger.warn('[scheduler] assign-reviewer reviewer notification failed:', notifyErr.message);
                }),
                notifyApplicationParties(application.id, {
                    type: 'INFO',
                    title: 'คำขอของคุณเข้าสู่ขั้นตอนตรวจเอกสาร',
                    message: `คำขอเลขที่ ${application.applicationNumber} ได้รับมอบหมายผู้ตรวจเอกสารแล้ว รอผลการพิจารณา`,
                    data: { applicationNumber: application.applicationNumber, action: 'ASSIGNED_FOR_REVIEW' },
                }).catch((notifyErr) => {
                    logger.warn('[scheduler] assign-reviewer applicant notification failed:', notifyErr.message);
                }),
            ]);

            // 8. Audit log
            try {
                auditLogger.log({
                    action: 'REVIEWER_ASSIGNED',
                    category: AuditCategory.APPLICATION,
                    severity: AuditSeverity.MEDIUM,
                    resourceType: ResourceType.APPLICATION,
                    resourceId: application.id,
                    actorId: req.user.id,
                    actorRole: req.user.canonicalRole || req.user.role,
                    ip: getRequestIp(req),
                    metadata: {
                        applicationNumber: application.applicationNumber,
                        reviewerId: reviewer.id,
                        reviewerName: getApplicantName(reviewer),
                        fromState: currentState,
                        toState: 'ASSIGNED_FOR_REVIEW',
                    },
                });
            } catch (_auditErr) {
                // non-fatal
            }

            // 9. Work-distribution ledger (best-effort; never blocks the assignment):
            //    scheduler pushed this document reviewer onto the application.
            await recordAssignment({
                prisma: _prisma,
                entityType: 'APPLICATION',
                entityId: application.id,
                action: 'ASSIGN',
                assigneeUserId: reviewer.id,
                assignedByUserId: req.user.id,
                role: 'document_reviewer',
                source: 'SCHEDULER',
                reason: `Reviewer assigned (${currentState} → ASSIGNED_FOR_REVIEW)`,
                organizationId: application.organizationId || req.user.organizationId,
            });

            logger.info(`[scheduler] Reviewer ${reviewer.id} assigned to ${application.applicationNumber} by ${req.user.id}`);

            return res.json({
                success: true,
                data: {
                    applicationId: updated.id,
                    applicationNumber: updated.applicationNumber,
                    status: updated.status,
                    reviewerId: reviewer.id,
                    reviewerName: getApplicantName(reviewer),
                },
            });
        } catch (error) {
            if (answerStateChanged(res, error) || answerAssignmentRefusal(res, error)) { return undefined; }
            // C2-04 (audit 2026-06-10): buildTransitionUpdate guard rejections are
            // client/state conditions → 422 INVALID_TRANSITION, not 500. Also stop
            // leaking the raw error.message (`details`) to the client on genuine faults.
            const msg = error?.message || '';
            const isTransitionGuard = /cannot transition|Invalid transition|already in workflow state|Only admin can force|Unknown actor role|Invalid workflow state|requires a comment|REQUIRES_COMMENT/i.test(msg);
            const refused = Number(error?.status) >= 400 && Number(error?.status) < 500;
            logger.error('[scheduler] assign-reviewer error:', error);
            return res.status(error.status || (isTransitionGuard ? 422 : 500)).json({
                success: false,
                error: isTransitionGuard || refused ? msg : 'Failed to assign reviewer',
                code: error.code || (isTransitionGuard ? 'INVALID_TRANSITION' : undefined),
            });
        }
    },
];

/**
 * GET /api/provider/scheduler/reviewers
 * Returns active document reviewers for assignment
 */
const schedulerReviewers = [
    authenticateProvider,
    requireCanonicalPermission(PERMISSIONS.APPLICATION_SCHEDULE),
    async (req, res) => {
        try {
            // F-REVIEWER-DROPDOWN-EMPTY (2026-08-18): a real-DB walk found live
            // rows still holding legacy role spellings (e.g. REVIEWER_AUDITOR) —
            // migration 20260801000000 did NOT collapse every row as this
            // comment used to claim. `reviewerRoles` stays canonical-only (the
            // role-filters-canonical-only.test.js contract pins that); the
            // legacy-casing defense now lives inside
            // listReviewerCandidates(), which reads the whole roster and
            // matches via normalizeRole() instead of an SQL `in` filter.
            const reviewerRoles = REVIEWER_PICKLIST_ROLES;
            // providerUserService.listReviewerCandidates — replaces
            // prisma.user.findMany for the dropdown.
            const organizationWhere = organizationScope(req.user);
            if (organizationWhere === DENY_ALL) { return answerNoOrganization(res); }
            const reviewers = await providerUserService.listReviewerCandidates(reviewerRoles, organizationWhere);

            return res.json({
                success: true,
                data: reviewers.map((r) => ({
                    id: r.id,
                    role: r.role,
                    canonicalRole: normalizeRole(r.role),
                    fullName: getApplicantName(r),
                })),
            });
        } catch (error) {
            logger.error('[scheduler] reviewers list error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch reviewers' });
        }
    },
];

module.exports = { schedulerAssignReviewer, schedulerReviewers };

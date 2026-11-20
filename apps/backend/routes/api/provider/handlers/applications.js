const {
    prisma,
    authenticateProvider,
    requireRole,
    logger,
    PERMISSIONS,
    PROVIDERRoles,
    requireCanonicalPermission,
    toInt,
    obj,
    arr,
} = require('./shared');
const { writeApplicationStatus } = require('../../../../services/application-status-writer');
const { withVisibility, FINANCE_ROLES, organizationScope, answerNoOrganization, DENY_ALL } = require('../../../../shared/application-visibility');
const { normalizeRole, CANONICAL_ROLES } = require('../../../../shared/canonical-rbac');
const { assertAssignableStaff } = require('../../../../services/assignable-staff-service');
const { assertReviewerIsNotInspector } = require('../../../../shared/reviewer-inspector-separation');
const { answerTypedRefusal, answerStateChanged } = require('../../../../shared/api-response');
// The reviewer's workload cap (order 56(1) 2.1, 2.2).
const {
    assertWithinCapOrStated, recordStatedReasons, statedReasonsRecord, answerAssignmentRefusal,
} = require('../../../../services/assignment-policy');
// Batch 10 — Prisma bypass cleanup. Provider queue listing and the assign
// action route through application-service so the projection + visibility
// predicate are applied at the service boundary. `prisma` is still imported
// here as the canonical-writer transaction handle (writeApplicationStatus).
const applicationService = require('../../../../services/application-service');

const QUEUE_HOLDER = { select: { id: true, type: true, displayName: true, identitySource: true } };
const FINANCE_QUEUE_SELECT = {
    id: true,
    applicationNumber: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    entity: QUEUE_HOLDER,
};
const STAFF_QUEUE_SELECT = {
    ...FINANCE_QUEUE_SELECT,
    reviewerId: true,
    auditorId: true,
    applicant: { select: { id: true, firstName: true, lastName: true } },
};

const applicationsQueue = [
    authenticateProvider,
    requireRole(PROVIDERRoles),
    async (req, res) => {
        try {
            const status = String(req.query.status || 'all');
            const priority = String(req.query.priority || 'all').toUpperCase();
            const assignee = String(req.query.assignee || 'all');
            const page = toInt(req.query.page, 1, 1, 100000);
            const limit = toInt(req.query.limit, 20);

            const baseWhere = {
                isDeleted: false,
                status: status !== 'all'
                    ? status
                    : {
                        in: [
                            'DOC_FEE_PAID',
                            'ASSIGNED_FOR_REVIEW',
                            'REVISION_REQUESTED',
                            'DOC_APPROVED',
                            'AUDIT_FEE_PAID',
                            'AUDIT_CONFIRMED',
                            'CAR_PENDING',
                            'CAR_REVIEWING',
                            'AUDIT_PASSED',
                            'AUDIT_NOT_PASSED',
                        ],
                    },
            };

            const where = withVisibility(baseWhere, req.user);
            const finance = FINANCE_ROLES.has(normalizeRole(req.user?.canonicalRole || req.user?.role));

            // Columns only: never formData, healthId (the national ID while APP_FK_USE_TOKEN is
            // off) or applicant contact. Finance gets the billing shape of the detail door.
            const apps = await applicationService.listProviderQueue({
                where,
                select: finance ? FINANCE_QUEUE_SELECT : STAFF_QUEUE_SELECT,
                orderBy: { createdAt: 'asc' },
                take: 1000,
            });

            const now = Date.now();
            const mapped = apps.map((app) => {
                const daysWaiting = Math.max(0, Math.floor((now - new Date(app.createdAt).getTime()) / 86400000));
                const priorityLevel = daysWaiting > 14
                    ? 'CRITICAL'
                    : daysWaiting > 7
                        ? 'HIGH'
                        : daysWaiting > 3
                            ? 'MEDIUM'
                            : 'NORMAL';
                const { entity, ...row } = app;
                const holder = entity
                    ? { entityId: entity.id, type: entity.type, displayName: entity.displayName, identitySource: entity.identitySource }
                    : null;
                return { ...row, holder, daysWaiting, priorityLevel };
            }).filter((app) => {
                if (assignee === 'all') {
                    return true;
                }
                if (assignee === 'unassigned') {
                    return !app.reviewerId;
                }
                return app.reviewerId === assignee || app.auditorId === assignee;
            }).filter((app) => priority === 'ALL' || app.priorityLevel === priority);

            const total = mapped.length;
            const data = mapped.slice((page - 1) * limit, (page - 1) * limit + limit);
            // Wave A Phase 30 — scope dashboard counts to what the caller
            // can actually see, so an auditor's badge ("Pending: N") matches
            // the queue list. Admin / scheduler get tenant-wide counts as before.
            // applicationService.countProviderQueue — replaces the 3
            // prisma.application.count calls for the summary cards.
            const [pending, inReview, awaitingDocs] = await Promise.all([
                applicationService.countProviderQueue(
                    withVisibility(
                        { isDeleted: false, status: { in: ['DOC_FEE_PAID', 'AUDIT_FEE_PAID'] } },
                        req.user,
                    ),
                ),
                applicationService.countProviderQueue(
                    withVisibility(
                        { isDeleted: false, status: { in: ['ASSIGNED_FOR_REVIEW', 'DOC_APPROVED', 'AUDIT_CONFIRMED', 'CAR_REVIEWING'] } },
                        req.user,
                    ),
                ),
                applicationService.countProviderQueue(
                    withVisibility(
                        { isDeleted: false, status: { in: ['REVISION_REQUESTED', 'CAR_PENDING'] } },
                        req.user,
                    ),
                ),
            ]);

            return res.json({
                success: true,
                data,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.max(1, Math.ceil(total / limit)),
                },
                summary: {
                    totalPending: pending,
                    totalInReview: inReview,
                    totalAwaitingDocs: awaitingDocs,
                    unassigned: mapped.filter((a) => !a.reviewerId).length,
                    criticalPriority: mapped.filter((a) => a.priorityLevel === 'CRITICAL').length,
                },
            });
        } catch (error) {
            logger.error('[provider] applications queue failed:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch application queue',
            });
        }
    },
];

const applicationsAssign = [
    authenticateProvider,
    requireCanonicalPermission(PERMISSIONS.APPLICATION_SCHEDULE),
    async (req, res) => {
        try {
            const reviewerId = req.body?.reviewerId || req.body?.providerId;
            if (!reviewerId) {
                return res.status(400).json({ success: false, error: 'reviewerId is required' });
            }

            // Inside the caller's organization (order 17): another organization's
            // id answers exactly like one that does not exist.
            const organizationWhere = organizationScope(req.user);
            if (organizationWhere === DENY_ALL) { return answerNoOrganization(res); }
            const app = await applicationService.findByIdOrApplicationNumber(req.params.id, organizationWhere);
            if (!app) {
                return res.status(404).json({ success: false, error: 'Application not found' });
            }

            const timestamp = new Date().toISOString();
            const formData = obj(app.formData);
            const workflowHistory = arr(app.workflowHistory);
            if (app.status !== 'DOC_FEE_PAID') {
                return res.status(400).json({
                    success: false,
                    error: `Application must be in DOC_FEE_PAID before assignment (current: ${app.status})`,
                });
            }
            await assertAssignableStaff({
                userId: reviewerId, roles: [CANONICAL_ROLES.DOCUMENT_REVIEWER], organizationId: app.organizationId,
            });
            assertReviewerIsNotInspector({ reviewerId, auditorId: app.auditorId });
            // Past the reviewer's workload cap only with a confirmation and reason, counted and
            // written in one transaction.
            await prisma.$transaction(async (tx) => {
                const overCap = await assertWithinCapOrStated(tx, {
                    role: CANONICAL_ROLES.DOCUMENT_REVIEWER, officerId: reviewerId, excludeApplicationId: app.id, overCap: req.body?.overCap,
                });
                await writeApplicationStatus({
                    prisma: tx,
                    applicationId: app.id,
                    fromStatus: app.status,
                    toStatus: 'ASSIGNED_FOR_REVIEW',
                    // A cancellation or another assigner that committed since the read above wins.
                    expectedVersion: app.version,
                    actorId: req.user.id,
                    actorRole: req.user.canonicalRole || req.user.role || null,
                    reason: 'APPLICATION_ASSIGNED',
                    additionalData: {
                        updatedBy: req.user.id,
                        // คอลัมน์ canonical — ประตูของคนจัดคิวเขียนไว้ที่
                        // scheduler-assign-reviewer-handler.js · ประตูนี้เคยเขียนผู้ตรวจลงใน
                        // formData อย่างเดียว แถวจึงเหลือ reviewerId = null และด่านแยกหน้าที่
                        // ของ PATCH /api/applications/:id/reject
                        // (application-workflow-handlers.js:99) ซึ่งอ่านคอลัมน์นี้ตัวเดียว
                        // ก็อ่านว่า "ยังไม่มอบหมาย = ใครก็ได้"
                        //
                        // วัดจริงบนระบบที่รันอยู่ 2026-09-09 (บน GACP Lite ซึ่งใช้โค้ดชุดเดียวกัน):
                        // มอบหมายผ่านประตูนี้ให้ผู้ตรวจ A แล้วผู้ตรวจ B ยิง reject ได้ HTTP 200
                        // ดันใบไป REVISION_REQUESTED พร้อมกำหนดส่งแก้ 5 วันทำการ บนคำขอที่เขา
                        // ไม่ได้รับมอบหมาย
                        reviewerId,
                        formData: {
                            ...formData,
                            // H1 fix: because additionalData carries a formData key, the
                            // status-writer's auto-sync of formData.workflowState is bypassed.
                            // Set it explicitly (mirrors audit-scheduling-service.assignAuditor)
                            // — else resolveStateFromApplication() reads the stale DOC_FEE_PAID
                            // and the reviewer's valid ASSIGNED_FOR_REVIEW→DOC_APPROVED 422s,
                            // dead-ending the workflow.
                            workflowState: 'ASSIGNED_FOR_REVIEW',
                            workflowStateUpdatedAt: timestamp,
                            PROVIDERAssignment: {
                                ...obj(formData.PROVIDERAssignment),
                                reviewerId,
                                assignedBy: req.user.id,
                                assignedAt: timestamp,
                                statedReasons: statedReasonsRecord({ overCap }),
                            },
                        },
                        workflowHistory: [
                            ...workflowHistory,
                            {
                                timestamp,
                                action: 'APPLICATION_ASSIGNED',
                                reviewerId,
                                actorId: req.user.id,
                            },
                        ],
                    },
                });
                await recordStatedReasons(tx, {
                    actor: req.user, application: app, officerId: reviewerId, role: CANONICAL_ROLES.DOCUMENT_REVIEWER, overCap,
                });
            });
            // The assignment as written, without the filing or healthId: both carry national IDs,
            // which leave the server masked or not at all (order 10).
            const updated = await applicationService.getById(app.id, {
                select: { id: true, applicationNumber: true, status: true, reviewerId: true, updatedAt: true },
            });

            return res.json({ success: true, data: updated });
        } catch (error) {
            // Typed refusals (unpaid milestone, staff not assignable, separation of duties)
            // are the caller's condition, not a server fault.
            if (answerStateChanged(res, error) || answerAssignmentRefusal(res, error) || answerTypedRefusal(res, error)) { return undefined; }
            logger.error('[provider] applications/:id/assign failed:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to assign application',
            });
        }
    },
];

module.exports = {
    applicationsQueue,
    applicationsAssign,
};

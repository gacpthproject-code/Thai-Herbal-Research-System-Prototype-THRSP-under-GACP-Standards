const { CANONICAL_ROLES } = require('../../../../shared/canonical-rbac');
const { getZonedParts } = require('../../../../utils/working-days');
const { inspectionDueByApplication } = require('../../../../services/assignment-policy');
const { APPLICANT_CORRECTION_STATUSES, correctionDueAtOf, correctionRoundOf } = require('../../../../services/correction-windows');

/**
 * The applicant's open correction as the dispatcher's tab shows it, with this round's reminder if
 * one went out (order 56(1) 3.1, 3.2): the round is the one the reminder door claims.
 */
function awaitingApplicantItem(item, application) {
    const formData = application.formData && typeof application.formData === 'object' && !Array.isArray(application.formData) ? application.formData : {};
    const dueAt = correctionDueAtOf(item.workflowState, formData);
    const recorded = formData.dispatcherReminder && typeof formData.dispatcherReminder === 'object' ? formData.dispatcherReminder : null;
    const round = correctionRoundOf(item.workflowState, formData);
    return {
        ...item,
        correctionDueAt: dueAt ? dueAt.toISOString() : null,
        reminderThisRound: recorded && recorded.round === round ? { sentAt: recorded.sentAt || null, sentBy: recorded.sentBy || null } : null,
    };
}
const { organizationScope, answerNoOrganization, DENY_ALL } = require('../../../../shared/application-visibility');

const {
    prisma,
    authenticateProvider,
    logger,
    PERMISSIONS,
    requireCanonicalPermission,
    toInt,
    dt,
    buildSchedulerQueueItem,
    isReadyToSchedule,
    applicationService,
    invoiceService,
    workActivityService,
    buildPaymentMap,
} = require('./scheduler-handler-deps');

const schedulerDashboard = [
    authenticateProvider,
    requireCanonicalPermission(PERMISSIONS.APPLICATION_SCHEDULE),
    async (req, res) => {
        try {
            const organizationWhere = organizationScope(req.user);
            if (organizationWhere === DENY_ALL) { return answerNoOrganization(res); }
            const page = toInt(req.query.page, 1, 1, 100000);
            const limit = toInt(req.query.limit, 20, 1, 200);
            const startDate = dt(req.query.startDate);
            const endDate = dt(req.query.endDate);
            const now = new Date();

            const applications = await applicationService.listSchedulerDashboardApplications({
                where: {
                    isDeleted: false,
                    ...organizationWhere,
                    status: {
                        in: [
                            'SUBMITTED',
                            'PENDING_DOC_FEE',
                            'DOC_FEE_PAID',
                            'ASSIGNED_FOR_REVIEW',
                            'REVISION_REQUESTED',
                            'DOC_APPROVED',
                            'PENDING_AUDIT_FEE',
                            'AUDIT_FEE_PAID',
                            'AUDIT_CONFIRMED',
                            'AUDIT_PASSED',
                            'AUDIT_NOT_PASSED',
                            'CAR_PENDING',
                            'CAR_REVIEWING',
                        ],
                    },
                },
                take: 1000,
            });

            const auditorIds = [...new Set(applications.map((application) => application.auditorId).filter(Boolean))];
            const [auditors, paymentMap] = await Promise.all([
                applicationService.listAuditorsByIds(auditorIds),
                buildPaymentMap(invoiceService, applications),
            ]);
            const auditorMap = new Map(auditors.map((auditor) => [auditor.id, auditor]));

            // The date the company must have inspected by (order 56(1) 1.3), on every visit waiting or booked.
            const inspectionDue = await inspectionDueByApplication(prisma, applications
                .filter((application) => ['AUDIT_FEE_PAID', 'AUDIT_CONFIRMED'].includes(application.status))
                .map((application) => application.id));
            const queueItems = applications.map((application) => {
                const item = buildSchedulerQueueItem(application, auditorMap, paymentMap);
                const inspectBy = inspectionDue.get(application.id);
                return { ...item, inspectBy: inspectBy ? inspectBy.toISOString() : null };
            });
            const applicationById = new Map(applications.map((application) => [application.id, application]));

            // Queue 0: DOC_FEE_PAID — ready for reviewer assignment
            const readyForReview = queueItems
                .filter((item) => item.workflowState === 'DOC_FEE_PAID')
                .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());

            // Queue 1: AUDIT_FEE_PAID + paid — ready for audit scheduling
            const readyToSchedule = queueItems
                .filter(isReadyToSchedule)
                .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());

            // Queue 2: AUDIT_CONFIRMED — scheduled upcoming
            const scheduledUpcoming = queueItems
                .filter((item) =>
                    !!item.scheduledDate
                    && item.workflowState === 'AUDIT_CONFIRMED')
                .sort((left, right) => new Date(left.scheduledDate).getTime() - new Date(right.scheduledDate).getTime());

            // Queue 3: the field inspector asked for a second visit after reviewing the corrective
            // evidence of a major finding (order 27); booked from CAR_REVIEWING.
            const reinspectionRequired = queueItems
                .filter((item) => item.isReinspectionRequired)
                .sort((left, right) => new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime());

            // Queue 4: the applicant owes a correction (a document revision or the evidence of an
            // on-site defect); the dispatcher may remind once per round (order 56(1) 3.1, 3.2).
            const awaitingApplicant = queueItems
                .filter((item) => APPLICANT_CORRECTION_STATUSES.includes(item.workflowState))
                .map((item) => awaitingApplicantItem(item, applicationById.get(item.applicationId)))
                .sort((left, right) => new Date(left.correctionDueAt || 8.64e15).getTime() - new Date(right.correctionDueAt || 8.64e15).getTime());

            // Pipeline overview — counts by stage for visibility
            const pipeline = {
                submitted: queueItems.filter((i) => i.workflowState === 'SUBMITTED').length,
                pendingDocFee: queueItems.filter((i) => i.workflowState === 'PENDING_DOC_FEE').length,
                docFeePaid: readyForReview.length,
                assignedForReview: queueItems.filter((i) => i.workflowState === 'ASSIGNED_FOR_REVIEW').length,
                docApproved: queueItems.filter((i) => i.workflowState === 'DOC_APPROVED').length,
                pendingAuditFee: queueItems.filter((i) => i.workflowState === 'PENDING_AUDIT_FEE').length,
                auditFeePaid: readyToSchedule.length,
                auditConfirmed: scheduledUpcoming.length,
            };

            const calendarEvents = scheduledUpcoming
                .filter((item) => {
                    const when = dt(item.scheduledDate);
                    if (!when) { return false; }
                    if (startDate && when < startDate) { return false; }
                    if (endDate && when > endDate) { return false; }
                    return true;
                })
                .map((item) => ({
                    applicationId: item.applicationId,
                    applicationNumber: item.applicationNumber,
                    applicantName: item.applicantName,
                    scheduledDate: item.scheduledDate,
                    auditorId: item.auditorId,
                    auditorName: item.auditorName,
                    mapLink: item.mapLink,
                    location: item.location,
                    status: item.status,
                    workflowState: item.workflowState,
                }));

            const weekEdge = new Date(now);
            weekEdge.setTime(weekEdge.getTime() + 7 * 24 * 60 * 60 * 1000); // instant arithmetic, no calendar read
            const scheduledToday = scheduledUpcoming.filter((item) => {
                const when = dt(item.scheduledDate);
                return when ? getZonedParts(when).isoDate === getZonedParts(now).isoDate : false; // same Bangkok day
            }).length;
            const scheduledThisWeek = scheduledUpcoming.filter((item) => {
                const when = dt(item.scheduledDate);
                return when ? when >= now && when <= weekEdge : false;
            }).length;

            // P1-H (Wave-3): overdue/breached count for the SCHEDULER's own work-activity
            // queue (SLA visibility beyond the reviewer). READ-only + additive + fail-closed:
            // a read failure defaults to 0 so the dashboard never breaks. Same organization
            // scope as the queues above: the caller's own, or every one for the platform admin.
            let overdue = 0;
            try {
                overdue = await workActivityService.countOverdueForGroup({
                    prisma,
                    role: CANONICAL_ROLES.DISPATCHER,
                    asOf: now,
                    ...(organizationWhere ? { organizationId: organizationWhere.organizationId } : { crossOrganization: true }),
                });
            } catch (slaError) {
                logger.error('[provider] scheduler/dashboard overdue count failed:', slaError);
                overdue = 0;
            }

            const paginate = (items) => ({
                total: items.length,
                items: items.slice((page - 1) * limit, (page - 1) * limit + limit),
            });

            return res.json({
                success: true,
                data: {
                    queues: {
                        readyForReview: paginate(readyForReview),
                        readyToSchedule: paginate(readyToSchedule),
                        scheduledUpcoming: paginate(scheduledUpcoming),
                        reinspectionRequired: paginate(reinspectionRequired),
                        awaitingApplicant: paginate(awaitingApplicant),
                    },
                    pipeline,
                    calendar: { events: calendarEvents },
                    kpi: {
                        scheduledToday,
                        scheduledThisWeek,
                        pendingScheduling: readyToSchedule.length,
                        reinspectionBacklog: reinspectionRequired.length,
                        // P1-H: scheduler-group work activities that are overdue/breached.
                        overdue,
                    },
                    pagination: { page, limit },
                },
            });
        } catch (error) {
            logger.error('[provider] scheduler/dashboard failed:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch scheduler dashboard',
            });
        }
    },
];

module.exports = {
    schedulerDashboard,
};

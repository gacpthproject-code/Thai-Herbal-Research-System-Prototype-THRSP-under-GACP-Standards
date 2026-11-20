const express = require('express');
const { providerRouteHandlers } = require('./route-registry');
const { authenticateProvider } = require('./handlers/shared');
const { addWorkingDays, countWorkingDaysBetween } = require('../../../utils/working-days');
const {
    queueTimeLimitsAt, officerWorkloadCapsAt, urgencyOf, MONITORED_STAGES,
} = require('../../../services/dispatcher-rules');
const { reviewerLoad, inspectorLoad } = require('../../../services/assignment-policy');
const { dispatcherReasonOptions } = require('../../../shared/dispatcher-reasons');
const { formatBangkokThaiDate } = require('../../../services/audit/audit-schedule-notices');
const { correctionDueAtOf, correctionRoundOf } = require('../../../services/correction-windows');
const { PERMISSIONS, hasPermission, normalizeRole, CANONICAL_ROLES } = require('../../../shared/canonical-rbac');
const logger = require('../../../shared/logger');
const { lookup: lookupErrorCode } = require('../../../shared/error-codes');
const { notifyApplicationParties } = require('../../../services/notification/application-parties');
// Batch 14 (2026-05-16): scheduler reads now go through the service layer.
// applicationService owns the application/workActivity queries; the deadline
// approaching lookup lives on adminApplicationService alongside the other
// revisionDeadline accessors from batch 10. providerUserService owns the
// auditor-workload roster lookup.
const applicationService = require('../../../services/application-service');
const adminApplicationService = require('../../../services/admin-application-service');
const providerUserService = require('../../../services/provider-user-service');
const { organizationScope, answerNoOrganization, DENY_ALL } = require('../../../shared/application-visibility');
const { prisma } = require('../../../services/prisma-database');
const invoiceService = require('../../../services/invoice-service');
const { computePhaseSettlement } = require('../../../services/phase-billing-service');
const { buildApplicationSummary } = require('../../../services/certification-decision-file-service');
const { resolveAuditSchedule } = require('./handlers/queue-utils');

/**
 * Middleware: require APPLICATION_SCHEDULE permission and an organization to schedule
 * in (order 17). The scope is left on `req.organizationWhere` for the handler's queries:
 * null for system_admin_platform, the caller's organization otherwise.
 */
const requireSchedulePermission = (req, res, next) => {
    const canonicalRole = normalizeRole(req.user?.canonicalRole || req.user?.role);
    if (!canonicalRole || !hasPermission(canonicalRole, PERMISSIONS.APPLICATION_SCHEDULE)) {
        return res.status(403).json({ success: false, error: 'Forbidden — requires scheduling permission' });
    }
    const organizationWhere = organizationScope(req.user);
    if (organizationWhere === DENY_ALL) { return answerNoOrganization(res); }
    req.organizationWhere = organizationWhere;
    next();
};

const router = express.Router();

/**
 * The two statuses where the applicant has a correction to make and a dispatcher may remind them
 * by hand, once per correction round (order 56(1) 3.1, 3.2): what they are asked to do, and the
 * deadline the round is keyed by. Payments are reminded automatically and cannot be muted.
 */
const MANUAL_REMINDER_ASKS = Object.freeze({
    REVISION_REQUESTED: 'กรุณาแก้ไขเอกสารตามที่ผู้ตรวจเอกสารระบุ',
    CAR_PENDING: 'กรุณาส่งหลักฐานการแก้ไขข้อบกพร่องตามที่ผู้ตรวจพื้นที่ระบุ',
});

router.get('/auditors', ...providerRouteHandlers.schedulerAuditors);
router.get('/reviewers', ...providerRouteHandlers.schedulerReviewers);
router.post('/reviewer-assignments', ...providerRouteHandlers.schedulerAssignReviewer);
// Legacy alias kept to avoid breaking older clients while frontend moves to the canonical path.
router.post('/assign-reviewer', ...providerRouteHandlers.schedulerAssignReviewer);
// Reviewer reassignment — the reviewer mirror of /api/audits/reassign. GET lists
// ASSIGNED_FOR_REVIEW apps; POST swaps the reviewer on one (scheduler/admin only,
// state-gated + tenant-scoped inside the handler). Specific path is declared
// before any '/reviewer-assignments/:param' could shadow it.
router.get('/reviewer-assignments/reassignable', ...providerRouteHandlers.schedulerReassignableReviewers);
router.post('/reviewer-assignments/:id/reassign', ...providerRouteHandlers.schedulerReviewerReassign);
router.get('/dashboard', ...providerRouteHandlers.schedulerDashboard);

/** The fixed reasons the dispatcher picks from (shared/dispatcher-reasons.js), so the web keeps no copy. */
router.get('/reasons', authenticateProvider, requireSchedulePermission, (req, res) => res.json({ success: true, data: dispatcherReasonOptions() }));
router.get('/audits/schedules', ...providerRouteHandlers.schedulerAuditSchedulesGet);
router.post('/audits/schedules', ...providerRouteHandlers.schedulerAuditSchedulesPost);

/**
 * GET /api/provider/scheduler/applications/:id
 * What the dispatcher needs before assigning or booking, read-only (audit 2026-10-06 D11): the
 * holder, the site and its coordinates, the scope, payment state, who reviews and who inspects,
 * the booked visit and any second visit the inspector asked for. Never the whole formData.
 */
router.get('/applications/:id', authenticateProvider, requireSchedulePermission, async (req, res) => {
    try {
        const application = await applicationService.findFirstWithWhere({
            where: { id: req.params.id, isDeleted: false, ...(req.organizationWhere || {}) },
            select: {
                id: true,
                applicationNumber: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                scheduledDate: true,
                areaType: true,
                certificationPurposes: true,
                formData: true,
                applicant: { select: { firstName: true, lastName: true } },
                entity: { select: { displayName: true, type: true, isDeleted: true } },
                reviewer: { select: { firstName: true, lastName: true } },
                auditor: { select: { firstName: true, lastName: true } },
            },
        });
        if (!application) {
            return res.status(404).json({ success: false, error: 'ไม่พบคำขอ' });
        }
        const summary = await buildApplicationSummary({ prisma, application });
        // The platform admin reads across organizations but reads no money (order 47).
        const readsPayment = normalizeRole(req.user?.canonicalRole || req.user?.role) !== CANONICAL_ROLES.SYSTEM_ADMIN_PLATFORM;
        const invoices = readsPayment ? await invoiceService.listSettlementsForApplication(application.id) : [];
        const schedule = resolveAuditSchedule(application);
        const reinspection = application.formData && typeof application.formData === 'object'
            ? application.formData.reinspection || null
            : null;
        const nameOf = (person) => (person ? `${person.firstName || ''} ${person.lastName || ''}`.trim() || null : null);
        return res.json({
            success: true,
            data: {
                summary,
                ...(readsPayment ? {
                    payment: {
                        m1Paid: computePhaseSettlement(invoices, 'PHASE_1').phasePaid,
                        m2Paid: computePhaseSettlement(invoices, 'PHASE_2').phasePaid,
                    },
                } : {}),
                reviewerName: nameOf(application.reviewer),
                inspectorName: nameOf(application.auditor),
                schedule: schedule.scheduledDateISO
                    ? { scheduledDate: schedule.scheduledDateISO, location: schedule.location, mapLink: schedule.mapLink }
                    : null,
                reinspection: reinspection
                    ? { status: reinspection.status || null, reason: reinspection.reason || null, requestedAt: reinspection.requestedAt || null }
                    : null,
            },
        });
    } catch (error) {
        logger.error('[scheduler] application detail error:', error);
        return res.status(500).json({ success: false, error: 'Failed to load the application' });
    }
});

/**
 * GET /api/provider/scheduler/urgent-monitor
 * The stages a member of staff holds that have waited past the urgent threshold, counted from when
 * the application entered the stage, and the booked visits whose day has passed without a result
 * (order 56(1) 1.2); and the applicants' correction deadlines coming up. Both count Bangkok working
 * days against the dispatcher's dated rule (order 27), never hours.
 */
router.get('/urgent-monitor', authenticateProvider, requireSchedulePermission, async (req, res) => {
    try {
        const now = new Date();
        const rule = queueTimeLimitsAt(now);
        if (!rule) {
            return res.json({ success: true, data: { stuckItems: [], deadlineItems: [], summary: { totalStuck: 0, critical: 0, warning: 0, approachingDeadlines: 0 } } });
        }

        const watched = await applicationService.listMonitoredApplications({
            statuses: Object.keys(MONITORED_STAGES),
            take: 500,
            organizationWhere: req.organizationWhere,
        });

        const urgentItems = watched
            .map((app) => {
                const formData = app.formData && typeof app.formData === 'object' ? app.formData : {};
                const entered = formData.workflowStateUpdatedAt ? new Date(formData.workflowStateUpdatedAt) : null;
                const urgency = urgencyOf({
                    status: app.status,
                    stageEnteredAt: entered && !Number.isNaN(entered.getTime()) ? entered : new Date(app.updatedAt),
                    visitAt: app.scheduledDate ? new Date(app.scheduledDate) : null,
                }, now);
                if (!urgency || urgency.severity === 'INFO') { return null; }
                return {
                    id: app.id,
                    applicationNumber: app.applicationNumber,
                    applicantName: `${app.applicant?.firstName || ''} ${app.applicant?.lastName || ''}`.trim() || '-',
                    status: app.status,
                    clock: urgency.clock,
                    scheduledDate: app.scheduledDate || null,
                    workingDaysWaiting: urgency.workingDaysWaiting,
                    severity: urgency.severity,
                };
            })
            .filter(Boolean)
            .sort((left, right) => right.workingDaysWaiting - left.workingDaysWaiting)
            .slice(0, 50);

        let approachingDeadlines = [];
        try {
            approachingDeadlines = await adminApplicationService.listApproachingRevisionDeadlines({
                now,
                upperBound: addWorkingDays(now, rule.deadlineWatchWorkingDays),
                take: 20,
                organizationWhere: req.organizationWhere,
            });
        } catch {
            // RevisionDeadline table may not exist — non-fatal
        }

        const deadlineItems = approachingDeadlines.map((dl) => {
            const workingDaysLeft = Math.max(0, countWorkingDaysBetween(now, new Date(dl.revisionDue)));
            return {
                id: dl.application?.id || dl.id,
                applicationNumber: dl.application?.applicationNumber || '-',
                applicantName: `${dl.application?.applicant?.firstName || ''} ${dl.application?.applicant?.lastName || ''}`.trim() || '-',
                deadlineDue: dl.revisionDue,
                workingDaysLeft,
                severity: workingDaysLeft <= 1 ? 'CRITICAL' : 'WARNING',
                type: 'REVISION_DEADLINE',
            };
        });

        return res.json({
            success: true,
            data: {
                stuckItems: urgentItems,
                deadlineItems,
                summary: {
                    totalStuck: urgentItems.length,
                    critical: urgentItems.filter((i) => i.severity === 'CRITICAL').length,
                    warning: urgentItems.filter((i) => i.severity === 'WARNING').length,
                    approachingDeadlines: deadlineItems.length,
                },
            },
        });
    } catch (error) {
        logger.error('[urgent-monitor] Error:', error);
        return res.status(500).json({ success: false, error: 'Failed to load urgent monitor data' });
    }
});

/**
 * GET /api/provider/scheduler/auditor-workload
 * Each officer's workload against the dated cap of its role (order 56(1) 2.2): a document reviewer
 * the applications it holds (to review, and waiting on the applicant), a field inspector its booked
 * visits within the cap's working-day window, with the corrective evidence it reviews shown beside.
 */
router.get('/auditor-workload', authenticateProvider, requireSchedulePermission, async (req, res) => {
    try {
        const officerRoles = [CANONICAL_ROLES.DOCUMENT_REVIEWER, CANONICAL_ROLES.FIELD_INSPECTOR];
        const officers = await providerUserService.listActiveAuditors(officerRoles, req.organizationWhere);
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const caps = officerWorkloadCapsAt(now);

        const workload = await Promise.all(
            officers.map(async (officer) => {
                const role = normalizeRole(officer.role);
                const isReviewer = role === CANONICAL_ROLES.DOCUMENT_REVIEWER;
                const [held, completedRecent] = await Promise.all([
                    isReviewer ? reviewerLoad(prisma, officer.id) : inspectorLoad(prisma, officer.id, { now }),
                    applicationService.countAuditorCompletedAuditsSince(officer.id, thirtyDaysAgo, role),
                ]);
                const load = isReviewer ? held.total : held.visits;
                let capacity = null;
                if (caps) { capacity = isReviewer ? caps.documentReviewer.openApplications : caps.fieldInspector.visits; }
                const utilizationPct = capacity ? Math.min(100, Math.round((load / capacity) * 100)) : null;
                let availability = 'AVAILABLE';
                if (capacity && load >= capacity) {
                    availability = 'FULL';
                } else if (utilizationPct !== null && utilizationPct >= 60) {
                    availability = 'BUSY';
                }
                return {
                    id: officer.id,
                    name: `${officer.firstName || ''} ${officer.lastName || ''}`.trim() || '-',
                    role,
                    activeAssignments: load,
                    ...(isReviewer
                        ? { toReview: held.toReview, waitingOnApplicant: held.waitingOnApplicant }
                        : { visitsWindowEnd: held.windowEnd, carReviews: held.carReviews }),
                    completedLast30Days: completedRecent,
                    capacity,
                    utilizationPct,
                    availability,
                };
            }),
        );

        workload.sort((a, b) => b.activeAssignments - a.activeAssignments);

        return res.json({
            success: true,
            data: {
                auditors: workload,
                summary: {
                    totalAuditors: workload.length,
                    available: workload.filter((a) => a.availability === 'AVAILABLE').length,
                    busy: workload.filter((a) => a.availability === 'BUSY').length,
                    full: workload.filter((a) => a.availability === 'FULL').length,
                    totalActiveAssignments: workload.reduce((s, a) => s + a.activeAssignments, 0),
                    caps: caps ? {
                        documentReviewer: caps.documentReviewer.openApplications,
                        fieldInspector: caps.fieldInspector.visits,
                        fieldInspectorWindowWorkingDays: caps.fieldInspector.withinWorkingDays,
                    } : null,
                },
            },
        });
    } catch (error) {
        logger.error('[auditor-workload] Error:', error);
        return res.status(500).json({ success: false, error: 'Failed to load auditor workload' });
    }
});

/**
 * POST /api/provider/scheduler/applications/:id/send-reminder
 * Remind the applicant and the holder of a correction they owe (order 56(1) 3.1, order 27), once
 * per correction round (3.2): the round is the deadline stamped on the filing, and the reminder is
 * claimed on the server-owned formData.dispatcherReminder before it is sent, so two dispatchers
 * pressing together send one.
 */
router.post('/applications/:id/send-reminder', authenticateProvider, requireSchedulePermission, async (req, res) => {
    try {
        const application = await applicationService.findReminderTargetApplication(req.params.id, req.organizationWhere);
        if (!application) {
            return res.status(404).json({ success: false, error: 'Application not found' });
        }
        const ask = MANUAL_REMINDER_ASKS[application.status];
        if (!ask) {
            return res.status(400).json({
                success: false,
                code: 'REMINDER_NOT_APPLICABLE',
                error: lookupErrorCode('REMINDER_NOT_APPLICABLE').messageTh,
            });
        }
        const dueAt = correctionDueAtOf(application.status, application.formData);
        const round = correctionRoundOf(application.status, application.formData);
        const sentAt = new Date().toISOString();
        const record = { round, sentAt, sentBy: req.user.id };

        const claimed = await prisma.$executeRaw`
            UPDATE applications
            SET "formData" = jsonb_set("formData", '{dispatcherReminder}', ${JSON.stringify(record)}::jsonb, true)
            WHERE id = ${application.id}
              AND status = ${application.status}
              AND jsonb_typeof("formData") = 'object'
              AND COALESCE("formData"->'dispatcherReminder'->>'round', '') <> ${round}`;
        if (claimed === 0) {
            const row = lookupErrorCode('REMINDER_ALREADY_SENT_THIS_ROUND');
            return res.status(row.httpStatus).json({ success: false, code: row.code, error: row.messageTh, messageTh: row.messageTh });
        }

        const by = dueAt ? ` ภายในวันที่ ${formatBangkokThaiDate(dueAt)}` : '';
        try {
            // The applicant and the holder (order 27: a dispatcher's own notice reaches both).
            await notifyApplicationParties(application.id, {
                type: 'WARNING',
                title: 'แจ้งเตือนจากผู้จัดคิว',
                message: `คำขอเลขที่ ${application.applicationNumber}: ${ask}${by}`,
                priority: 3,
                data: {
                    applicationNumber: application.applicationNumber,
                    status: application.status,
                    sentBy: req.user.id,
                    reminderType: 'MANUAL_COORDINATOR',
                    round,
                },
            });
        } catch (notifyError) {
            // Not sent: give the round back, so the dispatcher can press again.
            await prisma.$executeRaw`
                UPDATE applications SET "formData" = "formData" - 'dispatcherReminder'
                WHERE id = ${application.id} AND "formData"->'dispatcherReminder'->>'sentAt' = ${sentAt}`;
            throw notifyError;
        }

        logger.info(`[scheduler] Manual reminder sent for ${application.applicationNumber} by ${req.user.id}`);
        return res.json({
            success: true,
            message: 'Reminder sent successfully',
            data: {
                applicationId: application.id,
                applicationNumber: application.applicationNumber,
                status: application.status,
                reminder: record,
            },
        });
    } catch (error) {
        logger.error('[scheduler] send-reminder error:', error);
        return res.status(500).json({ success: false, error: 'Failed to send reminder' });
    }
});

module.exports = router;

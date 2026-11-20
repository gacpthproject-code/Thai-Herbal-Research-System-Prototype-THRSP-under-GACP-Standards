const workflowTransitionService = require('../../../../services/workflow-transition-service');
const { isReadyToSchedule } = require('../../../../shared/dispatcher-queue');
const { obj, arr, dt, getApplicantName } = require('./shared');
const { siteContactStateOf } = require('../../../../shared/applicant-contact');

const getRevisionDueAt = (formData) => dt(obj(formData).revisionDueAt || obj(formData).revision_due_at);
const getRevisionRequestedAt = (formData) => dt(obj(formData).revisionRequestedAt || obj(formData).revision_requested_at);

const toReviewerQueueItem = (application, now = new Date()) => {
    const formData = obj(application.formData);
    const workflowState = workflowTransitionService.resolveStateFromApplication(application);
    const revisionDueAt = getRevisionDueAt(formData);
    const revisionRequestedAt = getRevisionRequestedAt(formData);
    const remainingMs = revisionDueAt ? (revisionDueAt.getTime() - now.getTime()) : null;
    const remainingHours = remainingMs === null ? null : Math.floor(remainingMs / (60 * 60 * 1000));
    const remainingDays = remainingMs === null ? null : Math.floor(remainingMs / (24 * 60 * 60 * 1000));
    // C3 ("งานนี้พาสไปที่ใคร"): expose who assigned this case so the reviewer
    // queue can show the job's origin ("มอบหมายโดย ..."). The user id resolves to
    // a display name in the dashboard handler (batched lookup); name stays null here.
    const providerAssignment = obj(formData.PROVIDERAssignment);

    return {
        id: application.id,
        applicationNumber: application.applicationNumber,
        status: application.status,
        workflowState,
        applicantName: getApplicantName(application.applicant),
        assignedById: providerAssignment.assignedBy || null,
        assignedByName: null,
        submittedAt: formData.submittedAt || null,
        updatedAt: application.updatedAt,
        revisionRequestedAt: revisionRequestedAt ? revisionRequestedAt.toISOString() : null,
        revisionDueAt: revisionDueAt ? revisionDueAt.toISOString() : null,
        sla: {
            remainingHours,
            remainingDays,
            isOverdue: !!revisionDueAt && remainingMs < 0,
            dueSoon: !!revisionDueAt && remainingMs >= 0 && remainingMs <= (48 * 60 * 60 * 1000),
        },
    };
};

/**
 * Inspection is on site only (order 27, 2026-10-06: an online inspection cannot lead to a
 * certificate and is removed). True when a caller still asks for another mode, so the door can
 * refuse it instead of quietly booking something the caller did not ask for.
 */
const isRetiredInspectionMode = (value) => {
    const raw = String(value || '').trim().toUpperCase();
    return raw !== '' && raw !== 'ONSITE';
};

const isValidHttpUrl = (value) => {
    if (!value) { return false; }
    try {
        const parsed = new URL(String(value));
        return ['http:', 'https:'].includes(parsed.protocol);
    } catch (_error) {
        return false;
    }
};

const resolveAuditSchedule = (application) => {
    const formData = obj(application?.formData);
    const schedule = obj(formData.auditSchedule);
    // `dt` is new Date(v), and new Date(null) is the epoch: a VALID date. Feeding it `null`
    // made every unscheduled application read as "scheduled 1970-01-01".
    const rawScheduledDate = application?.scheduledDate || schedule.scheduledDate || null;
    const scheduledDate = rawScheduledDate ? dt(rawScheduledDate) : null;
    const estimatedDuration = Number.isFinite(Number(schedule.estimatedDuration))
        ? Math.min(600, Math.max(15, Number.parseInt(schedule.estimatedDuration, 10)))
        : 120;

    return {
        scheduledDate,
        scheduledDateISO: scheduledDate ? scheduledDate.toISOString() : null,
        mapLink: schedule.mapLink || null,
        location: schedule.location || null,
        notes: schedule.notes || null,
        estimatedDuration,
    };
};

/**
 * The field inspector on the file, reviewing the corrective evidence of a major finding, said a
 * second visit is needed and the dispatcher has not booked it yet (orders 27 and 29): the only state
 * a re-inspection is booked from. A request left by an inspector since replaced asks for nothing
 * (the status writer refuses booking it the same way).
 */
const isReinspectionRequested = (application) => {
    if (!application) { return false; }
    const request = obj(obj(application.formData).reinspection);
    return workflowTransitionService.resolveStateFromApplication(application) === 'CAR_REVIEWING'
        && request.status === 'REQUESTED'
        && Boolean(application.auditorId) && request.requestedBy === application.auditorId;
};

const isMinorFollowupCandidate = (application) => {
    if (['CAR_PENDING', 'CAR_REVIEWING'].includes(String(application?.status || '').toUpperCase())) {
        return true;
    }
    const workflowHistory = arr(application?.workflowHistory);
    for (let index = workflowHistory.length - 1; index >= 0; index -= 1) {
        const event = obj(workflowHistory[index]);
        const decision = String(
            event.decision
            || obj(event.metadata).decision
            || obj(event.result).decision
            || '',
        ).toUpperCase();
        const reasonCode = String(event.reasonCode || '').toUpperCase();
        if (decision === 'MINOR' || reasonCode.includes('MINOR')) {
            return true;
        }
    }
    return false;
};

const buildSchedulerQueueItem = (application, auditorMap, paymentMap) => {
    const workflowState = workflowTransitionService.resolveStateFromApplication(application);
    const schedule = resolveAuditSchedule(application);
    const paymentState = paymentMap.get(application.id) || { phase2Paid: false, receiptIssued: false };
    const auditor = auditorMap.get(application.auditorId || '') || null;
    // C3 ("งานนี้พาสไปที่ใคร"): the assigned document reviewer, from the reviewerId column the
    // assignment writes (formData.PROVIDERAssignment for rows written before the column).
    const providerAssignment = obj(obj(application.formData).PROVIDERAssignment);
    const reviewerId = application.reviewerId || providerAssignment.reviewerId || null;
    const scheduledDate = schedule.scheduledDate;
    const now = Date.now();
    const overdueDays = scheduledDate && scheduledDate.getTime() < now
        ? Math.floor((now - scheduledDate.getTime()) / (24 * 60 * 60 * 1000))
        : 0;

    return {
        id: application.id,
        applicationId: application.id,
        applicationNumber: application.applicationNumber,
        status: application.status,
        workflowState,
        applicantName: getApplicantName(application.applicant),
        phase2Paid: paymentState.phase2Paid,
        receiptIssued: paymentState.receiptIssued,
        auditorId: application.auditorId || null,
        auditorName: auditor ? getApplicantName(auditor) : null,
        reviewerId,
        reviewerName: reviewerId ? (String(providerAssignment.reviewerName || '').trim() || null) : null,
        scheduledDate: schedule.scheduledDateISO,
        mapLink: schedule.mapLink,
        location: schedule.location,
        notes: schedule.notes,
        estimatedDuration: schedule.estimatedDuration,
        isReinspectionRequired: isReinspectionRequested(application),
        // Whether the filing names someone on site, never who (orders 56(3) and 65(2)).
        ...siteContactStateOf(application),
        overdueDays: overdueDays > 0 ? overdueDays : 0,
        createdAt: application.createdAt,
        updatedAt: application.updatedAt,
    };
};

/**
 * A major finding is still open: the application is in the corrective-action loop and the latest
 * on-site decision on record is MAJOR. The inspector's dashboard counts these.
 */
const hasOpenMajorFinding = (application) => {
    const workflowState = workflowTransitionService.resolveStateFromApplication(application);
    if (workflowState !== 'CAR_PENDING' && workflowState !== 'CAR_REVIEWING') { return false; }
    const decisions = arr(obj(application?.formData).auditDecisions);
    const latest = obj(decisions[decisions.length - 1]);
    return String(latest.decision || '').toUpperCase() === 'MAJOR';
};

const buildAuditorQueueItem = (application, auditorMap, paymentMap) => {
    const item = buildSchedulerQueueItem(application, auditorMap, paymentMap);
    const workflowState = item.workflowState;
    const receiptIssued = !!item.receiptIssued;
    const canStartInspection = workflowState === 'AUDIT_CONFIRMED' && receiptIssued;
    const canSubmitDecision = ['AUDIT_CONFIRMED', 'CAR_REVIEWING'].includes(workflowState);

    return {
        ...item,
        canStartInspection,
        canSubmitDecision,
        isMinorFollowup: isMinorFollowupCandidate(application),
        hasOpenMajorFinding: hasOpenMajorFinding(application),
    };
};

module.exports = {
    toReviewerQueueItem,
    getRevisionDueAt,
    isRetiredInspectionMode,
    isValidHttpUrl,
    resolveAuditSchedule,
    isReinspectionRequested,
    isReadyToSchedule,
    buildSchedulerQueueItem,
    buildAuditorQueueItem,
};

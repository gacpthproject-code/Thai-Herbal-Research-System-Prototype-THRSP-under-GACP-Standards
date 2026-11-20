'use strict';

/**
 * What the dispatcher's assignment doors check before they write (operator order 56(1), 2026-10-09):
 *
 *   - the officer's workload against the dated cap of its role (2.2). Past the cap the assignment
 *     goes ahead only with the dispatcher's confirmation and a reason from a fixed list (2.1); the
 *     reason is kept with the assignment and in the audit log of the application's organization,
 *     where its DTAM admin reads it;
 *   - the date the company must have inspected by: 60 Bangkok working days after the second payment
 *     under payment terms v1.3 7.2.1(ง) (1.3). A visit booked after it goes ahead only with a reason;
 *   - moving the field inspector while the applicant corrects an on-site defect, which the same
 *     inspector would otherwise review (orders 29 and 60(a)): only with a reason.
 *
 * Every door that assigns an officer or books a visit asks the same functions, so no door can be
 * the one that skips the rule.
 *
 * @module services/assignment-policy
 */

const { CANONICAL_ROLES } = require('../shared/canonical-rbac');
const { lookup: lookupErrorCode } = require('../shared/error-codes');
const {
    OVER_CAP_REASONS, LATE_VISIT_REASONS, CORRECTION_REASSIGN_REASONS, statedReason, responsibleSideOf, dispatcherReasonOptions,
} = require('../shared/dispatcher-reasons');
const { reasonOptions } = require('../shared/certification-decision-reasons');
const { companyInspectionDeadline } = require('../shared/refund-kinds');
const { officerWorkloadCapsAt } = require('./dispatcher-rules');
const { addWorkingDays } = require('../utils/working-days');

/** The statuses in which a document reviewer holds an application (order 56(1) 2.2). */
const REVIEWER_HELD = Object.freeze({ toReview: 'ASSIGNED_FOR_REVIEW', waitingOnApplicant: 'REVISION_REQUESTED' });

function refusal(code, data) {
    const row = lookupErrorCode(code);
    return Object.assign(new Error(row.messageTh), { code: row.code, statusCode: row.httpStatus, messageTh: row.messageTh, data });
}

/**
 * The applications a document reviewer holds: to review, and waiting on the applicant's revision.
 * @returns {Promise<{ toReview: number, waitingOnApplicant: number, total: number }>}
 */
async function reviewerLoad(client, reviewerId, { excludeApplicationId = null } = {}) {
    const count = (status) => client.application.count({
        where: { reviewerId, status, isDeleted: false, ...(excludeApplicationId ? { id: { not: excludeApplicationId } } : {}) },
    });
    const [toReview, waitingOnApplicant] = await Promise.all([count(REVIEWER_HELD.toReview), count(REVIEWER_HELD.waitingOnApplicant)]);
    return { toReview, waitingOnApplicant, total: toReview + waitingOnApplicant };
}

/**
 * A field inspector's booked visits from `now` to the end of the cap's working-day window, and the
 * corrective evidence it is reviewing (shown beside, never counted against the cap).
 * @returns {Promise<{ visits: number, windowEnd: Date|null, carReviews: number }>}
 */
async function inspectorLoad(client, inspectorId, { now = new Date(), excludeApplicationId = null } = {}) {
    const caps = officerWorkloadCapsAt(now);
    const windowEnd = caps ? addWorkingDays(now, caps.fieldInspector.withinWorkingDays) : null;
    const notThis = excludeApplicationId ? { id: { not: excludeApplicationId } } : {};
    const [visits, carReviews] = await Promise.all([
        windowEnd ? client.application.count({
            where: { auditorId: inspectorId, status: 'AUDIT_CONFIRMED', isDeleted: false, scheduledDate: { gte: now, lte: windowEnd }, ...notThis },
        }) : 0,
        client.application.count({ where: { auditorId: inspectorId, status: 'CAR_REVIEWING', isDeleted: false, ...notThis } }),
    ]);
    return { visits, windowEnd, carReviews };
}

/**
 * Hold `officerId`'s workload for the rest of the transaction. Every door that assigns or books takes
 * this lock BEFORE the application row (security re-review 2026-10-09 L-B): a door that took the row
 * first and this second deadlocked with the booking door, which takes them the other way.
 */
async function lockOfficerLoad(client, officerId) {
    await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`officer-load:${officerId}`}))`;
}

/**
 * Whether assigning `officerId` this application puts it past its cap, and if so that the dispatcher
 * confirmed and stated why. A reviewer is past it when it already holds the cap's number of
 * applications; an inspector when the visit falls in the cap's window and it already has the cap's
 * number of visits there.
 *
 * Called inside the assignment's own transaction: the officer's load is locked to the end of it, so
 * two dispatchers assigning the same officer at once are counted one after the other.
 *
 * @param {object} client the assignment's transaction
 * @param {object} args
 * @param {'document_reviewer'|'field_inspector'} args.role
 * @param {string} args.officerId
 * @param {string} [args.excludeApplicationId] the application being assigned, never counted twice
 * @param {Date|null} [args.visitAt] the visit date, for an inspector
 * @param {{ reasonCode?: string, reasonText?: string }|null} [args.overCap] the dispatcher's confirmation
 * @param {Date} [args.now]
 * @returns {Promise<{ overCap: false, load: number|null, cap: number|null } | { overCap: true, load: number, cap: number, reason: { code: string, label: string, text: string|null } }>}
 *   load is null when nothing was counted: no cap in force, or an inspector's visit outside the window
 * @throws 409 OFFICER_OVER_CAP_CONFIRMATION_REQUIRED with the load, the cap and the reasons to pick from;
 *         400 ASSIGNMENT_REASON_INVALID for a reason not on the list or OTHER without its words
 */
async function assertWithinCapOrStated(client, {
    role, officerId, excludeApplicationId = null, visitAt = null, overCap = null, now = new Date(),
}) {
    const caps = officerWorkloadCapsAt(now);
    if (!caps) { return { overCap: false, load: null, cap: null }; }
    const reviewer = role === CANONICAL_ROLES.DOCUMENT_REVIEWER;
    const cap = reviewer ? caps.documentReviewer.openApplications : caps.fieldInspector.visits;
    if (!reviewer) {
        const windowEnd = addWorkingDays(now, caps.fieldInspector.withinWorkingDays);
        const visitInWindow = Boolean(visitAt && visitAt.getTime() >= now.getTime() && visitAt.getTime() <= windowEnd.getTime());
        if (!visitInWindow) { return { overCap: false, load: null, cap }; }
    }
    await lockOfficerLoad(client, officerId);
    const load = reviewer
        ? (await reviewerLoad(client, officerId, { excludeApplicationId })).total
        : (await inspectorLoad(client, officerId, { now, excludeApplicationId })).visits;
    if (load < cap) { return { overCap: false, load, cap }; }
    if (!overCap || typeof overCap !== 'object') {
        throw refusal('OFFICER_OVER_CAP_CONFIRMATION_REQUIRED', { role, officerId, load, cap, reasons: reasonOptions(OVER_CAP_REASONS) });
    }
    const reason = statedReason(OVER_CAP_REASONS, overCap.reasonCode, overCap.reasonText);
    if (reason.refused) { throw refusal('ASSIGNMENT_REASON_INVALID', { list: 'overCap', refused: reason.refused }); }
    return { overCap: true, load, cap, reason };
}

/**
 * The date the company must have inspected an application by: 60 Bangkok working days after its
 * second payment settled, under the payment terms that payment accepted (v1.3 7.2.1(ง)); null when
 * the second payment is not settled or its terms set no such window.
 */
async function inspectionDueFor(client, applicationId) {
    const paid = await client.checkoutOrder.findFirst({
        where: { applicationId, milestone: 'M2', status: 'SETTLED' },
        orderBy: { settledAt: 'desc' },
        select: { settledAt: true, paymentTermsVersion: true },
    });
    if (!paid || !paid.settledAt || !paid.paymentTermsVersion) { return null; }
    try {
        return companyInspectionDeadline(paid.settledAt, paid.paymentTermsVersion);
    } catch (error) {
        if (error && error.code === 'REFUND_TERMS_VERSION_UNKNOWN') { return null; }
        throw error;
    }
}

/** inspectionDueFor for many applications at once (the dispatcher's queues): Map<applicationId, Date|null>. */
async function inspectionDueByApplication(client, applicationIds) {
    const due = new Map(applicationIds.map((id) => [id, null]));
    if (applicationIds.length === 0) { return due; }
    const paid = await client.checkoutOrder.findMany({
        where: { applicationId: { in: applicationIds }, milestone: 'M2', status: 'SETTLED' },
        orderBy: { settledAt: 'asc' },
        select: { applicationId: true, settledAt: true, paymentTermsVersion: true },
    });
    for (const order of paid) {
        if (!order.settledAt || !order.paymentTermsVersion) { continue; }
        try {
            due.set(order.applicationId, companyInspectionDeadline(order.settledAt, order.paymentTermsVersion));
        } catch (error) {
            if (!error || error.code !== 'REFUND_TERMS_VERSION_UNKNOWN') { throw error; }
        }
    }
    return due;
}

/**
 * A visit booked after the inspection due date goes ahead only with a stated reason (1.3); it is
 * never refused for being late.
 * @returns {{ late: false, inspectBy: Date|null } | { late: true, inspectBy: Date, reason: { code: string, label: string, text: string|null } }}
 * @throws 409 LATE_VISIT_REASON_REQUIRED with the due date and the reasons; 400 ASSIGNMENT_REASON_INVALID
 */
function assertVisitInTimeOrStated({ inspectBy, visitAt, lateVisit = null }) {
    if (!inspectBy || !visitAt || visitAt.getTime() <= inspectBy.getTime()) { return { late: false, inspectBy }; }
    if (!lateVisit || typeof lateVisit !== 'object') {
        throw refusal('LATE_VISIT_REASON_REQUIRED', { inspectBy: inspectBy.toISOString(), reasons: dispatcherReasonOptions().lateVisit });
    }
    const reason = statedReason(LATE_VISIT_REASONS, lateVisit.reasonCode, lateVisit.reasonText);
    if (reason.refused) { throw refusal('ASSIGNMENT_REASON_INVALID', { list: 'lateVisit', refused: reason.refused }); }
    return { late: true, inspectBy, reason: { ...reason, side: responsibleSideOf('lateVisit', reason.code) } };
}

/** The statuses in which the applicant corrects an on-site defect the assigned inspector will review (order 29). */
const CORRECTION_STATUSES = Object.freeze(new Set(['CAR_PENDING', 'CAR_REVIEWING']));

/**
 * Moving the field inspector while the applicant corrects an on-site defect needs a reason from the
 * fixed list (order 60(a)); in any other status there is nothing to state here.
 * @returns {{ code: string, label: string, text: string|null } | null}
 * @throws 400 CORRECTION_REASSIGN_REASON_REQUIRED with the reasons; 400 ASSIGNMENT_REASON_INVALID
 */
function assertCorrectionReassignReason({ status, reasonCode, reasonText }) {
    if (!CORRECTION_STATUSES.has(status)) { return null; }
    if (!reasonCode) {
        throw refusal('CORRECTION_REASSIGN_REASON_REQUIRED', { reasons: dispatcherReasonOptions().correctionReassign });
    }
    const reason = statedReason(CORRECTION_REASSIGN_REASONS, reasonCode, reasonText);
    if (reason.refused) { throw refusal('ASSIGNMENT_REASON_INVALID', { list: 'correctionReassign', refused: reason.refused }); }
    return { ...reason, side: responsibleSideOf('correctionReassign', reason.code) };
}

/**
 * Write the stated reasons of one assignment to the audit log, inside the assignment's own
 * transaction, under the application's organization: the DTAM admin of that organization reads them
 * in the audit log (order 56(1) 2.1). Nothing is written for an assignment that needed no reason.
 *
 * @param {object} tx the assignment's transaction
 * @param {object} args
 * @param {object} args.actor req.user
 * @param {{ id: string, applicationNumber: string, organizationId: string }} args.application
 * @param {string} args.officerId the officer assigned
 * @param {string} args.role its role
 * @param {object} [args.overCap] assertWithinCapOrStated's outcome
 * @param {object} [args.lateVisit] assertVisitInTimeOrStated's outcome, with args.visitAt
 * @param {Date} [args.visitAt]
 * @param {object} [args.correctionReassign] { reason, fromOfficerId, status }
 */
async function recordStatedReasons(tx, {
    actor, application, officerId, role, overCap = null, lateVisit = null, visitAt = null, correctionReassign = null,
}) {
    // Lazy: the audit logger pulls in prisma-database, which this module's light callers never need.
    const { auditLogger, AuditCategory, AuditSeverity, ResourceType } = require('../middleware/audit-logger');
    const base = {
        category: AuditCategory.APPLICATION,
        severity: AuditSeverity.WARNING,
        actorId: actor?.id || 'SYSTEM',
        actorRole: actor?.canonicalRole || actor?.role || 'UNKNOWN',
        actorType: 'PROVIDER',
        resourceType: ResourceType.APPLICATION,
        resourceId: application.id,
        organizationId: application.organizationId,
    };
    const said = (reason) => ({ reasonCode: reason.code, reasonLabel: reason.label, ...(reason.side ? { side: reason.side } : {}) });
    if (overCap && overCap.overCap) {
        await auditLogger.logWithin({
            ...base,
            action: 'OFFICER_ASSIGNED_OVER_CAP',
            metadata: { applicationNumber: application.applicationNumber, officerId, role, load: overCap.load, cap: overCap.cap, ...said(overCap.reason) },
        }, tx);
    }
    if (lateVisit && lateVisit.late) {
        await auditLogger.logWithin({
            ...base,
            action: 'VISIT_BOOKED_AFTER_INSPECTION_DUE',
            metadata: {
                applicationNumber: application.applicationNumber, officerId,
                inspectBy: lateVisit.inspectBy.toISOString(), visitAt: visitAt ? visitAt.toISOString() : null, ...said(lateVisit.reason),
            },
        }, tx);
    }
    if (correctionReassign && correctionReassign.reason) {
        await auditLogger.logWithin({
            ...base,
            action: 'INSPECTOR_REASSIGNED_DURING_CORRECTION',
            metadata: {
                applicationNumber: application.applicationNumber, from: correctionReassign.fromOfficerId || null, to: officerId,
                status: correctionReassign.status, ...said(correctionReassign.reason),
            },
        }, tx);
    }
}

/** What an assignment keeps of its stated reasons beside the record it writes (null when it stated none). */
function statedReasonsRecord({ overCap = null, lateVisit = null } = {}) {
    const record = {};
    if (overCap && overCap.overCap) {
        record.overCap = { reasonCode: overCap.reason.code, reasonText: overCap.reason.text, load: overCap.load, cap: overCap.cap };
    }
    if (lateVisit && lateVisit.late) {
        record.lateVisit = {
            reasonCode: lateVisit.reason.code, reasonText: lateVisit.reason.text, side: lateVisit.reason.side, inspectBy: lateVisit.inspectBy.toISOString(),
        };
    }
    return Object.keys(record).length > 0 ? record : null;
}

/** The answer a door gives for one of the refusals above; false when the error is not one. */
function answerAssignmentRefusal(res, error) {
    const codes = ['OFFICER_OVER_CAP_CONFIRMATION_REQUIRED', 'LATE_VISIT_REASON_REQUIRED', 'CORRECTION_REASSIGN_REASON_REQUIRED', 'ASSIGNMENT_REASON_INVALID'];
    if (!error || !codes.includes(error.code)) { return false; }
    res.status(error.statusCode).json({ success: false, code: error.code, error: error.messageTh, messageTh: error.messageTh, data: error.data });
    return true;
}

module.exports = {
    REVIEWER_HELD,
    CORRECTION_STATUSES,
    reviewerLoad,
    inspectorLoad,
    lockOfficerLoad,
    assertWithinCapOrStated,
    inspectionDueFor,
    inspectionDueByApplication,
    assertVisitInTimeOrStated,
    assertCorrectionReassignReason,
    recordStatedReasons,
    statedReasonsRecord,
    answerAssignmentRefusal,
};

/**
 * Which applications belong on a reviewer's dashboard.
 *
 * The handler used to fetch the whole document-review pipeline —
 * `listReviewerQueueApplications({ take: 1000 })`, every row carrying its
 * `formData` and `workflowHistory` JSON — and then filter down to the current
 * reviewer's own work in JavaScript.
 *
 * Two problems, and the second is not about speed.
 *
 * It transferred a thousand full application payloads to keep a handful. And
 * `take: 1000` is a silent ceiling: once the pipeline holds more than a thousand
 * applications, the ones past the limit are never fetched, never reach the
 * filter, and never appear on the dashboard of the reviewer they are assigned
 * to. No error, no warning — a farmer's application simply stops being visible
 * to the person responsible for it. `orderBy: createdAt asc` decides who
 * vanishes: the newest work, which is the work with a live SLA.
 *
 * Both branches of the ownership rule have to survive the move into SQL.
 * REV-01 records what happens when one of them is wrong: "the reviewer's
 * primary dashboard was ALWAYS empty even with validly-assigned work".
 */

/**
 * The document-review pipeline, split the way the dashboard actually shows it.
 *
 * This map is the single declaration: the query fetches its union, and the
 * handler partitions by the same keys. Keeping two lists — one for the WHERE and
 * one written out again in the handler's filters — is how a status ends up
 * fetched and displayed nowhere. `AUDIT_FEE_PAID` was exactly that: in the
 * status list, in no queue, in no KPI, so an application the reviewer had
 * approved vanished from their dashboard the moment the applicant paid
 * instalment 2. The reverse also existed — the handler filtered `DOC_FEE_PAID`,
 * which the query never fetches (that work is unassigned and belongs to the
 * coordinator's hand-out screen), a dead branch that read as a promise.
 *
 * EXPIRED is not a queue; it feeds the overdue KPI, which is a place on the
 * screen all the same. CANCELLED is not fetched: a cancelled service is closed
 * work, not overdue work.
 */
const REVIEWER_QUEUE_PARTITIONS = Object.freeze({
    pendingReview: Object.freeze(['ASSIGNED_FOR_REVIEW']),
    awaitingRevision: Object.freeze(['REVISION_REQUESTED']),
    approvedWaitingPhase2: Object.freeze(['DOC_APPROVED', 'PENDING_AUDIT_FEE']),
    overdueOrExpired: Object.freeze(['EXPIRED']),
});

/** ทุกสถานะที่ต้องดึงมา = สหภาพของสิ่งที่หน้าจอแสดงจริง ไม่มากไปกว่านั้น */
const REVIEWER_QUEUE_STATUSES = Object.freeze(
    Object.values(REVIEWER_QUEUE_PARTITIONS).flat(),
);

/**
 * @param {object} args
 * @param {string|null} [args.reviewerId] scope to one reviewer's own work.
 *   Omitted means the whole pipeline — for callers that genuinely want it, not
 *   as a quiet default.
 * @returns {object} a Prisma `where`
 */
function reviewerQueueWhere({ reviewerId } = {}) {
    const where = {
        isDeleted: false,
        status: { in: REVIEWER_QUEUE_STATUSES },
    };

    const owner = String(reviewerId || '').trim();
    if (!owner) {return where;}

    // The reviewerId column alone: the formData copy is not moved when the dispatcher
    // swaps reviewers, so it kept the previous reviewer's queue holding the filing.
    where.reviewerId = owner;

    return where;
}

module.exports = { reviewerQueueWhere, REVIEWER_QUEUE_STATUSES, REVIEWER_QUEUE_PARTITIONS };

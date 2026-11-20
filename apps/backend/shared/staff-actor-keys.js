'use strict';

/**
 * The keys under which a record names a staff member by user id. Applicant-facing doors
 * drop them: staff are named by role or display name on the applicant's screens, never
 * by id (security re-review F6-R, 2026-10-08). Shallow on purpose: each door names the
 * object it projects, so a key with the same spelling inside an applicant's own answers
 * (a land document's `issuedBy`) is never touched.
 */
const STAFF_ACTOR_KEYS = Object.freeze([
    'actorId', 'approvedBy', 'approverId', 'assignedBy', 'assignedTo', 'assignedUserId', 'assigneeId',
    'auditorId', 'cancelledBy', 'completedBy', 'createdBy', 'decidedBy', 'deletedBy', 'headAuditorId',
    'inspectorId', 'issuedBy', 'officerId', 'postedBy', 'receiptIssuedBy', 'recordedBy', 'refundedBy',
    'refundTransferRecordedBy', 'reinstatedBy', 'resolvedBy', 'reviewedBy', 'reviewerId', 'revisedBy', 'revokedBy', 'schedulerId',
    'signedBy', 'staffId', 'suspendedBy', 'updatedBy', 'verifiedBy', 'voidedBy',
]);

function withoutStaffActorKeys(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) { return record; }
    const copy = { ...record };
    for (const key of STAFF_ACTOR_KEYS) { delete copy[key]; }
    return copy;
}

module.exports = { STAFF_ACTOR_KEYS, withoutStaffActorKeys };

'use strict';

/**
 * The statuses that ARE a person's decision, and the roles each belongs to: the document
 * reviewer's (papers), the field inspector's (the visit), the certificate approver's (the
 * certificate). Operator order 31 (2026-10-07 "ไม่ให้ทำ"): no door sets one of these on
 * behalf of another role, from any source state, force included. A recovery door may still
 * move an application stuck by a system fault, just not into a verdict.
 *
 * Order 56(2) (2026-10-09): REJECTED belongs to the certificate approver alone. The field
 * inspector records "ไม่ผ่าน" (AUDIT_NOT_PASSED) and the approver decides; an admin closes an
 * application the applicant cannot fix as CANCELLED with a reason from
 * shared/application-closure-reasons.js, never as REJECTED (order 35).
 *
 * The owners are the human roles holding an edge into that state in ROLE_TRANSITIONS
 * (services/workflow-transition-service.js); __tests__/unit/decision-states.test.js pins that
 * the two tables agree, and that every state one human role alone enters is listed either
 * here or in NOT_DECISION_STATES.
 */

const { CANONICAL_ROLES, normalizeRole } = require('./canonical-rbac');

const {
    DOCUMENT_REVIEWER, FIELD_INSPECTOR, CERTIFICATE_APPROVER, SYSTEM,
} = CANONICAL_ROLES;

const DECISION_STATE_OWNERS = Object.freeze({
    DOC_APPROVED: Object.freeze([DOCUMENT_REVIEWER]),
    REVISION_REQUESTED: Object.freeze([DOCUMENT_REVIEWER]),
    AUDIT_PASSED: Object.freeze([FIELD_INSPECTOR]),
    AUDIT_NOT_PASSED: Object.freeze([FIELD_INSPECTOR]),
    CAR_PENDING: Object.freeze([FIELD_INSPECTOR, CERTIFICATE_APPROVER]),
    REJECTED: Object.freeze([CERTIFICATE_APPROVER]),
    APPROVED: Object.freeze([CERTIFICATE_APPROVER]),
    CERTIFIED: Object.freeze([CERTIFICATE_APPROVER]),
});

/**
 * The files waiting for the certificate approver's decision: the inspector passed the visit, or
 * recorded that it did not pass. Every approver opens the file anew each time it enters.
 */
const DECISION_QUEUE_STATES = new Set(['AUDIT_PASSED', 'AUDIT_NOT_PASSED']);

/** States one human role alone enters that are not a verdict, and why. */
const NOT_DECISION_STATES = Object.freeze({
    // The applicant's own filing. Who may file for a holder is the agent-filing rule
    // (order 25), not this table.
    SUBMITTED: 'the applicant files; filing for someone else is governed by agent confirmation',
    // The dispatcher's scheduling. Re-placing a stuck schedule is recovery, not a verdict.
    AUDIT_CONFIRMED: 'scheduling the visit decides nothing about the application',
    // The applicant withdraws before document review (order 32). An admin also closes as
    // CANCELLED, with a reason from the fixed list (order 35), so no role owns it as a verdict.
    CANCELLED: 'a closure, not a verdict: the applicant withdraws, an admin closes with a listed reason',
});

/**
 * May this actor write this status? A decision state is written by its owners, and by
 * SYSTEM (webhook, cron, waiver reopen) only along SYSTEM's own ROLE_TRANSITIONS edges, so
 * an unknown source state refuses. Every other status is open here.
 */
function mayWriteDecisionState(toStatus, actorRole, fromStatus) {
    const to = String(toStatus || '').toUpperCase();
    const owners = DECISION_STATE_OWNERS[to];
    if (!owners) { return true; }
    const role = normalizeRole(actorRole);
    if (role === SYSTEM) {
        const { ROLE_TRANSITIONS } = require('../services/workflow-transition-service');
        return ROLE_TRANSITIONS[SYSTEM].has(`${String(fromStatus || '').toUpperCase()}->${to}`);
    }
    return owners.includes(role);
}

module.exports = { DECISION_STATE_OWNERS, NOT_DECISION_STATES, DECISION_QUEUE_STATES, mayWriteDecisionState };

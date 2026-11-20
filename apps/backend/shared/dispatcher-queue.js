'use strict';

/**
 * Ready for the dispatcher to book a visit: waiting in AUDIT_FEE_PAID with the second milestone
 * paid. Every dispatcher queue (the coordinator dashboard, the scheduling queue page, the schedule
 * list) asks this one predicate, so two screens can no longer count the same queue differently
 * (role-workflow audit 2026-10-06 dispatcher D9).
 *
 * @param {{ workflowState?: string, status?: string, phase2Paid?: boolean }} item
 */
function isReadyToSchedule(item) {
    const state = item.workflowState || item.status;
    return state === 'AUDIT_FEE_PAID' && item.phase2Paid === true;
}

module.exports = { isReadyToSchedule };

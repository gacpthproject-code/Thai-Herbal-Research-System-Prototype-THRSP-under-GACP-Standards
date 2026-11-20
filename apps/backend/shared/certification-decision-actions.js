'use strict';

/**
 * What the certificate approver may decide on a file in its queue: one action per edge the role
 * holds out of the file's status in ROLE_TRANSITIONS (services/workflow-transition-service.js).
 * The edges are the rule; this table only names them. A file the field inspector passed offers
 * approve, refuse and return; a file it did not pass offers refuse and the correction round
 * (orders 29 and 56(2)). The decision file serves the list, each door refuses an action the list
 * does not hold, and the web draws one button per action.
 */

const { CANONICAL_ROLES } = require('./canonical-rbac');
const { DECISION_QUEUE_STATES } = require('./decision-states');

const DECISION_ACTION_BY_TARGET = Object.freeze({
    APPROVED: 'APPROVE',
    REJECTED: 'REFUSE',
    CAR_REVIEWING: 'RETURN',
    CAR_PENDING: 'REQUEST_CORRECTION',
});

/**
 * @param {string} status the file's status
 * @returns {string[]} the actions offered, in the table's order; none outside the decision queue
 */
function offeredDecisionActions(status) {
    const from = String(status || '').toUpperCase();
    if (!DECISION_QUEUE_STATES.has(from)) { return []; }
    const { ROLE_TRANSITIONS } = require('../services/workflow-transition-service');
    const edges = ROLE_TRANSITIONS[CANONICAL_ROLES.CERTIFICATE_APPROVER];
    return Object.entries(DECISION_ACTION_BY_TARGET)
        .filter(([to]) => edges.has(`${from}->${to}`))
        .map(([, action]) => action);
}

module.exports = { DECISION_ACTION_BY_TARGET, offeredDecisionActions };

'use strict';

/**
 * What the field inspector's result of a visit does to the application, for the job sheet and
 * the field screen alike (order 56(2)). A visit that did not pass waits for the certificate
 * approver; it never closes the application. Which results a state accepts is not a second
 * table: it is the inspector's edges in ROLE_TRANSITIONS, so desk review of corrective evidence
 * (CAR_REVIEWING) cannot record FAIL because the inspector holds no edge from it to
 * AUDIT_NOT_PASSED.
 */
const VERDICT_TARGET = Object.freeze({
    PASS: 'AUDIT_PASSED',
    MINOR: 'CAR_PENDING',
    MAJOR: 'CAR_PENDING',
    FAIL: 'AUDIT_NOT_PASSED',
});

module.exports = { VERDICT_TARGET };

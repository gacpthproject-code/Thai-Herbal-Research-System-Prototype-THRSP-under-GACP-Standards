'use strict';

/**
 * The decision-state owners (shared/decision-states.js) are the human roles holding an
 * edge into each state in ROLE_TRANSITIONS. If a ruling moves an edge, both tables move.
 */

const {
    DECISION_STATE_OWNERS, NOT_DECISION_STATES, DECISION_QUEUE_STATES, mayWriteDecisionState,
} = require('../../shared/decision-states');
const { ALLOWED_TRANSITIONS, ROLE_TRANSITIONS, WORKFLOW_STATES } = require('../../services/workflow-transition-service');

function humanHolders(state) {
    return Object.entries(ROLE_TRANSITIONS)
        .filter(([role, edges]) => role !== 'system' && [...edges].some((edge) => edge.endsWith(`->${state}`)))
        .map(([role]) => role)
        .sort();
}

function unclassified(owners) {
    return WORKFLOW_STATES
        .filter((state) => humanHolders(state).length === 1)
        .filter((state) => !(state in owners) && !(state in NOT_DECISION_STATES));
}

test.each(Object.entries(DECISION_STATE_OWNERS))('%s is written in ROLE_TRANSITIONS by its owners alone', (state, owners) => {
    expect(humanHolders(state)).toEqual([...owners].sort());
});

/**
 * A state one human role alone enters is that role's act. It is either a decision (no other
 * role, admin included, may write it) or named, with the reason, as not one. A new state, or
 * an edge moved to a single role, fails here until someone says which.
 */
test('every state one human role alone enters is a decision state or a named exception', () => {
    expect(unclassified(DECISION_STATE_OWNERS)).toEqual([]);
    expect(Object.keys(NOT_DECISION_STATES).filter((state) => state in DECISION_STATE_OWNERS)).toEqual([]);
});

test('negative control: dropping an owner row leaves that state unclassified', () => {
    const { CERTIFIED: _dropped, ...rest } = DECISION_STATE_OWNERS;
    expect(unclassified(rest)).toEqual(['CERTIFIED']);
});

test('the certificate is the approver\'s: CERTIFIED and REJECTED are decision states', () => {
    expect(DECISION_STATE_OWNERS.CERTIFIED).toEqual(['certificate_approver']);
    expect(DECISION_STATE_OWNERS.REJECTED).toEqual(['certificate_approver']);
});

/** Every role-held edge that ends in `state`, as "role:FROM->TO". */
function edgesInto(table, state) {
    return Object.entries(table)
        .flatMap(([role, edges]) => [...edges].filter((edge) => edge.endsWith(`->${state}`)).map((edge) => `${role}:${edge}`))
        .sort();
}

describe('order 56(2): the field inspector records "not passed" and never closes the application', () => {
    it('only the certificate approver refuses, from the two files waiting in its queue', () => {
        expect(edgesInto(ROLE_TRANSITIONS, 'REJECTED')).toEqual([
            'certificate_approver:AUDIT_NOT_PASSED->REJECTED',
            'certificate_approver:AUDIT_PASSED->REJECTED',
        ]);
    });

    it('negative control: the inspector\'s old refusal edge put back is seen', () => {
        const withOldEdge = {
            ...ROLE_TRANSITIONS,
            field_inspector: new Set([...ROLE_TRANSITIONS.field_inspector, 'AUDIT_CONFIRMED->REJECTED']),
        };
        expect(edgesInto(withOldEdge, 'REJECTED')).toContain('field_inspector:AUDIT_CONFIRMED->REJECTED');
    });

    it('a visit that did not pass waits for the approver as AUDIT_NOT_PASSED, the inspector\'s verdict', () => {
        expect(ALLOWED_TRANSITIONS.AUDIT_CONFIRMED.has('REJECTED')).toBe(false);
        expect(ALLOWED_TRANSITIONS.AUDIT_CONFIRMED.has('AUDIT_NOT_PASSED')).toBe(true);
        expect(edgesInto(ROLE_TRANSITIONS, 'AUDIT_NOT_PASSED')).toEqual(['field_inspector:AUDIT_CONFIRMED->AUDIT_NOT_PASSED']);
        expect(DECISION_STATE_OWNERS.AUDIT_NOT_PASSED).toEqual(['field_inspector']);
    });

    it('desk review of corrective evidence has no "not passed" edge', () => {
        expect(ALLOWED_TRANSITIONS.CAR_REVIEWING.has('AUDIT_NOT_PASSED')).toBe(false);
        expect(ALLOWED_TRANSITIONS.CAR_REVIEWING.has('REJECTED')).toBe(false);
    });

    it('the approver alone leaves AUDIT_NOT_PASSED: refuse, or send the applicant to correct', () => {
        expect([...ALLOWED_TRANSITIONS.AUDIT_NOT_PASSED].sort()).toEqual(['CAR_PENDING', 'REJECTED']);
        const leaving = Object.entries(ROLE_TRANSITIONS)
            .flatMap(([role, edges]) => [...edges].filter((edge) => edge.startsWith('AUDIT_NOT_PASSED->')).map((edge) => `${role}:${edge}`))
            .sort();
        expect(leaving).toEqual(['certificate_approver:AUDIT_NOT_PASSED->CAR_PENDING', 'certificate_approver:AUDIT_NOT_PASSED->REJECTED']);
        expect([...DECISION_STATE_OWNERS.CAR_PENDING].sort()).toEqual(['certificate_approver', 'field_inspector']);
    });

    it('the approver\'s queue holds the passed file and the file that did not pass', () => {
        expect([...DECISION_QUEUE_STATES]).toEqual(['AUDIT_PASSED', 'AUDIT_NOT_PASSED']);
    });
});

test('admins never write a decision; its owners do; other states are open', () => {
    for (const [state, owners] of Object.entries(DECISION_STATE_OWNERS)) {
        expect(mayWriteDecisionState(state, 'system_admin_dtam')).toBe(false);
        expect(mayWriteDecisionState(state, 'system_admin_platform')).toBe(false);
        expect(mayWriteDecisionState(state, null)).toBe(false);
        for (const owner of owners) {
            expect(mayWriteDecisionState(state, owner)).toBe(true);
        }
    }
    expect(mayWriteDecisionState('CAR_REVIEWING', 'system_admin_dtam')).toBe(true);
});

test('SYSTEM writes a decision state only along its own ROLE_TRANSITIONS edges', () => {
    expect(mayWriteDecisionState('REVISION_REQUESTED', 'SYSTEM', 'EXPIRED')).toBe(true);
    expect(mayWriteDecisionState('CAR_PENDING', 'system', 'EXPIRED')).toBe(true);
    expect(mayWriteDecisionState('APPROVED', 'SYSTEM', 'AUDIT_PASSED')).toBe(false);
    expect(mayWriteDecisionState('CERTIFIED', 'SYSTEM', 'APPROVED')).toBe(false);
    expect(mayWriteDecisionState('DOC_APPROVED', 'SYSTEM', 'ASSIGNED_FOR_REVIEW')).toBe(false);
    expect(mayWriteDecisionState('REVISION_REQUESTED', 'SYSTEM', undefined)).toBe(false);
    expect(mayWriteDecisionState('PENDING_DOC_FEE', 'SYSTEM', 'SUBMITTED')).toBe(true);
});

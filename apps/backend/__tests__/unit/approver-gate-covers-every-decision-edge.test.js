'use strict';

const { buildTransitionUpdate } = require('../../services/workflow-transition-service');

const file = (status) => ({
    id: 'app-1', status, auditorId: 'inspector-1', reviewerId: 'reviewer-1', documentReviewerIds: [],
    formData: { workflowState: status }, workflowHistory: [],
});
const decide = (from, to, actorId) => () => buildTransitionUpdate({
    application: file(from), toState: to, actorId, actorRole: 'certificate_approver', comment: 'เหตุผลของผู้อนุมัติ',
});
const EDGES = [
    ['AUDIT_PASSED', 'CAR_REVIEWING'], ['AUDIT_PASSED', 'REJECTED'], ['AUDIT_PASSED', 'APPROVED'],
    ['AUDIT_NOT_PASSED', 'REJECTED'], ['AUDIT_NOT_PASSED', 'CAR_PENDING'],
];

test.each(EDGES)('%s -> %s by an approver who inspected the file = EVALUATOR_CANNOT_DECIDE', (from, to) => {
    expect(decide(from, to, 'inspector-1')).toThrow(expect.objectContaining({ code: 'EVALUATOR_CANNOT_DECIDE', status: 409 }));
});

test.each(EDGES)('%s -> %s by an approver who reviewed its documents = DOCUMENT_REVIEWER_CANNOT_DECIDE', (from, to) => {
    expect(decide(from, to, 'reviewer-1')).toThrow(expect.objectContaining({ code: 'DOCUMENT_REVIEWER_CANNOT_DECIDE', status: 409 }));
});

test.each(EDGES)('%s -> %s by an approver who took no part is built, with the decider stamped', (from, to) => {
    const transition = decide(from, to, 'approver-1')();
    expect([transition.nextState, transition.updateData.headAuditorId]).toEqual([to, 'approver-1']);
});

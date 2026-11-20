'use strict';

const { buildTrackingPayload } = require('../../routes/api/helpers/application-payload-builders');
const { DISPLAY_STATUS_BY_RAW_STATUS, STEP_BY_DISPLAY_STATUS } = require('../../routes/api/helpers/application-constants');

const NOW = new Date('2026-10-23T05:00:00Z');
const CAR_DUE = '2026-11-20T16:59:59.999Z';

function appIn(status) {
    return {
        id: 'app-1',
        applicationNumber: 'APP-2569-CAR',
        status,
        formData: { workflowState: status, carRequestedAt: '2026-10-21T08:00:00.000Z', carDueAt: CAR_DUE },
    };
}

describe('F-A8b-03: after the applicant sent CAR evidence (CAR_REVIEWING) the file waits for the inspector', () => {
    const payload = buildTrackingPayload(appIn('CAR_REVIEWING'), { now: NOW });

    test('the action card no longer asks for evidence and is disabled', () => {
        expect(payload.actionCard).toEqual({ key: 'WAIT_CAR_REVIEW', title: expect.any(String), enabled: false });
    });

    test('no CAR deadline is shown once the evidence is in', () => {
        expect(payload.deadline).toBeNull();
    });

    test('CAR_REVIEWING keeps its own display bucket on the same ladder rung as CAR_PENDING', () => {
        expect(payload.displayStatus).toBe('CAR_REVIEWING');
        expect(DISPLAY_STATUS_BY_RAW_STATUS.CAR_REVIEWING).toBe('CAR_REVIEWING');
        expect(STEP_BY_DISPLAY_STATUS.CAR_REVIEWING).toBe(STEP_BY_DISPLAY_STATUS.CAR_PENDING);
        expect(payload.tracking.currentStep).toBe(STEP_BY_DISPLAY_STATUS.CAR_PENDING);
    });

    test('control: CAR_PENDING still asks for the evidence with its deadline', () => {
        const pending = buildTrackingPayload(appIn('CAR_PENDING'), { now: NOW });
        expect(pending.actionCard).toEqual({ key: 'SUBMIT_CAR_EVIDENCE', title: expect.any(String), enabled: true });
        expect(pending.deadline).toMatchObject({ type: 'CAR', dueAt: CAR_DUE });
    });
});

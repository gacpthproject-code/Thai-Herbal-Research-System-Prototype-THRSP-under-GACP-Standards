/**
 * GET /api/dispatch-due — the working days the dispatcher has to assign a document reviewer after the
 * first payment, as the dated DISPATCHER.QUEUE_TIME_LIMITS rule in force now says (order 56(1) 1.1).
 * The applicant's success screen reads it here and keeps no number of its own (Jev review of
 * 00ca573, web finding 2). No rule in force is answered 503, never a guessed number.
 */

'use strict';

const express = require('express');
const request = require('supertest');

const mockRuleAt = jest.fn();
jest.mock('../../services/dispatcher-rules', () => {
    const actual = jest.requireActual('../../services/dispatcher-rules');
    return { ...actual, queueTimeLimitsAt: (...args) => mockRuleAt(...args) };
});

const { DISPATCHER } = require('../../config/business-rules');

function app() {
    const server = express();
    server.use('/api/dispatch-due', require('../../routes/api/dispatch-due'));
    return server;
}

describe('GET /api/dispatch-due', () => {
    beforeEach(() => { mockRuleAt.mockReset(); });

    test('answers the working days of the rule in force now, and the Bangkok day it took effect', async () => {
        const { queueTimeLimitsAt } = jest.requireActual('../../services/dispatcher-rules');
        mockRuleAt.mockImplementation((at) => queueTimeLimitsAt(at));
        const res = await request(app()).get('/api/dispatch-due');
        const inForce = queueTimeLimitsAt(new Date());
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            success: true,
            data: { dueWorkingDays: inForce.dueWorkingDays, effectiveFrom: inForce.effectiveFrom },
        });
        expect(DISPATCHER.QUEUE_TIME_LIMITS.map((entry) => entry.dueWorkingDays)).toContain(res.body.data.dueWorkingDays);
    });

    test('a later-dated rule is what the door answers once it is in force', async () => {
        mockRuleAt.mockReturnValue({ effectiveFrom: '2027-01-04', dueWorkingDays: 2 });
        const res = await request(app()).get('/api/dispatch-due');
        expect(res.body.data.dueWorkingDays).toBe(2);
    });

    test('no rule in force: 503 with the catalogued code, no number', async () => {
        mockRuleAt.mockReturnValue(null);
        const res = await request(app()).get('/api/dispatch-due');
        expect(res.status).toBe(503);
        expect(res.body).toMatchObject({ success: false, code: 'DISPATCH_RULE_MISSING' });
        expect(res.body).not.toHaveProperty('data');
    });
});

/**
 * The applicant's end of the per-slot loop.
 *
 * The rules of a revision answer (the revision clock, the papers the officer asked for, the gate
 * list) are proven in correction-deadline-guard.test.js, requested-papers.test.js and on real
 * Postgres (filing-legs-read-their-own-clock). What this proves is the door: that it is owned by
 * the applicant, refuses in the right ORDER, hands the gate list what it needs, and moves nothing
 * when it refuses.
 */

'use strict';

const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/auth-middleware', () => ({
    authenticateHealth: (req, res, next) => {
        if (!req.headers['x-test-user']) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        req.user = { id: 'user-1', role: 'health', canonicalRole: 'health' };
        return next();
    },
}));

const mockDb = {
    application: { findFirst: jest.fn() },
    revisionDeadline: { updateMany: jest.fn(async () => ({ count: 1 })) },
};
jest.mock('../../services/prisma-database', () => ({ prisma: mockDb }));

jest.mock('../../services/application-service', () => ({
    resolveHealthIdentity: jest.fn(async () => ({ healthId: 'health-1', userId: 'user-1' })),
}));
jest.mock('../../routes/api/helpers/applications-helpers', () => ({
    getHealthScopeOptions: () => ({}),
}));

const mockWriteStatus = jest.fn();
jest.mock('../../services/application-status-writer', () => ({
    writeApplicationStatus: (...a) => mockWriteStatus(...a),
}));

// R2 Task 12 (spec §3.3: a resubmit is a submit): the door asks the submit guard
// first. The guard itself is proven on a real Postgres (holder-scope-real-postgres).
const mockAssertSubmitAllowed = jest.fn();
jest.mock('../../services/application-submit-guard', () => {
    class SubmitGuardError extends Error {
        constructor(message, { statusCode, code }) { super(message); this.statusCode = statusCode; this.code = code; }
    }
    return { assertSubmitAllowed: (...a) => mockAssertSubmitAllowed(...a), SubmitGuardError };
});

const mockJudgeFiling = jest.fn();
jest.mock('../../services/application-filing-gates', () => ({
    judgeFiling: (...a) => mockJudgeFiling(...a),
}));

function app() {
    const a = express();
    a.use(express.json());
    a.use('/api/applications', require('../../routes/api/applications/revision-resubmit'));
    return a;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockWriteStatus.mockResolvedValue({ ok: true });
    mockAssertSubmitAllowed.mockResolvedValue({ entityId: 'entity-1' });
    mockJudgeFiling.mockResolvedValue({
        refusal: null, requirementStamp: null, declarationsAcceptedAt: '2026-09-01T00:00:00.000Z', renewalChangeDeclaration: null,
    });
    mockDb.application.findFirst.mockResolvedValue({
        id: 'app-1', healthId: 'health-1', status: 'REVISION_REQUESTED', isDeleted: false,
        formData: { plantId: 'cannabis', _lastReviewComment: 'โฉนดอ่านไม่ออก กรุณาแนบใหม่', revisionDueAt: '2026-09-10T10:00:00.000Z', revision_due_at: '2026-09-10T10:00:00.000Z' },
    });
});

const post = (headers = { 'x-test-user': '1' }) => request(app())
    .post('/api/applications/app-1/revision-resubmit').set(headers).send({});

describe('who may send a filing back', () => {
    test('an unauthenticated caller reaches nothing', async () => {
        const res = await request(app()).post('/api/applications/app-1/revision-resubmit').send({});
        expect(res.status).toBe(401);
        expect(mockDb.application.findFirst).not.toHaveBeenCalled();
    });

    test('a filing outside the caller\'s holders is 404 — the holder scope is in the query, not a check after', async () => {
        mockDb.application.findFirst.mockResolvedValue(null);
        const res = await post();
        expect(res.status).toBe(404);
        expect(mockAssertSubmitAllowed).not.toHaveBeenCalled();
        expect(mockWriteStatus).not.toHaveBeenCalled();
    });

    test('R2 Task 12: the submit guard decides before anything else; its refusal moves nothing', async () => {
        const { SubmitGuardError } = require('../../services/application-submit-guard');
        mockAssertSubmitAllowed.mockRejectedValue(new SubmitGuardError('denied', { statusCode: 403, code: 'ENTITY_PERMISSION_DENIED' }));
        const res = await post();
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('ENTITY_PERMISSION_DENIED');
        expect(mockAssertSubmitAllowed).toHaveBeenCalledWith(expect.objectContaining({
            userId: 'user-1',
            application: expect.objectContaining({ id: 'app-1' }),
        }));
        expect(mockJudgeFiling).not.toHaveBeenCalled();
        expect(mockWriteStatus).not.toHaveBeenCalled();
    });
});

describe('the happy path', () => {
    test('walks REVISION_REQUESTED → ASSIGNED_FOR_REVIEW through the writer, after the one gate list judged the filing with this door\'s client', async () => {
        const res = await post();
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({ status: 'ASSIGNED_FOR_REVIEW' });
        expect(mockJudgeFiling).toHaveBeenCalledWith(expect.objectContaining({
            prisma: mockDb, fromStatus: 'REVISION_REQUESTED', application: expect.objectContaining({ id: 'app-1' }),
        }));
        expect(mockWriteStatus).toHaveBeenCalledTimes(1);
        expect(mockWriteStatus.mock.calls[0][0]).toMatchObject({
            applicationId: 'app-1',
            fromStatus: 'REVISION_REQUESTED',
            toStatus: 'ASSIGNED_FOR_REVIEW',
        });
    });

    test('the door writes no revision clock of its own: the writer stops it inside the status transaction', async () => {
        const res = await post();
        expect(res.status).toBe(200);
        expect(mockDb.revisionDeadline.updateMany).not.toHaveBeenCalled();
    });

    test('the answer ends the round in the same write: the note leaves the edit page and the revision clock is retired, the rest of formData kept (as /submit does)', async () => {
        const res = await post();
        expect(res.status).toBe(200);
        expect(mockWriteStatus.mock.calls[0][0].additionalData.formData).toEqual({
            plantId: 'cannabis', _lastReviewComment: null, revisionDueAt: null, revision_due_at: null,
        });
    });
});

describe('refusals move nothing', () => {
    test('the WRONG STATE is reported before the gate list is asked: someone on the wrong screen hears that, not a list of papers', async () => {
        mockDb.application.findFirst.mockResolvedValue({ id: 'app-1', healthId: 'health-1', status: 'DRAFT', isDeleted: false });
        const res = await post();
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('REVISION_RESUBMIT_WRONG_STATE');
        expect(mockJudgeFiling).not.toHaveBeenCalled();
        expect(mockWriteStatus).not.toHaveBeenCalled();
    });

    test('a filing the gate list refuses gets that refusal as it stands (the deadline, a stale paper, the law) and moves nothing', async () => {
        for (const refusal of [
            { httpStatus: 400, body: { success: false, code: 'REVISION_DEADLINE_EXCEEDED', error: 'REVISION_DEADLINE_EXCEEDED' } },
            { httpStatus: 409, body: { success: false, code: 'REVISION_INCOMPLETE', error: 'REVISION_INCOMPLETE', slotIds: ['land_rights'] } },
            { httpStatus: 422, body: { success: false, code: 'APPLICATION_INCOMPLETE', errorsByStep: { 2: [] } } },
        ]) {
            mockJudgeFiling.mockResolvedValue({ refusal });
            const res = await post();
            expect(res.status).toBe(refusal.httpStatus);
            expect(res.body).toEqual(refusal.body);
        }
        expect(mockWriteStatus).not.toHaveBeenCalled();
        expect(mockDb.revisionDeadline.updateMany).not.toHaveBeenCalled();
    });

    test.each([
        ['404 outside the caller\'s holders', 404, () => mockDb.application.findFirst.mockResolvedValue(null)],
        ['403 by the submit guard', 403, () => {
            const { SubmitGuardError } = require('../../services/application-submit-guard');
            mockAssertSubmitAllowed.mockRejectedValue(new SubmitGuardError('denied', { statusCode: 403, code: 'ENTITY_PERMISSION_DENIED' }));
        }],
        ['409 wrong state', 409, () => mockDb.application.findFirst.mockResolvedValue({ id: 'app-1', healthId: 'health-1', status: 'DRAFT', isDeleted: false })],
    ])('%s leaves the revision clock running: a refusal is not an answer (order 28)', async (_label, status, arrange) => {
        arrange();
        const res = await post();
        expect(res.status).toBe(status);
        expect(mockWriteStatus).not.toHaveBeenCalled();
        expect(mockDb.revisionDeadline.updateMany).not.toHaveBeenCalled();
    });

    test('a thrown error answers 500 with the Thai retry line, never the stack', async () => {
        mockWriteStatus.mockRejectedValue(new Error('boom'));
        const res = await post();
        expect(res.status).toBe(500);
        expect(res.body).toMatchObject({ success: false, code: 'REVISION_RESUBMIT_FAILED' });
        expect(JSON.stringify(res.body)).not.toContain('boom');
    });
});

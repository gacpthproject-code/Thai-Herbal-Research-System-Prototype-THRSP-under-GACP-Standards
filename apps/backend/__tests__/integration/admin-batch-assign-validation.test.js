/**
 * admin batch-actions ASSIGN validation — M2 audit fix (2026-06-18).
 *
 * Supertest + mocked deps (mock-backed, runs on dev — no DB). Verifies that
 * POST /admin/batch-actions with action=ASSIGN validates `assignTo` BEFORE
 * writing anything — closing the phantom-reviewer data-integrity gap (an admin
 * typo used to transition apps to ASSIGNED_FOR_REVIEW pointing at a non-existent
 * reviewer, with the swallowed ledger FK failure, and still report success).
 */

'use strict';

const request = require('supertest');
const express = require('express');

jest.mock('../../shared/logger', () => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    stream: { write: jest.fn() },
    createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));
jest.mock('../../middleware/auth-middleware', () => ({
    authenticateProvider: (req, _res, next) => next(),
    requireRole: () => (req, _res, next) => next(),
}));
// `{ prisma: {} }` was enough until the batch write was wrapped in a
// transaction so the transition lands in the hash-chained audit log atomically.
// From then on the handler called `prisma.$transaction` on an object that had
// no such method — a TypeError the route turned into a 500, which read as a
// validation failure rather than a missing stub. Run the callback inline: the
// status write itself is already mocked, so there is nothing to roll back.
// The transaction also carries the reviewer's workload check (services/assignment-policy.js):
// this reviewer holds nothing, so no confirmation is asked.
jest.mock('../../services/prisma-database', () => ({
    prisma: {
        $transaction: jest.fn(async (cb) => (typeof cb === 'function'
            ? cb({ $executeRaw: async () => 0, application: { count: async () => 0 } })
            : Promise.all(cb))),
    },
}));

const mockAssertStaff = jest.fn();
jest.mock('../../services/assignable-staff-service', () => ({
    assertAssignableStaff: (...a) => mockAssertStaff(...a),
}));
const mockFindApps = jest.fn(async () => []);
jest.mock('../../services/admin-application-service', () => ({
    findApplicationsByIds: (...a) => mockFindApps(...a),
}));
const mockWriteStatus = jest.fn(async () => ({}));
jest.mock('../../services/application-status-writer', () => ({ writeApplicationStatus: (...a) => mockWriteStatus(...a) }));
jest.mock('../../services/assignment-ledger-service', () => ({ recordAssignment: jest.fn(async () => null) }));
jest.mock('../../services/notification-service', () => ({ createNotification: jest.fn(async () => ({})) }));

const { adminBatchActions } = require('../../routes/api/provider/handlers/admin');

function buildApp(user = { id: 'admin-1', role: 'admin', organizationId: 'org-1' }) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = user; next(); });
    app.post('/admin/batch-actions', ...adminBatchActions);
    return app;
}

const PAID_APP = { id: 'app-1', status: 'DOC_FEE_PAID', formData: {}, workflowHistory: [], organizationId: 'org-1' };

beforeEach(() => {
    jest.clearAllMocks();
    mockFindApps.mockResolvedValue([PAID_APP]);
    mockWriteStatus.mockResolvedValue({});
});

describe('admin batch-actions ASSIGN — assignTo validation (M2)', () => {
    test('refuses (422) when assignTo is not assignable staff — and writes NOTHING', async () => {
        mockAssertStaff.mockRejectedValue(Object.assign(new Error('x'), {
            code: 'STAFF_NOT_ASSIGNABLE', statusCode: 422, messageTh: 'เจ้าหน้าที่ที่เลือกมอบหมายงานนี้ไม่ได้',
        }));
        const res = await request(buildApp())
            .post('/admin/batch-actions')
            .send({ applicationIds: ['app-1'], action: 'ASSIGN', assignTo: 'ghost-uuid' });
        expect(res.status).toBe(422);
        expect(res.body.code).toBe('STAFF_NOT_ASSIGNABLE');
        expect(mockWriteStatus).not.toHaveBeenCalled();
    });

    test('proceeds when assignTo is assignable in the application\'s organization', async () => {
        mockAssertStaff.mockResolvedValue({ id: 'rev-1', role: 'document_reviewer', organizationId: 'org-1' });
        const res = await request(buildApp())
            .post('/admin/batch-actions')
            .send({ applicationIds: ['app-1'], action: 'ASSIGN', assignTo: 'rev-1' });
        expect(res.status).toBe(200);
        expect(mockAssertStaff).toHaveBeenCalledWith(expect.objectContaining({ userId: 'rev-1', organizationId: 'org-1' }));
        expect(mockFindApps).toHaveBeenCalledWith(['app-1'], { organizationId: 'org-1' });
        expect(mockWriteStatus).toHaveBeenCalledTimes(1);
        expect(mockWriteStatus).toHaveBeenCalledWith(expect.objectContaining({ assertTransition: true, toStatus: 'ASSIGNED_FOR_REVIEW' }));
    });

    test('there is no batch REQUEST_DOCUMENTS: a revision request is the reviewer\'s decision (order 31)', async () => {
        mockFindApps.mockResolvedValue([{ ...PAID_APP, status: 'ASSIGNED_FOR_REVIEW' }]);
        const res = await request(buildApp())
            .post('/admin/batch-actions')
            .send({ applicationIds: ['app-1'], action: 'REQUEST_DOCUMENTS', reason: 'missing docs' });
        expect(res.status).toBe(400);
        expect(mockWriteStatus).not.toHaveBeenCalled();
    });
});

describe('admin batch-actions ASSIGN — separation of duties (fix round 1)', () => {
    test('refuses (409) the whole batch when assignTo is the inspector of any listed application — writes NOTHING', async () => {
        mockAssertStaff.mockResolvedValue({ id: 'u-3', role: 'document_reviewer', organizationId: 'org-1' });
        mockFindApps.mockResolvedValue([
            { ...PAID_APP, auditorId: null },
            { ...PAID_APP, id: 'app-2', auditorId: 'u-3' },
        ]);
        const res = await request(buildApp())
            .post('/admin/batch-actions')
            .send({ applicationIds: ['app-1', 'app-2'], action: 'ASSIGN', assignTo: 'u-3' });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('REVIEWER_IS_APPLICATION_INSPECTOR');
        expect(mockWriteStatus).not.toHaveBeenCalled();
    });
});


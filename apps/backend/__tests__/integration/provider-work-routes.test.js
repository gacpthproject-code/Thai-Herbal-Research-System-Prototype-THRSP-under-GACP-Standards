/**
 * /api/provider/work integration tests — ADR-016 Phase 3.
 *
 * The work inbox closes work items and never moves an application's status: the
 * done+advance path wrote status without a step's side effects and without naming the
 * reviewer or inspector, and was deleted (order 12, role-workflow audit 2026-10-06).
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

// Stub user-groups so we can control which groups the user has.
const userGroupsState = { groups: ['document_reviewer'] };
jest.mock('../../shared/user-groups', () => ({
    getUserGroups: jest.fn(async () => userGroupsState.groups),
    userInGroup: jest.fn(async (_p, _u, code) => userGroupsState.groups.includes('system_admin_dtam') || userGroupsState.groups.includes(code)),
    listGroupMemberUserIds: jest.fn(async () => []),
    clearCache: jest.fn(),
}));

// Stub work-activity-notifications so claim doesn't try to load
// notification-service / prisma.
jest.mock('../../services/work-activity-notifications', () => ({
    notifyAssigned: jest.fn(),
    notifyWarning: jest.fn(),
    notifyBreach: jest.fn(),
    workTypeLabel: (s) => s,
}));

// Capture writes for assertions.
const writeCalls = [];
jest.mock('../../services/application-status-writer', () => ({
    writeApplicationStatus: jest.fn(async (args) => {
        writeCalls.push(args);
        return {
            id: args.applicationId,
            status: args.toStatus,
            organizationId: 'org-1',
            ...args.additionalData,
        };
    }),
}));

// Mock prisma. The combined-action route uses prisma.$transaction —
// we run the callback with a pass-through tx that delegates to the
// same mocked methods.
const dbState = {
    activities: {
        'a-1': {
            id: 'a-1',
            applicationId: 'app-1',
            workType: 'DOC_REVIEW',
            candidateGroup: 'document_reviewer',
            state: 'CLAIMED',
            assignedUserId: 'u-1',
            triggeredAtStage: 'ASSIGNED_FOR_REVIEW',
            organizationId: 'org-1',
        },
    },
    application: {
        id: 'app-1',
        status: 'ASSIGNED_FOR_REVIEW',
        formData: { workflowState: 'ASSIGNED_FOR_REVIEW' },
        workflowHistory: [],
    },
};
// jest.mock factories cannot reference outer-scope variables. The
// idiomatic workaround is to declare the mock variable with a `mock`
// prefix (jest's own escape hatch), which the test originally tried
// to do via `prismaMock` — but Jest 29's check is "begins with `mock`"
// and `prismaMock` doesn't qualify. Use the proper `mockPrisma` name.
const mockPrisma = {
    workActivity: {
        // The route reads by id inside the caller's scope ({ AND: [{ id }, scope] }); the
        // scope itself is proven against real Postgres in staff-access-2-real-postgres.
        findFirst: jest.fn(async ({ where, include }) => {
            const activity = dbState.activities[where.AND[0].id];
            if (!activity) {return null;}
            if (include?.application && activity.applicationId) {
                return { ...activity, application: dbState.application };
            }
            return activity;
        }),
        update: jest.fn(async ({ where, data }) => {
            dbState.activities[where.id] = { ...dbState.activities[where.id], ...data };
            return dbState.activities[where.id];
        }),
    },
    application: {
        findUnique: jest.fn(async () => ({ ...dbState.application, healthId: 'h-1' })),
    },
};
mockPrisma.$transaction = jest.fn(async (cb) => cb(mockPrisma));
const prismaMock = mockPrisma; // legacy alias for the rest of the file
jest.mock('../../services/prisma-database', () => ({ prisma: mockPrisma }));

const router = require('../../routes/api/provider/work');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.user = { id: 'u-1', email: 'u1@example.com', role: 'document_reviewer', canonicalRole: 'document_reviewer', organizationId: 'org-1' };
        next();
    });
    app.use('/work', router);
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
    writeCalls.length = 0;
    userGroupsState.groups = ['document_reviewer'];
    dbState.activities['a-1'] = {
        id: 'a-1',
        applicationId: 'app-1',
        workType: 'DOC_REVIEW',
        candidateGroup: 'document_reviewer',
        state: 'CLAIMED',
        assignedUserId: 'u-1',
        triggeredAtStage: 'ASSIGNED_FOR_REVIEW',
        organizationId: 'org-1',
    };
    dbState.application = {
        id: 'app-1',
        status: 'ASSIGNED_FOR_REVIEW',
        formData: { workflowState: 'ASSIGNED_FOR_REVIEW' },
        workflowHistory: [],
    };
});

describe('POST /:id/done', () => {
    test('marks the activity DONE and writes no application status', async () => {
        const res = await request(buildApp())
            .post('/work/a-1/done')
            .send({ note: 'looks good' });
        expect(res.status).toBe(200);
        expect(res.body.data.activity.state).toBe('DONE');
        expect(res.body.data.application).toBeUndefined();
        expect(writeCalls).toHaveLength(0);
    });

    test('an advanceStatus in the body moves nothing: each step has its own screen', async () => {
        const res = await request(buildApp())
            .post('/work/a-1/done')
            .send({ advanceStatus: { toState: 'DOC_APPROVED' } });
        expect(res.status).toBe(200);
        expect(res.body.data.application).toBeUndefined();
        expect(writeCalls).toHaveLength(0);
        expect(dbState.application.status).toBe('ASSIGNED_FOR_REVIEW');
    });

    test('GET /:id/next-states is gone', async () => {
        const res = await request(buildApp()).get('/work/a-1/next-states');
        expect(res.status).toBe(404);
    });

    test('work.js has no status-write path at all', () => {
        const src = require('fs').readFileSync(require('path').join(__dirname, '../../routes/api/provider/work.js'), 'utf8');
        expect(src).not.toMatch(/application-status-writer|writeApplicationStatus\(/);
    });
});

// Staff reach the applicant through in-app notification (order 18): the work detail
// carries no applicant email, to the assignee or anyone else.
describe('GET /:id — no applicant email', () => {
    test('the assignee gets the triage fields and no email', async () => {
        dbState.application.applicant = { firstName: 'สมชาย', lastName: 'เกษตร', email: 'applicant@example.com' };
        const res = await request(buildApp()).get('/work/a-1');
        expect(res.status).toBe(200);
        expect(res.body.data.id).toBe('a-1');
        expect(res.body.data).not.toHaveProperty('applicantEmail');
        expect(JSON.stringify(res.body)).not.toContain('applicant@example.com');
    });
});

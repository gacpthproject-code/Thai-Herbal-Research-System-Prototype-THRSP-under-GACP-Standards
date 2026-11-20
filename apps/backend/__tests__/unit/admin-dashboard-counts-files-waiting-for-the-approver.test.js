'use strict';

jest.mock('../../routes/api/provider/handlers/shared', () => ({
    authenticateProvider: (_req, _res, next) => next(),
    requireRole: () => (_req, _res, next) => next(),
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
    adminRoles: [],
    getApplicantName: () => 'ผู้ยื่น',
}));
jest.mock('../../services/admin-dashboard-service', () => ({
    getApplicationStatusCounts: jest.fn(async () => [
        { status: 'AUDIT_CONFIRMED', _count: { id: 1 } },
        { status: 'AUDIT_PASSED', _count: { id: 2 } },
        { status: 'AUDIT_NOT_PASSED', _count: { id: 3 } },
        { status: 'CERTIFIED', _count: { id: 7 } },
    ]),
    countApplicationsCreatedSince: jest.fn(async () => 0),
    countPendingRevisionDeadlinesPastDue: jest.fn(async () => 0),
    sumCompletedPaymentsSince: jest.fn(async () => ({ _sum: { amount: 0 }, _count: { id: 0 } })),
    listAuditorUsers: jest.fn(async () => []),
    countAuditorActiveAssignmentsBulk: jest.fn(async () => []),
    listRecentApplications: jest.fn(async () => []),
}));

const { adminMasterDashboard } = require('../../routes/api/provider/handlers/admin-dashboard-handler');

test('a file the field inspector did not pass is in the audit phase until the approver decides', async () => {
    const handler = adminMasterDashboard[adminMasterDashboard.length - 1];
    const res = { status: jest.fn(() => res), json: jest.fn() };
    await handler({ user: { organizationId: 'org-1' } }, res);
    const body = res.json.mock.calls[0][0];
    expect(body.data.kpi.auditPhase).toBe(6);
    expect(body.data.kpi.total).toBe(13);
});

'use strict';

const express = require('express');
const request = require('supertest');

// ── Auth mock (V1-D…V5-B header-driven pattern) ─────────────────────────────
jest.mock('/home/ubuntu/work/wt-norec/apps/backend/middleware/auth-middleware', () => {
    const buildHeaderUser = (req, res, next) => {
        const role = req.headers['x-test-role'];
        if (!role || role === 'anonymous') {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        req.user = {
            id: req.headers['x-test-user-id'] || 'admin-1',
            email: req.headers['x-test-email'] || 'admin-1@example.com',
            role,
            canonicalRole: req.headers['x-test-canonical-role'] || role,
            providerId: role !== 'health' ? (req.headers['x-test-provider-id'] || '9999999999999') : null,
            healthId: role === 'health' ? 'health-1' : null,
            organizationId: req.headers['x-test-organization-id'] || 'org-1',
        };
        return next();
    };
    return {
        authenticateProvider: buildHeaderUser,
        authenticateAny: buildHeaderUser,
        authenticateHealth: buildHeaderUser,
        authenticateDTAM: buildHeaderUser,
        authenticate: buildHeaderUser,
        requireRole: () => (_req, _res, next) => next(),
        optionalAuth: buildHeaderUser,
        requireVerification: (_req, _res, next) => next(),
        checkPermission: () => (_req, _res, next) => next(),
        rateLimitSensitive: () => (_req, _res, next) => next(),
    };
});

// canonical-rbac stays REAL — these tests prove the canonical contract.
jest.mock('/home/ubuntu/work/wt-norec/apps/backend/shared/canonical-rbac', () => jest.requireActual('/home/ubuntu/work/wt-norec/apps/backend/shared/canonical-rbac'));

jest.mock('/home/ubuntu/work/wt-norec/apps/backend/shared/logger', () => {
    const mockLog = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    return { ...mockLog, createLogger: jest.fn(() => mockLog), stream: { write: jest.fn() } };
});

// ── Prisma mock ─────────────────────────────────────────────────────────────
const mockUserFindFirst = jest.fn();
const mockUserUpdate = jest.fn();

jest.mock('/home/ubuntu/work/wt-norec/apps/backend/services/prisma-database', () => ({
    prisma: {
        user: {
            findFirst: (...args) => mockUserFindFirst(...args),
            update: (...args) => mockUserUpdate(...args),
            findUnique: jest.fn().mockResolvedValue(null),
        },
    },
}));

// S6: findMutationTarget / loadProviderTarget do their OWN explicit org
// filtering (incl. the PLATFORM_ADMIN bypass), so the route must run them
// inside withoutTenantScope — otherwise the TENANT_READ_ORG_SCOPE prisma
// extension (ON on staging+prod) spreads `organizationId: ctx.org` over the
// WHERE and clobbers the bypass. Pass-through mock that records invocations.
const mockWithoutTenantScope = jest.fn((fn) => fn());
jest.mock('/home/ubuntu/work/wt-norec/apps/backend/services/tenant-context', () => ({
    withoutTenantScope: (...args) => mockWithoutTenantScope(...args),
    runWithTenantContext: (_ctx, fn) => fn(),
}));

// provider-user-service — mocked: backs the directory read utils AND the
// REAL admin-user-service.assertNotLastActiveAdmin (countOtherActiveAdmins).
const mockCountOtherActiveAdmins = jest.fn();
jest.mock('/home/ubuntu/work/wt-norec/apps/backend/services/provider-user-service', () => ({
    createProviderUser: jest.fn(),
    listAllUsersForProviderDirectory: jest.fn().mockResolvedValue([]),
    findUserForProviderDirectory: jest.fn().mockResolvedValue(null),
    findActiveProviderReviewerById: jest.fn(),
    countOtherActiveAdmins: (...args) => mockCountOtherActiveAdmins(...args),
    getActiveAdminUserGuard: jest.fn(),
    updateAdminUser: jest.fn(),
}));

// Audit spy — best-effort emission is asserted (and must never block).
const mockAuditLog = jest.fn().mockResolvedValue(null);
jest.mock('/home/ubuntu/work/wt-norec/apps/backend/middleware/audit-logger', () => ({
    auditLogger: { log: (...args) => mockAuditLog(...args) },
    AuditCategory: { ADMIN: 'ADMIN' },
    AuditSeverity: { WARNING: 'WARNING', INFO: 'INFO' },
    ResourceType: { USER: 'USER' },
}));

jest.mock('/home/ubuntu/work/wt-norec/apps/backend/utils/client-ip', () => ({
    getRequestIp: jest.fn(() => '127.0.0.1'),
}));

jest.mock('/home/ubuntu/work/wt-norec/apps/backend/utils/field-encryption', () => ({
    maskThaiId: jest.fn((value) => (value ? `MASKED(${value})` : null)),
}));

// bcryptjs — real hashing is slow (12 rounds); the PUT password test only
// asserts the epoch stamp, not the hash value.
jest.mock('bcryptjs', () => ({
    hash: jest.fn(async (pw) => `hashed:${pw}`),
}));

// Pulled after mocks so requires resolve to the stubs above.
const systemProviderRouter = require('/home/ubuntu/work/wt-norec/apps/backend/routes/api/system/provider');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/system/providers', systemProviderRouter);
    return app;
}

// ── Fixture: the mutation target lives in org-1 ─────────────────────────────
const TARGET = Object.freeze({
    id: 'target-1',
    uuid: 'uuid-target-1',
    email: 'target@dtam.go.th',
    firstName: 'Target',
    lastName: 'User',
    role: 'document_reviewer',
    status: 'ACTIVE',
    providerId: '1234567890123',
    accountType: 'PROVIDER',
    organizationId: 'org-1',
    isDeleted: false,
    lastLoginAt: null,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    // Lifecycle columns the unlock / disable-2fa routes branch on.
    isLocked: false,
    twoFactorEnabled: false,
});

// Honest findFirst: applies the WHERE clause fields the route is expected to
// thread (id / isDeleted / organizationId) against the fixture row. If the
// route FORGETS the org filter, the cross-tenant test gets the row back and
// fails loudly — this is what makes the 404 assertion load-bearing.
function seedFindFirst(row = TARGET) {
    mockUserFindFirst.mockImplementation(async ({ where } = {}) => {
        if (!where) { return row; }
        if (where.id !== undefined && where.id !== row.id) { return null; }
        if (where.isDeleted !== undefined && where.isDeleted !== row.isDeleted) { return null; }
        if (where.organizationId !== undefined && where.organizationId !== row.organizationId) { return null; }
        return row;
    });
}

function lastUpdateArg() {
    expect(mockUserUpdate).toHaveBeenCalled();
    return mockUserUpdate.mock.calls[mockUserUpdate.mock.calls.length - 1][0];
}


const FARMER = Object.freeze({
    ...TARGET, id: 'farmer-1', role: 'health', providerId: null, accountType: 'INDIVIDUAL',
    email: 'farmer@example.com',
});

describe('PUT /:id password — who, audit, epoch', () => {
    let app;
    beforeAll(() => { app = buildApp(); });
    beforeEach(() => {
        jest.clearAllMocks();
        mockCountOtherActiveAdmins.mockResolvedValue(2);
        mockUserUpdate.mockImplementation(async ({ where }) => ({ ...(where.id === 'farmer-1' ? FARMER : TARGET) }));
        mockAuditLog.mockResolvedValue(null);
    });

    test('A1 dtam admin sets a STAFF password (password-only) → 200, hash written, epoch stamped', async () => {
        seedFindFirst(TARGET);
        const res = await request(app).put('/api/system/providers/target-1')
            .set('x-test-role', 'system_admin_dtam').send({ password: 'N3wStr0ngPass!' });
        console.log('A1', res.status, JSON.stringify(lastUpdateArg().data));
        expect(res.status).toBe(200);
        expect(lastUpdateArg().data.password).toBe('hashed:N3wStr0ngPass!');
        expect(lastUpdateArg().data.sessionsRevokedAt).toBeDefined();
    });
    test('A2 password-only change writes NO audit row', async () => {
        seedFindFirst(TARGET);
        await request(app).put('/api/system/providers/target-1')
            .set('x-test-role', 'system_admin_dtam').send({ password: 'N3wStr0ngPass!' });
        console.log('A2 audit calls', mockAuditLog.mock.calls.length);
        expect(mockAuditLog).not.toHaveBeenCalled();
    });
    test('A2-control role change DOES write an audit row', async () => {
        seedFindFirst(TARGET);
        await request(app).put('/api/system/providers/target-1')
            .set('x-test-role', 'system_admin_dtam').send({ role: 'dispatcher' });
        console.log('A2c audit calls', mockAuditLog.mock.calls.length, mockAuditLog.mock.calls[0] && mockAuditLog.mock.calls[0][0].action);
        expect(mockAuditLog).toHaveBeenCalledTimes(1);
    });
    test('A3 one-character password is accepted (no strength policy)', async () => {
        seedFindFirst(TARGET);
        const res = await request(app).put('/api/system/providers/target-1')
            .set('x-test-role', 'system_admin_dtam').send({ password: 'a' });
        console.log('A3', res.status);
        expect(res.status).toBe(200);
        expect(lastUpdateArg().data.password).toBe('hashed:a');
    });
    test('A4 target need not be a provider: dtam admin sets a FARMER (health, no providerId, same org) password', async () => {
        seedFindFirst(FARMER);
        const res = await request(app).put('/api/system/providers/farmer-1')
            .set('x-test-role', 'system_admin_dtam').send({ password: 'N3wStr0ngPass!' });
        console.log('A4', res.status, JSON.stringify(lastUpdateArg().data));
        expect(res.status).toBe(200);
        expect(lastUpdateArg().where.id).toBe('farmer-1');
    });
    test('A4-control unlock on the same FARMER is refused (loadProviderTarget checks providerId)', async () => {
        seedFindFirst({ ...FARMER, isLocked: true });
        const res = await request(app).post('/api/system/providers/farmer-1/unlock')
            .set('x-test-role', 'system_admin_dtam').send();
        console.log('A4c', res.status, JSON.stringify(res.body));
        expect(res.status).toBe(400);
        expect(mockUserUpdate).not.toHaveBeenCalled();
    });
    test('A5 platform admin from another org sets a farmer password (cross-tenant)', async () => {
        seedFindFirst(FARMER);
        const res = await request(app).put('/api/system/providers/farmer-1')
            .set('x-test-role', 'system_admin_platform').set('x-test-organization-id', 'org-2')
            .send({ password: 'N3wStr0ngPass!' });
        console.log('A5', res.status);
        expect(res.status).toBe(200);
    });
    test('A6 admin sets OWN password without the old one (bypasses changePassword)', async () => {
        seedFindFirst({ ...TARGET, id: 'admin-1', role: 'system_admin_dtam' });
        const res = await request(app).put('/api/system/providers/admin-1')
            .set('x-test-role', 'system_admin_dtam').send({ password: 'N3wStr0ngPass!' });
        console.log('A6', res.status);
        expect(res.status).toBe(200);
    });
    for (const role of ['document_reviewer', 'field_inspector', 'dispatcher', 'health']) {
        test(`A7 ${role} → 403, no write`, async () => {
            seedFindFirst(TARGET);
            const res = await request(app).put('/api/system/providers/target-1')
                .set('x-test-role', role).send({ password: 'N3wStr0ngPass!' });
            expect(res.status).toBe(403);
            expect(mockUserUpdate).not.toHaveBeenCalled();
        });
    }
    test('A8 dtam admin cross-tenant → 404', async () => {
        seedFindFirst(TARGET);
        const res = await request(app).put('/api/system/providers/target-1')
            .set('x-test-role', 'system_admin_dtam').set('x-test-organization-id', 'org-2')
            .send({ password: 'N3wStr0ngPass!' });
        expect(res.status).toBe(404);
    });
});

'use strict';

/**
 * M1 PR-C — the OTHER three submit doors ask in whose name (plan D4).
 *
 * `applications-submit-capability-gate.test.js` covers the front door
 * (POST /api/applications/submit). Enforcing one door and leaving the rest open
 * is not enforcement, so this suite drives the three that the plan's D4 set
 * names alongside it, plus the create-side seed rule:
 *
 *   • POST   /api/applications/:id/car
 *
 * The DB-level proof (a real AuditLog FAILURE row, a real GRANT letting a
 * non-owner through) lives in `__tests__/integration/m1-submit-enforcement.test.js`
 * and only runs where DATABASE_URL exists. What is proven HERE is the wiring:
 * which entity is asked about, what the refusal looks like, and that nothing is
 * written when the answer is no.
 */

const express = require('express');
const request = require('supertest');

// ── shared stubs ─────────────────────────────────────────────────────────────

jest.mock('../../shared/logger', () => {
    const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { ...l, createLogger: jest.fn(() => l) };
});

jest.mock('../../middleware/auth-middleware', () => {
    const passUser = (req, _res, next) => {
        req.user = globalThis.__testUser;
        next();
    };
    return {
        authenticateHealth: passUser,
        authenticateAny: passUser,
        authenticateProvider: passUser,
    };
});

jest.mock('../../middleware/role-middleware', () => ({
    providerOnly: (_req, _res, next) => next(),
}));

// multer is constructed at module load; hand the CAR route a middleware that
// injects an already-"uploaded" file so the handler reaches the guard.
jest.mock('multer', () => {
    const multer = () => ({
        array: () => (req, _res, next) => {
            req.files = [{ filename: 'car-1.pdf', originalname: 'car.pdf', size: 1234 }];
            next();
        },
        single: () => (req, _res, next) => {
            req.file = { filename: 'car-1.pdf', originalname: 'car.pdf', size: 1234 };
            next();
        },
    });
    multer.diskStorage = () => ({});
    return multer;
});

const mockTransaction = jest.fn(async (cb) => cb({
    __tx: true,
    applicationBundle: { update: jest.fn(async () => ({ id: 'bundle-1', status: 'SUBMITTED', applications: [] })) },
    revisionDeadline: { updateMany: jest.fn(async () => ({ count: 1 })) },
    correctionRound: { findFirst: jest.fn(async () => null) },
    correctionSubmissionVersion: { create: jest.fn(async (a) => ({ id: 'csv', ...a.data })) },
    $queryRaw: jest.fn(async () => [{ status: 'CAR_PENDING' }]),
    application: { findFirst: jest.fn(async () => mockCarRow()) },
}));
const mockCarRow = () => ({
    status: 'CAR_PENDING',
    workflowHistory: [],
    formData: {
        workflowState: 'CAR_PENDING',
        carStagedFiles: [{ id: 'CAR-m1-door.pdf', filename: 'CAR-m1-door.pdf', path: '/uploads/car/CAR-m1-door.pdf', findingNo: 1 }],
    },
});

jest.mock('../../services/prisma-database', () => ({
    prisma: {
        $transaction: (...a) => mockTransaction(...a),
        application: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
        applicationBundle: {
            findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(),
        },
        revisionDeadline: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    },
}));

const mockWriteApplicationStatus = jest.fn().mockResolvedValue({ id: 'app-1' });
jest.mock('../../services/application-status-writer', () => {
    const actual = jest.requireActual('../../services/application-status-writer');
    return {
        writeApplicationStatus: (...a) => mockWriteApplicationStatus(...a),
        TERMINAL_STATUSES: actual.TERMINAL_STATUSES,
    };
});

jest.mock('../../services/application-service', () => ({
    resolveHealthIdentity: jest.fn(),
    healDraftEntityColumns: jest.fn(),
    findOwnedApplicationForApplicant: jest.fn(),
    getApplicationSlice: jest.fn(),
}));

jest.mock('../../services/notification-service', () => ({
    createNotification: jest.fn().mockResolvedValue(null),
    sendNotification: jest.fn().mockResolvedValue({}),
    NotifyType: {},
}));
jest.mock('../../services/provider-user-service', () => ({
    listActiveProviders: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../services/correction-submission-version-service', () => ({
    snapshotCorrectionSubmission: jest.fn().mockResolvedValue({ id: 'csv-1' }),
}));

jest.mock('../../services/application-filing-gates', () => ({
    judgeFiling: jest.fn().mockResolvedValue({
        refusal: null, requirementStamp: null, declarationsAcceptedAt: '2026-01-01T00:00:00.000Z', renewalChangeDeclaration: null,
    }),
}));

// The two guard dependencies, mocked with their REAL shapes: the engine
// primitive resolves on allow and rejects with the canonical denial
// (entity-effective-permissions-service.js:403-426), and auditLogger.log()
// opens its own transaction in production (audit-logger.js:479).
jest.mock('../../services/entity-effective-permissions-service', () => ({
    assertEntityActionPermission: jest.fn(),
}));
jest.mock('../../middleware/audit-logger', () => {
    const actual = jest.requireActual('../../middleware/audit-logger');
    return {
        ...actual,
        auditLogger: {
            log: jest.fn().mockResolvedValue({ id: 'audit-1' }),
            logWithin: jest.fn(() => jest.fn()),
        },
    };
});

const { prisma: prismaMock } = require('../../services/prisma-database');
const applicationService = require('../../services/application-service');
const { assertEntityActionPermission } = require('../../services/entity-effective-permissions-service');
const { auditLogger } = require('../../middleware/audit-logger');

const HEALTH_USER = {
    id: 'user-1',
    healthId: '1100000000008',
    canonicalId: 'canon-1',
    organizationId: 'org-1',
    canonicalRole: 'health',
    role: 'HEALTH_USER',
};

function engineDenial() {
    return Object.assign(new Error('denied'), { status: 403, code: 'ENTITY_PERMISSION_DENIED' });
}

function auditCalls() {
    return auditLogger.log.mock.calls.map(([arg]) => arg);
}

function mount(mountPath, routerPath) {
    const app = express();
    app.use(express.json());
    app.use(mountPath, require(routerPath));
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
    globalThis.__testUser = { ...HEALTH_USER };
    assertEntityActionPermission.mockResolvedValue({ allowed: true, via: 'ENTITY_PERMISSION' });
    applicationService.resolveHealthIdentity.mockResolvedValue({
        userId: 'user-1', healthId: '1100000000008',
    });
    mockWriteApplicationStatus.mockResolvedValue({ id: 'app-1' });
});

// ── door 4: CAR submit ───────────────────────────────────────────────────────

describe('M1 — POST /applications/:id/car', () => {
    let app;
    beforeAll(() => { app = mount('/api/applications', '../../routes/api/applications/applications-car'); });

    const post = () => request(app).post('/api/applications/app-1/car')
        .send({ notes: 'ส่งหลักฐาน', files: [{ id: 'CAR-m1-door.pdf', findingNo: 1 }] });
    const stagedOnDisk = require('path').join(require('../../services/uploads-root').BASE_UPLOAD_DIR, 'car', 'CAR-m1-door.pdf');
    beforeAll(() => {
        require('fs').mkdirSync(require('path').dirname(stagedOnDisk), { recursive: true });
        require('fs').writeFileSync(stagedOnDisk, '%PDF-1.4');
    });
    afterAll(() => { require('fs').rmSync(stagedOnDisk, { force: true }); });

    const CAR_ROW = {
        id: 'app-1',
        applicationNumber: 'GACP-2026-0001',
        status: 'CAR_PENDING',
        healthId: '1100000000008',
        entityId: 'ent-1',
        formData: { workflowState: 'CAR_PENDING', carDueAt: '2099-01-01T00:00:00.000Z' },
        workflowHistory: [],
    };

    beforeEach(() => {
        applicationService.findOwnedApplicationForApplicant.mockResolvedValue(
            JSON.parse(JSON.stringify(CAR_ROW)),
        );
    });

    it('refuses with 403 when the caller may not act for the application entity — nothing written', async () => {
        assertEntityActionPermission.mockRejectedValue(engineDenial());

        const r = await post();

        expect(r.status).toBe(403);
        expect(r.body.code).toBe('ENTITY_PERMISSION_DENIED');
        expect(mockWriteApplicationStatus).not.toHaveBeenCalled();
        expect(auditCalls()).toContainEqual(expect.objectContaining({
            result: 'FAILURE',
            metadata: expect.objectContaining({ onBehalfOfEntityId: 'ent-1' }),
        }));
    });

    it('refuses with 400 when the row names no entity', async () => {
        applicationService.findOwnedApplicationForApplicant.mockResolvedValue({
            ...JSON.parse(JSON.stringify(CAR_ROW)), entityId: null,
        });

        const r = await post();

        expect(r.status).toBe(400);
        expect(r.body.code).toBe('VALIDATION_ERROR');
        expect(mockWriteApplicationStatus).not.toHaveBeenCalled();
    });

    it('allows the owner through, asking about the application row entity', async () => {
        const r = await post();

        expect(r.status).toBe(200);
        expect(assertEntityActionPermission).toHaveBeenCalledWith(expect.objectContaining({
            entityId: 'ent-1', userId: 'user-1', permission: 'SUBMIT_APPLICATION',
        }));
        // Audit F3 — pin the accepted-act envelope on this door too.
        expect(auditCalls()).toContainEqual(expect.objectContaining({
            result: 'SUCCESS', action: 'APPLICATION_CAR_SUBMIT_ACCEPTED',
            metadata: expect.objectContaining({ onBehalfOfEntityId: 'ent-1' }),
        }));
    });
});

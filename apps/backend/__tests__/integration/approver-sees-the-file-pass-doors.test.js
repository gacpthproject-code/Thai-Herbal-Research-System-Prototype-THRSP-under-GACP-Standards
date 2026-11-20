'use strict';

/**
 * Batch A (fix/approver-sees-the-file) — the inspector's PASS doors.
 *
 *  item 2  PASS on the job-sheet door (POST .../audit-decisions) and on the canonical
 *          workflow door (POST .../workflow-transitions) must run the onsite-evidence
 *          gate BEFORE AUDIT_PASSED is written; a refusal is a 422 with Thai catalogue
 *          copy, not a 500 found later by the approver.
 *          final-approvals: a gate refusal there is also a 422, never "Failed to
 *          finalize approval".
 *  item 4  CAR_REVIEWING -> CAR_PENDING is table-legal for the inspector, so MINOR/MAJOR
 *          are accepted; REJECT is not an edge from CAR_REVIEWING and is refused.
 *  item 5  The applicant's PASS notice is Thai and says the result awaits the approver;
 *          every certificate approver of the organisation is told when a file reaches
 *          AUDIT_PASSED.
 */

const request = require('supertest');
const express = require('express');

let mockUserHeader = {};
jest.mock('../../middleware/auth-middleware', () => {
    const user = (req) => {
        const role = req.headers['x-test-role'] || 'field_inspector';
        return {
            id: req.headers['x-test-user-id'] || 'provider-1',
            role,
            canonicalRole: role,
            providerId: '1234567890123',
            organizationId: 'org-1',
        };
    };
    return {
        authenticateProvider: (req, _res, next) => { req.user = user(req); next(); },
        authenticateDTAM: (req, _res, next) => { req.user = user(req); next(); },
        authenticate: (_req, _res, next) => next(),
        authenticateHealth: (_req, _res, next) => next(),
        authenticateAny: (_req, _res, next) => next(),
        requireRole: () => (_req, _res, next) => next(),
    };
});
jest.mock('../../services/prisma-database', () => {
    const prisma = {
        ...require('../../test-support/paid-checkout-orders-stub').paidCheckoutOrders(),
        application: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
        invoice: { findFirst: jest.fn(), findMany: jest.fn() },
        user: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
        revisionDeadline: { findUnique: jest.fn(), upsert: jest.fn(), updateMany: jest.fn() },
        notification: { create: jest.fn().mockResolvedValue({ id: 'notif-1' }) },
        correctionRound: { count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue({ id: 'round-1' }) },
        auditLog: { findMany: jest.fn().mockResolvedValue([]) },
        // the gate's reads
        auditChecklist: { findFirst: jest.fn() },
        applicationDocumentReview: { findMany: jest.fn().mockResolvedValue([]) },
        farmAuditPhoto: { findMany: jest.fn() },
        farmAuditChecklistItem: { count: jest.fn() },
    };
    prisma.$transaction = (fn) => (typeof fn === 'function' ? fn(prisma) : Promise.all(fn));
    // the decision locks the application row before reading it (security review 2026-10-07 F1)
    prisma.$queryRaw = jest.fn().mockResolvedValue([{ status: 'AUDIT_PASSED' }]);
    return { prisma };
});
jest.mock('../../middleware/audit-logger', () => ({
    auditLogger: { log: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    statusTransitionAuditHook: jest.fn(() => jest.fn().mockResolvedValue(null)),
    AuditCategory: { APPLICATION: 'APPLICATION' },
    AuditSeverity: { INFO: 'INFO', WARNING: 'WARNING' },
    ResourceType: { APPLICATION: 'APPLICATION' },
}));
jest.mock('../../shared/logger', () => {
    const mockLog = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
    mockLog.createLogger = jest.fn(() => ({ ...mockLog }));
    mockLog.stream = { write: jest.fn() };
    return mockLog;
});
jest.mock('../../config/redis', () => null);
jest.mock('../../services/cache-service', () => ({
    get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1), getOrSet: jest.fn((_k, fn) => fn()),
}));
jest.mock('../../middleware/rate-limiter', () => {
    const pass = (_req, _res, next) => next();
    return { rateLimiter: pass, strictRateLimiter: pass, createRateLimiter: () => pass };
});
jest.mock('../../services/certificate-service', () => ({
    generateCertificate: jest.fn(),
    findCertificateForApplication: jest.fn().mockResolvedValue(null),
    revokeCertificateForApplication: jest.fn().mockResolvedValue(null),
}));

const { prisma } = require('../../services/prisma-database');
const certificateService = require('../../services/certificate-service');
const providerRouter = require('../../routes/api/provider/index');

const APP_PASS = (over = {}) => ({
    id: 'app-1',
    applicationNumber: 'APP-9001',
    healthId: 'Applicant-1',
    organizationId: 'org-1',
    status: 'AUDIT_CONFIRMED',
    auditorId: 'provider-1',
    formData: { workflowState: 'AUDIT_CONFIRMED' },
    workflowHistory: [],
    ...over,
});

const distinctPhotos = (n) => Array.from({ length: n }, (_, i) => ({ fileHash: `${i}`.padStart(64, 'a') }));

/**
 * The application an inspector decides on, the same row on every read: the door's lookup, the
 * result writer's read under the row lock, and the lock itself (services/inspection-result-service.js).
 */
const seat = (row) => {
    prisma.application.findFirst.mockResolvedValue(row);
    prisma.application.findUnique.mockImplementation(async () => ({
        ...row, updatedAt: new Date(), entityId: null,
        applicant: { id: 'farmer-1', status: 'ACTIVE', isDeleted: false, role: 'health' },
    }));
    prisma.$queryRaw.mockResolvedValue([{ status: row.status, version: 0 }]);
};

describe('approver-sees-the-file — PASS doors', () => {
    let app;
    beforeAll(() => {
        app = express();
        app.use(express.json());
        app.use('/api/provider', providerRouter);
    });
    beforeEach(() => {
        jest.clearAllMocks();
        prisma.$queryRaw.mockResolvedValue([{ status: 'AUDIT_PASSED' }]);
        prisma.application.findMany.mockResolvedValue([]);
        prisma.application.update.mockImplementation(async ({ where, data }) => ({
            id: where.id, applicationNumber: 'APP-9001', status: data.status || 'AUDIT_PASSED',
            healthId: 'Applicant-1', organizationId: 'org-1', formData: data.formData || {}, updatedAt: new Date(),
        }));
        prisma.application.findUnique.mockResolvedValue({
            id: 'app-1', applicationNumber: 'APP-9001', status: 'AUDIT_PASSED', healthId: 'Applicant-1',
            organizationId: 'org-1', formData: {}, updatedAt: new Date(),
            // who the applicant-side notices go to (services/notification/application-parties):
            // the applicant, and no holder in this fixture
            entityId: null, applicant: { id: 'farmer-1', status: 'ACTIVE', isDeleted: false, role: 'health' },
        });
        prisma.user.findFirst.mockResolvedValue({ id: 'farmer-1', organizationId: 'org-1' });
        prisma.user.findUnique.mockResolvedValue({ id: 'farmer-1', organizationId: 'org-1', email: null, phoneNumber: null });
        prisma.user.findMany.mockResolvedValue([]);
        prisma.revisionDeadline.findUnique.mockResolvedValue(null);
        prisma.auditChecklist.findFirst.mockResolvedValue(null);
        prisma.farmAuditPhoto.findMany.mockResolvedValue([]);
        prisma.farmAuditChecklistItem.count.mockResolvedValue(0);
        mockUserHeader = {};
    });

    // ── item 2 ──────────────────────────────────────────────────────────────
    describe('item 2 — the evidence gate runs at the inspector PASS', () => {
        test('job-sheet PASS with no onsite audit recorded -> 422 NO_ONSITE_AUDIT, nothing written', async () => {
            seat(APP_PASS());
            const res = await request(app)
                .post('/api/provider/auditor/applications/app-1/audit-decisions')
                .set('x-test-role', 'field_inspector').set('x-test-user-id', 'provider-1')
                .send({ decision: 'PASS' });
            expect(res.status).toBe(422);
            expect(res.body.code).toBe('NO_ONSITE_AUDIT');
            expect(res.body.messageTh).toMatch(/[฀-๿]/);
            expect(prisma.application.update).not.toHaveBeenCalled();
        });

        test('job-sheet PASS with too few distinct photos -> 422 INSUFFICIENT_PHOTOS, nothing written', async () => {
            seat(APP_PASS());
            prisma.auditChecklist.findFirst.mockResolvedValue({ id: 'audit-1' });
            prisma.farmAuditPhoto.findMany.mockResolvedValue(distinctPhotos(2));
            const res = await request(app)
                .post('/api/provider/auditor/applications/app-1/audit-decisions')
                .set('x-test-role', 'field_inspector').set('x-test-user-id', 'provider-1')
                .send({ decision: 'PASS' });
            expect(res.status).toBe(422);
            expect(res.body.code).toBe('INSUFFICIENT_PHOTOS');
            expect(prisma.application.update).not.toHaveBeenCalled();
        });

        test('job-sheet PASS with full evidence is written as AUDIT_PASSED', async () => {
            seat(APP_PASS());
            prisma.auditChecklist.findFirst.mockResolvedValue({ id: 'audit-1' });
            prisma.farmAuditPhoto.findMany.mockResolvedValue(distinctPhotos(6));
            prisma.farmAuditChecklistItem.count.mockResolvedValue(99);
            const res = await request(app)
                .post('/api/provider/auditor/applications/app-1/audit-decisions')
                .set('x-test-role', 'field_inspector').set('x-test-user-id', 'provider-1')
                .send({ decision: 'PASS' });
            expect(res.status).toBe(200);
            expect(prisma.application.update.mock.calls[0][0].data.status).toBe('AUDIT_PASSED');
        });

        test('workflow-transitions to AUDIT_PASSED by the inspector -> same gate, 422 with the code', async () => {
            prisma.application.findFirst.mockResolvedValue(APP_PASS());
            const res = await request(app)
                .post('/api/provider/applications/app-1/workflow-transitions')
                .set('x-test-role', 'field_inspector').set('x-test-user-id', 'provider-1')
                .send({ toState: 'AUDIT_PASSED' });
            expect(res.status).toBe(422);
            expect(res.body.code).toBe('NO_ONSITE_AUDIT');
            expect(prisma.application.update).not.toHaveBeenCalled();
        });

        test('final-approvals: a gate refusal from certificate issuance is a 422 with Thai copy, not a 500', async () => {
            const decidable = APP_PASS({
                status: 'AUDIT_PASSED', auditorId: 'inspector-9',
                formData: { workflowState: 'AUDIT_PASSED', decisionFileViews: { 'approver-1': '2026-10-07T00:00:00.000Z' } },
            });
            prisma.application.findFirst.mockResolvedValue(decidable);
            prisma.application.findUnique.mockResolvedValue(decidable);
            const err = new Error('assertOnsiteEvidenceSufficient: minimum 5 photos required (got 2 distinct)');
            err.code = 'INSUFFICIENT_PHOTOS';
            certificateService.generateCertificate.mockRejectedValue(err);
            const res = await request(app)
                .post('/api/provider/auditor/applications/app-1/final-approvals')
                .set('x-test-role', 'certificate_approver').set('x-test-user-id', 'approver-1')
                .send({ reason: 'หลักฐานครบ' });
            expect(res.status).toBe(422);
            expect(res.body.code).toBe('INSUFFICIENT_PHOTOS');
            expect(res.body.error).not.toMatch(/Failed to finalize approval/);
            expect(res.body.error).toMatch(/[฀-๿]/);
        });
    });

    // ── item 4 ──────────────────────────────────────────────────────────────
    describe('item 4 — CAR_REVIEWING: the handler accepts what the table allows', () => {
        const reviewing = () => APP_PASS({ status: 'CAR_REVIEWING', formData: { workflowState: 'CAR_REVIEWING' } });

        test.each(['MINOR', 'MAJOR'])('%s on CAR_REVIEWING -> CAR_PENDING', async (decision) => {
            seat(reviewing());
            const res = await request(app)
                .post('/api/provider/auditor/applications/app-1/audit-decisions')
                .set('x-test-role', 'field_inspector').set('x-test-user-id', 'provider-1')
                .send({ decision, notes: 'ยังแก้ไม่ครบ' });
            expect(res.status).toBe(200);
            expect(prisma.application.update.mock.calls[0][0].data.status).toBe('CAR_PENDING');
        });

        test('FAIL on CAR_REVIEWING stays refused (desk review cannot fail, order 56(2)) with Thai copy', async () => {
            seat(reviewing());
            const res = await request(app)
                .post('/api/provider/auditor/applications/app-1/audit-decisions')
                .set('x-test-role', 'field_inspector').set('x-test-user-id', 'provider-1')
                .send({ decision: 'FAIL', notes: 'x', findings: [{ nonConformity: 'รั้วชำรุด', correctiveAction: 'ซ่อมรั้ว' }] });
            expect([res.status, res.body.code]).toEqual([400, 'CAR_REVIEW_CANNOT_FAIL']);
            expect(res.body.error).toMatch(/[฀-๿]/);
            expect(prisma.application.update).not.toHaveBeenCalled();
        });
    });

    // ── item 5 ──────────────────────────────────────────────────────────────
    describe('item 5 — messages', () => {
        // the writer's applicant fanout dedupes per (user, type, application) for an hour, so each
        // test that reads it uses its own application id
        test('applicant PASS notice is Thai and says the result awaits the approver', async () => {
            seat(APP_PASS({ id: 'app-n1' }));
            prisma.auditChecklist.findFirst.mockResolvedValue({ id: 'audit-1' });
            prisma.farmAuditPhoto.findMany.mockResolvedValue(distinctPhotos(6));
            prisma.farmAuditChecklistItem.count.mockResolvedValue(99);
            const res = await request(app)
                .post('/api/provider/auditor/applications/app-n1/audit-decisions')
                .set('x-test-role', 'field_inspector').set('x-test-user-id', 'provider-1')
                .send({ decision: 'PASS' });
            expect(res.status).toBe(200);
            const rows = prisma.notification.create.mock.calls.map((c) => c[0].data);
            const farmerRows = rows.filter((r) => r.userId === 'farmer-1');
            expect(farmerRows.length).toBeGreaterThan(0);
            for (const r of farmerRows) {
                expect(`${r.title} ${r.message}`).not.toMatch(/certificate issued|Inspection passed/i);
            }
            const passNote = farmerRows.find((r) => /ผ่าน/.test(`${r.title} ${r.message}`));
            expect(passNote).toBeTruthy();
            expect(`${passNote.title} ${passNote.message}`).toMatch(/ตัดสินให้การรับรอง/);
        });

        test('fix round 1: a PASS gives the applicant exactly one notice', async () => {
            seat(APP_PASS({ id: 'app-n2' }));
            prisma.auditChecklist.findFirst.mockResolvedValue({ id: 'audit-1' });
            prisma.farmAuditPhoto.findMany.mockResolvedValue(distinctPhotos(6));
            prisma.farmAuditChecklistItem.count.mockResolvedValue(99);
            // the writer's fanout resolves the applicant through user.findUnique — give it the
            // real shape so BOTH senders can reach the farmer (the duplicate hid behind a stub)
            prisma.user.findUnique.mockResolvedValue({ id: 'farmer-1', organizationId: 'org-1', email: null, phoneNumber: null });
            const res = await request(app)
                .post('/api/provider/auditor/applications/app-n2/audit-decisions')
                .set('x-test-role', 'field_inspector').set('x-test-user-id', 'provider-1')
                .send({ decision: 'PASS' });
            expect(res.status).toBe(200);
            const farmerRows = prisma.notification.create.mock.calls.map((c) => c[0].data).filter((r) => r.userId === 'farmer-1');
            expect(farmerRows).toHaveLength(1);
        });

        test('every certificate approver of the organisation is told when a file reaches AUDIT_PASSED', async () => {
            seat(APP_PASS());
            prisma.auditChecklist.findFirst.mockResolvedValue({ id: 'audit-1' });
            prisma.farmAuditPhoto.findMany.mockResolvedValue(distinctPhotos(6));
            prisma.farmAuditChecklistItem.count.mockResolvedValue(99);
            prisma.user.findMany.mockImplementation(async ({ where } = {}) => (
                where?.role?.in?.includes('certificate_approver') ? [{ id: 'approver-1' }, { id: 'approver-2' }] : []
            ));
            const res = await request(app)
                .post('/api/provider/auditor/applications/app-1/audit-decisions')
                .set('x-test-role', 'field_inspector').set('x-test-user-id', 'provider-1')
                .send({ decision: 'PASS' });
            expect(res.status).toBe(200);
            const rows = prisma.notification.create.mock.calls.map((c) => c[0].data);
            const toApprovers = rows.filter((r) => ['approver-1', 'approver-2'].includes(r.userId));
            expect(toApprovers.map((r) => r.userId).sort()).toEqual(['approver-1', 'approver-2']);
            expect(toApprovers[0].message).toMatch(/APP-9001/);
            expect(toApprovers[0].message).toMatch(/[฀-๿]/);
            expect(JSON.stringify(toApprovers[0].metadata)).toMatch(/certification-decisions\/app-1/);
        });
    });
});

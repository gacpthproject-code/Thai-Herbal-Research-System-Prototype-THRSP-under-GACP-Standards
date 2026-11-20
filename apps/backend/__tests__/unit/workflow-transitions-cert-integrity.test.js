'use strict';

/**
 * CERTIFICATE-INTEGRITY cluster — carpet-bomb inversion audit 2026-07-06.
 *
 * Handler findings (routes/api/provider/handlers/workflow-transitions-handler.js):
 *
 *   A1 — ADMIN `force` transition landing on AUDIT_PASSED must NOT let the
 *        writer's cert hook auto-mint a certificate (the single-auditor SoD
 *        back-door). The 3 admin force/revert siblings already pass
 *        autoIssueCertificate:false; this is the missed 4th sibling on the
 *        canonical endpoint. A legitimate (non-force) auditor AUDIT_PASSED must
 *        STILL auto-issue. The approver's own edges (AUDIT_PASSED → APPROVED /
 *        REJECTED, APPROVED → CERTIFIED) are refused here: they belong to the
 *        decision file (order 29, 2026-10-07).
 *
 *   A2 — AUDIT_PASSED -> CAR_REVIEWING on this canonical endpoint must VOID the
 *        certificate auto-issued on the pass (mirror auditor.js reject-to-auditor)
 *        so the public QR stops reporting VALID for a farm under corrective
 *        action, and a re-pass can mint a fresh cert. An admin force never
 *        revokes (order 34(4)).
 */

const express = require('express');
const request = require('supertest');

let mockCurrentUser = null;
const mockWriteApplicationStatus = jest.fn();
const mockRevokeCertificateForApplication = jest.fn();
const mockBuildTransitionUpdate = jest.fn();
const mockGetById = jest.fn();
const mockFindFirstWithWhere = jest.fn();
const mockTx = { __tx: true };
const mockTransaction = jest.fn(async (cb) => cb(mockTx));

jest.mock('../../routes/api/provider/handlers/workflow-handler-deps', () => ({
    prisma: { $transaction: (...a) => mockTransaction(...a) },
    authenticateProvider: (req, _res, next) => { req.user = mockCurrentUser; next(); },
    requireCanonicalPermission: () => (_req, _res, next) => next(),
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
    PERMISSIONS: { APPLICATION_WORKFLOW_TRANSITION: 'perm' },
    obj: (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {}),
    arr: (x) => (Array.isArray(x) ? x : []),
    workflowTransitionService: {
        normalizeWorkflowStateInput: (s) => (s ? String(s).toUpperCase() : null),
        resolveStateFromApplication: (app) => app.status,
        buildTransitionUpdate: (...a) => mockBuildTransitionUpdate(...a),
    },
    getRequestIp: () => '127.0.0.1',
    auditLogger: { log: jest.fn() },
    AuditCategory: { APPLICATION: 'APPLICATION' },
    AuditSeverity: { INFO: 'INFO', WARNING: 'WARNING' },
    ResourceType: { APPLICATION: 'APPLICATION' },
    resolveUserIdFromHealthId: jest.fn().mockResolvedValue('health-user-1'),
    getRevisionDueAt: () => null,
    REVISION_SLA_DAYS: 5,
    addWorkingDays: (d) => d,
    loadHolidaySet: jest.fn().mockResolvedValue(new Set()),
}));

// The inspector's PASS asks the onsite-evidence gate before the write (Batch A item 2);
// the gate has its own suites (onsite-evidence-gate, approver-sees-the-file-pass-doors).
jest.mock('../../services/onsite-evidence-gate', () => ({
    assertOnsiteEvidenceSufficient: jest.fn().mockResolvedValue({}),
    assertOnsiteEvidenceForPass: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../services/application-status-writer', () => ({
    writeApplicationStatus: (...a) => mockWriteApplicationStatus(...a),
}));

// H (full-system audit 2026-07-11): the handler now imports
// statusTransitionAuditHook directly to wire an in-tx audit row. Mock it so the
// test never pulls the real audit-logger → prisma-database (process.exit) chain.
const mockAuditHook = jest.fn().mockResolvedValue({});
const mockStatusTransitionAuditHook = jest.fn(() => mockAuditHook);
jest.mock('../../middleware/audit-logger', () => ({
    auditLogger: { log: jest.fn(), logWithin: jest.fn() },
    AuditCategory: { APPLICATION: 'APPLICATION' },
    AuditSeverity: { INFO: 'INFO', WARNING: 'WARNING' },
    ResourceType: { APPLICATION: 'APPLICATION' },
    statusTransitionAuditHook: (...a) => mockStatusTransitionAuditHook(...a),
}));

jest.mock('../../services/certificate-service', () => ({
    revokeCertificateForApplication: (...a) => mockRevokeCertificateForApplication(...a),
}));

// R2 M2/M3b: the handler mints its official letter inside the SAME tx as the
// status write (D-8). These cert-integrity cases drive force -> REJECTED, which
// is now a terminal-decision letter path; the letter itself is pinned by
// __tests__/unit/terminal-decision-letter.test.js. Stub the mint here so this
// file keeps testing exactly what it was written to test (cert void + cert
// mint), rather than the notification stack it does not model
// (`mockTx` is a bare handle with no notification delegate).
jest.mock('../../services/decision-letter-service', () => ({
    mintCorrectionLetter: jest.fn().mockResolvedValue({ id: 'letter-1' }),
    CORRECTION_LETTER_STAGE: { DOC_REVIEW: 'DOC_REVIEW', FIELD_AUDIT_CAR: 'FIELD_AUDIT_CAR' },
}));

jest.mock('../../shared/application-visibility', () => ({
    withVisibility: (where) => where,
}));

jest.mock('../../services/application-service', () => ({
    findFirstWithWhere: (...a) => mockFindFirstWithWhere(...a),
    getById: (...a) => mockGetById(...a),
    isApplicationCommentModelAvailable: () => false,
    createApplicationCommentIfAvailable: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../services/admin-application-service', () => ({
    bulkUpdateRevisionDeadlineStatus: jest.fn().mockResolvedValue(null),
    findRevisionDeadlineByApplicationId: jest.fn().mockResolvedValue(null),
    upsertRevisionDeadline: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../routes/api/provider/handlers/workflow-side-effects', () => ({
    handleRevisionDeadlines: jest.fn().mockResolvedValue(null),
    sendTransitionNotifications: jest.fn().mockResolvedValue(null),
    logTransitionAudit: jest.fn().mockResolvedValue(null),
}));

const { applicationsWorkflowTransitions } = require('../../routes/api/provider/handlers/workflow-transitions-handler');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.post('/apps/:id/workflow-transitions', ...applicationsWorkflowTransitions);
    return app;
}

function seedApplication(overrides = {}) {
    mockFindFirstWithWhere.mockResolvedValue({
        id: 'app-1',
        applicationNumber: 'APP-001',
        healthId: 'h-1',
        status: 'AUDIT_CONFIRMED',
        formData: {},
        workflowHistory: [],
        reviewerId: null,
        auditorId: null,
        ...overrides,
    });
    mockGetById.mockResolvedValue({
        id: 'app-1',
        applicationNumber: 'APP-001',
        status: 'X',
        formData: {},
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockWriteApplicationStatus.mockResolvedValue({ id: 'app-1', status: 'X', formData: {} });
    mockRevokeCertificateForApplication.mockResolvedValue({ id: 'cert-1', status: 'revoked' });
    mockTransaction.mockImplementation(async (cb) => cb(mockTx));
});

// ── A1 ──────────────────────────────────────────────────────────────────────
describe('A1 canonical endpoint — ADMIN force must NOT auto-mint a cert on AUDIT_PASSED', () => {
    test('force -> AUDIT_PASSED passes autoIssueCertificate:false to the writer', async () => {
        mockCurrentUser = { id: 'admin-1', role: 'admin', canonicalRole: 'admin', organizationId: 'org-1', providerId: 'p-1' };
        seedApplication({ status: 'APPROVED' });
        mockBuildTransitionUpdate.mockReturnValue({
            previousState: 'APPROVED',
            nextState: 'AUDIT_PASSED',
            nextLegacyStatus: 'AUDIT_PASSED',
            updateData: { status: 'AUDIT_PASSED', formData: {}, workflowHistory: [] },
            transitionEvent: { metadata: {} },
        });

        await request(buildApp())
            .post('/apps/app-1/workflow-transitions')
            .send({ toState: 'AUDIT_PASSED', force: true, reasonCode: 'ADMIN_OVERRIDE', comment: 'emergency' });

        expect(mockWriteApplicationStatus).toHaveBeenCalledTimes(1);
        expect(mockWriteApplicationStatus).toHaveBeenCalledWith(
            expect.objectContaining({ toStatus: 'AUDIT_PASSED', autoIssueCertificate: false }),
        );
    });

    test('legitimate (non-force) auditor AUDIT_PASSED still auto-issues (autoIssueCertificate !== false)', async () => {
        mockCurrentUser = { id: 'auditor-1', role: 'auditor', canonicalRole: 'auditor', organizationId: 'org-1', providerId: 'p-1' };
        seedApplication({ status: 'AUDIT_CONFIRMED' });
        mockBuildTransitionUpdate.mockReturnValue({
            previousState: 'AUDIT_CONFIRMED',
            nextState: 'AUDIT_PASSED',
            nextLegacyStatus: 'AUDIT_PASSED',
            updateData: { status: 'AUDIT_PASSED', formData: {}, workflowHistory: [] },
            transitionEvent: { metadata: {} },
        });

        await request(buildApp())
            .post('/apps/app-1/workflow-transitions')
            .send({ toState: 'AUDIT_PASSED' });

        expect(mockWriteApplicationStatus).toHaveBeenCalledTimes(1);
        const args = mockWriteApplicationStatus.mock.calls[0][0];
        expect(args.toStatus).toBe('AUDIT_PASSED');
        expect(args.autoIssueCertificate).not.toBe(false);
    });

    test('the approver\'s decisions are refused here: they belong to the decision file (order 29)', async () => {
        mockCurrentUser = { id: 'approver-1', role: 'certificate_approver', canonicalRole: 'certificate_approver', organizationId: 'org-1', providerId: 'p-1' };
        for (const [from, to, force] of [['AUDIT_PASSED', 'APPROVED', false], ['AUDIT_PASSED', 'REJECTED', true], ['APPROVED', 'CERTIFIED', false]]) {
            seedApplication({ status: from });
            const res = await request(buildApp())
                .post('/apps/app-1/workflow-transitions')
                .send({ toState: to, force, reasonCode: 'ADMIN_OVERRIDE', comment: 'x' });
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('CERTIFICATION_DECISION_USE_FILE');
        }
        expect(mockWriteApplicationStatus).not.toHaveBeenCalled();
        expect(mockRevokeCertificateForApplication).not.toHaveBeenCalled();
    });

    // A1 — buildTransitionUpdate lets ADMIN+force land APPROVED from other states
    // (incl. CERTIFIED). A compromised admin who force→APPROVED after a revoke must
    // not mint a FRESH active cert off the surviving audit-pass record: the writer
    // hook stays blocked (autoIssueCertificate:false).
    test('force -> APPROVED does NOT mint (no cert resurrection)', async () => {
        mockCurrentUser = { id: 'admin-1', role: 'admin', canonicalRole: 'admin', organizationId: 'org-1', providerId: 'p-1' };
        seedApplication({ status: 'CERTIFIED' });
        mockBuildTransitionUpdate.mockReturnValue({
            previousState: 'CERTIFIED',
            nextState: 'APPROVED',
            nextLegacyStatus: 'APPROVED',
            updateData: { status: 'APPROVED', formData: {}, workflowHistory: [] },
            transitionEvent: { metadata: {} },
        });

        const res = await request(buildApp())
            .post('/apps/app-1/workflow-transitions')
            .send({ toState: 'APPROVED', force: true, reasonCode: 'ADMIN_OVERRIDE', comment: 'resurrect attempt' });

        expect(res.status).toBe(200);
        expect(mockWriteApplicationStatus).toHaveBeenCalledWith(
            expect.objectContaining({ toStatus: 'APPROVED', autoIssueCertificate: false }),
        );
    });
});

// ── A2 ──────────────────────────────────────────────────────────────────────
describe('A2 canonical endpoint — AUDIT_PASSED -> CAR_REVIEWING must void the live cert', () => {
    test('voids the cert in the same transaction as the status write', async () => {
        mockCurrentUser = { id: 'auditor-1', role: 'auditor', canonicalRole: 'auditor', organizationId: 'org-1', providerId: 'p-1' };
        seedApplication({ status: 'AUDIT_PASSED' });
        mockBuildTransitionUpdate.mockReturnValue({
            previousState: 'AUDIT_PASSED',
            nextState: 'CAR_REVIEWING',
            nextLegacyStatus: 'CAR_REVIEWING',
            updateData: { status: 'CAR_REVIEWING', formData: {}, workflowHistory: [] },
            transitionEvent: { metadata: {} },
        });

        const res = await request(buildApp())
            .post('/apps/app-1/workflow-transitions')
            .send({ toState: 'CAR_REVIEWING', comment: 'premature pass' });

        expect(res.status).toBe(200);
        // The reversal ran inside a transaction and voided the cert with the tx handle.
        expect(mockTransaction).toHaveBeenCalledTimes(1);
        expect(mockRevokeCertificateForApplication).toHaveBeenCalledTimes(1);
        expect(mockRevokeCertificateForApplication).toHaveBeenCalledWith(
            'app-1',
            expect.objectContaining({ prisma: mockTx, revokedBy: 'auditor-1' }),
        );
        // The status write shares the same tx handle (atomic).
        expect(mockWriteApplicationStatus).toHaveBeenCalledWith(
            expect.objectContaining({ toStatus: 'CAR_REVIEWING', prisma: mockTx }),
        );
    });

    test('a non-reversal transition does NOT open a tx or void a cert', async () => {
        mockCurrentUser = { id: 'auditor-1', role: 'auditor', canonicalRole: 'auditor', organizationId: 'org-1', providerId: 'p-1' };
        seedApplication({ status: 'CAR_REVIEWING' });
        mockBuildTransitionUpdate.mockReturnValue({
            previousState: 'CAR_REVIEWING',
            nextState: 'CAR_PENDING',
            nextLegacyStatus: 'CAR_PENDING',
            updateData: { status: 'CAR_PENDING', formData: {}, workflowHistory: [] },
            transitionEvent: { metadata: {} },
        });

        await request(buildApp())
            .post('/apps/app-1/workflow-transitions')
            .send({ toState: 'CAR_PENDING', comment: 'หลักฐานการแก้ไขยังไม่พอ' });

        expect(mockRevokeCertificateForApplication).not.toHaveBeenCalled();
        // H (2026-07-11): a non-reversal write now ALSO opens a tx — for the
        // atomic audit row, NOT a cert void. "tx opened" no longer proxies
        // "cert voided"; the real no-void guard is mockRevokeCertificateForApplication above.
        expect(mockTransaction).toHaveBeenCalled();
    });

    // Order 34(4) (operator 2026-10-07): admins do not revoke; the certificate approver
    // suspends or revokes. A force off the certificate track is refused by the writer
    // (CERTIFICATION_TRACK_LOCKED, pinned on real Postgres in
    // staff-access-2-real-postgres.test.js), so this door never revokes on a force.
    test.each(['AUDIT_PASSED', 'APPROVED', 'CERTIFIED'])('force %s -> CANCELLED never revokes a certificate', async (from) => {
        mockCurrentUser = { id: 'admin-1', role: 'admin', canonicalRole: 'admin', organizationId: 'org-1', providerId: 'p-1' };
        seedApplication({ status: from });
        mockBuildTransitionUpdate.mockReturnValue({
            previousState: from,
            nextState: 'CANCELLED',
            nextLegacyStatus: 'CANCELLED',
            updateData: { status: 'CANCELLED', formData: {}, workflowHistory: [] },
            transitionEvent: { metadata: {} },
        });

        await request(buildApp())
            .post('/apps/app-1/workflow-transitions')
            .send({ toState: 'CANCELLED', force: true, reasonCode: 'LEGAL_ORDER', comment: 'holder dissolved', closureReasonCode: 'HOLDER_DISSOLVED' });

        expect(mockRevokeCertificateForApplication).not.toHaveBeenCalled();
    });

    // A1 — a compromised admin cannot resurrect a certificate through force -> APPROVED.
    test('force -> APPROVED from REJECTED mints no certificate', async () => {
        mockCurrentUser = { id: 'admin-1', role: 'admin', canonicalRole: 'admin', organizationId: 'org-1', providerId: 'p-1' };
        seedApplication({ status: 'REJECTED' });
        mockBuildTransitionUpdate.mockReturnValue({
            previousState: 'REJECTED',
            nextState: 'APPROVED',
            nextLegacyStatus: 'APPROVED',
            updateData: { status: 'APPROVED', formData: {}, workflowHistory: [] },
            transitionEvent: { metadata: {} },
        });
        const resurrect = await request(buildApp())
            .post('/apps/app-1/workflow-transitions')
            .send({ toState: 'APPROVED', force: true, reasonCode: 'ADMIN_OVERRIDE', comment: 'resurrect' });
        expect(resurrect.status).toBe(200);
        const approvedWrite = mockWriteApplicationStatus.mock.calls.find((c) => c[0].toStatus === 'APPROVED');
        expect(approvedWrite[0].autoIssueCertificate).toBe(false);
    });
});

// ── H (full-system audit 2026-07-11) ─────────────────────────────────────────
// The canonical DOCUMENT_REVIEWER + admin-force transition path previously wrote
// its ONLY AuditLog row AFTER commit, best-effort (logTransitionAudit swallows
// failure) → a transition could commit with no immutable hash-chained
// attribution on a transient fault. Fix: wire the same in-$transaction onAudit
// hook every consequential sibling uses (#646 auditor path, admin force/revert).
describe('H — reviewer/force transition writes the audit row IN the tx (onAudit hook)', () => {
    test('an inspector\'s CAR_PENDING runs in the tx and wires statusTransitionAuditHook({tx})', async () => {
        mockCurrentUser = { id: 'auditor-1', role: 'auditor', canonicalRole: 'auditor', organizationId: 'org-1', providerId: 'p-1' };
        seedApplication({ status: 'CAR_REVIEWING' });
        mockBuildTransitionUpdate.mockReturnValue({
            previousState: 'CAR_REVIEWING',
            nextState: 'CAR_PENDING',
            nextLegacyStatus: 'CAR_PENDING',
            updateData: { status: 'CAR_PENDING', formData: {}, workflowHistory: [] },
            transitionEvent: { metadata: {} },
        });

        await request(buildApp())
            .post('/apps/app-1/workflow-transitions')
            .send({ toState: 'CAR_PENDING', comment: 'หลักฐานการแก้ไขยังไม่พอ' });

        expect(mockWriteApplicationStatus).toHaveBeenCalledTimes(1);
        const args = mockWriteApplicationStatus.mock.calls[0][0];
        expect(args.toStatus).toBe('CAR_PENDING');
        // THE FIX: in-tx (was root prisma) + audit hook (was none).
        expect(args.prisma).toBe(mockTx);
        expect(args.onAudit).toBe(mockAuditHook);
        expect(mockStatusTransitionAuditHook).toHaveBeenCalledWith(
            expect.objectContaining({ tx: mockTx }),
        );
    });

    test('ADMIN force -> AUDIT_PASSED also writes the audit row in the tx (force path)', async () => {
        mockCurrentUser = { id: 'admin-1', role: 'admin', canonicalRole: 'admin', organizationId: 'org-1', providerId: 'p-1' };
        seedApplication({ status: 'APPROVED' });
        mockBuildTransitionUpdate.mockReturnValue({
            previousState: 'APPROVED',
            nextState: 'AUDIT_PASSED',
            nextLegacyStatus: 'AUDIT_PASSED',
            updateData: { status: 'AUDIT_PASSED', formData: {}, workflowHistory: [] },
            transitionEvent: { metadata: {} },
        });

        await request(buildApp())
            .post('/apps/app-1/workflow-transitions')
            .send({ toState: 'AUDIT_PASSED', force: true, reasonCode: 'ADMIN_OVERRIDE', comment: 'emergency' });

        const args = mockWriteApplicationStatus.mock.calls[0][0];
        expect(args.prisma).toBe(mockTx);
        expect(args.onAudit).toBe(mockAuditHook);
        expect(args.autoIssueCertificate).toBe(false); // SoD guard unchanged
    });
});

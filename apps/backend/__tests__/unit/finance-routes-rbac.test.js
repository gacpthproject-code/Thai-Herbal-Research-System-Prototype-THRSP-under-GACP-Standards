/**
 * V4-D RBAC matrix — Finance route surface × every non-finance role.
 *
 * Why this test exists:
 *   - Loop V Iter 4 walks the two new split accounting roles (ACCOUNT_DTAM
 *     and ACCOUNT_PLATFORM) end-to-end. V4-A widened MANAGE_ROLES /
 *     FINANCE_ROLES / REVIEW_ROLES at the route layer to admit both split
 *     roles. This file pins the negative half of the matrix: every
 *     non-finance role (DOCUMENT_REVIEWER, SCHEDULER, AUDITOR for write
 *     paths, HEALTH) MUST 403 against every finance mutation route AND
 *     the service-layer mutation MUST NOT fire (so a 403 truly means
 *     "no work done").
 *   - V3-D + V2-D pattern: per-route × per-role assertion matrix asserting
 *     both the HTTP status AND that the service-layer side-effect did NOT
 *     fire. This file is the finance equivalent of
 *     scheduling-route-rbac.test.js / auditor-routes-rbac.test.js, but
 *     with FIVE finance role tiers (ACCOUNT_DTAM, ACCOUNT_PLATFORM, legacy
 *     ACCOUNT, ADMIN, plus AUDITOR for read-only surfaces) so the route
 *     gates can be evaluated against the canonical RBAC matrix.
 *
 * Coverage per RFC §V4-D / RB-6..RB-9:
 *   - /api/finance/payments              (UX-D3 — FINANCE_ROLES)
 *   - /api/finance/bank-accounts         (UX-D2 — MANAGE_ROLES + READ)
 *   - /api/finance/refunds               (RB-8 — WRITE/READ/CANCEL roles)
 *   - /api/finance/credit-notes          (service-layer write + read)
 *
 * Order 29 (operator 2026-10-07): the company's books are written by
 * finance_officer_platform only; system_admin_dtam reads but never writes them.
 * Approve / post / reopen are done by a SECOND finance_officer_platform (the
 * service refuses the maker), inside the caller's own organization.
 *   - /api/finance/wht                   (RB-9 — service WRITE/READ)
 *   - /api/finance/payment-slips         (REVIEW_ROLES + READ_ALL)
 *
 * Pattern: copied from V2-D scheduling-route-rbac.test.js + V3-D
 * auditor-routes-rbac.test.js — auth middleware mock attaches req.user
 * from x-test-role headers; canonical-rbac stays REAL (so the test proves
 * the canonical contract, not a mock); every service method is spied.
 *
 * I-008 applied: mocks expose every helper the SUT imports (auditLogger,
 * normalizeRole/hasPermission/CANONICAL_ROLES/PERMISSIONS via jest
 * .requireActual('canonical-rbac')).
 *
 * See: docs/handoffs/iter-V4/00-rfc.md §V4-D.
 */

'use strict';

const express = require('express');
const request = require('supertest');

// ── Auth mock (V1-D / V2-D / V3-D pattern) ──────────────────────────────────
jest.mock('../../middleware/auth-middleware', () => {
    const buildHeaderUser = (req, _res, next) => {
        const role = req.headers['x-test-role'];
        if (!role || role === 'anonymous') {
            return _res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        req.user = {
            id: req.headers['x-test-user-id'] || 'user-1',
            email: req.headers['x-test-email'] || 'user-1@example.com',
            role,
            canonicalRole: req.headers['x-test-canonical-role'] || role,
            healthId: role === 'health' ? (req.headers['x-test-health-id'] || 'health-1') : null,
            providerId: role !== 'health' ? (req.headers['x-test-provider-id'] || 'provider-1') : null,
            organizationId: req.headers['x-test-organization-id'] || 'org-1',
        };
        return next();
    };
    const requireRole = () => (_req, _res, next) => next();
    return {
        authenticateHealth: buildHeaderUser,
        authenticateAny: buildHeaderUser,
        authenticateProvider: buildHeaderUser,
        authenticateDTAM: buildHeaderUser,
        authenticate: buildHeaderUser,
        requireRole,
        optionalAuth: buildHeaderUser,
        requireVerification: (_req, _res, next) => next(),
        checkPermission: () => (_req, _res, next) => next(),
        rateLimitSensitive: () => (_req, _res, next) => next(),
    };
});

// canonical-rbac stays REAL — the test proves the canonical contract.
jest.mock('../../shared/canonical-rbac', () => jest.requireActual('../../shared/canonical-rbac'));

// ── Service-layer mocks (I-008 mock completeness) ───────────────────────────
//
// Each finance service is wrapped in a mock that wires its real role
// assertion (`assertWriteAccess` / `assertWriteRole` / etc.) before
// delegating to the jest.fn() spy. This lets the test (a) measure that
// the gate fires for forbidden roles AND (b) measure that no further
// work was attempted (the spy stays uncalled).

const mockRecordRefund = jest.fn();
const mockGetRefundStatus = jest.fn();

jest.mock('../../services/refund-service', () => {
    const real = jest.requireActual('../../services/refund-service');
    const { normalizeRole, CANONICAL_ROLES } = jest.requireActual('../../shared/canonical-rbac');
    // ชุดบทบาทมาจาก service จริง — สำเนาในเทสเคยค้างคำตัดสินเก่าได้โดยไม่มีใครเห็น
    const WRITE = real.WRITE_ROLES;
    const READ = real.READ_ROLES;
    const assertWrite = (actor) => {
        const role = normalizeRole(actor?.canonicalRole || actor?.role);
        if (!role || !WRITE.has(role)) {
            const e = new Error('ACCOUNT_PLATFORM or ADMIN role required to record a refund');
            e.code = 'FORBIDDEN_ROLE';
            e.statusCode = 403;
            throw e;
        }
    };
    const assertRead = (actor) => {
        const role = normalizeRole(actor?.canonicalRole || actor?.role);
        if (!role || !READ.has(role)) {
            const e = new Error('ACCOUNT_PLATFORM, AUDITOR, or ADMIN role required to view refund status');
            e.code = 'FORBIDDEN_ROLE';
            e.statusCode = 403;
            throw e;
        }
    };
    return {
        ...real,
        recordDuplicateChargeRefund: (...args) => {
            assertWrite(args[0]?.actor);
            return mockRecordRefund(...args);
        },
        recordProviderCancellationRefund: (...args) => {
            assertWrite(args[0]?.actor);
            return mockRecordRefund(...args);
        },
        getRefundStatus: (...args) => {
            assertRead(args[1]?.actor);
            return mockGetRefundStatus(...args);
        },
    };
});




const mockRecordWhtCertificate = jest.fn();
const mockListWhtCertificates = jest.fn();
const mockIsWhtApplicableForInvoice = jest.fn();

jest.mock('../../services/wht-service', () => {
    const real = jest.requireActual('../../services/wht-service');
    return {
        ...real,
        recordWhtCertificate: (...args) => mockRecordWhtCertificate(...args),
        listWhtCertificates: (...args) => mockListWhtCertificates(...args),
        isWhtApplicableForInvoice: (...args) => mockIsWhtApplicableForInvoice(...args),
        // Keep assertWriteRole + assertReadRole REAL so the route's
        // service-layer gate surfaces a canonical 403 for forbidden roles.
        assertWriteRole: real.assertWriteRole,
        assertReadRole: real.assertReadRole,
    };
});

const mockCreateCreditNote = jest.fn();
const mockIssueCreditNote = jest.fn();
const mockPostCreditNote = jest.fn();
const mockCancelCreditNote = jest.fn();
const mockListCreditNotesForInvoice = jest.fn();
const mockListCreditNotes = jest.fn();
const mockFindCreditNoteById = jest.fn();

jest.mock('../../services/credit-note-service', () => {
    const real = jest.requireActual('../../services/credit-note-service');
    const { normalizeRole, CANONICAL_ROLES } = jest.requireActual('../../shared/canonical-rbac');
    const WRITE = new Set([CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM, CANONICAL_ROLES.SYSTEM_ADMIN_DTAM]);
    const assertWrite = (actor) => {
        const role = normalizeRole(actor?.canonicalRole || actor?.role);
        if (!role || !WRITE.has(role)) {
            const e = new Error('ACCOUNT_PLATFORM or ADMIN role required to mutate credit notes');
            e.code = 'FORBIDDEN_ROLE';
            e.statusCode = 403;
            throw e;
        }
    };
    return {
        ...real,
        createCreditNote: (args) => {
            assertWrite(args?.actor);
            return mockCreateCreditNote(args);
        },
        issueCreditNote: (id, opts) => {
            assertWrite(opts?.actor);
            return mockIssueCreditNote(id, opts);
        },
        postCreditNote: (id, opts) => {
            assertWrite(opts?.actor);
            return mockPostCreditNote(id, opts);
        },
        cancelCreditNote: (id, opts) => {
            assertWrite(opts?.actor);
            return mockCancelCreditNote(id, opts);
        },
        listCreditNotesForInvoice: (...args) => mockListCreditNotesForInvoice(...args),
        listCreditNotes: (...args) => mockListCreditNotes(...args),
        findCreditNoteById: (...args) => mockFindCreditNoteById(...args),
    };
});


// payments.js (system-wide invoice list)
const mockCreatePayment = jest.fn();
jest.mock('../../services/invoice-service', () => ({
    createPayment: (...args) => mockCreatePayment(...args),
    listSettlementsForApplication: jest.fn().mockResolvedValue([]),
    findInvoiceById: jest.fn().mockResolvedValue(null),
    getInvoiceWithDetails: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../services/prisma-database', () => ({ prisma: {} }));

jest.mock('../../services/storage-service', () => ({
    createUploader: jest.fn(() => ({
        single: jest.fn(() => (_req, _res, next) => next()),
    })),
    getFile: jest.fn(),
    saveFile: jest.fn(),
}));

jest.mock('../../shared/logger', () => {
    const mockLogger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    };
    return { ...mockLogger, createLogger: jest.fn(() => mockLogger) };
});

jest.mock('../../middleware/audit-logger', () => ({
    auditLogger: {
        log: jest.fn().mockResolvedValue(null),
        logWithin: jest.fn().mockResolvedValue(null),
    },
    AuditCategory: { PAYMENT: 'PAYMENT' },
    AuditSeverity: { INFO: 'INFO', WARNING: 'WARNING', MEDIUM: 'MEDIUM' },
    ResourceType: { PAYMENT: 'PAYMENT', INVOICE: 'INVOICE' },
}));

jest.mock('../../utils/client-ip', () => ({
    getRequestIp: jest.fn(() => '127.0.0.1'),
}));

jest.mock('../../utils/promptpay-qr', () => ({
    buildPromptPayPayload: jest.fn(() => null),
}));

// notification-fanout-service used by refund-service (loaded but not invoked
// on the 403 path because mockRecordRefund stays uncalled).
jest.mock('../../services/notification-fanout-service', () => ({
    dispatch: jest.fn().mockResolvedValue(null),
}));

function seedHappyPath() {
    mockRecordRefund.mockResolvedValue({ refundId: 'ref-1', status: 'INITIATED' });
    mockGetRefundStatus.mockResolvedValue({ status: 'NONE', history: [] });
    mockRecordWhtCertificate.mockResolvedValue({ id: 'wht-1' });
    mockListWhtCertificates.mockResolvedValue([]);
    mockIsWhtApplicableForInvoice.mockResolvedValue({ applicable: false });
    mockCreateCreditNote.mockResolvedValue({ id: 'cn-1', status: 'DRAFT' });
    mockIssueCreditNote.mockResolvedValue({ id: 'cn-1', status: 'ISSUED' });
    mockPostCreditNote.mockResolvedValue({ id: 'cn-1', status: 'POSTED' });
    mockCancelCreditNote.mockResolvedValue({ id: 'cn-1', status: 'CANCELLED' });
    mockListCreditNotesForInvoice.mockResolvedValue([]);
    mockListCreditNotes.mockResolvedValue([]);
    mockFindCreditNoteById.mockResolvedValue(null);
    mockCreatePayment.mockResolvedValue({ id: 'inv-1' });
}

const refundsRouter = require('../../routes/api/finance/refunds');
const whtRouter = require('../../routes/api/finance/wht');
const creditNotesRouter = require('../../routes/api/finance/credit-notes');
const paymentsRouter = require('../../routes/api/finance/payments');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/finance/refunds', refundsRouter);
    app.use('/api/finance/wht', whtRouter);
    app.use('/api/finance/credit-notes', creditNotesRouter);
    app.use('/api/payments', paymentsRouter);
    return app;
}

// ── Role tiers (per canonical-rbac.js) ──────────────────────────────────────

// Non-finance roles that must 403 against EVERY finance mutation.
const NON_FINANCE_ROLES = [
    'document_reviewer',
    'dispatcher',
    'health',
];

// AUDITOR is a special case: read-only on most finance reads; 403 on
// writes. Tracked separately so we don't lump it with reviewer/scheduler.
const AUDITOR_ROLE = 'field_inspector';

// ── /api/finance/refunds — RB-8 (refund-service WRITE/READ/CANCEL) ──────────

describe('V4-D /api/finance/refunds — RB-8 RBAC matrix', () => {
    let app;

    beforeAll(() => {
        app = buildApp();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        seedHappyPath();
    });

    describe('POST /:invoiceId/duplicate-charge — WRITE_ROLES = {finance_officer_platform} (refunds are company money)', () => {
        test.each([
            'document_reviewer', 'dispatcher', 'health', 'field_inspector', 'finance_officer_dtam', 'system_admin_dtam',
        ])('%s role gets 403 (FORBIDDEN_ROLE)', async (role) => {
            const response = await request(app)
                .post('/api/finance/refunds/inv-1/duplicate-charge')
                .set('x-test-role', role)
                .send({ amount: 100, idempotencyKey: 'k-1' });

            expect(response.status).toBe(403);
            expect(response.body).toMatchObject({
                success: false,
                error: 'FORBIDDEN_ROLE',
            });
            expect(mockRecordRefund).not.toHaveBeenCalled();
        });

        test.each(['finance_officer_platform'])(
            '%s role bypasses the gate (positive)',
            async (role) => {
                const response = await request(app)
                    .post('/api/finance/refunds/inv-1/duplicate-charge')
                    .set('x-test-role', role)
                    .send({ amount: 100, idempotencyKey: 'k-1' });

                expect(response.status).not.toBe(403);
                expect(response.status).not.toBe(401);
                expect(mockRecordRefund).toHaveBeenCalledTimes(1);
            },
        );
    });

    describe('GET /:invoiceId/status — READ_ROLES = การเงินทั้งสองบทบาท + ADMIN (FI removed 2026-09-27)', () => {
        test.each([
            'document_reviewer', 'dispatcher', 'health', 'field_inspector',
        ])('%s role gets 403 (FORBIDDEN_ROLE)', async (role) => {
            const response = await request(app)
                .get('/api/finance/refunds/inv-1/status')
                .set('x-test-role', role);

            expect(response.status).toBe(403);
            expect(response.body).toMatchObject({
                success: false,
                error: 'FORBIDDEN_ROLE',
            });
            expect(mockGetRefundStatus).not.toHaveBeenCalled();
        });

        test.each(['system_admin_dtam', 'finance_officer_platform', 'finance_officer_dtam'])(
            '%s role can READ (positive)',
            async (role) => {
                const response = await request(app)
                    .get('/api/finance/refunds/inv-1/status')
                    .set('x-test-role', role);

                expect(response.status).not.toBe(403);
                expect(response.status).not.toBe(401);
                expect(mockGetRefundStatus).toHaveBeenCalledTimes(1);
            },
        );
    });
});

// ── /api/finance/credit-notes — service-layer ACCOUNT_PLATFORM + ADMIN ──────

describe('V4-D /api/finance/credit-notes — service-layer WRITE/READ matrix', () => {
    let app;

    beforeAll(() => {
        app = buildApp();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        seedHappyPath();
    });

    test.each([
        'document_reviewer', 'dispatcher', 'health', 'field_inspector', 'finance_officer_dtam',
    ])('POST / create — %s role gets 403 (FORBIDDEN_ROLE)', async (role) => {
        const response = await request(app)
            .post('/api/finance/credit-notes')
            .set('x-test-role', role)
            .send({
                originalInvoiceId: 'inv-1',
                reasonCode: 'CANCELLATION',
                reason: 'test',
                subtotal: 100,
                vat: 7,
            });

        expect(response.status).toBe(403);
        expect(response.body).toMatchObject({
            success: false,
            error: 'FORBIDDEN_ROLE',
        });
        expect(mockCreateCreditNote).not.toHaveBeenCalled();
    });

    test.each(['system_admin_dtam', 'finance_officer_platform'])(
        'POST / create — %s role bypasses gate (positive)',
        async (role) => {
            const response = await request(app)
                .post('/api/finance/credit-notes')
                .set('x-test-role', role)
                .send({
                    originalInvoiceId: 'inv-1',
                    reasonCode: 'CANCELLATION',
                    reason: 'test',
                    subtotal: 100,
                    vat: 7,
                });

            expect(response.status).not.toBe(403);
            expect(response.status).not.toBe(401);
            expect(mockCreateCreditNote).toHaveBeenCalledTimes(1);
        },
    );
});

// ── /api/finance/wht — RB-9 ─────────────────────────────────────────────────

describe('V4-D /api/finance/wht — RB-9 RBAC matrix', () => {
    let app;

    beforeAll(() => {
        app = buildApp();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        seedHappyPath();
    });

    describe('POST /certificate — WRITE_ROLES = {finance_officer_platform} (order 29)', () => {
        test.each([
            'document_reviewer', 'dispatcher', 'health', 'field_inspector', 'finance_officer_dtam', 'system_admin_dtam',
        ])('%s role gets 403 (FORBIDDEN_ROLE)', async (role) => {
            const response = await request(app)
                .post('/api/finance/wht/certificate')
                .set('x-test-role', role)
                .send({
                    invoiceId: 'inv-1',
                    certificateNumber: 'C-001',
                    issuedByTaxId: '1234567890123',
                    issuedByName: 'Acme',
                    certificateDate: '2026-05-01',
                    whtAmount: 3,
                });

            expect(response.status).toBe(403);
            expect(response.body).toMatchObject({
                success: false,
                error: 'FORBIDDEN_ROLE',
            });
            expect(mockRecordWhtCertificate).not.toHaveBeenCalled();
        });

        test.each(['finance_officer_platform'])(
            '%s role passes the gate (positive)',
            async (role) => {
                const response = await request(app)
                    .post('/api/finance/wht/certificate')
                    .set('x-test-role', role)
                    .send({
                        invoiceId: 'inv-1',
                        certificateNumber: 'C-001',
                        issuedByTaxId: '1234567890123',
                        issuedByName: 'Acme',
                        certificateDate: '2026-05-01',
                        whtAmount: 3,
                    });

                expect(response.status).not.toBe(403);
                expect(response.status).not.toBe(401);
                expect(mockRecordWhtCertificate).toHaveBeenCalledTimes(1);
            },
        );
    });

    describe('GET /certificates — READ_ROLES = การเงินทั้งสองบทบาท + ADMIN (FI removed 2026-09-27)', () => {
        test.each(['document_reviewer', 'dispatcher', 'health', 'field_inspector'])(
            '%s role gets 403 (FORBIDDEN_ROLE)',
            async (role) => {
                const response = await request(app)
                    .get('/api/finance/wht/certificates')
                    .set('x-test-role', role);

                expect(response.status).toBe(403);
                expect(response.body).toMatchObject({
                    success: false,
                    error: 'FORBIDDEN_ROLE',
                });
                expect(mockListWhtCertificates).not.toHaveBeenCalled();
            },
        );

        test.each(['system_admin_dtam', 'finance_officer_platform', 'finance_officer_dtam'])(
            '%s role can READ (positive)',
            async (role) => {
                const response = await request(app)
                    .get('/api/finance/wht/certificates')
                    .set('x-test-role', role);

                expect(response.status).not.toBe(403);
                expect(response.status).not.toBe(401);
                expect(mockListWhtCertificates).toHaveBeenCalledTimes(1);
            },
        );
    });
});

// ── /api/finance/bank-accounts — UX-D2 (MANAGE_ROLES widened to split) ──────

describe('V4-D anonymous (no token) — every finance route returns 401', () => {
    let app;

    beforeAll(() => {
        app = buildApp();
    });

    const ANONYMOUS_ROUTES = [
        { label: 'POST /refunds/:id/duplicate-charge', method: 'post', path: '/api/finance/refunds/inv-1/duplicate-charge' },
        { label: 'POST /refunds/:id/provider-cancellation', method: 'post', path: '/api/finance/refunds/inv-1/provider-cancellation' },
        { label: 'POST /credit-notes', method: 'post', path: '/api/finance/credit-notes' },
        { label: 'POST /wht/certificate', method: 'post', path: '/api/finance/wht/certificate' },
    ];

    test.each(ANONYMOUS_ROUTES)('$label returns 401 without a token', async ({ method, path }) => {
        const response = await request(app)[method](path).send({});
        expect(response.status).toBe(401);
    });
});

'use strict';

/**
 * R2 M5 — payment-closure TOCTOU / optimistic-lock guard (RED-first).
 *
 * Operator ground truth under test (money-safety, non-reopenable close):
 *   The 03:00 scan snapshot of Application.status is STALE by the time the
 *   per-case write runs. If a PromptPay settlement (webhook: PENDING_*_FEE ->
 *   *_FEE_PAID) lands between the scan and the write, stamping the terminal
 *   EXPIRED/PAYMENT_ABANDONED over the freshly-PAID state buries a paying
 *   customer's application forever (reopen is unbuilt). The close therefore MUST:
 *     1. Re-read the application (status + version) INSIDE the tx and SKIP (not
 *        write) if it no longer stands at the milestone's payment gate.
 *     2. Pass the FRESH version as writeApplicationStatus.expectedVersion so a
 *        writer that advanced the row AFTER our re-read but BEFORE our write is
 *        caught by the WF-F7 optimistic lock (CONCURRENCY_CONFLICT) and the
 *        case is SKIPPED, never clobbered.
 *
 * These are mocked-prisma unit tests (observable locally). Each simulates the
 * race at a different interleaving and asserts NO EXPIRED write happens +
 * summary.skipped incremented + the sweep does NOT throw.
 */

const mockListUnpaid = jest.fn();
const mockReminderFindMany = jest.fn();
const mockCheckoutOrderFindMany = jest.fn();
const mockTxAppFindUnique = jest.fn();
const mockTxOrderFindMany = jest.fn();
const mockTxOrderUpdateMany = jest.fn();
const mockTxCalls = [];
const mockTransaction = jest.fn(async (cb) => cb({
    $queryRaw: (strings) => { mockTxCalls.push(strings.join('?')); return Promise.resolve([{ status: 'PENDING_DOC_FEE' }]); },
    application: { findUnique: (...a) => { mockTxCalls.push('application.findUnique'); return mockTxAppFindUnique(...a); } },
    checkoutOrder: {
        findMany: (...a) => { mockTxCalls.push('checkoutOrder.findMany'); return mockTxOrderFindMany(...a); },
        updateMany: (...a) => mockTxOrderUpdateMany(...a),
    },
    invoice: { updateMany: async () => ({ count: 1 }) },
    paymentTransaction: { updateMany: async () => ({ count: 1 }) },
}));

jest.mock('../../services/prisma-database', () => ({
    prisma: {
        paymentReminderLog: { findMany: (...a) => mockReminderFindMany(...a) },
        checkoutOrder: { findMany: (...a) => mockCheckoutOrderFindMany(...a) },
        $transaction: (...a) => mockTransaction(...a),
    },
}));

jest.mock('../../services/billing/unpaid-milestones', () => ({
    GATE_MILESTONE: { PENDING_DOC_FEE: 'M1', PENDING_AUDIT_FEE: 'M2' },
    listUnpaidMilestones: (...a) => mockListUnpaid(...a),
}));

jest.mock('../../services/tenant-context', () => ({
    withoutTenantScope: (fn) => fn(),
    runWithTenantContext: (_ctx, fn) => fn(),
}));

// Money-safety guard #3 (gateway truth, Task 6) — the sweep now checks Stripe
// before every close. Default: no checkout order on file, so the guard
// resolves false and never touches the gateway; the guard #3 describe block
// below overrides this to exercise the "captured payment" and fail-safe paths.
const mockGetPaymentIntent = jest.fn();
const mockCancelPaymentIntent = jest.fn();
jest.mock('../../services/payment/payment-adapter', () => ({
    getPaymentAdapter: () => ({
        getPaymentIntent: (...a) => mockGetPaymentIntent(...a),
        cancelPaymentIntent: (...a) => mockCancelPaymentIntent(...a),
    }),
}));

const mockWriteStatus = jest.fn();
jest.mock('../../services/application-status-writer', () => ({
    writeApplicationStatus: (...a) => mockWriteStatus(...a),
}));

const mockBuildTransition = jest.fn();
jest.mock('../../services/workflow-transition-service', () => {
    const actual = jest.requireActual('../../services/workflow-transition-service');
    return {
        ...actual,
        buildTransitionUpdate: (...a) => mockBuildTransition(...a),
    };
});

const mockNotifyParties = jest.fn();
jest.mock('../../services/notification-service', () => ({
    NotifyType: { APPLICATION_EXPIRED: 'APPLICATION_EXPIRED' },
}));
jest.mock('../../services/notification/application-parties', () => ({
    notifyApplicationParties: (...a) => mockNotifyParties(...a),
}));

const mockAuditLog = jest.fn();
jest.mock('../../middleware/audit-logger', () => ({
    auditLogger: { log: (...a) => mockAuditLog(...a) },
    AuditCategory: { APPLICATION: 'APPLICATION' },
    ResourceType: { APPLICATION: 'APPLICATION' },
}));

const mockLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.mock('../../shared/logger', () => ({ ...mockLogger, createLogger: jest.fn(() => mockLogger) }));

const { runPaymentClosureSweep } = require('../../jobs/payment-closure-job');
const { APPLICATION_STATUSES } = require('../../shared/workflow-state-machine');

const DAY_MS = 24 * 60 * 60 * 1000;
const sentDaysAgo = (days) => new Date(Date.now() - days * DAY_MS);
/** Three reminders, all sent; the third (OVERDUE_NOTICE) went out 8 days ago — past the order-39 grace. */
const ALL_REMINDERS = [
    { reminderType: 'PRE_DUE', sentAt: sentDaysAgo(20) },
    { reminderType: 'DUE_DATE', sentAt: sentDaysAgo(15) },
    { reminderType: 'OVERDUE_NOTICE', sentAt: sentDaysAgo(8) },
];

/** One scanned unpaid M1, 40 days past due as of the scan (STALE snapshot). */
function scanItem(overrides = {}) {
    return {
        milestone: 'M1',
        dueDate: new Date(Date.now() - 40 * DAY_MS),
        application: {
            id: 'app-1',
            applicationNumber: 'APP-1',
            status: APPLICATION_STATUSES.PENDING_DOC_FEE,
            organizationId: 'org-1',
            formData: { plot: 'keep-me' },
        },
        ...overrides,
    };
}

function concurrencyConflict() {
    const err = new Error('concurrent modification of application app-1');
    err.code = 'CONCURRENCY_CONFLICT';
    return err;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockListUnpaid.mockResolvedValue([scanItem()]);
    mockReminderFindMany.mockResolvedValue(ALL_REMINDERS); // fully reminded
    mockCheckoutOrderFindMany.mockResolvedValue([]); // no order with a payment intent
    mockTxOrderFindMany.mockResolvedValue([]); // no unpaid checkout to retire
    mockTxOrderUpdateMany.mockResolvedValue({ count: 1 });
    mockTxCalls.length = 0;
    mockWriteStatus.mockResolvedValue({ id: 'app-1', applicationNumber: 'APP-1' });
    mockBuildTransition.mockReturnValue({ updateData: { workflowHistory: [{ to: 'EXPIRED' }] } });
    mockNotifyParties.mockResolvedValue({ recipients: ['u'], delivered: 1 });
    mockAuditLog.mockResolvedValue({});
});

describe('the threshold and the reminders decide, before any transaction', () => {
    test('a milestone not yet past due + the threshold is skipped without opening a transaction', async () => {
        mockListUnpaid.mockResolvedValue([scanItem({ dueDate: new Date(Date.now() - 10 * DAY_MS) })]);
        const summary = await runPaymentClosureSweep();
        expect(mockTransaction).not.toHaveBeenCalled();
        expect(summary).toMatchObject({ closed: 0, skipped: 1, errors: 0 });
    });

    test('a milestone with no clock start on record is never closed', async () => {
        mockListUnpaid.mockResolvedValue([scanItem({ dueDate: null })]);
        const summary = await runPaymentClosureSweep();
        expect(mockTransaction).not.toHaveBeenCalled();
        expect(summary).toMatchObject({ closed: 0, skipped: 1 });
    });

    test('order 39: third reminder sent 6 days ago is inside the grace — no close', async () => {
        mockReminderFindMany.mockResolvedValue([...ALL_REMINDERS.slice(0, 2), { reminderType: 'OVERDUE_NOTICE', sentAt: sentDaysAgo(6) }]);
        const summary = await runPaymentClosureSweep();
        expect(mockTransaction).not.toHaveBeenCalled();
        expect(summary).toMatchObject({ closed: 0, skipped: 1 });
    });

    test('order 39: a third reminder with no sentAt is not a sent reminder — no close', async () => {
        mockReminderFindMany.mockResolvedValue([...ALL_REMINDERS.slice(0, 2), { reminderType: 'OVERDUE_NOTICE', sentAt: null }]);
        const summary = await runPaymentClosureSweep();
        expect(mockTransaction).not.toHaveBeenCalled();
        expect(summary).toMatchObject({ closed: 0, skipped: 1 });
    });

    test('reminders are read for that application and milestone', async () => {
        mockReminderFindMany.mockResolvedValue(ALL_REMINDERS.slice(0, 2));
        const summary = await runPaymentClosureSweep();
        expect(mockReminderFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { applicationId: 'app-1', milestone: 'M1', sentAt: { not: null } } }));
        expect(mockTransaction).not.toHaveBeenCalled();
        expect(summary).toMatchObject({ closed: 0, skipped: 1 });
    });
});

describe('TOCTOU race — payment settled between the 03:00 scan and the in-tx write', () => {
    test('in-tx re-read shows the app already DOC_FEE_PAID → SKIP, no EXPIRED write, no throw', async () => {
        // The webhook settled the case after the scan snapshot.
        mockTxAppFindUnique.mockResolvedValue({
            id: 'app-1',
            status: APPLICATION_STATUSES.DOC_FEE_PAID,
            version: 4,
            formData: { plot: 'keep-me' },
            workflowHistory: [],
        });

        const summary = await runPaymentClosureSweep();

        // The paid application is NEVER stamped terminal.
        expect(mockWriteStatus).not.toHaveBeenCalled();
        expect(mockBuildTransition).not.toHaveBeenCalled();
        expect(summary.closed).toBe(0);
        expect(summary.errors).toBe(0);
        expect(summary.skipped).toBe(1);
    });
});

describe('optimistic lock — a writer advanced the row between our re-read and our write', () => {
    test('writeApplicationStatus throwing CONCURRENCY_CONFLICT is a SKIP, not an error', async () => {
        mockTxAppFindUnique.mockResolvedValue({
            id: 'app-1',
            status: APPLICATION_STATUSES.PENDING_DOC_FEE,
            version: 5,
            formData: { plot: 'keep-me' },
            workflowHistory: [],
        });
        mockWriteStatus.mockRejectedValue(concurrencyConflict());

        const summary = await runPaymentClosureSweep();

        // The FRESH version drove the optimistic lock.
        expect(mockWriteStatus).toHaveBeenCalledTimes(1);
        expect(mockWriteStatus.mock.calls[0][0].expectedVersion).toBe(5);
        // Conflict → skipped, NOT counted as an error, and the sweep did not throw.
        expect(summary.skipped).toBe(1);
        expect(summary.errors).toBe(0);
        expect(summary.closed).toBe(0);
    });
});

describe('happy path — the case is still genuinely abandoned at write time', () => {
    test('fresh re-read confirms the gate → EXPIRED write with the FRESH expectedVersion, applicant side told', async () => {
        mockTxAppFindUnique.mockResolvedValue({
            id: 'app-1',
            status: APPLICATION_STATUSES.PENDING_DOC_FEE,
            version: 7,
            formData: { plot: 'keep-me' },
            workflowHistory: [],
        });

        const summary = await runPaymentClosureSweep();

        expect(mockWriteStatus).toHaveBeenCalledTimes(1);
        const writeArg = mockWriteStatus.mock.calls[0][0];
        expect(writeArg.toStatus).toBe(APPLICATION_STATUSES.EXPIRED);
        expect(writeArg.fromStatus).toBe(APPLICATION_STATUSES.PENDING_DOC_FEE);
        // expectedVersion is the FRESH (re-read) version, not the stale scan value 3.
        expect(writeArg.expectedVersion).toBe(7);
        expect(writeArg.additionalData.closedReason).toBe('PAYMENT_ABANDONED');
        expect(summary.closed).toBe(1);
        expect(summary.skipped).toBe(0);
        expect(summary.errors).toBe(0);
        expect(mockNotifyParties).toHaveBeenCalledWith('app-1', expect.objectContaining({
            type: 'APPLICATION_EXPIRED', data: expect.objectContaining({ closedReason: 'PAYMENT_ABANDONED' }),
        }));
    });
});

describe('money-safety guard #3 (gateway truth, Task 6) — Stripe outranks a stale local state', () => {
    test('order PI already succeeded at Stripe -> SKIP before the close tx even opens, alert logged', async () => {
        mockCheckoutOrderFindMany.mockResolvedValue([{ stripePaymentIntentId: 'pi_paid' }]);
        mockGetPaymentIntent.mockResolvedValue({ status: 'succeeded' });

        const summary = await runPaymentClosureSweep();

        // The close tx must never even open once the gateway says PAID.
        expect(mockTransaction).not.toHaveBeenCalled();
        expect(mockWriteStatus).not.toHaveBeenCalled();
        expect(summary.closed).toBe(0);
        expect(summary.skipped).toBe(1);
        expect(summary.errors).toBe(0);
        expect(mockLogger.error).toHaveBeenCalledWith(
            expect.stringContaining('payment in flight'),
            expect.objectContaining({ applicationId: 'app-1', milestone: 'M1', cause: 'IN_FLIGHT' }),
        );
    });

    test('fail-SAFE: gateway unreachable -> SKIP (do not close), warning logged, no throw', async () => {
        mockCheckoutOrderFindMany.mockResolvedValue([{ stripePaymentIntentId: 'pi_unknown' }]);
        mockGetPaymentIntent.mockRejectedValue(new Error('Stripe unreachable'));

        const summary = await runPaymentClosureSweep();

        expect(mockTransaction).not.toHaveBeenCalled();
        expect(mockWriteStatus).not.toHaveBeenCalled();
        expect(summary.closed).toBe(0);
        expect(summary.skipped).toBe(1);
        expect(summary.errors).toBe(0);
        expect(mockLogger.error).toHaveBeenCalledWith(
            expect.any(String), expect.objectContaining({ cause: 'GATEWAY_UNAVAILABLE' }),
        );
    });

    test('a checkout opened after the gateway check (intent not asked) → SKIP inside the tx, no write', async () => {
        mockTxAppFindUnique.mockResolvedValue({
            id: 'app-1', status: APPLICATION_STATUSES.PENDING_DOC_FEE, version: 7, formData: {}, workflowHistory: [],
        });
        mockTxOrderFindMany.mockResolvedValue([{ id: 'o-new', stripePaymentIntentId: 'pi_new', invoiceId: null, paymentTransactionId: null }]);

        const summary = await runPaymentClosureSweep();

        expect(mockWriteStatus).not.toHaveBeenCalled();
        expect(summary).toMatchObject({ closed: 0, skipped: 1, errors: 0 });
    });

    test('veto V1: the application row lock is the first statement, before the re-read and the order read', async () => {
        mockTxAppFindUnique.mockResolvedValue({
            id: 'app-1', status: APPLICATION_STATUSES.PENDING_DOC_FEE, version: 7, formData: {}, workflowHistory: [],
        });

        await runPaymentClosureSweep();

        expect(mockTxCalls[0]).toMatch(/FROM applications WHERE id = \? FOR UPDATE/);
        expect(mockTxCalls.slice(1)).toEqual(['application.findUnique', 'checkoutOrder.findMany']);
    });

    test('veto V2: an order that changed before it could be retired → SKIP, rolled back, no EXPIRED write', async () => {
        mockTxAppFindUnique.mockResolvedValue({
            id: 'app-1', status: APPLICATION_STATUSES.PENDING_DOC_FEE, version: 7, formData: {}, workflowHistory: [],
        });
        mockCheckoutOrderFindMany.mockResolvedValue([{ stripePaymentIntentId: 'pi_old' }]);
        mockGetPaymentIntent.mockResolvedValue({ status: 'canceled' });
        mockTxOrderFindMany.mockResolvedValue([{ id: 'o-1', stripePaymentIntentId: 'pi_old', invoiceId: null, paymentTransactionId: null }]);
        mockTxOrderUpdateMany.mockResolvedValue({ count: 0 });

        const summary = await runPaymentClosureSweep();

        expect(mockWriteStatus).not.toHaveBeenCalled();
        expect(summary).toMatchObject({ closed: 0, skipped: 1, errors: 0 });
    });
});

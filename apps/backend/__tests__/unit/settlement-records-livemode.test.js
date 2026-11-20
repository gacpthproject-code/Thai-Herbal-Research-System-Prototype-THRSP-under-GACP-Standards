'use strict';
/**
 * Order 105(3), round 2 finding 1: the trial mark of a receipt was decided at print time
 * from the key of the day, so a receipt settled in test mode and reprinted after the live
 * switch came out unmarked. The settlement now records Stripe's own `livemode` of the
 * PaymentIntent on the invoice (metadata.livemode), in the same transaction as the receipt
 * number, and the settled notice reads that record rather than the key.
 */
process.env.STRIPE_SECRET_KEY = 'sk_test_' + 'x'.repeat(24);
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_' + 'x'.repeat(24);
jest.mock('../../shared/logger', () => {
    const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { ...l, createLogger: () => l };
});
jest.mock('../../services/quotation-service', () => ({
    recordPhaseInvoiced: jest.fn(async () => ({ quotationId: 'qt-1', phase: 'PHASE_1', closed: true, status: 'ACCEPTED' })),
}));
jest.mock('../../middleware/audit-logger', () => ({
    auditLogger: { log: jest.fn(async () => ({})) },
    AuditCategory: { PAYMENT: 'PAYMENT' },
    AuditSeverity: { INFO: 'INFO', WARNING: 'WARNING', ERROR: 'ERROR', CRITICAL: 'CRITICAL' },
    ResourceType: { APPLICATION: 'APPLICATION', PAYMENT: 'PAYMENT' },
}));
const mockNotifyPaymentSuccess = jest.fn(async () => ({}));
jest.mock('../../services/notification/domain-helpers', () => ({
    notifyPaymentSuccess: (...a) => mockNotifyPaymentSuccess(...a),
}));
jest.mock('../../services/tenant-context', () => ({ withoutTenantScope: (fn) => fn() }));

/** The two row locks the settle takes: the order, then the application (still awaiting its M1 fee). */
const lockedRows = async (sql) => (sql.join('').includes('FROM applications')
    ? [{ status: 'PENDING_DOC_FEE' }]
    : [{ id: 'ord_1', status: 'PENDING_PAYMENT' }]);
const tx = {
    $queryRaw: jest.fn(lockedRows),
    $executeRaw: jest.fn(async () => 0),
    checkoutOrder: { update: jest.fn() }, invoice: { update: jest.fn(), findUnique: jest.fn() },
    paymentTransaction: { update: jest.fn() }, checkoutDocument: { create: jest.fn() },
    notification: { count: jest.fn(async () => 0) },
};
const mockDb = {
    checkoutOrder: { findFirst: jest.fn() },
    stripeWebhookEvent: { findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(async (cb) => cb(tx)),
};
jest.mock('../../services/prisma-database', () => ({ prisma: mockDb }));
jest.mock('../../services/journal-entry-service', () => ({ recordPaymentEntry: jest.fn() }));
jest.mock('../../services/application-status-writer', () => ({ writeApplicationStatus: jest.fn(), unpaidMilestonesBefore: async () => [] }));
jest.mock('../../services/receipt-numbering-service', () => ({
    allocateReceiptNumber: jest.fn(async () => ({ number: 'TAX-PRD-2026-000009' })),
    ISSUER: { PLATFORM: 'PLATFORM', DTAM: 'DTAM' },
}));

const svc = require('../../services/checkout/checkout-settlement-service');
const { PAYMENT_MODES } = require('../../shared/payment-mode');

const order = (over = {}) => ({
    id: 'ord_1', status: 'PENDING_PAYMENT', milestone: 'M1',
    totalPayableAmount: 5885, platformFeeNet: 5500, platformFeeVat: 385, platformFeeGross: 5885,
    invoiceId: 'inv_1', applicationId: 'app_1', organizationId: 'org_1', quotationId: 'qt-1',
    invoice: { id: 'inv_1', invoiceNumber: 'INV-CO-1', metadata: { checkoutOrderId: 'ord_1' } },
    application: { id: 'app_1', status: 'PENDING_DOC_FEE' },
    ...over,
});
const intent = (over = {}) => ({ id: 'pi_1', amount_received: 588500, metadata: { checkoutOrderId: 'ord_1' }, ...over });

beforeEach(() => {
    jest.clearAllMocks();
    mockDb.$transaction.mockImplementation(async (cb) => cb(tx));
    mockDb.checkoutOrder.findFirst.mockResolvedValue(order());
    tx.$queryRaw.mockImplementation(lockedRows);
    // With no other writer, the invoice row holds what the settle read before its transaction.
    tx.invoice.findUnique.mockImplementation(async () => ({
        metadata: (await mockDb.checkoutOrder.findFirst.mock.results[0].value).invoice.metadata,
    }));
});

function invoiceWrite() {
    expect(tx.invoice.update).toHaveBeenCalledTimes(1);
    return tx.invoice.update.mock.calls[0][0].data;
}

test('a test-mode intent records livemode false on the invoice, beside what the metadata already held', async () => {
    const r = await svc.settleFromPaymentIntent({ paymentIntent: intent({ livemode: false }), eventId: 'evt_1' });
    expect(r).toEqual({ settled: true });
    expect(invoiceWrite().metadata).toEqual({ checkoutOrderId: 'ord_1', livemode: false });
});

test('a live intent records livemode true', async () => {
    await svc.settleFromPaymentIntent({ paymentIntent: intent({ livemode: true }), eventId: 'evt_1' });
    expect(invoiceWrite().metadata).toEqual({ checkoutOrderId: 'ord_1', livemode: true });
});

test('an intent that says nothing about livemode (the mock rail) is recorded as not live', async () => {
    await svc.settleFromPaymentIntent({ paymentIntent: intent(), eventId: 'evt_1' });
    expect(invoiceWrite().metadata).toEqual({ checkoutOrderId: 'ord_1', livemode: false });
});

test('an invoice with no metadata yet gets only the record', async () => {
    mockDb.checkoutOrder.findFirst.mockResolvedValue(order({ invoice: { id: 'inv_1', invoiceNumber: 'INV-CO-1', metadata: null } }));
    await svc.settleFromPaymentIntent({ paymentIntent: intent({ livemode: false }), eventId: 'evt_1' });
    expect(invoiceWrite().metadata).toEqual({ livemode: false });
});

test('the record is written in the settlement transaction, with the receipt number', async () => {
    await svc.settleFromPaymentIntent({ paymentIntent: intent({ livemode: false }), eventId: 'evt_1' });
    const data = invoiceWrite();
    expect(data.receiptNumber).toBe('TAX-PRD-2026-000009');
    expect(data.metadata.livemode).toBe(false);
    expect(mockDb.$transaction.mock.invocationCallOrder[0]).toBeLessThan(tx.invoice.update.mock.invocationCallOrder[0]);
});

test('metadata written to the invoice after the settle read its order is kept, read again under the invoice lock', async () => {
    tx.invoice.findUnique.mockResolvedValue({ metadata: { checkoutOrderId: 'ord_1', note: 'written in between' } });
    await svc.settleFromPaymentIntent({ paymentIntent: intent({ livemode: false }), eventId: 'evt_1' });
    expect(invoiceWrite().metadata).toEqual({ checkoutOrderId: 'ord_1', note: 'written in between', livemode: false });

    const lockAt = tx.$queryRaw.mock.calls.findIndex(([sql, id]) => sql.join('').includes('FROM "invoices"') && sql.join('').includes('FOR UPDATE') && id === 'inv_1');
    expect(lockAt).toBeGreaterThanOrEqual(0);
    const lockOrder = tx.$queryRaw.mock.invocationCallOrder[lockAt];
    expect(lockOrder).toBeLessThan(tx.invoice.findUnique.mock.invocationCallOrder[0]);
    expect(tx.invoice.findUnique.mock.invocationCallOrder[0]).toBeLessThan(tx.invoice.update.mock.invocationCallOrder[0]);
});

describe('the settled notice carries the mode of the money event, not the key of the day', () => {
    it.each([
        ['test-mode intent', false, PAYMENT_MODES.TRIAL],
        ['live intent', true, PAYMENT_MODES.LIVE],
    ])('%s', async (_label, livemode, expected) => {
        await svc.settleFromPaymentIntent({ paymentIntent: intent({ livemode }), eventId: 'evt_1' });
        expect(mockNotifyPaymentSuccess).toHaveBeenCalledTimes(1);
        expect(mockNotifyPaymentSuccess).toHaveBeenCalledWith('app_1', 'M1', { checkoutOrderId: 'ord_1', paymentMode: expected });
    });

    it('the heal path of an already-settled order reads the record on the invoice', async () => {
        mockDb.checkoutOrder.findFirst.mockResolvedValue(order({
            status: 'SETTLED', settledAt: new Date('2026-10-21T03:00:00Z'),
            invoice: { id: 'inv_1', invoiceNumber: 'INV-CO-1', receiptNumber: 'TAX-PRD-2026-000009', paidAt: new Date('2026-10-21T03:00:00Z'), metadata: { livemode: false } },
            application: { id: 'app_1', status: 'DOC_FEE_PAID' },
        }));
        process.env.STRIPE_SECRET_KEY = 'sk_live_' + 'x'.repeat(24);
        try {
            const r = await svc.settleFromPaymentIntent({ paymentIntent: intent({ livemode: true }), eventId: 'evt_2' });
            expect(r).toEqual({ settled: true, alreadySettled: true });
            expect(mockNotifyPaymentSuccess).toHaveBeenCalledWith('app_1', 'M1', { checkoutOrderId: 'ord_1', paymentMode: PAYMENT_MODES.TRIAL });
        } finally {
            process.env.STRIPE_SECRET_KEY = 'sk_test_' + 'x'.repeat(24);
        }
    });
});

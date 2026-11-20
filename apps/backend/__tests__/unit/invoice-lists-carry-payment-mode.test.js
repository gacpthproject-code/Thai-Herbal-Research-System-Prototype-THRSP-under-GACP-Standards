'use strict';
/**
 * The on-screen receipt stamps itself from the row's own settlement record (order 105(3),
 * round 2 finding 1), so every invoice read the web consumes carries `paymentMode`:
 * TRIAL or LIVE once money moved, null before. The record lives in `metadata`, which
 * never leaves the server (finance-read-leaks §1 and §3), so the field is derived and the
 * metadata dropped.
 */
jest.mock('../../services/prisma-database', () => {
    const invoiceFind = jest.fn();
    return {
        prisma: {
            invoice: { findMany: jest.fn(), findFirst: invoiceFind, findUnique: invoiceFind, count: jest.fn(), update: jest.fn() },
            auditLog: { findMany: jest.fn() },
            $transaction: jest.fn(async (fn) => fn({})),
        },
    };
});
jest.mock('../../services/notification-service', () => ({ sendNotification: jest.fn(), NotifyType: {} }));

const { prisma } = require('../../services/prisma-database');
const invoiceService = require('../../services/invoice-service');

const PAID_AT = new Date('2026-10-21T03:00:00Z');
const row = (id, over) => ({
    id, invoiceNumber: `INV-${id}`, applicationId: 'app-1', serviceType: 'CERTIFICATION_CHECKOUT_M1',
    subtotal: 5500, vat: 385, totalAmount: 5885, status: 'paid', paidAt: PAID_AT,
    receiptNumber: `TAX-${id}`, receiptIssuedAt: PAID_AT, createdAt: PAID_AT, dueDate: PAID_AT,
    lineItems: [], application: { applicationNumber: 'APP-1', formData: {} }, ...over,
});
const ROWS = [
    row('trial', { metadata: { checkoutOrderId: 'ord-1', livemode: false } }),
    row('live', { metadata: { livemode: true } }),
    row('old', { metadata: { checkoutOrderId: 'ord-0' } }),
    row('unpaid', { status: 'pending', paidAt: null, receiptNumber: null, receiptIssuedAt: null, metadata: { refund: { note: 'staff only' } } }),
];
const modesOf = (list) => Object.fromEntries(list.map((i) => [i.id, i.paymentMode]));

beforeEach(() => {
    jest.clearAllMocks();
    prisma.invoice.findMany.mockResolvedValue(ROWS.map((r) => ({ ...r })));
});

test('the holder list (GET /api/invoices/my) names each row\'s settlement mode and still carries no metadata', async () => {
    const list = await invoiceService.listForHolders({ scope: { readIds: ['entity-1'] } });
    expect(modesOf(list)).toEqual({ trial: 'TRIAL', live: 'LIVE', old: 'TRIAL', unpaid: null });
    for (const invoice of list) { expect(invoice).not.toHaveProperty('metadata'); }
});

test('the staff list (GET /api/invoices) names each row\'s settlement mode and still carries no metadata', async () => {
    const list = await invoiceService.listAll({}, 50, { viewer: { canonicalRole: 'finance_officer_platform', organizationId: 'org-1' } });
    expect(modesOf(list)).toEqual({ trial: 'TRIAL', live: 'LIVE', old: 'TRIAL', unpaid: null });
    for (const invoice of list) { expect(invoice).not.toHaveProperty('metadata'); }
});

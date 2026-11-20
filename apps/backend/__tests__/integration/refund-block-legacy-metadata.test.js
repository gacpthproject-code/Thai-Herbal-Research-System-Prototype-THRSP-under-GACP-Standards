/**
 * Bug 2.2 [MED] — a legacy row whose Invoice.metadata was double-encoded as a
 * JSON string (the retired holdInvoice wrote JSON.stringify into a Json? column)
 * must not bypass the refund idempotency guard: _readRefundBlock self-heals it.
 * holdInvoice itself was removed with manual payment handling (operator 2026-10-06).
 */

'use strict';

// Mock the DB module BEFORE requiring anything that pulls it (CLAUDE.md rule:
// prisma-database process.exit(1)s without DATABASE_URL; audit-logger +
// invoice-finance-ops import it directly).
const mockInvoiceUpdate = jest.fn(async ({ data }) => ({ id: 'inv-1', ...data }));
jest.mock('../../services/prisma-database', () => ({
    prisma: {
        invoice: {
            update: (...args) => mockInvoiceUpdate(...args),
            findUnique: jest.fn(),
            findFirst: jest.fn(),
        },
    },
}));

const refundService = require('../../services/refund-service');

const { _readRefundBlock } = refundService._internals;
const { REFUND_STATUS } = refundService;

describe('Bug 2.2 — a double-encoded legacy metadata row keeps the refund guard', () => {
    it('_readRefundBlock self-heals a legacy DOUBLE-ENCODED (string) metadata row', () => {
        // A row corrupted by the old JSON.stringify bug: metadata is a JSON
        // STRING, not an object.
        const corruptedInvoice = {
            id: 'inv-legacy',
            metadata: JSON.stringify({
                refund: { status: REFUND_STATUS.INITIATED, creditNoteId: 'cn-legacy' },
            }),
        };

        const block = _readRefundBlock(corruptedInvoice);

        // Before the fix this returned null (typeof string !== 'object') → the
        // idempotency guard was bypassed → double-refund. After the fix it
        // parses the string and returns the block.
        expect(block).not.toBeNull();
        expect(block.status).toBe(REFUND_STATUS.INITIATED);
        expect(block.creditNoteId).toBe('cn-legacy');
    });
});

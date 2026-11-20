/**
 * refund-service without a database: the checks that refuse a request before
 * any row is touched, and the amount arithmetic. The recording itself (credit
 * note, metadata, status write, row lock) is proved on a real Postgres in
 * __tests__/integration/refund-kinds-real-postgres.test.js.
 */

'use strict';

const mockTransaction = jest.fn();
jest.mock('../../services/prisma-database', () => ({ prisma: { $transaction: (...a) => mockTransaction(...a) } }));
jest.mock('../../services/notification/application-parties', () => ({ fanoutToApplicationParties: jest.fn() }));
jest.mock('../../middleware/audit-logger', () => ({
    auditLogger: { log: jest.fn().mockResolvedValue(null) },
    AuditCategory: { PAYMENT: 'PAYMENT' },
    AuditSeverity: { INFO: 'INFO', WARNING: 'WARNING' },
    ResourceType: { INVOICE: 'INVOICE' },
}));

const refundService = require('../../services/refund-service');
const { PROVIDER_CANCELLATION_REASONS } = require('../../shared/refund-kinds');

const { parseAmount, splitWithinRemainder } = refundService._internals;
const finance = { id: 'f-1', canonicalRole: 'finance_officer_platform', organizationId: 'org-1' };

beforeEach(() => mockTransaction.mockReset());

describe('parseAmount — baht, more than zero, at most two decimals', () => {
    it.each([[1000, 1000], [0.01, 0.01], [29424.99, 29424.99], [0.1 + 0.2, 0.3]])('%p is %p', (input, expected) => {
        expect(parseAmount(input)).toBe(expected);
    });

    it.each([0, -1, 10.005, NaN, Infinity, '100', null, undefined, {}])('%p is refused', (input) => {
        expect(parseAmount(input)).toBeNull();
    });
});

describe('splitWithinRemainder — the invoice proportion, never past what is left', () => {
    const invoice = { subtotal: 27500, vat: 1925, totalAmount: 29425 };
    const whole = { subtotal: 27500, vat: 1925, total: 29425 };

    it('splits a part in the invoice proportion', () => {
        expect(splitWithinRemainder(1000, invoice, whole)).toEqual({ subtotal: 934.58, vat: 65.42 });
    });

    it('takes what is left as it is when the amount is all of it', () => {
        const left = { subtotal: 26565.42, vat: 1859.58, total: 28425 };
        expect(splitWithinRemainder(28425, invoice, left)).toEqual({ subtotal: 26565.42, vat: 1859.58 });
    });

    it('never puts more VAT on the note than is left on the invoice', () => {
        const left = { subtotal: 100, vat: 0.5, total: 100.5 };
        const split = splitWithinRemainder(50, invoice, left);
        expect(split.vat).toBeLessThanOrEqual(0.5);
        expect(Math.round((split.subtotal + split.vat) * 100)).toBe(5000);
    });
});

describe('requests refused before the database is touched', () => {
    it.each([
        [{ invoiceId: 'i', amount: 10, idempotencyKey: 'k', actor: { canonicalRole: 'finance_officer_dtam', organizationId: 'org-1' } }, 'FORBIDDEN_ROLE'],
        [{ invoiceId: 'i', amount: 10, idempotencyKey: 'k', actor: { canonicalRole: 'field_inspector', organizationId: 'org-1' } }, 'FORBIDDEN_ROLE'],
        [{ invoiceId: 'i', amount: 10, idempotencyKey: 'k', actor: { canonicalRole: 'system_admin_dtam', organizationId: 'org-1' } }, 'FORBIDDEN_ROLE'],
        [{ invoiceId: 'i', amount: 10, idempotencyKey: 'k', actor: { canonicalRole: 'system_admin_platform', organizationId: 'org-1' } }, 'FORBIDDEN_ROLE'],
        [{ invoiceId: 'i', amount: 10, actor: finance }, 'REFUND_IDEMPOTENCY_KEY_REQUIRED'],
        [{ invoiceId: 'i', amount: 0, idempotencyKey: 'k', actor: finance }, 'REFUND_AMOUNT_INVALID'],
    ])('duplicate charge %#', async (args, code) => {
        await expect(refundService.recordDuplicateChargeRefund(args)).rejects.toMatchObject({ code });
        expect(mockTransaction).not.toHaveBeenCalled();
    });

    it.each([
        [{ invoiceId: 'i', reasonCode: 'APPLICANT_ASKED', note: 'ผู้ยื่นขอยกเลิกเอง', actor: finance }, 'REFUND_CANCELLATION_REASON_INVALID'],
        [{ invoiceId: 'i', reasonCode: 'SYSTEM_ERROR', note: 'ระบบผิดพลาดทำให้คำขอถูกปิด', actor: finance }, 'REFUND_CANCELLATION_REASON_INVALID'],
        [{ invoiceId: 'i', reasonCode: 'COMPANY_STOPPED_SERVICE', note: 'สั้น', actor: finance }, 'REFUND_CANCELLATION_NOTE_REQUIRED'],
        [{ invoiceId: 'i', reasonCode: 'COMPANY_STOPPED_SERVICE', note: 'บริษัทหยุดให้บริการนี้แล้ว', actor: { canonicalRole: 'finance_officer_dtam' } }, 'FORBIDDEN_ROLE'],
        [{ invoiceId: 'i', reasonCode: 'COMPANY_STOPPED_SERVICE', note: 'บริษัทหยุดให้บริการนี้แล้ว', actor: { canonicalRole: 'system_admin_dtam', organizationId: 'org-1' } }, 'FORBIDDEN_ROLE'],
    ])('provider cancellation %#', async (args, code) => {
        await expect(refundService.recordProviderCancellationRefund(args)).rejects.toMatchObject({ code });
        expect(mockTransaction).not.toHaveBeenCalled();
    });
});

describe('a finance officer with no organization is refused first; another organization`s invoice is not found (order 17, R2-L2)', () => {
    const cancellation = { invoiceId: 'i', reasonCode: 'COMPANY_STOPPED_SERVICE', note: 'บริษัทหยุดให้บริการนี้แล้ว' };

    it('no organization: 403 FORBIDDEN_TENANT on both refund doors, before the database is touched', async () => {
        const noOrganization = { canonicalRole: 'finance_officer_platform' };
        await expect(refundService.recordDuplicateChargeRefund({ invoiceId: 'i', amount: 10, idempotencyKey: 'k', actor: noOrganization }))
            .rejects.toMatchObject({ code: 'FORBIDDEN_TENANT', statusCode: 403 });
        await expect(refundService.recordProviderCancellationRefund({ ...cancellation, actor: noOrganization }))
            .rejects.toMatchObject({ code: 'FORBIDDEN_TENANT', statusCode: 403 });
        expect(mockTransaction).not.toHaveBeenCalled();
    });

    it.each([
        ['another organization`s invoice', { id: 'i', organizationId: 'org-2', isDeleted: true, status: 'pending' }],
        ['an invoice with no organization', { id: 'i', organizationId: null, isDeleted: false, status: 'paid' }],
        ['no invoice at all', null],
    ])('%s gets the one not-found answer, and nothing about the row', async (_label, row) => {
        mockTransaction.mockImplementation(async (work) => work({
            $queryRaw: jest.fn().mockResolvedValue([]),
            invoice: { findUnique: jest.fn().mockResolvedValue(row) },
        }));

        await expect(refundService.recordProviderCancellationRefund({ ...cancellation, actor: finance }))
            .rejects.toMatchObject({ code: 'INVOICE_NOT_FOUND', statusCode: 404, message: 'Invoice not found' });
    });
});

describe('the provider-cancellation reasons are a closed list of company or state causes', () => {
    it('names exactly four causes, none of them the applicant or a system error', () => {
        expect(Object.keys(PROVIDER_CANCELLATION_REASONS).sort()).toEqual([
            'BARRED_BY_LAW_OR_ORDER', 'COMPANY_CANNOT_INSPECT', 'COMPANY_STOPPED_SERVICE', 'DEPARTMENT_STOPPED_CERTIFYING',
        ]);
    });

    it('no full-invoice refund door is left on the service', () => {
        expect(refundService.initiateRefund).toBeUndefined();
        expect(refundService.cancelRefund).toBeUndefined();
    });
});

/**
 * The finance refund form (order 22, operator 2026-10-06). Finance records a
 * refund the company made outside the system, of one of two kinds: a duplicate
 * or over-charge (only the excess, status unchanged) or a cancellation by the
 * company or the state (full milestone, a reason from a fixed list plus a
 * note). There is no choice for an applicant who cancels, or for a system error.
 *
 * Asserts which door is called with what, and that the modal closes only when
 * the backend recorded the refund. The amounts, VAT split and eligibility are
 * the backend's (refund-kinds-real-postgres.test.js).
 */

import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type ApiResult = { success: boolean; error?: string; code?: string; data?: unknown };

const mockPost = jest.fn<(url: string, body?: unknown) => Promise<ApiResult>>();
const mockToastError = jest.fn<(msg: string) => void>();
const mockToastSuccess = jest.fn<(msg: string) => void>();

jest.mock('@/lib/api/api-client', () => ({
    apiClient: {
        post: (url: string, body?: unknown) => mockPost(url, body),
        // The refund-transfer panel beside the refund button reads the invoice's refunds.
        get: () => Promise.resolve({ success: true, data: { cancellation: null, duplicateChargeRefunds: [] } }),
    },
}));
jest.mock('sonner', () => ({
    toast: {
        error: (msg: string) => mockToastError(msg),
        success: (msg: string) => mockToastSuccess(msg),
    },
}));
jest.mock('@/components/ui/primitives/dialog', () => ({
    Dialog: ({ open, children }: { open?: boolean; children?: React.ReactNode }) =>
        open ? <div data-testid="dialog">{children}</div> : null,
    DialogContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
}));

import { InvoiceDetailModal } from '../invoice-detail-modal';
import type { InvoiceItem } from '../accounting-types';
import { PROVIDER_CANCELLATION_REASONS } from '@/constants/refund-kinds';

const PAID: InvoiceItem = {
    id: 'inv-rk',
    invoiceNumber: 'INV-RK',
    applicationNumber: 'APP-RK',
    healthName: 'ผู้สมัคร',
    amount: 29425,
    status: 'paid',
    erpStatus: 'RECEIPT_ISSUED',
    dueDate: '2026-10-30T00:00:00.000Z',
    paidAt: '2026-10-06T00:00:00.000Z',
    createdAt: '2026-10-01T00:00:00.000Z',
    serviceType: 'CERTIFICATION_CHECKOUT_M2',
};
const PAID_M1: InvoiceItem = { ...PAID, amount: 5885, serviceType: 'CERTIFICATION_CHECKOUT_M1' };

const OPEN_FORM = 'บันทึกการคืนเงิน';
const CONFIRM = 'ยืนยัน บันทึกการคืนเงิน';

let container: HTMLDivElement;
let root: Root;
let onClose: ReturnType<typeof jest.fn>;
let onRefresh: ReturnType<typeof jest.fn>;

function renderModal(invoice: InvoiceItem = PAID, canRefund = true) {
    act(() => {
        root.render(
            <InvoiceDetailModal
                invoice={invoice}
                onClose={onClose as unknown as () => void}
                onRefresh={onRefresh as unknown as () => void}
                formatCurrency={(n: number) => String(n)}
                formatDate={(v: string) => v}
                getStatusBadge={(s: string) => <span>{s}</span>}
                canRefund={canRefund}
            />,
        );
    });
}

const buttons = () => Array.from(container.querySelectorAll('button'));
const button = (text: string) => buttons().find((b) => (b.textContent || '').trim() === text) as HTMLButtonElement | undefined;

async function click(el: Element | undefined | null) {
    if (!el) throw new Error('element not found');
    await act(async () => {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
}

async function type(selector: string, value: string) {
    const el = container.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const proto = Object.getPrototypeOf(el);
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    await act(async () => {
        el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    });
}

async function chooseKind(value: 'DUPLICATE' | 'PROVIDER_CANCELLED') {
    await click(button(OPEN_FORM));
    await click(container.querySelector(`input[name="refund-kind"][value="${value}"]`));
}

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    onClose = jest.fn();
    onRefresh = jest.fn();
    mockPost.mockReset();
    mockToastError.mockReset();
    mockToastSuccess.mockReset();
    mockPost.mockResolvedValue({ success: true, data: {} });
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

describe('who sees the form', () => {
    it.each([
        ['a receipted invoice', { status: 'paid', erpStatus: 'RECEIPT_ISSUED' }],
        ['a paid invoice waiting for its receipt', { status: 'paid', erpStatus: 'PAID_PENDING_RECEIPT' }],
    ])('%s offers it', (_label, fields) => {
        renderModal({ ...PAID, ...fields });
        expect(button(OPEN_FORM)).toBeDefined();
    });

    it.each([
        ['an unpaid invoice', { status: 'pending', erpStatus: 'PENDING' }],
        ['an UNPAID invoice', { status: 'UNPAID', erpStatus: 'UNPAID' }],
    ])('%s does not', (_label, fields) => {
        renderModal({ ...PAID, ...fields });
        expect(button(OPEN_FORM)).toBeUndefined();
    });

    it('a viewer without refund rights does not', () => {
        renderModal(PAID, false);
        expect(button(OPEN_FORM)).toBeUndefined();
    });
});

describe('the two kinds, and nothing else', () => {
    it('offers exactly the duplicate charge and the company or state cancellation', async () => {
        renderModal();
        await click(button(OPEN_FORM));
        const kinds = Array.from(container.querySelectorAll('input[name="refund-kind"]')).map((i) => (i as HTMLInputElement).value);
        expect(kinds).toEqual(['DUPLICATE', 'PROVIDER_CANCELLED']);
        expect(container.textContent).toContain('ผู้ยื่นขอยกเลิกเอง หรือคำขอถูกปิดเพราะระบบผิดพลาด ไม่มีการคืนเงิน');
    });

    it('confirm stays disabled until a kind and its details are filled', async () => {
        renderModal();
        await click(button(OPEN_FORM));
        expect(button(CONFIRM)!.disabled).toBe(true);
        await click(container.querySelector('input[value="DUPLICATE"]'));
        expect(button(CONFIRM)!.disabled).toBe(true);
        await type('#refund-amount', '0');
        expect(button(CONFIRM)!.disabled).toBe(true);
    });
});

describe('duplicate or over-charge', () => {
    it('posts the excess as a number of baht with an idempotency key, then closes', async () => {
        renderModal();
        await chooseKind('DUPLICATE');
        await type('#refund-amount', '1000.50');
        await click(button(CONFIRM));

        expect(mockPost).toHaveBeenCalledTimes(1);
        const [url, body] = mockPost.mock.calls[0] as [string, { amount: number; idempotencyKey: string }];
        expect(url).toBe('/finance/refunds/inv-rk/duplicate-charge');
        expect(body.amount).toBe(1000.5);
        expect(body.idempotencyKey).toEqual(expect.any(String));
        expect(Object.keys(body).sort()).toEqual(['amount', 'idempotencyKey']);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it('a retry after a failure resends the same key, so the backend records it once', async () => {
        mockPost.mockResolvedValueOnce({ success: false, error: 'Request timeout. Please try again' });
        renderModal();
        await chooseKind('DUPLICATE');
        await type('#refund-amount', '500');
        await click(button(CONFIRM));
        await click(button(CONFIRM));

        const keys = mockPost.mock.calls.map((c) => (c[1] as { idempotencyKey: string }).idempotencyKey);
        expect(keys).toHaveLength(2);
        expect(keys[0]).toBe(keys[1]);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('a refusal stays open and says why in Thai', async () => {
        mockPost.mockResolvedValue({ success: false, error: 'exceeds', code: 'REFUND_EXCEEDS_REMAINING' });
        renderModal();
        await chooseKind('DUPLICATE');
        await type('#refund-amount', '99999');
        await click(button(CONFIRM));

        expect(onClose).not.toHaveBeenCalled();
        expect(mockToastError).toHaveBeenCalledWith('จำนวนเงินเกินยอดที่ยังคืนได้ของใบนี้ ตรวจใบลดหนี้ที่ออกไปแล้วก่อนบันทึกใหม่');
    });
});

describe('cancelled by the company or the state', () => {
    const reasonsOffered = async (invoice: InvoiceItem) => {
        renderModal(invoice);
        await chooseKind('PROVIDER_CANCELLED');
        return Array.from(container.querySelectorAll('#refund-reason option')).map((o) => (o as HTMLOptionElement).value).filter(Boolean);
    };

    it('an M2 invoice lists the four reasons from the shared list', async () => {
        expect(await reasonsOffered(PAID)).toEqual(Object.keys(PROVIDER_CANCELLATION_REASONS));
    });

    // Reason (ง) cancels the field inspection, which the M2 payment pays for; the door refuses it on M1
    // with REFUND_CANCELLATION_REASON_NOT_APPLICABLE (check of f45c9a987, Low-2).
    it('an M1 invoice is not offered reason (ง), the company could not inspect', async () => {
        expect(await reasonsOffered(PAID_M1)).toEqual(
            Object.keys(PROVIDER_CANCELLATION_REASONS).filter((code) => code !== 'COMPANY_CANNOT_INSPECT'),
        );
    });

    it('needs a reason and a note of at least ten characters, then posts both', async () => {
        renderModal();
        await chooseKind('PROVIDER_CANCELLED');
        await type('#refund-reason', 'BARRED_BY_LAW_OR_ORDER');
        await type('#refund-note', 'สั้นไป');
        expect(button(CONFIRM)!.disabled).toBe(true);
        await type('#refund-note', 'คำสั่งกรมที่ 12/2569 ห้ามให้บริการ');
        await click(button(CONFIRM));

        expect(mockPost).toHaveBeenCalledWith('/finance/refunds/inv-rk/provider-cancellation', {
            reasonCode: 'BARRED_BY_LAW_OR_ORDER', note: 'คำสั่งกรมที่ 12/2569 ห้ามให้บริการ',
        });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('a milestone whose service started is refused with the terms clause', async () => {
        mockPost.mockResolvedValue({ success: false, error: 'started', code: 'REFUND_SERVICE_ALREADY_STARTED' });
        renderModal();
        await chooseKind('PROVIDER_CANCELLED');
        await type('#refund-reason', 'COMPANY_STOPPED_SERVICE');
        await type('#refund-note', 'บริษัทปิดบริการรับรองในพื้นที่นี้');
        await click(button(CONFIRM));

        expect(onClose).not.toHaveBeenCalled();
        expect(mockToastError).toHaveBeenCalledWith('งวดนี้เริ่มดำเนินการตรวจแล้ว จึงคืนเงินไม่ได้ตามเงื่อนไขข้อ 7.2.3');
    });
});

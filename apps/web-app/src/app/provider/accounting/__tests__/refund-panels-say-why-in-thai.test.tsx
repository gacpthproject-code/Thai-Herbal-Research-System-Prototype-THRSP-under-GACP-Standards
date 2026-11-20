/**
 * The refund panels tell the finance officer in Thai why a refund door refused (order 51,
 * review of 163f352e9 L3). Rendered through the REAL apiClient with only `fetch` mocked: the
 * door answers { error: <code>, message: <English> }, apiClient hands the panel the code, and a
 * code missing from the panel's words showed the raw code (refund form) or "try again"
 * (transfer form), neither of which says what happened.
 *   refund doors           404 INVOICE_NOT_FOUND, also another organization's invoice (R2-L2);
 *                          409 REFUND_CANCELLATION_REASON_NOT_APPLICABLE, 410 INVOICE_DELETED,
 *                          503 DB_UNAVAILABLE and 500 REFUND_FAILED (check of f45c9a987, Low-2)
 *   refund-transfer door   404 CREDIT_NOTE_NOT_FOUND
 *   both                   403 FORBIDDEN_TENANT, sent only to an account with no organization
 */

import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockToastError = jest.fn<(msg: string) => void>();
jest.mock('sonner', () => ({
    toast: { error: (msg: string) => mockToastError(msg), success: jest.fn() },
}));

import { RefundRecordPanel } from '../refund-record-panel';
import { RefundTransferPanel } from '../refund-transfer-panel';
import type { InvoiceItem } from '../accounting-types';

/** What the backend doors send (routes/api/finance/finance-route-helpers.js sendServiceError). */
const REFUSALS = {
    INVOICE_NOT_FOUND: { status: 404, message: 'Invoice not found' },
    CREDIT_NOTE_NOT_FOUND: { status: 404, message: 'Credit note not found' },
    FORBIDDEN_TENANT: { status: 403, message: 'Organization context required' },
    REFUND_CANCELLATION_REASON_NOT_APPLICABLE: { status: 409, message: 'COMPANY_CANNOT_INSPECT does not cancel the M1 payment' },
    INVOICE_DELETED: { status: 410, message: 'Invoice is soft-deleted' },
    DB_UNAVAILABLE: { status: 503, message: 'Failed to process refund request' },
    REFUND_FAILED: { status: 500, message: 'Failed to process refund request' },
} as const;
type RefusalCode = keyof typeof REFUSALS;

function jsonResponse(status: number, body: unknown) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
        json: async () => body,
        text: async () => JSON.stringify(body),
    };
}

const UNRECORDED_REFUND = {
    cancellation: null,
    duplicateChargeRefunds: [{
        creditNoteId: 'cn-2', creditNoteNumber: 'CN-PRD-2026-000002', amount: 1000,
        refundTransferredOn: null, refundBankReference: null,
    }],
};

/** Every write is refused with `code`; the transfer panel's status read answers one unrecorded refund. */
function doorsRefuse(code: RefusalCode) {
    const { status, message } = REFUSALS[code];
    return jest.fn(async (url: string, init?: RequestInit) => {
        if ((init?.method || 'GET').toUpperCase() === 'GET' && url.endsWith('/api/finance/refunds/inv-rk/status')) {
            return jsonResponse(200, { success: true, data: UNRECORDED_REFUND });
        }
        return jsonResponse(status, { success: false, error: code, message });
    });
}

const PAID: InvoiceItem = {
    id: 'inv-rk',
    invoiceNumber: 'INV-RK',
    applicationNumber: 'APP-RK',
    healthName: 'ผู้สมัคร',
    amount: 5885,
    status: 'paid',
    erpStatus: 'RECEIPT_ISSUED',
    dueDate: '2026-10-30T00:00:00.000Z',
    paidAt: '2026-10-06T00:00:00.000Z',
    createdAt: '2026-10-01T00:00:00.000Z',
};
const PAID_M2: InvoiceItem = { ...PAID, amount: 29425, serviceType: 'CERTIFICATION_CHECKOUT_M2' };

const originalFetch = globalThis.fetch;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockToastError.mockReset();
});

afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    globalThis.fetch = originalFetch;
});

function setValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set?.call(el, value);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
}

const buttonNamed = (text: string) => Array.from(container.querySelectorAll('button'))
    .find((b) => (b.textContent || '').trim() === text) as HTMLButtonElement;

async function settle() {
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

/** The refund form: a duplicate-charge refund of 100 baht, confirmed; the toast it shows. */
async function refundFormRefusal(code: RefusalCode): Promise<string> {
    globalThis.fetch = doorsRefuse(code) as unknown as typeof fetch;
    await act(async () => {
        root.render(<RefundRecordPanel invoice={PAID} formatCurrency={(n) => String(n)} onRecorded={() => {}} onCancel={() => {}} />);
    });
    await act(async () => { (container.querySelector('input[value="DUPLICATE"]') as HTMLInputElement).click(); });
    await act(async () => { setValue(container.querySelector('#refund-amount') as HTMLInputElement, '100'); });
    await act(async () => { buttonNamed('ยืนยัน บันทึกการคืนเงิน').click(); });
    await settle();
    expect(mockToastError).toHaveBeenCalledTimes(1);
    return mockToastError.mock.calls[0][0];
}

/** The refund form: a cancellation of an M2 invoice with reason (ง) and a note, confirmed; the toast it shows. */
async function cancellationFormRefusal(code: RefusalCode): Promise<string> {
    globalThis.fetch = doorsRefuse(code) as unknown as typeof fetch;
    await act(async () => {
        root.render(<RefundRecordPanel invoice={PAID_M2} formatCurrency={(n) => String(n)} onRecorded={() => {}} onCancel={() => {}} />);
    });
    await act(async () => { (container.querySelector('input[value="PROVIDER_CANCELLED"]') as HTMLInputElement).click(); });
    await act(async () => { setValue(container.querySelector('#refund-reason') as HTMLSelectElement, 'COMPANY_CANNOT_INSPECT'); });
    await act(async () => { setValue(container.querySelector('#refund-note') as HTMLTextAreaElement, 'ไม่มีผู้ตรวจที่ไปตรวจในจังหวัดนี้ได้'); });
    await act(async () => { buttonNamed('ยืนยัน บันทึกการคืนเงิน').click(); });
    await settle();
    expect(mockToastError).toHaveBeenCalledTimes(1);
    return mockToastError.mock.calls[0][0];
}

/** The transfer form under an unrecorded refund: a reference typed and saved; the alert it shows. */
async function transferFormRefusal(code: RefusalCode): Promise<string> {
    globalThis.fetch = doorsRefuse(code) as unknown as typeof fetch;
    await act(async () => {
        root.render(<RefundTransferPanel invoiceId="inv-rk" canWrite formatCurrency={(n) => String(n)} />);
    });
    await settle();
    const [, reference] = Array.from(container.querySelectorAll('input')) as HTMLInputElement[];
    await act(async () => { setValue(reference, 'SCB-777'); });
    await act(async () => { buttonNamed('บันทึกการโอนคืน').click(); });
    await settle();
    return container.querySelector('[role="alert"]')?.textContent || '';
}

describe('the refund form says why the door refused, in Thai', () => {
    it.each([
        ['INVOICE_NOT_FOUND', 'ไม่พบใบแจ้งหนี้นี้'],
        ['FORBIDDEN_TENANT', 'บัญชีของคุณยังไม่ได้สังกัดหน่วยงาน จึงบันทึกการคืนเงินไม่ได้ ติดต่อผู้ดูแลแพลตฟอร์มให้กำหนดหน่วยงานของบัญชีนี้'],
        ['INVOICE_DELETED', 'ใบแจ้งหนี้นี้ถูกยกเลิกไปแล้ว จึงบันทึกการคืนเงินไม่ได้ รีเฟรชหน้าจอเพื่อดูรายการล่าสุด'],
        ['DB_UNAVAILABLE', 'ระบบเชื่อมต่อฐานข้อมูลไม่ได้ จึงยังไม่ได้บันทึกการคืนเงิน รอสักครู่แล้วกดบันทึกอีกครั้ง'],
        ['REFUND_FAILED', 'บันทึกการคืนเงินไม่สำเร็จ ยังไม่มีการออกใบลดหนี้ ลองอีกครั้ง หากยังไม่สำเร็จ แจ้งผู้ดูแลแพลตฟอร์ม'],
    ] as const)('%s', async (code, thai) => {
        expect(await refundFormRefusal(code)).toBe(thai);
    });

    it('REFUND_CANCELLATION_REASON_NOT_APPLICABLE, which only a cancellation is answered with', async () => {
        expect(await cancellationFormRefusal('REFUND_CANCELLATION_REASON_NOT_APPLICABLE'))
            .toBe('เหตุที่เลือกใช้กับงวดของใบแจ้งหนี้นี้ไม่ได้ เลือกเหตุอื่นจากรายการ');
    });
});

describe('the refund-transfer form says why the door refused, in Thai', () => {
    it.each([
        ['CREDIT_NOTE_NOT_FOUND', 'ไม่พบใบลดหนี้นี้'],
        ['FORBIDDEN_TENANT', 'บัญชีของคุณยังไม่ได้สังกัดหน่วยงาน จึงบันทึกการโอนคืนไม่ได้ ติดต่อผู้ดูแลแพลตฟอร์มให้กำหนดหน่วยงานของบัญชีนี้'],
    ] as const)('%s', async (code, thai) => {
        expect(await transferFormRefusal(code)).toBe(thai);
    });
});

/**
 * Order 29: finance records the day the company's bank paid a refund and the bank's
 * reference, on the refund's credit note. The DTAM finance officer sees the record, never
 * the form; the company finance officer sends exactly the day and the reference typed.
 */

import * as React from 'react';
import { describe, expect, it, jest, afterEach } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockPost = jest.fn((_url: string, _body: unknown) => Promise.resolve({ success: true, data: {} }));
jest.mock('@/lib/api/api-client', () => ({
    apiClient: {
        get: () => Promise.resolve({
            success: true,
            data: {
                cancellation: {
                    creditNoteId: 'cn-1', creditNoteNumber: 'CN-PRD-2026-000001', amount: 5885,
                    creditNote: { refundTransferredOn: '2026-10-07T00:00:00.000Z', refundBankReference: 'KBANK-1' },
                },
                duplicateChargeRefunds: [{
                    creditNoteId: 'cn-2', creditNoteNumber: 'CN-PRD-2026-000002', amount: 1000,
                    refundTransferredOn: null, refundBankReference: null,
                }],
            },
        }),
        post: (url: string, body: unknown) => mockPost(url, body),
    },
}));

import { RefundTransferPanel } from '../refund-transfer-panel';

let root: Root | null = null;
let container: HTMLElement;
afterEach(async () => {
    if (root) { await act(async () => { root?.unmount(); }); root = null; }
    container?.remove();
});

async function mount(canWrite: boolean) {
    container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
        root = createRoot(container);
        root.render(<RefundTransferPanel invoiceId="inv-1" canWrite={canWrite} formatCurrency={(n) => `฿${n}`} />);
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

function type(input: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('refund transfer panel', () => {
    it('a read-only role sees both refunds and whether the bank paid, with no form', async () => {
        await mount(false);
        const text = container.textContent || '';
        expect(text).toContain('โอนคืนแล้ว');
        expect(text).toContain('KBANK-1');
        expect(text).toContain('ยังไม่ได้บันทึกการโอนคืน');
        expect(container.querySelector('input')).toBeNull();
    });

    it('the company finance officer records the day and the reference typed', async () => {
        await mount(true);
        const [day, reference] = Array.from(container.querySelectorAll('input')) as HTMLInputElement[];
        await act(async () => { type(day, '2026-10-08'); type(reference, 'SCB-777'); });
        const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('บันทึกการโอนคืน')) as HTMLButtonElement;
        await act(async () => { button.click(); });
        expect(mockPost).toHaveBeenCalledWith(
            '/finance/credit-notes/cn-2/refund-transfer',
            { transferredOn: '2026-10-08', bankReference: 'SCB-777' },
        );
    });
});

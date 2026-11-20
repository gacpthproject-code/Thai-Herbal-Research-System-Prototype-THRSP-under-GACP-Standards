/**
 * ถอนคำขอ (standing order 32, operator 2026-10-07): before document review starts the
 * applicant may withdraw. The application becomes CANCELLED and fees already paid are not
 * refunded (payment terms §7.1). The server decides; this pins what the screen offers,
 * what it sends, and what it says when the server refuses.
 */

import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type ApiResult = { success: boolean; error?: string; code?: string; errorCode?: string; status?: number; data?: unknown };
const mockPost = jest.fn<(url: string, body?: unknown) => Promise<ApiResult>>();

jest.mock('@/lib/api/api-client', () => ({
    apiClient: { post: (url: string, body?: unknown) => mockPost(url, body) },
}));
jest.mock('@/components/ui/primitives/dialog', () => ({
    Dialog: ({ open, children }: { open?: boolean; children?: React.ReactNode }) =>
        open ? <div data-testid="dialog">{children}</div> : null,
    DialogContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
    DialogDescription: ({ children }: { children?: React.ReactNode }) => <p>{children}</p>,
    DialogFooter: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

import { WithdrawApplication } from '../withdraw-application';
import { canWithdraw, withdrawRefusalTh } from '@/lib/services/withdraw-application';

let host: HTMLDivElement;
let root: Root;
const onWithdrawn = jest.fn();

beforeEach(() => {
    mockPost.mockReset();
    onWithdrawn.mockReset();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

const mount = (status: string, canSubmit = true) =>
    act(() => { root.render(<WithdrawApplication applicationId="app-1" status={status} canSubmit={canSubmit} onWithdrawn={onWithdrawn} />); });
const button = (label: string) =>
    Array.from(host.querySelectorAll('button')).find((b) => b.textContent === label);
const typeReason = (value: string) => {
    const box = host.querySelector('textarea')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    act(() => {
        setter.call(box, value);
        box.dispatchEvent(new Event('input', { bubbles: true }));
    });
};

describe('who may withdraw', () => {
    it('only before document review starts: PENDING_DOC_FEE and DOC_FEE_PAID', () => {
        expect(canWithdraw('PENDING_DOC_FEE')).toBe(true);
        expect(canWithdraw('DOC_FEE_PAID')).toBe(true);
        for (const status of ['DRAFT', 'ASSIGNED_FOR_REVIEW', 'REVISION_REQUESTED', 'DOC_APPROVED', 'CERTIFIED', 'CANCELLED', 'EXPIRED', '']) {
            expect(canWithdraw(status)).toBe(false);
        }
    });

    it('shows no button once review has started', () => {
        mount('ASSIGNED_FOR_REVIEW');
        expect(button('ถอนคำขอ')).toBeUndefined();
    });

    it('shows no button to a member without SUBMIT_APPLICATION, even while withdrawable (live walk F4)', () => {
        for (const status of ['PENDING_DOC_FEE', 'DOC_FEE_PAID']) {
            mount(status, false);
            expect(button('ถอนคำขอ')).toBeUndefined();
        }
        mount('DOC_FEE_PAID', true);
        expect(button('ถอนคำขอ')).toBeDefined();
    });
});

describe('the confirmation', () => {
    it('states the consequence and the no-refund rule before anything is sent', () => {
        mount('DOC_FEE_PAID');
        act(() => { button('ถอนคำขอ')!.click(); });
        const text = host.textContent ?? '';
        expect(text).toContain('คำขอนี้จะถูกยกเลิก');
        expect(text).toContain('ไม่คืนเงิน');
        expect(text).toContain('ข้อ 7.1');
        expect(text).not.toContain('ท่าน');
        expect(mockPost).not.toHaveBeenCalled();
    });

    it('requires a reason of at least 5 characters', () => {
        mount('PENDING_DOC_FEE');
        act(() => { button('ถอนคำขอ')!.click(); });
        const confirm = button('ยืนยันถอนคำขอ')!;
        expect(confirm.disabled).toBe(true);
        typeReason('สั้น');
        expect(button('ยืนยันถอนคำขอ')!.disabled).toBe(true);
        typeReason('เปลี่ยนแผนการปลูก');
        expect(button('ยืนยันถอนคำขอ')!.disabled).toBe(false);
    });

    it('sends the trimmed reason and reports success to the page', async () => {
        mockPost.mockResolvedValueOnce({ success: true, data: { id: 'app-1', status: 'CANCELLED' } });
        mount('PENDING_DOC_FEE');
        act(() => { button('ถอนคำขอ')!.click(); });
        typeReason('  เปลี่ยนแผนการปลูก  ');
        await act(async () => { button('ยืนยันถอนคำขอ')!.click(); });
        expect(mockPost).toHaveBeenCalledWith('/applications/app-1/withdraw', { reason: 'เปลี่ยนแผนการปลูก' });
        expect(onWithdrawn).toHaveBeenCalledTimes(1);
    });

    it('a refusal is said in Thai and nothing is reported as withdrawn', async () => {
        mockPost.mockResolvedValueOnce({ success: false, status: 409, error: 'conflict', errorCode: 'WITHDRAW_NOT_ALLOWED' });
        mount('DOC_FEE_PAID');
        act(() => { button('ถอนคำขอ')!.click(); });
        typeReason('เปลี่ยนแผนการปลูก');
        await act(async () => { button('ยืนยันถอนคำขอ')!.click(); });
        expect(host.textContent).toContain(withdrawRefusalTh('WITHDRAW_NOT_ALLOWED'));
        expect(onWithdrawn).not.toHaveBeenCalled();
    });
});

describe('refusal copy', () => {
    it('maps each server code to Thai and falls back for unknown codes', () => {
        for (const code of ['WITHDRAW_REASON_REQUIRED', 'WITHDRAW_NOT_ALLOWED', 'ENTITY_PERMISSION_DENIED', undefined]) {
            const line = withdrawRefusalTh(code);
            expect(line).toMatch(/[ก-๙]/);
            expect(line).not.toContain('—');
        }
        expect(withdrawRefusalTh('WITHDRAW_NOT_ALLOWED')).not.toBe(withdrawRefusalTh(undefined));
    });
});

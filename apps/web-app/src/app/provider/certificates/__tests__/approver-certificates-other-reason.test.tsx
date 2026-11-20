/**
 * Suspend and revoke take "อื่น ๆ (โปรดระบุ)" with the approver's own words (operator 2026-10-08):
 * the typed reason goes to the server as reasonText, and a stored reason with markup shows as text.
 */
import * as React from 'react';
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {

    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
    usePathname: () => '/provider/certificates',
    useSearchParams: () => new URLSearchParams(),
}));
const mockRequest = jest.fn<(path: string, init?: RequestInit) => Promise<{ success: boolean; data?: unknown; error?: string }>>();
jest.mock('../../audits/auditor-types', () => ({
    PROVIDERRequest: (path: string, init?: RequestInit) => mockRequest(path, init),
}));
jest.mock('@/lib/notifications', () => ({ notifications: { show: jest.fn() } }));

import { ApproverCertificates } from '../approver-certificates';

const markup = 'ผู้ถือย้ายแปลง <b>โดยไม่แจ้ง</b> <img src=x onerror=alert(1)>';
const payload = {
    items: [
        {
            id: 'cert-1', certificateNumber: 'TH-GACP 1/2569', status: 'active', farmName: 'ฟาร์ม', cropType: 'cannabis',
            holderDisplayName: 'บริษัท ทดสอบ จำกัด', issuedDate: null, expiryDate: null, suspendedReason: null, revokedReason: null,
        },
        {
            id: 'cert-2', certificateNumber: 'TH-GACP 2/2569', status: 'revoked', farmName: 'ฟาร์ม', cropType: 'cannabis',
            holderDisplayName: 'บริษัท ทดสอบ จำกัด', issuedDate: null, expiryDate: null, suspendedReason: null, revokedReason: markup,
        },
    ],
    suspensionReasons: [{ code: 'HOLDER_REQUEST', label: 'ผู้ถือใบรับรองขอพักใช้' }, { code: 'OTHER', label: 'อื่น ๆ (โปรดระบุ)' }],
    revocationReasons: [{ code: 'HOLDER_REQUEST', label: 'ผู้ถือใบรับรองขอยกเลิกใบรับรอง' }, { code: 'OTHER', label: 'อื่น ๆ (โปรดระบุ)' }],
};

const buttonNamed = (name: string) => Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === name) as HTMLButtonElement | undefined;
const typeInto = (el: HTMLTextAreaElement, value: string) => act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
});

describe('ApproverCertificates: reason OTHER', () => {
    let container: HTMLDivElement;
    let root: Root;
    beforeEach(() => {
        jest.clearAllMocks();
        mockRequest.mockImplementation(async (_path, init) => (init?.method === 'POST' ? { success: true } : { success: true, data: payload }));
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
    });

    it('revoking with OTHER sends the typed reason, trimmed', async () => {
        await act(async () => { root.render(<ApproverCertificates />); });
        act(() => { buttonNamed('เพิกถอน')!.click(); });
        act(() => { (document.querySelector('input[value="OTHER"]') as HTMLInputElement).click(); });
        expect(buttonNamed('ยืนยันเพิกถอน')!.disabled).toBe(true);
        typeInto(Array.from(document.querySelectorAll('textarea')).find((t) => t.required)!, '  ผู้ถือย้ายแปลงโดยไม่แจ้งกรม  ');
        await act(async () => { buttonNamed('ยืนยันเพิกถอน')!.click(); });
        const post = mockRequest.mock.calls.find(([, init]) => init?.method === 'POST')!;
        expect(post[0]).toContain('cert-1');
        expect(JSON.parse(String(post[1]?.body))).toEqual({ reasonCode: 'OTHER', reasonText: 'ผู้ถือย้ายแปลงโดยไม่แจ้งกรม', note: '' });
    });

    it('a stored reason with markup is shown as text', async () => {
        await act(async () => { root.render(<ApproverCertificates />); });
        expect(container.textContent).toContain(`เหตุที่เพิกถอน: ${markup}`);
        expect(container.querySelector('li b, li img')).toBeNull();
    });
});

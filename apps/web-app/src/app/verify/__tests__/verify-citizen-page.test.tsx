/**
 * /verify is the page a citizen opens (operator order 37, 2026-10-07): one
 * certificate-number field, a camera QR scan, and a legend of the five answers.
 * The developer tools (JSON payload, hash, public key, trust registry,
 * revocation list, trace events) live on /verify/technical, not here.
 */

import * as React from 'react';
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {

    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const push = jest.fn();
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push, replace: jest.fn(), refresh: jest.fn(), back: jest.fn(), forward: jest.fn(), prefetch: jest.fn() }),
    usePathname: () => '/verify',
    useSearchParams: () => new URLSearchParams(),
}));

import VerifyPage from '../page';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
        root = createRoot(container);
        root.render(<VerifyPage />);
    });
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    push.mockClear();
});

function type(value: string) {
    const input = container.querySelector('#certificate-number') as HTMLInputElement;
    act(() => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => {
        input.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
}

function buttonNamed(name: string): HTMLButtonElement | undefined {
    return Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === name);
}

describe('/verify for a citizen', () => {
    it('has exactly one text field, labelled, with the new-format example', () => {
        const inputs = container.querySelectorAll('input');
        expect(inputs).toHaveLength(1);
        const input = inputs[0];
        const label = container.querySelector(`label[for="${input.id}"]`);
        expect(label?.textContent).toContain('เลขที่ใบรับรอง');
        expect(container.textContent).toContain('TH-GACP 1/2569');
    });

    it('has a scan-QR button next to the field', () => {
        expect(buttonNamed('สแกน QR')).toBeDefined();
    });

    it('does not carry the developer tools', () => {
        expect(container.querySelectorAll('textarea')).toHaveLength(0);
        expect(container.querySelectorAll('select')).toHaveLength(0);
        const text = container.textContent ?? '';
        for (const tool of ['JSON', 'ค่าแฮช', 'กุญแจสาธารณะ', 'ทะเบียนความเชื่อถือ', 'รายการเพิกถอน', 'เหตุการณ์ตรวจสอบย้อนกลับ', 'PLANT_UNIT']) {
            expect(text).not.toContain(tool);
        }
    });

    it('explains the five answers in words', () => {
        const legend = container.querySelector('section[aria-labelledby="verify-legend-heading"]')?.textContent ?? '';
        for (const word of ['ใช้ได้', 'หมดอายุ', 'ถูกพักใช้', 'ถูกเพิกถอน', 'ไม่พบเลขนี้']) {
            expect(legend).toContain(word);
        }
    });

    it('sends the new-format number as its URL slug', () => {
        type('TH-GACP 1/2569');
        expect(push).toHaveBeenCalledWith('/verify/TH-GACP-1-2569');
    });

    it('accepts the legacy register and printed forms unchanged', () => {
        type('GACP-TH-2568-A3F7B2');
        expect(push).toHaveBeenLastCalledWith('/verify/GACP-TH-2568-A3F7B2');
        type('  GACP-DTAM-2569-A3F7B2 ');
        expect(push).toHaveBeenLastCalledWith('/verify/GACP-DTAM-2569-A3F7B2');
    });

    it('an empty field names what is missing and does not navigate', () => {
        type('   ');
        expect(push).not.toHaveBeenCalled();
        expect(container.querySelector('[role="alert"]')?.textContent).toContain('กรุณาพิมพ์เลขที่ใบรับรอง');
    });

    it('without a camera API the scan button falls back to typing, in words', () => {
        const original = navigator.mediaDevices;
        Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
        try {
            act(() => buttonNamed('สแกน QR')!.click());
            expect(container.querySelector('[role="alert"]')?.textContent).toContain('พิมพ์เลขที่ใบรับรองในช่องด้านบนแทน');
            expect(document.activeElement).toBe(container.querySelector('#certificate-number'));
        } finally {
            Object.defineProperty(navigator, 'mediaDevices', { value: original, configurable: true });
        }
    });
});

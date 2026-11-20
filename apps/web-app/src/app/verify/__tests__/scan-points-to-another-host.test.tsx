/**
 * Security review L3: a scanned QR that points to another host is not opened silently. The
 * page names that host and offers the same check on this site; a QR of this site opens at once.
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

const mockScanned = jest.fn<() => Promise<string>>();
jest.mock('@/lib/verify/qr-camera', () => ({
    cameraSupported: () => true,
    scanQrFromCamera: () => mockScanned(),
}));

import { CertificateLookup } from '../certificate-lookup';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
        root = createRoot(container);
        root.render(<CertificateLookup />);
    });
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    push.mockClear();
    mockScanned.mockReset();
});

const button = (name: string) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === name);

async function scan(text: string) {
    mockScanned.mockResolvedValue(text);
    act(() => button('สแกน QR')!.click());
    for (let i = 0; i < 10; i++) {
        await act(async () => { await Promise.resolve(); });
    }
}

describe('a scanned QR and the host it points to', () => {
    it(`a QR of this site (${window.location.host}) opens its page at once`, async () => {
        await scan(`http://${window.location.host}/verify/TH-GACP-1-2569`);
        expect(push).toHaveBeenCalledWith('/verify/TH-GACP-1-2569');
        expect(container.textContent).not.toContain('เว็บไซต์อื่น');
    });

    it('a QR of another host is not opened; the page names the host and offers this site instead', async () => {
        await scan('https://evil.example/verify/TH-GACP-1-2569');
        expect(push).not.toHaveBeenCalled();
        const notice = container.querySelector('[role="alert"]')?.textContent ?? '';
        expect(notice).toContain('evil.example');
        expect(notice).toContain('ไม่ใช่เว็บไซต์นี้');
        act(() => button('ตรวจสอบบนเว็บไซต์นี้')!.click());
        expect(push).toHaveBeenCalledWith('/verify/TH-GACP-1-2569');
    });

    it('a QR that is no GACP link at all is refused in words', async () => {
        await scan('javascript:alert(1)');
        expect(push).not.toHaveBeenCalled();
        expect(container.querySelector('[role="alert"]')?.textContent).toContain('QR นี้ไม่ใช่ QR ของใบรับรองหรือสินค้า GACP');
    });
});

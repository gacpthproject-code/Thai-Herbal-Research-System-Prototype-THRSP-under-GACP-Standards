/**
 * The renewal page explains and links; it creates nothing.
 *
 * A renewal is filed through the normal wizard as requestType RENEWAL (short document
 * check, then the renewal fee after the documents pass, then the site visit). The old page
 * created a renewal application the moment it opened (POST /api/applications/renewals,
 * now deleted) and walked the applicant through a quotation, an invoice and a payment
 * step that could not take money. Opening this page must not write anything.
 */

import * as React from 'react';
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import RenewalPage from '../client-view';
import { LanguageProvider } from '@/lib/i18n/language-context';
import { th } from '@/lib/i18n/dictionaries/th';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type ApiResult = { success: boolean; data?: unknown; status?: number; error?: string };
const mockGet = jest.fn<(url: string) => Promise<ApiResult>>();
const mockPost = jest.fn();
let mockSearch = 'certId=cert-42';

jest.mock('@/lib/api', () => ({
    apiClient: {
        get: (url: string) => mockGet(url),
        post: (...args: unknown[]) => mockPost(...args),
    },
}));
jest.mock('@/lib/services/auth-service-session', () => ({
    getStoredUser: jest.fn(() => ({ id: 'u-1' })),
}));
jest.mock('next/navigation', () => ({
    useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
    useSearchParams: () => new URLSearchParams(mockSearch),
}));

const CERT = {
    id: 'cert-42',
    certificateNumber: 'TH-GACP 87/2568',
    farmName: 'ฟาร์มต่ออายุ',
    holderDisplayName: 'บริษัท สมุนไพรไทย จำกัด',
    cropType: 'กัญชา',
    province: 'เชียงใหม่',
    expiryDate: '2026-12-31T00:00:00.000Z',
    status: 'active',
};

const copy = th.health.renewal;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockSearch = 'certId=cert-42';
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

async function mount() {
    act(() => {
        root.render(<LanguageProvider><RenewalPage /></LanguageProvider>);
    });
    await act(async () => { for (let i = 0; i < 5; i += 1) { await Promise.resolve(); } });
}

describe('opening the renewal page', () => {
    it('reads the certificate and writes nothing', async () => {
        mockGet.mockResolvedValue({ success: true, data: CERT });
        await mount();
        expect(mockGet).toHaveBeenCalledWith('/api/certificates/cert-42');
        expect(mockPost).not.toHaveBeenCalled();
    });

    it('shows the certificate and the three steps in order', async () => {
        mockGet.mockResolvedValue({ success: true, data: CERT });
        await mount();
        const text = container.textContent ?? '';
        expect(text).toContain('TH-GACP 87/2568');
        expect(text).toContain('ฟาร์มต่ออายุ');
        const positions = copy.steps.map((step) => text.indexOf(step.title));
        expect(positions.every((p) => p >= 0)).toBe(true);
        expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    });

    it('one button starts the wizard with the certificate number', async () => {
        mockGet.mockResolvedValue({ success: true, data: CERT });
        await mount();
        const start = Array.from(container.querySelectorAll('a')).find((a) => a.textContent === 'เริ่มยื่นต่ออายุ');
        expect(start?.getAttribute('href')).toBe(`/health/applications/new?renew=${encodeURIComponent('TH-GACP 87/2568')}`);
    });

    it('carries no "cannot pay" banner, no mail link, and no quotation, invoice or payment step', async () => {
        mockGet.mockResolvedValue({ success: true, data: CERT });
        await mount();
        const html = container.innerHTML;
        expect(html).not.toContain('renewal-advisory-banner');
        expect(html).not.toContain('mailto:');
        expect(html).not.toContain('ใบเสนอราคา');
        expect(html).not.toContain('ใบแจ้งหนี้');
        expect(html).not.toContain('ยังชำระ');
    });
});

describe('when the certificate cannot be shown', () => {
    it('a failed read offers a retry that reads again, never a verdict', async () => {
        mockGet.mockResolvedValueOnce({ success: false, status: 503 }).mockResolvedValueOnce({ success: true, data: CERT });
        await mount();
        expect(container.querySelector('[data-testid="renewal-load-error"]')).not.toBeNull();
        const retry = container.querySelector<HTMLButtonElement>('[data-testid="renewal-load-retry"]')!;
        await act(async () => { retry.click(); for (let i = 0; i < 5; i += 1) { await Promise.resolve(); } });
        expect(mockGet).toHaveBeenCalledTimes(2);
        expect(container.textContent).toContain('TH-GACP 87/2568');
    });

    it('a 404 says the certificate was not found and points to the certificate list', async () => {
        mockGet.mockResolvedValue({ success: false, status: 404 });
        await mount();
        expect(container.textContent).toContain(copy.errorNoCert);
        expect(container.querySelector('a[href="/health/certificates"]')).not.toBeNull();
    });

    it('without ?certId= asks the applicant to pick a certificate first', async () => {
        mockSearch = '';
        await mount();
        expect(mockGet).not.toHaveBeenCalled();
        expect(container.textContent).toContain(copy.noCertBody);
    });
});

/**
 * รอบแก้ 3 ข้อ 4 (รีวิว L1 ของ 97d7ea80e) — กดลิงก์ "ดูรายละเอียด" ของแจ้งเตือนที่ยังไม่อ่าน
 * ต้องทั้งพาไปหน้าปลายทางและบันทึกว่าอ่านแล้ว (PUT /notifications/:id/read)
 *
 * ก่อนหน้านี้ primitive Button สาขา href ทิ้ง onClick จึงไม่มีใครเห็นว่า stopPropagation บนลิงก์
 * ตัดการเรียก markAsRead ของแถว · เมื่อ cc39a8a60 ส่ง props ให้ <a> จริง การกดลิงก์จึงไม่บันทึกอ่านอีก
 */

import * as React from 'react';
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {

    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ROW = {
    id: 'n-1', title: 'ผู้อนุมัติส่งกลับให้ทบทวน', message: 'ทดสอบ', type: 'INFO', read: false, isRead: false,
    createdAt: new Date().toISOString(), actionUrl: '/provider/audits/app-1', kind: 'GENERAL', priority: 2, metadata: {},
};
const mockApiGet = jest.fn<(url: string) => Promise<unknown>>(async () => ({ success: true, data: [ROW] }));
const mockApiPut = jest.fn<(url: string, body: unknown, options?: unknown) => Promise<unknown>>(async () => ({ success: true }));
jest.mock('@/lib/api', () => ({
    apiClient: { get: (url: string) => mockApiGet(url), put: (url: string, body: unknown, options?: unknown) => mockApiPut(url, body, options) },
    api: { get: (url: string) => mockApiGet(url), put: (url: string, body: unknown, options?: unknown) => mockApiPut(url, body, options) },
}));
jest.mock('@/lib/services/auth-service', () => ({
    AuthService: { getUser: () => ({ id: 'user-1', role: 'field_inspector', email: 'u@test' }) },
}));
jest.mock('next/navigation', () => {
    const router = { push: jest.fn(), replace: jest.fn(), refresh: jest.fn(), back: jest.fn(), forward: jest.fn(), prefetch: jest.fn(), pathname: '/', query: {} };
    return { useRouter: () => router, usePathname: () => '/', useSearchParams: () => new URLSearchParams() };
});

import View from '../client-view';
import { LanguageProvider } from '@/lib/i18n/language-context';

describe('provider/notifications — ลิงก์ "ดูรายละเอียด" บันทึกว่าอ่านแล้ว', () => {
    let container: HTMLDivElement | null = null;
    let root: Root | null = null;

    beforeEach(() => { jest.clearAllMocks(); });
    afterEach(() => {
        if (root) { act(() => { root?.unmount(); }); root = null; }
        if (container) { container.remove(); container = null; }
    });

    async function mount() {
        container = document.createElement('div');
        document.body.appendChild(container);
        act(() => { root = createRoot(container!); root.render(<LanguageProvider><View /></LanguageProvider>); });
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    }

    it('กดลิงก์ของแจ้งเตือนที่ยังไม่อ่าน → PUT /notifications/n-1/read หนึ่งครั้ง และลิงก์ยังเป็น <a href> ไปหน้าปลายทาง', async () => {
        await mount();
        const link = container!.querySelector<HTMLAnchorElement>('a[href="/provider/audits/app-1"]');
        expect(link).not.toBeNull();
        await act(async () => {
            link!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            await Promise.resolve();
        });
        expect(mockApiPut.mock.calls.map((c) => c[0])).toEqual(['/notifications/n-1/read']);
    });

    it('กดลิงก์ของแจ้งเตือนที่อ่านแล้ว → ไม่ PUT ซ้ำ', async () => {
        mockApiGet.mockResolvedValueOnce({ success: true, data: [{ ...ROW, read: true, isRead: true }] });
        await mount();
        const link = container!.querySelector<HTMLAnchorElement>('a[href="/provider/audits/app-1"]');
        expect(link).not.toBeNull();
        await act(async () => {
            link!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            await Promise.resolve();
        });
        expect(mockApiPut).not.toHaveBeenCalled();
    });
});

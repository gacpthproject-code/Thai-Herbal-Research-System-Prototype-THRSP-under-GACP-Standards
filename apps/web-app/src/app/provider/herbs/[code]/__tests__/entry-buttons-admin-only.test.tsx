/**
 * /provider/herbs/[code] shows "เพิ่มรายการ" and "นำเข้าจำนวนมาก" only to the
 * role the backend accepts on POST /api/herbs/:code/entries and
 * /entries/import (requireAdmin = SYSTEM_ADMIN_DTAM). A field inspector used
 * to see both buttons and get a 403 after filling the form.
 *
 * Rendered with createRoot + act (repo convention); the page learns its role
 * from /auth/provider/me like the other provider pages.
 */

import * as React from 'react';
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type ApiResult = { success: boolean; data?: unknown; error?: string };
const mockGet = jest.fn<(url: string) => Promise<ApiResult>>();
jest.mock('@/lib/api/api-client', () => ({
    apiClient: { get: (url: string) => mockGet(url), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

jest.mock('sonner', () => ({
    toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));

jest.mock('next/navigation', () => ({
    useParams: () => ({ code: 'TURMERIC' }),
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
    usePathname: () => '/provider/herbs/TURMERIC',
    useSearchParams: () => new URLSearchParams(),
}));

jest.mock('../../../components/provider-layout', () => {
    const Passthrough = ({ children }: { children: React.ReactNode }) => <>{children}</>;
    Passthrough.displayName = 'MockProviderLayout';
    return { __esModule: true, default: Passthrough };
});

import ProviderHerbEntriesPage from '../page';

const ENTRY = {
    id: 'e1', category: 'ACTIVE_COMPOUND', title: 'เกณฑ์ปริมาณ curcuminoids', content: 'ไม่น้อยกว่า 5.0%',
    valueNumber: 5, unit: '% w/w', source: 'ตำรามาตรฐานยาสมุนไพรไทย 2021 ขมิ้นชัน · https://bdn-thp.dmsc.moph.go.th/ebook/x · เข้าถึง 2026-10-28',
};

describe('/provider/herbs/[code] — add and import buttons follow the backend\'s admin gate', () => {
    let container: HTMLDivElement | null = null;
    let root: Root | null = null;

    beforeEach(() => jest.clearAllMocks());

    afterEach(() => {
        if (root) {
            act(() => { root?.unmount(); });
            root = null;
        }
        container?.remove();
        container = null;
        document.body.innerHTML = '';
    });

    async function mountAs(role: string) {
        mockGet.mockImplementation(async (url: string) => {
            if (url === '/auth/provider/me') { return { success: true, data: { id: 'u1', role, canonicalRole: role } }; }
            if (url.startsWith('/api/herbs/TURMERIC/entries')) { return { success: true, data: { total: 1, entries: [ENTRY] } }; }
            if (url === '/api/herbs/TURMERIC') { return { success: true, data: { nameTH: 'ขมิ้นชัน' } }; }
            return { success: false, error: `unexpected ${url}` };
        });
        container = document.createElement('div');
        document.body.appendChild(container);
        act(() => {
            root = createRoot(container!);
            root.render(<ProviderHerbEntriesPage />);
        });
        for (let i = 0; i < 20; i++) {
            await act(async () => { await Promise.resolve(); });
        }
    }

    const buttonTexts = () => Array.from(container!.querySelectorAll('button')).map((b) => b.textContent?.trim() ?? '');

    it('a field inspector sees the entries but neither write button', async () => {
        await mountAs('field_inspector');
        expect(container!.textContent).toContain('เกณฑ์ปริมาณ curcuminoids');
        expect(buttonTexts()).not.toEqual(expect.arrayContaining([expect.stringContaining('เพิ่มรายการ')]));
        expect(buttonTexts()).not.toEqual(expect.arrayContaining([expect.stringContaining('นำเข้าจำนวนมาก')]));
    });

    it('the DTAM system admin sees both write buttons', async () => {
        await mountAs('system_admin_dtam');
        expect(buttonTexts()).toEqual(expect.arrayContaining([expect.stringContaining('เพิ่มรายการ'), expect.stringContaining('นำเข้าจำนวนมาก')]));
    });
});

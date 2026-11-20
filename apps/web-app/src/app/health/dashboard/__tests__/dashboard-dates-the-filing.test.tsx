import * as React from 'react';
import { describe, expect, it, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

declare global {

    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockApiGet = jest.fn<(url: string) => Promise<unknown>>();
jest.mock('@/lib/api/api-client', () => ({
    apiClient: { get: (url: string) => mockApiGet(url) },
    api: { get: (url: string) => mockApiGet(url) },
}));

jest.mock('@/lib/services/auth-service', () => ({
    AuthService: {
        getUser: () => ({
            id: 'user-1',
            role: 'HEALTH',
            email: 'farmer@test',
            firstName: 'Farmer',
            lastName: 'Test',
        }),
    },
}));

jest.mock('next/navigation', () => {
    const router = {
        push: jest.fn(),
        replace: jest.fn(),
        refresh: jest.fn(),
        back: jest.fn(),
        forward: jest.fn(),
        prefetch: jest.fn(),
        pathname: '/',
        query: {},
    };
    const searchParams = new URLSearchParams();
    return {
        useRouter: () => router,
        usePathname: () => '/',
        useSearchParams: () => searchParams,
    };
});

import HealthDashboardPage from '../client-view';
import { LanguageProvider } from '@/lib/i18n/language-context';


const app = (id: string, status: string, submittedAt: string | null) => ({
    id, applicationNumber: `APP-${id}`, plantName: `พืช ${id}`, status, submittedAt, createdAt: '2026-09-27T03:00:00.000Z',
});

describe('the dashboard recent list dates the filing, never the draft', () => {
    it('shows the filing day, or says the row has none', async () => {
        mockApiGet.mockResolvedValue({
            success: true,
            data: [app('FILED', 'SUBMITTED', '2026-10-06T03:00:00.000Z'), app('DRAFT', 'DRAFT', null), app('LEGACY', 'ASSIGNED_FOR_REVIEW', null)],
        });
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        await act(async () => {
            root.render(<LanguageProvider><HealthDashboardPage /></LanguageProvider>);
        });
        await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
        const line = (id: string) =>
            Array.from(container.querySelectorAll('div')).find((d) => d.children.length === 0 && d.textContent?.startsWith(`APP-${id} · `))?.textContent || '';

        expect(line('FILED')).toBe('APP-FILED · 6/10/2569');
        expect(line('DRAFT')).toBe('APP-DRAFT · ยังไม่ได้ยื่น');
        expect(line('LEGACY')).toBe('APP-LEGACY · ไม่มีบันทึกวันที่ยื่น');

        act(() => root.unmount());
        container.remove();
    });
});

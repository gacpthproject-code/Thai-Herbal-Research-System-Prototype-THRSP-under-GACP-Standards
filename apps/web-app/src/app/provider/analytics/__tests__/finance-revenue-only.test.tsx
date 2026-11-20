/**
 * Order 29: finance reads the revenue part of the analytics only. The server answers a
 * finance role with { period, financial, dailyStats: [{ date, revenue }] }; the page shows
 * that, and does not crash reading the applicant, workflow and province sections it is not sent.
 */

import * as React from 'react';
import { describe, expect, it, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../components/provider-layout', () => ({
    __esModule: true,
    default: ({ children, title }: { children: React.ReactNode; title?: React.ReactNode }) => (
        <div data-testid="provider-layout">{title}{children}</div>
    ),
}));
jest.mock('next/navigation', () => ({
    usePathname: () => '/provider/analytics',
    useRouter: () => ({ push: () => undefined, replace: () => undefined, prefetch: () => undefined }),
    useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/i18n/language-context', () => ({ useLanguage: () => ({ dict: {} }) }));
jest.mock('@/lib/api/api-client', () => ({
    apiClient: {
        get: () => Promise.resolve({
            success: true,
            data: {
                period: '30',
                financial: { revenue: 11770, pending: 0, refunded: 5885, trend: 0 },
                dailyStats: [{ date: '2026-10-08', revenue: 11770 }],
            },
        }),
    },
}));

import AnalyticsPage from '../page';

describe('analytics page for a finance role', () => {
    it('renders the revenue figures net of credit notes and nothing else', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        await act(async () => { root.render(<AnalyticsPage />); });
        await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
        const text = container.textContent || '';
        expect(container.querySelector('[data-testid="revenue-only-analytics"]')).not.toBeNull();
        expect(text).toContain('รายรับสุทธิ');
        expect(text).toContain('11,770');
        expect(text).toContain('5,885');
        expect(text).not.toMatch(/Total Applications|Active Farmers/);
        await act(async () => { root.unmount(); });
    });
});

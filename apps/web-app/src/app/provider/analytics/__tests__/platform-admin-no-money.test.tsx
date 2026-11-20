/**
 * Order 47 (operator 2026-10-08): the platform admin reads no finance. The server answers it
 * with the whole analytics except `financial` and the daily revenue; the page renders that
 * and shows no money card or column.
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
                applications: { total: 3, new: 1, renewal: 2, approved: 1, rejected: 1, pending: 1, trend: 0 },
                users: { totalApplicants: 50, newApplicants: 1, activeCertificates: 7, trend: 0 },
                performance: { avgProcessingDays: 2, avgAuditDays: 3, satisfactionRate: 4 },
                dailyStats: [{ date: '2026-10-08', applications: 2, approved: 1 }],
                plantTypeDistribution: [],
                topProvinces: [],
            },
        }),
    },
}));

import AnalyticsPage from '../page';

describe('analytics page for the platform admin', () => {
    it('renders the work figures and no money', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        await act(async () => { root.render(<AnalyticsPage />); });
        await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
        const text = container.textContent || '';
        expect(text).toContain('Total Applications');
        expect(text).toContain('Active Farmers');
        expect(text).not.toMatch(/Total Revenue|Revenue|฿/);
        await act(async () => { root.unmount(); });
    });
});

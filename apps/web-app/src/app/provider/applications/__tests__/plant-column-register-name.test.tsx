/**
 * The plant column shows the register's Thai name the list endpoint sends (`plantName`), and
 * falls back to the filing's own reference only when the register has no name for it.
 *
 * Staging walk ccc4f707d (F5): the column read turmeric / ginger / kratom / plai /
 * black_galangal, the wizard slugs, on the reviewer's and the DTAM admin's lists.
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
    default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('next/navigation', () => ({
    usePathname: () => '/provider/applications',
    useRouter: () => ({ push: () => undefined, replace: () => undefined, prefetch: () => undefined }),
    useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/i18n/language-context', () => ({ useLanguage: () => ({ dict: {} }) }));

const row = (id: string, plantType: string, plantName: string | null) => ({
    id, applicantName: `ผู้ยื่น ${id}`, plantType, plantName, status: 'SUBMITTED', workflowState: 'SUBMITTED',
    submittedAt: '2026-10-06T03:00:00.000Z', createdAt: '2026-09-27T03:00:00.000Z', holder: null, assignment: null,
});
jest.mock('@/lib/api/api-client', () => ({
    apiClient: {
        get: () => Promise.resolve({
            success: true,
            data: { applications: [row('named000-1', 'turmeric', 'ขมิ้นชัน'), row('unnamed0-2', 'durian', null)] },
        }),
    },
}));

import ProviderApplicationsPage from '../page';

const rowText = (container: HTMLElement, idPrefix: string) =>
    Array.from(container.querySelectorAll('tr')).find((tr) => tr.textContent?.includes(idPrefix))?.textContent || '';

describe('staff list plant column (F5)', () => {
    it('shows the register name, and the stored reference only when the register has none', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        await act(async () => { root.render(<ProviderApplicationsPage />); });
        await act(async () => { await Promise.resolve(); });

        expect(rowText(container, 'named000')).toContain('ขมิ้นชัน');
        expect(rowText(container, 'named000')).not.toContain('turmeric');
        expect(rowText(container, 'unnamed0')).toContain('durian');

        act(() => { root.unmount(); });
        container.remove();
    });
});

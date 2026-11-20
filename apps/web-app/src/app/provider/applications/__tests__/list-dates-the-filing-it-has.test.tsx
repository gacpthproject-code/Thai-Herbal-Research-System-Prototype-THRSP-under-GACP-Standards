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

const row = (id: string, status: string, submittedAt: string | null) => ({
    id, applicantName: `ผู้ยื่น ${id}`, plantType: 'ขมิ้นชัน', status, workflowState: status,
    submittedAt, createdAt: '2026-09-27T03:00:00.000Z', holder: null, assignment: null,
});
jest.mock('@/lib/api/api-client', () => ({
    apiClient: {
        get: () => Promise.resolve({
            success: true,
            data: {
                applications: [
                    row('filed000-1', 'SUBMITTED', '2026-10-06T03:00:00.000Z'),
                    row('legacy00-2', 'ASSIGNED_FOR_REVIEW', null),
                    row('draft000-3', 'DRAFT', null),
                ],
            },
        }),
    },
}));

import ProviderApplicationsPage from '../page';

const rowText = (container: HTMLElement, idPrefix: string) =>
    Array.from(container.querySelectorAll('tr')).find((tr) => tr.textContent?.includes(idPrefix))?.textContent || '';

describe('staff application list: filing date', () => {
    it('prints the filing day, and no invented day for rows without one', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        await act(async () => { root.render(<ProviderApplicationsPage />); });
        await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

        expect(rowText(container, 'filed000')).toContain('6 ต.ค. 69');

        const legacy = rowText(container, 'legacy00');
        expect(legacy).toContain('ไม่มีบันทึกวันที่ยื่น');
        expect(legacy).not.toContain('27 ก.ย.');

        const draft = rowText(container, 'draft000');
        expect(draft).toContain('ยังไม่ได้ยื่น');
        expect(draft).not.toContain('27 ก.ย.');

        await act(async () => { root.unmount(); });
        container.remove();
    });
});

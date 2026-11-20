import * as React from 'react';
import { describe, expect, it, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockApp: Record<string, unknown> = {};
jest.mock('@/lib/api/api-client', () => ({
    apiClient: { get: () => Promise.resolve({ success: true, data: mockApp }) },
}));
jest.mock('next/navigation', () => ({
    useParams: () => ({ id: 'app-1' }),
    useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined, prefetch: () => undefined }),
    usePathname: () => '/admin/applications/app-1/force-status',
    useSearchParams: () => new URLSearchParams(),
}));

import ForceStatusPage from '../page';

async function filedLine(app: Record<string, unknown>): Promise<string> {
    mockApp = { id: 'app-1', applicationNumber: 'APP-1', updatedAt: '2026-10-29T03:00:00.000Z', ...app };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => { root.render(<ForceStatusPage />); });
    await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
    const text = container.textContent || '';
    act(() => root.unmount());
    container.remove();
    return text;
}

describe('force-status page: filing date', () => {
    it('a draft says it was not filed', async () => {
        expect(await filedLine({ status: 'DRAFT', submittedAt: null })).toContain('ยื่นเมื่อยังไม่ได้ยื่น');
    });

    it('a filed row with no stamp says the day is not recorded', async () => {
        expect(await filedLine({ status: 'ASSIGNED_FOR_REVIEW', submittedAt: null })).toContain('ยื่นเมื่อไม่มีบันทึกวันที่ยื่น');
    });
});

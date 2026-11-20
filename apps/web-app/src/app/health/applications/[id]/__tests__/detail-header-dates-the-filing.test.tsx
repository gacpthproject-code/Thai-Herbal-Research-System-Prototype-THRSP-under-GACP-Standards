import * as React from 'react';
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { COMPANY } from '@/components/holder/__tests__/fixtures';
import type { EntityMembership } from '@/lib/services/my-entities-provider';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Envelope = { success: boolean; data?: unknown; error?: string };
const mockGet = jest.fn<(path: string) => Promise<Envelope>>();
let mockEntities: EntityMembership[] = [];
jest.mock('@/lib/api/api-client', () => {
    const api = { get: (path: string) => mockGet(path), post: jest.fn(), getBlob: jest.fn() };
    return { api, apiClient: api, ApiClient: function ApiClient() {} };
});
jest.mock('@/lib/api', () => {
    const api = { get: (path: string) => mockGet(path), post: jest.fn(), getBlob: jest.fn() };
    return { api, apiClient: api };
});
const mockRouter = { push: jest.fn(), replace: jest.fn(), refresh: jest.fn(), back: jest.fn(), prefetch: jest.fn() };
const mockParams = { id: 'app-1' };
jest.mock('next/navigation', () => ({
    useParams: () => mockParams,
    useRouter: () => mockRouter,
    usePathname: () => '/health/applications/app-1',
    useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/services/auth-service-session', () => ({ getStoredUser: () => ({ id: 'user-1', role: 'HEALTH' }) }));
jest.mock('@/lib/services/my-entities-provider', () => ({
    useMyEntities: () => ({ entities: mockEntities, isLoading: false, error: null, refresh: async () => {} }),
}));

import ApplicationDetailPage from '../client-view';


let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
    mockGet.mockReset();
    mockEntities = [COMPANY];
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

async function headerLine(status: string, submittedAt: string | null): Promise<string> {
    mockGet.mockImplementation(async (path: string) => {
        if (path.includes('/status')) return { success: true, data: { displayStatus: status, workflowState: status } };
        if (path.includes('/history')) return { success: false };
        if (path.includes('/applications/app-1')) {
            return { success: true, data: { id: 'app-1', applicationId: 'app-1', applicationNumber: 'APP-1', status, entityId: 'e-company', submittedAt, createdAt: '2026-09-27T03:00:00.000Z', updatedAt: '2026-10-01T03:00:00.000Z' } };
        }
        return { success: false, error: 'unrouted ' + path };
    });
    await act(async () => { root.render(<ApplicationDetailPage />); });
    for (let i = 0; i < 4; i += 1) { await act(async () => { await Promise.resolve(); }); }
    return container.querySelector('[data-testid="filing-date"]')?.textContent || '';
}

describe('the detail header dates the filing, never the draft', () => {
    it('a filed application shows the day it was filed', async () => {
        expect(await headerLine('SUBMITTED', '2026-10-06T03:00:00.000Z')).toBe('ยื่นเมื่อ 6 ต.ค. 2569');
    });

    it('a draft says it was not filed and shows no creation day', async () => {
        expect(await headerLine('DRAFT', null)).toBe('ยังไม่ได้ยื่น');
    });

    it('a filed row with no stamp says the day is not recorded', async () => {
        expect(await headerLine('ASSIGNED_FOR_REVIEW', null)).toBe('ไม่มีบันทึกวันที่ยื่น');
    });
});

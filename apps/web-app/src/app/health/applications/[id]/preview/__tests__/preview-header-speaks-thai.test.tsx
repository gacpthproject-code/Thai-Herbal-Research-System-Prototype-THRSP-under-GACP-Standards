import * as React from 'react';
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Envelope = { success: boolean; data?: unknown; error?: string };
const mockGet = jest.fn<(path: string) => Promise<Envelope>>();
jest.mock('@/lib/api', () => {
    const api = { get: (path: string) => mockGet(path), post: jest.fn(), getBlob: jest.fn() };
    return { api, apiClient: api };
});
jest.mock('next/navigation', () => ({
    useParams: () => ({ id: 'app-1' }),
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
}));
jest.mock('@/lib/services/auth-service-session', () => ({
    getStoredUser: () => ({ id: 'user-1', role: 'HEALTH' }),
    getStoredAccessToken: () => 'token',
}));

import ApplicationPreviewPage from '../client-view';

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
    mockGet.mockReset();
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

async function header(application: Record<string, unknown>): Promise<string> {
    mockGet.mockImplementation(async (path: string) => {
        if (path.endsWith('/katorlor1')) return { success: true, data: { html: '<p>form</p>' } };
        return { success: true, data: { id: 'app-1', applicationNumber: 'APP-1', ...application } };
    });
    await act(async () => { root.render(<ApplicationPreviewPage />); });
    for (let i = 0; i < 4; i += 1) { await act(async () => { await Promise.resolve(); }); }
    return container.querySelector('section')?.textContent ?? '';
}

describe('the preview header', () => {
    it('names a certified filing in Thai, as the detail page does', async () => {
        const text = await header({ status: 'CERTIFIED', createdAt: '2026-10-29T17:09:11.073Z', submittedAt: '2026-10-30T08:10:55.327Z' });
        expect(text).not.toContain('CERTIFIED');
        expect(text).toContain('สถานะ: ได้รับใบรับรอง GACP');
    });

    it('dates the filing by its submission, not the day the draft was opened', async () => {
        const text = await header({ status: 'CERTIFIED', createdAt: '2026-09-27T15:50:02.606Z', submittedAt: '2026-10-06T04:05:50.007Z' });
        expect(text).toContain('วันที่ยื่น 6 ตุลาคม 2569');
        expect(text).not.toContain('27 กันยายน 2569');
    });

    it('a draft says it has not been submitted', async () => {
        const text = await header({ status: 'DRAFT', createdAt: '2026-10-29T17:09:11.073Z', submittedAt: null });
        expect(text).toContain('ยังไม่ได้ยื่น');
        expect(text).not.toContain('วันที่ยื่น');
    });

    it('a filed application without a stamp says the day is not recorded', async () => {
        const text = await header({ status: 'ASSIGNED_FOR_REVIEW', createdAt: '2026-09-27T15:50:02.606Z', submittedAt: null });
        expect(text).toContain('ไม่มีบันทึกวันที่ยื่น');
        expect(text).not.toContain('ยังไม่ได้ยื่น');
    });
});

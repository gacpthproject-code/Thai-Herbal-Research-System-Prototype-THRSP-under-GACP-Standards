/**
 * A wizard that IndexedDB already holds is kept when the page hydrates.
 *
 * Found by the round-5 screenshot run of the success step (/step/12, 2026-10-09). IndexedDB held a
 * filed application with its plantId, yet the page asked GET /applications/draft, loaded the
 * applicant's other DRAFT over the store and told the applicant "ยังไม่ได้ยื่นคำขอ". When IndexedDB
 * answers before React hydrates, the hydration render reads the zustand store through its server
 * snapshot (the empty initial state) while the "IndexedDB has settled" flag already read true, so the
 * resume effect saw a settled, empty wizard and fetched a draft to fill it.
 *
 * The page is server-rendered and then hydrated here, the same order a real load takes.
 */

import * as React from 'react';
import { describe, expect, it, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
jest.setTimeout(30_000);

const FILED = 'app-filed-0001';
const OTHER_DRAFT = 'app-other-draft-0002';

jest.mock('@/lib/indexeddb-storage', () => {
    const persisted = new Map<string, string>([[
        'gacp_application_flow_state_v4',
        JSON.stringify({
            state: { applicationId: 'app-filed-0001', ownerUserId: 'user-1', plantId: 'cannabis', requestType: 'NEW' },
            version: 0,
        }),
    ]]);
    return {
        indexedDBStorage: {
            getItem: async (name: string) => persisted.get(name) ?? null,
            setItem: async (name: string, value: string) => { persisted.set(name, value); },
            removeItem: async (name: string) => { persisted.delete(name); },
        },
    };
});

const mockGet = jest.fn<(url: string, options?: unknown) => Promise<unknown>>();
jest.mock('@/lib/api/api-client', () => {
    const client = { get: (url: string, options?: unknown) => mockGet(url, options) };
    return { api: client, apiClient: client };
});

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
    useParams: () => ({ id: '12' }),
    notFound: jest.fn(),
}));

import ApplicationStepPage from '../application-step-page';
import { useWizardStoreBase } from '../../new/_steps/hooks/use-application-flow-store';

mockGet.mockImplementation(async (url: string) => {
    if (url.startsWith('/api/applications/config')) return { success: true, data: {} };
    if (url === '/applications/draft') {
        return { success: true, data: { id: OTHER_DRAFT, draftId: OTHER_DRAFT, status: 'DRAFT', entityId: 'entity-1', formData: { plantId: 'cannabis', requestType: 'NEW' } } };
    }
    if (url === `/applications/${FILED}`) return { success: true, data: { id: FILED, status: 'DOC_FEE_PAID', entityId: 'entity-1' } };
    if (url === `/applications/${OTHER_DRAFT}`) return { success: true, data: { id: OTHER_DRAFT, status: 'DRAFT', entityId: 'entity-1' } };
    if (url === '/dispatch-due') return { success: true, data: { dueWorkingDays: 1, effectiveFrom: '2026-10-06' } };
    return { success: false, error: `unexpected url in test: ${url}` };
});

async function flush(): Promise<void> {
    for (let round = 0; round < 6; round += 1) {
        await act(async () => {
            for (let i = 0; i < 20; i += 1) await Promise.resolve();
        });
    }
}

describe('the wizard page hydrates over a wizard IndexedDB already holds', () => {
    let root: Root | null = null;
    let container: HTMLDivElement | null = null;

    afterEach(() => {
        if (root) { act(() => root!.unmount()); }
        container?.remove();
        root = null;
        container = null;
    });

    it('keeps the filed application: no draft is fetched over it, and the success step judges the filed application', async () => {
        // A filing being corrected may open any slot; the success slot is where the defect was seen.
        window.sessionStorage.setItem('gacp_edit_mode', JSON.stringify({ isEditMode: true }));
        await flush();
        expect(useWizardStoreBase.getState().applicationId).toBe(FILED);

        container = document.createElement('div');
        container.innerHTML = renderToString(<ApplicationStepPage />);
        document.body.appendChild(container);
        await act(async () => { root = hydrateRoot(container!, <ApplicationStepPage />); });
        await flush();

        expect(mockGet.mock.calls.map(([url]) => url)).not.toContain('/applications/draft');
        expect(useWizardStoreBase.getState().applicationId).toBe(FILED);
        expect(container.textContent).toContain('คำขอเข้าสู่ขั้นตอนตรวจเอกสารแล้ว');
        expect(container.textContent).toContain('ตรวจสอบเอกสารเบื้องต้น');
        expect(container.textContent).not.toContain('ยังไม่ได้ยื่นคำขอ');
    });
});

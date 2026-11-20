/**
 * The success slot (/step/12) saves nothing, so it keeps saying the application was filed.
 *
 * Opening the slot changes the wizard store: the step number, and the holder the server names for
 * the application. The wizard's autosave then posted the filed application's id, the server refused
 * it (409 APPLICATION_NOT_EDITABLE), the autosave dropped the id and saved the answers as a draft, and
 * the screen turned to "ยังไม่ได้ยื่นคำขอ" about an application that had been filed and paid. The
 * payment slots (10, 12) show a filed application; the wizard has nothing to save there.
 */

import * as React from 'react';
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
jest.setTimeout(30_000);

const FILED = 'app-filed-0001';

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
const mockPost = jest.fn<(url: string, body?: unknown) => Promise<unknown>>();
jest.mock('@/lib/api/api-client', () => {
    const client = {
        get: (url: string, options?: unknown) => mockGet(url, options),
        post: (url: string, body?: unknown) => mockPost(url, body),
    };
    return { api: client, apiClient: client };
});

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
    usePathname: () => '/health/applications/new/step/12',
    useParams: () => ({ id: '12' }),
    notFound: jest.fn(),
}));

import ApplicationFlowLayout from '../../new/_steps/layout';
import ApplicationStepPage from '../application-step-page';
import { useWizardStoreBase } from '../../new/_steps/hooks/use-application-flow-store';

mockGet.mockImplementation(async (url: string) => {
    if (url.startsWith('/api/applications/config')) return { success: true, data: {} };
    if (url === '/applications/draft') return { success: true, data: null };
    if (url === `/applications/${FILED}`) return { success: true, data: { id: FILED, status: 'DOC_FEE_PAID', entityId: 'entity-1' } };
    if (url === '/dispatch-due') return { success: true, data: { dueWorkingDays: 1, effectiveFrom: '2026-10-06' } };
    if (url.startsWith('/applications/')) return { success: true, data: { status: 'DRAFT', entityId: 'entity-1' } };
    return { success: false, error: `unexpected url in test: ${url}` };
});
mockPost.mockImplementation(async (url: string, body?: unknown) => {
    const applicationId = (body as { applicationId?: string } | undefined)?.applicationId;
    if (url === '/applications/draft' && applicationId === FILED) {
        return { success: false, status: 409, code: 'APPLICATION_NOT_EDITABLE', errorCode: 'APPLICATION_NOT_EDITABLE', error: 'Application is not editable' };
    }
    if (url === '/applications/draft') return { success: true, data: { id: 'app-new-draft-0003', draftId: 'app-new-draft-0003', version: 1 } };
    return { success: false, error: `unexpected post in test: ${url}` };
});

async function flush(): Promise<void> {
    for (let round = 0; round < 6; round += 1) {
        await act(async () => {
            for (let i = 0; i < 20; i += 1) await Promise.resolve();
        });
    }
}

describe('the success slot saves nothing', () => {
    let root: Root | null = null;
    let container: HTMLDivElement | null = null;

    beforeEach(() => { jest.useFakeTimers(); });

    afterEach(() => {
        if (root) { act(() => root!.unmount()); }
        container?.remove();
        root = null;
        container = null;
        jest.useRealTimers();
    });

    it('keeps the filed application on screen: no draft save leaves the success slot', async () => {
        window.localStorage.setItem('user', JSON.stringify({ id: 'user-1', role: 'health' }));
        window.sessionStorage.setItem('gacp_edit_mode', JSON.stringify({ isEditMode: true }));
        await flush();
        expect(useWizardStoreBase.getState().applicationId).toBe(FILED);

        container = document.createElement('div');
        document.body.appendChild(container);
        await act(async () => {
            root = createRoot(container!);
            root.render(<ApplicationFlowLayout><ApplicationStepPage /></ApplicationFlowLayout>);
        });
        await flush();
        expect(container.textContent).toContain('ตรวจสอบเอกสารเบื้องต้น');

        for (let debounce = 0; debounce < 3; debounce += 1) {
            await act(async () => { jest.advanceTimersByTime(3500); });
            await flush();
        }

        expect(mockPost.mock.calls.filter(([url]) => url === '/applications/draft')).toEqual([]);
        expect(useWizardStoreBase.getState().applicationId).toBe(FILED);
        expect(container.textContent).toContain('คำขอเข้าสู่ขั้นตอนตรวจเอกสารแล้ว');
        expect(container.textContent).toContain('ตรวจสอบเอกสารเบื้องต้น');
        expect(container.textContent).not.toContain('ยังไม่ได้ยื่นคำขอ');
        // A change on the slot is not an edit: no "unsaved" pill either.
        expect(container.textContent).not.toContain('รอบันทึก');
    });
});

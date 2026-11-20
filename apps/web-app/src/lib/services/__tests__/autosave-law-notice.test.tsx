/**
 * The save reply's `lawNotice` is what the layout shows when a renewal was recorded as
 * ขอใหม่. This runs the real autosave hook and the real store with only `fetch` stubbed,
 * and pins that the notice reaches the hook's state from the reply, and leaves it again
 * when a later reply carries none (the applicant fixed the number).
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('@/lib/indexeddb-storage', () => ({
    indexedDBStorage: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined },
}));

import { useAutoSave } from '@/app/health/applications/new/_steps/hooks/use-auto-save';
import { useWizardStoreBase } from '@/app/health/applications/new/_steps/hooks/use-application-flow-store';

const NOTICE = { code: 'PREVIOUS_CERTIFICATE_NOT_FOUND', messageTh: 'ไม่พบใบรับรองเลขที่นี้ในระบบ' };
let sent: Record<string, unknown>[] = [];
let replies: unknown[] = [];

function jsonReply(body: unknown) {
    return {
        ok: true, status: 200,
        headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
        json: async () => body, text: async () => JSON.stringify(body),
    };
}
const saved = (extra: Record<string, unknown>) => ({ success: true, data: { id: 'app-X', draftId: 'app-X', ...extra } });

function Probe() {
    const autoSave = useAutoSave();
    return <output data-testid="law-notice">{autoSave.lawNotice ? `${autoSave.lawNotice.code}|${autoSave.lawNotice.messageTh}` : ''}</output>;
}

let container: HTMLDivElement;
let root: Root;
const shown = () => container.querySelector('[data-testid="law-notice"]')?.textContent ?? '';
async function advance(ms: number) { await act(async () => { await jest.advanceTimersByTimeAsync(ms); }); }

beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    jest.useFakeTimers();
    sent = [];
    replies = [];
    global.fetch = jest.fn(async (url: unknown, init?: { body?: unknown }) => {
        if (!String(url).endsWith('/applications/draft')) { return jsonReply({ success: true, data: null }); }
        sent.push(init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {});
        return jsonReply(replies.shift() ?? saved({}));
    }) as unknown as typeof fetch;
    localStorage.clear();
    localStorage.setItem('user', JSON.stringify({ id: 'user-A', role: 'HEALTH' }));
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    act(() => { useWizardStoreBase.getState().resetWizard(); });
    act(() => {
        useWizardStoreBase.getState().hydrateDraft({
            applicationId: 'app-X', requestType: 'RENEWAL', applicantType: 'JURISTIC', previousCertificateNumber: 'TH-GACP 61/2569',
        });
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(<Probe />); });
});

afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    jest.useRealTimers();
});

describe('the law notice travels from the save reply to the screen', () => {
    it('a reply that recorded ขอใหม่ puts the notice in state; a later clean reply clears it', async () => {
        replies = [saved({ lawNotice: NOTICE, requestType: 'NEW' })];
        act(() => { useWizardStoreBase.getState().updateState({ previousCertificateNumber: 'TH-GACP 62/2569' }); });
        await advance(3100);
        expect(sent).toHaveLength(1);
        expect((sent[0]!.formData as Record<string, unknown>).previousCertificateNumber).toBe('TH-GACP 62/2569');
        expect(shown()).toBe(`${NOTICE.code}|${NOTICE.messageTh}`);

        act(() => { useWizardStoreBase.getState().updateState({ previousCertificateNumber: '62/2569' }); });
        await advance(3100);
        expect(sent).toHaveLength(2);
        expect(shown()).toBe('');
    });
});

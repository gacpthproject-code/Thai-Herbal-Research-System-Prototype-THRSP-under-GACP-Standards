/**
 * The draft door fills a renewal's steps 3-4 from the renewed certificate's filing and says
 * so in `renewalPrefill`. The wizard must load those answers: its next save posts the whole
 * store, and a store still holding `farmData: null` would write the blank over them. It must
 * then tell the server it loaded them (`renewalPrefillLoaded` on its later saves), because the
 * server keeps offering the filing until it hears that, and a cleared field must stay cleared.
 * Real autosave hook and real store, `fetch` stubbed.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('@/lib/indexeddb-storage', () => ({
    indexedDBStorage: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined },
}));

import { useAutoSave } from '@/app/health/applications/new/_steps/hooks/use-auto-save';
import { useWizardStoreBase } from '@/app/health/applications/new/_steps/hooks/use-application-flow-store';

const FARM = { siteName: 'แปลงหนองจอก', siteAddress: '45 หมู่ 3', province: 'กรุงเทพมหานคร', areaSqm: '3200' };
const VARIETIES = [{ kind: 'SEED', name: 'หางกระรอกภูพาน', origin: 'DOMESTIC', source: 'ศูนย์วิจัยสกลนคร', quantity: '400' }];
const PREFILL = { farmData: FARM, varieties: VARIETIES, certificationPurposes: ['EXPORT'] };

let sent: Record<string, unknown>[] = [];
let replies: unknown[] = [];
let holdNextReply = false;
let releaseReply: (() => void) | null = null;

function jsonReply(body: unknown) {
    return {
        ok: true, status: 200,
        headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
        json: async () => body, text: async () => JSON.stringify(body),
    };
}
const saved = (extra: Record<string, unknown>) => ({ success: true, data: { id: 'app-R', draftId: 'app-R', requestType: 'RENEWAL', ...extra } });

function Probe() {
    useAutoSave();
    return null;
}

let container: HTMLDivElement;
let root: Root;
const store = () => useWizardStoreBase.getState();
const formDataOf = (body: Record<string, unknown> | undefined) => (body?.formData ?? {}) as Record<string, unknown>;
async function advance(ms: number) { await act(async () => { await jest.advanceTimersByTimeAsync(ms); }); }
function claimRenewal() { act(() => { store().updateState({ requestType: 'RENEWAL', previousCertificateNumber: '61/2569' }); }); }

beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    jest.useFakeTimers();
    sent = [];
    replies = [];
    holdNextReply = false;
    releaseReply = null;
    global.fetch = jest.fn(async (url: unknown, init?: { body?: unknown }) => {
        if (!String(url).endsWith('/applications/draft')) { return jsonReply({ success: true, data: null }); }
        sent.push(init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {});
        if (holdNextReply) {
            holdNextReply = false;
            await new Promise<void>((resolve) => { releaseReply = resolve; });
        }
        return jsonReply(replies.shift() ?? saved({}));
    }) as unknown as typeof fetch;
    localStorage.clear();
    localStorage.setItem('user', JSON.stringify({ id: 'user-A', role: 'HEALTH' }));
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    act(() => { store().resetWizard(); });
    act(() => { store().hydrateDraft({ holderEntityId: 'entity-C', applicantType: 'JURISTIC' }); });
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

describe('a renewal draft loads the answers the server filled in', () => {
    it('the store holds the prefill, loading it sends nothing, and the next edit sends it back intact with the acknowledgement', async () => {
        replies = [saved({ renewalPrefill: PREFILL })];
        claimRenewal();
        await advance(3100);
        expect(sent).toHaveLength(1);
        expect(sent[0].renewalPrefillLoaded).toBeUndefined();
        expect({ farmData: store().farmData, varieties: store().varieties, purposes: store().certificationPurposes })
            .toEqual({ farmData: FARM, varieties: VARIETIES, purposes: ['EXPORT'] });

        await advance(3100);
        expect(sent).toHaveLength(1);

        act(() => { store().updateState({ varietiesNote: 'พันธุ์ที่สองปลูกรอบหน้า' }); });
        await advance(3100);
        expect(sent).toHaveLength(2);
        const next = formDataOf(sent[1]);
        expect({ farmData: next.farmData, varieties: next.varieties, purposes: next.certificationPurposes, note: next.varietiesNote, loaded: sent[1].renewalPrefillLoaded })
            .toEqual({ farmData: FARM, varieties: VARIETIES, purposes: ['EXPORT'], note: 'พันธุ์ที่สองปลูกรอบหน้า', loaded: true });
    });

    it('a site field the applicant already typed is kept and the other site fields are filled around it', async () => {
        const typed = { siteName: 'แปลงใหม่ลำลูกกา' };
        act(() => { store().hydrateDraft({ farmData: typed as never }); });
        replies = [saved({ renewalPrefill: PREFILL })];
        claimRenewal();
        await advance(3100);
        expect({ farmData: store().farmData, varieties: store().varieties })
            .toEqual({ farmData: { ...FARM, ...typed }, varieties: VARIETIES });
    });

    it('an offer with nothing left to load is still acknowledged on the next save', async () => {
        act(() => { store().hydrateDraft(PREFILL as never); });
        replies = [saved({ renewalPrefill: {} })];
        claimRenewal();
        await advance(3100);
        expect(sent).toHaveLength(1);
        act(() => { store().updateState({ varietiesNote: 'พันธุ์ที่สองปลูกรอบหน้า' }); });
        await advance(3100);
        expect({ saves: sent.length, loaded: sent[1]?.renewalPrefillLoaded }).toEqual({ saves: 2, loaded: true });
    });

    it('loading the prefill leaves a resume hold up that the step page raised meanwhile', async () => {
        holdNextReply = true;
        replies = [saved({ renewalPrefill: PREFILL })];
        claimRenewal();
        await advance(3100);
        expect(sent).toHaveLength(1);
        act(() => { store().setResumePending(true); });
        await act(async () => { releaseReply?.(); await jest.advanceTimersByTimeAsync(0); });
        expect({ farmData: store().farmData, resumePending: store().resumePending }).toEqual({ farmData: FARM, resumePending: true });
    });
});

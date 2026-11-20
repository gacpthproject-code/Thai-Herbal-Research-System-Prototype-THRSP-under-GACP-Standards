/**
 * Opening a draft through [id]/edit and making one edit must not blank the stored step-4
 * answers. "เริ่มแก้ไขคำขอ" resets the wizard store and rebuilds it from GET /applications/:id;
 * the autosave then posts the WHOLE store on the next edit, so any stored key the rebuild
 * skips is sent back as its blank and the draft door writes the blank over the answer.
 * 2026-10-28 (renewal-prefill re-review): varieties, varietiesNote, processing,
 * previousCertificateNumber and serviceTypes were skipped. Real edit view, real store, real
 * autosave hook; `fetch` stubbed.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('@/lib/indexeddb-storage', () => ({
    indexedDBStorage: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined },
}));

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
    useParams: () => ({ id: 'app-1' }),
    usePathname: () => '/health/applications/app-1/edit',
    useSearchParams: () => new URLSearchParams(),
}));

import EditApplicationPage from '../edit/client-view';
import { useAutoSave } from '@/app/health/applications/new/_steps/hooks/use-auto-save';
import { useWizardStoreBase } from '@/app/health/applications/new/_steps/hooks/use-application-flow-store';

const VARIETIES = [{ kind: 'SEED', name: 'หางกระรอกภูพาน', origin: 'DOMESTIC', source: 'ศูนย์วิจัยสกลนคร', quantity: '400', unit: 'เมล็ด' }];
const PROCESSING = { plantPart: 'ช่อดอก', strain: 'หางกระรอกภูพาน', source: 'แปลงของตนเอง', quantity: '120', unit: 'กิโลกรัม' };
const FARM = { siteName: 'แปลงหนองจอก', siteAddress: '45 หมู่ 3', province: 'กรุงเทพมหานคร', areaSqm: '3200', areaTypes: ['OUTDOOR'] };

/** GET /applications/:id as the detail builder echoes a stored draft: every wizard key as stored. */
const STORED_DRAFT = {
    id: 'app-1',
    applicationNumber: 'APP-2569-EDIT-000001',
    status: 'DRAFT',
    entityId: 'entity-C',
    formData: {
        plantId: 'cannabis', serviceType: 'RENEWAL', serviceTypes: ['RENEWAL'], requestType: 'RENEWAL', applicantType: 'JURISTIC',
        certScope: null, previousCertificateNumber: '61/2569', certificationPurposes: ['EXPORT'], cultivationMethods: ['outdoor'],
        siteTypes: ['OUTDOOR'], farmData: FARM, varieties: VARIETIES, varietiesNote: 'พันธุ์ที่สามปลูกในรอบถัดไป', processing: PROCESSING,
        applicantData: null, generalInfo: null, siteData: null, productionData: null, harvestData: null, securityData: null,
        cultivationDetails: null, plantTracking: [], stepDocuments: [{ slotId: 'land_rights', fileName: 'chanote.pdf' }], plots: [], lots: [],
        documents: [], licensePdfUrl: null, youtubeUrl: '', qrCount: 0, estimatedQRCost: 0, consentedPDPA: true, acknowledgedStandards: true,
        locationType: 'OUTDOOR', _lastReviewComment: null,
    },
};

let sent: Record<string, unknown>[] = [];

function jsonReply(body: unknown) {
    return {
        ok: true, status: 200,
        headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
        json: async () => body, text: async () => JSON.stringify(body),
    };
}

function Page() {
    useAutoSave();
    return <EditApplicationPage />;
}

let container: HTMLDivElement;
let root: Root;
const store = () => useWizardStoreBase.getState();
async function advance(ms: number) { await act(async () => { await jest.advanceTimersByTimeAsync(ms); }); }
async function flush() { await act(async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); }); }

beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    jest.useFakeTimers();
    sent = [];
    global.fetch = jest.fn(async (url: unknown, init?: { method?: string; body?: unknown }) => {
        const target = String(url);
        if (target.endsWith('/applications/app-1') && (init?.method ?? 'GET') === 'GET') { return jsonReply({ success: true, data: STORED_DRAFT }); }
        if (target.endsWith('/applications/draft') && init?.method === 'POST') {
            sent.push(init.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {});
            return jsonReply({ success: true, data: { id: 'app-1', draftId: 'app-1', requestType: 'RENEWAL' } });
        }
        return jsonReply({ success: true, data: null });
    }) as unknown as typeof fetch;
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('user', JSON.stringify({ id: 'user-A', role: 'HEALTH' }));
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    act(() => { store().resetWizard(); });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(<Page />); });
});

afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    jest.useRealTimers();
});

const startButton = () => Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('เริ่มแก้ไขคำขอ'));

async function startEditing() {
    for (let i = 0; i < 40 && !startButton(); i += 1) { await flush(); await advance(50); }
    const start = startButton();
    expect(start).toBeTruthy();
    await act(async () => { start!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

describe('a draft opened through [id]/edit keeps its step-4 answers', () => {
    it('the store holds the stored step 4 after เริ่มแก้ไขคำขอ, and the load itself sends nothing', async () => {
        await startEditing();
        await advance(3100);

        expect({
            varieties: store().varieties, varietiesNote: store().varietiesNote, processing: store().processing,
            previousCertificateNumber: store().previousCertificateNumber, serviceTypes: store().serviceTypes,
            stepDocuments: store().stepDocuments, applicationId: store().applicationId, saves: sent.length,
        }).toEqual({
            varieties: VARIETIES, varietiesNote: 'พันธุ์ที่สามปลูกในรอบถัดไป', processing: PROCESSING,
            previousCertificateNumber: '61/2569', serviceTypes: ['RENEWAL'],
            stepDocuments: STORED_DRAFT.formData.stepDocuments, applicationId: 'app-1', saves: 0,
        });
    });

    it('one edit after the load posts the stored step 4 back intact under the application id', async () => {
        await startEditing();
        act(() => { store().updateState({ farmData: { ...FARM, siteName: 'แปลงหนองจอก ฝั่งเหนือ' } as never }); });
        await advance(3100);

        expect(sent).toHaveLength(1);
        const formData = (sent[0].formData ?? {}) as Record<string, unknown>;
        expect({
            applicationId: sent[0].applicationId, varieties: formData.varieties, varietiesNote: formData.varietiesNote,
            processing: formData.processing, previousCertificateNumber: formData.previousCertificateNumber,
            serviceTypes: formData.serviceTypes, siteName: (formData.farmData as { siteName?: string })?.siteName,
        }).toEqual({
            applicationId: 'app-1', varieties: VARIETIES, varietiesNote: 'พันธุ์ที่สามปลูกในรอบถัดไป', processing: PROCESSING,
            previousCertificateNumber: '61/2569', serviceTypes: ['RENEWAL'], siteName: 'แปลงหนองจอก ฝั่งเหนือ',
        });
    });
});

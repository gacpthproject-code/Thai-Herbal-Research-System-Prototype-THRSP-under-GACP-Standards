/**
 * The applicant's list card, against what GET /applications/my sends (applications-helpers.js
 * mapHealthApplication). The staging walk of ccc4f707d found two lies on every card (F4) and a
 * countdown that disagreed with the dispatcher's (F7):
 *   - the farm read "-" because the row carries the site under `farmName` only once the
 *     handler reads it out of formData.farmData (siteName in the six-step wizard);
 *   - a never-submitted draft read "ยื่นเมื่อ <createdAt>": the card dated the row's creation,
 *     not its filing. The rule every other page uses is lib/filing-date.unfiledLabel;
 *   - the revision countdown counted calendar days by hours while the dispatcher's board
 *     counts working days on the server. The server now sends `revisionWorkingDaysLeft`.
 */

import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PERSONAL } from '@/components/holder/__tests__/fixtures';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockGet = jest.fn<Promise<unknown>, [string]>();

jest.mock('@/lib/api/api-client', () => ({
    apiClient: { get: (u: string) => mockGet(u), delete: jest.fn() },
    api: { get: (u: string) => mockGet(u), delete: jest.fn() },
}));
jest.mock('@/lib/api', () => ({
    apiClient: { get: (u: string) => mockGet(u) },
    api: { get: (u: string) => mockGet(u) },
}));
jest.mock('@/lib/services/auth-service', () => ({ AuthService: { getUser: () => ({ id: 'u1', role: 'HEALTH' }) } }));
jest.mock('@/lib/services/my-entities-provider', () => ({
    useMyEntities: () => ({ entities: [PERSONAL], isLoading: false, error: null, refresh: async () => {} }),
}));
jest.mock('@/components/ui/qr-image', () => ({ __esModule: true, QrImage: () => null }));
jest.mock('next/navigation', () => {
    const router = { push: jest.fn(), replace: jest.fn(), refresh: jest.fn(), back: jest.fn(), prefetch: jest.fn() };
    const params = new URLSearchParams();
    return { useRouter: () => router, usePathname: () => '/', useSearchParams: () => params };
});

import ApplicationsPage from '../client-view';
import { LanguageProvider } from '@/lib/i18n/language-context';

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

async function mount() {
    await act(async () => { root.render(<LanguageProvider><ApplicationsPage /></LanguageProvider>); });
    for (let i = 0; i < 3; i += 1) { await act(async () => { for (let j = 0; j < 10; j += 1) await Promise.resolve(); }); }
}

const cardOf = (number: string) => {
    const el = Array.from(container.querySelectorAll('h3, p, span, div')).find((n) => n.textContent?.trim() === number);
    return el?.closest('article, li, [data-testid], .rounded-2xl, .rounded-xl')?.textContent ?? container.textContent ?? '';
};

const DRAFT = {
    id: 'a1', applicationNumber: 'APP-DRAFT', status: 'DRAFT', createdAt: '2026-10-31T10:00:00Z', submittedAt: null,
    entityId: 'e-personal', farmName: 'แปลงทดสอบ wc4', plantName: 'turmeric',
};
const REVISION = {
    id: 'a2', applicationNumber: 'APP-REVISION', status: 'REVISION_REQUESTED', createdAt: '2026-10-30T10:00:00Z',
    submittedAt: '2026-10-30T11:40:00Z', entityId: 'e-personal', farmName: 'แปลงทดสอบ wc4',
    revisionDueAt: '2026-11-11T16:59:59.999Z', revisionWorkingDaysLeft: 6,
};
const CAR = {
    id: 'a3', applicationNumber: 'APP-CAR', status: 'CAR_PENDING', createdAt: '2026-10-20T10:00:00Z',
    submittedAt: '2026-10-20T11:40:00Z', entityId: 'e-personal', farmName: 'แปลงทดสอบ wc4',
    carDueAt: '2026-11-06T16:59:59.999Z',
};

describe('applicant list card (F4, F7)', () => {
    it('names the site the server sends and dates a draft as not yet filed', async () => {
        mockGet.mockResolvedValue({ success: true, data: [DRAFT] });
        await mount();
        const text = cardOf('APP-DRAFT');
        expect(text).toContain('แปลงทดสอบ wc4');
        expect(text).toContain('ยังไม่ได้ยื่น');
        expect(text).not.toContain('ยื่นเมื่อ');
    });

    it('dates a filed application by its filing day', async () => {
        mockGet.mockResolvedValue({ success: true, data: [REVISION] });
        await mount();
        expect(cardOf('APP-REVISION')).toContain('ยื่นเมื่อ 30 ต.ค. 2569');
    });

    it('counts the CAR window in the calendar days the server counted, worded as the CAR page words it', async () => {
        const farDue = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
        mockGet.mockResolvedValue({ success: true, data: [{ ...CAR, carDueAt: farDue, carCalendarDaysLeft: 3 }] });
        await mount();
        const text = cardOf('APP-CAR');
        expect(text).toContain('เหลือ 3 วัน');
        expect(text).not.toContain('เหลือเวลา');
    });

    it('shows no CAR countdown when the server sent no count, whatever the deadline timestamp says', async () => {
        mockGet.mockResolvedValue({ success: true, data: [{ ...CAR, carCalendarDaysLeft: null }] });
        await mount();
        expect(cardOf('APP-CAR')).not.toMatch(/เหลือ|เลยกำหนด|ครบกำหนดวันนี้/);
    });

    it('counts the revision window in the working days the server counted', async () => {
        mockGet.mockResolvedValue({ success: true, data: [REVISION] });
        await mount();
        expect(cardOf('APP-REVISION')).toContain('เหลือ 6 วันทำการ');
    });
});

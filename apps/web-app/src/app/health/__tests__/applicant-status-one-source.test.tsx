/**
 * Live walk 2026-10-07 F3: one APPROVED application (certificate already issued) read
 * "รอพิจารณาอนุมัติ" on the detail badge, "ผ่านการอนุมัติ 8/9" on the detail stepper,
 * "ได้รับใบรับรอง GACP 9/9" with a download button on the list, and "ขั้นที่ 5 จาก 5" on the
 * status page. Every applicant surface is rendered here for the same application and must
 * name the same status, the same step of the same ladder, and the same sentence.
 */
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Envelope = { success: boolean; data?: unknown; error?: string };
const mockGet = jest.fn<Promise<Envelope>, [string]>();

jest.mock('@/lib/api/api-client', () => {
    const api = { get: (u: string) => mockGet(u), post: jest.fn(), delete: jest.fn(), getBlob: jest.fn() };
    return { api, apiClient: api, ApiClient: function ApiClient() {} };
});
jest.mock('@/lib/api', () => {
    const api = { get: (u: string) => mockGet(u), post: jest.fn(), delete: jest.fn(), getBlob: jest.fn() };
    return { api, apiClient: api };
});
jest.mock('@/lib/services/auth-service', () => ({
    AuthService: { getUser: () => ({ id: 'u1', role: 'HEALTH', firstName: 'สมชาย' }) },
}));
jest.mock('@/lib/services/auth-service-session', () => ({
    getStoredUser: () => ({ id: 'u1', role: 'HEALTH' }),
}));
jest.mock('@/lib/services/my-entities-provider', () => ({
    useMyEntities: () => ({ entities: [], isLoading: false, error: null, refresh: async () => {} }),
}));
jest.mock('next/navigation', () => {
    const router = { push: jest.fn(), replace: jest.fn(), refresh: jest.fn(), back: jest.fn(), prefetch: jest.fn() };
    const params = new URLSearchParams();
    const routeParams = { id: 'app-1' };
    return {
        useRouter: () => router,
        useParams: () => routeParams,
        usePathname: () => '/health',
        useSearchParams: () => params,
    };
});

import DetailPage from '../applications/[id]/client-view';
import ListPage from '../applications/client-view';
import StatusPage from '../status/client-view';
import DashboardPage from '../dashboard/client-view';
import { LanguageProvider } from '@/lib/i18n/language-context';

// What GET /applications/:id/status serves per status
// (apps/backend/routes/api/helpers/application-constants.js DISPLAY_STATUS_BY_RAW_STATUS,
// application-payload-builders.js buildActionCard).
const SERVED_DISPLAY: Record<string, { displayStatus: string; action: string }> = {
    REVISION_REQUESTED: { displayStatus: 'REVISION_REQUESTED', action: 'SUBMIT_REVISION' },
    DOC_FEE_PAID: { displayStatus: 'DOC_REVIEWING', action: 'WAITING' },
    CAR_PENDING: { displayStatus: 'CAR_PENDING', action: 'SUBMIT_CAR_EVIDENCE' },
    AUDIT_PASSED: { displayStatus: 'FINAL_REVIEW', action: 'WAITING' },
    APPROVED: { displayStatus: 'FINAL_REVIEW', action: 'WAITING' },
    CERTIFIED: { displayStatus: 'CERTIFIED', action: 'DOWNLOAD_CERTIFICATE' },
};

function serve(status: string, hasCertificate: boolean) {
    const app = {
        id: 'app-1', applicationNumber: 'APP-2569-0001', status, workflowState: status,
        hasCertificate, isRenewal: false, farmName: 'ไร่ทดสอบ', plantName: 'ขมิ้นชัน',
        createdAt: '2026-09-01T03:00:00.000Z', submittedAt: '2026-09-01T03:00:00.000Z',
    };
    const served = SERVED_DISPLAY[status]!;
    mockGet.mockImplementation(async (path: string) => {
        if (path.endsWith('/applications/my')) return { success: true, data: [app] };
        if (path === '/applications/app-1') return { success: true, data: app };
        if (path === '/applications/app-1/status') {
            return { success: true, data: { status, displayStatus: served.displayStatus, isRenewal: false, actionCard: { key: served.action } } };
        }
        if (path === '/applications/app-1/history') return { success: true, data: { workflowHistory: [] } };
        return { success: false, error: 'unrouted ' + path };
    });
}

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
    mockGet.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

type Surface = { labels: string[]; steps: string[]; progress: string[]; descriptions: string[]; text: string };

async function render(page: React.ReactElement): Promise<Surface> {
    await act(async () => { root.render(<LanguageProvider>{page}</LanguageProvider>); });
    for (let i = 0; i < 4; i += 1) { await act(async () => { for (let j = 0; j < 10; j += 1) await Promise.resolve(); }); }
    const read = (id: string) => Array.from(container.querySelectorAll(`[data-testid="${id}"]`))
        .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim());
    const surface = {
        labels: read('applicant-status-label'),
        steps: read('applicant-status-step').map((s) => (s.match(/(\d+)\s*(?:\/|จาก)\s*(\d+)/) || []).slice(1).join('/')),
        progress: read('applicant-status-progress'),
        descriptions: read('applicant-status-description'),
        text: container.textContent || '',
    };
    act(() => root.render(<></>));
    return surface;
}

async function renderAll(status: string, hasCertificate: boolean) {
    serve(status, hasCertificate);
    return {
        detail: await render(<DetailPage />),
        list: await render(<ListPage />),
        status: await render(<StatusPage />),
        dashboard: await render(<DashboardPage />),
    };
}

const CASES: Array<[string, boolean]> = [
    // F3 itself: the approver's decision recorded, a certificate row already on the list payload.
    ['APPROVED', true],
    ['CERTIFIED', true],
    ['AUDIT_PASSED', false],
    ['REVISION_REQUESTED', false],
    ['DOC_FEE_PAID', false],
    ['CAR_PENDING', false],
];

describe('one application, one status on every applicant page', () => {
    it.each(CASES)('%s: detail, list, status page and dashboard name the same status', async (status, hasCert) => {
        const pages = await renderAll(status, hasCert);
        const perPage = Object.fromEntries(Object.entries(pages).map(([name, s]) => [name, s.labels]));
        for (const [name, labels] of Object.entries(perPage)) {
            expect({ name, count: labels.length > 0 }).toEqual({ name, count: true });
        }
        const distinct = new Set(Object.values(perPage).flat());
        expect({ status, labels: perPage, distinct: distinct.size }).toEqual({ status, labels: perPage, distinct: 1 });
    });

    it.each(CASES)('%s: every step counter is the same step of the same ladder', async (status, hasCert) => {
        const pages = await renderAll(status, hasCert);
        const steps = { detail: pages.detail.steps, list: pages.list.steps, status: pages.status.steps };
        for (const [name, s] of Object.entries(steps)) {
            expect({ name, shown: s.length > 0 && s.every(Boolean) }).toEqual({ name, shown: true });
        }
        expect({ status, steps, distinct: new Set(Object.values(steps).flat()).size })
            .toEqual({ status, steps, distinct: 1 });
        expect({ status, progress: pages.dashboard.progress }).toEqual({ status, progress: pages.detail.progress });
    });

    it.each(CASES)('%s: the status sentence is the same wherever it is shown', async (status, hasCert) => {
        const pages = await renderAll(status, hasCert);
        const sentences = [...pages.detail.descriptions, ...pages.list.descriptions, ...pages.status.descriptions];
        expect(pages.detail.descriptions.length).toBeGreaterThan(0);
        expect(pages.status.descriptions.length).toBeGreaterThan(0);
        expect({ status, sentences, distinct: new Set(sentences).size }).toEqual({ status, sentences, distinct: 1 });
    });

    it.each(CASES.filter(([s]) => s !== 'CERTIFIED'))(
        '%s: no page says the certificate is received or offers its download',
        async (status, hasCert) => {
            const pages = await renderAll(status, hasCert);
            for (const [name, s] of Object.entries(pages)) {
                expect({ name, received: /ได้รับใบรับรอง|ดาวน์โหลดใบรับรอง|หลังได้ใบรับรอง/.test(s.text) })
                    .toEqual({ name, received: false });
            }
        },
    );

    it('CERTIFIED: the detail page and the list both offer the certificate', async () => {
        const pages = await renderAll('CERTIFIED', true);
        expect(pages.detail.text).toContain('ดาวน์โหลดใบรับรอง');
        expect(pages.list.text).toContain('ดาวน์โหลดใบรับรอง');
    });
});

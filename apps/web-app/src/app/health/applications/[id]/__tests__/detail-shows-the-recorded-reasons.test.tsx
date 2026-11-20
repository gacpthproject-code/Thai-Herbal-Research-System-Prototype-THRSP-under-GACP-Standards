/**
 * Order 65(1), 2026-10-09: the applicant reads on the application page, in Thai, why the visit was
 * booked after the date the company must inspect by, or why the field inspector was moved during a
 * correction, with the side the delay counts against. A page with no recorded reason shows no card.
 */
import * as React from 'react';
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type Envelope = { success: boolean; data?: unknown; error?: string };
const mockGet = jest.fn<(path: string) => Promise<Envelope>>();
jest.mock('@/lib/api/api-client', () => {
    const api = { get: (path: string) => mockGet(path), post: jest.fn(), getBlob: jest.fn() };
    return { api, apiClient: api, ApiClient: function ApiClient() {} };
});
jest.mock('@/lib/api', () => {
    const api = { get: (path: string) => mockGet(path), post: jest.fn(), getBlob: jest.fn() };
    return { api, apiClient: api };
});
const mockRouter = { push: jest.fn(), replace: jest.fn(), refresh: jest.fn(), back: jest.fn(), prefetch: jest.fn() };
const mockParams = { id: 'app-booked' };
jest.mock('next/navigation', () => ({
    useParams: () => mockParams,
    useRouter: () => mockRouter,
    usePathname: () => '/health/applications/app-booked',
    useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/services/auth-service-session', () => ({
    getStoredUser: () => ({ id: 'user-1', role: 'HEALTH' }),
}));

import ApplicationDetailPage from '../client-view';

// 2026-10-12 09:30 Bangkok
const WHEN = '2026-10-12T02:30:00.000Z';

const base = {
    id: 'app-booked', applicationId: 'app-booked', applicationNumber: 'APP-2569-BOOK', status: 'AUDIT_CONFIRMED',
    workflowState: 'AUDIT_CONFIRMED', phase1Status: 'PAID', phase2Status: 'PAID',
    createdAt: '2026-09-30T03:00:00.000Z', updatedAt: '2026-10-01T03:00:00.000Z',
};

function route(detail: Record<string, unknown>) {
    mockGet.mockImplementation(async (path: string) => {
        if (path.endsWith('/status')) { return { success: true, data: { displayStatus: detail.status } }; }
        if (path.endsWith('/history')) { return { success: true, data: { history: [] } }; }
        if (path === '/applications/app-booked') { return { success: true, data: detail }; }
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
async function mount(): Promise<HTMLElement> {
    await act(async () => { root.render(<ApplicationDetailPage />); });
    for (let i = 0; i < 6; i += 1) { await act(async () => { await Promise.resolve(); }); }
    return container;
}

describe('the reasons the dispatcher recorded, on the applicant\'s page', () => {
    it('shows each recorded reason in Thai with its side', async () => {
        route({
            ...base,
            auditSchedule: { scheduledDate: WHEN, auditorName: 'สมชาย ใจดี' },
            recordedReasons: [
                {
                    kind: 'LATE_VISIT', kindLabel: 'นัดตรวจพื้นที่หลังวันที่ต้องตรวจภายใน', reasonCode: 'NO_INSPECTOR_AVAILABLE',
                    label: 'ไม่มีผู้ตรวจพื้นที่ว่างก่อนกำหนด', side: 'INSPECTION_BODY', sideLabel: 'หน่วยตรวจ', recordedAt: '2026-10-09T03:00:00.000Z',
                },
                {
                    kind: 'INSPECTOR_CHANGED', kindLabel: 'เปลี่ยนผู้ตรวจพื้นที่ระหว่างแก้ไขข้อบกพร่อง', reasonCode: 'OTHER',
                    label: 'ผู้ตรวจเดิมย้ายไปประจำอีกจังหวัดหนึ่ง', side: 'UNASSIGNED', sideLabel: 'ยังไม่จัดฝ่าย', recordedAt: '2026-10-10T03:00:00.000Z',
                },
            ],
        });
        const el = await mount();
        const card = el.querySelector('[data-testid="recorded-reasons-card"]');
        expect(card).not.toBeNull();
        const text = card!.textContent || '';
        expect(text).toContain('นัดตรวจพื้นที่หลังวันที่ต้องตรวจภายใน');
        expect(text).toContain('ไม่มีผู้ตรวจพื้นที่ว่างก่อนกำหนด');
        expect(text).toContain('ฝ่ายที่รับผิดชอบ: หน่วยตรวจ');
        expect(text).toContain('ผู้ตรวจเดิมย้ายไปประจำอีกจังหวัดหนึ่ง');
        expect(text).toContain('ฝ่ายที่รับผิดชอบ: ยังไม่จัดฝ่าย');
        expect(text).not.toMatch(/NO_INSPECTOR_AVAILABLE|INSPECTION_BODY|UNASSIGNED/);
    });

    it('shows no card when nothing was recorded', async () => {
        route({ ...base, auditSchedule: { scheduledDate: WHEN, auditorName: 'สมชาย ใจดี' }, recordedReasons: [] });
        const el = await mount();
        expect(el.querySelector('[data-testid="recorded-reasons-card"]')).toBeNull();
    });
});

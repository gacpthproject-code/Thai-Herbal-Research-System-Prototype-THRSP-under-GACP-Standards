/**
 * The calendar booking under order 56(1): the dialog shows the date the company must inspect by, an
 * inspector at the workload cap is booked only with a listed reason, and the reason is sent with the
 * booking. The person on site is read through the audited door (order 56(3)).
 */

import * as React from 'react';
import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
jest.setTimeout(30_000);

const mockGet = jest.fn<(url: string) => Promise<unknown>>();
const mockPost = jest.fn<(url: string, body: Record<string, unknown>) => Promise<unknown>>();
const client = { get: (url: string) => mockGet(url), post: (url: string, body: Record<string, unknown>) => mockPost(url, body) };
jest.mock('@/lib/api', () => ({ apiClient: client }));
jest.mock('@/lib/api/api-client', () => ({ apiClient: client }));
jest.mock('@/lib/notifications', () => ({ notifications: { show: jest.fn() } }));
jest.mock('../../components/provider-layout', () => ({
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('next/navigation', () => {
    const router = { push: jest.fn(), replace: jest.fn(), refresh: jest.fn(), back: jest.fn(), prefetch: jest.fn() };
    return { useRouter: () => router, usePathname: () => '/provider/calendar', useSearchParams: () => new URLSearchParams() };
});

import Page from '../client-view';

const ITEM = {
    id: 'a1', applicationId: 'a1', applicationNumber: 'APP-CAL-1', applicantName: 'สมชาย', status: 'AUDIT_FEE_PAID',
    workflowState: 'AUDIT_FEE_PAID', phase2Paid: true, receiptIssued: true, auditorId: 'insp-1', auditorName: null,
    scheduledDate: null, mapLink: null, location: 'แปลงสาธิต', notes: null, estimatedDuration: 120,
    isReinspectionRequired: false, overdueDays: 0, inspectBy: '2027-01-07T16:59:59.999Z',
};
const REASONS = {
    overCap: [{ code: 'NEAR_A_VISIT_THAT_DAY', label: 'แปลงอยู่ใกล้นัดเดิมในวันเดียวกัน' }, { code: 'OTHER', label: 'อื่น ๆ (โปรดระบุ)' }],
    lateVisit: [{ code: 'OTHER', label: 'อื่น ๆ (โปรดระบุ)' }],
    correctionReassign: [],
};

let container: HTMLDivElement;
let root: Root;
async function flush(rounds = 12) {
    for (let i = 0; i < rounds; i += 1) { await act(async () => { await Promise.resolve(); }); }
}
const text = () => document.body.textContent || '';
function button(label: string): HTMLButtonElement {
    const found = Array.from(document.body.querySelectorAll('button')).find((b) => (b.textContent || '').includes(label));
    if (!found) { throw new Error(`no button "${label}" in: ${text().slice(0, 600)}`); }
    return found as HTMLButtonElement;
}

beforeEach(async () => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
    mockGet.mockImplementation(async (url: string) => {
        if (url.includes('/reasons')) { return { success: true, data: REASONS }; }
        if (url.includes('auditors')) { return { success: true, data: [{ id: 'insp-1', fullName: 'ผู้ตรวจ หนึ่ง' }] }; }
        if (url.includes('/dashboard')) {
            const empty = { total: 0, items: [] };
            return {
                success: true,
                data: {
                    queues: { readyToSchedule: { total: 1, items: [ITEM] }, scheduledUpcoming: empty, reinspectionRequired: empty },
                    calendar: { events: [] },
                    kpi: { scheduledToday: 0, scheduledThisWeek: 0, pendingScheduling: 1, reinspectionBacklog: 0 },
                },
            };
        }
        return { success: false, status: 404 };
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root.render(<Page />); });
    await flush();
    await act(async () => { button('จัดคู่นัดตรวจ').click(); });
    await flush();
});

describe('the calendar booking (order 56(1))', () => {
    it('shows the date the company must inspect by', () => {
        expect(text()).toMatch(/ต้องตรวจภายใน \S+ ม\.ค\. 2570/);
    });

    it('an inspector at the cap is booked only with a listed reason, sent with the booking', async () => {
        mockPost.mockResolvedValueOnce({ success: false, status: 409, errorCode: 'OFFICER_OVER_CAP_CONFIRMATION_REQUIRED', code: 'OFFICER_OVER_CAP_CONFIRMATION_REQUIRED' });
        await act(async () => { button('บันทึกนัดหมาย').click(); });
        await flush();
        expect(text()).toContain('ผู้ตรวจคนนี้มีงานถึงเพดานแล้ว');
        expect(button('ยืนยันนัดหมายพร้อมเหตุผล').disabled).toBe(true);
        await act(async () => { (document.body.querySelector('input[value="NEAR_A_VISIT_THAT_DAY"]') as HTMLInputElement).click(); });
        mockPost.mockResolvedValueOnce({ success: true, data: { canLeadToCertificate: true } });
        await act(async () => { button('ยืนยันนัดหมายพร้อมเหตุผล').click(); });
        await flush();
        expect(mockPost).toHaveBeenLastCalledWith('/api/provider/scheduler/audits/schedules', expect.objectContaining({
            applicationId: 'a1', overCap: { reasonCode: 'NEAR_A_VISIT_THAT_DAY' },
        }));
    });

    it('offers the person on site, read only when asked', () => {
        expect(text()).toContain('ผู้ติดต่อหน้างาน');
        expect(button('ดูชื่อและเบอร์ผู้ติดต่อหน้างาน')).toBeTruthy();
        expect(mockGet.mock.calls.some(([url]) => url.includes('site-contact'))).toBe(false);
    });
});

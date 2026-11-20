/**
 * The dispatcher's board under order 56(1): the date the company must inspect by on every visit
 * waiting to be booked (1.3), a tab for the applicants who owe a correction with the one manual
 * reminder of each round (3.1, 3.2), and the confirmation with a listed reason when a document
 * reviewer is at the workload cap (2.1).
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
const mockPost = jest.fn<(url: string, body: unknown) => Promise<unknown>>();
jest.mock('@/lib/api/api-client', () => ({
    apiClient: {
        get: (url: string) => mockGet(url),
        post: (url: string, body: unknown) => mockPost(url, body),
    },
}));
jest.mock('@/lib/notifications', () => ({ notifications: { show: jest.fn() } }));
jest.mock('@/lib/services/auth-provider', () => ({ useAuth: () => ({ user: { role: 'dispatcher' } }) }));
jest.mock('../../components/provider-layout', () => ({
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('next/navigation', () => {
    const router = { push: jest.fn(), replace: jest.fn(), refresh: jest.fn(), back: jest.fn(), prefetch: jest.fn() };
    return { useRouter: () => router, usePathname: () => '/provider/coordinator', useSearchParams: () => new URLSearchParams() };
});

import Page from '../client-view';

const ROW = {
    reviewerId: null, reviewerName: null, auditorId: null, auditorName: null, scheduledDate: null, mapLink: null, location: null,
    phase2Paid: true, receiptIssued: true, isReinspectionRequired: false, createdAt: '2026-10-01T03:00:00.000Z', updatedAt: '2026-10-01T03:00:00.000Z',
};
const READY = { ...ROW, applicationId: 'app-ready', applicationNumber: 'APP-READY-1', applicantName: 'สมชาย', status: 'AUDIT_FEE_PAID', workflowState: 'AUDIT_FEE_PAID', inspectBy: '2027-01-07T16:59:59.999Z' };
const TO_REVIEW = { ...ROW, applicationId: 'app-review', applicationNumber: 'APP-REVIEW-1', applicantName: 'สมหญิง', status: 'DOC_FEE_PAID', workflowState: 'DOC_FEE_PAID' };
const REVISING = {
    ...ROW, applicationId: 'app-revising', applicationNumber: 'APP-REVISE-1', applicantName: 'สมศรี', status: 'REVISION_REQUESTED',
    workflowState: 'REVISION_REQUESTED', correctionDueAt: '2026-10-16T16:59:59.999Z', reminderThisRound: null,
};
const REMINDED = { ...REVISING, applicationId: 'app-reminded', applicationNumber: 'APP-REVISE-2', reminderThisRound: { sentAt: '2026-10-09T03:00:00.000Z', sentBy: 'd-1' } };

function board() {
    const queue = (items: unknown[]) => ({ total: items.length, items });
    return {
        queues: {
            readyForReview: queue([TO_REVIEW]), readyToSchedule: queue([READY]), scheduledUpcoming: queue([]),
            reinspectionRequired: queue([]), awaitingApplicant: queue([REVISING, REMINDED]),
        },
        pipeline: { submitted: 0, pendingDocFee: 0, docFeePaid: 1, assignedForReview: 0, docApproved: 0, pendingAuditFee: 0, auditFeePaid: 1, auditConfirmed: 0 },
        calendar: { events: [] },
        kpi: { scheduledToday: 0, scheduledThisWeek: 0, pendingScheduling: 1, reinspectionBacklog: 0, overdue: 0 },
    };
}

const REASONS = {
    overCap: [{ code: 'NO_OTHER_OFFICER_AVAILABLE', label: 'ไม่มีผู้ตรวจคนอื่นว่าง' }, { code: 'OTHER', label: 'อื่น ๆ (โปรดระบุ)' }],
    lateVisit: [{ code: 'OTHER', label: 'อื่น ๆ (โปรดระบุ)' }],
    correctionReassign: [{ code: 'OTHER', label: 'อื่น ๆ (โปรดระบุ)' }],
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
async function press(label: string) {
    const target = button(label);
    await act(async () => {
        target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
        target.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    });
    await flush();
}

beforeEach(async () => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
    mockGet.mockImplementation(async (url: string) => {
        if (url.includes('/dashboard')) { return { success: true, data: board() }; }
        if (url.includes('/reasons')) { return { success: true, data: REASONS }; }
        if (url.includes('/reviewers')) { return { success: true, data: [{ id: 'rev-1', fullName: 'ผู้ตรวจ เอกสาร', role: 'document_reviewer', canonicalRole: 'document_reviewer' }] }; }
        return { success: true, data: null };
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root.render(<Page />); });
    await flush();
});

describe('the dispatcher board (order 56(1))', () => {
    it('shows the date the company must inspect by on a visit waiting to be booked', async () => {
        await press('รอจัดสรร');
        expect(text()).toContain('APP-READY-1');
        expect(text()).toMatch(/ต้องตรวจภายใน \S+ ม\.ค\. 2570/);
    });

    it('lists the applicants who owe a correction with its deadline, and offers one reminder per round', async () => {
        await press('รอผู้ยื่นแก้ไข');
        expect(text()).toContain('APP-REVISE-1');
        expect(text()).toMatch(/ต้องแก้ไขภายใน 16 ต\.ค\. 2569/);
        const reminded = Array.from(document.body.querySelectorAll('button')).find((b) => (b.textContent || '').includes('แจ้งเตือนรอบนี้แล้ว'));
        expect(reminded?.disabled).toBe(true);
        mockPost.mockResolvedValueOnce({ success: true, data: {} });
        await press('แจ้งเตือนผู้ยื่น');
        expect(mockPost).toHaveBeenCalledWith('/api/provider/scheduler/applications/app-revising/send-reminder', {});
    });

    it('no reminder button outside the correction tab', async () => {
        await press('รอจัดสรร');
        expect(Array.from(document.body.querySelectorAll('button')).some((b) => (b.textContent || '').includes('แจ้งเตือน'))).toBe(false);
    });

    it('a reviewer at the cap asks for a listed reason, and the assignment is sent again with it', async () => {
        await press('จ่ายงานตรวจ');
        const select = document.body.querySelector('select') as HTMLSelectElement;
        await act(async () => {
            const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
            setter.call(select, 'rev-1');
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        mockPost.mockResolvedValueOnce({ success: false, status: 409, errorCode: 'OFFICER_OVER_CAP_CONFIRMATION_REQUIRED', code: 'OFFICER_OVER_CAP_CONFIRMATION_REQUIRED' });
        await press('ยืนยันจ่ายงาน');
        expect(text()).toContain('ผู้ตรวจคนนี้มีงานถึงเพดานแล้ว');
        expect(button('ยืนยันจ่ายงานแม้เกินเพดาน').disabled).toBe(true);

        const radio = document.body.querySelector('input[value="NO_OTHER_OFFICER_AVAILABLE"]') as HTMLInputElement;
        await act(async () => { radio.click(); });
        mockPost.mockResolvedValueOnce({ success: true, data: {} });
        await press('ยืนยันจ่ายงานแม้เกินเพดาน');
        expect(mockPost).toHaveBeenLastCalledWith('/api/provider/scheduler/reviewer-assignments', {
            applicationId: 'app-review', reviewerId: 'rev-1', overCap: { reasonCode: 'NO_OTHER_OFFICER_AVAILABLE' },
        });
    });
});

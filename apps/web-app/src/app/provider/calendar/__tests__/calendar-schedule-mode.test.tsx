/**
 * Every inspection is on site (order 27, operator 2026-10-06: an online inspection cannot lead to
 * a certificate and is removed). The calendar offers no mode, no meeting link and no online
 * wording; the backend's answer about the evidence chain is still shown and kept on the page.
 * A second visit the field inspector asked for is booked with that same inspector (order 29).
 */

import * as React from 'react';
import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock('@/lib/api', () => ({
    apiClient: {
        get: (...a: unknown[]) => mockGet(...a),
        post: (...a: unknown[]) => mockPost(...a),
    },
}));
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
import { ScheduleModal } from '../schedule-modal';

const FUTURE = new Date(Date.now() + 10 * 86400000).toISOString();

type Bucket = 'readyToSchedule' | 'scheduledUpcoming' | 'reinspectionRequired';
function dashboard(items: Array<Record<string, unknown>>, bucket: Bucket) {
    const empty = { total: 0, items: [] };
    return {
        queues: { readyToSchedule: empty, scheduledUpcoming: empty, reinspectionRequired: empty, [bucket]: { total: items.length, items } },
        calendar: { events: [] },
        kpi: { scheduledToday: 0, scheduledThisWeek: 0, pendingScheduling: items.length, reinspectionBacklog: 0 },
    };
}
const ITEM = {
    id: 'a1', applicationId: 'a1', applicationNumber: 'GACP-2569-0001', applicantName: 'สมชาย', status: 'AUDIT_FEE_PAID',
    workflowState: 'AUDIT_FEE_PAID', phase2Paid: true, receiptIssued: true, auditorId: null, auditorName: null,
    scheduledDate: null, mapLink: null, location: null, notes: null,
    estimatedDuration: 120, isReinspectionRequired: false, overdueDays: 0,
};

let container: HTMLDivElement;
let root: Root;

async function flush(rounds = 10) {
    for (let i = 0; i < rounds; i += 1) { await act(async () => { await Promise.resolve(); }); }
}
function textOf(node: ParentNode = document.body) { return node.textContent || ''; }
function buttonByText(label: string, exact = false): HTMLButtonElement {
    const found = Array.from(document.body.querySelectorAll('button')).find((b) => (exact
        ? (b.textContent || '').trim() === label
        : (b.textContent || '').includes(label)));
    if (!found) { throw new Error(`no button "${label}" in: ${textOf().slice(0, 400)}`); }
    return found as HTMLButtonElement;
}

beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

async function mountWith(items: Array<Record<string, unknown>>, bucket: Bucket) {
    mockGet.mockImplementation(async (url: unknown) => {
        const u = String(url);
        if (u.includes('auditors')) { return { success: true, data: [{ id: 'insp-1', fullName: 'ผู้ตรวจ หนึ่ง', providerId: 'P1' }] }; }
        return { success: true, data: dashboard(items, bucket) };
    });
    await act(async () => { root.render(<Page />); });
    await flush();
}

describe('every visit is on site', () => {
    it('a new booking opens on the site fields (map link / place); there is no meeting-link field', async () => {
        await mountWith([ITEM], 'readyToSchedule');
        await act(async () => { buttonByText('จัดคู่นัดตรวจ').click(); });
        await flush();
        const body = textOf();
        expect(body).toContain('ลิงก์แผนที่');
        expect(body).not.toContain('ลิงก์การประชุม');
        expect(body).not.toContain('ออนไลน์');
    });

    it('the calendar source carries no online mode at all', () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const read = (name: string) => require('node:fs').readFileSync(require('node:path').resolve(__dirname, '..', name), 'utf8') as string;
        for (const name of ['client-view.tsx', 'schedule-modal.tsx', 'schedule-evidence.ts', 'calendar-types.ts']) {
            expect(read(name)).not.toMatch(/ONLINE_MEET|meetingLink|ออนไลน์/);
        }
    });
});

describe('the booking form', () => {
    const props = {
        opened: true, setOpened: () => undefined, selectedItem: ITEM as never, scheduleDate: new Date(), setScheduleDate: () => undefined,
        scheduleTime: '09:00', setScheduleTime: () => undefined, auditorId: 'insp-1', setAuditorId: () => undefined,
        auditorOptions: [{ value: 'insp-1', label: 'ผู้ตรวจ หนึ่ง' }],
        mapLink: '', setMapLink: () => undefined, location: '', setLocation: () => undefined,
        notes: '', setNotes: () => undefined, estimatedDuration: 120, setEstimatedDuration: () => undefined, submitSchedule: () => undefined, isSubmitting: false,
        reasonLists: null, askedReasons: [], statements: {}, setStatement: () => undefined,
    };

    it('offers no inspection mode and names the field inspector in Thai', async () => {
        await act(async () => { root.render(<ScheduleModal {...props} />); });
        await flush();
        expect(textOf()).not.toMatch(/ONLINE_MEET|ONSITE|รูปแบบการตรวจ/);
        expect(textOf()).toContain('ผู้ตรวจพื้นที่');
    });

    it('a second visit keeps the inspector who found the defect', async () => {
        const reinspection = { ...ITEM, workflowState: 'CAR_REVIEWING', auditorId: 'insp-1', isReinspectionRequired: true };
        await act(async () => { root.render(<ScheduleModal {...props} selectedItem={reinspection as never} />); });
        await flush();
        expect(textOf()).toContain('ผู้ตรวจพื้นที่คนเดิม');
    });
});

describe('a second visit the field inspector asked for', () => {
    it('is booked from its own tab, with the same inspector, and the site filled in from the application', async () => {
        const reinspection = {
            ...ITEM, status: 'CAR_REVIEWING', workflowState: 'CAR_REVIEWING', auditorId: 'insp-1', auditorName: 'ผู้ตรวจ หนึ่ง',
            scheduledDate: '2026-09-01T02:00:00.000Z', isReinspectionRequired: true,
        };
        mockPost.mockResolvedValue({ success: true, data: { canLeadToCertificate: true } });
        mockGet.mockImplementation(async (url: unknown) => {
            const u = String(url);
            if (u.includes('auditors')) { return { success: true, data: [{ id: 'insp-1', fullName: 'ผู้ตรวจ หนึ่ง' }] }; }
            if (u.includes('/scheduler/applications/')) {
                return { success: true, data: { summary: { farmName: 'แปลงสวนสุข', farmAddress: '99 หมู่ 1 จ.เชียงใหม่', farmLatitude: null, farmLongitude: null } } };
            }
            return { success: true, data: dashboard([reinspection], 'reinspectionRequired') };
        });
        await act(async () => { root.render(<Page />); });
        await flush();
        await act(async () => { buttonByText('ลงพื้นที่ซ้ำ (1)').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); });
        await flush();
        await act(async () => { buttonByText('นัดลงพื้นที่ซ้ำ', true).click(); });
        await flush();
        expect(textOf()).toContain('ผู้ตรวจพื้นที่คนเดิม');
        const place = Array.from(document.body.querySelectorAll('input')).map((i) => (i as HTMLInputElement).value);
        expect(place).toContain('แปลงสวนสุข 99 หมู่ 1 จ.เชียงใหม่');
        await act(async () => { buttonByText('บันทึกนัดหมาย').click(); });
        await flush();
        expect(mockPost).toHaveBeenCalledTimes(1);
        const body = mockPost.mock.calls[0][1] as Record<string, unknown>;
        expect(body.auditorId).toBe('insp-1');
        expect(body).not.toHaveProperty('inspectionMode');
        expect(body).not.toHaveProperty('meetingLink');
    });
});

describe('the site filled in belongs to the application whose form is open (security review 2026-10-09 J3)', () => {
    it('a late answer for the application closed before does not fill the one open now', async () => {
        const first = { ...ITEM, id: 'a1', applicationId: 'a1', applicationNumber: 'GACP-2569-0001' };
        const second = { ...ITEM, id: 'b2', applicationId: 'b2', applicationNumber: 'GACP-2569-0002', applicantName: 'สมหญิง' };
        const answer: Record<string, (value: unknown) => void> = {};
        mockGet.mockImplementation((url: unknown) => {
            const u = String(url);
            if (u.includes('auditors')) { return Promise.resolve({ success: true, data: [{ id: 'insp-1', fullName: 'ผู้ตรวจ หนึ่ง' }] }); }
            const lookup = /\/scheduler\/applications\/([^/?]+)/.exec(u);
            if (lookup) { return new Promise((resolve) => { answer[lookup[1]] = resolve; }); }
            return Promise.resolve({ success: true, data: dashboard([first, second], 'readyToSchedule') });
        });
        const site = (name: string) => ({ success: true, data: { summary: { farmName: name, farmAddress: `ตำบล${name}`, farmLatitude: null, farmLongitude: null } } });
        const openButtons = () => Array.from(document.body.querySelectorAll('button')).filter((b) => (b.textContent || '').includes('จัดคู่นัดตรวจ'));

        await act(async () => { root.render(<Page />); });
        await flush();
        await act(async () => { (openButtons()[0] as HTMLButtonElement).click(); });
        await flush();
        await act(async () => { buttonByText('ยกเลิก', true).click(); });
        await flush();
        await act(async () => { (openButtons()[1] as HTMLButtonElement).click(); });
        await flush();
        await act(async () => { answer.a1(site('สวนแรก')); });
        await flush();
        await act(async () => { answer.b2(site('สวนที่สอง')); });
        await flush();

        const values = Array.from(document.body.querySelectorAll('input')).map((input) => (input as HTMLInputElement).value);
        expect(values).toContain('สวนที่สอง ตำบลสวนที่สอง');
        expect(values.join(' ')).not.toContain('สวนแรก');
    });
});

describe("the backend's answer is shown", () => {
    const NOTE = 'การนัดตรวจนี้ไม่ใช่การลงพื้นที่ จึงไม่สร้างหลักฐานการลงพื้นที่ และออกใบรับรองจากการตรวจครั้งนี้ไม่ได้ ต้องนัดตรวจแบบลงพื้นที่';
    const SCHEDULED = {
        ...ITEM, status: 'AUDIT_CONFIRMED', workflowState: 'AUDIT_CONFIRMED', auditorId: 'insp-1', auditorName: 'ผู้ตรวจ หนึ่ง',
        scheduledDate: FUTURE, location: 'แปลงทดสอบ',
    };

    async function saveReschedule(responseData: Record<string, unknown>) {
        mockPost.mockResolvedValue({ success: true, data: responseData });
        await mountWith([SCHEDULED], 'scheduledUpcoming');
        // Radix tabs activate on mousedown, not click.
        await act(async () => { buttonByText('นัดแล้ว').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); });
        await flush();
        await act(async () => { buttonByText('เลื่อนนัด', true).click(); });
        await flush();
        await act(async () => { buttonByText('บันทึกนัดหมาย').click(); });
        await flush();
    }

    it('canLeadToCertificate:false puts evidenceNote on the page in a banner that stays', async () => {
        await saveReschedule({ canLeadToCertificate: false, evidenceNote: NOTE });
        expect(mockPost).toHaveBeenCalledTimes(1);
        const banner = document.body.querySelector('[data-testid="schedule-evidence-warning"]');
        expect(banner).not.toBeNull();
        expect(textOf(banner as Element)).toContain('ออกใบรับรองจากการตรวจครั้งนี้ไม่ได้');
        expect(banner?.getAttribute('role')).toBe('alert');
    });

    it('canLeadToCertificate:true shows no warning', async () => {
        await saveReschedule({ canLeadToCertificate: true, evidenceNote: null });
        expect(document.body.querySelector('[data-testid="schedule-evidence-warning"]')).toBeNull();
    });
});

describe('plain Thai in the queue statuses this screen shows', () => {
    it('no "CAR" jargon in the status labels', () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { getStatusLabel } = require('@/lib/constants/workflow-states') as { getStatusLabel: (s: string) => string };
        expect(getStatusLabel('CAR_PENDING')).not.toMatch(/CAR/);
        expect(getStatusLabel('CAR_REVIEWING')).not.toMatch(/CAR/);
    });
});

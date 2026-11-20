/**
 * The scheduling queue's booking dialog under order 56(1): it books the slot the dispatcher picked
 * (the server reads scheduledTime), shows the date the company must inspect by, asks for a listed
 * reason when the server refuses a late visit, and sends the booking again with that reason. The
 * person on site is read through the audited door only (order 56(3)).
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

const mockAssign = jest.fn<(payload: Record<string, unknown>) => Promise<unknown>>();
jest.mock('@/lib/services/audit-service', () => ({
    AuditService: {
        getAuditors: async () => ({ success: true, data: [{ id: 'aud-1', fullName: 'นาย ผู้ตรวจ หนึ่ง' }] }),
        getAuditorAvailability: async () => ({ success: true, data: { auditorId: 'aud-1', busySlots: [], overCapDays: [], cap: 2 } }),
        assignAuditor: (payload: Record<string, unknown>) => mockAssign(payload),
    },
}));
const mockGet = jest.fn<(url: string) => Promise<unknown>>();
jest.mock('@/lib/api/api-client', () => ({ apiClient: { get: (url: string) => mockGet(url) } }));
jest.mock('@/lib/notifications', () => ({ notifications: { show: jest.fn() } }));

import { AssignAuditorModal } from '../AssignAuditorModal';

const APPLICATION = {
    applicationId: 'app-1', applicationNumber: 'APP-QUEUE-1', applicantName: 'สมชาย', applicantNameMasked: 'สมชาย',
    ageDays: 2, status: 'AUDIT_FEE_PAID', farmAddress: '12 หมู่ 3 แม่ริม เชียงใหม่', inspectBy: '2026-10-20T16:59:59.999Z',
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
async function setValue(selector: string, value: string) {
    const element = document.body.querySelector(selector) as HTMLInputElement | HTMLSelectElement;
    await act(async () => {
        const proto = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(element, value);
        element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
}

beforeEach(async () => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
    mockGet.mockImplementation(async (url: string) => {
        if (url.includes('/reasons')) {
            return { success: true, data: { overCap: [{ code: 'OTHER', label: 'อื่น ๆ (โปรดระบุ)' }], lateVisit: [{ code: 'SITE_NOT_READY', label: 'ผู้ยื่นแจ้งว่าสถานที่ปลูกยังไม่พร้อมให้ตรวจ' }, { code: 'OTHER', label: 'อื่น ๆ (โปรดระบุ)' }], correctionReassign: [] } };
        }
        return { success: false, status: 404 };
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root.render(<AssignAuditorModal open application={APPLICATION as never} onClose={() => undefined} onAssigned={() => undefined} />); });
    await flush();
    await setValue('#assign-auditor', 'aud-1');
});

describe('the queue booking dialog (order 56(1))', () => {
    it('books the afternoon slot at 13:00, the time the server reads', async () => {
        await setValue('#assign-date', '2026-10-19');
        await act(async () => { button('13:00 น.').click(); });
        mockAssign.mockResolvedValueOnce({ success: true, data: {} });
        await act(async () => { button('ยืนยันจัดตาราง').click(); });
        await flush();
        expect(mockAssign).toHaveBeenCalledWith(expect.objectContaining({ scheduledDate: '2026-10-19', scheduledTime: '13:00' }));
    });

    it('shows the date the company must inspect by, and asks for a reason when the visit is after it', async () => {
        expect(text()).toContain('ต้องตรวจภายใน');
        await setValue('#assign-date', '2026-10-27');
        expect(text()).toContain('วันที่เลือกเลยกำหนดนี้ ต้องระบุเหตุผล');
        mockAssign.mockResolvedValueOnce({ success: false, status: 409, errorCode: 'LATE_VISIT_REASON_REQUIRED', code: 'LATE_VISIT_REASON_REQUIRED' });
        await act(async () => { button('ยืนยันจัดตาราง').click(); });
        await flush();
        expect(text()).toContain('วันนัดนี้เลยวันที่ต้องตรวจภายใน');
        await act(async () => { (document.body.querySelector('input[value="SITE_NOT_READY"]') as HTMLInputElement).click(); });
        mockAssign.mockResolvedValueOnce({ success: true, data: {} });
        await act(async () => { button('ยืนยันจัดตารางพร้อมเหตุผล').click(); });
        await flush();
        expect(mockAssign).toHaveBeenLastCalledWith(expect.objectContaining({ lateVisit: { reasonCode: 'SITE_NOT_READY' } }));
    });

    it('reads the person on site only when asked, through the audited door', async () => {
        expect(mockGet.mock.calls.map(([url]) => url).filter((url) => url.includes('site-contact'))).toEqual([]);
        mockGet.mockResolvedValueOnce({ success: true, data: { applicationNumber: 'APP-QUEUE-1', siteContactName: 'นายสมศักดิ์ ดูแลแปลง', sitePhone: '086-555-6666' } });
        await act(async () => { button('ดูชื่อและเบอร์ผู้ติดต่อหน้างาน').click(); });
        await flush();
        expect(mockGet).toHaveBeenLastCalledWith('/api/provider/applications/app-1/site-contact');
        expect(text()).toContain('นายสมศักดิ์ ดูแลแปลง');
        expect(text()).toContain('086-555-6666');
    });
});

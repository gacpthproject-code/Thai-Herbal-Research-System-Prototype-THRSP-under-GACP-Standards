/**
 * Moving the field inspector while the applicant corrects an on-site defect takes a reason from
 * the fixed list (order 60(a)); before the visit the dispatcher's own words are enough. The status
 * reads in Thai (order 51).
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
jest.mock('@/lib/api/api-client', () => ({
    apiClient: { get: (url: string) => mockGet(url), post: (url: string, body: Record<string, unknown>) => mockPost(url, body) },
}));
jest.mock('@/lib/notifications', () => ({ notifications: { show: jest.fn() } }));
jest.mock('../../../components/provider-layout', () => ({
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@/components/ui/select', () => ({
    Select: ({ label, value, onChange, data }: { label: string; value: string; onChange: (v: string) => void; data: Array<{ value: string; label: string }> }) => (
        <label>
            {label}
            <select data-testid="inspector-select" value={value ?? ''} onChange={(event) => onChange(event.target.value)}>
                <option value="" />
                {data.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
        </label>
    ),
}));
jest.mock('next/navigation', () => {
    const router = { push: jest.fn(), replace: jest.fn(), refresh: jest.fn(), back: jest.fn(), prefetch: jest.fn() };
    return { useRouter: () => router, usePathname: () => '/provider/scheduler/reassign', useSearchParams: () => new URLSearchParams() };
});

import ReassignmentPage from '../page';

const APPS = [
    { id: 'app-car', applicationNumber: 'APP-CAR-1', applicantName: 'สมชาย', plantType: 'ขิง', status: 'CAR_PENDING', currentAuditor: 'ผู้ตรวจ เดิม' },
    { id: 'app-booked', applicationNumber: 'APP-BOOKED-1', applicantName: 'สมหญิง', plantType: 'ขิง', status: 'AUDIT_CONFIRMED', currentAuditor: 'ผู้ตรวจ เดิม' },
];

let container: HTMLDivElement;
let root: Root;
async function flush(rounds = 12) {
    for (let i = 0; i < rounds; i += 1) { await act(async () => { await Promise.resolve(); }); }
}
const text = () => document.body.textContent || '';
function rowButton(applicationNumber: string): HTMLButtonElement {
    const row = Array.from(document.body.querySelectorAll('tr')).find((tr) => (tr.textContent || '').includes(applicationNumber));
    return row!.querySelector('button') as HTMLButtonElement;
}
function button(label: string): HTMLButtonElement {
    const found = Array.from(document.body.querySelectorAll('button')).find((b) => (b.textContent || '').includes(label));
    if (!found) { throw new Error(`no button "${label}" in: ${text().slice(0, 600)}`); }
    return found as HTMLButtonElement;
}
async function pickInspector(id: string) {
    const select = document.body.querySelector('[data-testid="inspector-select"]') as HTMLSelectElement;
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, id);
        select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
}

beforeEach(async () => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
    mockGet.mockImplementation(async (url: string) => {
        if (url.includes('reassignable')) { return { success: true, data: { applications: APPS } }; }
        if (url.includes('/auditors')) { return { success: true, data: [{ id: 'insp-2', fullName: 'ผู้ตรวจ ใหม่' }] }; }
        if (url.includes('/reasons')) {
            return { success: true, data: { overCap: [], lateVisit: [], correctionReassign: [{ code: 'INSPECTOR_UNAVAILABLE', label: 'ผู้ตรวจพื้นที่คนเดิมปฏิบัติงานต่อไม่ได้' }, { code: 'OTHER', label: 'อื่น ๆ (โปรดระบุ)' }] } };
        }
        return { success: true, data: {} };
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root.render(<ReassignmentPage />); });
    await flush();
});

describe('moving the field inspector (order 60(a))', () => {
    it('reads the status in Thai, not the system code', () => {
        expect(text()).not.toContain('CAR_PENDING');
        expect(text()).not.toContain('AUDIT_CONFIRMED');
    });

    it('during a correction the reason comes from the list, and its code is what is sent', async () => {
        await act(async () => { rowButton('APP-CAR-1').click(); });
        await flush();
        expect(text()).toContain('เปลี่ยนผู้ตรวจพื้นที่ระหว่างที่ผู้ยื่นแก้ไขข้อบกพร่อง');
        expect(text()).not.toContain('เหตุผลในการมอบหมายใหม่');
        await pickInspector('insp-2');
        expect(button('ยืนยันการมอบหมาย').disabled).toBe(true);
        await act(async () => { (document.body.querySelector('input[value="INSPECTOR_UNAVAILABLE"]') as HTMLInputElement).click(); });
        mockPost.mockResolvedValueOnce({ success: true, data: {} });
        await act(async () => { button('ยืนยันการมอบหมาย').click(); });
        await flush();
        expect(mockPost).toHaveBeenCalledWith('/audits/reassign/app-car/reassign', { newAuditorId: 'insp-2', reasonCode: 'INSPECTOR_UNAVAILABLE', reasonText: undefined });
    });

    it('before the visit the dispatcher writes its own reason, as before', async () => {
        await act(async () => { rowButton('APP-BOOKED-1').click(); });
        await flush();
        expect(text()).toContain('เหตุผลในการมอบหมายใหม่');
        expect(text()).not.toContain('เปลี่ยนผู้ตรวจพื้นที่ระหว่างที่ผู้ยื่นแก้ไขข้อบกพร่อง');
    });
});

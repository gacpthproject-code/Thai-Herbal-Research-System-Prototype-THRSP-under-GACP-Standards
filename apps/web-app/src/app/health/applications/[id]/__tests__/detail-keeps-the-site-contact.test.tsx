/**
 * Order 65(2), 2026-10-09: the application page shows the person on site and lets the applicant
 * change it until the visit; a filing without one says so and asks for it, with the same rule as
 * the wizard (a name, a Thai phone, and a confirmation when it is someone else).
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
const mockPatch = jest.fn<(path: string, body?: unknown) => Promise<Envelope>>();
jest.mock('@/lib/api/api-client', () => {
    const api = { get: (path: string) => mockGet(path), post: jest.fn(), patch: (path: string, body?: unknown) => mockPatch(path, body), getBlob: jest.fn() };
    return { api, apiClient: api, ApiClient: function ApiClient() {} };
});
jest.mock('@/lib/api', () => {
    const api = { get: (path: string) => mockGet(path), post: jest.fn(), patch: (path: string, body?: unknown) => mockPatch(path, body), getBlob: jest.fn() };
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

const card = (el: HTMLElement) => el.querySelector('[data-testid="applicant-site-contact-card"]');
const buttonIn = (el: Element, text: string) => Array.from(el.querySelectorAll('button')).find((b) => (b.textContent || '').includes(text));
function typeInto(input: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => { setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
}

describe('the person on site, on the applicant\'s page', () => {
    it('a filing without one says so and asks for it', async () => {
        route({ ...base, status: 'AUDIT_FEE_PAID', siteContact: { siteContactName: null, sitePhone: null, siteContactIsApplicant: false, missing: true, editable: true } });
        const el = await mount();
        expect(card(el)?.textContent).toContain('ยังไม่มีผู้ติดต่อหน้างาน');
        expect(card(el)?.querySelector('input#applicant-site-contact-name')).not.toBeNull();
    });

    it('shows the contact and lets it be changed while the visit is still ahead, with the wizard\'s rule', async () => {
        route({ ...base, siteContact: { siteContactName: 'สมชาย ใจดี', sitePhone: '0812345678', siteContactIsApplicant: true, missing: false, editable: true } });
        mockPatch.mockResolvedValue({ success: true, data: { siteContactName: 'นายสมศักดิ์ ดูแลแปลง', sitePhone: '086-555-6666', siteContactIsApplicant: false } });
        const el = await mount();
        expect(card(el)?.textContent).toContain('สมชาย ใจดี');
        expect(card(el)?.textContent).toContain('0812345678');
        await act(async () => { buttonIn(card(el)!, 'แก้ไขผู้ติดต่อหน้างาน')!.click(); });
        typeInto(card(el)!.querySelector('input#applicant-site-contact-name') as HTMLInputElement, 'นายสมศักดิ์ ดูแลแปลง');
        typeInto(card(el)!.querySelector('input#applicant-site-phone') as HTMLInputElement, '12345');
        expect(card(el)?.textContent).toContain('กรอกเบอร์โทรศัพท์ไทย');
        expect((buttonIn(card(el)!, 'บันทึกผู้ติดต่อหน้างาน') as HTMLButtonElement).disabled).toBe(true);
        typeInto(card(el)!.querySelector('input#applicant-site-phone') as HTMLInputElement, '086-555-6666');
        expect((buttonIn(card(el)!, 'บันทึกผู้ติดต่อหน้างาน') as HTMLButtonElement).disabled).toBe(true);
        await act(async () => { (card(el)!.querySelector('input#applicant-site-contact-informed') as HTMLInputElement).click(); });
        await act(async () => { buttonIn(card(el)!, 'บันทึกผู้ติดต่อหน้างาน')!.click(); });
        for (let i = 0; i < 4; i += 1) { await act(async () => { await Promise.resolve(); }); }
        expect(mockPatch).toHaveBeenCalledWith('/applications/app-booked/site-contact', {
            siteContactName: 'นายสมศักดิ์ ดูแลแปลง', sitePhone: '086-555-6666', siteContactIsApplicant: false, siteContactInformed: true,
        });
        expect(card(el)?.textContent).toContain('นายสมศักดิ์ ดูแลแปลง');
    });

    it('after the visit the contact is shown, not offered for change', async () => {
        route({ ...base, siteContact: { siteContactName: 'สมชาย ใจดี', sitePhone: '0812345678', siteContactIsApplicant: true, missing: false, editable: false } });
        const el = await mount();
        expect(card(el)?.textContent).toContain('สมชาย ใจดี');
        expect(buttonIn(card(el)!, 'แก้ไขผู้ติดต่อหน้างาน')).toBeUndefined();
    });
});

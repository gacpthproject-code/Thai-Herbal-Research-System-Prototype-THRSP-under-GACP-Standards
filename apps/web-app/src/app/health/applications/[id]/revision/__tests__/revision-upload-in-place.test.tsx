import * as React from 'react';
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockGet = jest.fn<(url: string) => Promise<unknown>>();
jest.mock('@/lib/api', () => ({
    apiClient: { get: (url: string) => mockGet(url), post: jest.fn() },
}));
jest.mock('next/navigation', () => ({
    useParams: () => ({ id: 'app-1' }),
    useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }),
}));
const mockUpload = jest.fn<(args: Record<string, unknown>) => Promise<{ url: string | null; error: string | null }>>();
jest.mock('@/lib/services/draft-document-upload', () => ({
    uploadDraftDocument: (args: Record<string, unknown>) => mockUpload(args),
}));

import ClientView from '../client-view';
import { REVISION_COPY_TH } from '../revision-state';

const ASKED_AT = '2026-10-21T08:00:00.000Z';

function requirements(uploadedAt: string) {
    return {
        success: true,
        data: {
            slots: [{ slotId: 'sop_manual', labelTH: 'คู่มือ SOP', uploadedAt }],
            blockingIssues: [],
            requestedDocuments: [{ slotId: 'sop_manual', reason: 'อ่านไม่ออก กรุณาแนบฉบับที่ชัดเจน', dueDate: '2026-10-29T16:59:59.999Z', requestedAt: ASKED_AT }],
        },
    };
}

let container: HTMLDivElement;
let root: Root;

async function settle(): Promise<void> {
    for (let i = 0; i < 5; i += 1) {
        await act(async () => { await Promise.resolve(); });
    }
}

beforeEach(() => {
    mockGet.mockReset();
    mockUpload.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
});

describe('F-A8-01 อัปโหลดฉบับใหม่ในคำขอเดิม', () => {
    it('never sends the applicant to the new-application wizard', async () => {
        mockGet.mockResolvedValue(requirements('2026-10-20T08:00:00.000Z'));
        await act(async () => { root.render(<ClientView />); });
        await settle();

        const toWizard = Array.from(container.querySelectorAll('a'))
            .filter((a) => (a.getAttribute('href') || '').includes('/applications/new'));
        expect(toWizard).toEqual([]);
        const cta = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === REVISION_COPY_TH.replaceCta);
        expect(cta).toBeTruthy();
    });

    it('uploads the chosen file to the same application and slot, then re-reads what the server holds', async () => {
        mockGet.mockResolvedValueOnce(requirements('2026-10-20T08:00:00.000Z'))
            .mockResolvedValueOnce(requirements('2026-10-21T09:00:00.000Z'));
        mockUpload.mockResolvedValue({ url: '/uploads/application-drafts/x.pdf', error: null });
        await act(async () => { root.render(<ClientView />); });
        await settle();

        const input = container.querySelector('input[type="file"]') as HTMLInputElement;
        expect(input).toBeTruthy();
        const file = new File(['%PDF-1.4 revised'], 'sop-v2.pdf', { type: 'application/pdf' });
        Object.defineProperty(input, 'files', { value: [file] });
        await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
        await settle();

        expect(mockUpload).toHaveBeenCalledTimes(1);
        expect(mockUpload.mock.calls[0][0]).toMatchObject({ file, slotId: 'sop_manual', applicationId: 'app-1' });
        expect(mockGet).toHaveBeenCalledTimes(2);
        expect(container.textContent).toContain(REVISION_COPY_TH.replaced);
        const submit = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === REVISION_COPY_TH.submit) as HTMLButtonElement;
        expect(submit.disabled).toBe(false);
    });

    it('shows the server refusal in Thai and keeps the paper outstanding', async () => {
        mockGet.mockResolvedValue(requirements('2026-10-20T08:00:00.000Z'));
        mockUpload.mockResolvedValue({ url: null, error: 'ไฟล์ใหญ่เกิน 20 MB' });
        await act(async () => { root.render(<ClientView />); });
        await settle();

        const input = container.querySelector('input[type="file"]') as HTMLInputElement;
        Object.defineProperty(input, 'files', { value: [new File(['x'], 'big.pdf', { type: 'application/pdf' })] });
        await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
        await settle();

        expect(container.querySelector('[role="alert"]')?.textContent).toContain('ไฟล์ใหญ่เกิน 20 MB');
        expect(container.textContent).toContain(REVISION_COPY_TH.stillNeeded);
    });

    it('F-A8-08: names the deadline by its Bangkok day, whatever zone the browser runs in', async () => {
        const late = requirements('2026-10-20T08:00:00.000Z');
        late.data.requestedDocuments[0].dueDate = '2026-10-29T17:30:00.000Z';
        mockGet.mockResolvedValue(late);
        const original = Date.prototype.toLocaleDateString;
        const spy = jest.spyOn(Date.prototype, 'toLocaleDateString').mockImplementation(function (this: Date, locale, options) {
            return original.call(this, locale, { timeZone: 'UTC', ...(options || {}) });
        });
        try {
            await act(async () => { root.render(<ClientView />); });
            await settle();
            expect(container.textContent).toContain(`${REVISION_COPY_TH.dueLabel} 30 ตุลาคม 2569`);
        } finally {
            spy.mockRestore();
        }
    });
});

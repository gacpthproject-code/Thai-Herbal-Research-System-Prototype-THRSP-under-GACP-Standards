/**
 * The page re-reads the ask after a refused send-back, so the list matches the server.
 * When that re-read fails, the list on screen may be stale, and the applicant must be told.
 * The refusal must not erase that notice, and the notice must not erase the refusal.
 *
 * Pattern: createRoot/act (no @testing-library/react in this repo).
 */
import * as React from 'react';
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockGet = jest.fn<(url: string) => Promise<unknown>>();
const mockPost = jest.fn<(url: string, body?: unknown) => Promise<unknown>>();
jest.mock('@/lib/api', () => ({
    apiClient: { get: (url: string) => mockGet(url), post: (url: string, body?: unknown) => mockPost(url, body) },
}));
jest.mock('next/navigation', () => ({
    useParams: () => ({ id: 'app-1' }),
    useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }),
}));

import ClientView from '../client-view';
import { REVISION_COPY_TH } from '../revision-state';

const FIRST_READ = {
    success: true,
    data: {
        slots: [{ slotId: 'sop_manual', labelTH: 'คู่มือการปฏิบัติงาน', uploadedAt: '2026-10-29T03:00:00.000Z' }],
        requestedDocuments: [{
            slotId: 'sop_manual', reason: 'รอบสอง: ไม่มีลายมือชื่อ', dueDate: '2026-11-05T16:59:59.999Z',
            requestedAt: '2026-10-29T02:00:00.000Z',
        }],
        blockingIssues: [],
    },
};
const FAILED_READ = { success: false, error: 'NETWORK_ERROR' };

let container: HTMLDivElement;
let root: Root;

async function mountAndSend(): Promise<void> {
    await act(async () => { root.render(<ClientView />); });
    await act(async () => { await Promise.resolve(); });
    const send = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === REVISION_COPY_TH.submit);
    expect(send?.disabled).toBe(false);
    await act(async () => { send!.click(); });
    await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
});

describe('ส่งกลับถูกปฏิเสธ แล้วอ่านรายการใหม่ไม่สำเร็จ', () => {
    it('บอกทั้งเหตุที่ถูกปฏิเสธ และบอกว่ารายการบนจอยังไม่ได้อัปเดต', async () => {
        mockGet.mockResolvedValueOnce(FIRST_READ).mockResolvedValueOnce(FAILED_READ);
        mockPost.mockResolvedValue({
            success: false, code: 'REVISION_INCOMPLETE', error: 'REVISION_INCOMPLETE',
            meta: { messageTh: 'ยังไม่ได้แนบเอกสารใหม่: คู่มือการปฏิบัติงาน' },
        });
        await mountAndSend();

        expect(mockGet).toHaveBeenCalledTimes(2);
        expect(container.textContent).toContain('ยังไม่ได้แนบเอกสารใหม่: คู่มือการปฏิบัติงาน');
        expect(container.textContent).toContain(REVISION_COPY_TH.reviewsUnavailable);
    });

    it('ประตูปฏิเสธเพราะข้อมูลในคำขอ ยังบอกว่ารายการบนจอยังไม่ได้อัปเดต', async () => {
        mockGet.mockResolvedValueOnce(FIRST_READ).mockResolvedValueOnce(FAILED_READ);
        mockPost.mockResolvedValue({
            success: false, code: 'APPLICATION_INCOMPLETE', error: 'APPLICATION_INCOMPLETE',
            meta: {
                messageTh: 'กรุณากรอกข้อมูลให้ครบถ้วนก่อนส่งคำขอ',
                errorsByStep: { 3: [{ path: 'coordinates', message: 'กรุณากรอกพิกัดที่ตั้ง', code: 'required' }] },
            },
        });
        await mountAndSend();

        expect(container.textContent).toContain('กรุณากรอกพิกัดที่ตั้ง');
        expect(container.textContent).toContain(REVISION_COPY_TH.reviewsUnavailable);
    });

    it('อ่านใหม่สำเร็จ ไม่มีข้อความว่าอ่านไม่สำเร็จค้างอยู่', async () => {
        mockGet.mockResolvedValue(FIRST_READ);
        mockPost.mockResolvedValue({
            success: false, code: 'REVISION_INCOMPLETE', error: 'REVISION_INCOMPLETE',
            meta: { messageTh: 'ยังไม่ได้แนบเอกสารใหม่: คู่มือการปฏิบัติงาน' },
        });
        await mountAndSend();

        expect(container.textContent).toContain('ยังไม่ได้แนบเอกสารใหม่: คู่มือการปฏิบัติงาน');
        expect(container.textContent).not.toContain(REVISION_COPY_TH.reviewsUnavailable);
    });
});

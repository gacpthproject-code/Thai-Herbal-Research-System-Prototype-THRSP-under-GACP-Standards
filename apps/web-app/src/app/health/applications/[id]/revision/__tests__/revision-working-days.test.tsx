/**
 * The revision page shows the time left as the server counted it, in working days.
 *
 * The staging walk of ccc4f707d (F7) read "อีก 3 วัน" here, "เหลือเวลา 4 วัน" on the list
 * and "3 วันทำการ" on the dispatcher's board, for one deadline. The window is five working
 * days (order 28) and the server owns the holiday calendar (utils/working-days.js), so each
 * requested paper now arrives with `workingDaysLeft` and this page says that number.
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
jest.mock('@/lib/api', () => ({
    apiClient: { get: (url: string) => mockGet(url), post: jest.fn() },
}));
jest.mock('next/navigation', () => ({
    useParams: () => ({ id: 'app-1' }),
    useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }),
}));

import ClientView from '../client-view';

let container: HTMLDivElement;
let root: Root;

const requested = (workingDaysLeft: number | null, calendarDaysLeft: number | null = null) => ({
    slotId: 'land_rights',
    labelTH: 'เอกสารสิทธิ์ที่ดิน',
    reason: 'ไฟล์อ่านไม่ออก',
    dueDate: '2026-11-11T16:59:59.999Z',
    workingDaysLeft,
    calendarDaysLeft,
    requestedAt: '2026-11-03T05:00:00.000Z',
    uploadedAt: null,
});

async function mountWith(doc: ReturnType<typeof requested>): Promise<string> {
    mockGet.mockResolvedValue({ success: true, data: { slots: [], requestedDocuments: [doc], blockingIssues: [] } });
    await act(async () => { root.render(<ClientView />); });
    await act(async () => { await Promise.resolve(); });
    return container.textContent ?? '';
}

beforeEach(() => {
    mockGet.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
});

describe('revision countdown (F7)', () => {
    it('says the working days the server counted', async () => {
        const text = await mountWith(requested(6));
        expect(text).toContain('เหลือ 6 วันทำการ');
        expect(text).not.toMatch(/อีก \d+ วัน\)/);
    });

    it('says overdue in working days once the count is negative', async () => {
        const text = await mountWith(requested(-2));
        expect(text).toContain('เลยกำหนด 2 วันทำการ');
    });

    it('says due today at zero', async () => {
        const text = await mountWith(requested(0));
        expect(text).toContain('ครบกำหนดวันนี้');
    });

    it('says calendar days, not working days, when the server counted the CAR window (review I1)', async () => {
        const text = await mountWith(requested(null, 30));
        expect(text).toContain('เหลือ 30 วัน');
        expect(text).not.toContain('วันทำการ');
    });
});

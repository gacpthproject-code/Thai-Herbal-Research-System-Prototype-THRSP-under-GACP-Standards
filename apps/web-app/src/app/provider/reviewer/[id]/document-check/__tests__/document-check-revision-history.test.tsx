/**
 * The round-2 officer sees what round 1 asked for, so they can judge the answer against the ask.
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
const mockPost = jest.fn<(url: string, body: unknown) => Promise<unknown>>();
jest.mock('@/lib/api', () => ({
    apiClient: { get: (url: string) => mockGet(url), post: (url: string, body: unknown) => mockPost(url, body) },
}));
jest.mock('next/navigation', () => ({
    useParams: () => ({ id: 'app-1' }),
    useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }),
}));
jest.mock('@/components/feature/document-viewer-modal', () => ({
    DocumentViewerModal: () => null,
}));

import ClientView from '../client-view';

const ROUND_TWO = {
    round: 2,
    slots: [],
    blockingIssues: [],
    officerChecklist: { scope: 'IN', qualification: 'PASS', overall: 'INCOMPLETE' },
    revisionHistory: [{
        round: 1,
        requests: [{
            slotId: 'sop_manual', labelTH: 'คู่มือการปฏิบัติงาน', reason: 'สำเนาอ่านไม่ออก',
            requestedAt: '2026-10-26T03:00:00.000Z', dueDate: '2026-11-02T16:59:59.999Z',
        }],
    }],
};

let container: HTMLDivElement;
let root: Root;

async function mountView(): Promise<void> {
    await act(async () => { root.render(<ClientView />); });
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

describe('หน้าตรวจเอกสารรอบสอง: เห็นสิ่งที่ขอไปในรอบก่อน', () => {
    it('แสดงรอบที่ 1 พร้อมเอกสาร เหตุผล และกำหนดส่งของรอบนั้น', async () => {
        mockGet.mockResolvedValue({ success: true, data: ROUND_TWO });
        await mountView();
        const block = container.querySelector('[data-revision-history]');
        expect(block).not.toBeNull();
        expect(block!.querySelector('[data-revision-round="1"]')!.textContent).toContain('คู่มือการปฏิบัติงาน: สำเนาอ่านไม่ออก');
        expect(block!.textContent).toContain('2 พฤศจิกายน 2569');
        expect(container.textContent).toContain('รอบการตรวจที่ 2');
    });

    it('รอบแรกไม่มีส่วนประวัติ', async () => {
        mockGet.mockResolvedValue({ success: true, data: { ...ROUND_TWO, round: 1, revisionHistory: [] } });
        await mountView();
        expect(container.querySelector('[data-revision-history]')).toBeNull();
    });
});

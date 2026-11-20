/**
 * ผู้ยื่นที่ถูกส่งกลับเพราะข้อมูลในคำขอ (ไม่ใช่เอกสาร) ต้องเห็นเหตุ และมีทางไปแก้
 *
 * คำสั่ง operator 2026-10-06 ข้อ 16: กติกาเปลี่ยน (เช่น วัตถุประสงค์ที่ถูกถอด) เจ้าหน้าที่ส่งกลับ
 * ผู้ยื่นแก้คำตอบแล้วยื่นกลับในคำขอเดิม · การแจ้งเตือนพามาที่หน้านี้ ซึ่งเดิมพูดว่า
 * "ไม่มีรายการที่เจ้าหน้าที่ขอเพิ่ม" กับคำขอที่ถูกส่งกลับจริง
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

const PURPOSE_REASON = 'วัตถุประสงค์ต้องเลือกจาก ศึกษาวิจัย (ภ.ท. 09) เท่านั้น';

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

describe('ส่งกลับเพราะข้อมูลในคำขอ', () => {
    it('แสดงเหตุ และพาไปหน้าแก้ไขคำขอ ไม่บอกว่าไม่มีอะไรให้แก้', async () => {
        mockGet.mockResolvedValue({
            success: true,
            data: {
                slots: [],
                requestedDocuments: [],
                blockingIssues: [{ code: 'CERTIFICATION_PURPOSE_INVALID', messageTH: PURPOSE_REASON }],
            },
        });
        await mountView();

        expect(container.textContent).toContain(PURPOSE_REASON);
        expect(container.textContent).not.toContain(REVISION_COPY_TH.nothingRequested);
        const edit = Array.from(container.querySelectorAll('a')).find((a) => a.textContent === REVISION_COPY_TH.editAnswersCta);
        expect(edit?.getAttribute('href')).toBe('/health/applications/app-1/edit');
    });

    it('ไม่มีข้อติดและไม่มีเอกสารที่ขอ ยังคงบอกเหมือนเดิม', async () => {
        mockGet.mockResolvedValue({ success: true, data: { slots: [], requestedDocuments: [], blockingIssues: [] } });
        await mountView();
        expect(container.textContent).toContain(REVISION_COPY_TH.nothingRequested);
    });
});

describe('ส่งกลับแล้วประตูปฏิเสธเพราะข้อมูลในคำขอยังขาด (รอบ 2, I2)', () => {
    it('บอกชื่อช่องที่ขาดเป็นภาษาไทย และพาไปหน้าแก้ไขคำขอ', async () => {
        mockGet.mockResolvedValue({
            success: true,
            data: {
                slots: [{ slotId: 'land_rights', labelTH: 'สำเนาโฉนด', uploadedAt: '2026-10-02T00:00:00.000Z' }],
                requestedDocuments: [{
                    slotId: 'land_rights', reason: 'อ่านไม่ออก', dueDate: '2026-12-01', requestedAt: '2026-10-01T00:00:00.000Z',
                }],
                blockingIssues: [],
            },
        });
        mockPost.mockResolvedValue({
            success: false, code: 'APPLICATION_INCOMPLETE', error: 'APPLICATION_INCOMPLETE',
            meta: {
                messageTh: 'กรุณากรอกข้อมูลให้ครบถ้วนก่อนส่งคำขอ',
                errorsByStep: { 3: [{ path: 'coordinates', message: 'กรุณากรอกพิกัดที่ตั้ง', code: 'required' }] },
            },
        });
        await mountView();
        const send = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === REVISION_COPY_TH.submit);
        expect(send?.disabled).toBe(false);
        await act(async () => { send!.click(); });
        await act(async () => { await Promise.resolve(); });

        expect(container.textContent).toContain('กรุณากรอกพิกัดที่ตั้ง');
        expect(container.textContent).not.toContain('APPLICATION_INCOMPLETE');
        const edit = Array.from(container.querySelectorAll('a')).find((a) => a.textContent === REVISION_COPY_TH.editAnswersCta);
        expect(edit?.getAttribute('href')).toBe('/health/applications/app-1/edit');
    });
});

/**
 * คำขอที่กติกาเปลี่ยนใต้เท้า: หน้าตรวจเอกสารของเจ้าหน้าที่ต้องบอกเหตุ และส่งกลับได้
 *
 * D6 (staging 2026-10-06): คำขอที่ระบุวัตถุประสงค์ที่ถูกถอดแล้ว เปิดหน้านี้เจอรายการว่าง
 * กับรหัสอังกฤษ IN / PASS / INCOMPLETE และไม่มีปุ่มไหนพาไปต่อได้ · คำสั่ง operator ข้อ 16:
 * เจ้าหน้าที่ส่งคำขอกลับให้ผู้ยื่นแก้ในคำขอเดิม
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

const PURPOSE_REASON = 'วัตถุประสงค์ต้องเลือกจาก ศึกษาวิจัย (ภ.ท. 09) เท่านั้น แต่ละข้อมีใบอนุญาต ภ.ท. ที่ออกให้แล้วรองรับ';

const BLOCKED = {
    round: 1,
    slots: [],
    blockingIssues: [{ code: 'CERTIFICATION_PURPOSE_INVALID', messageTH: PURPOSE_REASON }],
    officerChecklist: { scope: 'IN', qualification: 'PASS', overall: 'INCOMPLETE' },
};

let container: HTMLDivElement;
let root: Root;

async function mountView(): Promise<void> {
    await act(async () => { root.render(<ClientView />); });
    await act(async () => { await Promise.resolve(); });
}

function button(label: string): HTMLButtonElement {
    const found = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === label);
    if (!found) { throw new Error(`no button "${label}"`); }
    return found as HTMLButtonElement;
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

describe('หน้าตรวจเอกสาร: คำขอที่มีข้อติดจากกติกา', () => {
    it('แสดงเหตุเป็นภาษาไทย แทนรายการว่าง', async () => {
        mockGet.mockResolvedValue({ success: true, data: BLOCKED });
        await mountView();
        expect(container.textContent).toContain(PURPOSE_REASON);
    });

    it('ผลตรวจเบื้องต้นเป็นคำไทย ไม่มีรหัส IN / PASS / INCOMPLETE บนหน้า', async () => {
        mockGet.mockResolvedValue({ success: true, data: BLOCKED });
        await mountView();
        const values = Array.from(container.querySelectorAll('dd')).map((dd) => dd.textContent);
        expect(values).toEqual(['อยู่ในขอบข่าย', 'มีคุณสมบัติครบ', 'เอกสารยังไม่ครบ']);
        expect(container.textContent).not.toMatch(/\b(IN|OUT|PASS|FAIL|COMPLETE|INCOMPLETE)\b/);
    });

    it('รับคำขอกดไม่ได้ ส่งกลับให้ผู้ยื่นกดได้ และส่ง REQUEST_MORE', async () => {
        mockGet.mockResolvedValue({ success: true, data: BLOCKED });
        mockPost.mockResolvedValue({ success: true, data: { status: 'REVISION_REQUESTED', notified: true } });
        await mountView();

        expect(button('รับคำขอ').disabled).toBe(true);
        const sendBack = button('ส่งคำขอกลับให้ผู้ยื่นแก้ไข');
        expect(sendBack.disabled).toBe(false);

        await act(async () => { sendBack.click(); });
        expect(mockPost).toHaveBeenCalledWith('/api/provider/applications/app-1/document-decision', { action: 'REQUEST_MORE' });
    });

    it('คำขอปกติที่ไม่มีข้อติด ยังใช้ปุ่มขอเอกสารเพิ่มแบบเดิม', async () => {
        mockGet.mockResolvedValue({
            success: true,
            data: { ...BLOCKED, blockingIssues: [], officerChecklist: { scope: 'OUT', qualification: 'FAIL', overall: 'COMPLETE' } },
        });
        await mountView();
        expect(button('ส่งคำขอเอกสารเพิ่ม').disabled).toBe(true);
        expect(Array.from(container.querySelectorAll('dd')).map((dd) => dd.textContent))
            .toEqual(['ไม่อยู่ในขอบข่าย', 'คุณสมบัติไม่ครบ', 'เอกสารครบถ้วน']);
    });

    it('ข้อที่ผู้ยื่นแก้เองไม่ได้: ไม่มีปุ่มส่งกลับ และบอกให้แจ้งผู้ดูแลระบบ', async () => {
        const HOLDER_REASON = 'คำขอนี้ระบุผู้ยื่นเป็นนิติบุคคล แต่ผูกอยู่กับบุคคล';
        mockGet.mockResolvedValue({
            success: true,
            data: {
                ...BLOCKED,
                blockingIssues: [{ code: 'APPLICANT_TYPE_NOT_THE_HOLDER', messageTH: HOLDER_REASON, applicantCanFix: false }],
            },
        });
        await mountView();
        expect(container.textContent).toContain(HOLDER_REASON);
        expect(container.textContent).toContain('ผู้ยื่นแก้เองไม่ได้');
        expect(container.textContent).toContain('ผู้ดูแลระบบ');
        const labels = Array.from(container.querySelectorAll('button')).map((b) => b.textContent);
        expect(labels).not.toContain('ส่งคำขอกลับให้ผู้ยื่นแก้ไข');
        expect(labels).not.toContain('ส่งคำขอเอกสารเพิ่ม');
        expect(button('รับคำขอ').disabled).toBe(true);
    });
});

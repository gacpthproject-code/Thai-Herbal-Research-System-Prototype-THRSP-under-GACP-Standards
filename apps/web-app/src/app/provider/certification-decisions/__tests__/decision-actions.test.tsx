/**
 * The approver decides from inside the file only (order 29, 2026-10-07): every decision opens
 * a confirmation with a reason, and a decided file shows its outcome instead of buttons.
 */
import * as React from 'react';
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {

    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
    usePathname: () => '/provider/certification-decisions/app-1',
    useSearchParams: () => new URLSearchParams(),
}));
const mockRequest = jest.fn<(path: string, init?: RequestInit) => Promise<{ success: boolean; error?: string }>>();
jest.mock('../../audits/auditor-types', () => ({
    PROVIDERRequest: (path: string, init?: RequestInit) => mockRequest(path, init),
}));
jest.mock('@/lib/notifications', () => ({ notifications: { show: jest.fn() } }));

import { DecisionActions } from '../[id]/decision-actions';
import type { DecisionFile } from '../[id]/decision-file-types';

const base = {
    application: {
        id: 'app-1', applicationNumber: 'APP-9001', status: 'AUDIT_PASSED', applicantName: 'สมชาย ใจดี',
        submittedAt: null, updatedAt: null, scheduledDate: null, farmName: null, farmAddress: '', farmLatitude: null, farmLongitude: null,
        holder: { name: 'บริษัท ทดสอบ จำกัด', typeLabel: 'นิติบุคคล' }, scope: { cultivationTypes: [], plantName: null }, purposes: [],
    },
    decidable: true,
    actions: ['APPROVE', 'REFUSE', 'RETURN'],
    decision: null,
    refusalReasons: [
        { code: 'FALSE_INFORMATION', label: 'ข้อมูลหรือเอกสารที่ยื่นไม่ตรงกับความจริง' },
        { code: 'SITE_NOT_ELIGIBLE', label: 'สถานที่ปลูกไม่เป็นไปตามเงื่อนไขของมาตรฐาน GACP' },
        { code: 'OTHER', label: 'อื่น ๆ (โปรดระบุ)' },
    ],
} as unknown as DecisionFile;

const buttonNamed = (name: string) => Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === name) as HTMLButtonElement | undefined;
const click = (el: Element | undefined) => act(() => { (el as HTMLElement).click(); });
const typeInto = (el: HTMLTextAreaElement, value: string) => act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
});

describe('DecisionActions', () => {
    let container: HTMLDivElement;
    let root: Root;
    beforeEach(() => {
        jest.clearAllMocks();
        mockRequest.mockResolvedValue({ success: true });
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
    });
    const render = (file: DecisionFile) => act(() => { root.render(<DecisionActions file={file} />); });

    it('approve needs a reason in the confirmation, and sends it', async () => {
        render(base);
        click(buttonNamed('อนุมัติให้การรับรอง'));
        const confirm = buttonNamed('ยืนยันอนุมัติและออกใบรับรอง')!;
        expect(confirm.disabled).toBe(true);
        expect(mockRequest).not.toHaveBeenCalled();
        typeInto(document.querySelector('textarea')!, 'หลักฐานครบ');
        expect(buttonNamed('ยืนยันอนุมัติและออกใบรับรอง')!.disabled).toBe(false);
        await act(async () => { buttonNamed('ยืนยันอนุมัติและออกใบรับรอง')!.click(); });
        expect(mockRequest).toHaveBeenCalledTimes(1);
        const [path, init] = mockRequest.mock.calls[0];
        expect(path).toBe('/api/provider/auditor/applications/app-1/final-approvals');
        expect(JSON.parse(String(init?.body))).toEqual({ reason: 'หลักฐานครบ' });
        expect(mockPush).toHaveBeenCalledWith('/provider/certification-decisions');
    });

    const CONSIDERATION = 'ข้อบกพร่องกระทบการควบคุมผลผลิตโดยตรงและแก้ไขในระยะสั้นไม่ได้';
    const considerationBox = () => document.querySelector('textarea[data-field="consideration"]') as HTMLTextAreaElement;

    it('refusal needs a reason from the list and a consideration of 20 characters the applicant will read; the note is optional', async () => {
        render(base);
        click(buttonNamed('ไม่ให้การรับรอง'));
        expect(buttonNamed('ยืนยันไม่ให้การรับรอง')!.disabled).toBe(true);
        click(document.querySelector('input[value="SITE_NOT_ELIGIBLE"]')!);
        expect(buttonNamed('ยืนยันไม่ให้การรับรอง')!.disabled).toBe(true);
        expect(document.body.textContent).toContain('ผู้ยื่นจะได้อ่านในหนังสือ');
        typeInto(considerationBox(), 'สั้นเกินไป');
        expect(buttonNamed('ยืนยันไม่ให้การรับรอง')!.disabled).toBe(true);
        typeInto(considerationBox(), `  ${CONSIDERATION}  `);
        expect(buttonNamed('ยืนยันไม่ให้การรับรอง')!.disabled).toBe(false);
        await act(async () => { buttonNamed('ยืนยันไม่ให้การรับรอง')!.click(); });
        const [path, init] = mockRequest.mock.calls[0];
        expect(path).toBe('/api/provider/auditor/applications/app-1/certification-refusals');
        expect(JSON.parse(String(init?.body))).toEqual({ reasonCode: 'SITE_NOT_ELIGIBLE', consideration: CONSIDERATION, note: '' });
    });

    describe('a file the field inspector did not pass', () => {
        const notPassed = {
            ...base,
            application: { ...base.application, status: 'AUDIT_NOT_PASSED' },
            actions: ['REFUSE', 'REQUEST_CORRECTION'],
            inspectorSummary: {
                inspectorName: 'ผู้ตรวจ หนึ่ง', decision: 'FAIL', notes: 'แปลงยังไม่พร้อม', reasonCode: null, decidedAt: '2026-10-12T08:00:00.000Z',
                findings: [
                    { nonConformity: 'ไม่มีบันทึกการใช้ปุ๋ย', correctiveAction: 'จัดทำสมุดบันทึก', category: null },
                    { nonConformity: 'โรงเก็บไม่มีประตูล็อก', correctiveAction: 'ติดตั้งประตูที่ล็อกได้', category: null },
                ],
            },
        } as unknown as DecisionFile;

        it('offers refuse and send back for correction, never approve or return to the inspector', () => {
            render(notPassed);
            expect(buttonNamed('ไม่ให้การรับรอง')).toBeDefined();
            expect(buttonNamed('ส่งกลับให้แก้ไขข้อบกพร่อง')).toBeDefined();
            expect(buttonNamed('อนุมัติให้การรับรอง')).toBeUndefined();
            expect(buttonNamed('ส่งกลับให้ผู้ตรวจพื้นที่ทบทวน')).toBeUndefined();
        });

        it('sending back lists the findings, all ticked by default, and sends the ticked ones with the optional note', async () => {
            render(notPassed);
            click(buttonNamed('ส่งกลับให้แก้ไขข้อบกพร่อง'));
            const boxes = Array.from(document.querySelectorAll('input[type="checkbox"][name="finding"]')) as HTMLInputElement[];
            expect(boxes.map((b) => b.checked)).toEqual([true, true]);
            expect(document.body.textContent).toContain('ผู้ยื่นมีเวลา 30 วันส่งหลักฐานการแก้ไข');
            click(boxes[0]);
            await act(async () => { buttonNamed('ยืนยันส่งกลับให้แก้ไข')!.click(); });
            const [path, init] = mockRequest.mock.calls[0];
            expect(path).toBe('/api/provider/auditor/applications/app-1/certification-corrections');
            expect(JSON.parse(String(init?.body))).toEqual({ findingIndexes: [2], note: '' });
        });

        it('with no finding ticked the send-back cannot be confirmed', () => {
            render(notPassed);
            click(buttonNamed('ส่งกลับให้แก้ไขข้อบกพร่อง'));
            for (const box of Array.from(document.querySelectorAll('input[type="checkbox"][name="finding"]'))) { click(box); }
            expect(buttonNamed('ยืนยันส่งกลับให้แก้ไข')!.disabled).toBe(true);
        });
    });

    it('OTHER reveals a required reason box with a counter; confirm waits for 10 characters and sends the typed reason', async () => {
        render(base);
        click(buttonNamed('ไม่ให้การรับรอง'));
        expect(document.querySelectorAll('textarea')).toHaveLength(2);
        click(document.querySelector('input[value="OTHER"]')!);
        const boxes = document.querySelectorAll('textarea');
        expect(boxes).toHaveLength(3);
        const reasonBox = document.querySelector('textarea[data-field="reason-text"]') as HTMLTextAreaElement;
        expect(reasonBox).toBeDefined();
        expect(reasonBox.maxLength).toBe(500);
        expect(document.body.textContent).toContain('ระบุเหตุผล');
        expect(document.body.textContent).toContain('0/500');
        typeInto(reasonBox, '  สั้นไป  ');
        expect(document.body.textContent).toContain('6/500');
        expect(buttonNamed('ยืนยันไม่ให้การรับรอง')!.disabled).toBe(true);
        typeInto(reasonBox, '  แปลงที่ตรวจไม่ใช่แปลงที่ยื่นไว้  ');
        typeInto(considerationBox(), CONSIDERATION);
        expect(buttonNamed('ยืนยันไม่ให้การรับรอง')!.disabled).toBe(false);
        await act(async () => { buttonNamed('ยืนยันไม่ให้การรับรอง')!.click(); });
        const [, init] = mockRequest.mock.calls[0];
        expect(JSON.parse(String(init?.body))).toEqual({
            reasonCode: 'OTHER', reasonText: 'แปลงที่ตรวจไม่ใช่แปลงที่ยื่นไว้', consideration: CONSIDERATION, note: '',
        });
    });

    it('switching from OTHER back to a listed reason hides the box and sends no typed reason', async () => {
        render(base);
        click(buttonNamed('ไม่ให้การรับรอง'));
        click(document.querySelector('input[value="OTHER"]')!);
        typeInto(document.querySelector('textarea[data-field="reason-text"]') as HTMLTextAreaElement, 'ข้อความที่ไม่ควรถูกส่งไป');
        click(document.querySelector('input[value="FALSE_INFORMATION"]')!);
        expect(document.querySelectorAll('textarea')).toHaveLength(2);
        typeInto(considerationBox(), CONSIDERATION);
        await act(async () => { buttonNamed('ยืนยันไม่ให้การรับรอง')!.click(); });
        const [, init] = mockRequest.mock.calls[0];
        expect(JSON.parse(String(init?.body))).toEqual({ reasonCode: 'FALSE_INFORMATION', consideration: CONSIDERATION, note: '' });
    });

    it('a typed reason with markup is shown as text, never as markup', () => {
        const typed = 'แปลงไม่ตรง <b>ตรวจพบ</b> <img src=x onerror=alert(1)>';
        render({ ...base, decidable: false, decision: { outcome: 'REFUSED', decidedAt: null, reasonLabel: typed } } as DecisionFile);
        expect(container.textContent).toContain(typed);
        expect(container.querySelector('b, img')).toBeNull();
        expect(container.innerHTML).toContain('&lt;b&gt;');
    });

    it('a refused request keeps the dialog open with the server\'s reason', async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'กรุณาเปิดแฟ้มคำขอและตรวจหลักฐานก่อนตัดสิน' });
        render(base);
        click(buttonNamed('อนุมัติให้การรับรอง'));
        typeInto(document.querySelector('textarea')!, 'หลักฐานครบ');
        await act(async () => { buttonNamed('ยืนยันอนุมัติและออกใบรับรอง')!.click(); });
        expect(document.querySelector('[role="alert"]')?.textContent).toContain('กรุณาเปิดแฟ้มคำขอ');
        expect(mockPush).not.toHaveBeenCalled();
    });

    it('a decided file shows its outcome and no decision buttons', () => {
        render({ ...base, decidable: false, decision: { outcome: 'REFUSED', decidedAt: null, reasonLabel: 'ข้อมูลหรือเอกสารที่ยื่นไม่ตรงกับความจริง' } } as DecisionFile);
        expect(container.textContent).toContain('ไม่ให้การรับรอง');
        expect(container.textContent).toContain('ข้อมูลหรือเอกสารที่ยื่นไม่ตรงกับความจริง');
        expect(buttonNamed('อนุมัติให้การรับรอง')).toBeUndefined();
    });
});

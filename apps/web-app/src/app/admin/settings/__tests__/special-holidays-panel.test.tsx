/**
 * วันหยุดพิเศษ (operator order 32, 2026-10-07): the DTAM admin adds a special holiday as dated
 * data, without a deploy. The server owns the rule (append-only, system_admin_dtam only); this
 * pins that the screen lists what the server holds, sends what the admin typed, and says in
 * Thai why the server refused.
 */

import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type ApiResult = { success: boolean; error?: string; code?: string; errorCode?: string; data?: unknown };
const mockGet = jest.fn<(url: string) => Promise<ApiResult>>();
const mockPost = jest.fn<(url: string, body?: unknown) => Promise<ApiResult>>();

jest.mock('@/lib/api/api-client', () => ({
    apiClient: {
        get: (url: string) => mockGet(url),
        post: (url: string, body?: unknown) => mockPost(url, body),
    },
}));

import { SpecialHolidaysPanel } from '../special-holidays-panel';

const ROW = { id: 'h1', date: '2026-12-30', name: 'วันหยุดพิเศษสิ้นปี', reason: 'มติ ครม. 2026-12-01', createdBy: 'u1', createdAt: '2026-12-01T03:00:00.000Z' };

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const mount = async () => {
    act(() => { root.render(<SpecialHolidaysPanel />); });
    await flush();
};
const addButton = () => Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'เพิ่มวันหยุดพิเศษ')!;
const fill = (testId: string, value: string) => {
    const box = host.querySelector(`[data-testid="${testId}"]`) as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
        setter.call(box, value);
        box.dispatchEvent(new Event('input', { bubbles: true }));
    });
};
const fillAll = () => {
    fill('holiday-date', '2027-01-04');
    fill('holiday-name', 'วันหยุดพิเศษต้นปี');
    fill('holiday-reason', 'มติ ครม. 2026-12-20');
};

describe('SpecialHolidaysPanel', () => {
    it('lists the holidays the server holds', async () => {
        mockGet.mockResolvedValue({ success: true, data: [ROW] });
        await mount();
        expect(mockGet).toHaveBeenCalledWith('/admin/special-holidays');
        expect(host.textContent).toContain('วันหยุดพิเศษสิ้นปี');
        expect(host.textContent).toContain('มติ ครม. 2026-12-01');
    });

    it('keeps the add button off until date, name and a 5-character reason are typed', async () => {
        mockGet.mockResolvedValue({ success: true, data: [] });
        await mount();
        expect(addButton().disabled).toBe(true);
        fill('holiday-date', '2027-01-04');
        fill('holiday-name', 'วันหยุดพิเศษต้นปี');
        fill('holiday-reason', 'สั้น');
        expect(addButton().disabled).toBe(true);
        fill('holiday-reason', 'มติ ครม. 2026-12-20');
        expect(addButton().disabled).toBe(false);
    });

    it('sends what the admin typed and reloads the list', async () => {
        mockGet.mockResolvedValueOnce({ success: true, data: [] }).mockResolvedValueOnce({ success: true, data: [ROW] });
        mockPost.mockResolvedValue({ success: true, data: ROW });
        await mount();
        fillAll();
        await act(async () => { addButton().click(); });
        await flush();
        expect(mockPost).toHaveBeenCalledWith('/admin/special-holidays', {
            date: '2027-01-04', name: 'วันหยุดพิเศษต้นปี', reason: 'มติ ครม. 2026-12-20',
        });
        expect(mockGet).toHaveBeenCalledTimes(2);
        expect(host.textContent).toContain('วันหยุดพิเศษสิ้นปี');
    });

    it.each([
        ['SPECIAL_HOLIDAY_EXISTS', 'วันนี้เป็นวันหยุดพิเศษอยู่แล้ว'],
        ['SPECIAL_HOLIDAY_ADMIN_ONLY', 'เฉพาะผู้ดูแลระบบฝั่งกรม'],
    ])('says in Thai why the server refused %s', async (code, text) => {
        mockGet.mockResolvedValue({ success: true, data: [] });
        mockPost.mockResolvedValue({ success: false, code, error: code });
        await mount();
        fillAll();
        await act(async () => { addButton().click(); });
        await flush();
        expect(host.querySelector('[role="alert"]')?.textContent).toContain(text);
    });
});

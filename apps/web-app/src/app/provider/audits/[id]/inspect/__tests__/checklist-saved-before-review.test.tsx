import * as React from 'react';
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockGetOnsiteContext = jest.fn();
const mockSubmitChecklistItem = jest.fn();

jest.mock('@/lib/services/audit-service', () => ({
    AuditService: {
        getOnsiteContext: (...args: unknown[]) => mockGetOnsiteContext(...args),
        startInspection: jest.fn(),
        verifyGps: jest.fn().mockResolvedValue({ success: false }),
        submitChecklistItem: (...args: unknown[]) => mockSubmitChecklistItem(...args),
        uploadPhoto: jest.fn(),
        submitDecision: jest.fn(),
    },
}));

jest.mock('@/lib/notifications', () => ({
    notifications: { show: jest.fn() },
}));

import InspectClient from '../client-view';

const ITEMS = ['1.1', '1.2', '2.1'].map((itemId) => ({
    itemId, title: `ข้อ ${itemId}`, description: `ข้อ ${itemId}`, required: true,
}));

const resumedContext = {
    audit: {
        id: 'aud-1', applicationId: 'app-1', applicationNumber: 'APP-2569-TEST',
        applicantName: 'ผู้ยื่น ทดสอบ', farmAddress: 'ต.ทดสอบ', farmLat: 18.78, farmLng: 98.98,
    },
    checklist: ITEMS,
    savedAnswers: [],
    startedAt: '2026-10-21T07:55:00.000Z',
};

async function settle(rounds = 8): Promise<void> {
    for (let i = 0; i < rounds; i += 1) {
        await act(async () => { await Promise.resolve(); });
    }
}

function button(container: HTMLElement, text: string): HTMLButtonElement | undefined {
    return Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;
}

describe('F-A8-04 ทุกคำตอบถึงเซิร์ฟเวอร์ก่อนหน้าทบทวน', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        jest.clearAllMocks();
        mockGetOnsiteContext.mockResolvedValue({ success: true, data: resumedContext });
        Object.defineProperty(globalThis.navigator, 'geolocation', {
            configurable: true,
            value: {
                getCurrentPosition: (ok: PositionCallback) => ok({
                    coords: { latitude: 18.78, longitude: 98.98, accuracy: 5 },
                } as GeolocationPosition),
            },
        });
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
    });

    async function answerAllYes(): Promise<void> {
        await act(async () => { root.render(<InspectClient applicationId="app-1" />); });
        await settle();
        const yes = Array.from(container.querySelectorAll('button')).filter((b) => b.textContent === 'ใช่');
        expect(yes).toHaveLength(ITEMS.length);
        for (const b of yes) {
            await act(async () => { b.click(); });
        }
    }

    it('sends every answer before the review screen opens, without waiting for a timer', async () => {
        mockSubmitChecklistItem.mockResolvedValue({ success: true, data: { ok: true } });
        await answerAllYes();

        await act(async () => { button(container, 'ทบทวนผลการตรวจ')!.click(); });
        await settle();

        const sent = mockSubmitChecklistItem.mock.calls.map(([, item]) => (item as { itemId: string; answer: string }));
        expect(sent.map((i) => i.itemId).sort()).toEqual(['1.1', '1.2', '2.1']);
        expect(sent.every((i) => i.answer === 'YES')).toBe(true);
        expect(container.textContent).toContain('สรุปผลการตรวจ');
    });

    it('stays on the checklist and says in Thai which answers were not saved when the server refuses one', async () => {
        mockSubmitChecklistItem.mockImplementation(async (_auditId: unknown, item: unknown) => (
            (item as { itemId: string }).itemId === '1.2'
                ? { success: false, error: 'Network Error' }
                : { success: true, data: { ok: true } }
        ));
        await answerAllYes();

        await act(async () => { button(container, 'ทบทวนผลการตรวจ')!.click(); });
        await settle();

        expect(container.textContent).not.toContain('สรุปผลการตรวจ');
        const alert = container.querySelector('[role="alert"]');
        expect(alert?.textContent).toMatch(/[ก-๙]/);
        expect(alert?.textContent).toContain('ข้อ 1.2');
        expect(alert?.textContent).not.toContain('Network Error');

        mockSubmitChecklistItem.mockResolvedValue({ success: true, data: { ok: true } });
        await act(async () => { button(container, 'ทบทวนผลการตรวจ')!.click(); });
        await settle();
        expect(container.textContent).toContain('สรุปผลการตรวจ');
        const retried = mockSubmitChecklistItem.mock.calls.slice(3).map(([, item]) => (item as { itemId: string }).itemId);
        expect(retried).toEqual(['1.2']);
    });

    it('F-A8-10: the review list shows each answer in Thai, never YES/NO/NA', async () => {
        mockSubmitChecklistItem.mockResolvedValue({ success: true, data: { ok: true } });
        await answerAllYes();
        await act(async () => { button(container, 'ทบทวนผลการตรวจ')!.click(); });
        await settle();

        const list = Array.from(container.querySelectorAll('li')).map((li) => li.textContent || '');
        expect(list).toHaveLength(ITEMS.length);
        expect(list.every((t) => t.endsWith('ใช่'))).toBe(true);
        expect(container.textContent).not.toMatch(/\bYES\b|\bNO\b|\bNA\b/);
    });
});

/**
 * A refused application's page says it was not certified, and why (U1 screenshot 08 read
 * "คำขอหมดเวลาแก้ไขและถูกยกเลิก" on a refusal): the reason, the approver's consideration and the
 * date from the order, and where the official letter is. No appeal button yet (order 83).
 */
import * as React from 'react';
import { describe, expect, it, afterEach, beforeEach } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {

    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { NotCertifiedCard } from '../not-certified-card';
import { ACTION_META } from '../application-detail-page-config';

describe('the page of an application that was not certified', () => {
    let container: HTMLDivElement;
    let root: Root;
    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
    });

    it('the action card names the outcome; the cancelled and expired card no longer claims a missed correction', () => {
        expect(ACTION_META.NOT_CERTIFIED).toEqual(expect.objectContaining({ title: 'ไม่ได้รับการรับรอง', buttonLabel: 'ยื่นคำขอใหม่' }));
        expect(ACTION_META.NOT_CERTIFIED.hint).not.toContain('หมดเวลา');
        expect(ACTION_META.REAPPLY.hint).not.toContain('หมดเวลาแก้ไข');
    });

    it('the card shows the reason, the consideration, the date and the letter, and offers no appeal', () => {
        act(() => {
            root.render(<NotCertifiedCard refusal={{
                reasonLabel: 'พบข้อบกพร่องร้ายแรงที่ขัดต่อมาตรฐาน GACP และแก้ไขให้เป็นไปตามมาตรฐานไม่ได้',
                consideration: 'ข้อบกพร่องทั้งสองข้อกระทบการควบคุมผลผลิตโดยตรง',
                decidedAt: '2026-10-14T09:00:00.000Z',
            }} />);
        });
        const text = container.textContent || '';
        expect(text).toContain('ไม่ได้รับการรับรอง');
        expect(text).toContain('พบข้อบกพร่องร้ายแรงที่ขัดต่อมาตรฐาน GACP');
        expect(text).toContain('ข้อบกพร่องทั้งสองข้อกระทบการควบคุมผลผลิตโดยตรง');
        expect(text).toContain('2569');
        expect(container.querySelector('a[href="/health/notifications"]')?.textContent).toContain('หนังสือแจ้งคำสั่ง');
        expect(text).not.toContain('อุทธรณ์');
    });
});

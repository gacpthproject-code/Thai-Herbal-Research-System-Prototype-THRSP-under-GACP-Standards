/**
 * รอบแก้ 3 ข้อ 5 (รีวิว L2 ของ 97d7ea80e) — Button แบบลิงก์ (href) ที่ disabled
 * ต้องประกาศ aria-disabled, ออกจากลำดับ Tab และไม่ยิง onClick (รวมถึงกด Enter บนลิงก์ที่โฟกัสอยู่)
 * เดิมมีแค่ pointer-events-none ซึ่งกันเมาส์แต่ไม่กันคีย์บอร์ด และ cc39a8a60 เพิ่งส่ง onClick ถึง <a>
 */

import * as React from 'react';
import { describe, expect, it, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {

    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { Button } from '../primitives/button';

describe('Button href + disabled', () => {
    let container: HTMLDivElement | null = null;
    let root: Root | null = null;
    afterEach(() => {
        if (root) { act(() => { root?.unmount(); }); root = null; }
        if (container) { container.remove(); container = null; }
    });
    function mount(ui: React.ReactElement) {
        container = document.createElement('div');
        document.body.appendChild(container);
        act(() => { root = createRoot(container!); root.render(ui); });
        return container.querySelector('a')!;
    }
    const press = (el: Element, key: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

    it('ประกาศ aria-disabled และ tabIndex -1 และคลิกไม่เรียก onClick', () => {
        const onClick = jest.fn();
        const a = mount(<Button href="/x" disabled onClick={onClick}>ไป</Button>);
        expect(a.getAttribute('aria-disabled')).toBe('true');
        expect(a.tabIndex).toBe(-1);
        const click = new MouseEvent('click', { bubbles: true, cancelable: true });
        act(() => { a.dispatchEvent(click); });
        expect(onClick).not.toHaveBeenCalled();
        expect(click.defaultPrevented).toBe(true);
    });

    it('กด Enter บนลิงก์ที่ disabled ไม่เรียก onClick', () => {
        const onClick = jest.fn();
        const a = mount(<Button href="/x" disabled onClick={onClick}>ไป</Button>);
        act(() => { press(a, 'Enter'); a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
        expect(onClick).not.toHaveBeenCalled();
    });

    it('ลิงก์ที่ไม่ disabled ไม่ประกาศ aria-disabled และ onClick ทำงาน', () => {
        const onClick = jest.fn();
        const a = mount(<Button href="/x" onClick={onClick}>ไป</Button>);
        expect(a.hasAttribute('aria-disabled')).toBe(false);
        expect(a.tabIndex).toBe(0);
        act(() => { a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
        expect(onClick).toHaveBeenCalledTimes(1);
    });
});

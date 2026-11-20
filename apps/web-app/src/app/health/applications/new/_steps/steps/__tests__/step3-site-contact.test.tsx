/**
 * Order 65(2), 2026-10-09: step 3 asks the on-site contact's name and phone, both required, with a
 * one-tap "ใช้ชื่อและเบอร์ของฉัน". A contact who is someone else needs the applicant's confirmation
 * that they were told the officer will call and meet them at the site.
 */

import * as React from 'react';
import { describe, expect, it, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import Step3SiteLand from '../step3-site-land';

const ME = { name: 'สมชาย ใจดี', phone: '081-234-5678' };

function render(farmData: Record<string, unknown>) {
    const onChange = jest.fn<(key: string, value: unknown) => void>();
    const onPatch = jest.fn<(patch: Record<string, unknown>) => void>();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
        root.render(<Step3SiteLand farmData={farmData} slots={[]} appId="app-1" onChange={onChange} onPatch={onPatch} onChanged={() => undefined} me={ME} />);
    });
    return { container, onChange, onPatch, unmount: () => { act(() => root.unmount()); container.remove(); } };
}

const button = (container: HTMLElement, text: string) => Array.from(container.querySelectorAll('button')).find((b) => (b.textContent || '').includes(text));
const labelFor = (container: HTMLElement, id: string) => container.querySelector(`label[for="${id}"]`)?.textContent || '';

describe('step 3: the on-site contact', () => {
    it('asks the name and the phone as required fields', () => {
        const view = render({});
        expect(labelFor(view.container, 'site-contact-name')).toContain('(บังคับ)');
        expect(labelFor(view.container, 'site-phone')).toContain('(บังคับ)');
        view.unmount();
    });

    it('"ใช้ชื่อและเบอร์ของฉัน" fills both with the applicant\'s own and marks the contact as the applicant', () => {
        const view = render({});
        act(() => { button(view.container, 'ใช้ชื่อและเบอร์ของฉัน')!.click(); });
        // One patch, so the three answers land together on the wizard's store.
        expect(view.onPatch).toHaveBeenCalledWith({ siteContactName: 'สมชาย ใจดี', sitePhone: '081-234-5678', siteContactIsApplicant: true });
        view.unmount();
    });

    it('a contact who is someone else is asked to be confirmed as told', () => {
        const view = render({ siteContactName: 'นายสมศักดิ์ ดูแลแปลง', sitePhone: '0865556666', siteContactIsApplicant: false });
        const confirm = view.container.querySelector<HTMLButtonElement>('[role="checkbox"]#site-contact-informed');
        expect(confirm?.getAttribute('aria-checked')).toBe('false');
        expect(confirm).not.toBeNull();
        expect(view.container.textContent).toContain('ได้แจ้งผู้ติดต่อแล้วว่าเจ้าหน้าที่จะโทรนัดและพบที่แปลง');
        act(() => { confirm!.click(); });
        expect(view.onChange).toHaveBeenCalledWith('siteContactInformed', true);
        view.unmount();
    });

    it('the applicant as the contact is not asked to confirm', () => {
        const view = render({ siteContactName: 'สมชาย ใจดี', sitePhone: '081-234-5678', siteContactIsApplicant: true });
        expect(view.container.querySelector('#site-contact-informed')).toBeNull();
        view.unmount();
    });

    it('a phone that is not a Thai number says so', () => {
        const view = render({ siteContactName: 'สมชาย ใจดี', sitePhone: '12345', siteContactIsApplicant: false });
        expect(view.container.textContent).toContain('กรอกเบอร์โทรศัพท์ไทย');
        view.unmount();
    });
});

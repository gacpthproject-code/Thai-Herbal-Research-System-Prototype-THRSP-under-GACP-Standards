/**
 * The change-role modal offers exactly the roles the signed-in admin may assign
 * (roleOptionsAssignableBy, orders 13 and 34(2)) and posts each one's canonical lowercase word.
 * The DTAM admin gets the DTAM-side roles and the applicant role, never the company finance role.
 * The 2026-09-10 role sweep left it with a duplicate finance_officer_platform row
 * ("เลกาซี ACCOUNT"), the retired DOCUMENT_REVIEWER / HEALTH spellings, and no
 * certificate_approver, so an admin could not appoint an approver from this modal.
 * system_admin_platform and system are absent on purpose: changeUserRole refuses the
 * first (403) and the second is not a person. Rendered for real.
 */
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { roleOptionsAssignableBy } from '@/lib/constants/admin-role-options';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@/lib/services/admin-service-b28', () => ({ AdminB28Service: { changeRole: jest.fn() } }));

import { ChangeRoleModal } from '../ChangeRoleModal';

const CANONICAL = [
    'document_reviewer', 'dispatcher', 'field_inspector', 'certificate_approver',
    'finance_officer_dtam', 'system_admin_dtam', 'health',
];

let container: HTMLDivElement;
let root: Root;
const submitHandler = jest.fn(async (_id: string, _role: string, _reason: string) => ({ success: true }));

beforeEach(() => {
    submitHandler.mockClear();
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

async function mount(currentRole = 'system_admin_platform', viewerRole = 'system_admin_dtam') {
    await act(async () => {
        root.render(<ChangeRoleModal open userId="u-9" userLabel="สมชาย" currentRole={currentRole} viewerRole={viewerRole} onClose={() => {}} submitHandler={submitHandler} />);
    });
}

function setValue(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) {
    const proto = Object.getPrototypeOf(el) as object;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}

const q = <T extends Element>(id: string) => container.querySelector<T>(`[data-testid="${id}"]`)!;

describe('ChangeRoleModal role options', () => {
    it('offers the DTAM admin exactly its assignable roles, once each, in canonical order', async () => {
        await mount();
        const values = Array.from(q<HTMLSelectElement>('change-role-select').options).map((o) => o.value).filter(Boolean);
        expect(values).toEqual(CANONICAL);
        expect(values).toEqual(roleOptionsAssignableBy('system_admin_dtam').map((o) => o.value));
    });

    it('offers a signed-in user who is not an admin nothing to choose', async () => {
        await mount('dispatcher', 'dispatcher');
        const values = Array.from(q<HTMLSelectElement>('change-role-select').options).map((o) => o.value).filter(Boolean);
        expect(values).toEqual([]);
    });

    it.each(CANONICAL)('choosing %s posts that canonical word', async (role) => {
        await mount();
        await act(async () => {
            setValue(q('change-role-select'), role);
            setValue(q('change-role-reason'), 'ย้ายงานตามคำสั่งกรม');
            setValue(q('change-role-confirm'), 'CONFIRM');
        });
        await act(async () => { q<HTMLButtonElement>('change-role-submit').click(); });
        expect(submitHandler).toHaveBeenCalledWith('u-9', role, 'ย้ายงานตามคำสั่งกรม');
    });
});

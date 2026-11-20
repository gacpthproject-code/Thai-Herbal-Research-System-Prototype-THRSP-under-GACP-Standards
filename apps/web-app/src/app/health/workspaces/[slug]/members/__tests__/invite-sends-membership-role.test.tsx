/**
 * The invite form posts a membership role (OWNER/ADMIN/MANAGER/VIEWER), never a staff
 * role word. The 2026-09-10 role sweep (40f74080) turned the ADMIN option into
 * `system_admin_dtam`; POST /entities/:id/members answers that with 400, so an OWNER
 * could not invite an admin. Rendered for real with the doors mocked.
 */
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockGet = jest.fn<Promise<unknown>, [string]>();
const mockPost = jest.fn<Promise<unknown>, [string, unknown]>();
let mockEntityRole: 'OWNER' | 'ADMIN' = 'OWNER';

jest.mock('@/lib/api/api-client', () => ({
    apiClient: {
        get: (u: string) => mockGet(u),
        post: (u: string, body: unknown) => mockPost(u, body),
        delete: jest.fn(),
    },
}));
jest.mock('next/navigation', () => ({ useParams: () => ({ slug: 'acme' }) }));
jest.mock('@/lib/notifications', () => ({ notifications: { success: jest.fn(), error: jest.fn() } }));

import WorkspaceMembersPage from '../page';

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockImplementation(async (u: string) => (u.endsWith('/members')
        ? { success: true, data: [] }
        : { success: true, data: { id: 'e-1', type: 'JURISTIC', slug: 'acme', displayName: 'บริษัท ทดสอบ จำกัด', role: mockEntityRole, permissions: [] } }));
    mockPost.mockResolvedValue({ success: true, data: {} });
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

async function mount() {
    await act(async () => { root.render(<WorkspaceMembersPage />); });
    for (let i = 0; i < 3; i += 1) { await act(async () => { for (let j = 0; j < 10; j += 1) await Promise.resolve(); }); }
}

function setValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}

const roleSelect = () => container.querySelector<HTMLSelectElement>('select[aria-label="บทบาทของสมาชิกที่เชิญ"]')!;
const optionValues = () => Array.from(roleSelect().options).map((o) => o.value);

describe('invite form role values', () => {
    it('an OWNER is offered exactly the three invitable membership roles', async () => {
        await mount();
        expect(optionValues()).toEqual(['VIEWER', 'MANAGER', 'ADMIN']);
    });

    it('an ADMIN is not offered ADMIN', async () => {
        mockEntityRole = 'ADMIN';
        await mount();
        expect(optionValues()).toEqual(['VIEWER', 'MANAGER']);
        mockEntityRole = 'OWNER';
    });

    it.each(['VIEWER', 'MANAGER', 'ADMIN'])('choosing %s posts that role to the invite door', async (role) => {
        await mount();
        const input = container.querySelector<HTMLInputElement>('input[aria-label^="ค่าตัวระบุผู้ถูกเชิญ"]')!;
        await act(async () => { setValue(roleSelect(), role); setValue(input, '0812345678'); });
        const invite = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'เชิญ')!;
        await act(async () => { invite.click(); });
        expect(mockPost).toHaveBeenCalledWith('/entities/e-1/members', {
            inviteIdentifier: { type: 'phone', value: '0812345678' },
            role,
        });
        expect(container.textContent).not.toContain('undefined');
    });
});

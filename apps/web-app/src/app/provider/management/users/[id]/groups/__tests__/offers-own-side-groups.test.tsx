/**
 * /provider/management/users/[id]/groups — the add-group list offers only the groups the
 * signed-in admin may give (orders 13, 34(2)). A group is a secondary role; the backend
 * refuses a company group from the DTAM admin with 403 CROSS_SIDE_USER_CHANGE_FORBIDDEN, so
 * the screen must not offer one. The add button sends the group the list shows.
 */

import * as React from 'react';
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type ApiResult = { success: boolean; data?: unknown; error?: string };
const mockGet = jest.fn<(url: string) => Promise<ApiResult>>();
const mockPost = jest.fn<(url: string, body?: unknown) => Promise<ApiResult>>();
jest.mock('@/lib/api/api-client', () => ({
    apiClient: {
        get: (url: string) => mockGet(url),
        post: (url: string, body?: unknown) => mockPost(url, body),
        delete: jest.fn(),
    },
}));

jest.mock('@/lib/services/auth-provider', () => ({
    useAuth: () => ({ user: { id: 'admin-1', role: 'system_admin_dtam' }, isLoading: false }),
}));

jest.mock('@/lib/notifications', () => ({ notifications: { show: jest.fn() } }));

jest.mock('../../../../../components/provider-layout', () => {
    const Passthrough = ({ children }: { children: React.ReactNode }) => <>{children}</>;
    Passthrough.displayName = 'MockProviderLayout';
    return { __esModule: true, default: Passthrough };
});

import UserGroupsClient from '../client-view';

const DTAM_SIDE_GROUPS = [
    'document_reviewer', 'dispatcher', 'field_inspector', 'certificate_approver',
    'finance_officer_dtam', 'system_admin_dtam',
];

function membership(groupCode: string) {
    return {
        userId: 'staff-1', groupCode, titleTH: groupCode, titleEN: groupCode, isActive: true,
        assignedAt: '2026-10-01T00:00:00.000Z', assignedBy: 'admin-1',
    };
}

describe('the add-group list of the DTAM admin', () => {
    let container: HTMLDivElement | null = null;
    let root: Root | null = null;

    beforeEach(() => {
        jest.clearAllMocks();
        mockPost.mockResolvedValue({ success: true, data: {} });
    });

    afterEach(() => {
        if (root) {
            act(() => { root?.unmount(); });
            root = null;
        }
        container?.remove();
        container = null;
        document.body.innerHTML = '';
    });

    async function mount(memberships: unknown[]) {
        mockGet.mockResolvedValue({ success: true, data: memberships });
        container = document.createElement('div');
        document.body.appendChild(container);
        act(() => {
            root = createRoot(container!);
            root.render(<UserGroupsClient userId="staff-1" />);
        });
        for (let i = 0; i < 20; i++) {
            await act(async () => { await Promise.resolve(); });
        }
    }

    const options = () => Array.from(container!.querySelectorAll<HTMLOptionElement>('select[aria-label="เลือกกลุ่มผู้ใช้ที่จะเพิ่ม"] option'))
        .map((o) => o.value);

    it('offers the DTAM-side groups and no company group', async () => {
        await mount([]);
        expect(options()).toEqual(DTAM_SIDE_GROUPS);
    });

    it('pressing add sends the group the list shows first', async () => {
        await mount([membership('document_reviewer')]);
        expect(options()[0]).toBe('dispatcher');
        const add = Array.from(container!.querySelectorAll('button')).find((b) => (b.textContent || '').trim() === 'เพิ่ม');
        await act(async () => { add!.click(); });
        expect(mockPost).toHaveBeenCalledTimes(1);
        expect(mockPost.mock.calls[0][1]).toEqual({ groupCode: 'dispatcher' });
    });
});

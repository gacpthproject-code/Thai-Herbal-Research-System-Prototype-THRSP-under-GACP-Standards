/**
 * /provider/management — the add-staff dialog always sends a role the signed-in admin may give
 * (orders 13, 34(2); review L1 of fix/admin-role-split). The dialog used to open on the retired
 * word 'reviewer', which no dropdown option matches, so an admin who did not touch the position
 * sent a role the directory cannot read. Rendered with the real page; the admin fills every field
 * except the position and presses add.
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
        put: jest.fn(),
        delete: jest.fn(),
    },
}));

const mockViewer = { id: 'admin-1', role: 'system_admin_dtam' };
jest.mock('@/lib/services/auth-provider', () => ({
    useAuth: () => ({ user: mockViewer, isLoading: false }),
}));

jest.mock('sonner', () => ({
    toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));

jest.mock('next/navigation', () => {
    const router = { push: jest.fn(), replace: jest.fn(), refresh: jest.fn(), back: jest.fn(), prefetch: jest.fn() };
    return {
        useRouter: () => router,
        usePathname: () => '/provider/management',
        useSearchParams: () => new URLSearchParams(),
    };
});

jest.mock('../../components/provider-layout', () => {
    const Passthrough = ({ children }: { children: React.ReactNode }) => <>{children}</>;
    Passthrough.displayName = 'MockProviderLayout';
    return { __esModule: true, default: Passthrough };
});

import ProviderManagementPage from '../page';

describe('/provider/management — the add dialog sends a role of the admin\'s own side', () => {
    let container: HTMLDivElement | null = null;
    let root: Root | null = null;

    beforeEach(() => {
        jest.clearAllMocks();
        mockGet.mockImplementation(async (url: string) => (
            url === '/provider/directory' ? { success: true, data: [] } : { success: true, data: {} }
        ));
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

    async function flush(rounds = 20) {
        for (let i = 0; i < rounds; i++) {
            await act(async () => { await Promise.resolve(); });
        }
    }

    const dialog = () => document.body.querySelector('[role="dialog"]');
    const buttonByText = (scope: ParentNode, text: string) => Array.from(scope.querySelectorAll('button'))
        .find((b) => (b.textContent || '').trim() === text);

    async function type(placeholder: string, value: string) {
        const input = dialog()!.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`);
        expect(input).not.toBeNull();
        const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        await act(async () => {
            setValue.call(input, value);
            input!.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }

    async function addWithoutTouchingThePosition() {
        container = document.createElement('div');
        document.body.appendChild(container);
        act(() => {
            root = createRoot(container!);
            root.render(<ProviderManagementPage />);
        });
        await flush();
        await act(async () => { buttonByText(container!, 'เพิ่มพนักงาน')!.click(); });
        await flush(5);
        await type('1234567890123', '1234567890123');
        await type('ชื่อ', 'สมหญิง');
        await type('นามสกุล', 'ทดสอบ');
        await type('email@example.com', 'new-staff@example.test');
        await type('********', 'StrongPass10!');
        await act(async () => { buttonByText(dialog()!, 'เพิ่มพนักงาน')!.click(); });
        await flush(10);
    }

    it('the position field says it is required, not optional', async () => {
        mockViewer.role = 'system_admin_dtam';
        container = document.createElement('div');
        document.body.appendChild(container);
        act(() => {
            root = createRoot(container!);
            root.render(<ProviderManagementPage />);
        });
        await flush();
        await act(async () => { buttonByText(container!, 'เพิ่มพนักงาน')!.click(); });
        await flush(5);
        const labelRow = Array.from(dialog()!.querySelectorAll('label'))
            .find((l) => (l.textContent || '').trim() === 'ตำแหน่ง')!.parentElement!;
        expect(labelRow.textContent).toBe('ตำแหน่งจำเป็น');
    });

    it.each([
        ['system_admin_dtam', 'document_reviewer'],
        ['system_admin_platform', 'finance_officer_platform'],
    ])('%s: the request carries %s, a role it may give', async (viewerRole, expected) => {
        mockViewer.role = viewerRole;
        await addWithoutTouchingThePosition();
        expect(mockPost).toHaveBeenCalledTimes(1);
        const [url, body] = mockPost.mock.calls[0];
        expect(url).toBe('/provider/directory');
        expect((body as { role?: string }).role).toBe(expected);
    });
});

/**
 * /admin/users for the DTAM admin (orders 13, 34(2)): rows of company-side accounts carry no
 * manage menu and say who manages them; the change-role modal opened from a DTAM row offers
 * no company role. The backend refuses both anyway; the screen must not offer them.
 * Renders the real page, createRoot + act, per repo convention.
 */

import * as React from 'react';
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function row(id: string, role: string, email: string) {
    return {
        id, email, role, firstName: 'ทดสอบ', lastName: id, status: 'ACTIVE', isActive: true, isLocked: false,
        accountType: 'PROVIDER', authType: 'PROVIDER_ID', providerId: 'MASKED', healthId: null,
        createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', lastLoginAt: null,
    };
}
const DTAM_STAFF = row('dtam-1', 'dispatcher', 'dispatcher@example.test');
const COMPANY_FINANCE = row('company-1', 'finance_officer_platform', 'finance@example.test');
const PLATFORM_ADMIN = row('company-2', 'system_admin_platform', 'platform@example.test');

type ApiResult = { success: boolean; data?: unknown; error?: string };
const mockGet = jest.fn<(url: string) => Promise<ApiResult>>();
jest.mock('@/lib/api/api-client', () => ({
    apiClient: {
        get: (url: string) => mockGet(url),
        post: jest.fn(),
        patch: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
    },
}));

jest.mock('@/lib/services/auth-provider', () => ({
    useAuth: () => ({ user: { id: 'admin-1', role: 'system_admin_dtam' }, isLoading: false }),
}));

jest.mock('next/navigation', () => {
    const router = { push: jest.fn(), replace: jest.fn(), refresh: jest.fn(), back: jest.fn(), prefetch: jest.fn() };
    return {
        useRouter: () => router,
        usePathname: () => '/admin/users',
        useSearchParams: () => new URLSearchParams(),
    };
});

import AdminUsersPage from '../page';

describe('/admin/users — the DTAM admin manages only its own side', () => {
    let container: HTMLDivElement | null = null;
    let root: Root | null = null;

    beforeEach(() => {
        jest.clearAllMocks();
        mockGet.mockResolvedValue({
            success: true,
            data: { users: [DTAM_STAFF, COMPANY_FINANCE, PLATFORM_ADMIN], pagination: { total: 3 } },
        });
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

    async function mount() {
        container = document.createElement('div');
        document.body.appendChild(container);
        act(() => {
            root = createRoot(container!);
            root.render(<AdminUsersPage />);
        });
        await flush();
    }

    const menuFor = (email: string) => container!.querySelector(`summary[aria-label="การจัดการสำหรับ ${email}"]`);

    it('company accounts carry no manage menu and say who manages them', async () => {
        await mount();
        expect(container!.textContent).toContain('finance@example.test');
        for (const company of [COMPANY_FINANCE, PLATFORM_ADMIN]) {
            expect(menuFor(company.email)).toBeNull();
            expect(container!.querySelector(`[data-testid="managed-elsewhere-${company.id}"]`)?.textContent)
                .toBe('ผู้ดูแลบริษัทเป็นผู้จัดการ');
        }
        expect(menuFor(DTAM_STAFF.email)).not.toBeNull();
        expect(container!.querySelector(`[data-testid="managed-elsewhere-${DTAM_STAFF.id}"]`)).toBeNull();
    });

    it('the change-role modal opened from a DTAM row offers no company role', async () => {
        await mount();
        const changeRole = Array.from(menuFor(DTAM_STAFF.email)!.parentElement!.querySelectorAll('[role="menuitem"]'))
            .find((el) => (el.textContent || '').includes('เปลี่ยนบทบาท')) as HTMLButtonElement;
        await act(async () => { changeRole.click(); });
        await flush(5);
        const select = document.body.querySelector<HTMLSelectElement>('[data-testid="change-role-select"]');
        const offered = Array.from(select!.options).map((o) => o.value).filter(Boolean);
        expect(offered).toContain('finance_officer_dtam');
        expect(offered).not.toContain('finance_officer_platform');
        expect(offered).not.toContain('system_admin_platform');
    });
});

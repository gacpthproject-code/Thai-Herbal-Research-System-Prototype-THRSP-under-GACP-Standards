/**
 * /provider/management for the DTAM admin (orders 13, 34(2)): a company-side row carries no
 * edit, delete, unlock, group or permission button and says who manages it; a DTAM row keeps
 * them. The role dropdown is a Radix select that jsdom cannot open, so its source is checked
 * against the list function instead (the list itself is pinned in admin-role-options tests).
 */

import * as React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function member(id: string, role: string, firstName: string) {
    return {
        id, role, firstName, lastName: 'ทดสอบ', username: id, email: `${id}@example.test`, isActive: true,
        createdAt: '2026-09-01T00:00:00.000Z', lastLoginAt: null, loginAttempts: 0, isLocked: true,
        lockedUntil: '2026-10-09T10:00:00.000Z', twoFactorEnabled: false,
    };
}
const DTAM_STAFF = member('dtam-1', 'document_reviewer', 'กรม');
const COMPANY_FINANCE = member('company-1', 'finance_officer_platform', 'บริษัท');

type ApiResult = { success: boolean; data?: unknown; error?: string };
const mockGet = jest.fn<(url: string) => Promise<ApiResult>>();
jest.mock('@/lib/api/api-client', () => ({
    apiClient: {
        get: (url: string) => mockGet(url),
        post: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
    },
}));

jest.mock('@/lib/services/auth-provider', () => ({
    useAuth: () => ({ user: { id: 'admin-1', role: 'system_admin_dtam' }, isLoading: false }),
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

describe('/provider/management — the DTAM admin manages only its own side', () => {
    let container: HTMLDivElement | null = null;
    let root: Root | null = null;

    beforeEach(() => {
        jest.clearAllMocks();
        mockGet.mockImplementation(async (url: string) => (
            url === '/provider/directory' ? { success: true, data: [DTAM_STAFF, COMPANY_FINANCE] } : { success: true, data: {} }
        ));
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

    const buttonsNaming = (firstName: string) => Array.from(container!.querySelectorAll('button[aria-label]'))
        .map((b) => b.getAttribute('aria-label') || '')
        .filter((label) => label.includes(`${firstName} ทดสอบ`));

    it('a company row has no manage buttons and says who manages it; a DTAM row keeps them', async () => {
        container = document.createElement('div');
        document.body.appendChild(container);
        act(() => {
            root = createRoot(container!);
            root.render(<ProviderManagementPage />);
        });
        await flush();

        expect(buttonsNaming(COMPANY_FINANCE.firstName)).toEqual([]);
        expect(container!.querySelector(`[data-testid="mgmt-delete-${COMPANY_FINANCE.id}"]`)).toBeNull();
        expect(container!.querySelector(`[data-testid="managed-elsewhere-${COMPANY_FINANCE.id}"]`)?.textContent)
            .toBe('ผู้ดูแลบริษัทเป็นผู้จัดการ');

        expect(buttonsNaming(DTAM_STAFF.firstName)).toEqual(expect.arrayContaining([
            `แก้ไขพนักงาน ${DTAM_STAFF.firstName} ทดสอบ`,
            `ลบพนักงาน ${DTAM_STAFF.firstName} ทดสอบ`,
            `Unlock account for ${DTAM_STAFF.firstName} ทดสอบ`,
        ]));
        expect(container!.querySelector(`[data-testid="managed-elsewhere-${DTAM_STAFF.id}"]`)).toBeNull();
    });

    it('the role dropdown reads the roles of the signed-in admin\'s own side', () => {
        const page = fs.readFileSync(path.resolve(__dirname, '../page.tsx'), 'utf8');
        expect(page).toContain('data={staffRoleOptionsAssignableBy(viewerRole)');
        expect(page).not.toContain('ADMIN_ROLE_OPTIONS_FOR_NEW_USER');
    });
});

/**
 * F-A8b-14 (staging walk 2026-10-27): the platform admin's side menu showed seven
 * links while the route rules (provider-role-config.ts PROVIDER_AREAS) admit that
 * role to /admin/organizations only, so six links bounced silently. The menu is
 * filtered by the same rule the middleware applies.
 */

import * as React from 'react';
import { describe, expect, it, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockViewer: { id: string; role: string } = { id: 'admin-1', role: 'system_admin_dtam' };
jest.mock('@/lib/services/auth-provider', () => ({
    useAuth: () => ({ user: mockViewer, isLoading: false }),
}));

jest.mock('next/navigation', () => ({
    usePathname: () => '/admin/organizations',
}));

import AdminLayout from '../layout';

const ALL_ADMIN_LINKS = [
    '/admin/dashboard',
    '/admin/organizations',
    '/admin/users',
    '/admin/audit-log',
    '/admin/planting',
    '/admin/communication',
    '/admin/settings',
];

describe('/admin layout shows a role only the links it may open', () => {
    let container: HTMLDivElement | null = null;
    let root: Root | null = null;

    afterEach(() => {
        act(() => { root?.unmount(); });
        container?.remove();
        container = null;
        root = null;
    });

    function hrefsRenderedFor(role: string): string[] {
        mockViewer.role = role;
        container = document.createElement('div');
        document.body.appendChild(container);
        act(() => {
            root = createRoot(container!);
            root.render(<AdminLayout><p>เนื้อหา</p></AdminLayout>);
        });
        const hrefs = Array.from(container.querySelectorAll('nav a')).map((a) => a.getAttribute('href'));
        return Array.from(new Set(hrefs)).sort();
    }

    it('system_admin_platform sees exactly /admin/organizations, in both the mobile strip and the sidebar', () => {
        mockViewer.role = 'system_admin_platform';
        container = document.createElement('div');
        document.body.appendChild(container);
        act(() => {
            root = createRoot(container!);
            root.render(<AdminLayout><p>เนื้อหา</p></AdminLayout>);
        });
        const navs = Array.from(container.querySelectorAll('nav'));
        expect(navs).toHaveLength(2);
        for (const nav of navs) {
            expect(Array.from(nav.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual(['/admin/organizations']);
        }
    });

    it('system_admin_dtam sees all seven', () => {
        expect(hrefsRenderedFor('system_admin_dtam')).toEqual([...ALL_ADMIN_LINKS].sort());
    });
});

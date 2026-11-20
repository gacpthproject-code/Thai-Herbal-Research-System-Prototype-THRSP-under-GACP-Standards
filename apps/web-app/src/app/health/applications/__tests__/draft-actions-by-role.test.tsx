/**
 * D4 2026-10-06: a draft row offers "ดำเนินการต่อ" only to a member who may edit its
 * holder, and "ลบร่างคำขอนี้" only to the holder's OWNER or to the draft's creator who
 * may still edit (spec 2026-09-30-remove-workspace-mode §3.3, the rule the server's
 * holder-access.resolveHolderOwnerOrCreator enforces). Before the fix every member,
 * VIEWER included, saw both. Rendered for real with the doors mocked.
 */
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { COMPANY, VIEWER, entity } from '@/components/holder/__tests__/fixtures';
import type { EntityMembership } from '@/lib/services/my-entities-provider';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockGet = jest.fn<Promise<unknown>, [string]>();
let mockEntities: EntityMembership[] = [];

jest.mock('@/lib/api/api-client', () => ({
    apiClient: { get: (u: string) => mockGet(u), delete: jest.fn() },
    api: { get: (u: string) => mockGet(u), delete: jest.fn() },
}));
jest.mock('@/lib/services/auth-service', () => ({ AuthService: { getUser: () => ({ id: 'u-me', role: 'HEALTH' }) } }));
jest.mock('@/lib/services/my-entities-provider', () => ({
    useMyEntities: () => ({ entities: mockEntities, isLoading: false, error: null, refresh: async () => {} }),
}));
jest.mock('next/navigation', () => {
    const router = { push: jest.fn(), replace: jest.fn(), refresh: jest.fn(), back: jest.fn(), prefetch: jest.fn() };
    const params = new URLSearchParams();
    return { useRouter: () => router, usePathname: () => '/', useSearchParams: () => params };
});

import ApplicationsPage from '../client-view';
import { LanguageProvider } from '@/lib/i18n/language-context';

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

async function mountWith(entities: EntityMembership[], draft: { entityId: string; submitterId: string }) {
    mockEntities = entities;
    mockGet.mockResolvedValue({ success: true, data: [{ id: 'd1', applicationNumber: 'APP-0001', status: 'DRAFT', createdAt: '2026-10-01T00:00:00Z', farmName: 'ไร่ก', ...draft }] });
    await act(async () => { root.render(<LanguageProvider><ApplicationsPage /></LanguageProvider>); });
    for (let i = 0; i < 3; i += 1) { await act(async () => { for (let j = 0; j < 10; j += 1) await Promise.resolve(); }); }
    expect(container.textContent).toContain('APP-0001');
    return {
        continue: container.querySelector('a[href="/health/applications/d1/edit"]') !== null,
        delete: Array.from(container.querySelectorAll('button')).some((b) => b.textContent === 'ลบร่างคำขอนี้'),
    };
}

const MANAGER = entity({ id: 'e-company', role: 'MANAGER', can: { edit: true, submit: false, createFarm: true } });

describe('draft row actions follow the holder membership', () => {
    it('OWNER of the holder, draft filed by another member: continue and delete', async () => {
        expect(await mountWith([COMPANY], { entityId: 'e-company', submitterId: 'u-other' })).toEqual({ continue: true, delete: true });
    });

    it('MANAGER, draft filed by another member: continue only', async () => {
        expect(await mountWith([MANAGER], { entityId: 'e-company', submitterId: 'u-other' })).toEqual({ continue: true, delete: false });
    });

    it('MANAGER, the draft is their own: continue and delete', async () => {
        expect(await mountWith([MANAGER], { entityId: 'e-company', submitterId: 'u-me' })).toEqual({ continue: true, delete: true });
    });

    it('VIEWER: neither, even on a draft they filed before being made VIEWER', async () => {
        expect(await mountWith([VIEWER], { entityId: 'e-viewer', submitterId: 'u-me' })).toEqual({ continue: false, delete: false });
    });

    it('a holder missing from /entities/mine: neither (fail closed)', async () => {
        expect(await mountWith([COMPANY], { entityId: 'e-unknown', submitterId: 'u-me' })).toEqual({ continue: false, delete: false });
    });
});

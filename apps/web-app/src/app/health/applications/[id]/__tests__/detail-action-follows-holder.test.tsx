/**
 * The detail page's next-step button is offered only to a member whose holder
 * capability lets the door behind it succeed (the list's D4 rule, applied here):
 *   CONTINUE_DRAFT                       → can.edit   (POST /draft, /prepare)
 *   SUBMIT_REVISION, SUBMIT_CAR_EVIDENCE → can.submit (revision-resubmit and CAR doors: SUBMIT_APPLICATION)
 *   PAY_DOC_FEE, PAY_AUDIT_FEE           → can.submit (checkout and quotation accept: SUBMIT_APPLICATION)
 * A holder missing from /entities/mine gets none of them. Before the fix a VIEWER saw
 * every one and the server refused the press. Rendered for real with the doors mocked.
 */
import * as React from 'react';
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { COMPANY, VIEWER, entity } from '@/components/holder/__tests__/fixtures';
import type { EntityMembership } from '@/lib/services/my-entities-provider';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Envelope = { success: boolean; data?: unknown; error?: string };
const mockGet = jest.fn<(path: string) => Promise<Envelope>>();
let mockEntities: EntityMembership[] = [];
jest.mock('@/lib/api/api-client', () => {
    const api = { get: (path: string) => mockGet(path), post: jest.fn(), getBlob: jest.fn() };
    return { api, apiClient: api, ApiClient: function ApiClient() {} };
});
jest.mock('@/lib/api', () => {
    const api = { get: (path: string) => mockGet(path), post: jest.fn(), getBlob: jest.fn() };
    return { api, apiClient: api };
});
const mockRouter = { push: jest.fn(), replace: jest.fn(), refresh: jest.fn(), back: jest.fn(), prefetch: jest.fn() };
const mockParams = { id: 'app-1' };
jest.mock('next/navigation', () => ({
    useParams: () => mockParams,
    useRouter: () => mockRouter,
    usePathname: () => '/health/applications/app-1',
    useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/services/auth-service-session', () => ({ getStoredUser: () => ({ id: 'user-1', role: 'HEALTH' }) }));
jest.mock('@/lib/services/my-entities-provider', () => ({
    useMyEntities: () => ({ entities: mockEntities, isLoading: false, error: null, refresh: async () => {} }),
}));

import ApplicationDetailPage from '../client-view';

const STATUS_FOR: Record<string, string> = {
    CONTINUE_DRAFT: 'DRAFT',
    PAY_DOC_FEE: 'PENDING_DOC_FEE',
    SUBMIT_REVISION: 'REVISION_REQUESTED',
    SUBMIT_CAR_EVIDENCE: 'CAR_PENDING',
    PAY_AUDIT_FEE: 'PENDING_AUDIT_FEE',
};
const HREF_FOR: Record<string, string> = {
    CONTINUE_DRAFT: '/health/applications/app-1/edit',
    PAY_DOC_FEE: '/health/payments?app=app-1&phase=PHASE_1',
    SUBMIT_REVISION: '/health/applications/app-1/revision',
    SUBMIT_CAR_EVIDENCE: '/health/applications/app-1/car',
    PAY_AUDIT_FEE: '/health/payments?app=app-1&phase=PHASE_2',
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
    mockGet.mockReset();
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

/** True when the action card's button for `key` is on the page. */
async function offered(key: string, entities: EntityMembership[], entityId = 'e-company'): Promise<boolean> {
    mockEntities = entities;
    const status = STATUS_FOR[key];
    mockGet.mockImplementation(async (path: string) => {
        if (path.includes('/status')) return { success: true, data: { displayStatus: status, workflowState: status, actionCard: { key } } };
        if (path.includes('/history')) return { success: false };
        if (path.includes('/applications/app-1')) {
            return { success: true, data: { id: 'app-1', applicationId: 'app-1', applicationNumber: 'APP-1', status, entityId, createdAt: '2026-10-01T03:00:00.000Z', updatedAt: '2026-10-01T03:00:00.000Z' } };
        }
        return { success: false, error: 'unrouted ' + path };
    });
    await act(async () => { root.render(<ApplicationDetailPage />); });
    for (let i = 0; i < 4; i += 1) { await act(async () => { await Promise.resolve(); }); }
    expect(container.textContent).toContain('APP-1');
    return container.querySelector(`a[href="${HREF_FOR[key]}"]`) !== null;
}

const MANAGER = entity({ id: 'e-company', role: 'MANAGER', can: { edit: true, submit: false, createFarm: true } });
const VIEWER_OF_COMPANY = { ...VIEWER, id: 'e-company' };

describe('the detail action button follows the holder capability', () => {
    it.each(Object.keys(STATUS_FOR))('%s: OWNER sees it', async (key) => {
        expect(await offered(key, [COMPANY])).toBe(true);
    });

    it.each(Object.keys(STATUS_FOR))('%s: VIEWER does not', async (key) => {
        expect(await offered(key, [VIEWER_OF_COMPANY])).toBe(false);
    });

    it.each(Object.keys(STATUS_FOR))('%s: a holder missing from /entities/mine gets nothing', async (key) => {
        expect(await offered(key, [COMPANY], 'e-unknown')).toBe(false);
    });

    it('MANAGER (edit, no submit): continues a draft', async () => {
        expect(await offered('CONTINUE_DRAFT', [MANAGER])).toBe(true);
    });

    it.each(['PAY_DOC_FEE', 'SUBMIT_REVISION', 'SUBMIT_CAR_EVIDENCE', 'PAY_AUDIT_FEE'])('MANAGER (no submit): no %s', async (key) => {
        expect(await offered(key, [MANAGER])).toBe(false);
    });
});

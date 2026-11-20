/**
 * Order 41 (operator 2026-10-07): the application page shows the holder's money (amounts,
 * the payments link, the pay button) only to a member the server says may read it
 * (/entities/mine can.viewFinancial), and does not even ask the finance doors for the
 * others. Live walk F4: the withdraw button only for a member holding SUBMIT_APPLICATION.
 * Rendered for real with the doors mocked.
 */
import * as React from 'react';
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { COMPANY, entity } from '@/components/holder/__tests__/fixtures';
import type { EntityMembership } from '@/lib/services/my-entities-provider';
import { MONEY_HIDDEN_TH } from '@/lib/constants/finance-visibility';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Envelope = { success: boolean; data?: unknown; error?: string };
const mockGet = jest.fn<(path: string) => Promise<Envelope>>();
let mockEntities: EntityMembership[] = [];
jest.mock('@/lib/api/api-client', () => {
    const api = { get: (path: string) => mockGet(path), post: jest.fn(), getBlob: jest.fn() };
    return { apiClient: api, api, default: api };
});
jest.mock('@/lib/api', () => {
    const api = { get: (path: string) => mockGet(path), post: jest.fn(), getBlob: jest.fn() };
    return { apiClient: api, default: api };
});
const mockRouter = { push: jest.fn(), replace: jest.fn(), refresh: jest.fn(), back: jest.fn(), prefetch: jest.fn() };
const mockParams = { id: 'app-1' };
jest.mock('next/navigation', () => ({
    useParams: () => mockParams,
    useRouter: () => mockRouter,
}));
jest.mock('@/lib/services/auth-service-session', () => ({ getStoredUser: () => ({ id: 'user-1', role: 'HEALTH' }) }));
jest.mock('@/lib/services/my-entities-provider', () => ({
    useMyEntities: () => ({ entities: mockEntities, isLoading: false, error: null, refresh: async () => {} }),
}));

import ApplicationDetailPage from '../client-view';

const MANAGER_SUBMITS_NO_MONEY = entity({ id: 'e-company', role: 'MANAGER', can: { edit: true, submit: true, createFarm: true, viewFinancial: false } });
const MANAGER_NO_SUBMIT = entity({ id: 'e-company', role: 'MANAGER', can: { edit: true, submit: false, createFarm: true, viewFinancial: false } });

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
    mockGet.mockReset();
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

async function render(status: string, holder: EntityMembership, actionKey = 'WAITING') {
    mockEntities = [holder];
    mockGet.mockImplementation(async (path: string) => {
        if (path.includes('/status')) return { success: true, data: { displayStatus: status, workflowState: status, actionCard: { key: actionKey } } };
        if (path.includes('/history')) return { success: false };
        if (path.startsWith('/invoices/my')) {
            return { success: true, data: [{ id: 'inv-1', applicationId: 'app-1', invoiceNumber: 'INV-1', serviceType: 'CERTIFICATION_CHECKOUT_M1', totalAmount: 5885, status: 'PENDING' }] };
        }
        if (path.includes('/applications/app-1')) {
            return { success: true, data: { id: 'app-1', applicationId: 'app-1', applicationNumber: 'APP-1', status, entityId: 'e-company', createdAt: '2026-10-01T03:00:00.000Z', updatedAt: '2026-10-01T03:00:00.000Z' } };
        }
        return { success: false, error: 'unrouted ' + path };
    });
    await act(async () => { root.render(<ApplicationDetailPage />); });
    for (let i = 0; i < 4; i += 1) { await act(async () => { await Promise.resolve(); }); }
    expect(container.textContent).toContain('APP-1');
}

const paymentsLink = () => container.querySelector('a[href="/health/payments?app=app-1"]');
const payButton = () => container.querySelector('a[href^="/health/payments?app=app-1&phase="]');
const askedForInvoices = () => mockGet.mock.calls.some(([path]) => path.startsWith('/invoices/my'));
const withdraw = () => Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'ถอนคำขอ');

describe('money on the application page follows VIEW_FINANCIAL', () => {
    it('OWNER: the payments link, the invoice amount, no notice', async () => {
        await render('DOC_FEE_PAID', COMPANY);
        expect(paymentsLink()).not.toBeNull();
        expect(askedForInvoices()).toBe(true);
        expect(container.textContent).toContain('5,885');
        expect(container.textContent).not.toContain(MONEY_HIDDEN_TH);
    });

    it('a member without VIEW_FINANCIAL: no link, no amount, the finance doors are not asked, the notice says why', async () => {
        await render('DOC_FEE_PAID', MANAGER_SUBMITS_NO_MONEY);
        expect(paymentsLink()).toBeNull();
        expect(askedForInvoices()).toBe(false);
        expect(container.textContent).not.toMatch(/฿/);
        expect(container.textContent).toContain(MONEY_HIDDEN_TH);
    });

    it.each(['PAY_DOC_FEE', 'PAY_AUDIT_FEE'])('%s: no pay button for a submitter without VIEW_FINANCIAL; OWNER has it', async (key) => {
        const status = key === 'PAY_DOC_FEE' ? 'PENDING_DOC_FEE' : 'PENDING_AUDIT_FEE';
        await render(status, MANAGER_SUBMITS_NO_MONEY, key);
        expect(payButton()).toBeNull();
        act(() => root.unmount());
        root = createRoot(container);
        await render(status, COMPANY, key);
        expect(payButton()).not.toBeNull();
    });
});

describe('withdraw follows SUBMIT_APPLICATION (live walk F4)', () => {
    it('a MANAGER without SUBMIT_APPLICATION is not offered it', async () => {
        await render('DOC_FEE_PAID', MANAGER_NO_SUBMIT);
        expect(withdraw()).toBeUndefined();
    });

    it('control: the OWNER is', async () => {
        await render('DOC_FEE_PAID', COMPANY);
        expect(withdraw()).toBeDefined();
    });
});

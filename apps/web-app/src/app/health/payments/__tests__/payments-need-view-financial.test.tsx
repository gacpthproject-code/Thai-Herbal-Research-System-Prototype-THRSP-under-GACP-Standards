/**
 * Order 41: a member whose every holder says viewFinancial=false is told why the payments
 * page holds nothing for them, and the page asks no finance door. Control: one holder that
 * allows it renders the ordinary page.
 */
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { COMPANY, VIEWER } from '@/components/holder/__tests__/fixtures';
import type { EntityMembership } from '@/lib/services/my-entities-provider';
import { MONEY_HIDDEN_TH } from '@/lib/constants/finance-visibility';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockEntities: EntityMembership[] = [];
jest.mock('@/lib/services/my-entities-provider', () => ({
    useMyEntities: () => ({ entities: mockEntities, isLoading: false, error: null, refresh: async () => {} }),
}));
const mockGetMyPayments = jest.fn(async () => []);
jest.mock('@/lib/services/payment-service', () => {
    const actual = jest.requireActual('@/lib/services/payment-service') as Record<string, unknown>;
    return {
        ...actual,
        PaymentService: {
            getMyPayments: () => mockGetMyPayments(),
            getMyApplications: async () => [],
            getQuotations: async () => null,
        },
    };
});
jest.mock('@/lib/services/auth-service', () => ({ AuthService: { getUser: () => ({ id: 'user-1', role: 'HEALTH' }) } }));
const mockRouter = { push: jest.fn(), replace: jest.fn(), refresh: jest.fn(), back: jest.fn(), prefetch: jest.fn() };
const mockSearch = new URLSearchParams();
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter, useSearchParams: () => mockSearch }));

import HealthPaymentsPage from '../client-view';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
    mockGetMyPayments.mockClear();
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

async function render(entities: EntityMembership[]) {
    mockEntities = entities;
    await act(async () => { root.render(<HealthPaymentsPage />); });
    for (let i = 0; i < 4; i += 1) { await act(async () => { await Promise.resolve(); }); }
}

describe('payments page and VIEW_FINANCIAL', () => {
    it('no holder allows it: the notice, and no finance door is asked', async () => {
        await render([VIEWER]);
        expect(host.textContent).toContain(MONEY_HIDDEN_TH);
        // Ruling 2026-10-08: the OWNER grants this right per member, so the notice names who to ask.
        expect(host.textContent).toContain('ติดต่อเจ้าของบริษัทเพื่อขอสิทธิ์ดูข้อมูลการเงิน');
        expect(mockGetMyPayments).not.toHaveBeenCalled();
    });

    it('control: a holder that allows it renders the page and reads the invoices', async () => {
        await render([VIEWER, COMPANY]);
        expect(host.textContent).not.toContain(MONEY_HIDDEN_TH);
        expect(mockGetMyPayments).toHaveBeenCalled();
    });
});

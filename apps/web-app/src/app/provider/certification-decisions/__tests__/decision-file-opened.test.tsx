/**
 * Reading the file writes nothing on the server (security review 2026-10-07 F5): the page
 * records that the file rendered for this approver with its own POST, and only for a file that
 * can still be decided.
 */
import * as React from 'react';
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {

    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('next/navigation', () => ({
    useParams: () => ({ id: 'APP-9001' }),
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
    usePathname: () => '/provider/certification-decisions/APP-9001',
    useSearchParams: () => new URLSearchParams(),
}));
jest.mock('../../components/provider-layout', () => ({
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@/components/provider/launchpad', () => ({ LaunchpadHeader: () => null }));
jest.mock('../[id]/decision-file-view', () => ({ DecisionFileView: () => <div data-testid="file" /> }));
jest.mock('../[id]/decision-actions', () => ({ DecisionActions: () => null }));
const mockRequest = jest.fn<(path: string, init?: RequestInit) => Promise<{ success: boolean; data?: unknown }>>();
jest.mock('../../audits/auditor-types', () => ({
    PROVIDERRequest: (path: string, init?: RequestInit) => mockRequest(path, init),
}));

import CertificationDecisionFilePage from '../[id]/client-view';

const fileWith = (decidable: boolean) => ({ application: { id: 'app-1', applicationNumber: 'APP-9001' }, decidable, decision: null });
const flush = () => act(async () => { await new Promise((r) => { setTimeout(r, 0); }); });

describe('CertificationDecisionFilePage', () => {
    let container: HTMLDivElement;
    let root: Root;
    beforeEach(() => {
        jest.clearAllMocks();
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
    });

    it('a decidable file that rendered is recorded as opened with a POST, after the GET', async () => {
        mockRequest.mockImplementation(async (_path, init) => (init?.method === 'POST' ? { success: true } : { success: true, data: fileWith(true) }));
        act(() => { root.render(<CertificationDecisionFilePage />); });
        await flush();
        await flush();
        expect(container.querySelector('[data-testid="file"]')).not.toBeNull();
        expect(mockRequest.mock.calls.map(([path, init]) => [path, init?.method ?? 'GET'])).toEqual([
            ['/api/provider/auditor/applications/APP-9001/decision-file', 'GET'],
            ['/api/provider/auditor/applications/app-1/decision-file/opened', 'POST'],
        ]);
    });

    it('a file already decided is not recorded as opened', async () => {
        mockRequest.mockResolvedValue({ success: true, data: fileWith(false) });
        act(() => { root.render(<CertificationDecisionFilePage />); });
        await flush();
        await flush();
        expect(mockRequest.mock.calls.filter(([, init]) => init?.method === 'POST')).toEqual([]);
    });
});

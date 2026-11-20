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
const mockPut = jest.fn<(url: string, body?: unknown) => Promise<ApiResult>>();
jest.mock('@/lib/api/api-client', () => ({
    apiClient: { get: (url: string) => mockGet(url), put: (url: string, body?: unknown) => mockPut(url, body) },
}));
jest.mock('@/lib/notifications', () => ({ notifications: { show: jest.fn() } }));
jest.mock('@/contexts/config-context', () => ({ useConfig: () => ({ refreshConfigs: jest.fn() }) }));
jest.mock('@/app/provider/components/provider-layout', () => {
    const Passthrough = ({ children }: { children: React.ReactNode }) => <>{children}</>;
    Passthrough.displayName = 'MockProviderLayout';
    return { __esModule: true, default: Passthrough };
});
jest.mock('@/components/feature', () => ({
    SummaryHeader: ({ title }: { title: string }) => <h2>{title}</h2>,
}));

import SystemConfigPage from '../client-view';

const ROWS = [
    { id: '1', key: 'contact_support_phone', value: '02-123-4567', type: 'STRING', description: 'หมายเลขโทรศัพท์ฝ่ายสนับสนุน', group: 'ข้อมูลติดต่อ', enabled: null },
    { id: '2', key: 'feature.document_repo', value: 'true', type: 'BOOLEAN', description: 'แสดงหน้าเอกสารของฉัน', group: 'หน้าจอ', enabled: true },
    { id: '3', key: 'feature.export_documents', value: 'false', type: 'BOOLEAN', description: 'แสดงเอกสารส่งออก', group: 'หน้าจอ', enabled: false },
];

let container: HTMLDivElement;
let root: Root;

async function mount(): Promise<void> {
    mockGet.mockResolvedValue({ success: true, data: ROWS });
    await act(async () => { root.render(<SystemConfigPage />); });
    await act(async () => { await Promise.resolve(); });
}

const switchFor = (key: string): HTMLButtonElement | null =>
    container.querySelector<HTMLButtonElement>(`button[aria-label^="${key} "]`);

beforeEach(() => {
    mockGet.mockReset();
    mockPut.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
});

describe('system settings page (review M5)', () => {
    it('shows a STRING key read-only with its stored value and no switch', async () => {
        await mount();
        expect(switchFor('contact_support_phone')).toBeNull();
        expect(container.querySelector('[data-testid="config-value-contact_support_phone"]')?.textContent).toBe('02-123-4567');
    });

    it('shows a BOOLEAN key\'s switch from the server\'s reading, never from the stored string\'s truthiness', async () => {
        await mount();
        expect(switchFor('feature.document_repo')?.getAttribute('aria-pressed')).toBe('true');
        expect(switchFor('feature.export_documents')?.getAttribute('aria-pressed')).toBe('false');
    });

    it('a switch sends the stored form the column takes, never a JSON boolean', async () => {
        await mount();
        mockPut.mockResolvedValue({ success: true });
        await act(async () => { switchFor('feature.export_documents')?.click(); });
        expect(mockPut).toHaveBeenCalledWith('/system-config/feature.export_documents', { value: 'true' });
        expect(switchFor('feature.export_documents')?.getAttribute('aria-pressed')).toBe('true');
    });
});

/**
 * ต่ออายุเริ่มจากปุ่ม "เริ่มยื่นต่ออายุ" บนหน้าต่ออายุ ซึ่งพามาที่
 * /health/applications/new?renew=<เลขที่ใบรับรอง> · ผู้ยื่นกดปุ่มมาเอง ขั้นที่ 1 จึงตั้ง
 * ประเภทคำขอเป็นต่ออายุและเลขที่ใบรับรองเดิมให้ แต่ไม่ทับคำตอบที่มีอยู่แล้ว
 */
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockUpdateState = jest.fn();
let mockState: Record<string, unknown> = {};
let mockSearch = '';

jest.mock('../../hooks/use-application-flow-store', () => ({
    useApplicationFlowStore: () => ({ state: mockState, updateState: mockUpdateState }),
}));
jest.mock('@/lib/services/my-entities-provider', () => ({
    useMyEntities: () => ({ entities: [], isLoading: false, error: null, refresh: async () => {} }),
}));
jest.mock('next/navigation', () => ({
    useSearchParams: () => new URLSearchParams(mockSearch),
}));

import { DEFAULT_NUMBER_FORMAT, formatCertificateNumber } from '@gacp/validation/certificate-number';
import { bangkokDateParts } from '@/lib/format/thai-date';
import Step1RequestType from '../step1-request-type';

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
    mockUpdateState.mockReset();
    mockState = { requestType: null, applicantType: null, holderEntityId: null, certScope: null, plantId: null, previousCertificateNumber: null };
    mockSearch = '';
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
const mount = () => act(() => { root.render(<Step1RequestType />); });

describe('step 1 opened from the renewal page', () => {
    it('presets RENEWAL and the previous certificate number from ?renew=', () => {
        mockSearch = `renew=${encodeURIComponent('TH-GACP 87/2568')}`;
        mockUpdateState.mockImplementation((patch: Record<string, unknown>) => { mockState = { ...mockState, ...patch }; });
        mount();
        mount();
        expect(mockUpdateState).toHaveBeenCalledWith(expect.objectContaining({
            requestType: 'RENEWAL',
            certScope: null,
            previousCertificateNumber: 'TH-GACP 87/2568',
        }));
        const input = container.querySelector<HTMLInputElement>('#previous-certificate-number');
        expect(input?.value).toBe('TH-GACP 87/2568');
    });

    it('shows the example number in the form the register issues today, never the retired prefix', () => {
        mockState = { ...mockState, requestType: 'RENEWAL' };
        mount();
        const input = container.querySelector<HTMLInputElement>('#previous-certificate-number');
        const year = (bangkokDateParts(new Date())?.year ?? 0) + 543;
        expect(input?.placeholder).toBe(`เช่น ${formatCertificateNumber(DEFAULT_NUMBER_FORMAT, 87, year)}`);
        expect(input?.placeholder).toMatch(/^เช่น \d+\/25\d{2}$/);
        expect(input?.placeholder).not.toContain('TH-GACP');
    });

    it('never overwrites a request type the store already holds', () => {
        mockSearch = 'renew=TH-GACP%2087%2F2568';
        mockState = { ...mockState, requestType: 'NEW' };
        mount();
        expect(mockUpdateState).not.toHaveBeenCalledWith(expect.objectContaining({ requestType: 'RENEWAL' }));
    });

    it('without ?renew= writes nothing', () => {
        mount();
        expect(mockUpdateState).not.toHaveBeenCalled();
    });

    it('a blank ?renew= writes nothing', () => {
        mockSearch = 'renew=%20';
        mount();
        expect(mockUpdateState).not.toHaveBeenCalled();
    });
});

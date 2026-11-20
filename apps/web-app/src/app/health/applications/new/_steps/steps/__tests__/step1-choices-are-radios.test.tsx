import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PERSONAL, COMPANY, VIEWER } from '@/components/holder/__tests__/fixtures';
import { FALLBACK_PLANTS } from '../plant-selection-config';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockUpdateState = jest.fn();
let mockState: Record<string, unknown> = {};

jest.mock('../../hooks/use-application-flow-store', () => ({
    useApplicationFlowStore: () => ({ state: mockState, updateState: mockUpdateState }),
}));
jest.mock('@/lib/services/my-entities-provider', () => ({
    useMyEntities: () => ({ entities: [PERSONAL, COMPANY, VIEWER], isLoading: false, error: null, refresh: async () => {} }),
}));
jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('') }));

import Step1RequestType from '../step1-request-type';

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
    mockUpdateState.mockClear();
    mockState = { requestType: 'RENEWAL', holderEntityId: 'e-company', applicantType: 'JURISTIC', certScope: null, plantId: null, previousCertificateNumber: null };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

function radioGroup(heading: string): HTMLElement {
    const group = Array.from(container.querySelectorAll<HTMLElement>('[role="radiogroup"]')).find((g) => {
        const id = g.getAttribute('aria-labelledby');
        return (id ? document.getElementById(id)?.textContent : '')?.includes(heading);
    });
    if (!group) { throw new Error(`no radiogroup named ${heading}`); }
    return group;
}
const radios = (group: HTMLElement) => Array.from(group.querySelectorAll<HTMLButtonElement>('[role="radio"]')).map((el) => ({
    el, label: el.closest('label')?.querySelector('span span')?.textContent, checked: el.getAttribute('aria-checked'),
}));

describe('step 1 one-of questions are radio groups', () => {
    it('request type: three radios, the stored answer checked, picking writes the new one', () => {
        act(() => { root.render(<Step1RequestType />); });
        const options = radios(radioGroup('ประเภทคำขอ'));
        expect(options.map(({ label, checked }) => [label, checked])).toEqual([
            ['ขอใหม่', 'false'], ['ต่ออายุ', 'true'], ['ใบแทน', 'false'],
        ]);
        act(() => { options[0]!.el.click(); });
        expect(mockUpdateState).toHaveBeenCalledWith(expect.objectContaining({ requestType: 'NEW' }));
    });

    it('holder: a radio per entity, the viewer-only one disabled', () => {
        act(() => { root.render(<Step1RequestType />); });
        const options = radios(radioGroup('ยื่นในนาม'));
        expect(options.filter((o) => o.checked === 'true').map((o) => o.label)).toEqual([COMPANY.displayName]);
        expect(options.find((o) => o.label === VIEWER.displayName)!.el.disabled).toBe(true);
    });

    it('plant: one radio per open plant when more than one is open', () => {
        mockState = { ...mockState, requestType: 'NEW', plantId: 'ginger' };
        act(() => { root.render(<Step1RequestType />); });
        const open = FALLBACK_PLANTS.filter((p) => p.enabled);
        expect(open.length).toBeGreaterThan(1);
        const options = radios(radioGroup('ชนิดพืชที่ขอรับรอง'));
        expect(options.map((o) => o.label)).toEqual(open.map((p) => p.nameTH));
        expect(options.filter((o) => o.checked === 'true').map((o) => o.label)).toEqual([open.find((p) => p.code === 'ginger')!.nameTH]);
    });
});

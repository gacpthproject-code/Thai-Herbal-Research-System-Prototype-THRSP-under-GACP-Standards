import * as React from 'react';
import { describe, expect, it, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import Step3SiteLand from '../step3-site-land';
import { step3CanProceed } from '../step3-site-land-config';

function render(farmData: Record<string, unknown>) {
    const onChange = jest.fn<(key: string, value: unknown) => void>();
    const onPatch = jest.fn<(patch: Record<string, unknown>) => void>();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
        root.render(<Step3SiteLand farmData={farmData} slots={[]} appId="app-1" onChange={onChange} onPatch={onPatch} onChanged={() => undefined} />);
    });
    return { container, onChange, onPatch, unmount: () => { act(() => root.unmount()); container.remove(); } };
}

const mediumGroup = (container: HTMLElement) => container.querySelector('[role="radiogroup"][aria-labelledby="growing-medium-label"]');
const radios = (container: HTMLElement) => Array.from(mediumGroup(container)?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []);
const radioNamed = (container: HTMLElement, name: string) => radios(container).find((radio) => {
    const labelId = radio.getAttribute('aria-labelledby');
    return labelId ? container.querySelector(`[id="${labelId}"]`)?.textContent === name : false;
});
const areaBox = (container: HTMLElement, name: string) => Array.from(container.querySelectorAll<HTMLButtonElement>('[role="group"][aria-labelledby="area-type-label"] [role="checkbox"]'))
    .find((box) => container.querySelector(`[id="${box.getAttribute('aria-labelledby')}"]`)?.textContent === name);
const saved = (farmData: Record<string, unknown>, patch: Record<string, unknown>) => JSON.parse(JSON.stringify({ ...farmData, ...patch }));

describe('step 3: the growing-medium question (order 159 soil follow-up 2)', () => {
    it('is not asked when อาคารระบบปิด is not ticked', () => {
        const view = render({ areaTypes: ['OUTDOOR', 'GREENHOUSE'] });
        expect(mediumGroup(view.container)).toBeNull();
        expect(view.container.textContent).not.toContain('ไม่ใช้ดิน');
        view.unmount();
    });

    it('is asked as a two-choice radio group once อาคารระบบปิด is ticked', () => {
        const view = render({ areaTypes: ['INDOOR'] });
        expect(mediumGroup(view.container)).not.toBeNull();
        expect(radios(view.container)).toHaveLength(2);
        expect(radioNamed(view.container, 'ปลูกในดิน')).toBeDefined();
        expect(radioNamed(view.container, 'ไม่ใช้ดิน')).toBeDefined();
        view.unmount();
    });

    it('writes the closed word the server reads', () => {
        const view = render({ areaTypes: ['OUTDOOR', 'INDOOR'] });
        act(() => { radioNamed(view.container, 'ไม่ใช้ดิน')!.click(); });
        expect(view.onChange).toHaveBeenCalledWith('growingMedium', 'SOILLESS');
        view.unmount();
    });

    it('shows the stored answer as checked', () => {
        const view = render({ areaTypes: ['INDOOR'], growingMedium: 'SOIL' });
        expect(radioNamed(view.container, 'ปลูกในดิน')!.getAttribute('aria-checked')).toBe('true');
        expect(radioNamed(view.container, 'ไม่ใช้ดิน')!.getAttribute('aria-checked')).toBe('false');
        view.unmount();
    });

    it('unticking อาคารระบบปิด takes the answer out of the saved filing', () => {
        const farmData = { areaTypes: ['OUTDOOR', 'INDOOR'], growingMedium: 'SOILLESS' };
        const view = render(farmData);
        act(() => { areaBox(view.container, 'อาคารระบบปิด')!.click(); });
        expect(view.onPatch).toHaveBeenCalledTimes(1);
        const after = saved(farmData, view.onPatch.mock.calls[0][0]);
        expect(after.areaTypes).toEqual(['OUTDOOR']);
        expect(after).not.toHaveProperty('growingMedium');
        view.unmount();
    });

    it('unticking another box keeps the answer', () => {
        const farmData = { areaTypes: ['OUTDOOR', 'INDOOR'], growingMedium: 'SOILLESS' };
        const view = render(farmData);
        act(() => { areaBox(view.container, 'กลางแจ้ง')!.click(); });
        expect(view.onPatch).toHaveBeenCalledTimes(1);
        expect(saved(farmData, view.onPatch.mock.calls[0][0])).toEqual({ areaTypes: ['INDOOR'], growingMedium: 'SOILLESS' });
        view.unmount();
    });
});

describe('step 3 cannot proceed on an unanswered indoor site', () => {
    const complete = {
        siteName: 'อาคารปลูก', siteAddress: '1 หมู่ 1', province: 'ชลบุรี', district: 'เมือง', subDistrict: 'บางปลาสร้อย',
        areaSqm: '400', siteContactName: 'สมชาย ใจดี', sitePhone: '0812345678', siteContactIsApplicant: true,
        landOwnership: 'OWNED', landDocumentDetail: { type: 'โฉนด', number: '1' }, coordinates: '13.36, 100.98',
        plantsPerCycle: '100', cyclesPerYear: '3',
    };

    it('needs the answer when อาคารระบบปิด is ticked, and not otherwise', () => {
        expect(step3CanProceed({ ...complete, areaTypes: ['INDOOR'] })).toBe(false);
        expect(step3CanProceed({ ...complete, areaTypes: ['INDOOR'], growingMedium: 'SOILLESS' })).toBe(true);
        expect(step3CanProceed({ ...complete, areaTypes: ['OUTDOOR'] })).toBe(true);
    });
});

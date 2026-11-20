/**
 * F-A8-07: the new planting cycle form chose cannabis for the applicant, even under a ginger
 * certificate, so a cycle could be saved for the wrong crop without anyone choosing it. The form
 * starts with no crop; the applicant must pick one before the cycle can be created.
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
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
    usePathname: () => '/health/planting/new',
    useSearchParams: () => new URLSearchParams(),
}));
jest.mock('../../create-cycle-access', () => ({
    useLacksCertificate: () => false,
    NoCertificateNotice: () => null,
}));
jest.mock('@/lib/services/planting-service', () => ({
    plantingService: {
        getFarms: async () => ({ success: true, data: [{ id: 'farm-1', name: 'ฟาร์มขิง' }] }),
        getPlantSpecies: async () => ({
            success: true,
            data: [
                { id: 'id-can', code: 'CAN', nameTH: 'กัญชา' },
                { id: 'id-gin', code: 'GIN', nameTH: 'ขิง' },
            ],
        }),
        getMyCertificates: async () => ({
            success: true,
            data: [{ id: 'cert-1', farmId: 'farm-1', certificateNumber: 'TH-GACP 1/2569', status: 'active', canonicalStatus: 'active' }],
        }),
        getFarmPlots: async () => ({ success: true, data: [], certifiedAreaTypes: ['OUTDOOR'] }),
    },
}));

import NewPlantingCyclePage from '../client-view';

describe('the planting form chooses no crop for the applicant', () => {
    let container: HTMLDivElement;
    let root: Root;
    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
    });

    it('after the registry loads, no crop is selected and the form asks for one', async () => {
        await act(async () => { root.render(<NewPlantingCyclePage />); });
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

        const cropLabel = Array.from(container.querySelectorAll('label'))
            .find((label) => label.textContent?.replace('*', '').trim() === 'ชนิดพืช');
        const cropTrigger = cropLabel ? document.getElementById(cropLabel.htmlFor) : null;
        expect(cropTrigger?.textContent).toContain('เลือกชนิดพืช');
        expect(cropTrigger?.textContent).not.toContain('กัญชา');
        expect(container.textContent).toContain('ยังไม่ได้เลือกชนิดพืช');
    });
});

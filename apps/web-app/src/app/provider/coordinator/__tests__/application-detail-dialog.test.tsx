/**
 * The dispatcher reads an application before assigning or booking, read-only, from its own door
 * (audit 2026-10-06 D11): the holder, the site, the payment state and who holds the case. It
 * used to bounce off /provider/applications, which the dispatcher cannot open.
 */
import * as React from 'react';
import { describe, expect, it, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockGet = jest.fn();
jest.mock('@/lib/api/api-client', () => ({ api: { get: (...a: unknown[]) => mockGet(...a) } }));

import ApplicationDetailDialog from '../application-detail-dialog';

describe('the dispatcher application detail', () => {
    it('shows holder, site, coordinates, payment and officers from the dispatcher door', async () => {
        mockGet.mockResolvedValue({
            success: true,
            data: {
                summary: {
                    applicationNumber: 'APP-1', status: 'AUDIT_FEE_PAID', applicantName: 'ผู้ยื่น ทดสอบ', farmName: 'แปลงสวนสุข',
                    farmAddress: '99 หมู่ 1 จ.เชียงใหม่', farmLatitude: 18.7883, farmLongitude: 98.9853,
                    holder: { name: 'บริษัท ทดสอบ จำกัด', typeLabel: null }, scope: { cultivationTypes: ['กลางแจ้ง'], plantName: 'กัญชา' }, purposes: [],
                },
                payment: { m1Paid: true, m2Paid: true },
                reviewerName: 'ผู้ตรวจเอกสาร หนึ่ง', inspectorName: null, schedule: null, reinspection: null,
            },
        });
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        await act(async () => { root.render(<ApplicationDetailDialog applicationId="app-1" onClose={() => undefined} />); });
        for (let i = 0; i < 5; i += 1) { await act(async () => { await Promise.resolve(); }); }

        expect(String(mockGet.mock.calls[0][0])).toBe('/api/provider/scheduler/applications/app-1');
        const text = container.textContent || '';
        expect(text).toContain('บริษัท ทดสอบ จำกัด');
        expect(text).toContain('99 หมู่ 1 จ.เชียงใหม่');
        expect(text).toContain('18.7883, 98.9853');
        expect(text).toContain('งวดที่ 1 ชำระแล้ว · งวดที่ 2 ชำระแล้ว');
        expect(text).toContain('ผู้ตรวจเอกสาร หนึ่ง');
        expect(container.innerHTML).not.toContain('/provider/applications/');
        expect(container.innerHTML).not.toContain('google.com/maps');
    });
});

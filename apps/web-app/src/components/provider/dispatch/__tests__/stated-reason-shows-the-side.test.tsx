/**
 * Order 65(1), 2026-10-09: the dispatcher sees, beside each reason it can pick for a late visit or an
 * inspector change during a correction, the side the delay will count against.
 */

import * as React from 'react';
import { describe, expect, it } from '@jest/globals';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { StatedReasonPicker } from '../stated-reason';

describe('StatedReasonPicker', () => {
    it('shows the side of each listed reason', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        await act(async () => {
            root.render(
                <StatedReasonPicker
                    list="lateVisit"
                    options={[
                        { code: 'APPLICANT_ASKED_LATER', label: 'ผู้ยื่นขอนัดวันที่ช้ากว่ากำหนด', side: 'APPLICANT', sideLabel: 'ผู้ยื่น' },
                        { code: 'OTHER', label: 'อื่น ๆ (โปรดระบุ)', side: 'UNASSIGNED', sideLabel: 'ยังไม่จัดฝ่าย' },
                    ]}
                    value={undefined}
                    onChange={() => undefined}
                />,
            );
        });
        const rows = Array.from(container.querySelectorAll('label')).map((label) => label.textContent || '');
        expect(rows.find((row) => row.includes('ผู้ยื่นขอนัดวันที่ช้ากว่ากำหนด'))).toContain('ฝ่ายที่รับผิดชอบ: ผู้ยื่น');
        expect(rows.find((row) => row.includes('อื่น ๆ'))).toContain('ฝ่ายที่รับผิดชอบ: ยังไม่จัดฝ่าย');
        act(() => root.unmount());
        container.remove();
    });
});

/**
 * Review of rounds 5-6, I-8: when the dispatcher picks "อื่น ๆ" for a late visit or an inspector change
 * during a correction, the words it types are the reason the applicant reads on the application page
 * (backend shared/dispatcher-reasons.js recordedReasonsOf). The picker says so before it is typed.
 * An over-cap reason goes to the DTAM admin only, so that picker does not say it.
 */

import * as React from 'react';
import { describe, expect, it } from '@jest/globals';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { StatedReasonPicker, type ReasonListKey } from '../stated-reason';

const SHOWN_TO_APPLICANT = 'ผู้ยื่นจะเห็นเหตุผลที่พิมพ์นี้ในหน้าคำขอ';

async function pickerWithOtherChosen(list: ReasonListKey) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
        root.render(
            <StatedReasonPicker
                list={list}
                options={[
                    { code: 'FORCE_MAJEURE', label: 'เหตุสุดวิสัย', side: 'FORCE_MAJEURE', sideLabel: 'เหตุสุดวิสัย' },
                    { code: 'OTHER', label: 'อื่น ๆ (โปรดระบุ)', side: 'UNASSIGNED', sideLabel: 'ยังไม่จัดฝ่าย' },
                ]}
                value={{ reasonCode: 'OTHER', reasonText: '' }}
                onChange={() => undefined}
            />,
        );
    });
    return { container, unmount: () => { act(() => root.unmount()); container.remove(); } };
}

describe('StatedReasonPicker with "อื่น ๆ" chosen', () => {
    it.each(['lateVisit', 'correctionReassign'] as const)('%s: says the applicant will see the typed reason, and the text box is described by it', async (list) => {
        const view = await pickerWithOtherChosen(list);
        const note = Array.from(view.container.querySelectorAll('p')).find((p) => p.textContent === SHOWN_TO_APPLICANT);
        expect(note).toBeDefined();
        expect(view.container.querySelector('textarea')?.getAttribute('aria-describedby')).toContain(note!.id);
        view.unmount();
    });

    it('overCap: says nothing about the applicant', async () => {
        const view = await pickerWithOtherChosen('overCap');
        expect(view.container.querySelector('textarea')).not.toBeNull();
        expect(view.container.textContent).not.toContain(SHOWN_TO_APPLICANT);
        view.unmount();
    });
});

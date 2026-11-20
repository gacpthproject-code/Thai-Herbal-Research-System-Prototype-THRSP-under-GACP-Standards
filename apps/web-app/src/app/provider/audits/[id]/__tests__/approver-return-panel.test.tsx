import * as React from 'react';
import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { ApproverReturnPanel } from '../approver-return-panel';

describe('F-A8b-08 ApproverReturnPanel', () => {
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

    const render = (formData: Record<string, unknown>) => {
        act(() => { root.render(<ApproverReturnPanel formData={formData} />); });
        return container.querySelector('[data-testid="approver-return-panel"]');
    };

    it('shows the heading, the Bangkok date and the reason of a RETURNED decision', () => {
        const panel = render({
            certificationDecision: {
                outcome: 'RETURNED', decidedAt: '2026-10-22T10:30:00.000Z', decidedBy: 'u-approver',
                comment: 'ภาพถ่ายแปลงไม่ชัด ขอให้ทบทวน',
            },
        });
        expect(panel).not.toBeNull();
        expect(panel!.textContent).toContain('ผู้อนุมัติส่งกลับให้ทบทวน');
        expect(panel!.textContent).toContain('22 ต.ค. 2569');
        expect(panel!.textContent).toContain('ภาพถ่ายแปลงไม่ชัด ขอให้ทบทวน');
    });

    it('says the reason was not recorded on a RETURNED decision written before the reason was kept', () => {
        const panel = render({ certificationDecision: { outcome: 'RETURNED', decidedAt: '2026-10-22T10:30:00.000Z' } });
        expect(panel!.textContent).toContain('ไม่ได้บันทึกเหตุผล');
    });

    it('renders nothing for any other outcome or no decision', () => {
        expect(render({ certificationDecision: { outcome: 'APPROVED', decidedAt: '2026-10-22T10:30:00.000Z' } })).toBeNull();
        expect(render({})).toBeNull();
    });
});

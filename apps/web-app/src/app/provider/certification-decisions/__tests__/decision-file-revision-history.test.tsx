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
    usePathname: () => '/provider/certification-decisions/app-1',
    useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/components/feature/document-viewer-modal', () => ({
    DocumentViewerModal: () => null,
}));

import { DecisionFileView } from '../[id]/decision-file-view';
import { FILE } from './decision-file-fixture';

describe('DecisionFileView: document rounds the reviewer sent back', () => {
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

    it('lists every round with its own paper, reason and Bangkok due date', () => {
        const file = {
            ...FILE,
            revisionHistory: [
                { round: 1, requests: [{ slotId: 'sop_manual', labelTH: 'คู่มือการปฏิบัติงาน', reason: 'สำเนาอ่านไม่ออก', requestedAt: '2026-10-26T03:00:00.000Z', dueDate: '2026-11-02T16:59:59.999Z' }] },
                { round: 2, requests: [{ slotId: 'sop_manual', labelTH: 'คู่มือการปฏิบัติงาน', reason: 'ยังไม่มีลายมือชื่อ', requestedAt: '2026-10-29T03:00:00.000Z', dueDate: '2026-11-05T16:59:59.999Z' }] },
            ],
        };
        act(() => { root.render(<DecisionFileView file={file} />); });
        const block = container.querySelector('[data-testid="decision-file-revision-history"]');
        const rounds = Array.from(block!.querySelectorAll('[data-revision-round]'));
        expect(rounds.map((r) => r.getAttribute('data-revision-round'))).toEqual(['1', '2']);
        expect(rounds[0].textContent).toContain('สำเนาอ่านไม่ออก');
        expect(rounds[0].textContent).toContain('2 พฤศจิกายน 2569');
        expect(rounds[1].textContent).toContain('ยังไม่มีลายมือชื่อ');
        expect(rounds[1].textContent).toContain('5 พฤศจิกายน 2569');
    });

    it('says no request is on record when there is no round', () => {
        act(() => { root.render(<DecisionFileView file={{ ...FILE, revisionHistory: [] }} />); });
        const block = container.querySelector('[data-testid="decision-file-revision-history"]');
        expect(block!.textContent).toContain('ไม่มีบันทึกการขอเอกสารเพิ่ม');
    });

    it('names a missing date in Thai instead of a dash', () => {
        const file = {
            ...FILE,
            revisionHistory: [
                { round: 1, requests: [{ slotId: 'sop_manual', labelTH: 'คู่มือการปฏิบัติงาน', reason: null, requestedAt: null, dueDate: null }] },
            ],
        };
        act(() => { root.render(<DecisionFileView file={file} />); });
        const text = container.querySelector('[data-revision-round="1"]')!.textContent;
        expect(text).toContain('ขอเมื่อ ไม่ระบุ');
        expect(text).toContain('กำหนดส่ง ไม่ระบุ');
        expect(text).not.toContain('—');
    });
});

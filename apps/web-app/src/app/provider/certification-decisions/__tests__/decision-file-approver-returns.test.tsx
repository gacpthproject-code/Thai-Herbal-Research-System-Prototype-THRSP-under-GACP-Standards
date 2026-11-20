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
import type { DecisionFile } from '../[id]/decision-file-types';
import { FILE } from './decision-file-fixture';

describe('DecisionFileView: earlier send-backs by an approver', () => {
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

    it('lists each send-back with the approver, the Bangkok date and the reason', () => {
        const file: DecisionFile = {
            ...FILE,
            approverReturns: [{
                returnedAt: '2026-10-22T10:30:00.000Z',
                returnedBy: { id: 'u-approver', name: 'อนุมัติ หนึ่ง' },
                reason: 'ภาพถ่ายแปลงไม่ชัด ขอให้ทบทวน',
            }],
        };
        act(() => { root.render(<DecisionFileView file={file} />); });
        const block = container.querySelector('[data-testid="decision-file-approver-returns"]');
        expect(block).not.toBeNull();
        expect(block!.textContent).toContain('เคยส่งกลับให้ผู้ตรวจพื้นที่ทบทวน');
        expect(block!.textContent).toContain('อนุมัติ หนึ่ง');
        expect(block!.textContent).toContain('ภาพถ่ายแปลงไม่ชัด ขอให้ทบทวน');
        expect(block!.textContent).toContain('22 ต.ค. 2569');
    });

    it('shows nothing when the file was never sent back', () => {
        act(() => { root.render(<DecisionFileView file={{ ...FILE, approverReturns: [] }} />); });
        expect(container.querySelector('[data-testid="decision-file-approver-returns"]')).toBeNull();
    });
});

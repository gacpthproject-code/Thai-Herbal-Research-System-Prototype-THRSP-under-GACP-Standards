import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
    usePathname: () => '/provider/audits/app-1',
    useSearchParams: () => new URLSearchParams(),
    useParams: () => ({ id: 'app-1' }),
}));

import { AuditApplicationTabPanel } from '../audit-application-tab-panel';
import { attachmentsOfSlots, type ApplicationDocumentSlot } from '../application-documents';
import type { ApplicationData } from '../provider-audit-job-sheet-config';

const APP: ApplicationData = {
    id: 'app-1',
    applicationNumber: 'APP-2569-DOCS',
    status: 'AUDIT_CONFIRMED',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
};

const SLOTS: ApplicationDocumentSlot[] = [
    { slotId: 'land_rights', labelTH: 'เอกสารสิทธิ์ที่ดิน', required: true, satisfied: true, fileUrl: '/uploads/application-drafts/land.pdf', fileName: 'land.pdf' },
    { slotId: 'sop_manual', labelTH: 'คู่มือการปฏิบัติงาน', required: true, satisfied: false, fileUrl: null, fileName: null },
];

describe('F-A8b-05: the job sheet lists the filed documents by requirement slot', () => {
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

    it('maps a slot to one attachment row keyed by slotId with the Thai label', () => {
        expect(attachmentsOfSlots(SLOTS)).toEqual([
            { key: 'land_rights', label: 'เอกสารสิทธิ์ที่ดิน', url: '/uploads/application-drafts/land.pdf' },
            { key: 'sop_manual', label: 'คู่มือการปฏิบัติงาน', url: null },
        ]);
    });

    it('renders the filed slot with the viewer buttons and the missing one with the badge', () => {
        act(() => {
            root.render(<AuditApplicationTabPanel application={APP} attachments={attachmentsOfSlots(SLOTS)} />);
        });
        expect(container.textContent).toContain('เอกสารสิทธิ์ที่ดิน');
        expect(container.textContent).toContain('คู่มือการปฏิบัติงาน');
        expect(container.querySelector('[data-testid="doc-viewer-preview-land_rights"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="doc-viewer-open-land_rights"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="doc-viewer-preview-sop_manual"]')).toBeNull();
        expect(container.textContent).toContain('ไม่มีเอกสาร');
    });
});

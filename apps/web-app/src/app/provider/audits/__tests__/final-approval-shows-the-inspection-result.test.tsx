/**
 * The approver's queue holds files the field inspector passed and files it did not pass
 * (order 56(2)); each row says which: "ผลตรวจ: ผ่าน" or "ผลตรวจ: ไม่ผ่าน" (spec 5.3).
 */
import * as React from 'react';
import { describe, expect, it, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {

    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
    usePathname: () => '/provider/certification-decisions',
    useSearchParams: () => new URLSearchParams(),
}));

import { FinalApprovalList } from '../final-approval-list';
import { LanguageProvider } from '@/lib/i18n/language-context';
import type { FinalApprovalItem } from '../auditor-types';

const row = (id: string, status: string): FinalApprovalItem => ({
    id, applicationNumber: `APP-${id}`, applicantName: 'สมชาย ใจดี', status,
    updatedAt: '2026-10-14T03:00:00.000Z', createdAt: '2026-10-01T03:00:00.000Z',
});

describe('FinalApprovalList — the inspection result on every row', () => {
    let container: HTMLDivElement;
    let root: Root;
    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
    });

    it('a passed file reads "ผลตรวจ: ผ่าน", a file that did not pass reads "ผลตรวจ: ไม่ผ่าน"', () => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        act(() => {
            root.render(<LanguageProvider><FinalApprovalList items={[row('1', 'AUDIT_PASSED'), row('2', 'AUDIT_NOT_PASSED')]} /></LanguageProvider>);
        });
        const results = Array.from(container.querySelectorAll('[data-testid="final-approval-inspection-result"]')).map((el) => el.textContent);
        expect(results).toEqual(['ผลตรวจ: ผ่าน', 'ผลตรวจ: ไม่ผ่าน']);
    });
});

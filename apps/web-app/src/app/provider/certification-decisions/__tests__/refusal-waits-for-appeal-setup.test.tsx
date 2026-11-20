/**
 * Order 118(1): while the appeal setting is not in force, the approver sees the refusal button held
 * with the reason in Thai, and pressing it opens nothing and sends nothing.
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
    usePathname: () => '/provider/certification-decisions/app-1',
    useSearchParams: () => new URLSearchParams(),
}));
const mockRequest = jest.fn<(path: string, init?: RequestInit) => Promise<{ success: boolean; error?: string }>>();
jest.mock('../../audits/auditor-types', () => ({
    PROVIDERRequest: (path: string, init?: RequestInit) => mockRequest(path, init),
}));
jest.mock('@/lib/notifications', () => ({ notifications: { show: jest.fn() } }));

import { DecisionActions } from '../[id]/decision-actions';
import type { DecisionFile } from '../[id]/decision-file-types';

const HOLD_MESSAGE = 'ยังกดไม่ให้การรับรองไม่ได้ ระบบรอการตั้งค่าการอุทธรณ์ (สิทธิ์อุทธรณ์ ช่องทาง และระยะเวลา) ให้ครบก่อน';

const file = (refusalHold: { code: string; message: string } | null) => ({
    application: {
        id: 'app-1', applicationNumber: 'APP-118', status: 'AUDIT_NOT_PASSED', applicantName: 'สมชาย ใจดี',
        submittedAt: null, updatedAt: null, scheduledDate: null, farmName: null, farmAddress: '', farmLatitude: null, farmLongitude: null,
        holder: { name: 'บริษัท ทดสอบ จำกัด', typeLabel: 'นิติบุคคล' }, scope: { cultivationTypes: [], plantName: null }, purposes: [],
    },
    decidable: true,
    actions: ['REFUSE', 'REQUEST_CORRECTION'],
    refusalHold,
    decision: null,
    refusalReasons: [{ code: 'OTHER', label: 'อื่น ๆ (โปรดระบุ)' }],
    inspectorSummary: { findings: [] },
}) as unknown as DecisionFile;

const buttonNamed = (name: string) => Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === name) as HTMLButtonElement | undefined;

describe('the refusal waits for the appeal setting', () => {
    let container: HTMLDivElement;
    let root: Root;
    beforeEach(() => {
        jest.clearAllMocks();
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
    });
    const render = (f: DecisionFile) => act(() => { root.render(<DecisionActions file={f} />); });

    it('held: the button is disabled, the reason shows, and nothing opens or sends', () => {
        render(file({ code: 'REFUSAL_AWAITS_APPEAL_SETUP', message: HOLD_MESSAGE }));
        const refuse = buttonNamed('ไม่ให้การรับรอง')!;
        expect(refuse.disabled).toBe(true);
        expect(document.querySelector('[data-testid="refusal-hold"]')?.textContent).toContain(HOLD_MESSAGE);
        act(() => { refuse.click(); });
        expect(buttonNamed('ยืนยันไม่ให้การรับรอง')).toBeUndefined();
        expect(mockRequest).not.toHaveBeenCalled();
        expect(buttonNamed('ส่งกลับให้แก้ไขข้อบกพร่อง')!.disabled).toBe(false);
    });

    it('in force: the button works and no hold shows', () => {
        render(file(null));
        expect(buttonNamed('ไม่ให้การรับรอง')!.disabled).toBe(false);
        expect(document.querySelector('[data-testid="refusal-hold"]')).toBeNull();
    });
});

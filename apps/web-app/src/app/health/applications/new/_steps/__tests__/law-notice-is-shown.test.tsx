/**
 * A renewal the server could not grant is recorded as ขอใหม่ with the full document set.
 * That must never be silent: the save reply carries `lawNotice`, and the wizard layout
 * shows it above the steps in the server's own Thai, so the applicant knows why their
 * list grew and what to fix before submitting.
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
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
    usePathname: () => '/health/applications/new/step/1',
}));
jest.mock('@/app/health/applications/new/_steps/hooks/use-application-flow-store', () => ({
    useApplicationFlowStore: () => ({ state: { currentStep: 0, plantId: null, syncStatus: 'SYNCED' } }),
}));

const NOT_FOUND_TH = 'ไม่พบใบรับรองเลขที่นี้ในระบบ กรุณาตรวจสอบเลขที่บนใบรับรองเดิมอีกครั้ง';
const mockAutoSave: Record<string, unknown> = {
    isDirty: false, isSaving: false, lastSavedAt: null, error: null, errorKind: null, draftId: null,
    syncState: 'idle', draftVersion: null, hasConflict: false, lawNotice: null,
    saveNow: jest.fn(), markDirty: jest.fn(), clearDraft: jest.fn(), acknowledgeConflict: jest.fn(),
};
jest.mock('@/app/health/applications/new/_steps/hooks/use-auto-save', () => ({
    useAutoSave: () => mockAutoSave,
}));
jest.mock('@/lib/api/api-client', () => ({
    api: { get: () => Promise.resolve({ success: false, data: null }) },
}));

import ApplicationFlowLayout from '../layout';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
    if (root) { act(() => { root?.unmount(); }); root = null; }
    container?.remove();
    container = null;
    mockAutoSave.lawNotice = null;
});

async function mount() {
    container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
        root = createRoot(container!);
        root.render(<ApplicationFlowLayout><div>child</div></ApplicationFlowLayout>);
        for (let i = 0; i < 10; i++) await Promise.resolve();
    });
}

describe('a renewal recorded as ขอใหม่ is told on screen', () => {
    it('shows the server notice, with the reason, as a status the applicant can read', async () => {
        mockAutoSave.lawNotice = { code: 'PREVIOUS_CERTIFICATE_NOT_FOUND', messageTh: NOT_FOUND_TH };
        await mount();
        const statuses = Array.from(container!.querySelectorAll('[role="status"]')).map((el) => el.textContent ?? '');
        const notice = statuses.find((text) => text.includes(NOT_FOUND_TH));
        expect(notice).toBeDefined();
        expect(notice).toContain('ระบบบันทึกคำขอนี้เป็น “ขอใหม่” ไว้ก่อน');
        expect(container!.textContent).not.toContain('PREVIOUS_CERTIFICATE_NOT_FOUND');
    });

    it('shows nothing of the kind when the server granted the request type', async () => {
        await mount();
        expect(container!.textContent).not.toContain('ระบบบันทึกคำขอนี้เป็น');
    });
});

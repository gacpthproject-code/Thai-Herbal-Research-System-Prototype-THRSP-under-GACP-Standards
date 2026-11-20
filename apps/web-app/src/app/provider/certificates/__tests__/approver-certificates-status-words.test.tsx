/**
 * The approver's certificate list reads every stored status through the one vocabulary
 * (lib/certificates/certificate-status). The staging walk of ccc4f707d (F8) showed a
 * renewed certificate with the English word "renewed": this page kept its own map of four
 * words and fell back to the stored string for the fifth.
 */

import * as React from 'react';
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
const mockRequest = jest.fn<(path: string, init?: RequestInit) => Promise<{ success: boolean; data?: unknown; error?: string }>>();
jest.mock('../../audits/auditor-types', () => ({
    PROVIDERRequest: (path: string, init?: RequestInit) => mockRequest(path, init),
}));
jest.mock('@/lib/notifications', () => ({ notifications: { show: jest.fn() } }));

import { ApproverCertificates } from '../approver-certificates';

const row = (id: string, status: string) => ({
    id, certificateNumber: `${id}/2569`, status, farmName: 'แปลงทดสอบ', cropType: 'ขมิ้นชัน',
    holderDisplayName: 'บริษัท ทดสอบ จำกัด', issuedDate: null, expiryDate: null, suspendedReason: null, revokedReason: null,
});
const payload = {
    items: [row('61', 'renewed'), row('62', 'suspended'), row('63', 'ACTIVE')],
    suspensionReasons: [],
    revocationReasons: [],
};

describe('ApproverCertificates status words (F8)', () => {
    let container: HTMLDivElement;
    let root: Root;
    beforeEach(() => {
        jest.clearAllMocks();
        mockRequest.mockImplementation(async () => ({ success: true, data: payload }));
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
    });

    it('shows every stored status in Thai, including renewed and uppercase rows', async () => {
        await act(async () => { root.render(<ApproverCertificates />); });
        const text = container.textContent ?? '';
        expect(text).toContain('ต่ออายุแล้ว');
        expect(text).toContain('พักใช้');
        expect(text).toContain('กำลังใช้งาน');
        expect(text).not.toMatch(/renewed|ACTIVE/);
    });
});

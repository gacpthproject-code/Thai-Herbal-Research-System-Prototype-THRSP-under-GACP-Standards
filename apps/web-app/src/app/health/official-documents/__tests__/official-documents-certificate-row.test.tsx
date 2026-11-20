/**
 * The certificate row reads what GET /api/certificates/my sends (certificates.js
 * router.get('/my')): `siteName`, `plantType`, `status`. The staging walk of ccc4f707d
 * (F1) showed every row as "undefined — undefined" with an English "renewed" badge: the
 * view read `farmName` / `cropType`, two keys that endpoint never sends, and translated
 * only active / expired / revoked.
 */

import * as React from 'react';
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import OfficialDocumentsPage from '../client-view';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockApiGet = jest.fn();

jest.mock('@/lib/api/api-client', () => ({
    apiClient: {
        get: (...args: unknown[]) => mockApiGet(...args),
    },
}));

jest.mock('@/lib/services/auth-service', () => ({
    AuthService: {
        getUser: jest.fn(() => ({ id: 'u-1', name: 'ทดสอบ' })),
    },
}));

const mockStableRouter = { replace: jest.fn(), push: jest.fn() };
jest.mock('next/navigation', () => ({
    useRouter: () => mockStableRouter,
}));

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

/** One row exactly as certificates.js formats it. */
const RENEWED_CERT = {
    id: 'cert-61',
    certificateNumber: '61/2569',
    applicationId: 'app-61',
    entityId: 'ent-1',
    farmId: 'farm-1',
    siteName: 'แปลงทดสอบ wc4',
    plantType: 'ขมิ้นชัน',
    issuedDate: '2026-10-30T03:00:00.000Z',
    expiryDate: '2027-10-29T16:59:59.999Z',
    status: 'renewed',
    canonicalStatus: 'renewed',
    canPrintQr: false,
    qrCode: null,
    farm: { name: 'แปลงทดสอบ wc4', province: 'นนทบุรี', district: null, subDistrict: null, location: 'นนทบุรี', totalArea: 1600, areaUnit: 'Sqm' },
    crops: ['ขมิ้นชัน'],
    audit: null,
};

describe('OfficialDocumentsPage certificate row (F1)', () => {
    let container: HTMLDivElement | null = null;
    let root: Root | null = null;

    beforeEach(() => {
        jest.clearAllMocks();
        mockApiGet.mockImplementation((url: string) => {
            if (url === '/api/certificates/my') {
                return Promise.resolve({ success: true, data: [RENEWED_CERT] });
            }
            return Promise.resolve({ success: true, data: [] });
        });
    });

    afterEach(() => {
        if (root) {
            act(() => { root?.unmount(); });
            root = null;
        }
        if (container) {
            container.remove();
            container = null;
        }
    });

    async function mountAndFlush() {
        container = document.createElement('div');
        document.body.appendChild(container);
        act(() => {
            root = createRoot(container!);
            root.render(<OfficialDocumentsPage />);
        });
        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
        });
        return container.textContent ?? '';
    }

    it('names the site and the plant from the fields the API sends', async () => {
        const text = await mountAndFlush();
        expect(text).toContain('แปลงทดสอบ wc4');
        expect(text).toContain('ขมิ้นชัน');
        expect(text).not.toContain('undefined');
    });

    it('shows a renewed certificate in Thai, never the stored status word', async () => {
        const text = await mountAndFlush();
        expect(text).toContain('ต่ออายุแล้ว');
        expect(text).not.toContain('renewed');
    });
});

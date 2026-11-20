/**
 * The certificates dashboard names the applicant on an expiring certificate without an e-mail or
 * phone (orders 18, 29 and 56(3), security re-review M-C): staff reach a holder through in-app
 * notices. Even a payload that still carries the e-mail (an older server) shows none of it.
 */

import * as React from 'react';
import { describe, expect, it, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../components/provider-layout', () => ({
    __esModule: true,
    default: ({ children, title }: { children: React.ReactNode; title?: React.ReactNode }) => (
        <div data-testid="provider-layout">{title}{children}</div>
    ),
}));
jest.mock('next/navigation', () => ({
    usePathname: () => '/provider/certificates',
    useRouter: () => ({ push: () => undefined, replace: () => undefined, prefetch: () => undefined }),
    useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/services/auth-provider', () => ({ useAuth: () => ({ user: { role: 'dispatcher' } }) }));
const mockLanguage = { dict: { provider: { certificates: { table: { applicant: 'ผู้ยื่นคำขอ' } } } } };
jest.mock('@/lib/i18n/language-context', () => ({ useLanguage: () => mockLanguage }));
jest.mock('@/lib/api/api-client', () => ({
    apiClient: {
        get: (path: string) => Promise.resolve(path.includes('/me')
            ? { success: true, data: { role: 'dispatcher' } }
            : {
                success: true,
                data: {
                    summary: { totalActive: 1, expiring30Days: 1, expiring90Days: 1, renewalRate: 0 },
                    byStandard: [],
                    byProvince: [],
                    expiringList: [{
                        id: 'cert-1', certificateNumber: 'TH-GACP 9/2569', farmName: 'ฟาร์มดอยคำ', standardName: 'GACP', province: 'เชียงใหม่',
                        expiryDate: '2026-11-01T00:00:00.000Z', status: 'active',
                        user: { firstName: 'สมชาย', lastName: 'ใจดี', email: 'somchai.holder@example.test', phoneNumber: '0891112222' },
                    }],
                },
            }),
        post: () => Promise.resolve({ success: true }),
    },
}));

import ProviderCertificatesPage from '../page';

describe('certificates dashboard', () => {
    it('names the applicant of an expiring certificate without an e-mail or phone', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        await act(async () => { root.render(<ProviderCertificatesPage />); });
        await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
        const text = container.textContent || '';
        expect(text).toContain('TH-GACP 9/2569');
        expect(text).toContain('สมชาย ใจดี');
        expect(text).toContain('ผู้ยื่นคำขอ');
        expect(text).not.toContain('somchai.holder@example.test');
        expect(text).not.toContain('0891112222');
        await act(async () => { root.unmount(); });
    });
});

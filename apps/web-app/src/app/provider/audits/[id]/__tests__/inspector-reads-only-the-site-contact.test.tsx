/**
 * The field inspector's audit page shows no email or phone of the applicant, only the person on
 * site, read through the audited door when asked (orders 29 and 56(3)).
 */

import * as React from 'react';
import { describe, expect, it, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockGet = jest.fn<(url: string) => Promise<unknown>>();
jest.mock('@/lib/api/api-client', () => ({ apiClient: { get: (url: string) => mockGet(url) } }));
jest.mock('@/lib/hooks/use-signed-file-url', () => ({ useSignedFileUrl: () => ({ url: null, loading: false, error: null }) }));

import { AuditApplicationTabPanel } from '../audit-application-tab-panel';

describe('the inspector reads only the person on site', () => {
    it('shows the site contact on request and never the applicant\'s email or phone', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        const application = {
            id: 'app-1', applicationNumber: 'APP-1', status: 'AUDIT_CONFIRMED', createdAt: '2026-10-01T03:00:00.000Z', updatedAt: '2026-10-01T03:00:00.000Z',
            health: { firstName: 'สมชาย', lastName: 'ใจดี', email: 'leak@example.test', phone: '0891112222' },
        };
        await act(async () => {
            root.render(<AuditApplicationTabPanel application={application} attachments={[{ key: 'idCard', label: 'บัตรประชาชน', url: null }]} />);
        });
        const shown = container.textContent || '';
        expect(shown).not.toContain('leak@example.test');
        expect(shown).not.toContain('0891112222');
        expect(shown).toContain('ผู้ติดต่อหน้างาน');
        // No emoji and no English role word on this Thai screen (order 51).
        expect(shown).not.toMatch(/\p{Extended_Pictographic}/u);
        expect(shown).not.toContain('Auditor');

        mockGet.mockResolvedValueOnce({ success: true, data: { applicationNumber: 'APP-1', siteContactName: 'นายสมศักดิ์ ดูแลแปลง', sitePhone: '0865556666' } });
        const reveal = Array.from(container.querySelectorAll('button')).find((b) => (b.textContent || '').includes('ดูชื่อและเบอร์ผู้ติดต่อหน้างาน'))!;
        await act(async () => { reveal.click(); });
        await act(async () => { await Promise.resolve(); });
        expect(mockGet).toHaveBeenCalledWith('/api/provider/applications/app-1/site-contact');
        expect(container.textContent).toContain('นายสมศักดิ์ ดูแลแปลง');
        expect(container.querySelector('a[href="tel:0865556666"]')).not.toBeNull();
        act(() => root.unmount());
        container.remove();
    });

    it('a view the server could not log shows nothing and says why', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        const application = { id: 'app-2', applicationNumber: 'APP-2', status: 'AUDIT_CONFIRMED', createdAt: '2026-10-01T03:00:00.000Z', updatedAt: '2026-10-01T03:00:00.000Z' };
        await act(async () => { root.render(<AuditApplicationTabPanel application={application} attachments={[]} />); });
        mockGet.mockResolvedValueOnce({ success: false, status: 503 });
        const reveal = Array.from(container.querySelectorAll('button')).find((b) => (b.textContent || '').includes('ดูชื่อและเบอร์ผู้ติดต่อหน้างาน'))!;
        await act(async () => { reveal.click(); });
        await act(async () => { await Promise.resolve(); });
        expect(container.textContent).toContain('ระบบบันทึกการเปิดดูไม่ได้');
        act(() => root.unmount());
        container.remove();
    });
});

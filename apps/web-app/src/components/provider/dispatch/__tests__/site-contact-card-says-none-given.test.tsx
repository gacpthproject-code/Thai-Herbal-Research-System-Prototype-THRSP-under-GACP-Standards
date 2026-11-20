/**
 * Order 65(2), 2026-10-09: a filing that names no one on site shows "ยังไม่มีผู้ติดต่อหน้างาน" to the
 * dispatcher, without a reveal that would log a view of nothing, and says when the applicant was
 * asked to add one.
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

import { SiteContactCard } from '../site-contact-card';

function mount(element: React.ReactElement) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(element); });
    return { container, unmount: () => { act(() => root.unmount()); container.remove(); } };
}

describe('SiteContactCard when no one on site is named', () => {
    it('says so, offers no reveal, and says when the applicant was asked', () => {
        const view = mount(<SiteContactCard applicationId="app-1" given={false} requestedAt="2026-10-09T03:00:00.000Z" />);
        expect(view.container.textContent).toContain('ยังไม่มีผู้ติดต่อหน้างาน');
        expect(view.container.textContent).toContain('ระบบแจ้งให้ผู้ยื่นเพิ่มแล้ว');
        expect(view.container.querySelector('button')).toBeNull();
        expect(mockGet).not.toHaveBeenCalled();
        view.unmount();
    });

    it('says the system will ask when the server says an ask is coming', () => {
        const view = mount(<SiteContactCard applicationId="app-1" given={false} requestPending />);
        expect(view.container.textContent).toContain('ระบบจะแจ้งให้ผู้ยื่นเพิ่มผู้ติดต่อหน้างาน');
        view.unmount();
    });

    it('promises no ask the server has not said is coming', () => {
        const view = mount(<SiteContactCard applicationId="app-1" given={false} />);
        expect(view.container.textContent).toContain('ยังไม่มีผู้ติดต่อหน้างาน');
        expect(view.container.textContent).not.toContain('ระบบจะแจ้ง');
        view.unmount();
    });

    it('a revealed answer with no name and no phone reads the same way', async () => {
        mockGet.mockResolvedValueOnce({ success: true, data: { applicationNumber: 'APP-1', siteContactName: null, sitePhone: null } });
        const view = mount(<SiteContactCard applicationId="app-1" />);
        const reveal = Array.from(view.container.querySelectorAll('button')).find((b) => (b.textContent || '').includes('ดูชื่อและเบอร์ผู้ติดต่อหน้างาน'))!;
        await act(async () => { reveal.click(); });
        await act(async () => { await Promise.resolve(); });
        expect(view.container.textContent).toContain('ยังไม่มีผู้ติดต่อหน้างาน');
        expect(view.container.textContent).not.toContain('ระบบจะแจ้ง');
        view.unmount();
    });
});

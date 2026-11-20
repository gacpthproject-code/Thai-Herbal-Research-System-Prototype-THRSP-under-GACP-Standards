/**
 * The on-site contact card belongs to one application (Jev review of 00ca573, web finding 1): when the
 * card is handed another application it starts closed again, and an answer that arrives for the
 * application it showed before is never shown under the new one.
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

const contactOf = (applicationNumber: string, siteContactName: string, sitePhone: string) => ({
    success: true, data: { applicationNumber, siteContactName, sitePhone },
});
const revealButton = (container: HTMLElement) => Array.from(container.querySelectorAll('button'))
    .find((b) => (b.textContent || '').includes('ดูชื่อและเบอร์ผู้ติดต่อหน้างาน'));

function mount() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    return {
        container,
        render: (applicationId: string) => act(async () => { root.render(<SiteContactCard applicationId={applicationId} />); }),
        unmount: () => { act(() => root.unmount()); container.remove(); },
    };
}

describe('SiteContactCard follows the application it is given', () => {
    it('a contact shown for one application is not shown under the next one', async () => {
        const card = mount();
        await card.render('app-a');
        mockGet.mockResolvedValueOnce(contactOf('APP-A', 'นายเอ ดูแลแปลง', '0861111111'));
        await act(async () => { revealButton(card.container)!.click(); });
        await act(async () => { await Promise.resolve(); });
        expect(card.container.textContent).toContain('นายเอ ดูแลแปลง');

        await card.render('app-b');
        expect(card.container.textContent).not.toContain('นายเอ ดูแลแปลง');
        expect(card.container.textContent).not.toContain('0861111111');
        expect(revealButton(card.container)).toBeDefined();
        card.unmount();
    });

    it('an answer that arrives late for the previous application is dropped', async () => {
        const card = mount();
        await card.render('app-a');
        let answerA: (value: unknown) => void = () => undefined;
        mockGet.mockImplementationOnce(() => new Promise((resolve) => { answerA = resolve; }));
        await act(async () => { revealButton(card.container)!.click(); });

        await card.render('app-b');
        await act(async () => { answerA(contactOf('APP-A', 'นายเอ ดูแลแปลง', '0861111111')); await Promise.resolve(); });
        expect(card.container.textContent).not.toContain('นายเอ ดูแลแปลง');
        expect(card.container.textContent).not.toContain('0861111111');
        expect(revealButton(card.container)).toBeDefined();
        card.unmount();
    });
});

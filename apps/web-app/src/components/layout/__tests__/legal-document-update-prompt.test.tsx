import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const mockGet = jest.fn<(url: string) => Promise<unknown>>();
const mockPost = jest.fn<(url: string, body: unknown) => Promise<unknown>>();
jest.mock('@/lib/api/api-client', () => ({
    api: { get: (url: string) => mockGet(url), post: (url: string, body: unknown) => mockPost(url, body) },
}));

import { LegalDocumentUpdatePrompt } from '../legal-document-update-prompt';

const row = (patch: Record<string, unknown>) => ({ granted: true, standing: 'CURRENT', ...patch });
const consents = (privacy: Record<string, unknown>, terms: Record<string, unknown>) => ({
    success: true,
    data: { consents: { PRIVACY_POLICY: row(privacy), TERMS_OF_SERVICE: row(terms) } },
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockPost.mockResolvedValue({ success: true });
    container = document.createElement('div');
    document.body.appendChild(container);
});

afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
});

async function render() {
    await act(async () => {
        root = createRoot(container);
        root.render(<LegalDocumentUpdatePrompt />);
    });
}

const button = (text: string) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) ?? null;

describe('in-app prompt for a newer edition of the notice or the terms', () => {
    it('everything current: shows nothing', async () => {
        mockGet.mockResolvedValue(consents({ currentVersion: '1.4' }, { currentVersion: '1.1' }));
        await render();
        expect(container.textContent).toBe('');
    });

    it('a newer material notice: asks to acknowledge it, links the page, and records the prompt as the screen', async () => {
        mockGet.mockResolvedValueOnce(consents(
            { standing: 'MUST_ACKNOWLEDGE', version: '1.0.0', currentVersion: '1.4', currentEffectiveDate: '2026-10-28' },
            { currentVersion: '1.1' },
        ));
        await render();
        expect(container.textContent).toContain('นโยบายความเป็นส่วนตัว ฉบับ 1.4');
        expect(container.textContent).toContain('28 ตุลาคม 2569');
        expect(container.querySelector('a[href="/privacy-policy"]')).not.toBeNull();
        expect(container.textContent).not.toContain('ข้อกำหนดการใช้บริการ ฉบับ');

        mockGet.mockResolvedValueOnce(consents({ currentVersion: '1.4' }, { currentVersion: '1.1' }));
        await act(async () => { button('รับทราบ')!.click(); });
        expect(mockPost).toHaveBeenCalledWith('/consent', { category: 'PRIVACY_POLICY', granted: true, source: 'UPDATE_PROMPT' });
        expect(container.textContent).toBe('');
    });

    it('newer material terms: asks to accept them', async () => {
        mockGet.mockResolvedValue(consents(
            { currentVersion: '1.4' },
            { standing: 'MUST_ACKNOWLEDGE', granted: false, currentVersion: '1.1', currentEffectiveDate: '2026-10-03' },
        ));
        await render();
        expect(container.querySelector('a[href="/terms-of-service"]')).not.toBeNull();
        await act(async () => { button('ยอมรับข้อกำหนด')!.click(); });
        expect(mockPost).toHaveBeenCalledWith('/consent', { category: 'TERMS_OF_SERVICE', granted: true, source: 'UPDATE_PROMPT' });
    });

    it('a wording edition: a notice that says nothing of substance changed, recorded as the wording notice', async () => {
        mockGet.mockResolvedValue(consents(
            { standing: 'WORDING_NOTICE', version: '1.4', currentVersion: '1.4.1', currentEffectiveDate: '2026-11-10' },
            { currentVersion: '1.1' },
        ));
        await render();
        expect(container.textContent).toContain('ปรับถ้อยคำ');
        expect(container.textContent).toContain('ไม่เปลี่ยนสาระสำคัญ');
        expect(container.textContent).toContain('1.4.1');
        await act(async () => { button('รับทราบ')!.click(); });
        expect(mockPost).toHaveBeenCalledWith('/consent', { category: 'PRIVACY_POLICY', granted: true, source: 'WORDING_NOTICE' });
    });

    it('the read fails: shows nothing rather than a prompt it cannot back', async () => {
        mockGet.mockResolvedValue({ success: false });
        await render();
        expect(container.textContent).toBe('');
    });
});

import * as React from 'react';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('@gacp/validation/legal-document-versions', () => ({
    currentEditionOf: () => ({ version: '9.9', effectiveDate: '2027-01-15', change: 'MATERIAL' }),
}));

import PrivacyPolicyPage from '@/app/(marketing)/privacy-policy/page';
import TermsOfServicePage from '@/app/(marketing)/terms-of-service/page';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function printed(html: string, term: string): string | undefined {
    const div = document.createElement('div');
    div.innerHTML = html;
    const label = Array.from(div.querySelectorAll('dt')).find((dt) => dt.textContent?.trim() === term);
    return label?.nextElementSibling?.textContent?.trim();
}

describe('legal pages print the effective date of the edition the registry names', () => {
    it('privacy policy', () => {
        const html = renderToStaticMarkup(<PrivacyPolicyPage />);
        expect(printed(html, 'เวอร์ชัน:')).toBe('9.9');
        expect(printed(html, 'วันที่มีผลบังคับใช้:')).toBe('15 มกราคม 2570');
    });

    it('terms of service', async () => {
        globalThis.fetch = (async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch;
        const html = renderToStaticMarkup(await TermsOfServicePage());
        expect(printed(html, 'เวอร์ชัน:')).toBe('9.9');
        expect(printed(html, 'วันที่มีผลบังคับใช้:')).toBe('15 มกราคม 2570');
    });
});

import * as React from 'react';
import { afterEach, describe, expect, it } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import { currentEditionOf } from '@gacp/validation/legal-document-versions';

import PrivacyPolicyPage from '@/app/(marketing)/privacy-policy/page';
import TermsOfServicePage from '@/app/(marketing)/terms-of-service/page';

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
});

function printedVersion(html: string): string | undefined {
    const div = document.createElement('div');
    div.innerHTML = html;
    const label = Array.from(div.querySelectorAll('dt')).find((dt) => dt.textContent?.trim() === 'เวอร์ชัน:');
    return label?.nextElementSibling?.textContent?.trim();
}

describe('legal pages print the version the consent row records', () => {
    it('privacy policy', () => {
        expect(printedVersion(renderToStaticMarkup(<PrivacyPolicyPage />))).toBe(currentEditionOf('PRIVACY_POLICY').version);
    });

    it('terms of service', async () => {
        globalThis.fetch = (async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch;
        expect(printedVersion(renderToStaticMarkup(await TermsOfServicePage()))).toBe(currentEditionOf('TERMS_OF_SERVICE').version);
    });
});

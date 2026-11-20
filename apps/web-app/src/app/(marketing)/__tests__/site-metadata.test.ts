/**
 * What crawlers and link previews are told about the public site.
 *
 * Review of feat/landing-restored (2026-10-06): the sitemap said `/` redirects to /auth
 * and left it out, listed the temporary password sign-up, and used a different origin
 * (gacp-platform.com) from robots.txt and the canonical tags (gacpth.com). The layout
 * description said the platform is "ภายใต้กรมการแพทย์แผนไทยฯ", which no record supports.
 */
import { describe, expect, it } from '@jest/globals';

import sitemap from '../../sitemap';
import robots from '../../robots';
import { metadata as marketingMetadata } from '../layout';
import { CERTIFICATE_ISSUER_TH, PAYEE_TH } from '@/constants/service-facts';
import { DEFAULT_PUBLIC_HOST } from '@/lib/verify/public-verify-url';

const paths = () => sitemap().map((entry) => new URL(entry.url).pathname);

describe('sitemap', () => {
    it('lists the landing page at /', () => {
        expect(paths()).toContain('/');
    });

    it('does not advertise the temporary password pages', () => {
        expect(paths()).not.toContain('/register');
        expect(paths().filter((p) => /\/login$/.test(p))).toEqual([]);
    });

    it('uses the same origin as robots.txt', () => {
        const origins = new Set(sitemap().map((entry) => new URL(entry.url).origin));
        expect([...origins]).toEqual([DEFAULT_PUBLIC_HOST]);
        expect(robots().sitemap).toBe(`${DEFAULT_PUBLIC_HOST}/sitemap.xml`);
    });
});

describe('marketing layout metadata', () => {
    it('says who runs the service and who issues the certificate, and never that the site is under the department', () => {
        const description = String(marketingMetadata.description);
        expect(description).toContain(PAYEE_TH);
        expect(description).toContain(CERTIFICATE_ISSUER_TH);
        expect(description).not.toContain('ภายใต้');
    });

    it('declares a canonical that resolves against the one site origin', () => {
        expect(marketingMetadata.alternates?.canonical).toBe('/');
    });
});

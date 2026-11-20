import { describe, expect, it, jest } from '@jest/globals';

const mockRedirect = jest.fn();
jest.mock('next/navigation', () => ({ permanentRedirect: (to: string) => mockRedirect(to) }));

import TermsPage from '@/app/terms/page';
import sitemap from '@/app/sitemap';

describe('/terms', () => {
    it('redirects to the published terms', () => {
        TermsPage();
        expect(mockRedirect).toHaveBeenCalledWith('/terms-of-service');
    });

    it('is not listed in the sitemap; the published page is', async () => {
        const urls = (await sitemap()).map((entry) => new URL(entry.url).pathname);
        expect(urls).not.toContain('/terms');
        expect(urls).toContain('/terms-of-service');
    });
});

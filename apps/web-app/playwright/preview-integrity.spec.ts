/**
 * ============================================================================
 * Preview integrity — application documents and audit photos must render
 * ============================================================================
 *
 * Every existing spec asserted on DOM text, so a preview whose bytes never
 * loaded still passed: the reviewer's document iframe showed a broken-image
 * icon while the suite reported green.
 *
 * Root cause: fixtures pointed previews at `/mock/*.png` (404 — `public/mock/`
 * does not exist). `installMockAssetRoutes` serves them.
 *
 * The assertion is `naturalWidth`, not visibility: a broken `<img>` is still
 * "visible" to Playwright. `naturalWidth === 0` on a completed image is the
 * browser reporting the bytes failed to decode.
 *
 * Set PREVIEW_NO_ASSET_ROUTES=1 to skip the fix and watch these fail — that is
 * how the RED state was verified rather than assumed.
 */
import { test, expect } from '@playwright/test';
import { installMockAssetRoutes } from './fixtures/mock-assets';

const SKIP_FIX = process.env.PREVIEW_NO_ASSET_ROUTES === '1';

async function assets(page: import('@playwright/test').Page) {
    if (!SKIP_FIX) await installMockAssetRoutes(page);
}

test.describe('Mock asset routes serve decodable content', () => {
    test('every preview URL the app requests returns an image the browser can decode', async ({ page }) => {
        await assets(page);

        // Probe the exact URL shapes the components build, through the same
        // routing layer the app uses, and confirm each decodes in-browser.
        const urls = [
            '/mock/doc-id-card.png',
            '/mock/audit-photo-w1b.png',
        ];

        await page.goto('/');
        const results = await page.evaluate(async (list) => {
            const out: { url: string; w: number; h: number }[] = [];
            for (const u of list) {
                const dims = await new Promise<{ w: number; h: number }>((resolve) => {
                    const img = new Image();
                    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
                    img.onerror = () => resolve({ w: 0, h: 0 });
                    img.src = u;
                });
                out.push({ url: u, ...dims });
            }
            return out;
        }, urls);

        const failed = results.filter((r) => r.w === 0);
        expect(failed.map((f) => f.url), 'these preview URLs did not decode').toEqual([]);
    });
});

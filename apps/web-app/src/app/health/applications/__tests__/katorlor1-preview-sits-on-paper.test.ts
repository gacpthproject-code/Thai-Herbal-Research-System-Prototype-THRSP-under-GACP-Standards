/**
 * The กทล.1 the server assembles is a paper document with its own ink colour
 * (katorlor1-template-service: `.k1{color:#1a1a1a}`), so every wrapper that places it keeps
 * a paper background in both themes. Staging walk ccc4f707d (F3): on step 6 in dark mode the
 * wrapper was bg-background, and the form read as dark grey on black.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const WRAPPERS = [
    path.resolve(__dirname, '../new/_steps/steps/step6-review.tsx'),
    path.resolve(__dirname, '../[id]/preview/client-view.tsx'),
];

describe.each(WRAPPERS)('%s', (file) => {
    const source = readFileSync(file, 'utf8');
    const wrapper = source.slice(0, source.indexOf('dangerouslySetInnerHTML={{ __html: katorlor1Html }}'));
    const className = wrapper.slice(wrapper.lastIndexOf('className="'));

    it('places the กทล.1 on paper in both themes', () => {
        expect(className).toMatch(/\bbg-white\b/);
        expect(className).toMatch(/\bdark:bg-white\b/);
        expect(className).not.toMatch(/\bbg-(background|card)\b/);
    });
});

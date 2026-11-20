// Opens the landing page FAQ and screenshots it at the two brief viewports.
// usage: node evidence/video-truth/faq-shots.mjs <baseUrl> <outDir>   (run from apps/web-app so @playwright/test resolves)
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const { chromium } = createRequire(path.join(process.cwd(), 'package.json'))('@playwright/test');

const [baseUrl, outDir] = process.argv.slice(2);
if (!baseUrl || !outDir) { throw new Error('usage: faq-shots.mjs <baseUrl> <outDir>'); }
fs.mkdirSync(outDir, { recursive: true });

const VIEWPORTS = [
    { name: 'desktop-1440x900', width: 1440, height: 900 },
    { name: 'mobile-390x844', width: 390, height: 844 },
];

const browser = await chromium.launch();
try {
    for (const vp of VIEWPORTS) {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
        await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
        const faq = page.locator('#faqs');
        await faq.waitFor();
        await page.evaluate(() => { document.querySelectorAll('#faqs details').forEach((d) => { d.open = true; }); });
        await faq.scrollIntoViewIfNeeded();
        const answer = (await faq.locator('details').first().locator('p').textContent()) ?? '';
        await faq.screenshot({ path: path.join(outDir, `faq-${vp.name}.png`) });
        // globals.css sets scroll-behavior: smooth, so an animated scroll would be captured at its start.
        await page.evaluate(() => { document.querySelector('#faqs details').scrollIntoView({ block: 'center', behavior: 'instant' }); });
        await page.waitForFunction(() => { const r = document.querySelector('#faqs details').getBoundingClientRect(); return r.top > 100 && r.top < innerHeight / 2; });
        const cardTop = await page.evaluate(() => Math.round(document.querySelector('#faqs details').getBoundingClientRect().top));
        console.log(`${vp.name}: first card top at ${cardTop}px in a ${vp.height}px viewport`);
        await page.screenshot({ path: path.join(outDir, `faq-first-answer-${vp.name}.png`) });
        await page.screenshot({ path: path.join(outDir, `landing-full-${vp.name}.png`), fullPage: true });
        console.log(`${vp.name}: ${answer.trim()}`);
        await page.close();
    }
} finally {
    await browser.close();
}

import { createRequire } from 'node:module';

const { chromium } = createRequire(new URL('../../apps/web-app/package.json', import.meta.url))('@playwright/test');

const [baseUrl, outDir, prefix, ...selectors] = process.argv.slice(2);
const PARTS = selectors.length > 0 ? selectors : ['#recipients'];
const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '1440x900', width: 1440, height: 900 },
];

const fileName = (selector) => selector.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');

async function shoot(page, locator, path) {
  const clip = await locator.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return { x: box.left + window.scrollX, y: box.top + window.scrollY, width: box.width, height: box.height };
  });
  await page.screenshot({ path, fullPage: true, clip });
}

const browser = await chromium.launch();
const seen = [];
try {
  for (const viewport of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    const response = await page.goto(`${baseUrl}/privacy-policy`, { waitUntil: 'load' });
    if (!response?.ok()) {
      throw new Error(`${baseUrl}/privacy-policy answered ${response?.status()} at ${viewport.name}`);
    }
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    const hero = page.locator('section[aria-labelledby="pp-hero"]');
    await page.locator(PARTS[0]).waitFor();
    await shoot(page, hero, `${outDir}/${prefix}-${viewport.name}-effective-date.png`);
    const texts = {};
    for (const selector of PARTS) {
      const part = page.locator(selector);
      await shoot(page, part, `${outDir}/${prefix}-${viewport.name}-${fileName(selector)}.png`);
      texts[selector] = await part.innerText();
    }
    seen.push({
      viewport: viewport.name,
      horizontalOverflowPx: await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      effectiveDate: await hero.locator('dl').innerText(),
      texts,
    });
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ baseUrl, seen }, null, 2));

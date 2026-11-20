import { createRequire } from 'node:module';

const { chromium } = createRequire(new URL('../../apps/web-app/package.json', import.meta.url))('@playwright/test');

const [baseUrl, outDir, prefix, ...paths] = process.argv.slice(2);
const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '1440x900', width: 1440, height: 900 },
];
const RETIRED_CONTACT_SENTENCE = 'หน่วยงานเจ้าของระบบผ่านช่องทางราชการที่ประกาศ';

const fileName = (path) => path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');

const browser = await chromium.launch();
const seen = [];
try {
  for (const viewport of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    for (const path of paths) {
      const response = await page.goto(`${baseUrl}${path}`, { waitUntil: 'load' });
      const hops = [];
      for (let request = response.request().redirectedFrom(); request; request = request.redirectedFrom()) {
        const answer = await request.response();
        hops.unshift({ url: new URL(request.url()).pathname, status: answer?.status(), location: answer?.headers().location ?? null });
      }
      await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
      const landedOn = new URL(page.url()).pathname;
      await page.screenshot({ path: `${outDir}/${prefix}-${viewport.name}-${fileName(path)}.png`, fullPage: landedOn === path });
      seen.push({
        viewport: viewport.name,
        requested: path,
        hops,
        landedOn,
        finalStatus: response.status(),
        h1: (await page.locator('h1').first().innerText()).trim(),
        showsRetiredContactSentence: (await page.locator('body').innerText()).includes(RETIRED_CONTACT_SENTENCE),
        footerPrivacyLinks: await page.locator('footer a[href*="privacy"]').evaluateAll((links) => links.map((a) => a.getAttribute('href'))),
      });
    }
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ baseUrl, seen }, null, 2));

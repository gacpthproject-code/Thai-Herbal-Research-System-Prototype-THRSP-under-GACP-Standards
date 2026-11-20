const { chromium } = require('/home/ubuntu/work/wt-feelines/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');
const fs = require('fs');
const [,, OUT, CARDS] = process.argv;
const BASE = 'http://127.0.0.1:3101';
(async () => {
  const browser = await chromium.launch();
  const probe = await browser.newPage();
  await probe.goto(BASE + '/pricing', { waitUntil: 'networkidle', timeout: 180000 });
  const links = await probe.evaluate(() => [...document.querySelectorAll('link[rel="stylesheet"], style')].map((n) => n.outerHTML));
  const bodyClass = await probe.evaluate(() => document.body.className);
  await probe.close();
  const abs = links.map((l) => l.replace(/href="\//g, `href="${BASE}/`)).join('\n');
  for (const name of ['detail-doc-fee', 'detail-audit-fee', 'checkout-renewal']) {
    const markup = fs.readFileSync(`${CARDS}/${name}.html`, 'utf8');
    for (const width of [390, 1280]) {
      for (const scheme of ['light', 'dark']) {
        const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width, height: 900 } });
        const page = await ctx.newPage();
        await page.setContent(`<!doctype html><html lang="th" class="${scheme === 'dark' ? 'dark' : ''}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${abs}</head><body class="${bodyClass} bg-background"><main style="max-width:1100px;margin:0 auto;padding:12px">${markup}</main></body></html>`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${OUT}/${name}-${width}-${scheme}.png`, fullPage: true });
        // measure every element whose text names a charge: does it overflow its box?
        const report = await page.evaluate(() => [...document.querySelectorAll('a, button, span, p, h3')]
          .filter((e) => /ชำระ|ค่าบริการ/.test(e.textContent || '') && e.children.length === 0)
          .map((e) => ({ t: (e.textContent || '').trim().slice(0, 70), w: Math.round(e.getBoundingClientRect().width), sw: e.scrollWidth, cw: e.clientWidth, h: Math.round(e.getBoundingClientRect().height), overflow: e.scrollWidth > e.clientWidth + 1 })));
        fs.writeFileSync(`${OUT}/${name}-${width}-${scheme}.json`, JSON.stringify(report, null, 1));
        await ctx.close();
      }
    }
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

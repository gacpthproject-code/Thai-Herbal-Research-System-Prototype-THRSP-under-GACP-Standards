const { chromium } = require('/home/ubuntu/work/wt-feelines/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');
const fs = require('fs');
const [,, OUT, CARDS] = process.argv;
const BASE = 'http://127.0.0.1:3101';
(async () => {
  const browser = await chromium.launch();
  // 1) pricing page, served + down, light + dark
  for (const mode of (process.env.SKIP_PRICING ? [] : ['ok', 'down'])) {
    await fetch('http://127.0.0.1:8788/__mode/' + mode);
    for (const scheme of ['light', 'dark']) {
      const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      if (scheme === 'dark') await page.addInitScript(() => { try { localStorage.setItem('theme', 'dark'); } catch {} });
      await page.goto(BASE + '/pricing', { waitUntil: 'networkidle', timeout: 180000 });
      if (scheme === 'dark') await page.evaluate(() => document.documentElement.classList.add('dark'));
      const text = (await page.locator('#fee-breakdown').innerText()).replace(/\s+/g, ' ');
      fs.writeFileSync(`${OUT}/pricing-${mode === 'ok' ? 'served' : 'down'}-${scheme}.txt`, text + '\n');
      await page.locator('#fee-breakdown').screenshot({ path: `${OUT}/pricing-${mode === 'ok' ? 'served' : 'down'}-${scheme}.png` });
      await ctx.close();
    }
  }
  await fetch('http://127.0.0.1:8788/__mode/ok');
  // 2) the review card: the component's real markup (jest dump) inside the app's real CSS
  const probe = await browser.newPage();
  await probe.goto(BASE + '/pricing', { waitUntil: 'networkidle', timeout: 180000 });
  const links = await probe.evaluate(() => [...document.querySelectorAll('link[rel="stylesheet"], style')].map((n) => n.outerHTML));
  const bodyClass = await probe.evaluate(() => document.body.className);
  await probe.close();
  const abs = links.map((l) => l.replace(/href="\//g, `href="${BASE}/`)).join('\n');
  for (const name of ['new', 'renewal']) {
    const card = fs.readFileSync(`${CARDS}/review-card-${name}.html`, 'utf8');
    for (const scheme of ['light', 'dark']) {
      const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 760, height: 900 } });
      const page = await ctx.newPage();
      await page.setContent(`<!doctype html><html lang="th" class="${scheme === 'dark' ? 'dark' : ''}"><head><meta charset="utf-8">${abs}</head><body class="${bodyClass} bg-background"><main style="max-width:720px;margin:20px auto;padding:0 12px">${card}</main></body></html>`, { waitUntil: 'networkidle' });
      const el = page.locator('[data-testid="quotation-review-section"]');
      fs.writeFileSync(`${OUT}/review-card-${name}-${scheme}.txt`, (await el.innerText()).replace(/\n+/g, '\n') + '\n');
      const bg = await page.evaluate(() => { const s = document.querySelector('[data-testid="quotation-review-section"]'); return getComputedStyle(s).backgroundColor + ' / text ' + getComputedStyle(s.querySelector('p, h2')).color; });
      console.log(name, scheme, 'section bg/text', bg);
      await el.screenshot({ path: `${OUT}/review-card-${name}-${scheme}.png` });
      await ctx.close();
    }
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

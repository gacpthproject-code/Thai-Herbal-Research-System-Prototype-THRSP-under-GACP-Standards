const { chromium } = require('/home/ubuntu/work/wt-fees/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');
(async () => {
  const [,, tag] = process.argv;
  const b = await chromium.launch();
  for (const scheme of ['light', 'dark']) {
    const ctx = await b.newContext({ colorScheme: scheme, viewport: { width: 1280, height: 900 } });
    if (scheme === 'dark') await ctx.addInitScript(() => { try { localStorage.setItem('theme', 'dark'); } catch {} });
    const p = await ctx.newPage();
    await p.goto('http://127.0.0.1:3100/pricing', { waitUntil: 'networkidle', timeout: 180000 });
    const isDark = await p.evaluate(() => document.documentElement.classList.contains('dark')); console.log(tag, scheme, 'html.dark on load =', isDark); if (scheme === 'dark' && !isDark) await p.evaluate(() => document.documentElement.classList.add('dark'));
    await p.waitForTimeout(500);
    const info = await p.$$eval('nav[aria-label="เมนูหลัก"] a', (as) => as.map((a) => {
      const cs = getComputedStyle(a); let el = a; let bg = 'rgba(0, 0, 0, 0)';
      while (el && (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')) { bg = getComputedStyle(el).backgroundColor; el = el.parentElement; }
      return { text: a.textContent, color: cs.color, bg, opacity: cs.opacity, cls: a.className.split(' ').filter((c) => /text-|dark:/.test(c)).join(' ') };
    }));
    const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
    for (const i of info) { const L1 = lum(i.color), L2 = lum(i.bg); i.contrast = ((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)).toFixed(2); delete i.cls; }
    console.log(tag, scheme, JSON.stringify(info));
    await p.locator('header').first().screenshot({ path: `header-${tag}-${scheme}.png` });
    await p.screenshot({ path: `pricing-${tag}-${scheme}.png` });
    await ctx.close();
  }
  await b.close();
})();

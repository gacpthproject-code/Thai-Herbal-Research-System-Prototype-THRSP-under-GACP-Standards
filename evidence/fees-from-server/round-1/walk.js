const { chromium } = require('/home/ubuntu/work/wt-fees/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'view-user', role: 'HEALTH', canonicalRole: 'health', exp: 4102444800 })}.x`;
const user = { id: 'view-user', role: 'HEALTH', email: 'view@example.test', firstName: 'มุมมอง' };
(async () => {
  const [,, tag] = process.argv;
  const browser = await chromium.launch();
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 1280, height: 1000 } });
    await ctx.addCookies([{ name: 'auth_token', value: token, domain: '127.0.0.1', path: '/' }]);
    await ctx.addInitScript(([u, t, dark]) => {
      localStorage.setItem('user', u); localStorage.setItem('accessToken', t);
      if (dark) localStorage.setItem('theme', 'dark');
    }, [JSON.stringify(user), token, scheme === 'dark']);
    const page = await ctx.newPage();
    await page.goto('http://127.0.0.1:3100/health/applications/renewal?certId=cert-1', { waitUntil: 'networkidle', timeout: 180000 });
    if (scheme === 'dark') await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.getByRole('button', { name: 'ออกใบแจ้งหนี้ต่อ →' }).click({ timeout: 60000 });
    await page.waitForTimeout(2500);
    if (scheme === 'dark') await page.evaluate(() => document.documentElement.classList.add('dark'));
    const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    console.log(tag, scheme, 'URL', page.url());
    console.log(tag, scheme, 'DOCNUMS', JSON.stringify(text.match(/(INV|QT)-[A-Z0-9-]+/g)));
    console.log(tag, scheme, 'AMOUNTS', JSON.stringify(text.match(/฿?[0-9]{1,3}(,[0-9]{3})+(\.[0-9]+)?/g)));
    console.log(tag, scheme, 'NO_INVOICE_NOTICE', text.includes('ยังไม่มีใบแจ้งหนี้'));
    await page.screenshot({ path: `renewal-invoice-${tag}-${scheme}.png`, fullPage: true });
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error('WALK_ERROR', e.message); process.exit(1); });

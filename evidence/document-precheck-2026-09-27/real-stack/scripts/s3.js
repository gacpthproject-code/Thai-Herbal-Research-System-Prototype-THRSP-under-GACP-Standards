const { open, shot, note, BASE, S } = require(process.env.S + '/lib.js');
(async () => {
  const { browser, ctx, page } = await open({ storage: S + '/applicant.json' });
  await page.goto(BASE + '/health/home', { waitUntil: 'networkidle', timeout: 120000 });
  await page.getByRole('button', { name: /ยื่นในนาม/ }).first().click();
  await page.waitForTimeout(800);
  await shot(page, '05-entity-switcher-open');
  const swP = page.waitForResponse((r) => r.url().includes('/me/switch'), { timeout: 30000 }).catch(() => null);
  await page.getByText('บริษัท สมุนไพรทดสอบ จำกัด').first().click();
  const sw = await swP; note('switch -> ' + (sw ? sw.status() : 'no request'));
  await page.waitForLoadState('networkidle'); await page.waitForTimeout(1500);
  await shot(page, '06-acting-as-company');
  await ctx.storageState({ path: S + '/applicant.json' });
  await page.goto(BASE + '/health/applications/new', { waitUntil: 'networkidle', timeout: 180000 });
  await page.waitForTimeout(3000);
  await shot(page, '07-step1', { full: true });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

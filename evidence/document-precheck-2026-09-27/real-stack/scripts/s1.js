const { open, shot, note, BASE, S } = require(process.env.S + '/lib.js');
(async () => {
  const { browser, ctx, page } = await open();
  await page.goto(BASE + '/auth/health/login', { waitUntil: 'networkidle', timeout: 120000 });
  await shot(page, '01-login-page');
  await page.fill('input[name="identifier"]', '1101700998312');
  await page.fill('input[name="password"]', process.env.WALK_APPLICANT_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 90000 });
  await page.waitForLoadState('networkidle');
  note('after login url ' + page.url());
  await shot(page, '02-after-login');
  await ctx.storageState({ path: S + '/applicant.json' });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

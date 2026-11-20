const { open, shot, note, BASE, S } = require(process.env.S + '/lib.js');
(async () => {
  const { browser, ctx, page } = await open({ storage: S + '/applicant.json' });
  await page.goto(BASE + '/health/workspaces/new', { waitUntil: 'networkidle', timeout: 120000 });
  await page.getByText('นิติบุคคล', { exact: true }).click();
  await page.getByPlaceholder('เช่น บริษัท ABC จำกัด').fill('บริษัท สมุนไพรทดสอบ จำกัด');
  await page.getByPlaceholder('0105561234560').fill('0999911111221');
  await shot(page, '03-workspace-form');
  const resP = page.waitForResponse((r) => r.url().includes('/api/entities') && r.request().method() === 'POST', { timeout: 60000 });
  await page.getByRole('button', { name: 'สร้าง workspace' }).click();
  const res = await resP;
  note(`POST /api/entities -> ${res.status()}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  note('url ' + page.url());
  await shot(page, '04-workspace-created');
  await ctx.storageState({ path: S + '/applicant.json' });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

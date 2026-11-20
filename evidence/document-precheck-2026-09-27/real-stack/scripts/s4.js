const { open, shot, note, BASE, S } = require(process.env.S + '/lib.js');
(async () => {
  const { browser, ctx, page } = await open({ storage: S + '/applicant.json' });
  page.on('response', (r) => { if (r.url().includes('/api/applications') && r.request().method() !== 'GET') note(`${r.request().method()} ${r.url().replace(/^.*\/api/, '/api')} -> ${r.status()}`); });
  await page.goto(BASE + '/health/applications/new', { waitUntil: 'networkidle', timeout: 180000 });
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: /^ขอใหม่/ }).click();
  await page.getByRole('button', { name: /^นิติบุคคล/ }).click();
  await page.getByRole('button', { name: /^ขิง/ }).click();
  await page.waitForTimeout(1000);
  const scope = page.getByRole('button', { name: /^การปลูก/ });
  if (await scope.count()) { await scope.first().click(); note('clicked การปลูก'); }
  await page.waitForTimeout(1000);
  await shot(page, '08-step1-chosen', { full: true });
  await page.getByRole('button', { name: /ถัดไป/ }).click();
  await page.waitForURL(/step\/2/, { timeout: 60000 });
  await page.waitForLoadState('networkidle'); await page.waitForTimeout(3000);
  await shot(page, '09-step2', { full: true });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

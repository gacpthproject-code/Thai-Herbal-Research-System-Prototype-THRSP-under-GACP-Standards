const { open, shot, note, BASE, S } = require(process.env.S + '/lib.js');
// argv: step, JSON {fill:{label:value}, click:[buttonName]}
(async () => {
  const step = process.argv[2]; const spec = JSON.parse(process.argv[3] || '{}');
  const { browser, ctx, page } = await open({ storage: S + '/applicant.json' });
  await page.goto(BASE + '/health/applications/new/step/' + step, { waitUntil: 'networkidle', timeout: 180000 });
  await page.waitForTimeout(3000);
  for (const [l, v] of Object.entries(spec.fill || {})) await page.getByLabel(l, { exact: false }).first().fill(v);
  for (const b of spec.click || []) await page.getByRole('button', { name: b }).first().click();
  for (const b of spec.check || []) await page.getByLabel(b, { exact: false }).first().check();
  await page.waitForTimeout(7000); await page.waitForLoadState('networkidle');
  const next = page.getByRole('button', { name: /ถัดไป/ });
  const en = await next.count() ? await next.isEnabled() : null; note(`step ${step} next enabled: ${en}`);
  if (en) { await next.click(); await page.waitForTimeout(4000); await page.waitForLoadState('networkidle'); }
  note('now ' + page.url());
  await shot(page, 'fill-' + step, { full: true });
  note('labels: ' + (await page.locator('label').allInnerTexts()).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 40).join(' | '));
  note('buttons: ' + (await page.locator('button').allInnerTexts()).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 60).join(' | '));
  await ctx.storageState({ path: S + '/applicant.json' });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

const { open, shot, elShot, note, BASE, S } = require(process.env.S + '/lib.js');
const { card, stateOf, upload, waitState } = require(process.env.S + '/cards.js');
const F = S + '/files/';
(async () => {
  let { browser, ctx, page } = await open({ storage: S + '/applicant.json' });
  let posts = 0; page.on('request', (r) => { if (r.url().includes('/draft-documents') && r.method() === 'POST') posts++; });
  await page.goto(BASE + '/health/applications/new/step/3', { waitUntil: 'networkidle', timeout: 180000 });
  await page.waitForTimeout(2500);
  const cons = page.locator('div.rounded-xl.border-2').filter({ hasText: /ยินยอม/ }).first();
  const btn = cons.getByRole('button', { name: /^(อัปโหลดไฟล์|แทนที่ไฟล์)$/ }).first();
  if (process.env.SKIP0 === '1') { posts = 0; } else {
  let [fc] = await Promise.all([page.waitForEvent('filechooser'), btn.click()]);
  await fc.setFiles(F + 'empty-0byte.pdf');
  await page.waitForTimeout(3000);
  note(`0-byte: POSTs sent=${posts}; card alert: ${(await cons.locator('[role=alert]').allInnerTexts()).join(' | ')}`);
  await elShot(cons, '20-consent-0byte-refused-in-browser'); }
  const tE = await upload(page, cons, F + 'truncated-corrupt.pdf');
  await page.waitForTimeout(300);
  note('E2 state right after upload: ' + await stateOf(cons));
  const rE = await waitState(page, cons, ['checked-ok', 'checked-flags', 'check-failed'], 240000);
  note(`E2 settled: ${rE.s} after ${Date.now() - tE} ms${rE.timeout ? ' TIMEOUT' : ''}`);
  await elShot(cons, '21-consent-corrupt-' + rE.s);
  await ctx.storageState({ path: S + '/applicant.json' });
  await browser.close();
  ({ browser, ctx, page } = await open({ storage: S + '/applicant.json', dark: true }));
  await page.goto(BASE + '/health/applications/new/step/3', { waitUntil: 'networkidle', timeout: 180000 });
  await page.waitForTimeout(2500);
  const c2 = page.locator('div.rounded-xl.border-2').filter({ hasText: /ยินยอม/ }).first();
  await elShot(c2, '21-consent-corrupt-' + await stateOf(c2) + '-dark');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

// A = { p, certRx, crop, cycle, day }  applicant opens a planting cycle on /health/planting/new
let n = 0; const nm = (s) => `${A.p}-${String(++n).padStart(2, '0')}-${s}`;
const log = [];
page.setDefaultTimeout(20000);
await h.go(page, '/health/planting/new');
await h.shot(page, nm('new-form'));
for (const s of await page.locator('select:visible').all()) {
  const opts = await s.locator('option').allTextContents();
  log.push(['options', opts.slice(0, 8)]);
  const want = opts.find((o) => new RegExp(A.certRx).test(o)) || opts.find((o) => new RegExp(`^${A.crop}`).test(o));
  if (want) await s.selectOption({ label: want });
}
const crop = page.getByText('เลือกชนิดพืช', { exact: true }).first();
if (await crop.isVisible().catch(() => false)) { await crop.click(); await page.waitForTimeout(800); await page.getByRole('option', { name: new RegExp(`^${A.crop}`) }).or(page.getByText(A.crop, { exact: true })).first().click(); await page.waitForTimeout(500); }
await page.getByText('เลือกแปลงนี้เข้ารอบปลูก').click().catch((e) => log.push(['pick plot', e.message.slice(0, 80)]));
await page.waitForTimeout(800);
const nums = page.locator('input[placeholder="0"]:visible');
for (let i = 0; i < await nums.count(); i += 1) await nums.nth(i).fill(i % 2 === 0 ? '200' : '100').catch(() => {});
for (let step = 0; step < 6; step += 1) {
  await page.waitForTimeout(1500);
  for (const i of await page.locator('input[type=text]:visible:not([disabled]), input:not([type]):visible:not([disabled])').all()) if (!(await i.inputValue())) await i.fill(A.cycle);
  for (const i of await page.locator('input[type=number]:visible:not([disabled])').all()) if (!(await i.inputValue())) await i.fill('100');
  const dates = await page.locator('input[type=date]:visible:not([disabled])').all();
  for (let k = 0; k < dates.length; k += 1) if (!(await dates[k].inputValue())) await dates[k].fill(k === 0 ? A.day : (A.harvestPlan || '2027-01-30'));
  for (const c of await page.locator('input[type=checkbox]:visible:not([disabled])').all()) await c.check().catch(() => {});
  await h.shot(page, nm(`step${step}`), { settle: 500 });
  const save = page.getByRole('button', { name: /บันทึกรอบปลูก/ });
  if (await save.isVisible().catch(() => false) && await save.isEnabled()) {
    const r = page.waitForResponse((x) => /planting-cycles$/.test(x.url()) && x.request().method() === 'POST', { timeout: 60000 }).catch(() => null);
    await save.click();
    const rr = await r; log.push(['cycle', rr ? rr.status() : 'no-request', rr ? await rr.text() : '']);
    await page.waitForTimeout(5000);
    await h.shot(page, nm('cycle-created'));
    break;
  }
  const next = page.getByRole('button', { name: /ถัดไป|ต่อไป/ }).last();
  if (!(await next.isVisible().catch(() => false))) { log.push(['no next', await page.getByRole('button').allInnerTexts()]); break; }
  await next.click();
}
log.push(page.url());
return log;

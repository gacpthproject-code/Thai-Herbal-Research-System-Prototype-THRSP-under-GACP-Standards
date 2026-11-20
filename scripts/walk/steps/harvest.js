// A = { p, cycle, dates: [bad..., good] }
let k = 0; const log = [];
page.setDefaultTimeout(30000);
await h.go(page, `/health/planting/${A.cycle}`);
await page.getByRole('button', { name: /เก็บเกี่ยว\/สร้างลอต/ }).or(page.getByRole('link', { name: /เก็บเกี่ยว\/สร้างลอต/ })).first().click();
await page.waitForTimeout(3000);
const box = page.locator('div', { has: page.getByRole('button', { name: /ยืนยันเก็บเกี่ยวและสร้างล็อต/ }) }).filter({ has: page.locator('input[type=date]') }).last();
const ins = box.locator('input');
const kinds = await ins.evaluateAll((els) => els.map((e) => [e.type, e.id, e.placeholder, e.disabled, e.readOnly]));
const editable = kinds.map((x, i) => [x, i]).filter(([x]) => !x[3] && !x[4]);
const nums = editable.filter(([x]) => x[0] === 'number').map(([, i]) => ins.nth(i));
const texts = editable.filter(([x]) => x[0] === 'text').map(([, i]) => ins.nth(i));
await nums[0].fill('50');
await texts[0].fill('A');
if (texts[1]) await texts[1].fill('ทดสอบ-A8 ขมิ้นชันสด');
if (texts[2]) await texts[2].fill('ถุงทดสอบ-A8');
if (nums[1]) await nums[1].fill('10');
if (nums[2]) await nums[2].fill('5');
for (const d of A.dates) {
  await box.locator('input[type=date]').first().fill(d);
  await h.shot(page, `${A.p}-${String(++k).padStart(2, '0')}-harvest-${d}`, { settle: 500 });
  const r = page.waitForResponse((x) => x.url().includes('/api/') && x.request().method() === 'POST' && /harvest|lot|batch/.test(x.url()), { timeout: 60000 }).catch(() => null);
  await page.getByRole('button', { name: /ยืนยันเก็บเกี่ยวและสร้างล็อต/ }).click();
  const rr = await r; const body = rr ? (await rr.text()) : '';
  await page.waitForTimeout(500);
  await h.shot(page, `${A.p}-${String(++k).padStart(2, '0')}-after-${d}`, { settle: 500 });
  log.push([d, rr ? rr.url().replace(h.BASE, '') : '', rr ? rr.status() : 'no-request', body]);
  if (rr && rr.status() < 300) break;
}
return log;

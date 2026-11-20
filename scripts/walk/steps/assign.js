// A = { p, num }  dispatcher assigns "ทดสอบ ผู้ตรวจเอกสาร" on /provider/coordinator
await h.go(page, '/provider/coordinator');
await h.shot(page, `${A.p}-01-queue`);
const card = page.locator('div', { hasText: A.num }).filter({ has: page.getByRole('button', { name: /จ่ายงานตรวจ/ }) }).last();
await card.getByRole('button', { name: /จ่ายงานตรวจ/ }).first().click();
await page.waitForTimeout(2500);
const dlg = page.getByRole('dialog').last();
const sel = dlg.locator('select');
if (await sel.count()) { const opts = await sel.first().locator('option').allTextContents(); await sel.first().selectOption({ label: opts.find((o) => /ทดสอบ ผู้ตรวจเอกสาร/.test(o)) }); }
else await dlg.getByText(/ทดสอบ ผู้ตรวจเอกสาร/).first().click();
await h.shot(page, `${A.p}-02-reviewer-picked`, { settle: 800 });
const resp = page.waitForResponse((r) => /reviewer-assignments|assign-reviewer|assign/.test(r.url()) && r.request().method() === 'POST', { timeout: 60000 });
await page.getByRole('button', { name: /ยืนยันจ่ายงาน/ }).first().click();
const r = await resp;
const t = (await r.text()).slice(0, 200);
await h.shot(page, `${A.p}-03-after-assign`);
return [r.status(), t];

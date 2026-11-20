// A = { p, app, mode: 'accept'|'revise', file }  reviewer decides each slot, then the application.
let n = Number(A.n0 || 2); const nm = (s) => `${A.p}-${String(++n).padStart(2, '0')}-${s}`;
page.removeAllListeners('dialog'); page.on('dialog', (d) => d.accept());
await h.go(page, `/provider/reviewer/${A.app}/document-check`);
await page.waitForTimeout(3000);
await h.shot(page, nm('before'));
const log = [];
const accepts = page.getByRole('button', { name: /^รับเอกสารนี้$/ });
const count = await accepts.count();
for (let i = 0; i < count; i += 1) {
  const b = accepts.nth(i);
  if (!(await b.isEnabled())) continue;
  if (A.mode === 'revise') { const cardText = await b.evaluate((el) => { let p = el; for (let k = 0; k < 6; k += 1) p = p.parentElement; return p.innerText; }); if (cardText.includes(A.file) && cardText.split(A.file).length === 2 && !/รับแล้ว/.test(cardText)) { /* handled below */ } }
  const r = page.waitForResponse((x) => /document-reviews/.test(x.url()) && x.request().method() === 'POST', { timeout: 30000 }).catch(() => null);
  await b.click();
  const rr = await r; log.push(['accept', i, rr ? rr.status() : 'no-request']);
  await page.waitForTimeout(500);
}
if (A.mode === 'revise') {
  const card = page.getByText(A.file, { exact: true }).first().locator('xpath=ancestor::div[.//button[normalize-space()="ขอเอกสารเพิ่ม"]][1]');
  await card.getByRole('button', { name: /^ขอเอกสารเพิ่ม$/ }).click();
  await page.waitForTimeout(1500);
  const ta = page.locator('textarea:visible').first();
  if (await ta.count()) await ta.fill('ทดสอบ-A8: สำเนาเอกสารสิทธิ์ไม่ชัด กรุณาอัปโหลดฉบับที่อ่านได้และลงนามรับรองสำเนา');
  await h.shot(page, nm('more-requested-filled'), { settle: 300 });
  const r = page.waitForResponse((x) => /document-reviews/.test(x.url()) && x.request().method() === 'POST', { timeout: 30000 }).catch(() => null);
  await card.getByRole('button', { name: /บันทึก|ยืนยัน|ขอเอกสารเพิ่ม/ }).last().click();
  const rr = await r; log.push(['more', rr ? rr.status() : 'no-request', rr ? (await rr.text()).slice(0, 160) : '']);
}
await h.shot(page, nm('slots-decided'));
const btn = A.mode === 'revise' ? page.getByRole('button', { name: /ส่งคำขอเอกสารเพิ่ม/ }).first() : page.getByRole('button', { name: /^รับคำขอ$/ }).first();
const r = page.waitForResponse((x) => /document-decision/.test(x.url()) && x.request().method() === 'POST', { timeout: 60000 });
await btn.click();
await page.waitForTimeout(1500);
const confirm = page.getByRole('dialog').getByRole('button', { name: /ยืนยัน|รับคำขอ|ส่ง/ }).last();
if (await confirm.isVisible().catch(() => false)) { await h.shot(page, nm('confirm-dialog'), { settle: 300 }); await confirm.click(); }
const rr = await r;
log.push(['decision', rr.status(), (await rr.text()).slice(0, 200)]);
await h.shot(page, nm('after-decision'));
return log;

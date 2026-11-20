// A = { p, app, decision: PASS|MINOR|FAIL, findings }  field inspector on /provider/audits/<app>/inspect with browser GPS near the farm.
let n = Number(A.n0 || 0); const nm = (s) => `${A.p}-${String(++n).padStart(2, '0')}-${s}`;
page.setDefaultTimeout(30000);
page.removeAllListeners('dialog'); page.on('dialog', (d) => d.accept());
const log = [];
await h.go(page, `/provider/audits/${A.app}/inspect`);
await h.shot(page, nm('worksheet'));
const start = page.getByRole('button', { name: /^เริ่มตรวจ$/ });
if (await start.isVisible().catch(() => false)) {
  const r = page.waitForResponse((x) => /\/start$/.test(x.url()) && x.request().method() === 'POST', { timeout: 60000 });
  await start.click();
  const rr = await r; log.push(['start', rr.status(), (await rr.text()).slice(0, 160)]);
}
await page.waitForTimeout(3000);
await h.shot(page, nm('started'));
const yes = page.getByText('ใช่', { exact: true });
const no = page.getByText('ไม่ใช่', { exact: true });
const total = await yes.count();
log.push(['items', total]);
for (let i = 0; i < total; i += 1) {
  if (A.decision === 'FAIL' && i === 0) await no.nth(i).click(); else await yes.nth(i).click();
  await page.waitForTimeout(900);
}
for (let i = 1; i <= 5; i += 1) {
  const r = page.waitForResponse((x) => /\/photo/.test(x.url()) && x.request().method() === 'POST', { timeout: 60000 }).catch(() => null);
  await page.locator('input[type=file]').nth(i - 1).setInputFiles(`${h.F}/inspection/field-${i}.jpg`);
  const rr = await r; log.push(['photo', i, rr ? rr.status() : 'no-request', rr ? (await rr.text()).slice(0, 220) : '']);
  await page.waitForTimeout(1200);
}
await h.shot(page, nm('checklist-filled'));
const next = page.getByRole('button').filter({ hasText: /ทบทวนผลการตรวจ|ถัดไป|สรุปผล/ }).last();
const rc = page.waitForResponse((x) => /checklist/.test(x.url()) && x.request().method() === 'POST', { timeout: 60000 }).catch(() => null);
await next.click();
const rcr = await rc; log.push(['checklist', rcr ? rcr.status() : 'no-request']);
await page.waitForTimeout(2500);
await h.shot(page, nm('decision-step'));
const go = page.getByRole('button', { name: /ไปที่หน้าตัดสินผล/ });
const rc2 = page.waitForResponse((x) => /checklist/.test(x.url()) && x.request().method() === 'POST', { timeout: 30000 }).catch(() => null);
await go.click();
const rc2r = await rc2; log.push(['checklist-save', rc2r ? rc2r.status() : 'no-request']);
await page.waitForTimeout(2500);
await h.shot(page, nm('decision-page'));
const label = { PASS: 'ผ่าน', MINOR: 'ข้อบกพร่องเล็กน้อย (ให้แก้ไข)', FAIL: 'ไม่ผ่าน' }[A.decision];
await page.getByText(label, { exact: true }).first().click();
await page.locator('textarea[placeholder="สรุปผลการตรวจประเมินภาคสนาม"]').fill(`ทดสอบ-A8: ผลการตรวจ ${A.decision} ตรวจครบทุกข้อ ภาพหลักฐาน 5 ภาพ`);
if (A.decision !== 'PASS') {
  await page.locator('textarea[placeholder="ข้อที่พบ"]').first().fill('ทดสอบ-A8: พื้นที่ใกล้แหล่งปนเปื้อน ไม่มีแนวกันชน');
  await page.locator('textarea[placeholder="แนวทางแก้ไข"]').first().fill('ทดสอบ-A8: จัดทำแนวกันชนและส่งภาพหลักฐาน');
  for (let k = 2; k <= Number(A.findings || 1); k += 1) {
    await page.getByRole('button', { name: /เพิ่มรายการ/ }).first().click();
    await page.waitForTimeout(600);
    await page.locator('textarea[placeholder="ข้อที่พบ"]').nth(k - 1).fill(`ทดสอบ-A8: ข้อบกพร่องที่ ${k} ป้ายชี้บ่งแปลงไม่ครบ`);
    await page.locator('textarea[placeholder="แนวทางแก้ไข"]').nth(k - 1).fill(`ทดสอบ-A8: ติดป้ายชี้บ่งและส่งภาพ (ข้อ ${k})`);
  }
}
await h.shot(page, nm('decision-filled'), { settle: 500 });
const rd = page.waitForResponse((x) => /decision/.test(x.url()) && x.request().method() === 'POST', { timeout: 60000 }).catch(() => null);
await page.getByRole('button', { name: /ส่งผลการตรวจ|ยืนยันบันทึกผลไม่ผ่าน/ }).last().click();
await page.waitForTimeout(1200);
const cf = page.getByRole('button', { name: /ยืนยัน/ }).last();
if (await cf.isVisible().catch(() => false)) { await h.shot(page, nm('confirm'), { settle: 300 }); await cf.click(); }
const rdr = await rd; log.push(['decision', rdr ? rdr.status() : 'no-request', rdr ? (await rdr.text()).slice(0, 300) : '']);
await page.waitForTimeout(2500);
await h.shot(page, nm('after-decision'));
return log;

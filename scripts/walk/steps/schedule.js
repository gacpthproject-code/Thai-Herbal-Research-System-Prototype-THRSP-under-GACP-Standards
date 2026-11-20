// A = { p, num, day, at }  dispatcher books the field inspection on /provider/calendar
let n = 0; const nm = (s) => `${A.p}-${String(++n).padStart(2, '0')}-${s}`;
await h.go(page, '/provider/calendar');
await h.shot(page, nm('calendar'));
if (A.tab) { await page.getByText(new RegExp(`^${A.tab} \\(\\d+\\)$`)).first().click(); await page.waitForTimeout(2000); await h.shot(page, nm('tab')); }
const row = page.locator('div', { hasText: A.num }).filter({ has: page.getByRole('button', { name: /จัดคู่นัดตรวจ|นัดลงพื้นที่ซ้ำ/ }) }).last();
await row.getByRole('button', { name: /จัดคู่นัดตรวจ|นัดลงพื้นที่ซ้ำ/ }).first().click();
await page.waitForTimeout(2500);
const dlg = page.getByRole('dialog').last();
const dlgText = (await dlg.innerText()).slice(0, 600);
for (const s of await dlg.locator('select').all()) { const opts = await s.locator('option').allTextContents(); const want = opts.find((o) => /ทดสอบ ผู้ตรวจแปลง/.test(o)); if (want) await s.selectOption({ label: want }); }
const dt = dlg.locator('input[type=datetime-local]'); if (await dt.count()) await dt.first().fill(`${A.day}T${A.at}`);
const d = dlg.locator('input[type=date]'); if (await d.count()) await d.first().fill(A.day);
const t = dlg.locator('input[type=time]'); if (await t.count()) await t.first().fill(A.at);
const pick = dlg.getByText('เลือกผู้ตรวจพื้นที่...').first();
if (await pick.isVisible().catch(() => false)) { await pick.click(); await page.waitForTimeout(800); await page.getByRole('option', { name: /ทดสอบ ผู้ตรวจแปลง/ }).or(page.getByText(/ทดสอบ ผู้ตรวจแปลง/)).last().click(); }
const dur = dlg.locator('input[type=number]'); if (await dur.count()) await dur.first().fill('120');
const loc = dlg.locator('input[placeholder="ลิงก์แผนที่ของพื้นที่"]'); if (await loc.count()) await loc.first().fill('https://maps.google.com/?q=13.8621,100.5144');
const locText = dlg.locator('input[name*=location], textarea[name*=location], input[placeholder="ที่ตั้งพื้นที่"]'); if (await locText.count()) await locText.first().fill('แปลงทดสอบ-A8 นนทบุรี');
await h.shot(page, nm('filled'), { settle: 500 });
const r = page.waitForResponse((x) => /audits\/schedules|schedule/.test(x.url()) && x.request().method() === 'POST', { timeout: 60000 });
await dlg.getByRole('button', { name: /ยืนยัน|บันทึก|นัด/ }).last().click();
const rr = await r;
const body = (await rr.text()).slice(0, 300);
await h.shot(page, nm('after'));
return [dlgText, rr.status(), body];

// A = { p, holderRx, plant, site, contact }  applicant files a new application through the six-step wizard and submits it.
let n = 0; const nm = (s) => `${A.p}-${String(++n).padStart(2, '0')}-${s}`;
const log = [];
const F = h.F + '/';
const pick = (t) => /แผนการผลิต/.test(t) ? 'production_util_plan.pdf' : /ความปลอดภัย/.test(t) ? 'security_residue_plan.pdf' : /SOP|คู่มือ/.test(t) ? 'sop_manual.pdf'
  : /ภาพ|รูปถ่าย/.test(t) ? 'site_photos.jpg' : /แผนที่|พิกัด/.test(t) ? 'site_map_coords.pdf' : /สิทธิ|โฉนด|ที่ดิน/.test(t) ? 'land_rights.pdf'
  : /หนังสือรับรอง|จดทะเบียน/.test(t) ? 'juristic_reg_6m.pdf' : /มอบอำนาจ|ผู้มีอำนาจ|ผู้แทน/.test(t) ? 'juristic_authority.pdf' : /บัตร|ทะเบียนบ้าน/.test(t) ? 'id_house_reg.pdf' : 'sop_manual.pdf';
const uploadAll = async () => {
  const inputs = page.locator('main input[type=file]');
  for (let i = 0; i < await inputs.count(); i += 1) {
    const inp = inputs.nth(i);
    const label = await inp.evaluate((el) => { let p = el; for (let k = 0; k < 8 && p; k += 1) { p = p.parentElement; if (p && /อัปโหลด|แนบ/.test(p.innerText) && p.innerText.length > 60) return p.innerText; } return ''; });
    if (!/ยังไม่ได้แนบ/.test(label)) continue;
    for (let tries = 0; tries < 3; tries += 1) {
      const resp = page.waitForResponse((r) => /documents/.test(r.url()) && r.request().method() === 'POST', { timeout: 90000 }).catch(() => null);
      await inp.setInputFiles(F + pick(label));
      const r = await resp;
      log.push(['upload', label.split('\n')[0].slice(0, 40), r ? r.status() : 'none']);
      if (r && r.status() < 300) break;
      await page.waitForTimeout(15000);
    }
    await page.waitForTimeout(800); // round 2: no pacing, nginx api_upload is now 30r/m burst 50 status 429
  }
};
const next = async () => { await page.getByRole('button', { name: /^ถัดไป$/ }).click(); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(2500); };
const back = async () => { await page.getByRole('button', { name: /^ย้อนกลับ$/ }).click(); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(2500); };
const e = h.credsRaw(A.role);
await h.go(page, '/health/applications/new');
await page.getByRole('radio', { name: /ขอใหม่/ }).first().click();
await page.waitForTimeout(800);
{ const hb = page.getByRole('radio', { name: new RegExp(A.holderRx) }).first(); if (await hb.count()) await hb.click(); else await page.getByText(new RegExp(A.holderRx)).first().click(); }
await page.getByRole('radio', { name: new RegExp(`^${A.plant}`) }).first().click();
await h.shot(page, nm('step1'), { settle: 500 });
await next(); await next();
const tick = async (rx, on) => { const c = page.getByRole('checkbox', { name: rx }).first(); if (((await c.getAttribute('aria-checked')) === 'true') !== on) await c.click(); };
const f = async (id, v) => { await page.fill('#' + id, v); await page.waitForTimeout(120); };
await f('site-name', A.site); await f('site-address', '99 หมู่ 1'); await f('site-subdistrict', 'บางกระสอ'); await f('site-district', 'เมืองนนทบุรี'); await f('site-province', 'นนทบุรี'); await f('site-postal-code', '11000'); await f('coordinates', '13.8621, 100.5144');
const mine = page.getByText('ใช้ชื่อและเบอร์ของฉัน'); if (await mine.count()) await mine.first().click();
await page.waitForTimeout(500);
if (!(await page.inputValue('#site-contact-name'))) await f('site-contact-name', A.contact);
if (!(await page.inputValue('#site-phone'))) await f('site-phone', e.WALK_PHONE);
if (await page.locator('#site-contact-informed').count()) await page.check('#site-contact-informed').catch(() => page.locator('#site-contact-informed').click());
await page.getByText('เป็นเจ้าของที่ดินเอง', { exact: true }).click();
await f('land-doc-type', 'โฉนด'); await f('land-doc-number', '12345');
await tick(/^กลางแจ้ง/, true); await tick(/^โรงเรือน/, false); await tick(/^อาคาร/, false);
await f('area-sqm', '200'); await f('plants-per-cycle', '100'); await f('cycles-per-year', '2');
await page.waitForTimeout(3000);
await next();
{ const c = page.getByRole('checkbox', { name: /ศึกษาวิจัย/ }).first(); if ((await c.getAttribute('aria-checked')) !== 'true') await c.click(); }
await page.getByRole('radio', { name: /ส่วนขยายพันธุ์อื่น/ }).first().click();
await page.fill('#variety-name-0', `${A.plant}พันธุ์พื้นเมือง (ทดสอบ-A8)`);
await page.fill('#variety-source-0', 'แปลงขยายพันธุ์นนทบุรี'); await page.fill('#variety-qty-0', '20'); await page.fill('#variety-unit-0', 'กิโลกรัม');
await page.getByRole('radio', { name: /^ในประเทศ/ }).first().click();
await page.waitForTimeout(3000);
await next();
await uploadAll();
await back(); await uploadAll();
await back(); await uploadAll();
await back(); await uploadAll();
const q = new URL(page.url()).search;
await h.go(page, `/health/applications/new/step/6${q}`);
await page.waitForTimeout(4000);
const decl = page.locator('main [role=checkbox], main input[type=checkbox]');
for (let i = 0; i < await decl.count(); i += 1) {
  const c = decl.nth(i);
  if (!(await c.isVisible())) continue;
  const checked = (await c.getAttribute('aria-checked')) === 'true' || (await c.evaluate((el) => el.checked === true));
  if (!checked) await c.click().catch(() => {});
}
await h.shot(page, nm('step6-ticked'));
const resp = page.waitForResponse((r) => /\/api\/applications\/submit/.test(r.url()) && r.request().method() === 'POST', { timeout: 120000 });
await page.getByRole('button', { name: /^\s*ยื่นคำขอ\s*$/ }).first().click();
const r = await resp; const j = await r.json().catch(() => ({}));
await page.waitForTimeout(4000);
await h.shot(page, nm('after-submit'));
h.records({ kind: 'application', tag: A.p, id: j.data?.id, number: j.data?.applicationNumber, plant: A.plant, role: A.role });
return [r.status(), j.data?.id, j.data?.applicationNumber, j.data?.status, j.error || j.message || '', log];

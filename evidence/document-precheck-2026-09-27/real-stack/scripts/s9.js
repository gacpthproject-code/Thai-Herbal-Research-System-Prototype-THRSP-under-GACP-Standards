const { open, shot, elShot, note, BASE, S } = require(process.env.S + '/lib.js');
const { stateOf } = require(process.env.S + '/cards.js');
(async () => {
  for (const dark of [false, true]) {
    const { browser, ctx, page } = await open({ storage: S + '/applicant.json', dark });
    await page.goto(BASE + '/health/applications/new/step/3', { waitUntil: 'networkidle', timeout: 180000 });
    await page.waitForTimeout(3000);
    note(`s9 dark=${dark} html class='${await page.evaluate(() => document.documentElement.className)}'`);
    const sfx = dark ? '-dark' : '';
    const land = page.locator('div.rounded-xl.border-2').filter({ hasText: 'สำเนาเอกสารสิทธิ์ที่ดิน' }).first();
    const cons = page.locator('div.rounded-xl.border-2').filter({ hasText: /ยินยอม/ }).first();
    const map = page.locator('div.rounded-xl.border-2').filter({ hasText: 'แผนที่แสดงที่ตั้ง' }).first();
    if (!dark) { await elShot(land, `19-land-deed-${await stateOf(land)}`); await elShot(cons, `21-consent-corrupt-${await stateOf(cons)}`); }
    await elShot(map, `22-missing-slot-card${sfx}`);
    if (!dark) { const btn = cons.getByRole('button', { name: 'แทนที่ไฟล์' }); note('consent replace btn count ' + await btn.count()); }
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });

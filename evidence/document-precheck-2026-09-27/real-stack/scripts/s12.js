const { open, shot, elShot, note, BASE, S } = require(process.env.S + '/lib.js');
const APP = '5d4134cb-87ba-4bb9-92b9-fb42366bbb6c';
(async () => {
  let { browser, ctx, page } = await open();
  await page.goto(BASE + '/auth/provider/login', { waitUntil: 'networkidle', timeout: 180000 });
  await page.fill('input[name="provider-id"]', '1111111111111');
  await page.fill('input[name="provider-password"]', process.env.WALK_OFFICER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 90000 });
  await page.waitForLoadState('networkidle');
  note('officer after login ' + page.url());
  await ctx.storageState({ path: S + '/officer.json' });
  await browser.close();
  for (const dark of [false, true]) {
    ({ browser, ctx, page } = await open({ storage: S + '/officer.json', dark }));
    let dc = null;
    page.on('response', async (r) => { if (r.url().includes('/document-check') && r.request().method() === 'GET' && r.url().includes('/api/')) { dc = r.status(); } });
    await page.goto(BASE + `/provider/reviewer/${APP}/document-check`, { waitUntil: 'networkidle', timeout: 180000 });
    await page.waitForTimeout(4000);
    note(`officer dark=${dark} html='${await page.evaluate(() => document.documentElement.className)}' document-check api status=${dc} url=${page.url()}`);
    const sfx = dark ? '-dark' : '';
    await shot(page, '31-officer-document-check' + sfx, { full: true });
    if (!dark) {
      const txt = await page.locator('main').innerText().catch(() => page.locator('body').innerText());
      require('fs').writeFileSync(S + '/officer-page.txt', txt.replace(/\d{9}(\d{4})/g, '…$1'));
      note('13-digit run on officer page: ' + /\d{13}/.test(txt));
      for (const t of ['ไม่มีข้อสังเกต', 'ข้อสังเกต', 'ตรวจเอง', 'ผู้ยื่นยืนยันแล้ว', 'ความมั่นใจในการอ่าน', 'ผลตรวจอัตโนมัติเป็นข้อสังเกตเบื้องต้น การตัดสินเป็นของเจ้าหน้าที่']) note(`count "${t}": ${await page.getByText(t, { exact: false }).count()}`);
    }
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });

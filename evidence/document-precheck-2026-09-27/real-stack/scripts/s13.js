const { open, elShot, note, BASE, S } = require(process.env.S + '/lib.js');
const APP = '5d4134cb-87ba-4bb9-92b9-fb42366bbb6c';
(async () => {
  for (const dark of [false, true]) {
    const { browser, page } = await open({ storage: S + '/officer.json', dark });
    await page.goto(BASE + `/provider/reviewer/${APP}/document-check`, { waitUntil: 'networkidle', timeout: 180000 });
    await page.waitForTimeout(3000);
    // hide the sticky action bar so it does not cover rows in element shots
    await page.addStyleTag({ content: '.fixed, .sticky { position: static !important; }' });
    const sfx = dark ? '-dark' : '';
    for (const [file, name] of [['company_reg--expired.pdf', '32-officer-row-juristic-acknowledged'], ['blank-page.png', '33-officer-row-idhouse-unreadable'], ['land_deed--correct-text.pdf', '34-officer-row-land-deed-ok'], ['truncated-corrupt.pdf', '35-officer-row-consent-failed']]) {
      const row = page.locator('div.rounded-2xl, div.rounded-xl, li, section').filter({ hasText: file }).filter({ hasText: 'ผลตรวจเอกสารเบื้องต้นอัตโนมัติ' }).last();
      if (await row.count()) await elShot(row, name + sfx); else note('row not found ' + file);
    }
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });

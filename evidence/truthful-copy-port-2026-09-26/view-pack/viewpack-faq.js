// FAQ topics opened one by one, every question expanded. Usage: node viewpack-faq.js <label> <outdir>
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const [, , label, outDir] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const log = [];
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'th-TH' })).newPage();
  await page.goto('http://localhost:3117/help/faq', { waitUntil: 'networkidle', timeout: 180000 });
  for (const [slug, topic] of [['payment', 'การชำระเงิน'], ['audit', 'การตรวจฟาร์ม'], ['cert', 'ใบรับรอง'], ['refund', 'การคืนเงิน']]) {
    const tab = page.getByRole('tab').filter({ hasText: topic }).first();
    if (!(await tab.count())) { log.push(`topic tab not found: ${topic}`); continue; }
    await tab.click();
    await page.waitForTimeout(300);
    const qs = page.locator('button[id^="faq-q-"]');
    const n = await qs.count();
    for (let i = 0; i < n; i += 1) {
      if ((await qs.nth(i).getAttribute('aria-expanded')) !== 'true') await qs.nth(i).click();
    }
    await page.waitForTimeout(300);
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {});
    await page.screenshot({ path: path.join(outDir, `${label}-faq-${slug}.png`), fullPage: true });
    const t = (await page.locator('main').first().innerText()).replace(/\s+/g, ' ');
    log.push(`${label}-faq-${slug}.png (${n} questions opened): ${t}`);
  }
  fs.writeFileSync(path.join(outDir, `${label}-faq-text.txt`), log.join('\n\n') + '\n');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

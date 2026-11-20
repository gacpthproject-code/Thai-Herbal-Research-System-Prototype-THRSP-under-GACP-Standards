import { chromium } from '@playwright/test';
const ID = process.env.BATCH;
const OUT = '/home/ubuntu/work/GACP-Certification-Application/evidence/ui-walk-2026-09-06';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'th-TH' });
const page = await ctx.newPage();
const url = `http://127.0.0.1:3099/trace/batch/${ID}`;
const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1500);
const text = await page.innerText('body');
const html = await page.content();
await page.screenshot({ path: `${OUT}/public-scan-batch-mobile.png`, fullPage: true });
console.log(JSON.stringify({
  url, httpStatus: resp?.status() ?? null,
  showsFarmName: text.includes('แปลงทดสอบ ERP'),
  showsAddress: text.includes('99/1 หมู่ 5'),
  showsLab: /ห้องปฏิบัติการกลาง|CL-UI-001|ผลวิเคราะห์/.test(text),
  leaksLatitude: /latitude|longitude|"lat"|"lng"/.test(html),
  leaksOwnerName: /สมชาย/.test(html),
  textLength: text.length, visibleText: text,
}, null, 1));
await browser.close();

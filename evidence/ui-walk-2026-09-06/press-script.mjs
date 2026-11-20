import { chromium } from '@playwright/test';

const QR = process.env.QR;
const OUT = '/home/ubuntu/work/GACP-Certification-Application/evidence/ui-walk-2026-09-06';

const browser = await chromium.launch();
// A phone, because that is what a buyer scanning a bag is holding.
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'th-TH' });
const page = await ctx.newPage();

const url = `http://127.0.0.1:3099/trace/lot/${QR}`;
const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1500);

const text = await page.innerText('body');
await page.screenshot({ path: `${OUT}/public-scan-mobile.png`, fullPage: true });

const html = await page.content();
const report = {
    url,
    httpStatus: resp?.status() ?? null,
    // ต้องเห็น
    showsFarmName: text.includes('แปลงทดสอบ ERP'),
    showsAddress: text.includes('99/1 หมู่ 5'),
    showsLab: /ห้องปฏิบัติการกลาง|CL-UI-001|ผลตรวจ|ผลวิเคราะห์/.test(text),
    // ต้องไม่หลุด — ค้นทั้ง DOM ไม่ใช่แค่ข้อความที่มองเห็น
    leaksLatitude: /latitude|longitude|"lat"|"lng"/.test(html),
    leaksOwnerName: /สมชาย/.test(html),
    textLength: text.length,
};
report.visibleText = text;
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
console.log(JSON.stringify(report, null, 1));
await browser.close();

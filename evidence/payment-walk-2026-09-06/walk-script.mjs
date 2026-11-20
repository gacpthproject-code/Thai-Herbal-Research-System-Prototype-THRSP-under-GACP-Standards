import { chromium } from '@playwright/test';
const BASE = 'http://127.0.0.1:3099';
const OUT = '/home/ubuntu/work/GACP-Certification-Application/evidence/payment-walk-2026-09-06';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 2000 }, locale: 'th-TH' })).newPage();
page.on('response', async (r) => {
    if (/payments|invoice|quotation|checkout|fees|login/.test(r.url()) && r.url().includes('/api/')) {
        let b=''; try { b=(await r.text()).slice(0,240); } catch {}
        console.log(`  [${r.request().method()} ${r.status()}] ${r.url().replace(BASE,'')} :: ${b}`);
    }
});
await page.goto(`${BASE}/auth/health/login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(4000);   // ปล่อยให้ React hydrate ก่อน ไม่งั้นค่าที่พิมพ์ถูกล้าง
console.log('inputs:', JSON.stringify(await page.$$eval('input', (els) => els.map((e) => ({id: e.id, name: e.name, type: e.type})))));
console.log('buttons:', JSON.stringify(await page.$$eval('button', (els) => els.map((e) => e.textContent.trim().slice(0,20)))));
await page.fill('#identifier', '1100100100012');
await page.fill('#password', 'Test@12345');
await page.locator('button:has-text("เข้าสู่ระบบ")').last().click();
await page.waitForTimeout(3000);
const alerts = await page.$$eval('[role=alert]', (els) => els.map((e) => e.textContent.trim().slice(0,160)));
console.log('ข้อความหลังกดเข้าสู่ระบบ:', JSON.stringify(alerts));
await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 90000 }).catch(() => null);
await page.waitForTimeout(6000);
console.log('หลังเข้าระบบ →', page.url());

await page.goto(`${BASE}/health/payments`, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => null);
await page.waitForTimeout(7000);
console.log('=== หน้าชำระเงินของเกษตรกร ===  url:', page.url());
console.log((await page.innerText('body')).slice(0, 2200));
await page.screenshot({ path: `${OUT}/01-payments.png`, fullPage: true });
console.log('ปุ่ม:', JSON.stringify(await page.$$eval('button, a[href*="pay"], a[href*="invoice"]', (els) => els.map((e) => e.textContent.trim().replace(/\s+/g,' ').slice(0,28)).filter(Boolean).slice(0,20))));
await browser.close();

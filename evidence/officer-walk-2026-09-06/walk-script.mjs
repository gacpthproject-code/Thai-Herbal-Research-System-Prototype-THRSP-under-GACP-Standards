import { chromium } from '@playwright/test';
const BASE = 'http://127.0.0.1:3099';
const OUT = '/home/ubuntu/work/GACP-Certification-Application/evidence/officer-walk-2026-09-06';
const APP = '4d136e02-53d6-4986-9a39-4fca71b5cf92';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1800 }, locale: 'th-TH' })).newPage();
page.on('response', async (r) => {
    if (r.url().includes('/api/provider/') || r.url().includes('document-')) {
        let b=''; try { b=(await r.text()).slice(0,220); } catch {}
        console.log(`  [${r.request().method()} ${r.status()}] ${r.url().replace(BASE,'')} :: ${b}`);
    }
});
page.on('requestfailed', (r) => console.log(`  [NETFAIL] ${r.method()} ${r.url().replace(BASE,'')} :: ${r.failure()?.errorText}`));
page.on('request', (r) => { if (r.method() !== 'GET' ) console.log(`  [REQ ${r.method()}] ${r.url().replace(BASE,'')}`); });
page.on('console', (m) => { if (m.type()==='error') console.log('  [console.error]', m.text().slice(0,140)); });

// เจ้าหน้าที่เข้าด้วยประตูชั่วคราวของฝั่งเจ้าหน้าที่
await page.goto(`${BASE}/auth/provider/login`, { waitUntil: 'networkidle', timeout: 90000 });
const ids = await page.$$eval('input', (els) => els.map((e) => e.id || e.getAttribute('name')));
console.log('ช่องกรอกหน้าเข้าระบบเจ้าหน้าที่:', JSON.stringify(ids));
await page.fill('#provider-id', '1111111111111');
await page.fill('#provider-password', 'Gacp@2025');
await page.click('button:has-text("เข้าสู่ระบบเจ้าหน้าที่")');
await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000 }).catch(() => null);
await page.waitForTimeout(4000);
console.log('หลังเข้าระบบ →', page.url());
console.log((await page.innerText('body')).slice(0, 400).replace(/\n+/g, ' | '));
await page.screenshot({ path: `${OUT}/01-provider-home.png`, fullPage: true });

await page.goto(`${BASE}/provider/reviewer`, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => null);
await page.waitForTimeout(5000);
console.log('=== คิวผู้ตรวจเอกสาร ===  url:', page.url());
console.log((await page.innerText('body')).slice(0, 1200));
await page.screenshot({ path: `${OUT}/02-reviewer-queue.png`, fullPage: true });

// หน้าตรวจเอกสารตาม กทล.1 (T13)
await page.goto(`${BASE}/provider/reviewer/${APP}/document-check`, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => null);
await page.waitForTimeout(6000);
console.log('=== หน้าตรวจเอกสาร ===  url:', page.url());
console.log((await page.innerText('body')).slice(0, 2200));
await page.screenshot({ path: `${OUT}/03-document-check.png`, fullPage: true });
// รับเอกสารทุกใบ ยกเว้นใบสุดท้ายที่จะขอเพิ่ม
const accepts = page.locator('button:has-text("รับเอกสารนี้")');
const total = await accepts.count();
console.log('จำนวนปุ่ม "รับเอกสารนี้":', total);
// กดทีละแถวตามลำดับ ไม่ใช้ .first() ซ้ำ — ปุ่มของแถวที่รับแล้วยังอยู่บนหน้า
// ข้ามปุ่มที่ถูกปิด — ช่องที่ยังไม่ได้แนบเอกสารรับไม่ได้ (REVIEW_SLOT_NOT_ATTACHED)
let accepted = 0, skipped = 0;
for (let i = 0; i < total; i += 1) {
    const b = page.locator('button:has-text("รับเอกสารนี้")').nth(i);
    if (!(await b.count())) { continue; }
    if (await b.isDisabled()) { skipped += 1; continue; }
    await b.click(); accepted += 1; await page.waitForTimeout(1000);
}
console.log(`กดรับ ${accepted} ช่อง · ข้ามช่องที่ไม่มีเอกสาร ${skipped} ช่อง`);
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/04-after-accepts.png`, fullPage: true });
const t = await page.innerText('body');
console.log('=== หลังรับเอกสาร ===');
console.log('มีคำว่า "รับแล้ว"?', t.includes('รับแล้ว'));
const summary = t.slice(t.indexOf('ผลตรวจเบื้องต้น'));
console.log(summary.slice(0, 400));
console.log('ปุ่มที่เหลือ:', JSON.stringify(await page.$$eval('button', (els) => els.map((e) => ({t: e.textContent.trim().replace(/\s+/g,' ').slice(0,22), d: e.disabled})).filter((x)=>x.t).slice(-8))));

// ตัดสินใจขั้นสุดท้าย
const decide = page.locator('button:has-text("รับคำขอ")').first();
console.log('ปุ่ม "รับคำขอ" disabled =', await decide.isDisabled());
if (!(await decide.isDisabled())) {
    await decide.click();
    await page.waitForTimeout(7000);
    console.log('=== หลังกดรับคำขอ ===  url:', page.url());
    const t2 = await page.innerText('body');
    console.log(t2.slice(0, 900));
    await page.screenshot({ path: `${OUT}/05-after-decision.png`, fullPage: true });
}
await browser.close();

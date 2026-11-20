// The real screens of the CAR_PENDING edit hand-off, at the two viewports the brief names.
// Credentials come from the environment (sourced from a 0600 file), never from argv, never printed.
import { createRequire } from 'node:module';
import fs from 'node:fs';

const { chromium } = createRequire('/home/ubuntu/work/wt-filing-legs/apps/web-app/package.json')('@playwright/test');
const BASE = 'http://127.0.0.1:3040';
const OUT = '/tmp/flt/walk/shots';
const { WALK_ID, WALK_PASSWORD, WALK_APP } = process.env;
if (!WALK_ID || !WALK_PASSWORD || !WALK_APP) { throw new Error('walk env missing'); }
const VIEWPORTS = [{ name: '390x844', width: 390, height: 844 }, { name: '1440x900', width: 1440, height: 900 }];

const browser = await chromium.launch();
const seen = [];
try {
    for (const viewport of VIEWPORTS) {
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, locale: 'th-TH' });
        const page = await context.newPage();
        const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

        await page.goto(`${BASE}/auth/health/login`, { waitUntil: 'load' });
        await page.waitForSelector('#identifier', { timeout: 60000 });
        await page.fill('#identifier', WALK_ID);
        await page.fill('#password', WALK_PASSWORD);
        await page.click('button[type="submit"]');
        await page.waitForURL(/\/health\/(dashboard|home)/, { timeout: 60000 });

        await page.goto(`${BASE}/health/applications/${WALK_APP}/edit`, { waitUntil: 'load' });
        await page.getByRole('button', { name: /เริ่มแก้ไขคำขอ/ }).click({ timeout: 60000 });
        await page.waitForURL('**/health/applications/new**', { timeout: 60000 });
        await page.goto(`${BASE}/health/applications/new/step/6`, { waitUntil: 'load' });
        const notice = page.locator('[data-testid="step6-car-evidence-round"]');
        await notice.waitFor({ timeout: 60000 });
        const submit = page.locator('[data-testid="step6-submit"]');
        for (let i = 0; i < 12 && await page.locator('input[type="checkbox"]:not(:checked)').count() > 0; i += 1) {
            await page.locator('input[type="checkbox"]:not(:checked)').first().check();
        }
        await page.waitForFunction(() => !document.querySelector('[data-testid="step6-submit"]')?.hasAttribute('disabled'), null, { timeout: 60000 });
        await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
        await page.screenshot({ path: `${OUT}/edit-step6-${viewport.name}.png`, fullPage: true });
        const step6 = { url: page.url(), notice: await notice.innerText(), button: await submit.innerText(), horizontalOverflowPx: await overflow() };

        await submit.click();
        await page.waitForURL(`**/health/applications/${WALK_APP}/car`, { timeout: 60000 });
        const carHeading = page.getByRole('heading', { name: /ส่งเอกสารแก้ไข/ });
        await carHeading.waitFor({ timeout: 60000 });
        await page.waitForLoadState('networkidle');
        await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
        await page.screenshot({ path: `${OUT}/car-page-${viewport.name}.png`, fullPage: true });
        const heading = await carHeading.innerText();
        seen.push({ viewport: viewport.name, step6, carPage: { url: page.url(), heading, horizontalOverflowPx: await overflow() } });
        await context.close();
    }
} finally {
    await browser.close();
}
fs.writeFileSync(`${OUT}/walk.json`, `${JSON.stringify({ base: BASE, seen }, null, 2)}\n`);
console.log(JSON.stringify(seen, null, 2));

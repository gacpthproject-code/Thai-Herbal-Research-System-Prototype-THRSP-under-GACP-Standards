'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('/home/ubuntu/work/GACP-Certification-Application/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');

const [BASE, FIXTURE, OUT, LABEL] = process.argv.slice(2);
const fx = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
fs.mkdirSync(OUT, { recursive: true });
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${LABEL}-${name}.png`), fullPage: true });
const log = (m) => console.log(`[walk ${LABEL}] ${new Date().toISOString()} ${m}`);

(async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const ctx = await browser.newContext({
            viewport: { width: 1280, height: 900 }, locale: 'th-TH', timezoneId: 'Asia/Bangkok', colorScheme: 'light',
        });
        const page = await ctx.newPage();
        page.on('console', (m) => { if (m.type() === 'error') log(`console.error ${m.text().slice(0, 200)}`); });
        await page.goto(`${BASE}/auth/provider/login`, { waitUntil: 'networkidle', timeout: 180000 });
        await page.fill('#provider-id', fx.providerId);
        await page.fill('#provider-password', fx.password);
        await Promise.all([
            page.waitForURL((u) => !/auth\/provider\/login/.test(u.toString()), { timeout: 180000 }),
            page.click('button[type="submit"]'),
        ]);
        log(`approver signed in -> ${page.url()}`);
        await page.goto(`${BASE}/provider/certification-decisions/${fx.applicationId}`, { waitUntil: 'networkidle', timeout: 180000 });
        await page.getByTestId('decision-actions').waitFor({ state: 'visible', timeout: 120000 });
        await shot(page, '01-decision-file');
        await page.getByRole('button', { name: 'อนุมัติให้การรับรอง', exact: true }).click();
        await page.locator('textarea').first().fill('ตรวจหลักฐานในแฟ้มครบแล้ว');
        const sent = page.waitForResponse((r) => /\/final-approvals$/.test(r.url()) && r.request().method() === 'POST', { timeout: 180000 });
        await page.getByRole('button', { name: 'ยืนยันอนุมัติและออกใบรับรอง' }).click();
        const res = await sent;
        const body = await res.json().catch(() => ({}));
        log(`approve -> ${res.status()} ${JSON.stringify({ code: body.code, messageTh: body.messageTh, certificateNumber: body.data?.certificateNumber })}`);
        await page.waitForTimeout(2500);
        log(`after approve url=${page.url()}`);
        log(`on screen alert: ${JSON.stringify(await page.locator('[role="alert"]').allInnerTexts())}`);
        await shot(page, '02-after-approve');
    } finally {
        await browser.close();
    }
})().catch((e) => { log(`FAILED ${e.stack || e.message}`); process.exit(1); });

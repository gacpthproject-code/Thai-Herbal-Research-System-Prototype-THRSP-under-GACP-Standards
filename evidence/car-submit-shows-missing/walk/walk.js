'use strict';
// The applicant walks the CAR page in the browser (phone viewport): signs in, uploads one
// evidence photo under defect 1, presses ส่งหลักฐาน, and we keep the screen and the door's answer.
// usage: node walk.js <webBase> <fixture.json> <outDir> <label> <photo>
const fs = require('fs');
const path = require('path');
const { chromium } = require('/home/ubuntu/work/GACP-Certification-Application/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');

const [BASE, FIXTURE, OUT, LABEL, PHOTO] = process.argv.slice(2);
const fx = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
fs.mkdirSync(OUT, { recursive: true });
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${LABEL}-${name}.png`), fullPage: true });
const log = (m) => console.log(`[walk ${LABEL}] ${new Date().toISOString()} ${m}`);

(async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const ctx = await browser.newContext({
            viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
            locale: 'th-TH', timezoneId: 'Asia/Bangkok', colorScheme: 'light',
        });
        const page = await ctx.newPage();
        page.on('console', (m) => { if (m.type() === 'error') log(`console.error ${m.text().slice(0, 200)}`); });
        await page.goto(`${BASE}/auth/health/login`, { waitUntil: 'networkidle', timeout: 180000 });
        await page.fill('#identifier', fx.idCard);
        await page.fill('#password', fx.password);
        await Promise.all([
            page.waitForURL((u) => !/auth\/health\/login/.test(u.toString()), { timeout: 180000 }),
            page.click('button[type="submit"]'),
        ]);
        log(`applicant signed in -> ${page.url()}`);
        await page.goto(`${BASE}/health/applications/${fx.applicationId}/car`, { waitUntil: 'networkidle', timeout: 180000 });
        await page.getByTestId('car-defect-1').waitFor({ state: 'visible', timeout: 120000 });
        const uploaded = page.waitForResponse((r) => /\/car\/files$/.test(r.url()) && r.request().method() === 'POST', { timeout: 120000 });
        await page.getByTestId('car-file-input-1').setInputFiles(PHOTO);
        log(`upload -> ${(await uploaded).status()}`);
        await page.locator('[data-testid="car-file-row"][data-state="uploaded"]').waitFor({ timeout: 60000 });
        await shot(page, '01-car-file-uploaded');
        const sent = page.waitForResponse((r) => /\/car$/.test(r.url()) && r.request().method() === 'POST', { timeout: 120000 });
        await page.getByTestId('car-send').click();
        const res = await sent;
        const body = await res.json().catch(() => ({}));
        log(`send -> ${res.status()} ${JSON.stringify({ code: body.code, errorsByStep: body.errorsByStep, missingFields: body.missingFields })}`);
        await page.waitForTimeout(2500);
        log(`after send url=${page.url()}`);
        const alert = await page.locator('[data-testid="car-upload-error"], [data-testid="car-refused-fields"]').allInnerTexts();
        log(`on screen: ${JSON.stringify(alert)}`);
        await shot(page, '02-after-send');
    } finally {
        await browser.close();
    }
})().catch((e) => { log(`FAILED ${e.stack || e.message}`); process.exit(1); });

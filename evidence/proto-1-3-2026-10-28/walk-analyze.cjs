'use strict';
// usage: WALK_PASSWORD=... node walk-analyze.cjs <baseUrl> <providerId> <outDir> <name=route>...
// Opens each standards page, picks the application whose label holds WALK_PICK (else the first), runs the analysis.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const [baseUrl, providerId, outDir, ...pages] = process.argv.slice(2);
const VIEWPORTS = [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]];

(async () => {
    fs.mkdirSync(outDir, { recursive: true });
    const browser = await chromium.launch();
    const log = [];
    for (const [label, viewport] of VIEWPORTS) {
        const context = await browser.newContext({ viewport, locale: 'th-TH' });
        const login = await context.request.post(`${baseUrl}/api/auth/provider/login`, {
            data: { providerId, password: process.env.WALK_PASSWORD },
        });
        if (!login.ok()) { throw new Error(`login ${login.status()}`); }
        const page = await context.newPage();
        for (const spec of pages) {
            const [name, route] = spec.split('=');
            await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle', timeout: 90000 });
            await page.getByText('เลือกคำขอที่จะวิเคราะห์').first().click();
            const options = page.getByRole('option');
            const option = process.env.WALK_PICK ? options.filter({ hasText: process.env.WALK_PICK }).first() : options.first();
            const picked = await option.innerText();
            await option.click();
            const analysis = page.waitForResponse((r) => r.url().includes('/analyze/'));
            await page.getByRole('button', { name: 'วิเคราะห์ความสอดคล้อง' }).click();
            const response = await analysis;
            await page.waitForTimeout(1200);
            const file = path.join(outDir, `${name}-${label}.png`);
            await page.screenshot({ path: file, fullPage: true });
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
            log.push({ name, label, route, picked, analyzeStatus: response.status(), horizontalOverflowPx: overflow, file });
        }
        await context.close();
    }
    await browser.close();
    fs.writeFileSync(path.join(outDir, 'walk-analyze-log.json'), JSON.stringify(log, null, 2));
    console.log(JSON.stringify(log, null, 1));
})().catch((error) => { console.error(error); process.exit(1); });

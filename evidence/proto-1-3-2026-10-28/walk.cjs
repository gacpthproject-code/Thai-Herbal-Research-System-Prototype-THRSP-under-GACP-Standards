'use strict';
// usage: WALK_PASSWORD=... node walk.cjs <baseUrl> <providerId> <outDir> <name=route>...
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
            const response = await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle', timeout: 90000 });
            await page.waitForTimeout(1500);
            const file = path.join(outDir, `${name}-${label}.png`);
            await page.screenshot({ path: file, fullPage: true });
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
            log.push({ name, label, route, status: response && response.status(), finalUrl: page.url(), horizontalOverflowPx: overflow, file });
        }
        await context.close();
    }
    await browser.close();
    fs.writeFileSync(path.join(outDir, 'walk-log.json'), JSON.stringify(log, null, 2));
    console.log(JSON.stringify(log, null, 1));
})().catch((error) => { console.error(error); process.exit(1); });

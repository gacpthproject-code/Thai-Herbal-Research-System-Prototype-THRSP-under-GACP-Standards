'use strict';
// usage: WALK_PASSWORD=... node walk-csv.cjs <webUrl> <backendUrl> <providerId> <outDir>
// Clicks "ดาวน์โหลด CSV" on the compare page through the web origin and records the file name
// the browser received, checks the two comparison doors answer 401 without a session,
// and shoots the compare page in dark mode.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const [webUrl, backendUrl, providerId, outDir] = process.argv.slice(2);

(async () => {
    const browser = await chromium.launch();
    const log = {};

    const anonymous = await browser.newContext();
    for (const [label, url] of [
        ['web-proxy-comparison', `${webUrl}/api/standards/comparison`],
        ['web-proxy-csv', `${webUrl}/api/standards/comparison/export.csv`],
        ['backend-comparison', `${backendUrl}/api/standards/comparison`],
        ['backend-csv', `${backendUrl}/api/standards/comparison/export.csv`],
    ]) {
        const res = await anonymous.request.get(url);
        log[`anonymous:${label}`] = res.status();
    }
    await anonymous.close();

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'th-TH', acceptDownloads: true });
    const login = await context.request.post(`${webUrl}/api/auth/provider/login`, {
        data: { providerId, password: process.env.WALK_PASSWORD },
    });
    if (!login.ok()) { throw new Error(`login ${login.status()}`); }
    const page = await context.newPage();
    await page.goto(`${webUrl}/provider/standards/compare`, { waitUntil: 'networkidle', timeout: 90000 });
    const waiting = page.waitForEvent('download', { timeout: 30000 });
    await page.getByRole('link', { name: 'ดาวน์โหลด CSV' }).click();
    const download = await waiting;
    const saved = path.join(outDir, 'downloaded.csv');
    await download.saveAs(saved);
    const csv = fs.readFileSync(saved, 'utf8');
    log.csv = {
        suggestedFilename: download.suggestedFilename(),
        bytes: fs.statSync(saved).size,
        startsWithBom: csv.charCodeAt(0) === 0xFEFF,
        header: csv.split('\r\n')[0].slice(1),
        rows: csv.trimEnd().split('\r\n').length - 1,
    };
    log.summaryOnScreen = await page.locator('text=เทียบกับมาตรฐานไทย').first().locator('..').innerText();
    await context.close();

    const dark = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'th-TH' });
    await dark.addInitScript(() => {
        localStorage.setItem('theme', 'dark');
        localStorage.setItem('theme:explicit', '1');
    });
    const darkLogin = await dark.request.post(`${webUrl}/api/auth/provider/login`, {
        data: { providerId, password: process.env.WALK_PASSWORD },
    });
    if (!darkLogin.ok()) { throw new Error(`dark login ${darkLogin.status()}`); }
    const darkPage = await dark.newPage();
    await darkPage.goto(`${webUrl}/provider/standards/compare`, { waitUntil: 'networkidle', timeout: 90000 });
    await darkPage.waitForTimeout(1500);
    log.darkHtmlClass = await darkPage.evaluate(() => document.documentElement.className);
    await darkPage.screenshot({ path: path.join(outDir, 'p1-compare-desktop-dark.png'), fullPage: true });
    await dark.close();

    await browser.close();
    fs.writeFileSync(path.join(outDir, 'walk-csv-log.json'), JSON.stringify(log, null, 2));
    console.log(JSON.stringify(log, null, 1));
})().catch((error) => { console.error(error); process.exit(1); });

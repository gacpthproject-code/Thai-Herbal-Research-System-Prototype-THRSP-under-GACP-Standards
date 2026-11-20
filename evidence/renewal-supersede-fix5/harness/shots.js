'use strict';
const { chromium } = require('/home/ubuntu/work/wt-supersede/apps/web-app/node_modules/@playwright/test');
const fs = require('fs');
const [base, outDir, seedFile, tokensFile] = process.argv.slice(2);
const seed = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
const tokens = JSON.parse(fs.readFileSync(tokensFile, 'utf8'));
(async () => {
    const browser = await chromium.launch();
    const report = [];
    for (const [w, h] of [[390, 844], [1440, 900]]) {
        for (const [name, who, url, tab] of [
            ['provider-tracking-backdated', 'reviewer', `/provider/tracking/${seed.cycleId}`, null],
            ['admin-planting-backdated', 'admin', `/admin/planting/${seed.cycleId}`, 'summary'],
        ]) {
            const ctx = await browser.newContext({ viewport: { width: w, height: h } });
            await ctx.addCookies([{ name: 'provider_token', value: tokens[who], url: base, httpOnly: true }]);
            const page = await ctx.newPage();
            await page.goto(base + url, { waitUntil: 'networkidle', timeout: 240000 });
            if (tab) { await page.getByRole('tab', { name: /สรุป/ }).click().catch(() => {}); }
            await page.waitForTimeout(2000);
            const section = page.locator('[data-testid="backdated-harvest-batches"]');
            if (await section.count()) { await section.first().scrollIntoViewIfNeeded(); }
            const file = `${outDir}/${name}-${w}x${h}.png`;
            await page.screenshot({ path: file, fullPage: true });
            const sectionText = (await section.count()) ? (await section.first().innerText()).replace(/\s+/g, ' ') : null;
            const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
            report.push({ name, viewport: `${w}x${h}`, url: page.url().replace(base, ''), file, scrollW, sectionText });
            await ctx.close();
        }
    }
    await browser.close();
    fs.writeFileSync(`${outDir}/shots-report.json`, JSON.stringify(report, null, 2));
    console.log('shots done', report.length);
})().catch((e) => { console.error('shots failed', e.message); process.exit(1); });

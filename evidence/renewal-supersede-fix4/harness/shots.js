'use strict';
const { chromium } = require('/home/ubuntu/work/wt-supersede/apps/web-app/node_modules/@playwright/test');
const fs = require('fs');
const [base, outDir, seedFile] = process.argv.slice(2);
const seed = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
const slug = (n) => n.replace(/^TH-GACP (\d+)\/(\d{4})$/, 'TH-GACP-$1-$2');
(async () => {
    const browser = await chromium.launch();
    const report = [];
    for (const [w, h] of [[390, 844], [1440, 900]]) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, extraHTTPHeaders: { 'x-forwarded-proto': 'http' } });
        const page = await ctx.newPage();
        for (const [name, url] of [
            ['lot-medium1', `/trace/lot/${seed.medium1.lotId}`],
            ['generic-medium1', `/trace/${seed.medium1.lotQr}`],
            ['verify-old-medium1', `/verify/${slug(seed.medium1.old)}`],
        ]) {
            await page.goto(base + url, { waitUntil: 'networkidle', timeout: 180000 });
            await page.waitForTimeout(1500);
            const file = `${outDir}/${name}-${w}x${h}.png`;
            await page.screenshot({ path: file, fullPage: true });
            const text = (await page.innerText('body')).replace(/\s+/g, ' ');
            const links = await page.$$eval('a', (as) => as.map((a) => `${a.textContent.trim()} -> ${a.getAttribute('href')}`).filter((s) => /TH-GACP/.test(s)));
            const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
            report.push({ name, viewport: `${w}x${h}`, file, scrollW, links, text: text.slice(0, 900) });
        }
        await ctx.close();
    }
    await browser.close();
    fs.writeFileSync(`${outDir}/shots-report.json`, JSON.stringify(report, null, 2));
    console.log('shots done', report.length);
})().catch((e) => { console.error('shots failed', e.message); process.exit(1); });

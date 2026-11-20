import { chromium } from './lib.mjs';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/home/ubuntu/work/GACP-Certification-Application/apps/web-app/');
const AXE = fs.readFileSync(require.resolve('axe-core'), 'utf8');

const B = 'https://demo.gacpth.com';
const OUT = process.argv[2];
const VP = { name: process.argv[3] || 'w1440', width: +(process.argv[4] || 1440), height: +(process.argv[5] || 900) };
const THEME = process.argv[6] || 'light';
const ROUTES = JSON.parse(fs.readFileSync(process.argv[7], 'utf8'));

const browser = await chromium.launch({ args: ['--force-color-profile=srgb'] });
const ctx = await browser.newContext({
    viewport: { width: VP.width, height: VP.height },
    deviceScaleFactor: 1,
    locale: 'th-TH',
    colorScheme: THEME === 'dark' ? 'dark' : 'light',
});
if (THEME === 'dark') {
    await ctx.addInitScript(() => { try { localStorage.setItem('theme', 'dark'); localStorage.setItem('theme:explicit', '1'); } catch {} });
}
const results = [];

for (const route of ROUTES) {
    const page = await ctx.newPage();
    const errs = [], warns = [], failedReq = [];
    page.on('console', m => {
        const t = m.text().slice(0, 200);
        if (m.type() === 'error') errs.push(t);
        else if (m.type() === 'warning') warns.push(t);
    });
    page.on('pageerror', e => errs.push('PAGEERROR ' + String(e.message).slice(0, 200)));
    page.on('requestfailed', r => failedReq.push(r.url().slice(0, 120) + ' :: ' + (r.failure()?.errorText || '')));
    page.on('response', r => { if (r.status() >= 400) failedReq.push('HTTP' + r.status() + ' ' + r.url().slice(0, 120)); });

    const rec = { route, viewport: VP.name, theme: THEME };
    const t0 = Date.now();
    try {
        // CLS observer must exist before paint
        await page.addInitScript(() => {
            window.__cls = 0;
            new PerformanceObserver(list => {
                for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
            }).observe({ type: 'layout-shift', buffered: true });
        });
        const resp = await page.goto(B + route, { waitUntil: 'networkidle', timeout: 45000 });
        rec.status = resp?.status() ?? null;
        rec.loadMs = Date.now() - t0;
        await page.waitForTimeout(1200);

        rec.metrics = await page.evaluate(() => {
            const de = document.documentElement, b = document.body;
            const cs = getComputedStyle(b);
            const h1 = document.querySelector('h1');
            return {
                title: document.title,
                h1: h1 ? h1.textContent.trim().slice(0, 80) : null,
                lang: de.getAttribute('lang'),
                htmlClass: de.className.slice(0, 120),
                bodyFont: cs.fontFamily,
                bodySize: cs.fontSize,
                bodyLineHeight: cs.lineHeight,
                bodyBg: cs.backgroundColor,
                bodyColor: cs.color,
                scrollW: de.scrollWidth,
                clientW: de.clientWidth,
                horizOverflow: de.scrollWidth > de.clientWidth + 1,
                cls: Math.round((window.__cls || 0) * 10000) / 10000,
                headings: [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(e => e.tagName).join(','),
                imgNoAlt: [...document.images].filter(i => !i.hasAttribute('alt')).length,
                imgCount: document.images.length,
                buttons: document.querySelectorAll('button,[role=button]').length,
                inputs: document.querySelectorAll('input,select,textarea').length,
                // element wider than viewport = the overflow culprit
                widest: (() => {
                    let w = null, max = de.clientWidth + 1;
                    for (const el of document.querySelectorAll('*')) {
                        const r = el.getBoundingClientRect();
                        if (r.width > max) { max = r.width; w = el.tagName + '.' + String(el.className).slice(0, 60) + ' w=' + Math.round(r.width); }
                    }
                    return w;
                })(),
            };
        });

        await page.addScriptTag({ content: AXE });
        rec.axe = await page.evaluate(async () => {
            const r = await window.axe.run(document, {
                runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
                resultTypes: ['violations'],
            });
            return r.violations.map(v => ({
                id: v.id, impact: v.impact, n: v.nodes.length,
                help: v.help,
                sample: v.nodes.slice(0, 2).map(n => ({
                    target: String(n.target[0]).slice(0, 100),
                    summary: String(n.failureSummary || '').replace(/\s+/g, ' ').slice(0, 220),
                })),
            }));
        });

        const safe = route === '/' ? 'root' : route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '');
        const shot = `${OUT}/${safe}__${VP.name}__${THEME}.png`;
        await page.screenshot({ path: shot, fullPage: true });
        rec.shot = shot.split('/').pop();
    } catch (e) {
        rec.error = String(e.message).split('\n')[0].slice(0, 180);
    }
    rec.consoleErrors = errs.slice(0, 6);
    rec.consoleWarnings = warns.slice(0, 4);
    rec.failedRequests = [...new Set(failedReq)].slice(0, 6);
    results.push(rec);
    console.log(`${rec.status ?? 'ERR'} ${route}  ${rec.loadMs ?? '-'}ms  cls=${rec.metrics?.cls ?? '-'} axe=${rec.axe?.length ?? '-'} err=${errs.length}`);
    await page.close();
}
fs.writeFileSync(`${OUT}/report__${VP.name}__${THEME}.json`, JSON.stringify(results, null, 2));
await browser.close();
console.log('WROTE', `${OUT}/report__${VP.name}__${THEME}.json`);

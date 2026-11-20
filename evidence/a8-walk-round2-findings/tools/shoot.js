'use strict';
const fs = require('fs');
const { chromium } = require('/home/ubuntu/work/GACP-Certification-Application/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');

const STAGING = 'https://staging.gacpth.com';
const LOCAL = 'http://localhost:3417';
const APP = 'cd15ff15-22dd-43d5-a96e-94c25a4eb428';
const OUT = `${__dirname}/../shots`;
const readEnv = (f) => Object.fromEntries(fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const cred = readEnv('/home/ubuntu/work/state/walk/a8-round1c/applicant3.secret.env');
const filing = JSON.parse(fs.readFileSync(`${__dirname}/../filing.secret.json`, 'utf8'));
const afterHtml = fs.readFileSync(`${__dirname}/../after.secret.html`, 'utf8');

const secrets = [cred.WALK_NID, cred.WALK_TAX, cred.WALK_PHONE, cred.WALK_PW, cred.EMAIL].filter((s) => s && s.length >= 4);
const names = new Set([cred.FIRST_NAME, cred.LAST_NAME, `${cred.FIRST_NAME} ${cred.LAST_NAME}`].filter((s) => s && s.length >= 2));
const entity = filing.app.entity || {};
if (entity.displayName) names.add(entity.displayName);
const sig = ((entity.payload || {}).holder || {}).signatory || {};
for (const k of ['firstName', 'lastName']) if (sig[k]) names.add(sig[k]);
if (sig.firstName && sig.lastName) names.add(`${sig.firstName} ${sig.lastName}`);
const site = ((filing.app.formData || {}).farmData || {});
for (const k of ['siteContactName']) if (site[k]) names.add(site[k]);

async function mask(page) {
    await page.evaluate(({ names, secrets }) => {
        const list = [...names].sort((a, b) => b.length - a.length);
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            let t = n.nodeValue;
            for (const s of secrets) t = t.split(s).join('[ปิดไว้]');
            for (const s of list) t = t.split(s).join('[ปิดชื่อ]');
            t = t.replace(/\b\d{13}\b/g, '[ปิดไว้]').replace(/\b0\d{8,9}\b/g, '[ปิดไว้]').replace(/\b\d-\d{4}-\d{5}-\d{2}-\d\b/g, '[ปิดไว้]');
            if (t !== n.nodeValue) n.nodeValue = t;
        }
    }, { names: [...names], secrets });
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch();
    const s = await browser.newContext();
    const sp = await s.newPage();
    await sp.goto(`${STAGING}/auth/health/login`, { waitUntil: 'networkidle', timeout: 120000 });
    await sp.fill('#identifier', cred.WALK_NID);
    await sp.fill('#password', cred.WALK_PW);
    await Promise.all([sp.waitForURL((u) => !/auth\/health\/login/.test(u.toString()), { timeout: 90000 }), sp.locator('button[type=submit]').first().click()]);
    const storage = await sp.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
    const cookieHeader = (await s.cookies(STAGING)).map((c) => `${c.name}=${c.value}`).join('; ');
    const stagingCookies = await s.cookies(STAGING);
    await s.close();

    const l = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'th-TH', timezoneId: 'Asia/Bangkok' });
    await l.addCookies(stagingCookies.map((c) => ({ name: c.name, value: c.value, url: LOCAL, httpOnly: c.httpOnly, sameSite: 'Lax' })));
    await l.addInitScript((st) => { for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v); localStorage.setItem('theme', 'light'); }, storage);
    const served = [];
    await l.route(`${LOCAL}/api/**`, async (route) => {
        const req = route.request();
        const url = req.url().replace(LOCAL, STAGING);
        if (url.endsWith(`/applications/${APP}/katorlor1`)) {
            served.push(`branch-renderer ${req.method()} ${url.replace(STAGING, '')}`);
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { html: afterHtml } }) });
        }
        const headers = { ...req.headers(), cookie: cookieHeader, origin: STAGING, referer: STAGING + '/' };
        delete headers.host;
        if (req.method() !== 'GET') { served.push(`blocked ${req.method()} ${url.replace(STAGING, '')}`); return route.fulfill({ status: 204, body: '' }); }
        const resp = await route.fetch({ url, headers });
        served.push(`staging ${resp.status()} ${req.method()} ${url.replace(STAGING, '').split('?')[0]}`);
        return route.fulfill({ response: resp });
    });
    const page = await l.newPage();
    const settle = async () => { await page.waitForLoadState('networkidle', { timeout: 120000 }).catch(() => {}); await page.waitForTimeout(1500); await mask(page); };

    await page.goto(`${LOCAL}/health/applications/${APP}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
    try { await page.getByText('ข้อมูลคำขอ', { exact: false }).first().waitFor({ timeout: 180000 }); } catch (e) {
        await mask(page); await page.screenshot({ path: `${OUT}/debug.png` }); fs.writeFileSync(`${OUT}/requests.txt`, served.join('\n') + '\n');
        fs.writeFileSync(`${OUT}/debug.txt`, page.url() + '\n' + (await page.innerText('body')).slice(0, 3000)); throw e;
    }
    await settle();
    const box = page.locator('h2', { hasText: 'ข้อมูลคำขอ' }).first().locator('xpath=ancestor::div[contains(@class,"p-5")][1]');
    await box.screenshot({ path: `${OUT}/after-05-detail-application-box.png` });
    fs.writeFileSync(`${OUT}/after-05-detail-application-box.txt`, await box.innerText());

    await page.goto(`${LOCAL}/health/applications/${APP}/preview`, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.locator('.k1').first().waitFor({ timeout: 300000 });
    await settle();
    await page.locator('section').first().screenshot({ path: `${OUT}/after-03-preview-header.png` });
    fs.writeFileSync(`${OUT}/after-03-preview-header.txt`, await page.locator('section').first().innerText());
    const k1 = page.locator('.k1').first();
    await k1.locator('.meta').first().screenshot({ path: `${OUT}/after-01-k1-filing-date.png` });
    const purposeRow = k1.locator('.row', { has: page.locator('.lbl', { hasText: /^วัตถุประสงค์$/ }) }).first();
    await purposeRow.screenshot({ path: `${OUT}/after-02-k1-purpose-row.png` });
    await page.screenshot({ path: `${OUT}/after-03-preview-full.png`, fullPage: true });
    fs.writeFileSync(`${OUT}/requests.txt`, served.join('\n') + '\n');
    await browser.close();
})().catch((e) => { console.error(e && e.message); process.exit(1); });

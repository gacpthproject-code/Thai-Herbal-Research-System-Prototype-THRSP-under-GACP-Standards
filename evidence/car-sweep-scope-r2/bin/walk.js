'use strict';
// Order 138(1): the CAR upload page tells the applicant when each unsent file will be deleted.
// usage: node walk.js <desktop|mobile>  with CSR_PRIVATE, CSR_EVIDENCE, CSR_PDF, BPORT, NPORT set.
const fs = require('fs');
const path = require('path');
const { chromium } = require('/home/ubuntu/work/GACP-Certification-Application/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');

const label = process.argv[2];
const EV = process.env.CSR_EVIDENCE;
const PRIVATE = process.env.CSR_PRIVATE;
const API = `http://127.0.0.1:${process.env.BPORT}`;
const SITE = `http://127.0.0.1:${process.env.NPORT}`;
const creds = JSON.parse(fs.readFileSync(path.join(PRIVATE, 'creds.json'), 'utf8'));
const fixtures = JSON.parse(fs.readFileSync(path.join(PRIVATE, 'fixtures.json'), 'utf8'));
const app = fixtures.apps[label];
const SHOTS = path.join(EV, 'shots');
const LOGS = path.join(EV, 'logs');
fs.mkdirSync(SHOTS, { recursive: true });
const VIEW = label === 'desktop'
    ? { viewport: { width: 1440, height: 900 } }
    : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const SECRETS = [creds.applicant.login, creds.applicant.password];
const scrub = (text) => {
    let out = String(text);
    for (const secret of SECRETS) { out = out.split(secret).join('<masked>'); }
    return out.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<jwt>').replace(/\b\d{13}\b/g, '<13d>');
};
const summary = [];
const say = (line) => { summary.push(scrub(line)); console.log(`[${label}] ${scrub(line)}`); };
const check = (ok, line) => { say(`${ok ? 'PASS' : 'FAIL'} ${line}`); if (!ok) { process.exitCode = 1; } };

let bearer = null;
async function api(method, p) {
    if (!bearer) {
        const r = await fetch(`${API}/api/auth/health/login`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ identifier: creds.applicant.login, password: creds.applicant.password }),
        });
        const j = await r.json().catch(() => ({}));
        bearer = j.data?.token || j.data?.tokens?.accessToken || j.token || j.data?.accessToken;
        if (!bearer) { throw new Error(`api login ${r.status} ${j.code || ''}`); }
    }
    const r = await fetch(API + p, { method, headers: { authorization: `Bearer ${bearer}` } });
    return { status: r.status, body: await r.json().catch(() => ({})) };
}

const bangkok = (iso) => {
    const at = new Date(iso);
    const date = at.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' });
    const time = at.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
    return `ยังไม่ได้ส่ง หากไม่กดส่งหลักฐาน ระบบจะลบไฟล์นี้หลัง ${date} เวลา ${time} น.`;
};

async function shot(page, name) {
    const text = await page.evaluate(() => document.body.innerText);
    if (SECRETS.some((secret) => text.includes(secret))) { throw new Error(`secret on screen at ${name}`); }
    await page.screenshot({ path: path.join(SHOTS, `${label}-${name}.png`), fullPage: true });
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    let page = null;
    try {
        const ctx = await browser.newContext({ ...VIEW, colorScheme: 'light', locale: 'th-TH', timezoneId: 'Asia/Bangkok' });
        await ctx.addInitScript(() => { try { localStorage.setItem('theme', 'light'); localStorage.setItem('theme:explicit', '1'); } catch (_) { /* storage blocked */ } });
        page = await ctx.newPage();
        page.setDefaultTimeout(180000);
        await page.goto(`${SITE}/auth/health/login`, { waitUntil: 'networkidle', timeout: 240000 });
        await page.waitForTimeout(2000);
        await page.fill('#identifier', creds.applicant.login);
        await page.fill('#password', creds.applicant.password);
        await Promise.all([page.waitForURL((u) => !/auth\/health\/login/.test(u.toString()), { timeout: 180000 }), page.locator('button[type=submit]').first().click()]);

        await page.goto(`${SITE}/health/applications/${app.id}/car`, { waitUntil: 'domcontentloaded', timeout: 240000 });
        await page.waitForSelector('[data-testid="car-defect-2"]', { timeout: 240000 });
        await page.locator('[data-testid="car-file-input-2"]').setInputFiles(process.env.CSR_PDF);
        await page.waitForFunction(() => {
            const rows = [...document.querySelectorAll('[data-testid="car-file-row"]')];
            return rows.length === 2 && rows.every((r) => r.getAttribute('data-state') === 'uploaded');
        }, null, { timeout: 180000 });
        await page.waitForTimeout(500);
        await shot(page, '01-unsent-files-with-deletion-time');

        const staged = (await api('GET', `/api/applications/${app.id}`)).body.data?.carRound?.stagedFiles || [];
        const shown = await page.$$eval('[data-testid="car-file-deletes-at"]', (els) => els.map((el) => el.textContent.trim()));
        say(`server deletesAt: ${staged.map((f) => `${f.originalName} ${f.deletesAt}`).join(' | ')}`);
        say(`page shows: ${shown.join(' | ')}`);
        const earlier = staged.find((f) => f.originalName === 'ภาพป้ายแปลง.pdf');
        const fresh = staged.find((f) => f.originalName !== 'ภาพป้ายแปลง.pdf');
        check(earlier?.deletesAt === new Date(Date.parse(app.earlierUploadedAt) + 7 * 86400000).toISOString(), 'file uploaded 3 days ago: deleted 7 days after upload');
        check(fresh?.deletesAt === fixtures.dueAt, 'file uploaded now: deleted at the round deadline (earlier than 7 days)');
        check(shown.length === 2 && shown[0] === bangkok(earlier.deletesAt) && shown[1] === bangkok(fresh.deletesAt), 'each row shows its own Bangkok Buddhist-era date and time');
    } catch (error) {
        say(`WALK FAILED ${error.message.slice(0, 400)}`);
        if (page) { await page.screenshot({ path: path.join(SHOTS, `${label}-failure.png`), fullPage: true }).catch(() => {}); }
        process.exitCode = 1;
    } finally {
        fs.mkdirSync(LOGS, { recursive: true });
        fs.writeFileSync(path.join(LOGS, `${label}-summary.txt`), `${summary.join('\n')}\n`);
        await browser.close();
    }
})();

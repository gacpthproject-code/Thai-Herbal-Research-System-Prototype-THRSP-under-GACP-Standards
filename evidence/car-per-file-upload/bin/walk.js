'use strict';
// CAR evidence, one file per request, through the repo's nginx config (order 127(1)).
// usage: node walk.js <desktop|mobile>  with CPF_PRIVATE, CPF_EVIDENCE, CPF_FILES, CPF_CAR_DIR, BPORT, NPORT set.
const fs = require('fs');
const path = require('path');
const { chromium } = require('/home/ubuntu/work/GACP-Certification-Application/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');

const label = process.argv[2];
const EV = process.env.CPF_EVIDENCE;
const PRIVATE = process.env.CPF_PRIVATE;
const FILES = process.env.CPF_FILES;
const CAR_DIR = process.env.CPF_CAR_DIR;
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
const DROP_AT = 11;
const SECRETS = [creds.applicant.login, creds.applicant.password, creds.inspector.login, creds.inspector.password];
const scrub = (text) => {
    let out = String(text);
    for (const secret of SECRETS) { out = out.split(secret).join('<masked>'); }
    return out.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<jwt>').replace(/\b\d{13}\b/g, '<13d>');
};
const summary = [];
const say = (line) => { summary.push(scrub(line)); console.log(`[${label}] ${scrub(line)}`); };
const check = (ok, line) => { say(`${ok ? 'PASS' : 'FAIL'} ${line}`); if (!ok) { process.exitCode = 1; } };

const tokens = {};
async function token(role) {
    if (tokens[role]) { return tokens[role]; }
    const c = creds[role];
    const staff = role === 'inspector';
    const r = await fetch(`${API}/api/auth/${staff ? 'provider' : 'health'}/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(staff ? { providerId: c.login, password: c.password } : { identifier: c.login, password: c.password }),
    });
    const j = await r.json().catch(() => ({}));
    tokens[role] = j.data?.token || j.data?.tokens?.accessToken || j.token || j.data?.accessToken;
    if (!tokens[role]) { throw new Error(`api login ${role} ${r.status} ${j.code || ''}`); }
    return tokens[role];
}
async function api(role, method, p, body) {
    const r = await fetch(API + p, {
        method,
        headers: { authorization: `Bearer ${await token(role)}`, ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
}
const stagedNow = async () => (await api('applicant', 'GET', `/api/applications/${app.id}`)).body.data?.carRound?.stagedFiles || [];
const staffFormData = async () => (await api('inspector', 'GET', `/api/provider/applications/${app.id}`)).body.data?.formData || {};

async function shot(page, name) {
    await page.evaluate(() => {
        const re = /\b\d{13}\b/g;
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let t; (t = w.nextNode());) { if (re.test(t.nodeValue)) { t.nodeValue = t.nodeValue.replace(re, '<masked>'); } }
    });
    const text = await page.evaluate(() => document.body.innerText);
    if (SECRETS.some((secret) => text.includes(secret))) { throw new Error(`secret on screen at ${name}`); }
    await page.screenshot({ path: path.join(SHOTS, `${label}-${name}.png`), fullPage: true });
}

async function newPage(browser) {
    const ctx = await browser.newContext({ ...VIEW, colorScheme: 'light', locale: 'th-TH', timezoneId: 'Asia/Bangkok' });
    await ctx.addInitScript(() => { try { localStorage.setItem('theme', 'light'); localStorage.setItem('theme:explicit', '1'); } catch (_) { /* storage blocked */ } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(180000);
    return page;
}

const rowStates = (page) => page.$$eval('[data-testid="car-file-row"]', (rows) => rows.map((r) => ({
    state: r.getAttribute('data-state'), text: (r.querySelector('[role=alert]')?.textContent || '').trim(),
})));

async function settled(page) {
    for (let i = 0; i < 600; i += 1) {
        const rows = await rowStates(page);
        if (rows.length > 0 && rows.every((r) => r.state === 'uploaded' || r.state === 'failed')) { return rows; }
        await page.waitForTimeout(500);
    }
    return rowStates(page);
}

let lastPage = null;
async function applicantRound(browser) {
    const page = await newPage(browser);
    lastPage = page;
    const attempts = [];
    let posts = 0;
    await page.route('**/api/applications/*/car/files', async (route) => {
        if (route.request().method() !== 'POST') { return route.continue(); }
        posts += 1;
        const n = posts;
        if (n === DROP_AT) {
            attempts.push({ n, outcome: 'dropped' });
            return route.abort('internetdisconnected');
        }
        attempts.push({ n, outcome: 'sent' });
        return route.continue();
    });
    page.on('response', (res) => {
        if (/\/car\/files$/.test(res.url()) && res.request().method() === 'POST') {
            fs.appendFileSync(path.join(LOGS, `${label}-uploads.jsonl`), `${JSON.stringify({ at: new Date().toISOString(), status: res.status() })}\n`);
        }
    });
    await page.goto(`${SITE}/auth/health/login`, { waitUntil: 'networkidle', timeout: 240000 });
    await page.waitForTimeout(2000);
    await page.fill('#identifier', creds.applicant.login);
    await page.fill('#password', creds.applicant.password);
    await Promise.all([page.waitForURL((u) => !/auth\/health\/login/.test(u.toString()), { timeout: 180000 }), page.locator('button[type=submit]').first().click()]);

    await page.goto(`${SITE}/health/applications/${app.id}/car`, { waitUntil: 'domcontentloaded', timeout: 240000 });
    await page.waitForSelector('[data-testid="car-defect-3"]', { timeout: 240000 });
    await shot(page, '01-applicant-empty');
    check(await page.locator('[data-testid="car-send"]').isDisabled(), 'send is disabled before any file');

    const files = fs.readdirSync(FILES).filter((f) => /^ev-\d\d\./.test(f)).sort().map((f) => path.join(FILES, f));
    const sizes = files.map((f) => fs.statSync(f).size);
    say(`20 files picked: ${files.length} files, ${Math.min(...sizes)}..${Math.max(...sizes)} bytes each, ${(sizes.reduce((a, b) => a + b, 0) / 1048576).toFixed(1)} MB in all`);
    const started = Date.now();
    await page.locator('[data-testid="car-file-input-1"]').setInputFiles(files.slice(0, 7));
    await page.locator('[data-testid="car-file-input-2"]').setInputFiles(files.slice(7, 14));
    await page.locator('[data-testid="car-file-input-3"]').setInputFiles(files.slice(14, 20));
    const afterDrop = await settled(page);
    say(`first pass took ${Math.round((Date.now() - started) / 1000)} s; POST attempts ${posts} (${attempts.filter((a) => a.outcome === 'dropped').length} dropped at #${DROP_AT})`);
    const failed = afterDrop.filter((r) => r.state === 'failed');
    check(afterDrop.length === 20 && failed.length === 1 && afterDrop.filter((r) => r.state === 'uploaded').length === 19,
        `after the drop: ${afterDrop.filter((r) => r.state === 'uploaded').length} uploaded, ${failed.length} failed of ${afterDrop.length}`);
    check(failed.length === 1 && /การเชื่อมต่อขาด/.test(failed[0].text) && /เฉพาะไฟล์นี้/.test(failed[0].text), `the failed file says, in Thai, what to do: "${failed[0]?.text || ''}"`);
    check(await page.locator('[data-testid="car-send"]').isDisabled(), `send stays disabled: "${await page.locator('[data-testid="car-send-blocker"]').textContent()}"`);
    const stagedMid = await stagedNow();
    check(stagedMid.length === 19, `server holds ${stagedMid.length} staged files after the drop`);
    await page.locator('[data-testid="car-file-row"][data-state="failed"]').first().scrollIntoViewIfNeeded();
    await shot(page, '02-applicant-after-drop');

    const before = posts;
    await page.locator('[data-testid="car-file-row"][data-state="failed"]').getByRole('button', { name: 'ลองใหม่' }).click();
    const afterRetry = await settled(page);
    check(posts - before === 1, `retry sent ${posts - before} request (only the failed file)`);
    check(afterRetry.length === 20 && afterRetry.every((r) => r.state === 'uploaded'), `after retry: ${afterRetry.filter((r) => r.state === 'uploaded').length}/20 uploaded`);
    check(!(await page.locator('[data-testid="car-send"]').isDisabled()), 'send is enabled once every file is uploaded');
    await shot(page, '03-applicant-all-uploaded');

    await page.locator('textarea').first().fill('ทดสอบ-CPF: แก้ไขครบทั้งสามข้อ แนบภาพและสำเนาบันทึก');
    await Promise.all([
        page.waitForURL((u) => new RegExp(`/health/applications/${app.id}$`).test(u.toString()), { timeout: 180000 }),
        page.locator('[data-testid="car-send"]').click(),
    ]);
    await page.waitForTimeout(3000);
    await shot(page, '04-applicant-after-send');
    const fd = await staffFormData();
    const docs = fd.carDocuments || [];
    const perDefect = [1, 2, 3].map((n) => docs.filter((d) => d.findingNo === n).length);
    const status = (await api('applicant', 'GET', `/api/applications/${app.id}`)).body.data?.status;
    check(status === 'CAR_REVIEWING' && docs.length === 20, `sent: status ${status}, ${docs.length} files in the round`);
    check(perDefect.join('/') === '7/7/6', `files per defect ${perDefect.join('/')} (expected 7/7/6)`);
    check((fd.carStagedFiles || []).length === 0, `nothing left staged (${(fd.carStagedFiles || []).length})`);
    const onDisk = new Set(fs.readdirSync(CAR_DIR));
    check(docs.every((d) => onDisk.has(d.filename)), 'every sent file is in uploads/car');
    fs.writeFileSync(path.join(LOGS, `${label}-attempts.json`), JSON.stringify(attempts));
    await page.context().close();
    return docs;
}

async function inspectorRound(browser, docs) {
    const early = await api('inspector', 'POST', `/api/provider/auditor/applications/${app.id}/audit-decisions`, { decision: 'PASS', notes: 'ทดสอบ-CPF ผ่าน' });
    check(early.status === 422 && early.body.code === 'CAR_EVIDENCE_NOT_OPENED', `PASS before opening the evidence: ${early.status} ${early.body.code} "${early.body.error || ''}"`);

    const page = await newPage(browser);
    lastPage = page;
    await page.goto(`${SITE}/auth/provider/login`, { waitUntil: 'networkidle', timeout: 240000 });
    await page.waitForTimeout(2000);
    await page.fill('#provider-id', creds.inspector.login);
    await page.fill('#provider-password', creds.inspector.password);
    await Promise.all([page.waitForURL((u) => !/auth\/provider\/login/.test(u.toString()), { timeout: 180000 }), page.locator('button[type=submit]').first().click()]);
    await page.goto(`${SITE}/provider/audits/${app.id}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
    await page.waitForSelector('[data-testid="car-evidence-panel"]', { timeout: 240000 });
    await page.waitForTimeout(2000);
    const groups = await Promise.all([1, 2, 3].map((n) => page.locator(`[data-testid="car-evidence-defect-${n}"] [data-testid="car-evidence-file"]`).count()));
    check(groups.join('/') === '7/7/6', `decision sheet groups the files per defect: ${groups.join('/')}`);
    const passButton = page.locator('[data-testid="auditor-action-buttons"]').getByRole('button', { name: 'ผ่าน', exact: true });
    const hasPass = await passButton.count();
    if (hasPass) { check(await passButton.isDisabled(), 'PASS is disabled before the evidence is opened'); }
    say(`progress line: "${await page.locator('[data-testid="car-evidence-progress"]').textContent()}"`);
    await page.locator('[data-testid="car-evidence-panel"]').scrollIntoViewIfNeeded();
    await shot(page, '05-inspector-before-opening');

    const total = await page.locator('[data-testid="car-evidence-file"] button').count();
    for (let i = 0; i < total; i += 1) {
        await page.locator('[data-testid="car-evidence-file"] button').nth(i).click();
        await page.locator('[role=dialog] iframe, [role=dialog] img').first().waitFor({ timeout: 60000 });
        if (i === 0) { await shot(page, '06-inspector-viewing-a-file'); }
        await page.locator('[role=dialog]').getByRole('button', { name: 'ปิด' }).last().click();
        await page.waitForTimeout(700);
    }
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="car-evidence-file"][data-opened="true"]').length === document.querySelectorAll('[data-testid="car-evidence-file"]').length, null, { timeout: 60000 });
    say(`opened ${total} files; progress line: "${await page.locator('[data-testid="car-evidence-progress"]').textContent()}"`);
    if (hasPass) { check(!(await passButton.isDisabled()), 'PASS is enabled once every file is opened'); }
    await page.locator('[data-testid="car-evidence-panel"]').scrollIntoViewIfNeeded();
    await shot(page, '07-inspector-all-opened');
    const views = (await staffFormData()).carEvidenceViews || {};
    check(docs.every((d) => views[d.id] && views[d.id][creds.inspector.id || fixtures.users.inspector]), `server recorded an opening by this inspector on ${Object.keys(views).length}/${docs.length} files`);
    const late = await api('inspector', 'POST', `/api/provider/auditor/applications/${app.id}/audit-decisions`, { decision: 'PASS', notes: 'ทดสอบ-CPF ผ่าน' });
    check(late.body.code !== 'CAR_EVIDENCE_NOT_OPENED', `PASS after opening every file is no longer refused for unopened evidence: ${late.status} ${late.body.code || 'ok'}`);
    await page.context().close();
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const docs = await applicantRound(browser);
        await inspectorRound(browser, docs);
    } catch (error) {
        say(`WALK FAILED ${error.message.slice(0, 400)}`);
        if (lastPage) {
            await lastPage.screenshot({ path: path.join(SHOTS, `${label}-failure.png`), fullPage: true }).catch(() => {});
            say(`page text at failure: ${(await lastPage.evaluate(() => document.body.innerText).catch(() => '')).slice(0, 600).replace(/\s+/g, ' ')}`);
        }
        process.exitCode = 1;
    } finally {
        fs.writeFileSync(path.join(LOGS, `${label}-summary.txt`), `${summary.join('\n')}\n`);
        await browser.close();
    }
})();

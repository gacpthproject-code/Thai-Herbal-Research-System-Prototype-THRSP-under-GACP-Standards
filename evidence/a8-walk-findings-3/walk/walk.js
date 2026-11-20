'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('/home/ubuntu/work/GACP-Certification-Application/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');

const [WEB, API, FIXTURE, OUT, LABEL, BACKEND_DIR] = process.argv.slice(2);
const fx = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const SECRETS = [fx.applicant, fx.dispatcher, fx.reviewer, fx.inspector].flatMap((u) => [u.login, u.password]);
const scrub = (s) => SECRETS.reduce((t, x) => t.split(x).join('[redacted]'), String(s));
const log = (m) => console.log(scrub(`[walk ${LABEL}] ${new Date().toISOString()} ${m}`));
fs.mkdirSync(OUT, { recursive: true });
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${LABEL}-${name}.png`), fullPage: true });

async function apiLogin(user) {
    const staff = user.role !== 'health';
    const r = await fetch(`${API}/api/auth/${staff ? 'provider' : 'health'}/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(staff ? { providerId: user.login, password: user.password } : { identifier: user.login, password: user.password }),
    });
    const j = await r.json();
    const token = j.data?.token || j.data?.accessToken || j.token || j.accessToken;
    if (!token) { throw new Error(`api login ${user.role} ${r.status} ${scrub(JSON.stringify({ code: j.code, error: j.error }))}`); }
    return token;
}

let lastPage = null;
async function signIn(browser, user) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'th-TH', timezoneId: 'Asia/Bangkok', colorScheme: 'light' });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') { log(`${user.role} console.error ${m.text().slice(0, 160)}`); } });
    if (user.role === 'health') {
        await page.goto(`${WEB}/auth/health/login`, { waitUntil: 'networkidle', timeout: 240000 });
        await page.fill('#identifier', user.login);
        await page.fill('#password', user.password);
        await Promise.all([page.waitForURL((u) => !/auth\/health\/login/.test(u.toString()), { timeout: 180000 }), page.locator('button[type=submit]').first().click()]);
    } else {
        await page.goto(`${WEB}/auth/provider/login`, { waitUntil: 'networkidle', timeout: 240000 });
        await page.fill('#provider-id', user.login);
        await page.fill('#provider-password', user.password);
        await Promise.all([page.waitForURL((u) => !/auth\/provider\/login/.test(u.toString()), { timeout: 180000 }), page.click('button[type=submit]')]);
    }
    log(`${user.role} signed in -> ${page.url()}`);
    lastPage = page;
    return page;
}

(async () => {
    const dispatcherToken = await apiLogin(fx.dispatcher);
    const assign = await fetch(`${API}/api/provider/scheduler/reviewer-assignments`, {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${dispatcherToken}` },
        body: JSON.stringify({ applicationId: fx.reviewApp.id, reviewerId: fx.reviewer.id }),
    });
    log(`assign reviewer ${fx.reviewApp.number} -> ${assign.status}`);
    log(execFileSync('node', [path.join(__dirname, 'advance.js'), FIXTURE], { cwd: BACKEND_DIR, encoding: 'utf8' }).trim());

    const browser = await chromium.launch({ headless: true });
    try {
        const applicant = await signIn(browser, fx.applicant);
        await applicant.goto(`${WEB}/health/holders/${fx.entityId}`, { waitUntil: 'networkidle', timeout: 240000 });
        await applicant.waitForTimeout(3000);
        log(`holder page labels: ${JSON.stringify(await applicant.locator('label').allInnerTexts())}`);
        await applicant.getByLabel(/^\s*โทรศัพท์/).first().waitFor({ timeout: 120000 });
        await shot(applicant, 'pd02-01-holder-loaded');
        await applicant.getByLabel(/^\s*โทรศัพท์/).first().fill('');
        const saved = applicant.waitForResponse((r) => /\/holder$/.test(r.url()) && r.request().method() === 'PUT', { timeout: 120000 });
        await applicant.getByRole('button', { name: 'บันทึก', exact: true }).click();
        log(`holder save (phone cleared) -> ${(await saved).status()}`);
        await applicant.waitForTimeout(2000);
        log(`holder page status texts: ${JSON.stringify(await applicant.locator('[role="status"], [role="alert"]').allInnerTexts())}`);
        await shot(applicant, 'pd02-02-after-save-phone-cleared');
        await applicant.reload({ waitUntil: 'networkidle' });
        await applicant.waitForTimeout(1500);
        log(`holder page after reload: ${JSON.stringify(await applicant.locator('[role="alert"]').allInnerTexts())}`);
        await shot(applicant, 'pd02-03-reloaded');

        await applicant.goto(`${WEB}/health/applications/${fx.reviewApp.id}`, { waitUntil: 'networkidle', timeout: 240000 });
        await applicant.getByText('ความคืบหน้าจากเจ้าหน้าที่').waitFor({ timeout: 120000 });
        await applicant.waitForTimeout(1500);
        const box = applicant.locator('section, div').filter({ has: applicant.getByText('ความคืบหน้าจากเจ้าหน้าที่', { exact: true }) }).last();
        log(`progress box: ${JSON.stringify((await box.innerText()).replace(/\s+/g, ' ').slice(0, 400))}`);
        await shot(applicant, 'f-a8c-13-01-progress-after-doc-review');

        const dispatcher = await signIn(browser, fx.dispatcher);
        await dispatcher.goto(`${WEB}/provider/calendar`, { waitUntil: 'networkidle', timeout: 240000 });
        const row = dispatcher.locator('div', { hasText: fx.toBook.number }).filter({ has: dispatcher.getByRole('button', { name: 'จัดคู่นัดตรวจ' }) }).last();
        await row.getByRole('button', { name: 'จัดคู่นัดตรวจ' }).first().click();
        const dlg = dispatcher.getByRole('dialog').last();
        await dlg.waitFor({ timeout: 60000 });
        await dlg.locator('input').first().waitFor();
        const date = dlg.locator('input[type=date]');
        if (await date.count()) { await date.first().fill(fx.slotDay); } else {
            const dateInput = dlg.getByLabel('วันที่นัดหมาย');
            await dateInput.fill(fx.slotDay);
        }
        await dlg.locator('input[type=time]').first().fill(fx.slotTime);
        await dlg.getByText('เลือกผู้ตรวจพื้นที่...').first().click();
        await dispatcher.waitForTimeout(800);
        await dispatcher.getByRole('option', { name: /ผู้ตรวจแปลง/ }).last().click();
        await dlg.locator('input[placeholder="ที่ตั้งพื้นที่"]').fill('แปลงทดสอบ WF3 นนทบุรี');
        await shot(dispatcher, 'f-a8-14-01-booking-filled');
        const posted = dispatcher.waitForResponse((r) => /audits\/schedules$/.test(r.url()) && r.request().method() === 'POST', { timeout: 120000 });
        await dlg.getByRole('button', { name: /ยืนยัน|บันทึก/ }).last().click();
        const res = await posted;
        log(`book ${fx.toBook.number} with the inspector of ${fx.failed.number} (AUDIT_NOT_PASSED) at ${fx.slotDay} ${fx.slotTime} -> ${res.status()} ${scrub((await res.text()).slice(0, 300))}`);
        await dispatcher.waitForTimeout(1500);
        await shot(dispatcher, 'f-a8-14-02-after-submit');

        const inspector = await signIn(browser, fx.inspector);
        await inspector.goto(`${WEB}/provider/audits/${fx.worksheet.id}`, { waitUntil: 'networkidle', timeout: 240000 });
        await inspector.getByText('สรุปคำขอ').waitFor({ timeout: 120000 });
        const summary = inspector.locator('div').filter({ has: inspector.getByText('สรุปคำขอ', { exact: true }) }).last();
        log(`worksheet summary: ${JSON.stringify((await summary.innerText()).replace(/\s+/g, ' '))}`);
        await shot(inspector, 'f-a8b-06-01-worksheet');
    } catch (e) {
        if (lastPage) { await shot(lastPage, 'zz-failed').catch(() => {}); }
        throw e;
    } finally {
        await browser.close();
    }
})().catch((e) => { log(`FAILED ${e.stack || e.message}`); process.exit(1); });

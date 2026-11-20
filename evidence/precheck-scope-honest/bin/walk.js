'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('/home/ubuntu/work/GACP-Certification-Application/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');

const [phase, label] = process.argv.slice(2);
const PRIVATE = process.env.PSH_PRIVATE;
const EV = process.env.PSH_EVIDENCE;
const API = `http://127.0.0.1:${process.env.BPORT}`;
const SITE = `http://127.0.0.1:${process.env.WPORT}`;
const fx = JSON.parse(fs.readFileSync(path.join(PRIVATE, 'fixtures.json'), 'utf8'));
const creds = JSON.parse(fs.readFileSync(path.join(PRIVATE, 'creds.json'), 'utf8'));
const SECRETS = [creds.applicant.login, creds.applicant.password, creds.reviewer.login, creds.reviewer.password];
const scrub = (s) => SECRETS.reduce((t, x) => t.split(x).join('[ปิดไว้]'), String(s));
const say = (m) => console.log(scrub(`[${label}/${phase}] ${m}`));
const SLOTS = ['producer_supervision_letter', 'id_house_reg', 'sop_manual'];

async function apiLogin() {
    const r = await fetch(`${API}/api/auth/health/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identifier: creds.applicant.login, password: creds.applicant.password }),
    });
    const j = await r.json();
    const token = j.data?.token || j.data?.tokens?.accessToken || j.token || j.data?.accessToken;
    if (!token) { throw new Error(`api login ${r.status} ${j.code || ''}`); }
    return token;
}

async function upload() {
    const token = await apiLogin();
    const bytes = fs.readFileSync(process.env.PSH_INVOICE);
    for (const slotId of SLOTS) {
        const form = new FormData();
        form.append('file', new Blob([bytes], { type: 'application/pdf' }), 'ใบแจ้งหนี้.pdf');
        form.append('slotId', slotId);
        form.append('stepKey', 'identity');
        form.append('applicationId', fx.app.id);
        const r = await fetch(`${API}/api/applications/draft-documents`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
        const j = await r.json();
        say(`upload invoice -> ${slotId}: ${r.status} ${j.success ? 'ok' : j.code || j.error}`);
    }
    let slots = [];
    for (let i = 0; i < 90; i += 1) {
        const r = await fetch(`${API}/api/applications/${fx.app.id}/requirements`, { headers: { authorization: `Bearer ${token}` } });
        const j = await r.json();
        slots = (j.data?.slots || []).filter((s) => SLOTS.includes(s.slotId));
        if (slots.length === SLOTS.length && slots.every((s) => !s.precheck || s.precheck.status !== 'PENDING')) { break; }
        await new Promise((res) => setTimeout(res, 2000));
    }
    for (const s of slots) {
        const p = s.precheck;
        say(`requirements ${s.slotId}: satisfied=${s.satisfied} precheck=${p ? `${p.status} ${p.flags.map((f) => `${f.check}:${f.result}`).join(',')}` : 'null'}`);
    }
}

async function browserPage() {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'th-TH', timezoneId: 'Asia/Bangkok', colorScheme: 'light' });
    return { browser, page: await ctx.newPage() };
}

async function shot(page, locator, name) {
    await locator.scrollIntoViewIfNeeded();
    await locator.screenshot({ path: path.join(EV, 'shots', `${label}-${name}.png`) });
    fs.writeFileSync(path.join(EV, 'text', `${label}-${name}.txt`), scrub(await locator.innerText()));
    say(`shot ${name}`);
}

async function applicant() {
    const { browser, page } = await browserPage();
    await page.goto(`${SITE}/auth/health/login`, { waitUntil: 'networkidle', timeout: 300000 });
    await page.fill('#identifier', creds.applicant.login);
    await page.fill('#password', creds.applicant.password);
    await Promise.all([page.waitForURL((u) => !/auth\/health\/login/.test(u.toString()), { timeout: 180000 }), page.locator('button[type=submit]').first().click()]);
    await page.goto(`${SITE}/health/applications/new/step/2`, { waitUntil: 'networkidle', timeout: 300000 });
    const card = page.locator('div').filter({ has: page.getByText('ผู้รับอนุญาตผลิตยาหรือผลิตภัณฑ์สมุนไพร', { exact: false }) }).filter({ has: page.locator('button') }).last();
    await card.waitFor({ timeout: 240000 });
    await page.waitForTimeout(3000);
    const section = page.locator('section').filter({ has: page.getByText('ผู้รับอนุญาตผลิตยาหรือผลิตภัณฑ์สมุนไพร', { exact: false }) }).last();
    await shot(page, section, 'applicant-step2-documents');
    await page.screenshot({ path: path.join(EV, 'shots', `${label}-applicant-step2-full.png`), fullPage: true });
    await page.goto(`${SITE}/health/applications/new/step/5`, { waitUntil: 'networkidle', timeout: 300000 });
    const sop = page.locator('div.rounded-xl.border-2').filter({ has: page.getByText('คู่มือมาตรฐานการปฏิบัติงาน (SOP)', { exact: false }) }).last();
    await sop.waitFor({ timeout: 240000 });
    await page.waitForTimeout(2000);
    await shot(page, sop, 'applicant-step5-sop-card');
    await browser.close();
}

async function reviewer() {
    const { browser, page } = await browserPage();
    await page.goto(`${SITE}/auth/provider/login`, { waitUntil: 'networkidle', timeout: 300000 });
    await page.fill('#provider-id', creds.reviewer.login);
    await page.fill('#provider-password', creds.reviewer.password);
    await Promise.all([page.waitForURL((u) => !/auth\/provider\/login/.test(u.toString()), { timeout: 180000 }), page.locator('button[type=submit]').first().click()]);
    await page.goto(`${SITE}/provider/reviewer/${fx.app.id}/document-check`, { waitUntil: 'networkidle', timeout: 300000 });
    await page.locator('[data-slot-row="producer_supervision_letter"]').waitFor({ timeout: 240000 });
    await page.waitForTimeout(2000);
    await shot(page, page.locator('[data-slot-row="producer_supervision_letter"]'), 'reviewer-producer-row');
    await shot(page, page.locator('[data-slot-row="id_house_reg"]'), 'reviewer-id-row');
    await shot(page, page.locator('[data-slot-row="sop_manual"]'), 'reviewer-sop-row');
    await page.screenshot({ path: path.join(EV, 'shots', `${label}-reviewer-full.png`), fullPage: true });
    await browser.close();
}

({ upload, applicant, reviewer })[phase]().catch((error) => { console.error(scrub(`[${label}/${phase}] FAILED ${error.message}`)); process.exit(1); });

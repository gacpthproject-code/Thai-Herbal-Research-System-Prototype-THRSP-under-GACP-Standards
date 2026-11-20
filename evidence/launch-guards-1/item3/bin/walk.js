'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('/home/ubuntu/work/GACP-Certification-Application/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');

const phase = process.argv[2];
const EV = process.env.LG1U_EVIDENCE;
const PRIVATE = process.env.LG1U_PRIVATE;
const FILES = process.env.LG1U_FILES;
const API = `http://127.0.0.1:${process.env.BPORT}`;
const SITE = `http://127.0.0.1:${process.env.NPORT}`;
const creds = JSON.parse(fs.readFileSync(path.join(PRIVATE, 'creds.json'), 'utf8'))[phase];
const SHOTS = path.join(EV, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const uploadsLog = path.join(EV, 'logs', `${phase}-uploads.jsonl`);
fs.writeFileSync(uploadsLog, '');
const summary = [];
const say = (line) => { summary.push(line); console.log(`[${phase}] ${line}`); };
const scrub = (text) => String(text).split(creds.login).join('<masked>').split(creds.password).join('<masked>').split(creds.taxId).join('<masked>').replace(/\b\d{13}\b/g, '<13d>');

async function backend(method, p, token, body) {
    const r = await fetch(API + p, {
        method,
        headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function draftWithLargestSet() {
    const login = await backend('POST', '/api/auth/health/login', null, { identifier: creds.login, password: creds.password });
    const token = login.body.data?.token || login.body.data?.tokens?.accessToken || login.body.token || login.body.data?.accessToken;
    if (!token) { throw new Error(`api login ${login.status} ${login.body.code || ''}`); }
    const formData = {
        plantId: 'cannabis', requestType: 'NEW', serviceType: 'NEW', applicantType: 'JURISTIC', certScope: 'PLANTING',
        certificationPurposes: ['RESEARCH', 'EXPORT', 'PROCESSING'],
        applicantData: { applicantType: 'JURISTIC', taxId: creds.taxId, companyName: `บริษัท ทดสอบ-LG1U-${phase} จำกัด`, directorName: 'ทดสอบ-LG1U ผู้ยื่น', authorizedSignatory: 'ทดสอบ-LG1U ผู้ยื่น', phone: '0800000000', address: '99 หมู่ 1 ตำบลบางกระสอ อำเภอเมืองนนทบุรี จังหวัดนนทบุรี 11000' },
        farmData: {
            siteName: `แปลงทดสอบ-LG1U-${phase}`, siteAddress: '99 หมู่ 1', province: 'นนทบุรี', district: 'เมืองนนทบุรี', subDistrict: 'บางกระสอ', postalCode: '11000',
            areaSqm: '200', totalAreaUnit: 'sqm', areaTypes: ['OUTDOOR', 'GREENHOUSE', 'INDOOR'], coordinates: '13.8621, 100.5144', latitude: 13.8621, longitude: 100.5144,
            siteContactName: 'ทดสอบ-LG1U ผู้ยื่น', sitePhone: '0800000000', siteContactIsApplicant: true,
            landOwnership: 'RENTED', landlordName: 'ทดสอบ-LG1U ผู้ให้เช่า', landDocumentDetail: { type: 'โฉนด', number: '12345' }, cyclesPerYear: '2', plantsPerCycle: '100',
        },
    };
    const draft = await backend('POST', '/api/applications/draft', token, { entityId: creds.entityId, step: 5, formData });
    const id = draft.body.data?.id;
    if (!id) { throw new Error(`draft ${draft.status} ${draft.body.code || ''} ${draft.body.message || ''}`); }
    const req = await backend('GET', `/api/applications/${id}/requirements`, token);
    const slots = req.body.data?.slots || [];
    say(`draft ${draft.body.data.applicationNumber}: server shows ${slots.length} slots (${slots.filter((s) => s.required).length} required), blocking=${(req.body.data?.blockingIssues || []).length}`);
    return { id, slots };
}

function fileFor(label) {
    return path.join(FILES, /^(ภาพถ่าย|รูปถ่าย)/.test(label) ? 'photo.jpg' : 'document.pdf');
}

async function cardStates(page) {
    return page.evaluate(() => [...document.querySelectorAll('input[type=file]')].map((input) => {
        const card = input.parentElement;
        return {
            label: card.querySelector('p')?.textContent?.trim() || '',
            attached: card.className.includes('border-leaf-300'),
            error: card.querySelector('[role=alert]')?.textContent?.trim() || null,
        };
    }));
}

async function settle(page, expected) {
    for (let i = 0; i < 90; i += 1) {
        const states = await cardStates(page);
        const busy = await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.disabled && /กำลัง/.test(b.textContent || '')));
        if (states.length >= expected && !busy && states.every((s) => s.attached || s.error)) { return states; }
        await page.waitForTimeout(1000);
    }
    return cardStates(page);
}

async function openStep(page, step) {
    await page.goto(`${SITE}/health/applications/new/step/${step}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
    await page.waitForSelector('input[type=file]', { state: 'attached', timeout: 180000 });
    if (!page.url().endsWith(`/step/${step}`)) { throw new Error(`wizard sent step ${step} to ${page.url().replace(SITE, '')}`); }
    if (await page.getByText('ยังไปที่ขั้นตอนที่').count()) { throw new Error(`wizard refused step ${step}`); }
    const showOptional = page.getByRole('button', { name: 'แสดงเอกสารไม่บังคับ' });
    if (await showOptional.count()) { await showOptional.click(); }
    await page.waitForTimeout(1500);
}

async function selectEveryCard(page) {
    const inputs = page.locator('input[type=file]');
    const n = await inputs.count();
    const labels = await cardStates(page);
    for (let i = 0; i < n; i += 1) {
        await inputs.nth(i).setInputFiles(fileFor(labels[i].label));
    }
    return n;
}

async function shot(page, name) {
    await page.evaluate(() => {
        const re = /\b\d{13}\b/g;
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let t; (t = w.nextNode());) { if (re.test(t.nodeValue)) { t.nodeValue = t.nodeValue.replace(re, '<masked>'); } }
        document.querySelectorAll('input').forEach((i) => { if (/\d{13}/.test(i.value)) { i.value = '<masked>'; } });
    });
    const text = await page.evaluate(() => document.body.innerText);
    if (text.includes(creds.login) || text.includes(creds.password)) { throw new Error(`secret on screen at ${name}`); }
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

let failureHook = async () => {};

(async () => {
    await draftWithLargestSet();
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: 'light', locale: 'th-TH', timezoneId: 'Asia/Bangkok' });
    await ctx.addInitScript(() => { try { localStorage.setItem('theme', 'light'); localStorage.setItem('theme:explicit', '1'); } catch (_) { /* storage blocked */ } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(120000);
    const answers = [];
    page.on('response', (res) => {
        if (!/\/api\/applications\/draft-documents/.test(res.url()) || res.request().method() !== 'POST') { return; }
        const row = { at: new Date().toISOString(), status: res.status(), contentType: res.headers()['content-type'] || '' };
        answers.push(row);
        fs.appendFileSync(uploadsLog, `${JSON.stringify(row)}\n`);
    });

    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') { consoleErrors.push(msg.text().slice(0, 200)); } });
    page.on('pageerror', (err) => consoleErrors.push(`pageerror ${String(err.message).slice(0, 200)}`));
    failureHook = async () => {
        await page.evaluate(() => document.querySelectorAll('input').forEach((i) => { if (i.type !== 'file') { i.value = ''; } })).catch(() => {});
        await page.screenshot({ path: path.join(SHOTS, `${phase}-failure.png`), fullPage: true }).catch(() => {});
        say(`console errors: ${consoleErrors.slice(0, 8).map(scrub).join(' | ') || 'none'}`);
    };
    await page.goto(`${SITE}/auth/health/login`, { waitUntil: 'networkidle', timeout: 240000 });
    await page.waitForTimeout(3000);
    await page.fill('#identifier', creds.login);
    await page.fill('#password', creds.password);
    await Promise.all([page.waitForURL((u) => !/auth\/health\/login/.test(u.toString()), { timeout: 180000 }), page.locator('button[type=submit]').first().click()]);

    const final = { attached: 0, total: 0, errors: [] };
    const pass = async (label) => {
        const started = Date.now();
        const counts = {};
        for (const step of [5, 3, 2]) {
            await openStep(page, step);
            counts[step] = await selectEveryCard(page);
            const states = await settle(page, counts[step]);
            if (label === 'upload') {
                final.attached += states.filter((s) => s.attached).length;
                final.total += states.length;
            }
            states.filter((s) => s.error).forEach((s) => final.errors.push(`${label} ${s.label}: ${s.error}`));
            await shot(page, `${phase}-step${step}-after-${label}`);
        }
        say(`${label} pass: ${Object.values(counts).reduce((a, b) => a + b, 0)} files selected card after card in ${Math.round((Date.now() - started) / 1000)} s (step 5: ${counts[5]}, step 3: ${counts[3]}, step 2: ${counts[2]})`);
    };
    await pass('upload');
    if (phase === 'green') { await pass('replace'); }

    const byStatus = answers.reduce((acc, a) => { acc[a.status] = (acc[a.status] || 0) + 1; return acc; }, {});
    say(`upload POST answers: ${JSON.stringify(byStatus)} (${answers.length} total)`);
    say(`cards attached after first pass: ${final.attached}/${final.total}`);
    say(`card errors: ${final.errors.length ? final.errors.map(scrub).join(' | ') : 'none'}`);
    fs.writeFileSync(path.join(EV, 'logs', `${phase}-summary.txt`), `${summary.join('\n')}\n`);
    await browser.close();
})().catch(async (error) => {
    await failureHook();
    say(`WALK FAILED ${scrub(error.message).slice(0, 400)}`);
    fs.writeFileSync(path.join(EV, 'logs', `${phase}-summary.txt`), `${summary.join('\n')}\n`);
    process.exit(1);
});

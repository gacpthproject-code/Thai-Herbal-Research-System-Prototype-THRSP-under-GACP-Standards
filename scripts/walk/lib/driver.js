'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { SECRETS, NAMES, addSecret, harvestNames, scrub } = require('./mask');

const REPO = path.join(__dirname, '..', '..', '..');
const TOTP_ROLE = {
    reviewer: 'document_reviewer', dispatcher: 'dispatcher', inspector: 'field_inspector', approver: 'certificate_approver',
    findtam: 'finance_officer_dtam', finplat: 'finance_officer_platform', admdtam: 'system_admin_dtam', admplat: 'system_admin_platform',
};
const VIEW = { desk: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };
const GEO = { geolocation: { latitude: 13.8622, longitude: 100.5145, accuracy: 8 }, permissions: ['geolocation'] };
const MFA_ATTEMPTS_PER_WINDOW = 5;
const MFA_WINDOW_MS = 15.5 * 60 * 1000;
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadPlaywright(repo = REPO) {
    const candidates = [path.join(repo, 'apps/web-app/package.json'), path.join(repo, 'package.json')];
    for (const c of candidates) {
        try { return require(require('module').createRequire(c).resolve('playwright')); } catch {}
    }
    const pnpm = path.join(repo, 'node_modules/.pnpm');
    const dir = fs.existsSync(pnpm) && fs.readdirSync(pnpm).find((d) => /^playwright@\d/.test(d));
    if (dir) { return require(path.join(pnpm, dir, 'node_modules/playwright')); }
    throw new Error('หา playwright ไม่พบ');
}

const ctxOpts = (phone, role) => ({
    viewport: phone ? VIEW.phone : VIEW.desk, colorScheme: 'light', locale: 'th-TH', timezoneId: 'Asia/Bangkok', acceptDownloads: true,
    ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}), ...(role === 'inspector' ? GEO : {}),
});

async function maskPage(page) {
    const names = [...NAMES].filter((n) => n.length >= 3).sort((a, b) => b.length - a.length);
    await page.evaluate((list) => {
        const res = [
            /\b\d{13}\b|\b\d-\d{4}-\d{5}-\d{2}-\d\b|\b0\d{8,9}\b|\b0\d{1,2}-\d{3,4}-\d{3,4}\b/g,
            /(?:นางสาว|นาย|นาง|น\.ส\.)\s?[^\s\d<>()]{2,}(?:\s+[^\s\d<>()]{2,})?/g,
            /บริษัท\s?[^\n]{1,60}?จำกัด(?:\s?\(มหาชน\))?/g,
            /ห้างหุ้นส่วน(?:จำกัด|สามัญนิติบุคคล|สามัญ)\s?[^\s]{2,40}/g,
            /[\w.+-]+@[\w-]+\.[\w.]+/g,
        ];
        const issuer = /พรีดิคทีฟ|Predictive/i;
        const fix = (s) => {
            let t = s;
            for (const n of list) { if (n && t.includes(n)) { t = t.split(n).join('[ปิดชื่อ]'); } }
            for (const re of res) { t = t.replace(re, (m) => (issuer.test(m) ? m : '[ปิดไว้]')); }
            return t;
        };
        window.__walkUndo = [];
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n; (n = w.nextNode());) { const v = fix(n.nodeValue); if (v !== n.nodeValue) { window.__walkUndo.push([n, 'nodeValue', n.nodeValue]); n.nodeValue = v; } }
        for (const i of document.querySelectorAll('input, textarea')) { const v = fix(i.value || ''); if (v !== i.value) { window.__walkUndo.push([i, 'value', i.value]); i.value = v; } }
    }, names).catch(() => {});
    return () => page.evaluate(() => { for (const [n, k, v] of (window.__walkUndo || []).reverse()) { n[k] = v; } window.__walkUndo = []; }).catch(() => {});
}

function createDriver({ base, outDir, accounts, totpScript, fixtures, mfaSlotsFile, log }) {
    const W = outDir;
    for (const d of ['shots', 'net/text', 'files/pdf', '.tok']) { fs.mkdirSync(path.join(W, d), { recursive: true, mode: 0o700 }); }
    for (const a of Object.values(accounts)) { for (const v of [a.identifier, a.password, a.env.WALK_TAX, a.env.WALK_PHONE, a.env.EMAIL]) { addSecret(v); } if (a.env.FIRST_NAME && a.env.LAST_NAME) { NAMES.add(`${a.env.FIRST_NAME} ${a.env.LAST_NAME}`); } }
    const actLog = (row) => fs.appendFileSync(path.join(W, 'net/actions.jsonl'), scrub(JSON.stringify({ at: new Date().toISOString(), ...row })) + '\n');
    const records = (row) => fs.appendFileSync(path.join(W, 'records.jsonl'), scrub(JSON.stringify({ at: new Date().toISOString(), ...row })) + '\n');
    const tokens = {};
    const ctxs = {};
    const signedIn = new Set();
    const attempted = new Set();
    let browser;

    async function shot(page, name, { settle = 2000, full = true } = {}) {
        await page.waitForTimeout(settle);
        const undo = await maskPage(page);
        try {
            const text = await page.evaluate(() => document.body.innerText).catch(() => '');
            for (const x of SECRETS) { if (x.length >= 6 && text.includes(x)) { throw new Error(`credential visible on ${name}; refusing capture`); } }
            fs.writeFileSync(path.join(W, 'net/text', `${name}.txt`), `${page.url().replace(base, '')}\n\n${scrub(text)}`);
            await page.screenshot({ path: path.join(W, 'shots', `${name}.png`), fullPage: full });
            return `${name} ${page.url().replace(base, '')}`;
        } finally { await undo(); }
    }

    function watch(page, key) {
        page.on('response', async (res) => {
            const u = res.url();
            if (!u.startsWith(`${base}/api/`)) { return; }
            const m = res.request().method();
            if (m !== 'GET' && !/telemetry|activity|log$/.test(u)) {
                let body = ''; try { body = (await res.text()).slice(0, 400); } catch {}
                actLog({ key, m, p: u.replace(base, ''), s: res.status(), res: body });
            }
            if (/json/.test(res.headers()['content-type'] || '')) { try { harvestNames(await res.json()); } catch {} }
        });
    }

    async function waitMfaSlot() {
        for (;;) {
            let slots = []; try { slots = JSON.parse(fs.readFileSync(mfaSlotsFile, 'utf8')); } catch {}
            slots = slots.filter((t) => Date.now() - t < MFA_WINDOW_MS);
            if (slots.length < MFA_ATTEMPTS_PER_WINDOW) { slots.push(Date.now()); fs.writeFileSync(mfaSlotsFile, JSON.stringify(slots), { mode: 0o600 }); return; }
            const wait = MFA_WINDOW_MS - (Date.now() - slots[0]) + 1000;
            log(`mfa limiter: waiting ${Math.ceil(wait / 1000)}s`);
            await sleep(wait);
        }
    }
    const totp = (role) => execFileSync(totpScript, [TOTP_ROLE[role]], { encoding: 'utf8' }).trim();

    async function start() {
        const { chromium } = loadPlaywright();
        browser = await chromium.launch({ headless: true });
        log('browser up');
    }

    async function signIn(role) {
        if (signedIn.has(role)) { return { ok: true, landing: null, reused: true }; }
        if (attempted.has(role)) { return { ok: false, reason: 'already attempted in this run (no retry)' }; }
        attempted.add(role);
        const e = accounts[role];
        const ctx = await browser.newContext(ctxOpts(false, role));
        await ctx.addInitScript(() => { try { localStorage.setItem('theme', 'light'); localStorage.setItem('theme:explicit', '1'); } catch {} });
        const page = await ctx.newPage();
        watch(page, role);
        let mfaChallenged = false;
        try {
            if (e.staff) {
                await waitMfaSlot();
                await page.goto(`${base}/auth/provider/login`, { waitUntil: 'networkidle', timeout: 120000 });
                await page.fill('#provider-id', e.identifier);
                await page.fill('#provider-password', e.password);
                await page.click('button[type=submit]');
                await page.locator('#mfa-code').waitFor({ state: 'visible', timeout: 90000 });
                mfaChallenged = true;
                await shot(page, `signin-${role}-01-2fa-challenge`, { settle: 800 });
                await page.fill('#mfa-code', totp(role));
                await Promise.all([page.waitForURL((u) => !/auth\/provider\/login/.test(u.toString()), { timeout: 90000 }), page.locator('#mfa-code').press('Enter')]);
            } else {
                await page.goto(`${base}/auth/health/login`, { waitUntil: 'networkidle', timeout: 120000 });
                await page.fill('#identifier', e.identifier);
                await page.fill('#password', e.password);
                await Promise.all([page.waitForURL((u) => !/auth\/health\/login/.test(u.toString()), { timeout: 90000 }), page.locator('button[type=submit]').first().click()]);
            }
            await page.waitForLoadState('networkidle').catch(() => {});
            await shot(page, `signin-${role}-02-signed-in`);
            const t = await page.evaluate(() => localStorage.getItem('accessToken'));
            if (!t) { await ctx.close(); return { ok: false, mfaChallenged, reason: 'no session token after sign-in' }; }
            tokens[role] = t;
            addSecret(t);
            ctxs[role] = { ctx, page };
            signedIn.add(role);
            const landing = page.url().replace(base, '');
            log(`signed in ${role} landing ${landing}`);
            return { ok: true, mfaChallenged, landing };
        } catch (err) {
            await shot(page, `signin-${role}-99-failed`, { settle: 300 }).catch(() => {});
            await ctx.close().catch(() => {});
            log(`sign-in error ${role}: ${scrub(String(err.message).split('\n')[0]).slice(0, 200)}; no retry`);
            return { ok: false, mfaChallenged, reason: scrub(String(err.message).split('\n')[0]).slice(0, 200) };
        }
    }

    async function getPage(key) {
        if (ctxs[key] && !ctxs[key].page.isClosed()) { return ctxs[key]; }
        const [role, variant] = key.split(':');
        const phone = variant === 'm';
        if (role !== 'anon' && !signedIn.has(role)) { throw new Error(`${role} is not signed in`); }
        const storageState = role !== 'anon' ? await ctxs[role].ctx.storageState() : undefined;
        const ctx = await browser.newContext({ ...(storageState ? { storageState } : {}), ...ctxOpts(phone, role) });
        await ctx.addInitScript(() => { try { localStorage.setItem('lastActivity', String(Date.now())); localStorage.setItem('theme', 'light'); localStorage.setItem('theme:explicit', '1'); } catch {} });
        const page = await ctx.newPage();
        watch(page, key);
        ctxs[key] = { ctx, page };
        return ctxs[key];
    }

    async function api(role, method, p, body, { raw = false } = {}) {
        const headers = {};
        if (role !== 'anon') {
            const live = ctxs[role] && !ctxs[role].page.isClosed() ? await ctxs[role].page.evaluate(() => localStorage.getItem('accessToken')).catch(() => null) : null;
            if (live) { tokens[role] = live; addSecret(live); }
            headers.authorization = `Bearer ${tokens[role]}`;
        }
        let b = body;
        if (body !== undefined && !(body instanceof FormData)) { headers['content-type'] = 'application/json'; b = JSON.stringify(body); }
        const r = await fetch(base + p, { method, headers, body: b, signal: AbortSignal.timeout(120000) });
        if (raw) { return { status: r.status, buf: Buffer.from(await r.arrayBuffer()), type: r.headers.get('content-type') }; }
        const text = await r.text();
        let j; try { j = JSON.parse(text); } catch { j = text.slice(0, 400); }
        if (typeof j === 'object') { harvestNames(j); }
        if (method !== 'GET') { actLog({ key: `api:${role}`, m: method, p, s: r.status, req: body instanceof FormData ? '<form>' : body, res: typeof j === 'object' ? { success: j.success, code: j.code, message: j.message, error: j.error } : j }); }
        return { status: r.status, body: j, text };
    }

    async function go(page, p, { wait = 'networkidle' } = {}) {
        await page.goto(base + p, { waitUntil: wait, timeout: 120000 }).catch(async () => { await page.waitForTimeout(4000); });
    }

    async function run(key, step, A = {}, { timeoutMs = 300000 } = {}) {
        const code = `const A = ${JSON.stringify(A)};\n${fs.readFileSync(path.join(__dirname, '..', 'steps', `${step}.js`), 'utf8')}`;
        const h = { shot, go, api, records, sleep, W, F: fixtures, BASE: base, scrub, fs, log, credsRaw: (r) => accounts[r].env };
        const c = key ? await getPage(key) : null;
        const fn = new AsyncFunction('page', 'ctx', 'h', code);
        let timer;
        try {
            return await Promise.race([fn(c?.page, c?.ctx, h), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`timeout ${timeoutMs}ms`)), timeoutMs); })]);
        } catch (err) {
            const where = c?.page && !c.page.isClosed() ? await shot(c.page, `${A.p || step}-error`, { settle: 300 }).catch(() => c.page.url()) : 'no page';
            const first = String(err.message).split('\n');
            const locator = first.find((l) => /waiting for|locator\(|getBy/.test(l)) || '';
            throw new Error(`${step}: ${first[0]} ${locator.trim()} @ ${where}`);
        } finally { clearTimeout(timer); }
    }

    async function close() {
        if (browser) { await browser.close().catch(() => {}); }
        log('browser down');
    }

    return { start, signIn, run, api, close, signedIn };
}

module.exports = { createDriver, loadPlaywright, TOTP_ROLE };

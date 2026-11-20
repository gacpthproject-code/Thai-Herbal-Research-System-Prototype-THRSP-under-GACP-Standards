'use strict';
/**
 * View-pack capture for fix/checkout-ux — INTERCEPTED renders.
 *
 * Runs against `next dev` of this worktree (default http://127.0.0.1:3218,
 * started with NEXT_PUBLIC_CHECKOUT_UI_ENABLED=true). No backend runs: every
 * /api/ request the page makes is answered here (puppeteer request
 * interception, puppeteer borrowed from apps/backend/node_modules — same
 * idiom as evidence/web-quotation-truth/capture-view-pack.js). Unanswered
 * /api/ paths are logged into each shot's `unanswered` list.
 *
 * Item 1 — /health/payments/checkout idle state must print the
 * applicationNumber, never the raw UUID from ?app=.
 *
 * Item 2 — the quotation card on /health/payments must flip to "ยอมรับแล้ว"
 * right after a live click on ยอมรับใบเสนอราคา (a real POST intercepted and
 * answered 200, then a real second GET intercepted and answered ACCEPTED),
 * with NO page reload/navigation in between.
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require(path.join(__dirname, '../../apps/backend/node_modules/puppeteer'));

const BASE = process.env.VIEWPACK_BASE || 'http://127.0.0.1:3218';
const OUT = __dirname;

const APP_UUID = '2a60c16c-8428-4d48-8bc2-a27bf8e0f445';
const APP_NUMBER = 'APP-2569-MUJIXOBX-0C1EC3';

function b64url(o) { return Buffer.from(JSON.stringify(o)).toString('base64url'); }
const FAKE_JWT = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ role: 'health', canonicalRole: 'health', sub: 'viewpack', id: 'user-1' })}.x`;

const PLATFORM_QUOTATION_PENDING = {
    id: 'qt-1',
    applicationId: APP_UUID,
    issuerType: 'PLATFORM',
    quotationNumber: 'QT-PRD-2026-000001',
    subtotal: 33000,
    vat: 2310,
    totalAmount: 35310,
    installments: [{ phase: 'PHASE_1', amount: 5885 }, { phase: 'PHASE_2', amount: 29425 }],
    status: 'PENDING',
    validUntil: '2026-10-06T00:00:00.000Z',
    createdAt: '2026-09-20T00:00:00.000Z',
    lineItems: [
        { method: 'OUTDOOR', label: 'กลางแจ้ง (Outdoor)', phase1Amount: 5885, phase2Amount: 29425, netAmount: 33000, taxAmount: 2310 },
    ],
};
const PLATFORM_QUOTATION_ACCEPTED = { ...PLATFORM_QUOTATION_PENDING, status: 'ACCEPTED' };

function quotationsEnvelope(platform, includeApplicationNumber) {
    return {
        success: true,
        data: {
            dtam: null,
            platform,
            ...(includeApplicationNumber ? { applicationNumber: APP_NUMBER } : {}),
        },
    };
}

/**
 * A tiny per-page interceptor so the payments-page shot can answer the
 * SAME endpoint differently on its first call (PENDING) vs. every call
 * after a live accept (ACCEPTED) — exactly the race the bug/fix is about.
 */
function makeRouter() {
    let quotationsCalls = 0;
    let accepted = false;
    return function answer(method, url, postData) {
        const p = new URL(url).pathname;
        if (/\/applications\/[^/]+\/quotations$/.test(p) && method === 'GET') {
            quotationsCalls += 1;
            return { status: 200, body: quotationsEnvelope(accepted ? PLATFORM_QUOTATION_ACCEPTED : PLATFORM_QUOTATION_PENDING, true) };
        }
        if (/\/applications\/[^/]+\/quotations\/PLATFORM\/accept$/.test(p) && method === 'POST') {
            accepted = true;
            return { status: 200, body: { success: true, data: PLATFORM_QUOTATION_ACCEPTED } };
        }
        if (/\/invoices\/my$/.test(p)) { return { status: 200, body: { success: true, data: [] } }; }
        if (/\/applications\/my$/.test(p)) { return { status: 200, body: { success: true, data: [] } }; }
        if (/\/consent$/.test(p) && method === 'GET') { return { status: 200, body: { success: true, data: { consents: {} } } }; }
        if (/\/consent$/.test(p) && method === 'POST') { return { status: 200, body: { success: true, data: { category: 'PAYMENT_TERMS', granted: true } } }; }
        // ActiveEntityProvider (mounted app-wide under /health) — an empty
        // list is a normal, valid answer; unrelated to this fix.
        if (/\/entities\/mine$/.test(p)) { return { status: 200, body: { success: true, data: [] } }; }
        // /health layout's own chrome (notifications bell, etc.) — answer
        // arrays where the client expects an array, so unrelated UI does not
        // throw and obscure the shot.
        if (/\/notifications/.test(p)) { return { status: 200, body: { success: true, data: [] } }; }
        return null;
    };
}

async function setupPage(browser, dark) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1200, deviceScaleFactor: 1 });
    await page.setCookie({ name: 'auth_token', value: FAKE_JWT, url: BASE });
    await page.evaluateOnNewDocument((isDark) => {
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        localStorage.setItem('theme:explicit', '1');
        // Keys AuthService actually reads (auth-service.types.ts STORAGE_KEYS).
        localStorage.setItem('accessToken', 'viewpack-token');
        localStorage.setItem('user', JSON.stringify({
            id: 'user-1', role: 'HEALTH', canonicalRole: 'health', email: 'farmer@viewpack.test',
        }));
    }, dark);
    return page;
}

async function withIntercept(page, answer, unanswered) {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        const u = req.url();
        if (u.includes('/_next/') || !u.includes('/api/')) { return req.continue(); }
        const hit = answer(req.method(), u, req.postData());
        if (hit) {
            return req.respond({ status: hit.status, contentType: 'application/json', body: JSON.stringify(hit.body) });
        }
        unanswered.add(`${req.method()} ${new URL(u).pathname}`);
        return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: null }) });
    });
}

(async () => {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const notes = [];
    try {
        // ── Item 1 — checkout idle state shows applicationNumber, not the UUID ──
        {
            const unanswered = new Set();
            const page = await setupPage(browser, false);
            const router = makeRouter();
            await withIntercept(page, router, unanswered);
            await page.goto(`${BASE}/health/payments/checkout?app=${APP_UUID}&milestone=M1`, { waitUntil: 'networkidle0', timeout: 60000 });
            await page.waitForSelector('h2', { timeout: 30000 });
            await new Promise((r) => setTimeout(r, 800));
            await page.screenshot({ path: path.join(OUT, 'after-1-checkout-application-number.png'), fullPage: true });
            const text = await page.evaluate(() => document.body.innerText);
            notes.push(`after-1-checkout-application-number.png: containsNumber=${text.includes(APP_NUMBER)} containsUUID=${text.includes(APP_UUID)} unanswered=[${[...unanswered].join(',')}]`);
            await page.close();
        }

        // ── Item 2 — quotation badge flips live, no reload ──
        {
            const unanswered = new Set();
            const page = await setupPage(browser, false);
            const router = makeRouter();
            await withIntercept(page, router, unanswered);
            await page.goto(`${BASE}/health/payments?app=${APP_UUID}`, { waitUntil: 'networkidle0', timeout: 60000 });
            await page.waitForSelector('article', { timeout: 30000 });
            await new Promise((r) => setTimeout(r, 800));
            await page.screenshot({ path: path.join(OUT, 'before-2-quotation-pending.png'), fullPage: true });
            const beforeText = await page.evaluate(() => document.querySelector('article')?.innerText || '');

            // The ONE user action: a live click, no navigation.
            const clicked = await page.evaluate(() => {
                const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('ยอมรับใบเสนอราคา'));
                if (!btn) return false;
                btn.click();
                return true;
            });
            // Let the click's own fetch chain (accept POST, then the page's
            // loadPayments + loadQuotations refetches) settle — no reload().
            await new Promise((r) => setTimeout(r, 2500));
            await page.screenshot({ path: path.join(OUT, 'after-2-quotation-accepted-no-reload.png'), fullPage: true });
            const afterText = await page.evaluate(() => document.querySelector('article')?.innerText || '');

            notes.push(`clicked=${clicked}`);
            notes.push(`before-2-quotation-pending.png: article contains "รอการยอมรับ"=${beforeText.includes('รอการยอมรับ')}`);
            notes.push(`after-2-quotation-accepted-no-reload.png: article contains "ยอมรับแล้ว"=${afterText.includes('ยอมรับแล้ว')} still-pending=${afterText.includes('รอการยอมรับ')} unanswered=[${[...unanswered].join(',')}]`);
            await page.close();
        }
    } finally {
        await browser.close();
    }
    fs.writeFileSync(path.join(OUT, 'capture-check.txt'), `${notes.join('\n')}\n`);
    console.log(notes.join('\n'));
})().catch((e) => { console.error(e); process.exit(1); });

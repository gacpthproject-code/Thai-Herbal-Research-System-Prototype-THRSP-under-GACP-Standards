'use strict';
/**
 * View-pack capture for fix/draft-wizard-state — INTERCEPTED renders.
 *
 * Runs against `next dev` of this worktree (VIEWPACK_BASE, default
 * http://127.0.0.1:3229). No backend runs: every /api/ request is answered
 * here from the fixtures below. Adapted from
 * evidence/precheck-followups/view-pack/capture-view-pack.js (same fake
 * unsigned health JWT for the middleware's role decode).
 *
 * Run once with BEFORE_FIX=1 against the pre-fix client-view.tsx (git stash)
 * to get the "before" shots, then again with the fix restored for "after".
 *
 * Shots (shots/):
 *   p4-draft-{before,after}.png   /health/applications/app-viewpack/edit,
 *                                 status DRAFT — P4 (ต้องแก้ไขเอกสาร badge
 *                                 shown for a never-submitted draft, before;
 *                                 neutral ร่างคำขอ line, after)
 *   p3-step1-{before,after}.png   after pressing เริ่มแก้ไขคำขอ on a DRAFT
 *                                 whose formData carries applicantType
 *                                 JURISTIC + requestType NEW — P3 (step 1
 *                                 shows neither chosen, before; both chosen,
 *                                 after)
 *
 * Usage: node capture-view-pack.js (puppeteer from apps/backend/node_modules)
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require(path.join(__dirname, '../../../apps/backend/node_modules/puppeteer'));

const BASE = process.env.VIEWPACK_BASE || 'http://127.0.0.1:3229';
const TAG = process.env.BEFORE_FIX === '1' ? 'before' : 'after';
const OUT = __dirname;
const SHOTS = path.join(OUT, 'shots');
const APP_ID = 'app-viewpack';

const draftApp = {
    success: true,
    data: {
        id: APP_ID,
        applicationNumber: 'APP-2569-VIEWPACK',
        status: 'DRAFT',
        formData: {
            plantId: 'cannabis',
            serviceType: 'NEW',
            requestType: 'NEW',
            applicantType: 'JURISTIC',
            certScope: 'PLANTING',
        },
    },
};

function b64url(o) { return Buffer.from(JSON.stringify(o)).toString('base64url'); }
const FAKE_JWT = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ role: 'health', canonicalRole: 'health', sub: 'viewpack' })}.x`;

function answer(url) {
    const p = new URL(url).pathname;
    if (new RegExp(`/applications/${APP_ID}$`).test(p)) { return draftApp; }
    if (/\/applications\/config$/.test(p)) { return { success: true, data: { steps: [1, 2, 3, 4, 5, 6] } }; }
    if (/\/applications\/draft$/.test(p)) { return { success: true, data: null }; }
    return null;
}

async function withPage(browser, run) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.setCookie({ name: 'auth_token', value: FAKE_JWT, url: BASE });
    await page.setRequestInterception(true);
    const unanswered = new Set();
    page.on('request', (req) => {
        const u = req.url();
        if (u.includes('/_next/') || !u.includes('/api/')) { return req.continue(); }
        const body = answer(u);
        if (body) { return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }); }
        unanswered.add(new URL(u).pathname);
        return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: null }) });
    });
    const result = await run(page);
    await page.close();
    return { ...result, unanswered: [...unanswered] };
}

(async () => {
    fs.mkdirSync(SHOTS, { recursive: true });
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const results = [];
    try {
        // P4 — edit landing page for a never-submitted DRAFT.
        results.push(await withPage(browser, async (page) => {
            await page.goto(`${BASE}/health/applications/${APP_ID}/edit`, { waitUntil: 'networkidle0', timeout: 60000 });
            await page.waitForSelector('button', { timeout: 30000 });
            await new Promise((r) => setTimeout(r, 500));
            const file = `p4-draft-${TAG}.png`;
            await page.screenshot({ path: path.join(SHOTS, file), fullPage: true });
            const badgeText = await page.evaluate(() => document.body.textContent || '');
            return {
                file,
                claimsRevisionRequested: badgeText.includes('ต้องแก้ไขเอกสาร'),
                claimsNeutralDraft: badgeText.includes('ร่างคำขอ'),
            };
        }));

        // P3 — press เริ่มแก้ไขคำขอ, land on step 1.
        results.push(await withPage(browser, async (page) => {
            await page.goto(`${BASE}/health/applications/${APP_ID}/edit`, { waitUntil: 'networkidle0', timeout: 60000 });
            await page.waitForSelector('button', { timeout: 30000 });
            await page.evaluate(() => {
                const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('เริ่มแก้ไขคำขอ'));
                btn.click();
            });
            await page.waitForSelector('button[aria-pressed]', { timeout: 30000 });
            await new Promise((r) => setTimeout(r, 800));
            const file = `p3-step1-${TAG}.png`;
            await page.screenshot({ path: path.join(SHOTS, file), fullPage: true });
            const facts = await page.evaluate(() => {
                const pressed = Array.from(document.querySelectorAll('button[aria-pressed="true"]')).map((b) => b.textContent);
                return { pressed };
            });
            return { file, ...facts };
        }));
    } finally {
        await browser.close();
    }
    const lines = results.map((r) => `${r.file} ${JSON.stringify(r)}`);
    fs.writeFileSync(path.join(OUT, `capture-check-${TAG}.txt`), lines.join('\n') + '\n');
    console.log(lines.join('\n'));
})();

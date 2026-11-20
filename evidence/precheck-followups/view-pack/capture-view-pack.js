'use strict';
/**
 * View-pack capture for fix/precheck-followups — INTERCEPTED renders.
 *
 * Runs against `next dev` of this worktree (VIEWPACK_BASE, default http://127.0.0.1:3219).
 * No backend runs: every /api/ request is answered here. Unanswered /api/ paths are
 * logged in capture-check.txt. Adapted from evidence/web-quotation-truth/capture-view-pack.js
 * (same fake unsigned health JWT for the middleware's role decode, same sessionStorage
 * gacp_edit_mode so a step renders without walking the steps before it).
 *
 * Shots (shots/):
 *   step5-editable-{light,dark}.png   step 5 slot cards: two missing required cards (D2),
 *                                     one flagged + acknowledged card (D6: disabled confirm,
 *                                     "เปิดดูในหน้า"), one checked-ok card; "ลบไฟล์" enabled (D3)
 *   step5-delete-confirm-{light,dark}.png  after pressing "ลบไฟล์" on the checked-ok card
 *   step5-locked-dark.png             same payload with editable:false — "ลบไฟล์" disabled
 *   step10-quotation-{light,dark}.png step 10 around the quotation document (review M-4)
 *
 * Usage: node capture-view-pack.js  (puppeteer from apps/backend/node_modules)
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require(path.join(__dirname, '../../../apps/backend/node_modules/puppeteer'));

const BASE = process.env.VIEWPACK_BASE || 'http://127.0.0.1:3219';
const OUT = __dirname;
const SHOTS = path.join(OUT, 'shots');
const APP_ID = 'app-viewpack';
const quotations = JSON.parse(fs.readFileSync(path.join(OUT, '../../web-quotation-truth/fixtures/quotations-response.json'), 'utf8'));

const draft = {
    success: true,
    data: {
        id: APP_ID, draftId: APP_ID, status: 'DRAFT',
        formData: { plantId: 'ginger', requestType: 'NEW', certScope: 'PLANTING', applicantType: 'JURISTIC', cultivationMethods: ['OUTDOOR'] },
    },
};

const slotBase = { description: null, sourceHint: null, alternativeGroup: null, uploadedAt: '2026-09-29T03:00:00.000Z' };
function requirements(editable) {
    return {
        success: true,
        data: {
            dims: { holderType: 'JURISTIC', requestType: 'NEW', plantCode: 'ginger', landTenure: 'RENTED', areaTypes: ['INDOOR'], certScope: 'PLANTING', purposes: [] },
            slots: [
                { ...slotBase, slotId: 'production_util_plan', labelTH: 'แผนการผลิตและการใช้ประโยชน์', required: true, requiredReason: 'ALWAYS', satisfied: false, documentId: null, fileUrl: null, fileName: null, uploadedAt: null, precheck: null },
                { ...slotBase, slotId: 'security_residue_plan', labelTH: 'แผนการรักษาความปลอดภัยและการจัดการเศษเหลือ', required: true, requiredReason: 'INDOOR', satisfied: false, documentId: null, fileUrl: null, fileName: null, uploadedAt: null, precheck: null },
                { ...slotBase, slotId: 'sop_manual', labelTH: 'คู่มือ SOP', required: true, requiredReason: 'ALWAYS', satisfied: true, documentId: 'doc-sop', fileUrl: '/uploads/application-drafts/sop.pdf', fileName: 'คู่มือ-SOP.pdf',
                    precheck: { id: 'pc-sop', status: 'DONE', acknowledgedAt: '2026-09-29T03:05:00.000Z', flags: [
                        { check: 'READABILITY', result: 'PASS', reasonTH: 'อ่านเอกสารได้ชัดเจน' },
                        { check: 'CROSS_MATCH', result: 'NOT_FOUND', reasonTH: 'ไม่พบชื่อผู้ยื่นในเอกสาร กรุณาตรวจสอบ' },
                    ] } },
                { ...slotBase, slotId: 'controlled_herb_license', labelTH: 'ใบอนุญาตสมุนไพรควบคุม', required: true, requiredReason: 'ALWAYS', satisfied: true, documentId: 'doc-lic', fileUrl: '/uploads/application-drafts/lic.pdf', fileName: 'ใบอนุญาต.pdf',
                    precheck: { id: 'pc-lic', status: 'DONE', acknowledgedAt: null, flags: [{ check: 'READABILITY', result: 'PASS', reasonTH: 'อ่านเอกสารได้ชัดเจน' }] } },
            ],
            missingRequired: ['production_util_plan', 'security_residue_plan'],
            blockingIssues: [],
            complete: false,
            editable,
        },
    };
}

function b64url(o) { return Buffer.from(JSON.stringify(o)).toString('base64url'); }
const FAKE_JWT = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ role: 'health', canonicalRole: 'health', sub: 'viewpack' })}.x`;

function answerFor(scenario) {
    return (url) => {
        const p = new URL(url).pathname;
        if (/\/applications\/[^/]+\/requirements$/.test(p)) { return requirements(scenario.editable); }
        if (/\/applications\/[^/]+\/quotations$/.test(p)) { return quotations; }
        if (/\/applications\/draft$/.test(p)) { return draft; }
        if (/\/applications\/config$/.test(p)) { return { success: true, data: { steps: [1, 2, 3, 4, 5, 6, 10, 12] } }; }
        if (new RegExp(`/applications/${APP_ID}$`).test(p)) { return { success: true, data: { id: APP_ID, status: 'DRAFT' } }; }
        return null;
    };
}

async function shoot(browser, scenario) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 1000, deviceScaleFactor: 1 });
    await page.setCookie({ name: 'auth_token', value: FAKE_JWT, url: BASE });
    await page.evaluateOnNewDocument((isDark, appId) => {
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        localStorage.setItem('theme:explicit', '1');
        sessionStorage.setItem('gacp_edit_mode', JSON.stringify({ isEditMode: true, applicationId: appId }));
    }, scenario.dark, APP_ID);
    await page.setRequestInterception(true);
    const unanswered = new Set();
    const deletes = [];
    const answer = answerFor(scenario);
    page.on('request', (req) => {
        const u = req.url();
        if (u.includes('/_next/') || !u.includes('/api/')) { return req.continue(); }
        if (req.method() === 'DELETE') { deletes.push(new URL(u).pathname + new URL(u).search); }
        const body = answer(u);
        if (body) { return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }); }
        unanswered.add(new URL(u).pathname);
        return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: null }) });
    });
    await page.goto(`${BASE}${scenario.url}`, { waitUntil: 'networkidle0', timeout: 180000 });
    await page.waitForSelector(scenario.selector, { timeout: 120000 });
    await new Promise((r) => setTimeout(r, 1200));
    if (scenario.pressDeleteOn) {
        await page.evaluate((label) => {
            const card = Array.from(document.querySelectorAll('p')).find((p) => p.textContent.startsWith(label)).closest('div.rounded-xl');
            Array.from(card.querySelectorAll('button')).find((b) => b.textContent === 'ลบไฟล์').click();
        }, scenario.pressDeleteOn);
        await page.waitForSelector('[role="alertdialog"]', { timeout: 10000 });
        await new Promise((r) => setTimeout(r, 400));
    }
    await page.screenshot({ path: path.join(SHOTS, scenario.file), fullPage: true });
    const facts = await page.evaluate(() => {
        const del = Array.from(document.querySelectorAll('button')).filter((b) => b.textContent === 'ลบไฟล์');
        const confirm = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'ยืนยันว่าเอกสารถูกต้อง');
        const color = (el) => (el ? `${getComputedStyle(el).color} on ${getComputedStyle(el).backgroundColor}` : null);
        const title = Array.from(document.querySelectorAll('p.font-semibold')).find((p) => p.textContent.startsWith('แผนการผลิตและการใช้ประโยชน์'));
        let ground = title;
        while (ground && getComputedStyle(ground).backgroundColor === 'rgba(0, 0, 0, 0)') { ground = ground.parentElement; }
        return {
            deleteButtons: del.length,
            deleteDisabled: del.map((b) => b.disabled),
            confirmButton: confirm ? { disabled: confirm.disabled, color: color(confirm) } : null,
            missingTitle: title ? `${getComputedStyle(title).color} on ${ground ? getComputedStyle(ground).backgroundColor : '?'}` : null,
            alertdialog: Boolean(document.querySelector('[role="alertdialog"]')),
            windowConfirmUsed: false,
        };
    });
    await page.close();
    return { file: scenario.file, unanswered: [...unanswered], deletes, facts };
}

(async () => {
    fs.mkdirSync(SHOTS, { recursive: true });
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const results = [];
    const step5 = { url: '/health/applications/new/step/5', selector: '[data-precheck]' };
    const step10 = { url: '/health/applications/new/step/10', selector: '#dtam-document' };
    try {
        for (const dark of [false, true]) {
            const mode = dark ? 'dark' : 'light';
            results.push(await shoot(browser, { ...step5, dark, editable: true, file: `step5-editable-${mode}.png` }));
            results.push(await shoot(browser, { ...step5, dark, editable: true, file: `step5-delete-confirm-${mode}.png`, pressDeleteOn: 'ใบอนุญาตสมุนไพรควบคุม' }));
            results.push(await shoot(browser, { ...step10, dark, editable: true, file: `step10-quotation-${mode}.png` }));
        }
        results.push(await shoot(browser, { ...step5, dark: true, editable: false, file: 'step5-locked-dark.png' }));
    } finally {
        await browser.close();
    }
    const lines = results.map((r) => `${r.file} facts=${JSON.stringify(r.facts)} deletes=${JSON.stringify(r.deletes)} unanswered-api=[${r.unanswered.join(',')}]`);
    fs.writeFileSync(path.join(OUT, 'capture-check.txt'), `${lines.join('\n')}\n`);
    console.log(lines.join('\n'));
})().catch((e) => { console.error(e); process.exit(1); });

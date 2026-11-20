// Real walk, Stripe TEST mode (2026-09-27). Chromium (Playwright) against the
// tree's own `next start` (:3099) and backend (:8099) over a scratch Postgres
// (qr-walk-pg :55461), with `stripe listen` forwarding test-mode webhooks to
// the backend. Nothing here is mocked: the QR modal is Stripe's, the
// authorisation is Stripe's hosted test page, and settlement comes from the
// forwarded webhook.
//
// Secrets: none are read by this script. The trace it writes redacts the
// client secret, the publishable key and every bearer token before printing.
//
// Usage: node walk.mjs <mode> <nationalId> <password> <entityId|-> <applicationId> <outDir> <prefix> [typedEmail]
//   mode full        — company workspace, accept, checkout, QR, authorise, webhook, receipt
//   mode email-input — no email on record: the screen asks, the typed address opens the QR
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const [, , MODE, NID, PASSWORD, ENTITY_ID, APP_ID, OUT, PREFIX, TYPED_EMAIL] = process.argv;
const BASE = 'http://127.0.0.1:3099';
const traceLines = [];
const t0 = Date.now();
function trace(line) {
    const s = `[+${String(((Date.now() - t0) / 1000).toFixed(1)).padStart(6)}s] ${line}`;
    traceLines.push(s);
    console.log(s);
}
function redact(text) {
    return String(text)
        .replace(/pi_[A-Za-z0-9]+_secret_[A-Za-z0-9]+/g, 'pi_…_secret_[REDACTED]')
        .replace(/(pk|sk|rk)_(test|live)_[A-Za-z0-9]+/g, '$1_$2_[REDACTED]')
        .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, 'eyJ[REDACTED-JWT]');
}
let shot = 0;
async function snap(page, name) {
    shot += 1;
    const file = `${OUT}/${PREFIX}${String(shot).padStart(2, '0')}-${name}.png`;
    await page.screenshot({ path: file, fullPage: true });
    trace(`screenshot ${file.split('/').pop()}`);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 1100 }, locale: 'th-TH' });
context.setDefaultTimeout(60000);
const page = await context.newPage();
page.on('console', (m) => { if (m.type() === 'error') trace(`console.error ${redact(m.text()).slice(0, 220)}`); });
page.on('response', async (r) => {
    const u = r.url();
    if (!u.startsWith(BASE + '/api/')) return;
    if (!/checkout|invoices\/my|quotations|consent|login/.test(u)) return;
    let body = '';
    try { body = await r.text(); } catch { /* streamed */ }
    let summary = body.slice(0, 200);
    try {
        const j = JSON.parse(body);
        if (/payments\/checkout/.test(u) && j.data) {
            summary = JSON.stringify({
                success: j.success,
                checkoutOrderId: j.data.checkoutOrderId,
                paymentIntentId: j.data.paymentIntentId,
                invoiceId: j.data.invoiceId,
                payerEmail: j.data.payerEmail,
                publishableKey: j.data.publishableKey ? `${j.data.publishableKey.slice(0, 8)}[REDACTED]` : j.data.publishableKey,
                clientSecret: j.data.clientSecret ? '[REDACTED]' : j.data.clientSecret,
                total: j.data.breakdown?.totalPayableAmount,
            });
        } else if (/invoices\/my/.test(u) && Array.isArray(j.data)) {
            summary = JSON.stringify(j.data.map((i) => ({ id: i.id, status: i.status, receiptNumber: i.receiptNumber, receiptStatus: i.receiptStatus })));
        } else if (!j.success) {
            summary = JSON.stringify({ success: j.success, error: j.error, code: j.code });
        } else {
            summary = JSON.stringify({ success: j.success });
        }
    } catch { /* not json */ }
    trace(`${r.request().method()} ${r.status()} ${u.replace(BASE, '')} :: ${redact(summary)}`);
});

try {
    // 1. Login through the real health door.
    await page.goto(`${BASE}/auth/health/login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(4000);
    await page.fill('#identifier', NID);
    await page.fill('#password', PASSWORD);
    await page.locator('button:has-text("เข้าสู่ระบบ")').last().click();
    await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 90000 });
    await page.waitForTimeout(3000);
    trace(`logged in → ${page.url().replace(BASE, '')}`);

    // 2. Pick the company workspace with the real picker.
    if (MODE === 'full') {
    await page.goto(`${BASE}/health/workspaces`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    await page.locator('li', { hasText: 'บริษัท ทดสอบพร้อมเพย์ จำกัด' }).locator('button:has-text("เปิด")').click();
    await page.waitForTimeout(4000);
    const active = await page.evaluate(() => window.localStorage.getItem('gacp.activeEntityId'));
    trace(`active workspace after picker click: ${active === ENTITY_ID ? 'the company entity' : `UNEXPECTED ${active}`}`);
    }

    // 3. Payments list: accept the quotation the backend issued on read.
    await page.goto(`${BASE}/health/payments`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(7000);
    await snap(page, 'payments-before-accept');
    const acceptBtn = page.locator('button:has-text("ยอมรับใบเสนอราคา")').first();
    if (await acceptBtn.count()) {
        await acceptBtn.click();
        await page.waitForTimeout(5000);
        trace('quotation accept pressed (ยอมรับใบเสนอราคา)');
    } else {
        trace('no accept button found on the payments list');
    }
    await snap(page, 'payments-after-accept');

    // 4. Checkout: tick the terms, start.
    await page.goto(`${BASE}/health/payments/checkout?app=${APP_ID}&milestone=M1`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    await snap(page, 'checkout-idle');
    const box = page.locator('[data-testid="checkout-terms-checkbox"]');
    if (await box.count()) { await box.check(); }
    await page.locator('button:has-text("เริ่มขั้นตอนชำระเงิน")').click();
    await page.waitForSelector('[data-testid="checkout-promptpay-step"]', { timeout: 60000 });
    await page.waitForTimeout(1500);
    await snap(page, 'checkout-created-with-pay-button');

    if (MODE === 'email-input') {
        const input = page.locator('[data-testid="checkout-payer-email-input"]');
        trace(`email input present=${await input.count() === 1} required=${await input.evaluate((e) => e.required)}`);
        trace(`pay button disabled before typing=${await page.locator('button:has-text("ชำระด้วย QR พร้อมเพย์")').isDisabled()}`);
        await input.fill(TYPED_EMAIL);
        trace(`pay button disabled after typing=${await page.locator('button:has-text("ชำระด้วย QR พร้อมเพย์")').isDisabled()}`);
        await snap(page, 'checkout-email-typed');
    }

    // 5. Stripe's QR modal.
    await page.locator('button:has-text("ชำระด้วย QR พร้อมเพย์")').click();
    let stripeFrame = null;
    for (let i = 0; i < 60 && !stripeFrame; i += 1) {
        await page.waitForTimeout(1000);
        for (const f of page.frames()) {
            if (!/stripe\.com/.test(f.url())) continue;
            const txt = await f.locator('body').innerText().catch(() => '');
            if (/simulate|scan|promptpay|พร้อมเพย์/i.test(txt)) { stripeFrame = f; break; }
        }
    }
    trace(`stripe frames: ${page.frames().filter((f) => /stripe\.com/.test(f.url())).map((f) => new URL(f.url()).host + new URL(f.url()).pathname.slice(0, 40)).join(' | ')}`);
    if (!stripeFrame) throw new Error('Stripe QR modal did not appear');
    trace(`QR modal text: ${redact((await stripeFrame.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300))}`);
    await snap(page, 'stripe-qr-modal');
    if (MODE === 'email-input') {
        trace('email-input walk ends at the QR modal (the payment path is walked in mode full)');
        throw Object.assign(new Error('done'), { done: true });
    }

    // 6. Test mode: "Simulate scan" opens Stripe's hosted test page; authorise.
    const simulate = stripeFrame.locator('a, button').filter({ hasText: /simulate|จำลองการสแกน/i }).first();
    await simulate.waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(2000);
    const simulateTag = await simulate.evaluate((e) => e.tagName);
    const simulateHref = await simulate.getAttribute('href');
    trace(`simulate control: tag=${simulateTag} href=${simulateHref ? new URL(simulateHref).host + '/…' : 'none'}`);
    let popup = null;
    [popup] = await Promise.all([
        context.waitForEvent('page', { timeout: 15000 }).catch(() => null),
        simulate.click({ timeout: 30000 }),
    ]);
    if (!popup && simulateHref) {
        // The same Stripe-hosted page the link opens in a new tab.
        trace('no popup from the click; opening the link target the control carries');
        popup = await context.newPage();
        await popup.goto(simulateHref);
    }
    if (!popup) throw new Error('Stripe test page did not open');
    await popup.waitForLoadState('domcontentloaded');
    await popup.waitForTimeout(4000);
    trace(`hosted test page: ${new URL(popup.url()).host}`);
    trace(`hosted test page text: ${redact((await popup.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300))}`);
    trace(`hosted test page buttons: ${JSON.stringify(await popup.$$eval('button, a', (els) => els.map((e) => e.textContent.trim()).filter(Boolean).slice(0, 12)))}`);
    await popup.screenshot({ path: `${OUT}/${PREFIX}${String(++shot).padStart(2, '0')}-stripe-test-authorise-page.png`, fullPage: true });
    trace(`screenshot ${PREFIX}${String(shot).padStart(2, '0')}-stripe-test-authorise-page.png`);
    const authorise = popup.getByText('Authorize Test Payment', { exact: false }).first();
    trace(`authorise control: tag=${await authorise.evaluate((e) => e.tagName)} visible=${await authorise.isVisible()}`);
    await Promise.all([
        popup.waitForNavigation({ timeout: 30000 }).catch(() => null),
        authorise.click({ timeout: 30000 }),
    ]);
    await snap(page, 'checkout-right-after-authorise');
    await popup.waitForTimeout(5000);
    trace(`after authorise: ${new URL(popup.url()).host}${new URL(popup.url()).pathname.slice(0, 30)} :: ${redact((await popup.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200))}`);
    await popup.screenshot({ path: `${OUT}/${PREFIX}${String(++shot).padStart(2, '0')}-stripe-test-after-authorise.png`, fullPage: true });
    trace(`screenshot ${PREFIX}${String(shot).padStart(2, '0')}-stripe-test-after-authorise.png`);

    // 7. Our screen: waiting, then settled only once the webhook has landed.
    await page.bringToFront();
    await page.waitForSelector('[data-testid="checkout-promptpay-waiting"], [data-testid="checkout-promptpay-settled"]', { timeout: 60000 });
    if (await page.locator('[data-testid="checkout-promptpay-waiting"]').count()) {
        await snap(page, 'checkout-waiting-for-webhook');
    }
    await page.waitForSelector('[data-testid="checkout-promptpay-settled"]', { timeout: 120000 });
    trace(`settled panel: ${(await page.locator('[data-testid="checkout-promptpay-settled"]').innerText()).replace(/\s+/g, ' ')}`);
    await snap(page, 'checkout-settled-receipt');

    // 8. The payments list shows the receipt the system issued.
    await page.goto(`${BASE}/health/payments`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(7000);
    await snap(page, 'payments-after-settlement');
} catch (err) {
    if (err.done) { /* planned stop */ } else {
    trace(`WALK ERROR: ${redact(err.message).slice(0, 400)}`);
    await page.screenshot({ path: `${OUT}/${PREFIX}zz-error.png`, fullPage: true }).catch(() => {});
    for (const f of page.frames()) {
        if (/stripe\.com/.test(f.url())) {
            const txt = await f.locator('body').innerText().catch(() => '');
            trace(`frame ${new URL(f.url()).host}: ${redact(txt.replace(/\s+/g, ' ').slice(0, 300))}`);
        }
    }
    process.exitCode = 1;
    }
} finally {
    fs.writeFileSync(`${OUT}/${PREFIX}trace.txt`, traceLines.join('\n') + '\n');
    await browser.close();
}

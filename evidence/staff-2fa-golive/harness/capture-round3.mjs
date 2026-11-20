// Round 3 real screens (CLAUDE.md Tier B/C, gacp-view-in-the-loop): drives the web app in Chromium
// against the production-mode backend and saves full-page PNGs at 390x844 and 1440x900.
//   node capture-round3.mjs <web base url> <out dir> <phase>     phase = flag-on | flag-off
// Reads the seed state from $ROUND3_STATE (0600) and writes the secret the move produced back to it,
// so the flag-off phase can sign in with the new authenticator. Prints a JSON summary; no secret in it.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const tree = process.env.ROUND3_TREE;
const requireWeb = createRequire(path.join(tree, 'apps/web-app/package.json'));
const requireBackend = createRequire(path.join(tree, 'apps/backend/package.json'));
const { chromium } = requireWeb('@playwright/test');
const { mfaService } = requireBackend('./middleware/mfa-service');

const [baseUrl, outDir, phase] = process.argv.slice(2);
const statePath = process.env.ROUND3_STATE;
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const VIEWPORTS = [
    { name: '390x844', width: 390, height: 844 },
    { name: '1440x900', width: 1440, height: 900 },
];
const summary = [];
// One TEST-NET address per browser context: the backend keys /api/mfa/verify's limiter (5 per
// 15 minutes) by client IP in the scratch Redis that outlives the backend restart between phases,
// and binds each challenge to the IP of the password step, so the address must stay fixed inside
// a context and differ between contexts. The web proxies forward X-Forwarded-For since round 4.
let contexts = 0;
function newContext(browser, viewport) {
    contexts += 1;
    const ip = `203.0.113.${10 + contexts + (phase === 'flag-off' ? 100 : 0)}`;
    return browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, extraHTTPHeaders: { 'x-forwarded-for': ip } });
}
const note = (name, value) => summary.push({ name, ...value });

async function shoot(page, file) {
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outDir, `${file}.png`), fullPage: true });
    note(file, {
        url: page.url(),
        horizontalOverflowPx: await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    });
}

async function signIn(page, account, { backupCode = null, totp = null } = {}) {
    await page.goto(`${baseUrl}/auth/provider/login`, { waitUntil: 'load' });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await page.fill('#provider-id', account.nationalId);
    await page.fill('#provider-password', state.password);
    await page.click('button[type="submit"]');
    if (backupCode || totp) {
        await page.locator('#mfa-code').waitFor({ timeout: 30000 });
        if (backupCode) { await page.locator('input[type="checkbox"]').first().check(); }
        await page.fill('#mfa-code', backupCode || totp);
        await page.click('button[type="submit"]');
        await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 30000 });
    }
}

const secretOnScreen = async (page) => (await page.locator('div.font-mono.text-xs').filter({ hasText: /^[A-Z2-7]{16,}$/ }).first().innerText()).trim();

async function flagOn(browser, viewport) {
    const tag = viewport.name;
    const context = await newContext(browser, viewport);
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    page.setDefaultNavigationTimeout(120000);

    const people = state.byViewport[viewport.name];
    // 1. enrolment: the newcomer gets the setup ticket, sees the codes and the confirmation
    await signIn(page, people.newcomer);
    await page.locator('#mfa-setup-code').waitFor({ timeout: 30000 });
    await shoot(page, `${tag}-01-enrolment-codes-and-confirmation`);
    const enrolSecret = (await page.locator('[data-testid="mfa-setup-secret"]').innerText()).trim();
    await page.locator('[role="checkbox"]').first().click();
    await page.fill('#mfa-setup-code', mfaService.generateTOTP(enrolSecret));
    await page.click('button[type="submit"]');
    await page.getByText('กลับไปเข้าสู่ระบบ').waitFor({ timeout: 30000 });
    await shoot(page, `${tag}-02-enrolment-done`);
    await context.clearCookies();

    // 2. path ก with one backup code: sign in with the code, then move from the security page
    const mover = people.mover;
    await signIn(page, mover, { backupCode: mover.codes[0] });
    await page.goto(`${baseUrl}/provider/profile/security`, { waitUntil: 'load' });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await page.getByText('ย้ายด้วยรหัสสำรองที่ใช้เข้าสู่ระบบ').waitFor({ timeout: 30000 });
    await shoot(page, `${tag}-03-security-signed-in-with-backup-code`);
    await page.getByRole('button', { name: 'ย้ายด้วยรหัสสำรองที่ใช้เข้าสู่ระบบ' }).click();
    await page.getByText('ยืนยันและเปิดใช้งาน').waitFor({ timeout: 30000 });
    await shoot(page, `${tag}-04-move-new-codes-shown-once`);
    const newSecret = await secretOnScreen(page);
    await page.locator('[role="checkbox"]').first().click();
    const qrInput = page.locator('input[placeholder="123456"]').filter({ hasNot: page.locator('[name="reenrolCurrentCode"]') }).first();
    await qrInput.fill(mfaService.generateTOTP(newSecret));
    await page.getByRole('button', { name: 'ยืนยันและเปิดใช้งาน' }).click();
    await page.getByText('เสร็จสิ้น').waitFor({ timeout: 30000 });
    await shoot(page, `${tag}-05-move-done`);
    mover.newSecret = newSecret;
    fs.writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 });

    // 3. the owner's notice, read on the device that moved (still signed in)
    await page.goto(`${baseUrl}/provider/notifications`, { waitUntil: 'load' });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await page.getByText('ย้ายการยืนยันตัวตนสองชั้นไปอุปกรณ์ใหม่แล้ว').first().waitFor({ timeout: 30000 });
    await shoot(page, `${tag}-06-owner-notice`);

    // 4a. flag on: the staff disable form is replaced by the pointer to the move
    await page.goto(`${baseUrl}/provider/profile/security`, { waitUntil: 'load' });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await page.locator('[data-testid="mfa-disable-not-for-staff"]').waitFor({ timeout: 30000 });
    await shoot(page, `${tag}-07-disable-not-for-staff`);
    note(`${tag}-07-check`, { disableButtonPresent: await page.getByRole('button', { name: 'ปิดใช้งาน MFA' }).count() });

    // 5. notification preferences: the always-on rows and the plain Thai headings
    await page.goto(`${baseUrl}/provider/profile/notifications`, { waitUntil: 'load' });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await page.locator('[data-testid="notification-type-SECOND_FACTOR_MOVED"]').waitFor({ timeout: 30000 });
    await shoot(page, `${tag}-08-notification-preferences`);
    note(`${tag}-08-check`, {
        headingsWithTracking: await page.locator('h2').evaluateAll((els) => els.filter((el) => /uppercase|tracking-wide/.test(el.className)).length),
        adminRowPresent: await page.locator('[data-testid="notification-type-STAFF_SECOND_FACTOR_CHANGED"]').count(),
    });

    // 6. the admin's inbox: the same-side admin was told
    await context.clearCookies();
    await signIn(page, state.admin, { totp: mfaService.generateTOTP(state.admin.secret) });
    await page.goto(`${baseUrl}/provider/notifications`, { waitUntil: 'load' });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await page.getByText('เจ้าหน้าที่ย้ายการยืนยันตัวตนสองชั้นไปอุปกรณ์ใหม่').first().waitFor({ timeout: 30000 });
    await shoot(page, `${tag}-09-admin-notice`);
    await context.close();
}

async function flagOff(browser, viewport) {
    const tag = viewport.name;
    const context = await newContext(browser, viewport);
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    page.setDefaultNavigationTimeout(120000);
    const mover = state.byViewport[viewport.name].mover;
    await signIn(page, mover, { totp: mfaService.generateTOTP(mover.newSecret) });
    await page.goto(`${baseUrl}/provider/profile/security`, { waitUntil: 'load' });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await page.getByRole('button', { name: 'ปิดใช้งาน MFA' }).waitFor({ timeout: 30000 });
    await page.locator('input[placeholder="123456"]').last().fill('000000');
    await page.getByRole('button', { name: 'ปิดใช้งาน MFA' }).click();
    await page.getByText('รหัสไม่ถูกต้อง').first().waitFor({ timeout: 30000 });
    await shoot(page, `${tag}-10-disable-wrong-code-still-signed-in`);
    note(`${tag}-10-check`, {
        stillOnSecurityPage: page.url().includes('/provider/profile/security'),
        disableButtonStillPresent: await page.getByRole('button', { name: 'ปิดใช้งาน MFA' }).count(),
    });
    await context.close();
}

const browser = await chromium.launch();
for (const viewport of VIEWPORTS) {
    try {
        if (phase === 'flag-on') { await flagOn(browser, viewport); } else { await flagOff(browser, viewport); }
    } catch (error) {
        note('error', { phase, viewport: viewport.name, message: error.message });
    }
}
await browser.close();
console.log(JSON.stringify({ phase, baseUrl, summary }, null, 2));

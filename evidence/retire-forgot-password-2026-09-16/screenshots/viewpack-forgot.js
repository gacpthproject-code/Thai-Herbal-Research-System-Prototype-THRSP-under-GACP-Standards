// View-pack for chore/retire-forgot-password (HARNESS.md §4.4).
// Drives a LOCAL frontend container (no backend, no real account). The /health
// gate is passed with an unsigned role-only cookie: middleware only decodes the
// role, the backend verifies signatures, and there is no backend here.
//
// usage: NODE_PATH=apps/web-app/node_modules node viewpack-forgot.js <baseUrl> <label> <sha12> <outDir>
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const [baseUrl, label, sha, outDir] = process.argv.slice(2);
if (!baseUrl || !label || !sha || !outDir) {
    console.error('usage: node viewpack-forgot.js <baseUrl> <label> <sha12> <outDir>');
    process.exit(2);
}
fs.mkdirSync(path.join(outDir, 'trace'), { recursive: true });
const stamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const fakeToken = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ role: 'HEALTH', canonicalRole: 'HEALTH', exp: Math.floor(Date.now() / 1000) + 3600 })}.view-pack`;

async function shot(page, name, step) {
    await page.evaluate(([text]) => {
        const el = document.createElement('div');
        el.textContent = text;
        el.setAttribute('style', 'position:fixed;right:8px;bottom:8px;z-index:2147483647;font:11px/1.4 monospace;background:#111;color:#fff;padding:3px 6px;border-radius:4px;opacity:.85');
        document.body.appendChild(el);
    }, [`view-pack · ${label} · build ${sha} · ${stamp} · ${step}`]);
    const file = path.join(outDir, `${label}-${name}-${sha}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`saved ${file}`);
}

(async () => {
    const browser = await chromium.launch();
    const results = {};
    try {
        // ── Scene 1: applicant login page ──
        {
            const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'th-TH' });
            await context.tracing.start({ screenshots: true, snapshots: true });
            const page = await context.newPage();
            await page.goto(`${baseUrl}/auth/health/login`, { waitUntil: 'networkidle' });
            await page.waitForSelector('#password', { timeout: 15000 });
            results.login = {
                forgotLinks: await page.locator('a[href="/forgot-password"]').count(),
                mentionsForgot: /ลืมรหัสผ่าน|forgot/i.test(await page.locator('body').innerText()),
            };
            await shot(page, '01-health-login', 'applicant login form');
            await context.tracing.stop({ path: path.join(outDir, 'trace', `${label}-01-health-login-${sha}.zip`) });
            await context.close();
        }

        // ── Scene 2: the old /forgot-password address ──
        {
            const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'th-TH' });
            await context.tracing.start({ screenshots: true, snapshots: true });
            const page = await context.newPage();
            const response = await page.goto(`${baseUrl}/forgot-password`, { waitUntil: 'networkidle' });
            const text = await page.locator('body').innerText();
            results.forgotPage = {
                httpStatus: response ? response.status() : null,
                finalUrl: page.url(),
                offersResetByPhoneOrEmail: /ส่งลิงก์|reset link|SMS|อีเมล/i.test(text),
            };
            await shot(page, '02-forgot-password-url', `GET /forgot-password -> HTTP ${results.forgotPage.httpStatus}`);
            await context.tracing.stop({ path: path.join(outDir, 'trace', `${label}-02-forgot-password-url-${sha}.zip`) });
            await context.close();
        }

        // ── Scene 3: /health/profile/security ──
        {
            const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'th-TH' });
            await context.addCookies([{ name: 'auth_token', value: fakeToken, url: baseUrl }]);
            await context.addInitScript(() => {
                try { localStorage.setItem('user', JSON.stringify({ id: 'view-pack', role: 'HEALTH', firstName: 'ตัวอย่าง', lastName: 'หน้าจอ' })); } catch { /* storage unavailable */ }
            });
            await context.tracing.start({ screenshots: true, snapshots: true });
            const page = await context.newPage();
            await page.goto(`${baseUrl}/health/profile/security`, { waitUntil: 'networkidle' });
            await page.waitForSelector('text=ความปลอดภัยของบัญชี', { timeout: 15000 });
            const text = await page.locator('body').innerText();
            results.security = {
                claimsIdpVerifiesToday: /ยืนยันตัวตนด้วย หมอพร้อม หรือ ThaID|ยืนยันตัวตนของคุณด้วยกลไก/.test(text),
                saysIdpNotYetOpen: text.includes('ยังไม่เปิดใช้'),
                saysNoResetByEmailOrSms: text.includes('ไม่มีการรีเซ็ตรหัสผ่านทางอีเมลหรือ SMS'),
            };
            await shot(page, '03-health-security', 'role-only cookie; page makes no API call');
            await context.tracing.stop({ path: path.join(outDir, 'trace', `${label}-03-health-security-${sha}.zip`) });
            await context.close();
        }
    } finally {
        await browser.close();
    }
    fs.writeFileSync(path.join(outDir, `${label}-checks-${sha}.json`), JSON.stringify({ label, sha, stamp, baseUrl, results }, null, 2));
    console.log(JSON.stringify(results));
})().catch((err) => { console.error(err); process.exit(1); });

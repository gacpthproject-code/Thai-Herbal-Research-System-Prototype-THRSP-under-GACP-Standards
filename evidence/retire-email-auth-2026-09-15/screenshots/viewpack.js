// View-pack for retire-email-auth review round (HARNESS.md §4.4).
// Drives a LOCAL frontend container (no backend, no real account): the login
// POST is answered by a Playwright route with an MFA challenge, and the /health
// gate is passed with an unsigned role-only cookie (middleware decodes the role,
// the backend is the one that verifies signatures — and there is no backend here).
//
// usage: node viewpack.js <baseUrl> <label> <sha12> <outDir>
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const [baseUrl, label, sha, outDir] = process.argv.slice(2);
if (!baseUrl || !label || !sha || !outDir) {
    console.error('usage: node viewpack.js <baseUrl> <label> <sha12> <outDir>');
    process.exit(2);
}
fs.mkdirSync(path.join(outDir, 'trace'), { recursive: true });
const stamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const fakeToken = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ role: 'HEALTH', canonicalRole: 'HEALTH', exp: Math.floor(Date.now() / 1000) + 3600 })}.view-pack`;

async function label_(page, step) {
    await page.evaluate(([text]) => {
        const el = document.createElement('div');
        el.textContent = text;
        el.setAttribute('style', 'position:fixed;right:8px;bottom:8px;z-index:2147483647;font:11px/1.4 monospace;background:#111;color:#fff;padding:3px 6px;border-radius:4px;opacity:.85');
        document.body.appendChild(el);
    }, [`view-pack · ${label} · build ${sha} · ${stamp} · ${step}`]);
}

async function shot(page, name, step) {
    await label_(page, step);
    const file = path.join(outDir, `${label}-${name}-${sha}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`saved ${file}`);
}

(async () => {
    const browser = await chromium.launch();
    const results = [];
    try {
        // ── Scene 1: health login → MFA challenge (mocked login reply) ──
        {
            const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'th-TH' });
            await context.tracing.start({ screenshots: true, snapshots: true });
            const page = await context.newPage();
            const seen = [];
            await page.route('**/*', async (route) => {
                const req = route.request();
                if (req.method() === 'POST' && /\/auth\/health\/login(\?|$)/.test(new URL(req.url()).pathname)) {
                    seen.push(req.url());
                    return route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({ success: true, data: { mfa_required: true, mfa_session: 'view-pack.challenge' } }),
                    });
                }
                return route.continue();
            });
            await page.goto(`${baseUrl}/auth/health/login`, { waitUntil: 'networkidle' });
            await page.fill('#identifier', '1101700207030');
            await page.fill('#password', 'ViewPack-Only-1');
            await page.click('button[type="submit"]');
            await page.waitForSelector('#mfa-code', { timeout: 15000 });
            await page.fill('#mfa-code', '123456');
            const text = await page.locator('body').innerText();
            results.push({ scene: 'mfa-challenge', loginPostIntercepted: seen.length, mentionsEmailOtp: /Email OTP|อีเมล/.test(text), mentionsAuthenticator: /authenticator/.test(text) });
            await shot(page, '01-mfa-challenge', 'login POST mocked → mfa_required; typed 123456');
            await context.tracing.stop({ path: path.join(outDir, 'trace', `${label}-01-mfa-challenge-${sha}.zip`) });
            await context.close();
        }

        // ── Scene 2: /health/profile/security (role-only cookie, no API needed) ──
        {
            const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'th-TH' });
            await context.addCookies([{ name: 'auth_token', value: fakeToken, url: baseUrl }]);
            await context.addInitScript(() => {
                try {
                    localStorage.setItem('user', JSON.stringify({ id: 'view-pack', role: 'HEALTH', firstName: 'ตัวอย่าง', lastName: 'หน้าจอ' }));
                } catch { /* storage unavailable */ }
            });
            await context.tracing.start({ screenshots: true, snapshots: true });
            const page = await context.newPage();
            await page.goto(`${baseUrl}/health/profile/security`, { waitUntil: 'networkidle' });
            await page.waitForSelector('text=ความปลอดภัยของบัญชี', { timeout: 15000 });
            const text = await page.locator('main, body').first().innerText();
            results.push({
                scene: 'health-security',
                url: page.url(),
                promisesSessionRevokeOnRelogin: text.includes('ยกเลิกการเข้าสู่ระบบเดิม'),
                saysNoPassword: text.includes('ไม่มีรหัสผ่าน'),
                saysContactStaff: text.includes('ติดต่อเจ้าหน้าที่'),
            });
            await shot(page, '02-health-security', 'role-only cookie; page makes no API call');
            await context.tracing.stop({ path: path.join(outDir, 'trace', `${label}-02-health-security-${sha}.zip`) });
            await context.close();
        }
    } finally {
        await browser.close();
    }
    fs.writeFileSync(path.join(outDir, `${label}-checks-${sha}.json`), JSON.stringify({ label, sha, stamp, baseUrl, results }, null, 2));
    console.log(JSON.stringify(results));
})().catch((err) => { console.error(err); process.exit(1); });

'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('/home/ubuntu/work/GACP-Certification-Application/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');

const [BASE, FIXTURE, OUT] = process.argv.slice(2);
const fx = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
fs.mkdirSync(OUT, { recursive: true });
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
const log = (m) => console.log(`[walk] ${new Date().toISOString()} ${m}`);
const CONTEXT = { viewport: { width: 1280, height: 900 }, locale: 'th-TH', timezoneId: 'Asia/Bangkok', colorScheme: 'light' };

(async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const admin = await (await browser.newContext(CONTEXT)).newPage();
        await admin.goto(`${BASE}/auth/provider/login`, { waitUntil: 'networkidle', timeout: 180000 });
        await admin.fill('#provider-id', fx.adminProviderId);
        await admin.fill('#provider-password', fx.password);
        await Promise.all([
            admin.waitForURL((u) => !/auth\/provider\/login/.test(u.toString()), { timeout: 180000 }),
            admin.click('button[type="submit"]'),
        ]);
        log(`admin signed in -> ${admin.url()}`);
        await admin.goto(`${BASE}/admin/applications/${fx.applicationId}/force-status`, { waitUntil: 'networkidle', timeout: 180000 });
        await admin.getByRole('button', { name: 'เปิดการเปลี่ยนสถานะ' }).first().click();
        await admin.locator('#force-status-new').selectOption('CANCELLED');
        const reasons = await admin.locator('#force-status-closure-reason option').evaluateAll((os) => os.map((o) => `${o.value}=${o.textContent.trim()}`));
        log(`closure reasons offered: ${JSON.stringify(reasons)}`);
        await admin.locator('#force-status-closure-reason').selectOption('PURPOSE_NOT_IN_SCOPE');
        await admin.locator('#force-status-reason-code').selectOption({ index: 1 });
        await admin.locator('#force-status-reason').fill('ข้อมูลทดสอบ ยื่นด้วยวัตถุประสงค์ MEDICAL ที่ถอดแล้ว');
        await admin.locator('#force-status-confirm').fill(fx.applicationId);
        await shot(admin, '01-admin-close-dialog-purpose-not-in-scope');
        const sent = admin.waitForResponse((r) => /force-status$/.test(r.url()) && r.request().method() === 'POST', { timeout: 180000 });
        await admin.getByTestId('force-status-submit').click();
        const res = await sent;
        const body = await res.json().catch(() => ({}));
        log(`force-status -> ${res.status()} ${JSON.stringify({ success: body.success, code: body.code, status: body.data?.status })}`);
        await admin.waitForTimeout(2000);
        await shot(admin, '02-admin-after-close');

        const health = await (await browser.newContext(CONTEXT)).newPage();
        await health.goto(`${BASE}/auth/health/login`, { waitUntil: 'networkidle', timeout: 180000 });
        await health.locator('#identifier').pressSequentially(fx.healthId);
        await health.locator('#password').pressSequentially(fx.password);
        await health.locator('form button[type="submit"]').click();
        const left = await health.waitForURL((u) => !String(u).includes('/auth/'), { timeout: 90000 }).then(() => true, () => false);
        log(`applicant signed in: ${left} -> ${health.url()}`);
        await health.goto(`${BASE}/health/notifications`, { waitUntil: 'networkidle', timeout: 180000 });
        await health.getByText('คำขอของคุณถูกยกเลิก').first().waitFor({ state: 'visible', timeout: 120000 }).catch(() => log('notice title not visible'));
        await shot(health, '03-applicant-notification');
    } finally {
        await browser.close();
    }
})().catch((e) => { log(`FAILED ${e.stack || e.message}`); process.exit(1); });

'use strict';
// Dialogs are opened and cancelled: the walk's decisions are made by walk.js.
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const DIR = '/home/ubuntu/work/state/reviews/appeal-u2-takeover';
const WEB = process.env.WEB_BASE || 'http://localhost:3192';
const fx = JSON.parse(fs.readFileSync(path.join(DIR, 'walk/fixture.json'), 'utf8'));
const env = (k) => { const v = process.env[k]; if (!v) { throw new Error(`missing ${k}`); } return v; };
const SIZES = [{ width: 390, height: 844 }, { width: 1440, height: 900 }];
const OUT = path.join(DIR, 'shots');
const CONSIDERATION = 'ข้อบกพร่องทั้งสองข้อกระทบการควบคุมผลผลิตโดยตรง และแก้ไขในระยะสั้นไม่ได้';

async function shot(page, name, size) {
    await page.waitForTimeout(600);
    const file = path.join(OUT, `${name}-${size.width}x${size.height}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log('shot', path.basename(file));
}

async function loginStaff(page) {
    await page.goto(`${WEB}/auth/provider/login`, { waitUntil: 'networkidle', timeout: 180000 });
    await page.locator('#provider-id').pressSequentially(env('WALK_APPROVER_PID'));
    await page.locator('#provider-password').pressSequentially(env('WALK_APPROVER_PW'));
    await Promise.all([page.waitForURL((u) => !String(u).includes('/auth/'), { timeout: 180000 }), page.locator('form button[type="submit"]').click()]);
}

async function loginApplicant(page) {
    await page.goto(`${WEB}/auth/health/login`, { waitUntil: 'networkidle', timeout: 180000 });
    await page.locator('#identifier').pressSequentially(env('WALK_APPLICANT_HID'));
    await page.locator('#password').pressSequentially(env('WALK_APPLICANT_PW'));
    await page.locator('form button[type="submit"]').click();
    const left = await page.waitForURL((u) => !String(u).includes('/auth/'), { timeout: 90000 }).then(() => true, () => false);
    if (left) { return; }
    const alerts = await page.locator('[role="alert"]').allTextContents();
    console.log('applicant form login stayed on the login page; alerts:', JSON.stringify(alerts).replace(/\d{13}/g, 'X'));
    const res = await page.request.post(`${WEB}/api/auth/health/login`, { data: { identifier: env('WALK_APPLICANT_HID'), password: env('WALK_APPLICANT_PW') } });
    console.log('applicant login through the web proxy door:', res.status());
}

const visit = async (page, url, ready) => {
    await page.goto(`${WEB}${url}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForSelector(ready, { timeout: 180000 });
};

(async () => {
    const browser = await chromium.launch();
    try {
        for (const size of SIZES) {
            const staff = await browser.newContext({ viewport: size, locale: 'th-TH' });
            const page = await staff.newPage();
            await loginStaff(page);
            await visit(page, '/provider/certification-decisions', '[data-testid="final-approval-inspection-result"]');
            await shot(page, '01-approver-queue-shows-the-inspection-result', size);

            await visit(page, `/provider/certification-decisions/${fx.checks.id}`, '[data-testid="decision-file-inspection-result"]');
            await page.waitForSelector('[data-testid="decision-actions"]', { timeout: 180000 });
            await shot(page, '02-file-that-did-not-pass-opens-with-the-result-and-two-decisions', size);

            await page.getByRole('button', { name: 'ไม่ให้การรับรอง', exact: true }).click();
            await page.locator('input[value="CRITICAL_NONCONFORMITY"]').check();
            await page.locator('textarea[data-field="consideration"]').fill(CONSIDERATION);
            await shot(page, '03-refusal-dialog-asks-the-consideration-the-applicant-reads', size);
            await page.getByRole('button', { name: 'ยกเลิก', exact: true }).click();

            await page.getByRole('button', { name: 'ส่งกลับให้แก้ไขข้อบกพร่อง', exact: true }).click();
            await page.waitForSelector('input[type="checkbox"][name="finding"]');
            await shot(page, '04-correction-dialog-lists-the-findings-all-ticked', size);
            await page.getByRole('button', { name: 'ยกเลิก', exact: true }).click();

            await visit(page, `/provider/certification-decisions/${fx.refusal.id}`, '[data-testid="decision-outcome"]');
            await shot(page, '05-refused-file-shows-the-outcome-and-the-consideration', size);

            await visit(page, `/provider/certification-decisions/${fx.passed.id}`, '[data-testid="decision-actions"]');
            await shot(page, '06-passed-file-keeps-approve-refuse-return', size);

            await visit(page, '/provider/work', 'main');
            await page.waitForTimeout(2500);
            await shot(page, '07-approver-work-queue-decision-task-label', size);
            await staff.close();

            const member = await browser.newContext({ viewport: size, locale: 'th-TH' });
            const ap = await member.newPage();
            await loginApplicant(ap);
            await visit(ap, `/health/applications/${fx.refusal.id}`, '[data-testid="not-certified-card"]');
            await shot(ap, '08-applicant-page-of-a-refused-application', size);
            await visit(ap, '/health/notifications', 'main');
            await ap.waitForTimeout(2500);
            await shot(ap, '09-applicant-notifications-hold-the-official-letter', size);
            await member.close();
        }
    } finally {
        await browser.close();
    }
})().catch((e) => { console.error('shots failed:', e.message); process.exit(1); });

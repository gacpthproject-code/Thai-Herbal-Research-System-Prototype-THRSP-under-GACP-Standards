'use strict';
// node walk.js <phase> <label> — the approver's decision file and the applicant's new planting form.
const fs = require('fs');
const path = require('path');
const { chromium } = require('/home/ubuntu/work/GACP-Certification-Application/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');

const R = '/home/ubuntu/work/state/reviews/launch-guards-1-runs';
const [phase, label] = process.argv.slice(2);
const OUT = path.join(R, phase);
const SHOTS = path.join(OUT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const WEB = `http://127.0.0.1:${process.env.WPORT}`;
const fx = JSON.parse(fs.readFileSync(path.join(OUT, 'fixtures.json'), 'utf8'));
const creds = JSON.parse(fs.readFileSync(path.join(OUT, 'creds.json'), 'utf8'));
const VIEW = { desk: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };
const record = (row) => fs.appendFileSync(path.join(OUT, 'observed.jsonl'), JSON.stringify({ at: new Date().toISOString(), label, ...row }) + '\n');

async function open(browser, role, view) {
  const ctx = await browser.newContext({
    viewport: VIEW[view], colorScheme: 'light', locale: 'th-TH', timezoneId: 'Asia/Bangkok',
    ...(view === 'phone' ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);
  const c = creds[role];
  if (role === 'applicant') {
    await page.goto(`${WEB}/auth/health/login`, { waitUntil: 'networkidle', timeout: 240000 });
    await page.fill('#identifier', c.login);
    await page.fill('#password', c.password);
    await Promise.all([page.waitForURL((u) => !/auth\/health\/login/.test(u.toString()), { timeout: 180000 }), page.locator('button[type=submit]').first().click()]);
  } else {
    await page.goto(`${WEB}/auth/provider/login`, { waitUntil: 'networkidle', timeout: 240000 });
    await page.fill('#provider-id', c.login);
    await page.fill('#provider-password', c.password);
    await Promise.all([page.waitForURL((u) => !/auth\/provider\/login/.test(u.toString()), { timeout: 180000 }), page.click('button[type=submit]')]);
  }
  return { ctx, page };
}

async function shot(page, name) {
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const view of ['desk', 'phone']) {
      const approver = await open(browser, 'approver', view);
      await approver.page.goto(`${WEB}/provider/certification-decisions/${fx.decide.id}`, { waitUntil: 'networkidle', timeout: 240000 });
      const section = approver.page.locator('[data-testid="decision-actions"]');
      await section.waitFor({ timeout: 180000 });
      const refuse = section.getByRole('button', { name: 'ไม่ให้การรับรอง', exact: true });
      const hold = approver.page.locator('[data-testid="refusal-hold"]');
      record({
        view, screen: 'decision-file', refuseDisabled: await refuse.isDisabled(),
        hold: (await hold.count()) ? await hold.innerText() : null,
        buttons: await section.locator('button').allInnerTexts(),
      });
      await section.scrollIntoViewIfNeeded();
      await shot(approver.page, `${label}-approver-decision-${view}`);
      if (!(await refuse.isDisabled())) {
        await refuse.click();
        await approver.page.waitForTimeout(1500);
        record({ view, screen: 'decision-file-after-refuse-click', dialogOpen: (await approver.page.getByRole('dialog').count()) > 0 });
        await shot(approver.page, `${label}-approver-refuse-clicked-${view}`);
      }
      await approver.ctx.close();

      if (label === 'appeal-set') { continue; }
      const applicant = await open(browser, 'applicant', view);
      await applicant.page.goto(`${WEB}/health/planting/new`, { waitUntil: 'networkidle', timeout: 240000 });
      const cropLabel = applicant.page.locator('label', { hasText: 'ชนิดพืช' }).first();
      await cropLabel.waitFor({ timeout: 180000 });
      await applicant.page.waitForTimeout(3000);
      const forId = await cropLabel.getAttribute('for');
      const trigger = applicant.page.locator(`[id="${forId}"]`);
      record({
        view, screen: 'planting-new', crop: (await trigger.innerText()).trim(),
        cropBlocker: (await applicant.page.locator('text=ยังไม่ได้เลือกชนิดพืช').count()) > 0,
      });
      await trigger.scrollIntoViewIfNeeded();
      await shot(applicant.page, `${label}-applicant-planting-new-${view}`);
      await applicant.ctx.close();
    }
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('WALK ERR', e.message); process.exit(1); });

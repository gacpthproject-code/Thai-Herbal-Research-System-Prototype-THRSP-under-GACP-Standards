// View-pack capture for fix/no-recovery. Local next dev only; every /api/** call is
// answered by page.route fixtures (no backend, no DB). Middleware only decodes the
// JWT payload (unverified), so an unsigned local cookie selects the role.
// usage: node norec-shoot.cjs <label> <outdir>
const { chromium } = require('/home/ubuntu/work/wt-norec/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3107';
const [label, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const fakeJwt = (role) => `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'u-local', role, canonicalRole: role, exp: 4102444800 })}.x`;

const HEALTH_USER = { id: 'u-local', firstName: 'ทดสอบ', lastName: 'ผู้ขอ', role: 'health', canonicalRole: 'health', email: '' };
const ADMIN_USER = { id: 'admin-1', firstName: 'ผู้ดูแล', lastName: 'ระบบ', role: 'system_admin_dtam', canonicalRole: 'system_admin_dtam' };
const OFFICER = {
  id: 'staff-1', username: 'somchai', firstName: 'สมชาย', lastName: 'ใจดี', email: 'somchai@example.test',
  role: 'document_reviewer', isActive: true, createdAt: '2026-09-01T00:00:00.000Z', lastLoginAt: null,
  loginAttempts: 5, isLocked: true, lockedUntil: '2026-09-17T10:00:00.000Z', twoFactorEnabled: true,
};

async function routeApi(page, who) {
  const seen = [];
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    seen.push(`${route.request().method()} ${url.pathname}`);
    const p = url.pathname;
    let body = { success: true, data: null };
    if (/\/auth\/provider\/me$/.test(p)) body = { success: true, data: ADMIN_USER, user: ADMIN_USER };
    else if (/\/auth\/(health\/)?me$/.test(p)) body = { success: true, data: HEALTH_USER, user: HEALTH_USER };
    else if (/\/provider\/directory$/.test(p)) body = { success: true, data: [OFFICER] };
    else if (/notifications/.test(p)) body = { success: true, data: [] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return seen;
}

async function shoot(browser, { name, url, role, viewport, after }) {
  const ctx = await browser.newContext({ viewport, locale: 'th-TH' });
  await ctx.addCookies([{ name: role === 'health' ? 'auth_token' : 'provider_token', value: fakeJwt(role), url: BASE }]);
  const page = await ctx.newPage();
  const seen = await routeApi(page, role);
  await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 180000 });
  await page.waitForTimeout(1500);
  if (after) await after(page);
  const file = path.join(outDir, `${label}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  const text = await page.evaluate(() => document.body.innerText);
  fs.writeFileSync(path.join(outDir, `${label}-${name}.txt`), `URL: ${page.url()}\nAPI calls: ${JSON.stringify(seen)}\n\n${text}`);
  await ctx.close();
  return file;
}

(async () => {
  const browser = await chromium.launch();
  const mobile = { width: 390, height: 844 };
  const desk = { width: 1440, height: 900 };
  await shoot(browser, { name: '01-health-security', url: '/health/profile/security', role: 'health', viewport: mobile });
  await shoot(browser, { name: '02-health-privacy', url: '/health/profile/privacy', role: 'health', viewport: mobile });
  await shoot(browser, { name: '03-provider-management', url: '/provider/management', role: 'system_admin_dtam', viewport: desk });
  // action icons in the officer row, with their aria-labels
  await shoot(browser, {
    name: '04-provider-row-actions', url: '/provider/management', role: 'system_admin_dtam', viewport: desk,
    after: async (page) => {
      const labels = await page.$$eval('[aria-label]', (els) => els.map((e) => e.getAttribute('aria-label')));
      fs.writeFileSync(path.join(outDir, `${label}-04-aria-labels.txt`), labels.join('\n'));
      const row = page.locator('tr', { hasText: 'สมชาย' }).first();
      if (await row.count()) await row.scrollIntoViewIfNeeded();
    },
  });
  await shoot(browser, {
    name: '05-provider-reset-button-pressed', url: '/provider/management', role: 'system_admin_dtam', viewport: desk,
    after: async (page) => {
      const btn = page.locator('[aria-label^="Force password reset"]');
      const n = await btn.count();
      fs.writeFileSync(path.join(outDir, `${label}-05-note.txt`), n ? 'reset button present: pressed it, dialog below' : 'no reset button on the row: nothing to press');
      if (n) { await btn.first().click(); await page.waitForTimeout(800); }
    },
  });
  await shoot(browser, {
    name: '06-provider-edit-dialog', url: '/provider/management', role: 'system_admin_dtam', viewport: desk,
    after: async (page) => {
      await page.locator('[aria-label^="แก้ไขพนักงาน"]').first().click();
      await page.waitForTimeout(800);
    },
  });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

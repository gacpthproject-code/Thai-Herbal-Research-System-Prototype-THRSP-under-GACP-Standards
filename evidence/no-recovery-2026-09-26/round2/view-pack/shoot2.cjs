// View-pack round 2 (staff password doors). Local next dev only; every /api/** call
// is answered by page.route fixtures (no backend, no DB). The middleware only decodes
// the JWT payload (unverified), so an unsigned local cookie selects the role.
// usage: node shoot2.cjs <label> <outdir>
const { chromium } = require('/home/ubuntu/work/wt-norec/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3107';
const [label, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const fakeJwt = (role) => `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'admin-1', role, canonicalRole: role, exp: 4102444800 })}.x`;

const ADMIN_USER = { id: 'admin-1', firstName: 'ผู้ดูแล', lastName: 'ระบบ', role: 'system_admin_dtam', canonicalRole: 'system_admin_dtam' };
const OFFICER = {
  id: 'staff-1', username: 'somchai', firstName: 'สมชาย', lastName: 'ใจดี', email: 'somchai@example.test',
  role: 'document_reviewer', isActive: true, createdAt: '2026-09-01T00:00:00.000Z', lastLoginAt: null,
  loginAttempts: 0, isLocked: false, lockedUntil: null, twoFactorEnabled: false,
};

async function routeApi(page, log) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const entry = { method: req.method(), path: p };
    let status = 200;
    let body = { success: true, data: null };
    if (/\/auth\/provider\/me$/.test(p)) body = { success: true, data: ADMIN_USER, user: ADMIN_USER };
    else if (/\/provider\/directory$/.test(p)) body = { success: true, data: [OFFICER] };
    else if (/\/mfa\/status$/.test(p)) body = { success: true, data: { enabled: false } };
    else if (/\/provider\/directory\/staff-1$/.test(p) && req.method() === 'PUT') {
      entry.body = JSON.parse(req.postData() || '{}');
      body = { success: true, data: OFFICER };
    } else if (/\/auth\/provider\/change-password$/.test(p)) {
      entry.body = Object.keys(JSON.parse(req.postData() || '{}')); // field names only, never values
      status = 400;
      body = { success: false, code: 'INVALID_CREDENTIALS', error: 'รหัสผ่านเดิมไม่ถูกต้อง' };
    } else if (/notifications/.test(p)) body = { success: true, data: [] };
    log.push(entry);
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

async function shoot(browser, { name, url, viewport, after }) {
  const ctx = await browser.newContext({ viewport, locale: 'th-TH' });
  await ctx.addCookies([{ name: 'provider_token', value: fakeJwt('system_admin_dtam'), url: BASE }]);
  const page = await ctx.newPage();
  const log = [];
  await routeApi(page, log);
  await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 180000 });
  await page.waitForTimeout(1500);
  if (after) await after(page);
  await page.screenshot({ path: path.join(outDir, `${label}-${name}.png`), fullPage: true });
  const text = await page.evaluate(() => document.body.innerText);
  fs.writeFileSync(path.join(outDir, `${label}-${name}.txt`), `URL: ${page.url()}\nAPI calls: ${JSON.stringify(log.filter((e) => !/webapp-version|system-config|notifications/.test(e.path)))}\n\n${text}`);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  const desk = { width: 1440, height: 900 };
  const mobile = { width: 390, height: 844 };
  // edit dialog opened for an officer, then saved: the PUT body is logged
  await shoot(browser, {
    name: '11-edit-dialog', url: '/provider/management', viewport: desk,
    after: async (page) => {
      await page.locator('[aria-label^="แก้ไขพนักงาน"]').first().click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(outDir, `${label}-11-edit-dialog-open.png`), fullPage: false });
      await page.getByRole('button', { name: 'บันทึก' }).click();
      await page.waitForTimeout(1000);
    },
  });
  // create dialog: the initial password field stays
  await shoot(browser, {
    name: '12-create-dialog', url: '/provider/management', viewport: desk,
    after: async (page) => {
      await page.getByRole('button', { name: 'เพิ่มพนักงาน' }).click();
      await page.waitForTimeout(800);
      await page.locator('input').filter({ hasText: '' }).last().focus().catch(() => {});
    },
  });
  // staff security page
  await shoot(browser, { name: '13-staff-security', url: '/provider/profile/security', viewport: desk });
  await shoot(browser, { name: '14-staff-security-mobile', url: '/provider/profile/security', viewport: mobile });
  // mismatch refused before the network, then a wrong current password answered by the (fixture) backend
  const card = '[data-testid="change-own-password"]';
  await shoot(browser, {
    name: '15-staff-change-mismatch', url: '/provider/profile/security', viewport: desk,
    after: async (page) => {
      if (!(await page.locator(card).count())) { fs.writeFileSync(path.join(outDir, `${label}-15-note.txt`), 'no change-password card on this page'); return; }
      await page.fill(`${card} input[name="currentPassword"]`, 'OldStaff#Pass2026');
      await page.fill(`${card} input[name="newPassword"]`, 'NewStaff#Pass2027');
      await page.fill(`${card} input[name="confirmPassword"]`, 'NewStaff#Pass2028');
      await page.locator(`${card} button[type="submit"]`).click();
      await page.waitForTimeout(600);
      await page.locator(card).scrollIntoViewIfNeeded();
    },
  });
  await shoot(browser, {
    name: '16-staff-change-wrong-current', url: '/provider/profile/security', viewport: desk,
    after: async (page) => {
      if (!(await page.locator(card).count())) { fs.writeFileSync(path.join(outDir, `${label}-16-note.txt`), 'no change-password card on this page'); return; }
      await page.fill(`${card} input[name="currentPassword"]`, 'Wrong#Pass2026');
      await page.fill(`${card} input[name="newPassword"]`, 'NewStaff#Pass2027');
      await page.fill(`${card} input[name="confirmPassword"]`, 'NewStaff#Pass2027');
      await page.locator(`${card} button[type="submit"]`).click();
      await page.waitForTimeout(1000);
    },
  });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

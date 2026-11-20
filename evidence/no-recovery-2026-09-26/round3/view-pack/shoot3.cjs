// View-pack round 3 (2FA doors). Local next dev only; every /api/** call is answered
// by page.route fixtures (no backend, no DB). The middleware only decodes the JWT
// payload (unverified), so an unsigned local cookie selects the role.
// usage: node shoot3.cjs <label> <outdir>
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
  loginAttempts: 5, isLocked: true, lockedUntil: '2026-09-26T10:00:00.000Z', twoFactorEnabled: true,
};
const FARMER_ROW = {
  id: 'farmer-1', email: 'farmer@example.test', firstName: 'ชาวไร่', lastName: 'ทดสอบ', role: 'health', status: 'ACTIVE',
  accountType: 'INDIVIDUAL', authType: 'HEALTH_ID', providerId: null, healthId: 'MASKED',
  createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', lastLoginAt: null,
};

async function routeApi(page, log) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    let body = { success: true, data: null };
    if (/\/auth\/provider\/me$/.test(p)) body = { success: true, data: ADMIN_USER, user: ADMIN_USER };
    else if (/\/provider\/directory$/.test(p)) body = { success: true, data: [OFFICER] };
    else if (/\/admin\/users$/.test(p)) body = { success: true, data: { users: [FARMER_ROW, { ...FARMER_ROW, id: 'staff-1', email: 'somchai@example.test', firstName: 'สมชาย', lastName: 'ใจดี', role: 'document_reviewer', accountType: 'PROVIDER', authType: 'PROVIDER_ID', providerId: 'MASKED', healthId: null }], pagination: { total: 2, page: 1, limit: 100 } } };
    else if (/notifications/.test(p)) body = { success: true, data: [] };
    if (!/webapp-version|system-config|notifications/.test(p)) log.push(`${req.method()} ${p}`);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
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
  let extra = '';
  if (after) extra = (await after(page)) || '';
  await page.screenshot({ path: path.join(outDir, `${label}-${name}.png`), fullPage: true });
  const text = await page.evaluate(() => document.body.innerText);
  fs.writeFileSync(path.join(outDir, `${label}-${name}.txt`), `URL: ${page.url()}\nAPI calls: ${JSON.stringify(log)}\n${extra}\n\n${text}`);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  const desk = { width: 1440, height: 900 };
  await shoot(browser, {
    name: '21-admin-users-row-menu', url: '/admin/users', viewport: desk,
    after: async (page) => {
      const summary = page.locator('details summary').first();
      if (await summary.count()) { await summary.click(); await page.waitForTimeout(500); }
      const items = await page.$$eval('[role="menuitem"]', (els) => els.map((e) => (e.textContent || '').trim()));
      return `row menu items (first row): ${JSON.stringify(items)}`;
    },
  });
  await shoot(browser, {
    name: '22-provider-management-row', url: '/provider/management', viewport: desk,
    after: async (page) => {
      const labels = await page.$$eval('button[aria-label]', (els) => els.map((e) => e.getAttribute('aria-label')).filter((l) => /สมชาย/.test(l || '')));
      return `row action labels: ${JSON.stringify(labels)}`;
    },
  });
  // Same menu with the table's overflow clipping lifted by an injected style, for
  // the photo only: the row menu hangs below the table and the page clips it.
  await shoot(browser, {
    name: '23-admin-users-row-menu-unclipped', url: '/admin/users', viewport: desk,
    after: async (page) => {
      await page.addStyleTag({ content: '* { overflow: visible !important; }' });
      const summary = page.locator('details summary').first();
      if (await summary.count()) { await summary.click(); await page.waitForTimeout(500); }
      return 'NOTE: injected style `* { overflow: visible !important }` for this photo only';
    },
  });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

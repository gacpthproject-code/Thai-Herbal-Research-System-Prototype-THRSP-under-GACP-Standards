// View-pack capture for the truthful-copy port. Usage: node viewpack.js <label> <outdir>
// Real Chromium against local `next dev` on :3117. Health pages get the same
// unsigned health-role cookie e2e/checkout-visual.spec.ts uses; /api/** calls of
// the payments list are answered by page.route fixtures (no backend in this run).
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3117';
const [, , label, outDir] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const log = [];
const note = (s) => { log.push(s); console.log(s); };

function healthCookie() {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return { name: 'auth_token', value: `${b({ alg: 'none', typ: 'JWT' })}.${b({ role: 'health' })}.e2e`, domain: 'localhost', path: '/' };
}

const invoice = {
  id: 'inv-co-m1-open', invoiceNumber: 'INV-CO-D810DEBF-M1', applicationId: 'APP-1',
  totalAmount: '5885.00', status: 'PENDING', serviceType: 'CERTIFICATION_CHECKOUT_M1',
  createdAt: '2026-09-26T03:00:00.000Z', lineItems: [],
};
const quotation = {
  dtam: null,
  platform: {
    id: 'qt-1', applicationId: 'APP-1', issuerType: 'PLATFORM', quotationNumber: 'QT-PRD-2026-000001',
    subtotal: '33000.00', vat: '2310.00', totalAmount: '35310.00', status: 'ACCEPTED',
    createdAt: '2026-09-25T00:00:00.000Z', lineItems: [],
  },
};

async function mockApi(page) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    let data = [];
    if (p === '/api/invoices/my') data = [invoice];
    else if (/^\/api\/applications\/[^/]+\/quotations$/.test(p)) data = quotation;
    else if (p === '/api/applications/my') data = [{ id: 'APP-1', status: 'PENDING_DOC_FEE' }];
    else if (p === '/api/consent') data = {};
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });
}

async function shot(page, name, opts = {}) {
  // next dev's error overlay (a dev-only console.error badge) is hidden so it does
  // not cover the page; console errors are written to the text log instead.
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {});
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: opts.fullPage !== false });
  note(`${name}.png`);
}

async function text(page, sel) {
  return (await page.locator(sel).first().innerText().catch(() => '<not found>')).replace(/\s+/g, ' ').trim();
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'th-TH' });
  await ctx.addCookies([healthCookie()]);
  // AuthService.getUser() reads localStorage 'user' (auth-service-session.ts).
  await ctx.addInitScript(() => {
    try { localStorage.setItem('user', JSON.stringify({ id: 'user-1', role: 'HEALTH', healthId: 'user-1', firstName: 'ทดสอบ', lastName: 'ภาพ' })); } catch (e) {}
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') note(`console.error: ${m.text().slice(0, 200)}`); });
  await mockApi(page);

  // Marketing: pricing, terms, FAQ, footer
  for (const [name, url] of [['pricing', '/pricing'], ['terms', '/terms-of-service'], ['faq', '/help/faq']]) {
    await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 180000 });
    await shot(page, `${label}-${name}`);
    note(`${name} body text (excerpt): ${(await text(page, 'body')).slice(0, 4000)}`);
  }
  // FAQ: open the payment topic items if the accordion hides them
  await page.goto(BASE + '/help/faq', { waitUntil: 'networkidle', timeout: 180000 });
  const qs = ['ค่าธรรมเนียมชำระให้ใคร?', 'ชำระเงินได้ช่องทางใดบ้าง?', 'ค่าธรรมเนียมต่อ scope คือเท่าไหร่?', 'ขอคืนเงินได้หรือไม่?', 'ใบรับรองมีอายุนานแค่ไหน?', 'การต่ออายุยุ่งยากเหมือนสมัครใหม่ไหม?',
              'ค่าธรรมเนียมรัฐ 5,000 บาท ทำไมต้องจ่ายเข้ากรมบัญชีกลาง?', 'ระบบรับชำระผ่าน PromptPay หรือไม่?'];
  for (const q of qs) {
    const el = page.getByText(q, { exact: true }).first();
    if (await el.count()) { await el.click().catch(() => {}); note(`faq opened: ${q}`); }
  }
  await page.waitForTimeout(500);
  await shot(page, `${label}-faq-payment-items-open`);
  note(`faq opened text: ${(await text(page, 'body')).slice(0, 6000)}`);

  // Footer on pricing
  await page.goto(BASE + '/pricing', { waitUntil: 'networkidle', timeout: 180000 });
  const footer = page.locator('footer').last();
  await footer.screenshot({ path: path.join(outDir, `${label}-footer.png`) }).catch((e) => note(`footer shot failed: ${e.message}`));
  note(`${label}-footer.png`);
  note(`footer text: ${(await footer.innerText().catch(() => '')).replace(/\s+/g, ' ')}`);

  // Onboarding modal: every step
  await page.goto(BASE + '/health/onboarding', { waitUntil: 'networkidle', timeout: 180000 });
  note(`onboarding url after load: ${page.url()}`);
  for (let i = 1; i <= 5; i += 1) {
    const dialog = page.locator('[role="dialog"]').first();
    const t = (await dialog.innerText().catch(() => '<no dialog>')).replace(/\s+/g, ' ');
    note(`onboarding step ${i}: ${t}`);
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {});
    await (await dialog.count() ? dialog : page).screenshot({ path: path.join(outDir, `${label}-onboarding-step${i}.png`) });
    note(`${label}-onboarding-step${i}.png`);
    const next = page.getByRole('button', { name: 'ถัดไป' });
    if (i < 5 && await next.count()) await next.first().click();
    await page.waitForTimeout(300);
  }

  // Payments list (API answered by fixtures)
  await page.goto(BASE + '/health/payments', { waitUntil: 'networkidle', timeout: 180000 });
  await page.waitForTimeout(1500);
  note(`payments url: ${page.url()}`);
  await shot(page, `${label}-payments-list`);
  note(`payments text: ${(await text(page, 'body')).slice(0, 4000)}`);

  // Checkout: idle, then created (mock happy)
  await page.goto(BASE + '/health/payments/checkout?app=APP-E2E-001&milestone=M1&mockScenario=happy', { waitUntil: 'networkidle', timeout: 180000 });
  await page.waitForTimeout(1000);
  await shot(page, `${label}-checkout-idle`);
  note(`checkout idle text: ${(await text(page, 'body')).slice(0, 3000)}`);
  const box = page.locator('[data-testid="checkout-terms-checkbox"]');
  if (await box.count()) await box.check().catch(() => {});
  const start = page.getByRole('button', { name: /เริ่ม/ });
  if (await start.count()) { await start.first().click(); await page.waitForTimeout(2000); }
  await shot(page, `${label}-checkout-created`);
  note(`checkout created text: ${(await text(page, 'body')).slice(0, 3000)}`);

  fs.writeFileSync(path.join(outDir, `${label}-rendered-text.txt`), log.join('\n') + '\n');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

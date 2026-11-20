// View-pack, payments-page half — INTERCEPTED render (no backend): real Chromium
// against `next start` of this branch's production build (NEXT_PUBLIC_PWA_ENABLED=false)
// on 127.0.0.1:3127. Every browser /api/** call is answered by page.route from the
// fixtures below; the answers for /invoices/my, /applications/my and the quotation
// door depend on the x-active-entity-id header the page actually sent, the way the
// backend on this branch answers them (proven separately on a real Postgres by
// apps/backend/__tests__/integration/applicant-billing-workspace-real-postgres.test.js).
// The receipt download is answered with receipt.pdf from this folder, which
// render-receipt-from-db.js produced through the real service path.
// Same auth technique as evidence/truthful-copy-port-2026-09-26/view-pack/viewpack.js.
// Usage (from apps/web-app): node ../../evidence/applicant-receipt/view-pack/viewpack-payments.js <outdir>
const fs = require('fs');
const path = require('path');
const { chromium } = require('module').createRequire(path.resolve(__dirname, '../../../apps/web-app/package.json'))('@playwright/test');

const BASE = 'http://127.0.0.1:3127';
const [, , outDir] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const log = [];
const note = (s) => { log.push(s); console.log(s); };

const PERSONAL = 'ent-personal-0001';
const COMPANY = 'ent-company-0002';
const APP_UUID = 'aa75ba6e-2f4c-4d7e-9a0e-5b1f7c3d2e10';
const APP_NUMBER = 'APP-2569-MUJZRHP3-69A796';

const ENTITIES = [
  { id: PERSONAL, type: 'INDIVIDUAL', displayName: 'ทดสอบ ภาพ', slug: 'personal', role: 'OWNER', membershipStatus: 'ACTIVE', isPersonal: true, organizationId: 'org-1', permissions: [] },
  { id: COMPANY, type: 'JURISTIC', displayName: 'บริษัท ทดสอบพร้อมเพย์สเตจจิ้ง จำกัด', slug: 'company', role: 'OWNER', membershipStatus: 'ACTIVE', isPersonal: false, organizationId: 'org-1', permissions: [] },
];
const PAID_INVOICE = {
  id: '92630e32-0000-4000-8000-000000000001', invoiceNumber: 'INV-CO-09246C23-M1', applicationId: APP_UUID,
  totalAmount: '5885.00', status: 'RECEIPT_ISSUED', erpStatus: 'RECEIPT_ISSUED',
  receiptNumber: 'TAX-PRD-2026-000002', receiptIssuedAt: '2026-09-29T08:14:45.000Z',
  createdAt: '2026-09-29T08:13:00.000Z', paidAt: '2026-09-29T08:14:45.000Z', serviceType: 'CERTIFICATION_CHECKOUT_M1',
  lineItems: [{ lineNumber: 1, description: 'ค่าบริการ GACP', quantity: 1, unitPrice: '5500.00', amount: '5500.00' }],
};
const QUOTATION = {
  dtam: null,
  platform: {
    id: 'qt-1', applicationId: APP_UUID, issuerType: 'PLATFORM', quotationNumber: 'QT-PRD-2026-000002',
    subtotal: '5500.00', vat: '385.00', totalAmount: '5885.00', status: 'INVOICED', phase1InvoicedAt: '2026-09-29T08:13:00.000Z',
    createdAt: '2026-09-29T08:10:00.000Z', lineItems: [],
  },
  applicationNumber: APP_NUMBER,
};

function healthCookie() {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return { name: 'auth_token', value: `${b({ alg: 'none', typ: 'JWT' })}.${b({ role: 'health', exp: Math.floor(Date.now() / 1000) + 3600 })}.viewpack`, domain: '127.0.0.1', path: '/' };
}

const requests = [];
async function mockApi(page) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const ws = req.headers()['x-active-entity-id'] || '(none)';
    requests.push({ path: p, workspace: ws });
    const company = ws === COMPANY;
    if (/^\/api\/invoices\/my\/[^/]+\/receipt\/pdf$/.test(p)) {
      await route.fulfill({ status: 200, contentType: 'application/pdf', headers: { 'content-disposition': 'attachment; filename="TAX-PRD-2026-000002.pdf"' }, body: fs.readFileSync(path.join(__dirname, 'receipt.pdf')) });
      return;
    }
    let status = 200;
    let data = [];
    if (p === '/api/entities/mine') data = ENTITIES;
    else if (p === '/api/invoices/my') data = company ? [PAID_INVOICE] : [];
    else if (p === '/api/applications/my') data = company ? [{ id: APP_UUID, applicationNumber: APP_NUMBER, status: 'DOC_FEE_PAID' }] : [];
    else if (/^\/api\/applications\/[^/]+\/quotations$/.test(p)) { if (company) data = QUOTATION; else status = 404; }
    else if (p === '/api/consent') data = {};
    else if (p.startsWith('/api/finance/issuers/')) data = null;
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status === 200 ? { success: true, data } : { success: false, error: 'Quotations not found' }) });
  });
}

async function shot(page, name, fullPage = true) {
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {});
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage });
  note(`shot ${name}.png`);
}
const mainText = async (page) => (await page.locator('main').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'th-TH', acceptDownloads: true });
  await ctx.addCookies([healthCookie()]);
  await ctx.addInitScript((company) => {
    try {
      localStorage.setItem('user', JSON.stringify({ id: 'user-1', role: 'HEALTH', healthId: 'user-1', firstName: 'ทดสอบ', lastName: 'ภาพ' }));
      if (!localStorage.getItem('gacp.activeEntityId')) localStorage.setItem('gacp.activeEntityId', company);
    } catch (e) { /* ignore */ }
  }, COMPANY);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') note(`console.error: ${m.text().slice(0, 200)}`); });
  await mockApi(page);

  // Scene 1 — company workspace, arriving by an ?applicationId= link (P5 + link param).
  await page.goto(`${BASE}/health/payments?applicationId=${APP_UUID}`, { waitUntil: 'networkidle', timeout: 240000 });
  await page.waitForTimeout(1200);
  await shot(page, '01-company-workspace-applicationId-link');
  const t1 = await mainText(page);
  note(`scene1 chip: ${(t1.match(/กรองตามคำขอ[^ ]*: ?\S+|กรองตามคำขอที่เลือก/) || ['<no chip>'])[0]}`);
  note(`scene1 UUID on page: ${t1.includes(APP_UUID)}`);

  // Scene 2 — the paid invoice's detail: receipt first, invoice still there (P1).
  await page.getByRole('button', { name: 'ดูรายละเอียด' }).first().click();
  await page.waitForTimeout(600);
  await shot(page, '02-detail-modal-paid-invoice', false);
  const dialogButtons = await page.$$eval('[role="dialog"] button', (els) => els.map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean));
  note(`scene2 dialog buttons: ${JSON.stringify(dialogButtons)}`);

  // Scene 3 — press the receipt button: which door, which file.
  const before = requests.length;
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.getByRole('button', { name: 'ดาวน์โหลดใบเสร็จรับเงิน/ใบกำกับภาษี' }).click(),
  ]);
  const saved = path.join(outDir, `downloaded-${download.suggestedFilename()}`);
  await download.saveAs(saved);
  note(`scene3 requests after press: ${JSON.stringify(requests.slice(before))}`);
  note(`scene3 downloaded file: ${path.basename(saved)} (${fs.statSync(saved).size} bytes, same bytes as receipt.pdf: ${fs.readFileSync(saved).equals(fs.readFileSync(path.join(__dirname, 'receipt.pdf')))})`);
  await page.keyboard.press('Escape');

  // Scene 4 — switch to the personal workspace on the page (P6).
  await page.goto(`${BASE}/health/payments`, { waitUntil: 'networkidle', timeout: 240000 });
  await page.waitForTimeout(1200);
  await shot(page, '03-company-workspace-no-param');
  const beforeSwitch = requests.length;
  await page.locator('button[aria-label*="กดเพื่อสลับ workspace"]').first().click();
  await page.waitForTimeout(300);
  await page.getByRole('menu').getByText('ทดสอบ ภาพ').first().click();
  await page.waitForTimeout(2000);
  await shot(page, '04-after-switch-to-personal-workspace');
  const afterSwitch = requests.slice(beforeSwitch).filter((r) => !r.path.startsWith('/api/entities'));
  note(`scene4 requests after switch: ${JSON.stringify(afterSwitch)}`);
  const t4 = await mainText(page);
  note(`scene4 company invoice still on screen: ${t4.includes('INV-CO-09246C23-M1')}`);
  note(`scene4 quotation asked for the company's application in the personal workspace: ${afterSwitch.some((r) => r.path.includes(APP_UUID))}`);

  await browser.close();
  fs.writeFileSync(path.join(outDir, 'viewpack-payments-log.txt'), log.join('\n') + '\n');
})().catch((e) => { console.error(e); process.exit(1); });

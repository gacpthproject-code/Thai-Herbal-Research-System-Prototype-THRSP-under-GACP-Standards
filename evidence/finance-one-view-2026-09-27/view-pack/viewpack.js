// View-pack: every accounting page + tab, rendered as finance_officer_dtam and as
// finance_officer_platform, side by side. Usage: node viewpack.js <outdir>
// Real Chromium against local `next dev` on :3121 (tree of fix/finance-one-view).
// Same technique as evidence/truthful-copy-port-2026-09-26/view-pack/viewpack.js:
// an unsigned provider_token cookie carries the role for the middleware, the
// localStorage 'user' carries it for useAuth(), and every /api/** call is answered
// by page.route with ONE fixture set — identical data for both roles, so any
// difference on screen comes from the page, not from the data.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3121';
const [, , outDir] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const log = [];
const note = (s) => { log.push(s); console.log(s); };

const ROLES = ['finance_officer_dtam', 'finance_officer_platform'];

function providerCookie(role) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return { name: 'provider_token', value: `${b({ alg: 'none', typ: 'JWT' })}.${b({ sub: `u-${role}`, role, exp })}.viewpack`, domain: 'localhost', path: '/' };
}

const INVOICES = [
  { id: 'inv-1', invoiceNumber: 'INV-2569-0001', applicationNumber: 'APP-2569-0001', totalAmount: 35310, status: 'PAID_PENDING_RECEIPT', serviceType: 'PHASE_1_PLATFORM_FEE', dueDate: '2026-09-20T00:00:00Z', paidAt: '2026-09-18T00:00:00Z', createdAt: '2026-09-10T00:00:00Z', applicant: { firstName: 'สมชาย', lastName: 'ใจดี' }, items: [] },
  { id: 'inv-2', invoiceNumber: 'INV-2569-0002', applicationNumber: 'APP-2569-0002', totalAmount: 12000, status: 'RECEIPT_ISSUED', erpStatus: 'RECEIPT_ISSUED', serviceType: 'PHASE_1_PLATFORM_FEE', dueDate: '2026-09-21T00:00:00Z', paidAt: '2026-09-19T00:00:00Z', createdAt: '2026-09-11T00:00:00Z', applicant: { companyName: 'บริษัท สมุนไพรไทย จำกัด' }, items: [] },
];
const RECEIPTS = [
  { id: 'r-1', invoiceNumber: 'INV-2569-0101', applicationNumber: 'APP-2569-0101', applicantName: 'สมชาย ใจดี', totalAmount: 35310, paidAt: '2026-09-18T00:00:00Z', serviceType: 'PHASE_1_PLATFORM_FEE' },
  { id: 'r-2', invoiceNumber: 'INV-2569-0102', applicationNumber: 'APP-2569-0102', applicantName: 'สมหญิง ใจงาม', totalAmount: 5000, paidAt: '2026-09-17T00:00:00Z', serviceType: 'PHASE_1_STATE_FEE' },
];

function apiData(p, role) {
  if (p === '/api/auth/provider/me') return { id: `u-${role}`, role, canonicalRole: role, firstName: 'ทดสอบ', lastName: 'การเงิน' };
  if (p === '/api/invoices/summary') return { totalRevenue: 47310, pendingAmount: 0, overdueAmount: 0, monthlyRevenue: 47310, invoiceCount: { paid: 2, pending: 0, overdue: 0 } };
  if (p === '/api/invoices/receipts/exceptions') return { exceptions: [] };
  if (p === '/api/invoices/receipts/pending') return { invoices: RECEIPTS };
  if (p === '/api/invoices/revenue-summary') return {};
  if (p === '/api/invoices') return { invoices: INVOICES };
  if (p === '/api/finance/wht/certificates') return { count: 0, certificates: [] };
  if (p === '/api/finance/purchase-invoices') return [{ id: 'pi-00000001', invoiceNumber: 'SUP-2569-001', supplierName: 'บริษัท ผู้ขาย จำกัด', supplierTaxId: '0105551234567', invoiceDate: '2026-09-01T00:00:00Z', subtotal: 1000, vat: 70, totalAmount: 1070, category: 'OFFICE_SUPPLIES', status: 'PENDING_REVIEW', createdAt: '2026-09-01T00:00:00Z' }];
  if (p === '/api/finance/period-close') return [{ id: 'pc-1', year: 2026, month: 8, status: 'CLOSED', closedAt: '2026-09-02T00:00:00Z', closedBy: 'u-9' }];
  if (p === '/api/finance/manual-journal-entries') return [{ id: 'je-00000001', status: 'DRAFT', entryDate: '2026-09-05T00:00:00Z', description: 'ปรับปรุงค่าธรรมเนียมธนาคาร', lines: [], totalDebit: 100, totalCredit: 100, createdBy: 'u-9', createdAt: '2026-09-05T00:00:00Z' }];
  if (p === '/api/finance/reports/trial-balance') return { asOfDate: '2026-09-27', rows: [], totals: { debit: 0, credit: 0, isBalanced: true } };
  if (p === '/api/finance/ar-aging') return { asOfDate: '2026-09-27', bookSide: 'PLATFORM', organizationId: 'org-1', totalsByBucket: {}, totalOutstanding: 0, rowCount: 0, rows: [] };
  return [];
}

const PAGES = [
  ['01-dashboard', '/provider/accounting'],
  ['02-ar-aging', '/provider/accounting/ar-aging'],
  ['03-reports', '/provider/accounting/reports'],
  ['04-wht', '/provider/accounting/wht'],
  ['05-purchase-invoices', '/provider/accounting/purchase-invoices'],
  ['06-manual-journal-entries', '/provider/accounting/manual-journal-entries'],
  ['07-period-close', '/provider/accounting/period-close'],
  ['08-receipts', '/provider/receipts'],
];

// Exact texts of the write buttons on these pages (filter chips such as
// "อนุมัติแล้ว (0)" or the tab "ออกใบเสร็จแล้ว(1)" are reads, so matching is exact).
const WRITE_LABELS = ['บันทึก ทบ.50 ทวิ ใหม่', 'บันทึกใบกำกับใหม่', 'สร้างร่างใหม่', 'ปิดงวดใหม่', 'ออกใบเสร็จ',
  'ระงับ / Hold (Finance)', 'ปลดล็อก (Release Hold)', 'ยกเลิก / คืนเงิน (Void/Refund)', 'อนุมัติ', 'ปฏิเสธ', 'บันทึกชำระแล้ว'];
const isWrite = (b) => WRITE_LABELS.includes(b.replace(/ \[.*\]$/, ''));

async function visibleButtons(page) {
  return page.$$eval('button, a[role="button"]', (els) => els
    .filter((el) => el.offsetParent !== null)
    .map((el) => `${(el.textContent || '').replace(/\s+/g, ' ').trim()}${el.getAttribute('aria-label') ? ` [${el.getAttribute('aria-label')}]` : ''}`)
    .filter(Boolean));
}

async function mainText(page) {
  return page.$$eval('main', (els) => (els[0] || document.body).innerText.replace(/\s+/g, ' ').trim()).catch(async () => (await page.innerText('body')).replace(/\s+/g, ' ').trim());
}

(async () => {
  const browser = await chromium.launch();
  const results = {};
  for (const role of ROLES) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'th-TH' });
    await ctx.addCookies([providerCookie(role)]);
    await ctx.addInitScript((r) => {
      try { localStorage.setItem('user', JSON.stringify({ id: `u-${r}`, role: r, firstName: 'ทดสอบ', lastName: 'การเงิน' })); } catch (e) {}
    }, role);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') note(`[${role}] console.error: ${m.text().slice(0, 160)}`); });
    await page.route('**/api/**', async (route) => {
      const p = new URL(route.request().url()).pathname;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: apiData(p, role) }) });
    });
    results[role] = {};
    for (const [name, url] of PAGES) {
      await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 240000 });
      await page.waitForTimeout(1500);
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {});
      const finalPath = new URL(page.url()).pathname;
      await page.screenshot({ path: path.join(outDir, `${name}__${role}.png`), fullPage: true });
      const buttons = await visibleButtons(page);
      results[role][name] = {
        finalPath,
        text: await mainText(page),
        writeButtons: buttons.filter(isWrite),
      };
      note(`[${role}] ${name} ${url} → ${finalPath} · write buttons: ${JSON.stringify(results[role][name].writeButtons)}`);
    }
    // Invoice detail modal (hold / refund buttons) from the dashboard.
    await page.goto(BASE + '/provider/accounting', { waitUntil: 'networkidle', timeout: 240000 });
    await page.waitForTimeout(1200);
    await page.locator('button[aria-label="ดูรายละเอียดใบแจ้งหนี้"]').first().click();
    await page.waitForTimeout(1000);
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {});
    await page.screenshot({ path: path.join(outDir, `09-invoice-detail__${role}.png`), fullPage: false });
    const dialogButtons = await page.$$eval('[role="dialog"] button', (els) => els.map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean));
    results[role]['09-invoice-detail'] = { text: '', writeButtons: dialogButtons.filter(isWrite) };
    note(`[${role}] 09-invoice-detail · write buttons: ${JSON.stringify(results[role]['09-invoice-detail'].writeButtons)}`);
    await ctx.close();
  }
  await browser.close();

  // Read-content comparison: page text with the write-button labels removed.
  const strip = (t) => WRITE_LABELS.reduce((acc, w) => acc.split(w).join(''), t)
    .replace(/บัญชีของคุณมีสิทธิ์ดูเท่านั้น การบันทึก ทบ\.50 ทวิ ทำโดยฝ่ายการเงินของบริษัท/g, '')
    .replace(/—/g, '').replace(/\s+/g, ' ').trim();
  for (const [name] of PAGES) {
    const d = results[ROLES[0]][name]; const p = results[ROLES[1]][name];
    const same = strip(d.text) === strip(p.text);
    note(`COMPARE ${name}: read content identical=${same} · landed ${d.finalPath} | ${p.finalPath}`);
    if (!same) {
      const a = strip(d.text); const b = strip(p.text);
      let i = 0; while (i < a.length && a[i] === b[i]) i += 1;
      note(`  first difference at ${i}: dtam="${a.slice(Math.max(0, i - 60), i + 80)}" | platform="${b.slice(Math.max(0, i - 60), i + 80)}"`);
    }
  }
  fs.writeFileSync(path.join(outDir, 'viewpack-results.json'), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(outDir, 'viewpack-log.txt'), log.join('\n') + '\n');
})().catch((e) => { console.error(e); process.exit(1); });

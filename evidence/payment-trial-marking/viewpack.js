const fs = require('fs');
const path = require('path');
const { chromium } = require('module').createRequire(path.resolve(__dirname, '../../apps/web-app/package.json'))('@playwright/test');
const { describePaymentMode, PAYMENT_MODES } = require('../../apps/backend/shared/payment-mode');

const BASE = 'http://127.0.0.1:3127';
const [, , outDir] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const log = [];
const note = (s) => { log.push(s); console.log(s); };

const APP_UUID = 'aa75ba6e-2f4c-4d7e-9a0e-5b1f7c3d2e10';
const APP_NUMBER = 'APP-2569-MUJZRHP3-69A796';
const PAID_INVOICE = {
    id: '92630e32-0000-4000-8000-000000000001', invoiceNumber: 'INV-CO-09246C23-M1', applicationId: APP_UUID,
    totalAmount: '5885.00', status: 'RECEIPT_ISSUED', erpStatus: 'RECEIPT_ISSUED',
    receiptNumber: 'TAX-PRD-2026-000002', receiptIssuedAt: '2026-10-21T03:00:00.000Z',
    createdAt: '2026-10-21T02:00:00.000Z', paidAt: '2026-10-21T03:00:00.000Z', serviceType: 'CERTIFICATION_CHECKOUT_M1',
    lineItems: [{ lineNumber: 1, description: 'ค่าบริการ GACP', quantity: 1, unitPrice: '5500.00', amount: '5500.00' }],
};
const QUOTATIONS = {
    dtam: null,
    platform: {
        id: 'qt-1', applicationId: APP_UUID, issuerType: 'PLATFORM', quotationNumber: 'QT-PRD-2026-000002',
        subtotal: '33000.00', vat: '2310.00', totalAmount: '35310.00', status: 'ACCEPTED', acceptedAt: '2026-10-21T01:00:00.000Z',
        createdAt: '2026-10-21T00:00:00.000Z', validUntil: '2026-10-30T00:00:00.000Z',
        installments: [{ phase: 'PHASE_1', amount: 5885 }, { phase: 'PHASE_2', amount: 29425 }],
        lineItems: [],
    },
    applicationNumber: APP_NUMBER,
};

const SIDE = { billed: 5885, paid: 5885, outstanding: 0, invoiceCount: 1 };
const STATEMENT = {
    applicant: { id: 'user-1', name: 'บริษัท ทดสอบพร้อมเพย์สเตจจิ้ง จำกัด', healthIdMasked: null, phoneNumberMasked: null, emailMasked: null },
    asOfDate: '2026-10-21T03:00:00.000Z',
    organizationId: 'org-1',
    summary: { dtamSide: null, platformSide: SIDE },
    applications: [{
        id: APP_UUID, applicationNumber: APP_NUMBER, status: 'DOC_FEE_PAID', createdAt: '2026-10-20T00:00:00.000Z',
        phase1Status: 'PAID', phase2Status: null, phase1PaidAt: '2026-10-21T03:00:00.000Z', phase2PaidAt: null,
        quotations: [{ id: 'qt-1', quotationNumber: 'QT-PRD-2026-000002', issuerType: 'PLATFORM', status: 'ACCEPTED', totalAmount: 35310, issueDate: '2026-10-21T00:00:00.000Z', validUntil: '2026-10-30T00:00:00.000Z', acceptedAt: '2026-10-21T01:00:00.000Z' }],
        invoices: [{ id: PAID_INVOICE.id, invoiceNumber: PAID_INVOICE.invoiceNumber, receiptNumber: PAID_INVOICE.receiptNumber, serviceType: PAID_INVOICE.serviceType, bookSide: 'PLATFORM', status: 'RECEIPT_ISSUED', isPaid: true, totalAmount: 5885, subtotal: 5500, vat: 385, dueDate: '2026-10-30T00:00:00.000Z', paidAt: PAID_INVOICE.paidAt, paymentMethod: 'STRIPE' }],
        summary: { dtamSide: null, platformSide: SIDE },
    }],
};

function healthCookie() {
    const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    return { name: 'auth_token', value: `${b({ alg: 'none', typ: 'JWT' })}.${b({ role: 'health', exp: Math.floor(Date.now() / 1000) + 3600 })}.viewpack`, domain: '127.0.0.1', path: '/' };
}

async function mockApi(page, mode) {
    await page.route('**/api/**', async (route) => {
        const p = new URL(route.request().url()).pathname;
        let data = [];
        if (p === '/api/payments/mode') data = describePaymentMode(mode);
        else if (p === '/api/invoices/my') data = [PAID_INVOICE];
        else if (p === '/api/applications/my') data = [{ id: APP_UUID, applicationNumber: APP_NUMBER, status: 'DOC_FEE_PAID' }];
        else if (/^\/api\/applications\/[^/]+\/quotations$/.test(p)) data = QUOTATIONS;
        else if (/^\/api\/applications\/[^/]+\/statement$/.test(p)) data = STATEMENT;
        else if (p === '/api/consent') data = { consents: {} };
        else if (p === '/api/entities/mine') data = [];
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    });
}

const SCENES = [
    ['checkout', `/health/payments/checkout?app=${APP_UUID}&milestone=M1`, null],
    ['payments', `/health/payments?app=${APP_UUID}`, null],
    ['receipt-on-screen', `/health/payments?app=${APP_UUID}`, 'modal'],
    ['billing', '/health/billing', null],
    ['official-documents', '/health/official-documents', null],
];
const VIEWPORTS = [['390x844', { width: 390, height: 844 }], ['1440x900', { width: 1440, height: 900 }]];

(async () => {
    const browser = await chromium.launch();
    for (const mode of [PAYMENT_MODES.TRIAL, PAYMENT_MODES.LIVE]) {
        for (const [vpName, viewport] of VIEWPORTS) {
            const ctx = await browser.newContext({ viewport, locale: 'th-TH' });
            await ctx.addCookies([healthCookie()]);
            await ctx.addInitScript(() => {
                try {
                    localStorage.setItem('user', JSON.stringify({ id: 'user-1', role: 'HEALTH', healthId: 'user-1', firstName: 'ทดสอบ', lastName: 'ภาพ' }));
                } catch {}
            });
            const page = await ctx.newPage();
            page.on('console', (m) => { if (m.type() === 'error') note(`[${mode} ${vpName}] console.error: ${m.text().slice(0, 160)}`); });
            await mockApi(page, mode);
            for (const [name, url, action] of SCENES) {
                await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle', timeout: 300000 });
                await page.waitForTimeout(1500);
                if (action === 'modal') {
                    await page.getByRole('button', { name: 'ดูรายละเอียด' }).first().click();
                    await page.waitForTimeout(800);
                }
                await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {});
                const file = `${mode.toLowerCase()}-${name}-${vpName}.png`;
                await page.screenshot({ path: path.join(outDir, file), fullPage: action !== 'modal' });
                const notices = await page.locator('[data-trial-payment-notice]').allInnerTexts();
                const marks = await page.locator('[data-trial-document-mark]').allInnerTexts();
                const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
                note(`${file}: notices=${JSON.stringify(notices)} marks=${JSON.stringify(marks.map((t) => t.replace(/\s+/g, ' ')))} scrollWidth=${scrollW}`);
            }
            await ctx.close();
        }
    }
    await browser.close();
    fs.writeFileSync(path.join(outDir, 'viewpack.log'), `${log.join('\n')}\n`);
})().catch((err) => { console.error(err); process.exit(1); });

// A = { p: shot prefix, app }  applicant accepts the quotation and pays with Stripe TEST PromptPay through the real pages.
let n = 0; const nm = (s) => `${A.p}-${String(++n).padStart(2, '0')}-${s}`;
await h.go(page, `/health/payments?app=${A.app}`);
await h.shot(page, nm('payments-before'));
const accept = page.getByRole('button', { name: /ยอมรับใบเสนอราคา/ }).first();
if (await accept.isVisible().catch(() => false)) { await accept.click(); await page.waitForTimeout(4000); await h.shot(page, nm('quotation-accepted')); }
const create = page.getByRole('link', { name: /สร้างรายการชำระเงิน|ชำระเงิน/ }).or(page.getByRole('button', { name: /สร้างรายการชำระเงิน/ })).first();
if (await create.isVisible().catch(() => false)) { await create.click(); await page.waitForLoadState('networkidle').catch(() => {}); }
else await h.go(page, `/health/payments/checkout?app=${A.app}`);
await h.shot(page, nm('checkout-idle'));
const terms = page.locator('[data-testid=checkout-terms-checkbox]');
if (await terms.isVisible().catch(() => false)) await terms.check();
await page.getByRole('button', { name: /เริ่มขั้นตอนชำระเงิน/ }).first().click();
const email = page.locator('[data-testid=checkout-payer-email-input]');
await email.waitFor({ state: 'visible', timeout: 60000 });
await email.fill('a8-payer@example.com');
await h.shot(page, nm('checkout-created'));
await page.locator('[data-testid=checkout-promptpay-step] button').last().click();
for (const other of ctx.pages()) if (other !== page) await other.close().catch(() => {});
let pop = null;
ctx.on('page', (pg) => { pop = pg; });
let sim = null;
for (let i = 0; i < 60 && !sim; i += 1) {
  await page.waitForTimeout(1500);
  const fr = page.frames().find((f) => f.url().includes('promptpay/instructions'));
  const btn = fr && fr.locator('button.QRCode-simulatorButton');
  if (btn && await btn.isVisible().catch(() => false)) sim = btn;
}
let clicked = false;
if (sim) {
  await page.waitForTimeout(5000);
  for (let k = 0; k < 3 && !pop; k += 1) {
    await sim.click().catch(() => {});
    for (let w = 0; w < 30 && !pop; w += 1) await page.waitForTimeout(1000);
  }
  clicked = !!pop;
  await h.shot(page, nm('promptpay-qr'), { settle: 500, full: false });
}
if (!clicked) { await h.shot(page, nm('no-simulate-link')); throw new Error('Stripe simulate-scan link not found'); }
await pop.waitForLoadState('networkidle', { timeout: 90000 }).catch(() => {});
await pop.screenshot({ path: `${h.W}/shots/${nm('stripe-test-page')}.png`, fullPage: true });
await pop.getByRole('button', { name: /authorize test payment/i }).or(pop.getByText(/authorize test payment/i)).first().click();
await pop.waitForTimeout(4000);
await pop.screenshot({ path: `${h.W}/shots/${nm('stripe-authorized')}.png`, fullPage: true }).catch(() => {});
await pop.close().catch(() => {});
await page.getByText(/ระบบได้รับการยืนยันการชำระเงิน/).first().waitFor({ state: 'visible', timeout: 180000 });
await h.shot(page, nm('settled'));
await h.go(page, `/health/payments?app=${A.app}`);
await h.shot(page, nm('payments-after'));
return 'paid';

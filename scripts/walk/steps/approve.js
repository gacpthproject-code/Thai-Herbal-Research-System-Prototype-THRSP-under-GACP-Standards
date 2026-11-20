// A = { p, app, action: approve|correct, n0 }
let n = Number(A.n0 || 5); const nm = (s) => `${A.p}-${String(++n).padStart(2, '0')}-${s}`;
page.setDefaultTimeout(30000);
await h.go(page, `/provider/certification-decisions/${A.app}`);
await page.waitForTimeout(3000);
const label = { approve: /อนุมัติให้การรับรอง/, refuse: /ไม่ให้การรับรอง/, correct: /ส่งกลับให้ผู้ตรวจพื้นที่ทบทวน/ }[A.action];
await page.getByRole('button', { name: label }).first().click();
await page.waitForTimeout(1500);
const dlg = page.getByRole('dialog').last();
const scope = (await dlg.count()) ? dlg : page;
for (const s of await scope.locator('select').all()) { const opts = await s.locator('option').allTextContents(); const want = opts[1]; if (want) await s.selectOption({ label: want }); }
for (const r of await scope.locator('input[type=radio], input[type=checkbox]').all()) { await r.check().catch(() => {}); }
for (const t of await scope.locator('textarea').all()) await t.fill(A.reason || `ทดสอบ-A8: ${A.action} หลังเปิดแฟ้มตัดสิน ตรวจภาพหลักฐานและรายการตรวจครบแล้ว`);
await h.shot(page, nm('dialog-filled'), { settle: 300 });
const r = page.waitForResponse((x) => x.url().includes('/api/') && x.request().method() === 'POST' && !/mfa|login|refresh|activity|telemetry|log/.test(x.url()), { timeout: 90000 });
await page.getByRole('button', { name: A.action === 'correct' ? /^ยืนยันส่งกลับ$/ : /ยืนยัน/ }).last().click();
const rr = await r;
const body = (await rr.text()).slice(0, 500);
await page.waitForTimeout(3000);
await h.shot(page, nm('after'));
return [rr.url().replace(h.BASE, ''), rr.status(), body];

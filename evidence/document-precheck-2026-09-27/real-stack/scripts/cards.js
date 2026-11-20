const { shot, elShot, note, BASE, S } = require(process.env.S + '/lib.js');
const card = (page, text) => page.locator('div.rounded-xl.border-2').filter({ hasText: text }).first();
async function stateOf(c) {
  for (const s of ['checking', 'checked-ok', 'check-failed', 'checked-flags']) { if (await c.locator(`[data-precheck="${s}"]`).count()) return s; }
  return (await c.innerText()).includes('ยังไม่ได้แนบ') ? 'missing' : 'attached';
}
async function upload(page, c, file) {
  const btn = c.getByRole('button', { name: /^(อัปโหลดไฟล์|แทนที่ไฟล์|อัปโหลดไฟล์ใหม่)$/ }).first();
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), btn.click()]);
  const respP = page.waitForResponse((r) => r.url().includes('/draft-documents') && r.request().method() === 'POST', { timeout: 120000 });
  await fc.setFiles(file);
  const r = await respP; const t = Date.now();
  let body = ''; try { body = JSON.stringify(await r.json()).slice(0, 300); } catch (e) {}
  note(`upload ${file.split('/').pop()} -> ${r.status()} ${body.replace(/\d{9}(\d{4})/g, '…$1')}`);
  return t;
}
async function waitState(page, c, want, ms = 180000) {
  const t0 = Date.now(); let s;
  while (Date.now() - t0 < ms) { s = await stateOf(c); if (want.includes(s)) return { s, ms: Date.now() - t0 }; await page.waitForTimeout(500); }
  return { s, ms: Date.now() - t0, timeout: true };
}
module.exports = { card, stateOf, upload, waitState };

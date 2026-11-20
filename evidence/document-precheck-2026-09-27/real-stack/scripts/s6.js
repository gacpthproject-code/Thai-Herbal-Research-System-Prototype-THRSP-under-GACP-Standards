const { open, shot, elShot, note, BASE, S } = require(process.env.S + '/lib.js');
const { card, stateOf, upload, waitState } = require(process.env.S + '/cards.js');
const F = S + '/files/';
const JUR = 'สำเนาหนังสือรับรองการจดทะเบียนนิติบุคคล';
const IDH = 'สำเนาบัตรประจำตัวประชาชนและสำเนาทะเบียนบ้าน';
async function darkCard(text, name) {
  const d = await open({ storage: S + '/applicant.json', dark: true });
  await d.page.goto(BASE + '/health/applications/new/step/2', { waitUntil: 'networkidle', timeout: 180000 });
  await d.page.waitForTimeout(3000);
  note('dark html class: ' + await d.page.evaluate(() => document.documentElement.className));
  const c = card(d.page, text); note(`dark ${name} state=${await stateOf(c)}`);
  await elShot(c, name); await d.browser.close();
}
(async () => {
  const { browser, ctx, page } = await open({ storage: S + '/applicant.json' });
  page.on('response', (r) => { if (/prechecks|draft-documents/.test(r.url()) && r.request().method() !== 'GET') note(`${r.request().method()} ${r.url().replace(/^.*\/api/, '/api')} -> ${r.status()}`); });
  await page.goto(BASE + '/health/applications/new/step/2', { waitUntil: 'networkidle', timeout: 180000 });
  await page.waitForTimeout(3000);
  const jur = card(page, JUR);
  await elShot(jur, '11-jur-before');
  // A: scanned company_reg with a name mismatch
  const tA = await upload(page, jur, F + 'company_reg--name-mismatch-scan.png');
  await page.waitForTimeout(600);
  const sA0 = await stateOf(jur); note('A state right after upload: ' + sA0);
  await elShot(jur, '12-jur-scan-mismatch-checking');
  await ctx.storageState({ path: S + '/applicant.json' });
  if (sA0 === 'checking') await darkCard(JUR, '12-jur-scan-mismatch-checking-dark').catch((e) => note('dark checking miss ' + e.message));
  const rA = await waitState(page, jur, ['checked-ok', 'checked-flags', 'check-failed']);
  note(`A settled: ${rA.s} after ${Date.now() - tA} ms since upload response (poll wait ${rA.ms}ms)${rA.timeout ? ' TIMEOUT' : ''}`);
  await elShot(jur, '13-jur-scan-mismatch-' + rA.s);
  await darkCard(JUR, '13-jur-scan-mismatch-' + rA.s + '-dark');
  // B: blank page into id_house_reg
  const idh = card(page, IDH);
  const tB = await upload(page, idh, F + 'blank-page.png');
  await page.waitForTimeout(600);
  note('B state right after upload: ' + await stateOf(idh));
  const rB = await waitState(page, idh, ['checked-ok', 'checked-flags', 'check-failed']);
  note(`B settled: ${rB.s} after ${Date.now() - tB} ms`);
  await elShot(idh, '14-idh-blank-' + rB.s);
  await darkCard(IDH, '14-idh-blank-' + rB.s + '-dark');
  // C: expired company_reg into the same juristic slot (supersede)
  const tC = await upload(page, jur, F + 'company_reg--expired.pdf');
  await page.waitForTimeout(400);
  note('C state right after upload: ' + await stateOf(jur));
  const rC = await waitState(page, jur, ['checked-ok', 'checked-flags', 'check-failed']);
  note(`C settled: ${rC.s} after ${Date.now() - tC} ms`);
  await elShot(jur, '15-jur-expired-' + rC.s);
  await darkCard(JUR, '15-jur-expired-' + rC.s + '-dark');
  await shot(page, '16-step2-after-uploads', { full: true });
  await ctx.storageState({ path: S + '/applicant.json' });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

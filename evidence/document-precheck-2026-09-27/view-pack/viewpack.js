// View-pack: Task 8 document pre-check screens. Usage (from apps/web-app):
//   NODE_PATH=$(pwd)/node_modules node ../../evidence/document-precheck-2026-09-27/view-pack/viewpack.js <outdir>
// Real Chromium against a local `next dev` on :3131 run from the feat/document-precheck
// worktree, backend URLs pointed at a dead port (127.0.0.1:9). NO backend and NO database
// in this run: every /api/** request is answered in the browser by page.route with the
// fixtures below, shaped like Task 7's responses. Same technique as
// evidence/finance-one-view-2026-09-27/view-pack/viewpack.js.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3131';
const [, , outDir] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const log = [];
const note = (s) => { log.push(s); console.log(s); };
const APP = 'app-vp-1';
// Same union as the jest guards (fix round 1): \p{Extended_Pictographic} alone misses U+2713/2715/2717/FE0F.
const EMOJI = /[\p{Extended_Pictographic}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{1F000}-\u{1FAFF}\u{FE0F}]/u;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = () => Math.floor(Date.now() / 1000) + 3600;
const healthCookie = { name: 'auth_token', value: `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ role: 'health', exp: exp() })}.viewpack`, domain: 'localhost', path: '/' };
const providerCookie = (role) => ({ name: 'provider_token', value: `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: `u-${role}`, role, exp: exp() })}.viewpack`, domain: 'localhost', path: '/' });

// Reason texts are the backend rules' own (services/document-precheck/rules/*.js).
const R = {
  pass: 'อ่านเอกสารได้ชัดเจน',
  docMatch: 'พบข้อความที่ตรงกับชนิดเอกสารที่คาด',
  crossMatch: 'ข้อมูลในเอกสารตรงกับข้อมูลที่กรอกไว้',
  notFound: 'ไม่พบข้อมูลที่จะเทียบในเอกสารนี้ เจ้าหน้าที่จะตรวจสอบเพิ่มเติม', // Task 10 copy sweep (rules/cross-match.js)
  expired: 'เอกสารออกมานานเกินกำหนด (ออกเมื่อ 3 ม.ค. 2569)',
  manual: 'ให้เจ้าหน้าที่ตรวจลายมือชื่อและตราประทับด้วยตนเอง',
};

let acknowledgedAt = null;          // flipped by the real press on the confirm button
let checkingDone = false;           // flipped after the poll has been observed
const reqTimes = [];

function slot(slotId, labelTH, precheck) {
  return { slotId, labelTH, description: null, sourceHint: null, required: true, requiredReason: 'HOLDER_TYPE', satisfied: true, fileUrl: `/uploads/${slotId}.pdf`, fileName: `${slotId}.pdf`, uploadedAt: '2026-09-27T03:00:00.000Z', precheck };
}

function requirements() {
  const slots = [
    slot('id_house_reg', 'สำเนาบัตรประจำตัวประชาชนและทะเบียนบ้านของผู้มีอำนาจลงนาม',
      checkingDone
        ? { id: 'pc-1', status: 'DONE', flags: [{ check: 'READABILITY', result: 'PASS', reasonTH: R.pass }], acknowledgedAt: null }
        : { id: 'pc-1', status: 'PENDING', flags: [], acknowledgedAt: null }),
    slot('juristic_reg_6m', 'หนังสือรับรองการจดทะเบียนนิติบุคคล (ออกไม่เกิน 6 เดือน)', { id: 'pc-2', status: 'DONE', acknowledgedAt: null, flags: [
      { check: 'READABILITY', result: 'PASS', reasonTH: R.pass },
      { check: 'DOC_TYPE', result: 'MATCH', reasonTH: R.docMatch },
      { check: 'CROSS_MATCH', result: 'MATCH', reasonTH: R.crossMatch },
      { check: 'SIGNATURE', result: 'MANUAL', reasonTH: R.manual },
    ] }),
    slot('juristic_authority', 'หนังสือมอบอำนาจ (กรณีมอบอำนาจ)', { id: 'pc-3', status: 'DONE', acknowledgedAt, flags: [
      { check: 'READABILITY', result: 'PASS', reasonTH: R.pass },
      { check: 'CROSS_MATCH', result: 'NOT_FOUND', reasonTH: R.notFound },
      { check: 'VALIDITY', result: 'EXPIRED', reasonTH: R.expired },
      { check: 'SIGNATURE', result: 'MANUAL', reasonTH: R.manual },
    ] }),
    slot('producer_supervision_letter', 'หนังสือรับรองการควบคุมการผลิต', { id: 'pc-4', status: 'FAILED', flags: [], acknowledgedAt: null }),
  ];
  return {
    dims: { holderType: 'JURISTIC', requestType: 'NEW', plantCode: 'cannabis', landTenure: 'OWNED', areaTypes: ['OUTDOOR'], certScope: 'PLANTING', purposes: [] },
    slots, missingRequired: [], blockingIssues: [], complete: true,
  };
}

const DRAFT = {
  id: APP, draftId: APP, status: 'DRAFT',
  formData: {
    plantId: 'cannabis', requestType: 'NEW', certScope: 'PLANTING', applicantType: 'JURISTIC',
    applicantData: { applicantType: 'JURISTIC', companyName: 'บริษัท สมุนไพรทดสอบ จำกัด' },
  },
};

// Officer view: the same four slots, with confidence + masked snippet (Task 7 officer shape).
function documentCheck() {
  const withOfficer = (flags, snippets) => flags.map((f, i) => ({ ...f, confidence: f.result === 'MANUAL' ? 0 : 87.6, evidenceSnippet: snippets[i] || null }));
  const rows = requirements().slots.map((s) => ({
    slotId: s.slotId, labelTH: s.labelTH, required: true, satisfied: true, fileUrl: s.fileUrl, fileName: s.fileName,
    verdict: null, reviewReason: null, reviewDueDate: null,
    precheck: s.precheck && { ...s.precheck, flags: withOfficer(s.precheck.flags, s.slotId === 'juristic_authority'
      ? [null, 'ผู้มอบอำนาจ บริษัท สมุนไพรทดสอบ จำกัด ทะเบียนเลขที่ …4567', 'ทำที่ กรุงเทพมหานคร วันที่ 3 มกราคม 2569']
      : []) },
  }));
  return { round: 1, slots: rows, officerChecklist: { scope: 'ตรงตามคำขอ', qualification: 'รอตรวจ', overall: 'รอตรวจ' } };
}

async function mockApi(page, calls) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    calls.push(`${req.method()} ${p}`);
    let data = [];
    if (p === `/api/applications/${APP}/requirements`) { reqTimes.push(Date.now()); data = requirements(); }
    else if (req.method() === 'POST' && p === `/api/applications/${APP}/prechecks/pc-3/acknowledge`) {
      acknowledgedAt = '2026-09-27T10:00:00.000Z';
      data = { precheckId: 'pc-3', acknowledgedAt };
    } else if (p === '/api/applications/draft') data = DRAFT;
    else if (p === `/api/provider/applications/${APP}/document-check`) data = documentCheck();
    else if (p === '/api/auth/provider/me') data = { id: 'u-document_reviewer', role: 'document_reviewer', canonicalRole: 'document_reviewer', firstName: 'ทดสอบ', lastName: 'ผู้ตรวจ' };
    else if (p.startsWith('/api/applications/config')) data = {};
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });
}

async function cardShot(page, slotId, name) {
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {});
  const label = requirements().slots.find((s) => s.slotId === slotId).labelTH;
  const card = page.locator('div.rounded-xl.border-2', { hasText: label }).first();
  await card.scrollIntoViewIfNeeded();
  await card.screenshot({ path: path.join(outDir, `${name}.png`) });
  note(`${name}.png · text: ${(await card.innerText()).replace(/\s+/g, ' ').trim()}`);
}

(async () => {
  const browser = await chromium.launch();
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 1400 }, locale: 'th-TH', colorScheme: theme });
    await ctx.addCookies([healthCookie]);
    await ctx.addInitScript((t) => {
      try {
        localStorage.setItem('user', JSON.stringify({ id: 'user-1', role: 'HEALTH', healthId: 'user-1', firstName: 'ทดสอบ', lastName: 'ภาพ' }));
        localStorage.setItem('theme', t);
        localStorage.setItem('theme:explicit', '1');
      } catch (e) { /* storage unavailable */ }
    }, theme);
    const page = await ctx.newPage();
    const calls = [];
    page.on('console', (m) => { if (m.type() === 'error') note(`[${theme}] console.error: ${m.text().slice(0, 160)}`); });
    await mockApi(page, calls);
    acknowledgedAt = null; checkingDone = false; reqTimes.length = 0;

    await page.goto(`${BASE}/health/applications/new/step/2`, { waitUntil: 'networkidle', timeout: 240000 });
    await page.waitForSelector('text=กำลังตรวจเอกสาร…', { timeout: 120000 });
    note(`[${theme}] landed ${new URL(page.url()).pathname} · html.dark=${await page.evaluate(() => document.documentElement.classList.contains('dark'))}`);
    const sfx = theme === 'dark' ? '-dark' : '';
    await cardShot(page, 'id_house_reg', `01-checking${sfx}`);
    await cardShot(page, 'juristic_reg_6m', `02-checked-ok${sfx}`);
    await cardShot(page, 'juristic_authority', `03-checked-flags${sfx}`);
    await cardShot(page, 'producer_supervision_letter', `04-check-failed${sfx}`);

    if (theme === 'light') {
      // Poll: observe the browser re-reading requirements while a slot is checking, then
      // let the check finish and observe the reads stop.
      const before = reqTimes.length;
      await page.waitForTimeout(11000);
      const during = reqTimes.length - before;
      checkingDone = true;
      await page.waitForSelector('text=กำลังตรวจเอกสาร…', { state: 'detached', timeout: 15000 });
      const afterDone = reqTimes.length;
      await page.waitForTimeout(12000);
      note(`poll: ${during} requirements reads in 11 s while checking · reads after the check finished and 12 s passed: ${reqTimes.length - afterDone}`);
      note(`poll gaps (ms): ${reqTimes.slice(1).map((t, i) => t - reqTimes[i]).join(', ')}`);
      await cardShot(page, 'id_house_reg', '01b-checking-finished');

      // Real press on "ยืนยันว่าเอกสารถูกต้อง".
      const card = page.locator('div.rounded-xl.border-2', { hasText: 'หนังสือมอบอำนาจ' }).first();
      await card.getByRole('button', { name: 'ยืนยันว่าเอกสารถูกต้อง' }).click();
      await card.getByText('ยืนยันแล้ว', { exact: true }).waitFor({ timeout: 10000 });
      note(`press: ${calls.filter((c) => c.startsWith('POST ')).join(' | ')}`);
      note(`confirm button disabled after press: ${await card.getByRole('button', { name: 'ยืนยันว่าเอกสารถูกต้อง' }).isDisabled()}`);
      await cardShot(page, 'juristic_authority', '05-acknowledged');
      const emoji = EMOJI.test(await page.innerText('body'));
      note(`emoji on applicant page: ${emoji}`);
    }
    await ctx.close();
  }

  // Officer row.
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 1400 }, locale: 'th-TH', colorScheme: theme });
    await ctx.addCookies([providerCookie('document_reviewer')]);
    await ctx.addInitScript((t) => {
      try {
        localStorage.setItem('user', JSON.stringify({ id: 'u-document_reviewer', role: 'document_reviewer', canonicalRole: 'document_reviewer', firstName: 'ทดสอบ', lastName: 'ผู้ตรวจ' }));
        localStorage.setItem('theme', t);
        localStorage.setItem('theme:explicit', '1');
      } catch (e) { /* storage unavailable */ }
    }, theme);
    const page = await ctx.newPage();
    const calls = [];
    page.on('console', (m) => { if (m.type() === 'error') note(`[officer ${theme}] console.error: ${m.text().slice(0, 160)}`); });
    acknowledgedAt = '2026-09-27T10:00:00.000Z'; checkingDone = true;
    await mockApi(page, calls);
    await page.goto(`${BASE}/provider/reviewer/${APP}/document-check`, { waitUntil: 'networkidle', timeout: 240000 });
    await page.waitForSelector('[data-slot-row="juristic_authority"]', { timeout: 120000 });
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {});
    note(`[officer ${theme}] landed ${new URL(page.url()).pathname} · html.dark=${await page.evaluate(() => document.documentElement.classList.contains('dark'))}`);
    const row = page.locator('[data-slot-row="juristic_authority"]');
    await row.scrollIntoViewIfNeeded();
    await row.screenshot({ path: path.join(outDir, `06-officer-row${theme === 'dark' ? '-dark' : ''}.png`) });
    note(`06-officer-row${theme === 'dark' ? '-dark' : ''}.png · text: ${(await row.innerText()).replace(/\s+/g, ' ').trim()}`);
    if (theme === 'light') {
      await page.screenshot({ path: path.join(outDir, '07-officer-page.png'), fullPage: true });
      note(`07-officer-page.png · emoji on officer page: ${EMOJI.test(await page.innerText('body'))}`);
    }
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(outDir, 'viewpack-log.txt'), `${log.join('\n')}\n`);
})().catch((e) => { console.error(e); fs.writeFileSync(path.join(outDir, 'viewpack-log.txt'), `${log.join('\n')}\nFAILED: ${e && e.message}\n`); process.exit(1); });

// View-pack capture for the residency-claim retirement (operator ruling
// 2026-09-27). Usage: node viewpack.js <label> <outdir>
// Real Chromium against local `next dev` on :3118. Same technique as
// evidence/truthful-copy-port-2026-09-26/view-pack/viewpack.js.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE = process.env.VIEWPACK_BASE || 'http://localhost:3118';
const [, , label, outDir] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const log = [];
const note = (s) => { log.push(s); console.log(s); };

// The retired residency claim (operator ruling 2026-09-27) this whole pack
// exists to prove gone. "before" captures are taken against the pre-fix tree
// on purpose and must still show it; any other label is asserting the fix, so
// the phrase must NOT appear anywhere in that run's rendered text.
const RETIRED_RESIDENCY_PHRASE = 'จัดเก็บในศูนย์ข้อมูลที่ตั้งในประเทศไทย';
function assertResidencyPhraseAbsent(fullLog) {
  if (label.startsWith('before')) return;
  if (fullLog.includes(RETIRED_RESIDENCY_PHRASE)) {
    throw new Error(
      `view-pack assertion failed: label "${label}" still renders the retired residency `
      + `claim ("${RETIRED_RESIDENCY_PHRASE}"). Either the tree captured against still has `
      + 'the false claim, or it regressed — do not ship this capture.',
    );
  }
}

async function shot(page, name, opts = {}) {
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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1400 }, locale: 'th-TH' });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') note(`console.error: ${m.text().slice(0, 200)}`); });

  // Privacy policy — TOC (shows section count/numbers) + the former §7 slot.
  // #cross-border exists only in "before"; after removal §7 is now retention.
  await page.goto(BASE + '/privacy-policy', { waitUntil: 'networkidle', timeout: 180000 });
  await shot(page, `${label}-privacy-policy-toc`, { fullPage: false });
  note(`toc text: ${(await text(page, '[aria-label="สารบัญนโยบาย"]')).slice(0, 1500)}`);
  const anchor = (await page.locator('#cross-border').count()) ? '#cross-border' : '#retention';
  await page.locator(anchor).scrollIntoViewIfNeeded().catch(() => {});
  await shot(page, `${label}-privacy-policy-section7-area`, { fullPage: false });
  note(`section7-area (${anchor}) text: ${(await text(page, anchor)).slice(0, 1000)}`);

  // FAQ — search for "PDPA" so every matching item (any topic) renders as a
  // flat accordion list (faq-client.tsx: isSearching merges topics), then
  // open every item so removed/kept items are visible in the text log.
  await page.goto(BASE + '/help/faq', { waitUntil: 'networkidle', timeout: 180000 });
  await page.locator('input[type="search"]').first().fill('ข้อมูล');
  await page.waitForTimeout(500);
  const qs = [
    'ข้อมูลของผู้สมัครถูกเก็บไว้อย่างไร?',
    'ขอลบบัญชีและข้อมูลส่วนบุคคลได้หรือไม่?',
    'ข้อมูลถูกส่งออกนอกประเทศหรือไม่?',
    'มีสิทธิอะไรบ้างในฐานะเจ้าของข้อมูล?',
  ];
  for (const q of qs) {
    const el = page.getByText(q, { exact: true }).first();
    if (await el.count()) { await el.click().catch(() => {}); note(`faq opened: ${q}`); }
    else { note(`faq NOT FOUND (expected after removal): ${q}`); }
  }
  await page.waitForTimeout(500);
  await shot(page, `${label}-faq-pdpa-items`);
  note(`faq pdpa text: ${(await text(page, 'body')).slice(0, 4000)}`);

  const fullLog = log.join('\n');
  assertResidencyPhraseAbsent(fullLog);
  fs.writeFileSync(path.join(outDir, `${label}-rendered-text.txt`), fullLog + '\n');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

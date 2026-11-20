'use strict';
const fs = require('fs');
const { chromium } = require('/home/ubuntu/work/GACP-Certification-Application/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');
const W = '/home/ubuntu/work/state/walk/wizui-r1';
const [BASE, LABEL] = process.argv.slice(2);
const STEPS = (process.env.STEPS || '1,2,3,4,5,6').split(',').map(Number);
const DARK_STEPS = new Set((process.env.DARK_STEPS || '4').split(',').map(Number));
const readEnv = (f) => Object.fromEntries(fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const E = readEnv('/home/ubuntu/work/state/walk/a8-round1c/applicant3.secret.env');
const SECRETS = Object.values(E).filter((x) => x.length >= 4);
const NAMES = new Set();
const scrub = (s) => { let t = String(s); for (const x of SECRETS.concat([...NAMES])) if (x.length >= 3) t = t.split(x).join('[ปิดไว้]'); return t.replace(/\b\d{13}\b/g, '<13d>'); };

async function mask(page) {
  await page.addStyleTag({ content: 'header{position:static!important}' }).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  const names = [...NAMES].filter((n) => n.length >= 3).sort((a, b) => b.length - a.length);
  await page.evaluate(({ names, secrets }) => {
    const res = [/\b\d{13}\b|\b\d-\d{4}-\d{5}-\d{2}-\d\b|\b0\d{8,9}\b|\b0\d{1,2}-\d{3,4}-\d{3,4}\b/g, /(?:นางสาว|นาย|นาง|น\.ส\.)\s?[^\s\d<>()]{2,}(?:\s+[^\s\d<>()]{2,})?/g, /บริษัท\s?[^\n]{1,60}?จำกัด(?:\s?\(มหาชน\))?/g, /[\w.+-]+@[\w-]+\.[\w.]+/g, /\bAPP-\d{4}-[A-Z0-9-]+/g, /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g];
    const issuer = /พรีดิคทีฟ|Predictive/i;
    const fix = (s) => { let t = s; for (const n of names.concat(secrets)) if (n && t.includes(n)) t = t.split(n).join('[ปิดชื่อ]'); for (const re of res) t = t.replace(re, (m) => (issuer.test(m) ? m : '[ปิดไว้]')); return t; };
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) { const v = fix(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
    for (const i of document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea')) { const v = fix(i.value || ''); if (v !== i.value) i.value = v; }
    for (const f of document.querySelectorAll('iframe')) { try { const d = f.contentDocument; if (!d) continue; const fw = d.createTreeWalker(d.body, NodeFilter.SHOW_TEXT); for (let n; (n = fw.nextNode());) { const v = fix(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; } } catch (_) {} }
  }, { names, secrets: SECRETS }).catch(() => {});
}

async function session(viewport, theme) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport, colorScheme: theme, locale: 'th-TH', timezoneId: 'Asia/Bangkok', deviceScaleFactor: viewport.width < 500 ? 2 : 1 });
  await ctx.addInitScript((t) => { try { localStorage.setItem('theme', t); localStorage.setItem('theme:explicit', '1'); } catch (_) {} }, theme);
  const page = await ctx.newPage();
  page.on('request', (r) => { if (!['GET', 'HEAD'].includes(r.method()) && r.url().includes('/api/')) fs.appendFileSync(`${W}/text/${LABEL}-writes.log`, `${r.method()} ${r.url().replace(BASE, '')}\n`); });
  page.on('response', async (r) => { if (r.url().includes('/api/') && /json/.test(r.headers()['content-type'] || '')) { try { const j = await r.json(); (function h(o, d) { if (!o || typeof o !== 'object' || d > 10) return; for (const [k, v] of Object.entries(o)) { if (typeof v === 'string' && /^(fullName|firstName|lastName|name|displayName|companyName|holderName|siteContactName|contactName|email|landlordName|applicantName)$/.test(k) && v.length >= 3 && v.length < 100 && !/พรีดิคทีฟ|Predictive/i.test(v)) NAMES.add(v); else h(v, d + 1); } })(j, 0); } catch (_) {} } });
  await page.goto(`${BASE}/auth/health/login`, { waitUntil: 'networkidle', timeout: 300000 });
  await page.fill('#identifier', E.WALK_NID); await page.fill('#password', E.WALK_PW);
  await Promise.all([page.waitForURL((u) => !/auth\/health\/login/.test(u.toString()), { timeout: 180000 }), page.locator('button[type=submit]').first().click()]);
  await page.waitForLoadState('networkidle').catch(() => {});
  return { browser, page };
}

async function shootHere(page, step, tag) {
  await page.waitForTimeout(step === 6 ? 6000 : 2500);
  await mask(page);
  const name = `${tag}-step${step}`;
  fs.writeFileSync(`${W}/text/${name}.txt`, `${page.url().replace(BASE, '')}\n\n${scrub(await page.evaluate(() => document.body.innerText))}`);
  await page.screenshot({ path: `${W}/shots/${name}.png`, fullPage: true });
  console.log('shot', name, page.url().replace(BASE, ''));
}

const ensureOn = async (page, text) => { const on = page.locator('main [aria-pressed="true"], main [aria-checked="true"], main label:has([aria-checked="true"]), main label:has([data-state="checked"])').filter({ hasText: text }); if (await on.count()) return; await pick(page, text); };
const pick = async (page, text) => { const t = page.locator('main').getByText(text, { exact: true }).first(); if (await t.count()) { await t.click(); await page.waitForTimeout(400); } else console.log('missing', String(text)); };
const fill = async (page, id, v) => { if (await page.locator('#' + id).count()) await page.fill('#' + id, v); };
const next = async (page) => { await page.getByRole('button', { name: /^ถัดไป$/ }).click(); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(2000); };

async function walk(page, wanted, tag) {
  await page.goto(`${BASE}/health/applications/new`, { waitUntil: 'networkidle', timeout: 300000 });
  await page.waitForTimeout(3000);
  await ensureOn(page, /^ขอใหม่/);
  await ensureOn(page, /^ขิง/);
  if (wanted.has(1)) await shootHere(page, 1, tag);
  await next(page);
  if (wanted.has(2)) await shootHere(page, 2, tag);
  await next(page);
  await fill(page, 'site-name', 'แปลงทดสอบหลักฐาน'); await fill(page, 'site-address', '99 หมู่ 1'); await fill(page, 'site-subdistrict', 'บางกระสอ'); await fill(page, 'site-district', 'เมืองนนทบุรี'); await fill(page, 'site-province', 'นนทบุรี'); await fill(page, 'site-postal-code', '11000');
  await fill(page, 'coordinates', '13.8621, 100.5144');
  await ensureOn(page, /^เป็นเจ้าของที่ดินเอง$/);
  await fill(page, 'land-doc-type', 'โฉนด'); await fill(page, 'land-doc-number', '12345');
  await ensureOn(page, /^กลางแจ้ง$/);
  await fill(page, 'area-sqm', '200'); await fill(page, 'plants-per-cycle', '100'); await fill(page, 'cycles-per-year', '2');
  if (wanted.has(3)) await shootHere(page, 3, tag);
  await next(page);
  await ensureOn(page, /ศึกษาวิจัย/);
  await ensureOn(page, /ส่วนขยายพันธุ์อื่น/);
  await ensureOn(page, /^ในประเทศ$/);
  await fill(page, 'variety-name-0', 'ขิงพันธุ์พื้นเมือง (ทดสอบ)');
  if (wanted.has(4)) {
    await shootHere(page, 4, tag);
    const purpose = page.locator('section').filter({ hasText: 'วัตถุประสงค์การขอรับรอง' }).last();
    await mask(page);
    await purpose.screenshot({ path: `${W}/shots/${tag}-step4-purpose-crop.png` });
  }
  if (process.env.KEYS) {
    const box = page.locator('main [role=checkbox]').nth(1);
    await box.focus(); await page.keyboard.press('Space'); await page.waitForTimeout(400);
    const afterSpace = await box.getAttribute('aria-checked');
    await mask(page);
    await page.evaluate(() => document.activeElement?.closest('label')?.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: `${W}/shots/${tag}-step4-keyboard-checkbox-focus.png` });
    await page.keyboard.press('Space'); await page.waitForTimeout(400);
    const afterSecondSpace = await box.getAttribute('aria-checked');
    const radio = page.locator('main [role=radiogroup]').first().locator('[role=radio][aria-checked=true]');
    await radio.focus(); await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(120); await page.keyboard.up('ArrowLeft'); await page.waitForTimeout(500);
    const focused = await page.evaluate(() => ({ label: document.activeElement?.closest('label')?.textContent, checked: document.activeElement?.getAttribute('aria-checked'), role: document.activeElement?.getAttribute('role'), ring: getComputedStyle(document.activeElement.closest('label')).boxShadow }));
    await page.evaluate(() => document.activeElement?.closest('label')?.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: `${W}/shots/${tag}-step4-keyboard-radio-focus.png` });
    const tabOrder = [];
    await page.locator('main [role=checkbox]').first().focus();
    for (let i = 0; i < 6; i++) { tabOrder.push(await page.evaluate(() => `${document.activeElement?.getAttribute('role') || document.activeElement?.tagName}:${(document.activeElement?.closest('label')?.textContent || document.activeElement?.textContent || '').trim().slice(0, 30)}`)); await page.keyboard.press('Tab'); }
    const result = { afterSpace, afterSecondSpace, arrowLeftFrom: 'checked kind radio', focused, tabOrder };
    console.log('keys', JSON.stringify(result));
    fs.writeFileSync(`${W}/text/${tag}-keyboard.json`, JSON.stringify(result, null, 2));
  }
  if (!wanted.has(5) && !wanted.has(6)) return;
  await next(page);
  if (wanted.has(5)) await shootHere(page, 5, tag);
  if (!wanted.has(6)) return;
  const nextBtn = page.getByRole('button', { name: /^ถัดไป$/ });
  if (await nextBtn.isEnabled().catch(() => false)) await next(page);
  else await page.goto(`${BASE}/health/applications/new/step/6`, { waitUntil: 'networkidle', timeout: 300000 }).catch(() => {});
  await shootHere(page, 6, tag);
}

(async () => {
  for (const [vpName, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    for (const theme of ['light', 'dark']) {
      const steps = theme === 'light' ? STEPS : STEPS.filter((s) => DARK_STEPS.has(s));
      if (!steps.length) continue;
      const { browser, page } = await session(viewport, theme);
      await walk(page, new Set(steps), `${LABEL}-${vpName}-${theme}`);
      await browser.close();
    }
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });

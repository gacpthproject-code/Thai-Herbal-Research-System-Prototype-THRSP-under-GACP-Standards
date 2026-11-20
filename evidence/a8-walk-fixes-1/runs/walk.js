'use strict';
// node walk.js <phase> <step> — run from <tree>/apps/backend with the stack env sourced.
// Steps: revision · reviewer · inspect · car. Screens go to $R/<phase>/shots, door answers to $R/<phase>/doors.jsonl.
const fs = require('fs');
const path = require('path');
const { chromium } = require('/home/ubuntu/work/GACP-Certification-Application/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');

const R = '/home/ubuntu/work/state/reviews/a8-walk-fixes-1-runs';
const [phase, step] = process.argv.slice(2);
const OUT = path.join(R, phase);
const SHOTS = path.join(OUT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const API = 'http://127.0.0.1:8711';
const WEB = 'http://127.0.0.1:3711';
const fx = JSON.parse(fs.readFileSync(path.join(OUT, 'fixtures.json'), 'utf8'));
const creds = JSON.parse(fs.readFileSync(path.join(OUT, 'creds.json'), 'utf8'));
const tree = process.cwd();
const { prisma } = require(path.join(tree, 'services/prisma-database'));
const SECRETS = Object.values(creds).flatMap((c) => [c.login, c.password]);
const scrub = (s) => { let t = String(s); for (const x of SECRETS) t = t.split(x).join('<masked>'); return t.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<jwt>').replace(/\b\d{13}\b/g, '<13d>'); };
const record = (row) => fs.appendFileSync(path.join(OUT, 'doors.jsonl'), scrub(JSON.stringify({ at: new Date().toISOString(), step, ...row })) + '\n');
const VIEW = { desk: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };
const PDF = path.join(R, 'files', 'sop-revised.pdf');

const tokens = {};
async function token(role) {
  if (tokens[role]) return tokens[role];
  const c = creds[role];
  const staff = role !== 'applicant';
  const r = await fetch(`${API}/api/auth/${staff ? 'provider' : 'health'}/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(staff ? { providerId: c.login, password: c.password } : { identifier: c.login, password: c.password }),
  });
  const j = await r.json().catch(() => ({}));
  const t = j.data?.token || j.data?.tokens?.accessToken || j.token || j.data?.accessToken;
  if (!t) throw new Error(`login ${role} ${r.status} ${scrub(JSON.stringify({ code: j.code, error: j.error, message: j.message }))}`);
  tokens[role] = t;
  return t;
}
async function api(role, method, p, body) {
  const headers = { authorization: `Bearer ${await token(role)}` };
  let b = body;
  if (body !== undefined && !(body instanceof FormData)) { headers['content-type'] = 'application/json'; b = JSON.stringify(body); }
  const r = await fetch(API + p, { method, headers, body: b });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch (_) { j = text; }
  return { status: r.status, body: j };
}

async function open(role, { phone = false, geo = false } = {}) {
  const browser = await chromium.connect(fs.readFileSync(path.join(R, 'ws'), 'utf8'));
  const ctx = await browser.newContext({
    viewport: phone ? VIEW.phone : VIEW.desk, colorScheme: 'light', locale: 'th-TH', timezoneId: 'Asia/Bangkok',
    ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
    ...(geo ? { geolocation: { latitude: 13.8623, longitude: 100.5146, accuracy: 8 }, permissions: ['geolocation'] } : {}),
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  const c = creds[role];
  if (role === 'applicant') {
    await page.goto(`${WEB}/auth/health/login`, { waitUntil: 'networkidle', timeout: 180000 });
    await page.fill('#identifier', c.login);
    await page.fill('#password', c.password);
    await Promise.all([page.waitForURL((u) => !/auth\/health\/login/.test(u.toString()), { timeout: 120000 }), page.locator('button[type=submit]').first().click()]);
  } else {
    await page.goto(`${WEB}/auth/provider/login`, { waitUntil: 'networkidle', timeout: 180000 });
    await page.fill('#provider-id', c.login);
    await page.fill('#provider-password', c.password);
    await Promise.all([page.waitForURL((u) => !/auth\/provider\/login/.test(u.toString()), { timeout: 120000 }), page.click('button[type=submit]')]);
  }
  return { browser, page };
}
async function shot(page, name, settle = 2500) {
  await page.waitForTimeout(settle);
  await page.evaluate(() => {
    const re = /\b\d{13}\b/g;
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let t; (t = w.nextNode());) if (re.test(t.nodeValue)) t.nodeValue = t.nodeValue.replace(re, '<masked>');
  }).catch(() => {});
  const text = await page.evaluate(() => document.body.innerText).catch(() => '');
  for (const x of SECRETS) if (x && text.includes(x)) throw new Error(`secret on screen ${name}`);
  fs.writeFileSync(path.join(SHOTS, `${name}.txt`), `${page.url().replace(WEB, '')}\n\n${scrub(text)}`);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
  console.log('shot', name);
}

function nextWorkingDayIso() {
  const d = new Date(Date.now() + 86400000);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const steps = {
  async revision() {
    for (const app of fx.revision) {
      const check = await api('reviewer', 'GET', `/api/provider/applications/${app.id}/document-check`);
      const slots = check.body?.data?.slots || [];
      for (const s of slots.filter((x) => x.satisfied && x.slotId !== 'sop_manual')) {
        const r = await api('reviewer', 'POST', `/api/provider/applications/${app.id}/document-reviews`, { slotId: s.slotId, verdict: 'ACCEPTED' });
        record({ app: app.label, door: 'verdict ACCEPTED', slot: s.slotId, status: r.status, round: r.body?.data?.round });
      }
      const more = await api('reviewer', 'POST', `/api/provider/applications/${app.id}/document-reviews`, {
        slotId: 'sop_manual', verdict: 'MORE_REQUESTED', reason: 'ทดสอบ-A8F: คู่มือ SOP อ่านไม่ออก กรุณาแนบฉบับที่ชัดเจน', dueDate: nextWorkingDayIso(),
      });
      record({ app: app.label, door: 'verdict MORE_REQUESTED', officerTypedDue: nextWorkingDayIso(), status: more.status, round: more.body?.data?.round, code: more.body?.code });
      const decide = await api('reviewer', 'POST', `/api/provider/applications/${app.id}/document-decision`, { action: 'REQUEST_MORE' });
      record({ app: app.label, door: 'decision REQUEST_MORE', status: decide.status, to: decide.body?.data?.status, code: decide.body?.code });
      const row = await prisma.application.findUnique({ where: { id: app.id }, select: { status: true, formData: true } });
      const asked = await api('applicant', 'GET', `/api/applications/${app.id}/requirements?includeReviews=1`);
      record({ app: app.label, door: 'applicant requirements', status: asked.status, shownDue: (asked.body?.data?.requestedDocuments || []).map((d) => d.dueDate), enforcedRevisionDueAt: row.formData.revisionDueAt, appStatus: row.status });
    }
    for (const app of fx.revision) {
      const phone = app.label === 'phone';
      const { browser, page } = await open('applicant', { phone });
      try {
        await page.goto(`${WEB}/health/applications/${app.id}/revision`, { waitUntil: 'networkidle', timeout: 180000 });
        await shot(page, `F01-${app.label}-1-revision-page`);
        const cta = page.getByText('อัปโหลดฉบับใหม่', { exact: true }).first();
        const tag = await cta.evaluate((el) => el.closest('a') ? `a href=${el.closest('a').getAttribute('href')}` : el.closest('button') ? 'button' : el.tagName);
        record({ app: app.label, door: 'revision cta element', tag });
        if (tag.startsWith('a ')) {
          await Promise.all([page.waitForURL(/applications\/new/, { timeout: 120000 }), cta.click()]);
          await shot(page, `F01-${app.label}-2-after-click`, 6000);
          record({ app: app.label, door: 'revision cta landed', url: page.url().replace(WEB, '') });
          continue;
        }
        const [chooser] = await Promise.all([page.waitForEvent('filechooser'), cta.click()]);
        const up = page.waitForResponse((r) => /draft-documents/.test(r.url()) && r.request().method() === 'POST');
        await chooser.setFiles(PDF);
        const ur = await up;
        record({ app: app.label, door: 'revision upload', status: ur.status(), body: scrub((await ur.text()).slice(0, 200)) });
        await page.getByText('อัปโหลดฉบับใหม่แล้ว', { exact: true }).first().waitFor({ timeout: 60000 });
        await shot(page, `F01-${app.label}-2-uploaded`);
        const send = page.waitForResponse((r) => /revision-resubmit/.test(r.url()) && r.request().method() === 'POST');
        await page.getByRole('button', { name: 'ส่งกลับให้เจ้าหน้าที่ตรวจ' }).click();
        const sr = await send;
        record({ app: app.label, door: 'revision resubmit', status: sr.status(), body: scrub((await sr.text()).slice(0, 200)) });
        await page.waitForURL(new RegExp(`/health/applications/${app.id}$`), { timeout: 120000 });
        await shot(page, `F01-${app.label}-3-sent-back`);
      } finally { await browser.close(); }
    }
  },

  async reviewerByApi() {
    for (const app of fx.revision) {
      const row = await prisma.application.findUnique({ where: { id: app.id }, select: { status: true } });
      if (row.status !== 'REVISION_REQUESTED') continue;
      const fd = new FormData();
      fd.append('file', new Blob([fs.readFileSync(PDF)], { type: 'application/pdf' }), 'sop-revised.pdf');
      fd.append('slotId', 'sop_manual'); fd.append('applicationId', app.id); fd.append('stepKey', 'revision');
      const up = await api('applicant', 'POST', '/api/applications/draft-documents', fd);
      const rs = await api('applicant', 'POST', `/api/applications/${app.id}/revision-resubmit`, {});
      record({ app: app.label, door: 'upload+resubmit through the doors (main has no screen path)', upload: up.status, resubmit: rs.status, code: rs.body?.code });
    }
  },

  async reviewer() {
    const app = fx.revision[0];
    const { browser, page } = await open('reviewer');
    try {
      await page.goto(`${WEB}/provider/reviewer/${app.id}/document-check`, { waitUntil: 'networkidle', timeout: 180000 });
      await shot(page, 'F13-reviewer-1-second-round');
      await page.getByRole('button', { name: 'ขอเอกสารเพิ่ม', exact: true }).first().click();
      await shot(page, 'F08-reviewer-2-request-form', 1500);
    } finally { await browser.close(); }
    const verdict = await api('reviewer', 'POST', `/api/provider/applications/${app.id}/document-reviews`, { slotId: 'sop_manual', verdict: 'ACCEPTED' });
    const rows = await prisma.applicationDocumentReview.findMany({ where: { applicationId: app.id, slotId: 'sop_manual' }, orderBy: { round: 'asc' }, select: { round: true, verdict: true, reason: true } });
    record({ app: app.label, door: 'second-round verdict', status: verdict.status, round: verdict.body?.data?.round, sopRows: rows.map((r) => `${r.round}:${r.verdict}:${r.reason ? 'reason' : '-'}`) });
  },

  async inspect() {
    for (const phone of [false, true]) {
      const label = phone ? 'phone' : 'desk';
      if (phone) {
        await prisma.farmAuditChecklistItem.deleteMany({ where: { auditId: fx.inspect.auditId } });
      }
      const { browser, page } = await open('inspector', { phone, geo: true });
      try {
        await page.goto(`${WEB}/provider/audits/${fx.inspect.id}/inspect`, { waitUntil: 'networkidle', timeout: 180000 });
        const start = page.getByRole('button', { name: /^เริ่มตรวจ/ }).first();
        if (await start.isVisible().catch(() => false)) { await start.click(); await page.waitForTimeout(3000); }
        const yes = page.getByText('ใช่', { exact: true });
        const total = await yes.count();
        for (let i = 0; i < total; i += 1) { await yes.nth(i).click(); await page.waitForTimeout(150); }
        await shot(page, `F04-${label}-1-all-answered`, 500);
        await page.getByRole('button', { name: /ทบทวนผลการตรวจ/ }).click();
        await page.waitForTimeout(3000);
        const stored = await prisma.farmAuditChecklistItem.count({ where: { auditId: fx.inspect.auditId, response: { in: ['PASS', 'FAIL', 'NA'] } } });
        const reviewText = await page.evaluate(() => document.body.innerText);
        record({ view: label, door: 'review opened', answeredOnScreen: total, storedOnServer: stored, reviewShowsYES: /\bYES\b/.test(reviewText), reviewShowsThaiYes: (reviewText.match(/\nใช่\n/g) || []).length });
        await shot(page, `F04-F10-${label}-2-review`, 500);
        if (phone) continue;
        await page.getByRole('button', { name: /ไปที่หน้าตัดสินผล/ }).click();
        await page.getByText('ผ่าน', { exact: true }).first().click();
        await page.locator('textarea[placeholder="สรุปผลการตรวจประเมินภาคสนาม"]').fill('ทดสอบ-A8F: ตรวจครบ 24 ข้อ');
        const rd = page.waitForResponse((r) => /\/decision$/.test(r.url()) && r.request().method() === 'POST');
        await page.getByRole('button', { name: /ส่งผลการตรวจ/ }).last().click();
        const cf = page.getByRole('button', { name: /ยืนยัน/ }).last();
        if (await cf.isVisible().catch(() => false)) await cf.click();
        const r = await rd;
        record({ view: label, door: 'field decision PASS', status: r.status(), body: scrub((await r.text()).slice(0, 400)) });
        await shot(page, `F04-${label}-3-decision-refusal`, 1500);
      } finally { await browser.close(); }
    }
  },

  async car() {
    const { browser, page } = await open('inspector');
    try {
      await page.goto(`${WEB}/provider/audits/${fx.car.id}`, { waitUntil: 'networkidle', timeout: 180000 });
      await shot(page, 'F05-1-jobsheet-with-evidence');
      const file = page.getByRole('button', { name: 'car_evidence.pdf' });
      if (await file.count()) {
        await file.first().click();
        await page.waitForTimeout(4000);
        await shot(page, 'F05-2-evidence-opened', 1000);
      } else {
        record({ door: 'job sheet evidence link', found: false, mentionsFile: (await page.evaluate(() => document.body.innerText)).includes('car_evidence.pdf') });
      }
      await page.goto(`${WEB}/provider/audits/${fx.carNone.id}`, { waitUntil: 'networkidle', timeout: 180000 });
      await shot(page, 'F05-3-jobsheet-no-evidence');
      const pass = page.getByRole('button', { name: 'ผ่าน', exact: true }).last();
      record({ door: 'no-evidence PASS button', disabled: await pass.isDisabled().catch(() => null) });
    } finally { await browser.close(); }
    const phoneRun = await open('inspector', { phone: true });
    try {
      await phoneRun.page.goto(`${WEB}/provider/audits/${fx.car.id}`, { waitUntil: 'networkidle', timeout: 180000 });
      await shot(phoneRun.page, 'F05-4-jobsheet-with-evidence-phone');
    } finally { await phoneRun.browser.close(); }
    const res = await api('inspector', 'POST', `/api/provider/auditor/applications/${fx.carNone.id}/audit-decisions`, { decision: 'PASS', notes: 'ทดสอบ-A8F' });
    record({ door: 'job-sheet PASS without evidence', status: res.status, code: res.body?.code, error: res.body?.error });
  },
};

(async () => {
  try { await steps[step](); } finally { await prisma.$disconnect(); }
})().catch((e) => { console.error('WALK ERR', scrub(e.message)); process.exit(1); });

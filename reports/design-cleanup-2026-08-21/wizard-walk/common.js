// Shared helpers for the wizard walkthrough scripts.
const path = require('path');

const OUT = 'C:/Users/charo/Documents/GitHub/GACP-Certification-Application/reports/design-cleanup-2026-08-21/wizard-walk';
const STATE_FILE = path.join(OUT, 'storageState.json');
const BASE = 'http://localhost:3000';
const PNG_FIXTURE = path.join(OUT, 'fixtures', 'pixel.png');
const PDF_FIXTURE = path.join(OUT, 'fixtures', 'doc.pdf');

// Upload the matching fixture into every currently-visible <input type=file>
// on the page. Picks the PDF fixture when the input's accept attribute is
// PDF-only, otherwise the PNG. Returns the count uploaded.
async function uploadAllFileInputs(page) {
  const inputs = page.locator('input[type="file"]');
  const count = await inputs.count();
  let uploaded = 0;
  for (let i = 0; i < count; i++) {
    const input = inputs.nth(i);
    try {
      const accept = (await input.getAttribute('accept')) || '';
      const pdfOnly = /pdf/i.test(accept) && !/(jpg|jpeg|png|webp|image)/i.test(accept);
      const file = pdfOnly ? PDF_FIXTURE : PNG_FIXTURE;
      await input.setInputFiles(file, { timeout: 5000 });
      uploaded++;
      await page.waitForTimeout(400);
    } catch (e) {
      console.log('  upload-skip', i, e.message.split('\n')[0]);
    }
  }
  return uploaded;
}

// Click the first ChoiceCard-style <button> whose visible text contains
// `text`. Uses substring containment (Playwright hasText) so option labels
// with a trailing description paragraph still match.
async function clickButtonWithText(page, text, opts = {}) {
  const btn = page.locator('button', { hasText: text }).first();
  await btn.waitFor({ state: 'visible', timeout: opts.timeout || 15000 });
  await btn.click();
}

// Open a Radix-style combobox trigger (associated via <label for>) and click
// the first (or text-matching) option in the listbox that appears in a portal.
async function selectComboboxFirst(page, labelText, opts = {}) {
  const trigger = page.getByLabel(labelText, { exact: true }).first();
  await trigger.waitFor({ state: 'visible', timeout: opts.timeout || 15000 });
  await trigger.click();
  const listbox = page.locator('[role="listbox"]').first();
  await listbox.waitFor({ state: 'visible', timeout: 10000 });
  const option = opts.optionText
    ? page.locator('[role="option"]', { hasText: opts.optionText }).first()
    : page.locator('[role="option"]').first();
  await option.waitFor({ state: 'visible', timeout: 10000 });
  await option.click();
}

// Some Input components bake a trailing "*" into the SAME text node as the
// label (no separating space) when `required` is set, so an exact-match
// getByLabel(labelText) with the clean label misses it. Try clean, then
// clean+"*", before falling back to a substring/regex match.
async function fillByLabel(page, labelText, value, opts = {}) {
  const attempts = [
    () => page.getByLabel(labelText, { exact: true }).first(),
    () => page.getByLabel(`${labelText}*`, { exact: true }).first(),
    () => page.getByLabel(new RegExp(`^${labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\*?$`)).first(),
  ];
  let lastErr;
  for (const make of attempts) {
    try {
      const field = make();
      await field.waitFor({ state: 'visible', timeout: opts.timeout || 8000 });
      await field.fill(String(value));
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function tickAllCheckboxes(page) {
  const boxes = page.locator('input[type="checkbox"]');
  const count = await boxes.count();
  for (let i = 0; i < count; i++) {
    const box = boxes.nth(i);
    if (await box.isVisible()) {
      await box.check({ force: true }).catch(() => {});
    }
  }
  return count;
}

async function login(chromium) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(BASE + '/auth/health/login', { waitUntil: 'networkidle', timeout: 180000 });
  await page.waitForTimeout(3000);
  await page.fill('#identifier', '1100100100012', { timeout: 60000 });
  await page.fill('#password', process.env.UAT_FARMER_PW, { timeout: 60000 });
  await page.click('button[type=submit]', { timeout: 60000 });
  await page.waitForURL((u) => u.pathname.startsWith('/health/'), { timeout: 60000 });
  await context.storageState({ path: STATE_FILE });
  console.log('LOGIN_OK', page.url());
  await browser.close();
}

async function dumpInteractive(page) {
  return page.evaluate(() => {
    function labelFor(el) {
      if (el.id) {
        const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (l) return l.textContent.trim();
      }
      const parentLabel = el.closest('label');
      if (parentLabel) return parentLabel.textContent.trim().slice(0, 200);
      if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
      return null;
    }
    const out = [];
    document.querySelectorAll('input, select, textarea, button').forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      out.push({
        i,
        tag: el.tagName.toLowerCase(),
        type: el.type || null,
        name: el.name || null,
        id: el.id || null,
        required: el.required || false,
        checked: el.checked || false,
        value: el.tagName.toLowerCase() === 'select' ? el.value : (el.value ? String(el.value).slice(0, 60) : null),
        placeholder: el.placeholder || null,
        text: el.tagName.toLowerCase() === 'button' ? el.textContent.trim().replace(/\s+/g, ' ').slice(0, 120) : null,
        label: labelFor(el),
        visible: rect.width > 0 && rect.height > 0,
      });
    });
    return out;
  });
}

// This dev server is extremely slow on a first hit of any route (observed:
// root took ~9 minutes to compile once). goto()'s own waitUntil lifecycle
// events are not a reliable readiness signal here — retry any operation
// that races a still-in-flight navigation ("Execution context was
// destroyed") or a not-yet-hydrated page, instead of failing the whole run.
async function retry(fn, { tries = 40, delayMs = 5000, label = 'op' } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = e.message || '';
      const transient = /Execution context was destroyed|Target closed|Target page.*closed|navigation|detached/i.test(msg);
      if (!transient && i > 2) throw e; // give a couple of grace attempts even for non-obviously-transient errors
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

/** Wait until the page is actually interactive: the wizard's own nav button
 * ("ถัดไป" or similar) is visible. Retries through navigation races and slow
 * first-hit compiles. */
async function waitForWizardReady(page, timeoutMs = 300000) {
  const deadline = Date.now() + timeoutMs;
  const selector = 'button:has-text("ถัดไป"), button:has-text("ยืนยันและส่งคำขอ"), button:has-text("บันทึกและไปขั้นตอนถัดไป")';
  while (Date.now() < deadline) {
    try {
      await page.locator(selector).first().waitFor({ state: 'visible', timeout: 8000 });
      return true;
    } catch {
      // still compiling / navigating — keep polling
    }
  }
  return false;
}

module.exports = {
  OUT, STATE_FILE, BASE, PNG_FIXTURE, PDF_FIXTURE,
  login, dumpInteractive,
  uploadAllFileInputs, clickButtonWithText, selectComboboxFirst, fillByLabel, tickAllCheckboxes,
  retry, waitForWizardReady,
};

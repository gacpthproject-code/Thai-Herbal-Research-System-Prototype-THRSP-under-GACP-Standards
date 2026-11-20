'use strict';

/*
 * Captures the round-5 screens, desktop and phone width, from the web app running on SHOT_WEB.
 * usage: node shot-capture.js <fixture.json> <out-dir>
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('/home/ubuntu/work/wt-dispatcher/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');

const WEB = process.env.SHOT_WEB || 'http://127.0.0.1:3731';
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };
const LONG = 240000;
const EDIT_MODE = JSON.stringify({ isEditMode: true });

/** A weekday at least `days` ahead, as the date input takes it (YYYY-MM-DD, Bangkok). */
function nextWorkingDayIso(days) {
    const day = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    while ([0, 6].includes(new Date(day.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })).getDay())) { day.setTime(day.getTime() + 24 * 60 * 60 * 1000); }
    return day.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}

const WIZARD_KEY = 'gacp_application_flow_state_v4';
const SUCCESS_TEXT = 'ตรวจสอบเอกสารเบื้องต้น';
// Same origin, no application code: a page here cannot race the wizard store for its IndexedDB key.
const STATIC_PAGE = '/images/company-logo.png';

/** Writes the wizard's persisted entry the way idb-keyval stores it (default DB, default store). */
async function writeWizard(page, value) {
    await page.evaluate(async ({ key, value: stored, flag }) => {
        await new Promise((resolve, reject) => {
            const open = indexedDB.open('keyval-store');
            open.onupgradeneeded = () => open.result.createObjectStore('keyval');
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
                const tx = open.result.transaction('keyval', 'readwrite');
                tx.objectStore('keyval').put(stored, key);
                tx.oncomplete = () => { open.result.close(); resolve(); };
                tx.onerror = () => reject(tx.error);
            };
        });
        window.sessionStorage.setItem('gacp_edit_mode', flag);
    }, { key: WIZARD_KEY, value, flag: EDIT_MODE });
}

/** What the wizard's persisted entry says now: ids and bookkeeping only. */
async function readWizard(page, ownerId) {
    return page.evaluate(async ({ key, owner }) => new Promise((resolve) => {
        const open = indexedDB.open('keyval-store');
        open.onupgradeneeded = () => open.result.createObjectStore('keyval');
        open.onerror = () => resolve({ error: String(open.error) });
        open.onsuccess = () => {
            const db = open.result;
            if (!db.objectStoreNames.contains('keyval')) { db.close(); resolve({ present: false }); return; }
            const request = db.transaction('keyval', 'readonly').objectStore('keyval').get(key);
            request.onsuccess = () => {
                db.close();
                if (request.result == null) { resolve({ present: false }); return; }
                try {
                    const parsed = JSON.parse(request.result);
                    const state = parsed.state || {};
                    resolve({
                        origin: window.location.origin, present: true, version: parsed.version, applicationId: state.applicationId ?? null, plantId: state.plantId ?? null,
                        ownerIsApplicant: state.ownerUserId === owner, currentStep: state.currentStep ?? null, syncStatus: state.syncStatus ?? null,
                        hydrationEpoch: state.hydrationEpoch ?? null, holderEntityId: state.holderEntityId ?? null,
                    });
                } catch (error) { resolve({ present: true, unparsable: String(error) }); }
            };
            request.onerror = () => { db.close(); resolve({ error: String(request.error) }); };
        };
    }), { key: WIZARD_KEY, owner: ownerId });
}

async function settle(page) {
    await page.waitForLoadState('networkidle', { timeout: 120000 }).catch(() => undefined);
    await page.waitForTimeout(800);
}

async function main() {
    const fixture = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    const outDir = process.argv[3];
    const only = process.argv[4] ? new Set(process.argv[4].split(',')) : null;
    fs.mkdirSync(outDir, { recursive: true });
    const browser = await chromium.launch();
    const host = new URL(WEB).hostname;
    const shots = [];
    const failures = [];
    const notes = [];
    const consoleErrors = [];

    const watch = (page, label) => {
        page.on('console', (msg) => { if (msg.type() === 'error') { consoleErrors.push({ label, text: msg.text().slice(0, 400) }); } });
        page.on('pageerror', (error) => consoleErrors.push({ label, text: `pageerror: ${String(error.message).slice(0, 400)}` }));
        return page;
    };
    // A dialog is shot at the viewport: a full-page shot stretches the page behind a fixed overlay.
    const shoot = async (page, name, size, { dialog = false } = {}) => {
        const file = path.join(outDir, `${name}-${size}.png`);
        await page.screenshot({ path: file, fullPage: !dialog });
        shots.push(path.basename(file));
    };
    const providerContext = async (viewport, role) => {
        const context = await browser.newContext({ viewport, locale: 'th-TH', timezoneId: 'Asia/Bangkok' });
        await context.addCookies([{ name: 'provider_token', value: fixture.tokens[role], domain: host, path: '/', httpOnly: true, sameSite: 'Lax' }]);
        return context;
    };
    const applicantContext = async (viewport) => {
        const context = await browser.newContext({ viewport, locale: 'th-TH', timezoneId: 'Asia/Bangkok' });
        await context.addCookies([{ name: 'auth_token', value: fixture.tokens.applicant, domain: host, path: '/', httpOnly: true, sameSite: 'Lax' }]);
        await context.addInitScript((user) => { try { window.localStorage.setItem('user', user); } catch { /* storage refused */ } }, JSON.stringify(fixture.applicant));
        return context;
    };
    const screen = async (label, run) => {
        if (only && !only.has(label.replace(/-(desktop|phone)$/, ''))) { return; }
        try { await run(); } catch (error) { failures.push({ label, error: String(error.message).slice(0, 3000) }); }
    };
    const pathOf = (page) => new URL(page.url()).pathname;

    // One visit to slot 12 with the wizard store seeded from `injectPath`. Records every /api answer,
    // the persisted store before and after, and the screen when the target text shows (or not) and
    // 10 s later, into /tmp/dispatcher-r5/debug-success-<size>-<label>.json and .png.
    const successAttempt = async (size, viewport, injectPath, label, shotName, { trace = false } = {}) => {
        const diag = { label, size, injectPath, network: [], console: [], idb: {}, body: {} };
        const context = await applicantContext(viewport);
        if (trace) { await context.addInitScript({ path: '/tmp/dispatcher-r5/finish/idb-trace-init.js' }); }
        const page = watch(await context.newPage(), `success-${label}-${size}`);
        const t0 = Date.now();
        const since = () => Date.now() - t0;
        page.on('console', (msg) => diag.console.push({ t: since(), type: msg.type(), text: msg.text().slice(0, msg.text().startsWith('[diag]') ? 1600 : 300) }));
        page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) { diag.network.push({ t: since(), navigated: frame.url().split('?')[0] }); } });
        page.on('requestfailed', (request) => {
            const url = new URL(request.url());
            if (url.pathname.startsWith('/api/')) { diag.network.push({ t: since(), method: request.method(), path: url.pathname + url.search, failed: request.failure()?.errorText ?? 'failed' }); }
        });
        page.on('response', async (response) => {
            const url = new URL(response.url());
            if (!url.pathname.startsWith('/api/')) { return; }
            const request = response.request();
            const entry = { t: since(), method: request.method(), path: url.pathname + url.search, status: response.status() };
            if (request.method() === 'POST' && url.pathname === '/api/applications/draft') {
                try { entry.sentApplicationId = JSON.parse(request.postData() || '{}').applicationId ?? null; } catch { entry.sentApplicationId = 'unparsable'; }
                try { const body = await response.json(); entry.code = body.code ?? body.errorCode ?? null; entry.answeredId = body.data?.draftId ?? body.data?.id ?? null; } catch { /* no body */ }
            }
            if (url.pathname === '/api/dispatch-due') {
                try { const body = await response.json(); entry.answer = body.data ?? body.code ?? null; } catch { /* no body */ }
            }
            if (request.method() === 'GET' && /^\/api\/applications\/[0-9a-f-]{36}$/.test(url.pathname)) {
                try { const body = await response.json(); entry.applicationStatus = body.data?.status ?? null; } catch { /* no body */ }
            }
            diag.network.push(entry);
        });
        const stored = JSON.stringify({
            state: { applicationId: fixture.ids.filed, ownerUserId: fixture.applicant.id, plantId: fixture.plantId, requestType: fixture.requestType },
            version: 0,
        });
        const file = `/tmp/dispatcher-r5/debug-success-${size}-${label}${process.env.DIAG_TAG ? `-${process.env.DIAG_TAG}` : ''}`;
        let found = false;
        let stillShown = false;
        let shownAfterMs = null;
        try {
            await page.goto(`${WEB}${injectPath}`, { timeout: LONG });
            await writeWizard(page, stored);
            diag.idb.afterWrite = await readWizard(page, fixture.applicant.id);
            await page.waitForTimeout(3000);
            diag.idb.threeSecondsLater = await readWizard(page, fixture.applicant.id);
            const opened = Date.now();
            await page.goto(`${WEB}/health/applications/new/step/12`, { timeout: LONG });
            try {
                await page.getByText(SUCCESS_TEXT).first().waitFor({ timeout: 90000 });
                found = true;
                shownAfterMs = Date.now() - opened;
            } catch { found = false; }
            diag.found = found;
            diag.shownAfterMs = shownAfterMs;
            diag.body.atCheck = (await page.innerText('body')).slice(0, 3000);
            diag.idb.atCheck = await readWizard(page, fixture.applicant.id);
            await page.screenshot({ path: `${file}-check.png`, fullPage: true });
            if (found && shotName) {
                await page.waitForTimeout(1500);
                await shoot(page, shotName, size);
            }
            await page.waitForTimeout(10000);
            stillShown = await page.getByText(SUCCESS_TEXT).first().isVisible().catch(() => false);
            diag.stillShownTenSecondsLater = stillShown;
            diag.body.tenSecondsLater = (await page.innerText('body')).slice(0, 3000);
            diag.idb.tenSecondsLater = await readWizard(page, fixture.applicant.id);
            diag.url = new URL(page.url()).pathname;
            await page.screenshot({ path: `${file}-later.png`, fullPage: true });
        } catch (error) {
            diag.error = String(error.message).slice(0, 500);
        } finally {
            fs.writeFileSync(`${file}.json`, JSON.stringify(diag, null, 2));
            await context.close();
        }
        return { found, stillShown, shownAfterMs, file: `${file}.json` };
    };

    for (const [size, viewport] of Object.entries(VIEWPORTS)) {
        await screen(`wizard-step3-${size}`, async () => {
            const context = await applicantContext(viewport);
            const page = watch(await context.newPage(), `wizard-step3-${size}`);
            await page.goto(`${WEB}/health/applications/new/step/3`, { timeout: LONG });
            await settle(page);
            await page.waitForTimeout(2000);
            if (pathOf(page) !== '/health/applications/new/step/3') {
                notes.push(`wizard-step3-${size}: the step guard sent the draft to ${pathOf(page)}; step 3 reopened with the edit-mode session flag`);
                await page.evaluate((flag) => window.sessionStorage.setItem('gacp_edit_mode', flag), EDIT_MODE);
                await page.goto(`${WEB}/health/applications/new/step/3`, { timeout: LONG });
                await settle(page);
            }
            const name = page.getByLabel('ชื่อผู้ติดต่อ ณ สถานที่ปลูก');
            await name.waitFor({ timeout: LONG });
            await page.getByText('ผู้ติดต่อหน้างาน', { exact: true }).first().scrollIntoViewIfNeeded();
            await page.waitForTimeout(600);
            await shoot(page, '01-wizard-step3-contact-required', size);
            await name.fill('นายสมศักดิ์ ดูแลแปลง');
            await page.getByLabel('โทรศัพท์ที่ติดต่อได้ ณ สถานที่ปลูก').fill('086-555-6666');
            await page.getByText('ได้แจ้งผู้ติดต่อแล้วว่าเจ้าหน้าที่จะโทรนัดและพบที่แปลง').first().waitFor({ timeout: 60000 });
            await page.getByText('ได้แจ้งผู้ติดต่อแล้วว่าเจ้าหน้าที่จะโทรนัดและพบที่แปลง').first().scrollIntoViewIfNeeded();
            await page.waitForTimeout(600);
            await shoot(page, '02-wizard-step3-someone-else-confirms', size);
            await context.close();
        });

        await screen(`success-${size}`, async () => {
            // Asked for alone, the success screen is a diagnosis run: first the way the round-5 author
            // seeded the wizard (from the privacy page, which runs app code), then from a static image,
            // which runs none. Only the second may become 03.
            if (only && only.size === 1 && only.has('success')) {
                await successAttempt(size, viewport, '/privacy-policy', 'privacy-page', null);
            }
            const outcome = await successAttempt(size, viewport, STATIC_PAGE, 'static-page', '03-success-step');
            // The evidence shot runs uninstrumented; a second visit logs the store's IndexedDB reads and writes.
            if (process.env.SHOT_SUCCESS_TRACE === '1') {
                await successAttempt(size, viewport, STATIC_PAGE, 'static-page-trace', null, { trace: true });
            }
            if (!outcome.found) { throw new Error(`success-${size}: "${SUCCESS_TEXT}" never shown; see ${outcome.file}`); }
            if (!outcome.stillShown) { throw new Error(`success-${size}: "${SUCCESS_TEXT}" was gone 10 s later; see ${outcome.file}`); }
            notes.push(`success-${size}: slot 12 opened directly with the wizard store (IndexedDB, written from ${STATIC_PAGE}) holding the id of a filed application (DOC_FEE_PAID) and the edit-mode session flag; shown after ${outcome.shownAfterMs} ms; still shown 10 s later: ${outcome.stillShown}`);
        });

        await screen(`booking-${size}`, async () => {
            const context = await providerContext(viewport, 'dispatcher');
            const openBooking = async (number, label) => {
                const page = watch(await context.newPage(), label);
                await page.goto(`${WEB}/provider/calendar`, { timeout: LONG });
                await settle(page);
                await page.getByText(number).first().waitFor({ timeout: LONG });
                const book = page.getByRole('button', { name: /จัดคู่นัดตรวจ/ });
                const card = page.locator('div').filter({ hasText: number }).filter({ has: book }).last();
                await card.getByRole('button', { name: /จัดคู่นัดตรวจ/ }).first().click();
                await page.getByText('ผู้ติดต่อหน้างาน').first().waitFor({ timeout: 60000 });
                return page;
            };
            let page = await openBooking(fixture.numbers.ready, `booking-with-${size}`);
            await page.getByRole('button', { name: /ดูชื่อและเบอร์ผู้ติดต่อหน้างาน/ }).click();
            await page.getByText('นายสมศักดิ์ ดูแลแปลง').first().waitFor({ timeout: 60000 });
            await page.getByText('นายสมศักดิ์ ดูแลแปลง').first().scrollIntoViewIfNeeded();
            await page.waitForTimeout(500);
            await shoot(page, '04-booking-with-site-contact', size, { dialog: true });
            await page.close();

            page = await openBooking(fixture.numbers.noContact, `booking-without-${size}`);
            const none = page.getByText('ยังไม่มีผู้ติดต่อหน้างาน').first();
            await none.waitFor({ timeout: 60000 });
            await none.scrollIntoViewIfNeeded();
            await page.waitForTimeout(500);
            await shoot(page, '05-booking-without-site-contact', size, { dialog: true });
            // The late-visit reasons are asked once the server refuses a late booking without one.
            await page.locator('input[type="date"]').first().fill(nextWorkingDayIso(8));
            const inspector = page.getByRole('combobox', { name: 'ผู้ตรวจพื้นที่' });
            await ((await inspector.count()) ? inspector : page.getByRole('combobox')).first().click();
            await page.getByRole('option').first().click();
            await page.getByRole('listbox').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
            const save = page.getByRole('button', { name: 'บันทึกนัดหมาย' });
            try {
                await save.click({ timeout: 30000 });
            } catch (error) {
                const box = await save.boundingBox().catch(() => null);
                const hit = box ? await page.evaluate(({ x, y }) => {
                    const element = document.elementFromPoint(x, y);
                    return element ? `${element.tagName.toLowerCase()} class="${String(element.className).slice(0, 160)}" text="${(element.textContent || '').trim().slice(0, 80)}"` : null;
                }, { x: box.x + box.width / 2, y: box.y + box.height / 2 }) : null;
                const dialogBox = await page.getByRole('dialog').first().boundingBox().catch(() => null);
                await page.screenshot({ path: `/tmp/dispatcher-r5/debug-booking-save-${size}.png` });
                throw new Error(`save click failed: box=${JSON.stringify(box)} dialog=${JSON.stringify(dialogBox)} viewport=${JSON.stringify(viewport)} element at its centre: ${hit}\n${error.message}`);
            }
            const lateReason = page.getByText('ไม่มีผู้ตรวจพื้นที่ว่างก่อนกำหนด').first();
            await lateReason.waitFor({ timeout: 60000 });
            await lateReason.click();
            await page.locator('[data-testid="stated-reason-lateVisit"]').scrollIntoViewIfNeeded();
            await page.waitForTimeout(500);
            await shoot(page, '05b-booking-late-reasons-with-sides', size, { dialog: true });
            // Can the dispatcher reach the confirm button once the reasons are asked? Measured, never clicked.
            const confirmButton = page.getByRole('button', { name: 'ยืนยันนัดหมายพร้อมเหตุผล' });
            const confirmBox = await confirmButton.boundingBox().catch(() => null);
            const dialogBox = await page.getByRole('dialog').first().boundingBox().catch(() => null);
            let trial = 'reachable';
            try { await confirmButton.click({ trial: true, timeout: 5000 }); } catch (error) { trial = String(error.message).split('\n').filter((line) => /outside of the viewport|intercepts|Timeout/.test(line)).slice(0, 2).join(' | ') || 'not reachable'; }
            notes.push(`booking-${size}: after the late-visit reasons appear, the confirm button box=${JSON.stringify(confirmBox)} dialog=${JSON.stringify(dialogBox)} viewport=${JSON.stringify(viewport)}; trial click: ${trial}`);
            await page.close();
            await context.close();
        });

        await screen(`inspector-${size}`, async () => {
            const context = await providerContext(viewport, 'inspector');
            const page = watch(await context.newPage(), `inspector-${size}`);
            await page.goto(`${WEB}/provider/audits/${fixture.ids.visit}`, { timeout: LONG });
            await settle(page);
            await page.getByRole('button', { name: /ดูชื่อและเบอร์ผู้ติดต่อหน้างาน/ }).first().click();
            await page.getByText('นายสมศักดิ์ ดูแลแปลง').first().waitFor({ timeout: 60000 });
            await page.getByText('ผู้ติดต่อหน้างาน').first().scrollIntoViewIfNeeded();
            await page.waitForTimeout(500);
            await shoot(page, '06-inspector-site-contact-only', size);
            await context.close();
        });

        await screen(`certificates-${size}`, async () => {
            const context = await providerContext(viewport, 'approver');
            const page = watch(await context.newPage(), `certificates-${size}`);
            await page.goto(`${WEB}/provider/certificates`, { timeout: LONG });
            await settle(page);
            await page.getByText(fixture.certificateNumbers[0]).first().waitFor({ timeout: LONG });
            await page.waitForTimeout(800);
            await shoot(page, '07-certificates-dashboard-no-contact', size);
            await context.close();
        });

        await screen(`applicant-reasons-${size}`, async () => {
            const context = await applicantContext(viewport);
            const page = watch(await context.newPage(), `applicant-reasons-${size}`);
            await page.goto(`${WEB}/health/applications/${fixture.ids.moved}`, { timeout: LONG });
            await settle(page);
            const heading = page.getByText('เหตุผลที่หน่วยตรวจบันทึกไว้').first();
            await heading.waitFor({ timeout: LONG });
            await heading.scrollIntoViewIfNeeded();
            await page.waitForTimeout(800);
            await shoot(page, '08-applicant-page-recorded-reasons', size);
            await context.close();
        });

        await screen(`decision-file-${size}`, async () => {
            const context = await providerContext(viewport, 'approver');
            const page = watch(await context.newPage(), `decision-file-${size}`);
            await page.goto(`${WEB}/provider/certification-decisions/${fixture.ids.decided}`, { timeout: LONG });
            await settle(page);
            const flag = page.locator('[data-testid="decision-file-impartiality-flag"]').first();
            await flag.waitFor({ timeout: LONG });
            await flag.scrollIntoViewIfNeeded();
            await page.waitForTimeout(800);
            await shoot(page, '09-approver-file-impartiality-flag', size);
            await context.close();
        });

        await screen(`privacy-${size}`, async () => {
            const context = await browser.newContext({ viewport, locale: 'th-TH', timezoneId: 'Asia/Bangkok' });
            const page = watch(await context.newPage(), `privacy-${size}`);
            await page.goto(`${WEB}/privacy-policy`, { timeout: LONG });
            await settle(page);
            const section = page.getByText(/ผู้ติดต่อหน้างาน/).first();
            await section.waitFor({ timeout: LONG });
            await section.scrollIntoViewIfNeeded();
            await page.waitForTimeout(600);
            await shoot(page, '10-privacy-notice-v1-3', size);
            await context.close();
        });
    }

    await browser.close();
    const indexFile = path.join(outDir, 'shots.json');
    const earlier = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : { shots: [], notes: [], failures: [], consoleErrors: [] };
    const rerun = (label) => Boolean(only) && [...only].some((key) => label === key || label.startsWith(`${key}-`));
    const merged = {
        shots: [...new Set([...earlier.shots, ...shots])].sort(),
        notes: [...earlier.notes.filter((note) => !rerun(note.split(':')[0])), ...notes],
        failures,
        consoleErrors: [...earlier.consoleErrors.filter((entry) => !rerun(entry.label)), ...consoleErrors],
    };
    fs.writeFileSync(indexFile, JSON.stringify(merged, null, 2));
    console.log('captured', shots.length, 'screens;', failures.length, 'failed');
    if (failures.length) { console.log(JSON.stringify(failures, null, 2)); }
    process.exit(failures.length ? 2 : 0);
}

main().catch((error) => { console.error('capture failed:', error.message); process.exit(1); });

'use strict';
// Walk the real doors through the browser: the inspector checks in and uploads photographs on
// the inspect page (phone viewport, geolocation granted), the inspector's PASS is recorded through
// the service, then the approver opens the read-only file (desktop) and we keep what it shows.
// usage: node walk.js <webBase> <fixture.json> <outDir> <label> <backendDir> <photosDir>
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('/home/ubuntu/work/GACP-Certification-Application/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');

const [BASE, FIXTURE, OUT, LABEL, BACKEND_DIR, PHOTOS_DIR] = process.argv.slice(2);
const fx = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
fs.mkdirSync(OUT, { recursive: true });
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${LABEL}-${name}.png`), fullPage: true });
const log = (m) => console.log(`[walk ${LABEL}] ${new Date().toISOString()} ${m}`);

async function login(page, providerId) {
    await page.goto(`${BASE}/auth/provider/login`, { waitUntil: 'networkidle', timeout: 180000 });
    await page.fill('#provider-id', providerId);
    await page.fill('#provider-password', fx.password);
    await Promise.all([
        page.waitForURL((u) => !/auth\/provider\/login/.test(u.toString()), { timeout: 180000 }),
        page.click('button[type="submit"]'),
    ]);
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const phone = await browser.newContext({
            viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
            locale: 'th-TH', timezoneId: 'Asia/Bangkok', colorScheme: 'light',
            geolocation: { latitude: 13.8622, longitude: 100.5145, accuracy: 8 }, permissions: ['geolocation'],
        });
        const page = await phone.newPage();
        page.on('console', (m) => { if (m.type() === 'error') log(`console.error ${m.text().slice(0, 200)}`); });
        await login(page, fx.inspectorProviderId);
        log('inspector logged in');
        await page.goto(`${BASE}/provider/audits/${fx.applicationId}/inspect`, { waitUntil: 'networkidle', timeout: 180000 });
        const startBtn = page.getByRole('button', { name: /เริ่มตรวจ/ });
        await startBtn.waitFor({ state: 'visible', timeout: 120000 });
        await shot(page, '01-inspector-start');
        const startRes = page.waitForResponse((r) => /\/audit\/onsite\/.*\/start/.test(r.url()), { timeout: 120000 });
        await startBtn.click();
        const sr = await startRes;
        log(`check-in ${sr.status()}`);
        const fileInput = page.locator('input[type="file"]').first();
        await fileInput.waitFor({ state: 'attached', timeout: 120000 });
        await shot(page, '02-inspector-checklist');
        const photos = fs.readdirSync(PHOTOS_DIR).filter((f) => f.endsWith('.jpg')).sort().map((f) => path.join(PHOTOS_DIR, f));
        const uploads = [];
        for (const file of photos) {
            const res = page.waitForResponse((r) => /\/audit\/onsite\/.*\/photo$/.test(r.url()), { timeout: 120000 });
            await fileInput.setInputFiles(file);
            const r = await res;
            const body = await r.json().catch(() => ({}));
            uploads.push({ file: path.basename(file), status: r.status(), photoId: body.data?.photoId || null, code: body.code || null });
            log(`photo ${path.basename(file)} -> ${r.status()}`);
        }
        await page.waitForTimeout(1500);
        await shot(page, '03-inspector-photos-uploaded');
        await phone.close();

        const finished = execFileSync('node', [path.join(__dirname, 'finish.js'), FIXTURE], { cwd: BACKEND_DIR, encoding: 'utf8', env: process.env });
        log(finished.trim());

        const desk = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'th-TH', timezoneId: 'Asia/Bangkok', colorScheme: 'light' });
        const ap = await desk.newPage();
        await login(ap, fx.approverProviderId);
        log('approver logged in');
        await ap.goto(`${BASE}/provider/certification-decisions/${fx.applicationId}`, { waitUntil: 'networkidle', timeout: 180000 });
        await ap.locator('[data-testid="decision-file-photos"]').waitFor({ state: 'visible', timeout: 120000 });
        await shot(ap, '04-approver-file');
        await ap.locator('[data-testid="decision-file-application"]').screenshot({ path: path.join(OUT, `${LABEL}-05-approver-application.png`) });
        await ap.locator('[data-testid="decision-file-photos"]').screenshot({ path: path.join(OUT, `${LABEL}-06-approver-photos.png`) });
        await ap.locator('[data-testid="decision-file-gps"]').screenshot({ path: path.join(OUT, `${LABEL}-07-approver-gps.png`) });
        const file = await ap.evaluate(async (id) => {
            const token = localStorage.getItem('accessToken');
            const r = await fetch(`/api/provider/auditor/applications/${id}/decision-file`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
            return { status: r.status, body: await r.json() };
        }, fx.applicationId);
        const d = file.body?.data || {};
        const summary = {
            label: LABEL, status: file.status, applicationNumber: fx.applicationNumber,
            farm: { latitude: d.application?.farmLatitude, longitude: d.application?.farmLongitude },
            gps: d.onsite?.gps, uploads,
            photos: (d.onsite?.photos || []).map((p) => ({ photoId: p.photoId, capturedAt: p.capturedAt, place: p.place, time: p.time, flags: p.flags })),
            photosText: await ap.locator('[data-testid="decision-file-photos"]').innerText(),
            gpsText: await ap.locator('[data-testid="decision-file-gps"]').innerText(),
        };
        fs.writeFileSync(path.join(OUT, `${LABEL}-decision-file.json`), JSON.stringify(summary, null, 2));
        log(`decision-file ${file.status}: photos ${summary.photos.length}, flags ${JSON.stringify(summary.photos.map((p) => p.flags))}`);
        await desk.close();
    } finally {
        await browser.close();
    }
})().catch((e) => { console.error(`[walk ${LABEL}] failed:`, e.message); process.exit(1); });

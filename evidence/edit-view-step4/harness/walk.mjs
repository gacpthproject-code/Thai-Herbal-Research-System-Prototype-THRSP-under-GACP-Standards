// Walks the [id]/edit door the way an applicant does, against a backend + Next dev pair
// started by run.sh: files a draft with step-4 answers through POST /api/applications/draft,
// opens the edit view in a real browser, starts the edit, looks at step 4, makes one edit,
// waits for the autosave, then reads the application back. Writes screenshots and a JSON
// record under evidence/edit-view-step4/<label>/.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('/home/ubuntu/work/GACP-Certification-Application/node_modules/.pnpm/node_modules/playwright');

const BACKEND = process.env.BACKEND_URL || 'http://127.0.0.1:8097';
const WEB = process.env.WEB_URL || 'http://127.0.0.1:3097';
const LABEL = process.argv[2] || 'run';
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', LABEL);
fs.mkdirSync(OUT, { recursive: true });

const PASSWORD = 'Test@12345';

function thaiId(prefix12) {
    const digits = prefix12.split('').map(Number);
    const sum = digits.reduce((acc, d, i) => acc + d * (13 - i), 0);
    return prefix12 + String((11 - (sum % 11)) % 10);
}

const STEP4 = Object.freeze({
    varieties: [{ kind: 'SEED', name: 'หางกระรอกภูพาน', origin: 'DOMESTIC', source: 'ศูนย์วิจัยสกลนคร', quantity: '400', unit: 'เมล็ด' }],
    varietiesNote: 'พันธุ์ที่สามปลูกในรอบถัดไป',
    processing: { plantPart: 'ช่อดอก', strain: 'หางกระรอกภูพาน', source: 'แปลงของตนเอง', quantity: '120', unit: 'กิโลกรัม' },
    certificationPurposes: ['EXPORT'],
});

const FARM = Object.freeze({
    siteName: 'แปลงหนองจอก', siteAddress: '45 หมู่ 3 ถนนเลียบคลอง', subDistrict: 'กระทุ่มราย', district: 'หนองจอก',
    province: 'กรุงเทพมหานคร', postalCode: '10530', sitePhone: '0891234567', siteContactName: 'สมศรี ดูแลแปลง',
    siteContactIsApplicant: false, siteContactInformed: true, landOwnership: 'OWNED',
    landDocumentDetail: { type: 'โฉนด', number: '12345', volume: '12', page: '34', issuedBy: 'สำนักงานที่ดินเขตหนองจอก' },
    areaSqm: '3200', coordinates: '13.8551, 100.8623', plantsPerCycle: '400', cyclesPerYear: '2', areaTypes: ['OUTDOOR'],
});

async function call(method, url, body, token) {
    const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
    return { status: res.status, json };
}

function fail(step, detail) {
    fs.writeFileSync(path.join(OUT, 'FAILED.json'), JSON.stringify({ step, detail }, null, 2));
    console.error(`[walk] FAILED at ${step}:`, JSON.stringify(detail).slice(0, 2000));
    process.exit(2);
}

const record = { label: LABEL, startedAt: new Date().toISOString() };
const stamp = String(Date.now()).slice(-9);
const healthId = thaiId(`3${stamp.padStart(11, '0')}`);

// 1. A fresh applicant through the real register and login doors.
const reg = await call('POST', `${BACKEND}/api/auth/health/register`, {
    healthId, password: PASSWORD, firstName: 'ทดสอบ', lastName: 'หน้าแก้ไข', phoneNumber: '0812345678',
    accountType: 'INDIVIDUAL', acceptedTermsOfService: true, acceptedPrivacyPolicy: true,
});
if (reg.status >= 300) fail('register', reg);
const login = await call('POST', `${BACKEND}/api/auth/health/login`, { identifier: healthId, password: PASSWORD });
const token = login.json?.data?.tokens?.accessToken || login.json?.data?.tokens?.access_token || login.json?.data?.token;
if (login.status >= 300 || !token) fail('login', { status: login.status, keys: Object.keys(login.json?.data || login.json || {}) });

// 2. A holder the draft is filed for.
const entity = await call('POST', `${BACKEND}/api/entities`, {
    type: 'JURISTIC', registrationNo: thaiId(`0105${stamp.slice(-8)}`),
    holder: {
        legalName: 'บริษัท ทดสอบหน้าแก้ไข จำกัด',
        signatory: { title: 'นาย', firstName: 'สมชาย', lastName: 'ใจดี', idCard: '3100600123450', nationality: 'ไทย' },
        contact: { address: '99 หมู่ 1 บางพลี สมุทรปราการ 10540', phone: '0812345678', email: '' },
    },
}, token);
const entityId = entity.json?.data?.id;
if (entity.status >= 300 || !entityId) fail('entity', entity);

// 3. The draft, with step-4 answers, through the real draft door.
const saveSession = `walk-${stamp}`;
const draft = await call('POST', `${BACKEND}/api/applications/draft`, {
    saveSession, saveSeq: 1, entityId, step: 5, plantId: 'cannabis', serviceType: 'NEW', cultivationMethods: ['outdoor'],
    formData: {
        plantId: 'cannabis', serviceType: 'NEW', serviceTypes: ['NEW'], requestType: 'NEW', certScope: 'PLANTING',
        previousCertificateNumber: null, cultivationMethods: ['outdoor'], siteTypes: ['OUTDOOR'],
        farmData: FARM, ...STEP4,
    },
}, token);
const applicationId = draft.json?.data?.draftId || draft.json?.data?.id;
if (draft.status >= 300 || !applicationId) fail('draft', draft);
record.applicationId = applicationId;

const step4Of = (formData) => ({
    varieties: formData?.varieties ?? null,
    varietiesNote: formData?.varietiesNote ?? null,
    processing: formData?.processing ?? null,
    certificationPurposes: formData?.certificationPurposes ?? null,
    serviceTypes: formData?.serviceTypes ?? null,
    previousCertificateNumber: formData?.previousCertificateNumber ?? null,
});
const readDetail = async () => (await call('GET', `${BACKEND}/api/applications/${applicationId}`, null, token)).json?.data;
const readDraft = async () => (await call('GET', `${BACKEND}/api/applications/draft`, null, token)).json?.data;

record.storedAfterFiling = step4Of((await readDraft())?.formData);
const detailBefore = await readDetail();
record.editDoorEchoes = step4Of(detailBefore?.formData);
record.editDoorFormDataKeys = Object.keys(detailBefore?.formData || {}).sort();

// 4. The browser: login, the edit view, start the edit, look at step 4, one edit, autosave.
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'th-TH' });
const page = await context.newPage();
const consoleErrors = [];
page.on('pageerror', (err) => consoleErrors.push(String(err)));
// Every draft save the wizard posts on its own, before and after the one edit below.
const draftPosts = [];
page.on('request', (req) => {
    if (req.url().includes('/api/applications/draft') && req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '{}');
        draftPosts.push({ at: new Date().toISOString(), applicationId: body.applicationId, step4: step4Of(body.formData) });
    }
});
try {
    await page.goto(`${WEB}/auth/health/login`, { waitUntil: 'networkidle', timeout: 180000 });
    // Typed after hydration: a value set before React takes over the inputs is reset by it.
    for (let attempt = 0; attempt < 3; attempt += 1) {
        await page.locator('#identifier').click();
        await page.locator('#identifier').pressSequentially(healthId, { delay: 20 });
        await page.locator('#password').click();
        await page.locator('#password').pressSequentially(PASSWORD, { delay: 20 });
        if ((await page.inputValue('#identifier')).replace(/-/g, '') === healthId && await page.inputValue('#password') === PASSWORD) break;
        await page.waitForTimeout(1000);
        await page.fill('#identifier', '');
        await page.fill('#password', '');
    }
    await page.screenshot({ path: path.join(OUT, 'login-filled.png') });
    await Promise.all([
        page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 180000 }),
        page.click('button[type="submit"]'),
    ]);
    record.afterLoginUrl = page.url();

    await page.goto(`${WEB}/health/applications/${applicationId}/edit`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    const start = page.getByRole('button', { name: /เริ่มแก้ไขคำขอ/ });
    await start.waitFor({ timeout: 180000 });
    await page.screenshot({ path: path.join(OUT, 'edit-landing-1440x900.png'), fullPage: true });
    await Promise.all([
        page.waitForURL(/\/health\/applications\/new\/step\/1/, { timeout: 180000 }),
        start.click(),
    ]);
    await page.goto(`${WEB}/health/applications/new/step/4`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForSelector('#variety-name-0', { timeout: 180000 });
    await page.waitForTimeout(4000);
    record.draftPostsBeforeEdit = draftPosts.slice();
    const seen = async (p) => ({
        varietyName: await p.inputValue('#variety-name-0'),
        varietySource: await p.inputValue('#variety-source-0'),
        varietyQuantity: await p.inputValue('#variety-qty-0'),
        varietyUnit: await p.inputValue('#variety-unit-0'),
    });
    record.step4OnScreen = await seen(page);
    await page.screenshot({ path: path.join(OUT, 'step4-1440x900.png'), fullPage: true });

    const phone = await context.newPage();
    await phone.setViewportSize({ width: 390, height: 844 });
    await phone.goto(`${WEB}/health/applications/new/step/4`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await phone.waitForSelector('#variety-name-0', { timeout: 180000 });
    await phone.waitForTimeout(1500);
    record.step4OnPhone = await seen(phone);
    await phone.screenshot({ path: path.join(OUT, 'step4-390x844.png'), fullPage: true });
    await phone.close();

    // One edit on step 4, then the autosave's own POST.
    const saved = page.waitForResponse((res) => res.url().includes('/api/applications/draft') && res.request().method() === 'POST', { timeout: 60000 });
    await page.fill('#variety-qty-0', '450');
    const response = await saved;
    const posted = JSON.parse(response.request().postData() || '{}');
    record.autosave = { status: response.status(), applicationId: posted.applicationId, sentStep4: step4Of(posted.formData) };
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, 'step4-after-edit-1440x900.png'), fullPage: true });
} catch (error) {
    await page.screenshot({ path: path.join(OUT, 'failure.png'), fullPage: true }).catch(() => {});
    record.browserError = String(error && error.stack || error);
} finally {
    record.pageErrors = consoleErrors;
    await browser.close();
}

// 5. What the server holds after that one edit.
record.storedAfterEdit = step4Of((await readDetail())?.formData);
record.storedAfterEditViaDraftDoor = step4Of((await readDraft())?.formData);
record.draftPosts = draftPosts;
// Postgres jsonb reorders object keys, so compare by content, not by key order.
const canonical = (v) => (Array.isArray(v) ? v.map(canonical)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v);
const sameJson = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const after = record.storedAfterEditViaDraftDoor;
record.step4Survived = sameJson(after.varieties, [{ ...STEP4.varieties[0], quantity: '450' }])
    && sameJson(after.processing, STEP4.processing)
    && after.varietiesNote === STEP4.varietiesNote
    && sameJson(after.serviceTypes, ['NEW']);
record.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(OUT, 'record.json'), JSON.stringify(record, null, 2));
console.log(JSON.stringify({ label: LABEL, step4Survived: record.step4Survived, browserError: record.browserError || null }, null, 2));
process.exit(record.browserError ? 2 : 0);

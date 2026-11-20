'use strict';
// Round-3 browser walk against the local stack, each scene at 390x844 and 1440x900:
// (A) draft D as a RENEWAL: step 3 shows the carried-over line over its complete answers with
//     ถัดไป live; step 4 shows the line and still asks the variety with ถัดไป dead;
// (B) the same draft flipped to a REPLACEMENT with no ข้อ ๒ field: step 3 names no gap, marks
//     no ข้อ ๒ box required, shows no line, ถัดไป live; step 4 with no variety, ถัดไป live, and
//     ถัดไป reaches step 5.
const fs = require('fs');
const path = require('path');
const { chromium } = require('/home/ubuntu/work/GACP-Certification-Application/apps/web-app/node_modules/@playwright/test');
const { PrismaClient } = require('/home/ubuntu/work/wt-filingfields/apps/backend/node_modules/@prisma/client');

const WEB = process.env.WALK_WEB_URL || 'http://localhost:3000';
const OUT = process.env.WALK_OUT || '/tmp/ff/r3/walk/shots';
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture.json'), 'utf8'));
const SIZES = { phone: { width: 390, height: 844 }, desktop: { width: 1440, height: 900 } };
const CARRIED = 'ข้อมูลยกมาจากคำขอครั้งก่อน';
const lines = [];
const say = (line) => { lines.push(line); console.log(line); };
const alerts = (page) => page.locator('[role="alert"]').allTextContents();
const statuses = async (page) => (await page.locator('[role="status"]').allTextContents()).join(' | ');
const nextButton = (page) => page.getByRole('button', { name: 'ถัดไป' });
const asterisks = async (page, ids) => {
    const out = {};
    for (const id of ids) { out[id] = await page.locator(`label[for="${id}"] span[aria-hidden]`).count(); }
    return JSON.stringify(out);
};

async function shoot(page, name) {
    for (const [tag, size] of Object.entries(SIZES)) {
        await page.setViewportSize(size);
        await page.waitForTimeout(400);
        const file = path.join(OUT, `${name}-${size.width}x${size.height}.png`);
        await page.screenshot({ path: file, fullPage: true });
        say(`  shot ${tag}: ${path.basename(file)}`);
    }
}

async function signedIn(browser) {
    const context = await browser.newContext({ viewport: SIZES.desktop, locale: 'th-TH' });
    await context.addInitScript(({ token, user }) => {
        window.localStorage.setItem('accessToken', token);
        window.localStorage.setItem('user', JSON.stringify(user));
        window.localStorage.setItem('lastActivity', String(Date.now()));
    }, { token: fx.token, user: { ...fx.userA, healthId: fx.userA.canonicalId, userType: 'health' } });
    const cookieRes = await context.request.post(`${WEB}/api/session/set-cookie`, { data: { token: fx.token, cookieName: 'auth_token' } });
    say(`  session cookie set: ${cookieRes.status()}`);
    return context;
}

/** Resume the draft the way an applicant does: open step 2, wait for the holder, press ถัดไป. */
async function resumeToStep3(page) {
    await page.goto(`${WEB}/health/applications/new/step/2`, { waitUntil: 'networkidle' });
    const next2 = nextButton(page);
    await next2.waitFor({ timeout: 60000 });
    for (let i = 0; i < 60 && await next2.isDisabled(); i += 1) { await page.waitForTimeout(1000); }
    say(`  step 2 ถัดไป enabled (holder complete): ${await next2.isEnabled()}`);
    await next2.click();
    await page.waitForURL(/\/step\/3/, { timeout: 30000 }).catch(async () => say(`  did not reach step 3: ${page.url()}`));
    await page.waitForSelector('#coordinates', { timeout: 60000 });
    await page.waitForTimeout(1500);
    say(`  step 3 landed on: ${page.url()} · site name shown: ${JSON.stringify(await page.inputValue('#site-name'))}`);
}

const IDS = ['coordinates', 'plants-per-cycle', 'cycles-per-year', 'land-doc-type', 'land-doc-number'];

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch();
    const failures = [];
    say(`round-3 walk at ${WEB} ${new Date().toISOString()}`);
    let context = await signedIn(browser);
    let page = await context.newPage();
    page.on('response', (res) => { if (res.status() >= 500) { failures.push(`${res.status()} ${res.url()}`); } });

    say('scene A: renewal');
    await resumeToStep3(page);
    say(`  step 3 statuses: ${await statuses(page)}`);
    say(`  step 3 carried-over line shown: ${(await statuses(page)).includes(CARRIED)}`);
    say(`  step 3 alerts (${(await alerts(page)).length}) · asterisks ${await asterisks(page, IDS)} · ถัดไป enabled: ${await nextButton(page).isEnabled()}`);
    await shoot(page, 'renewal-step3');
    await nextButton(page).click();
    await page.waitForURL(/\/step\/4/, { timeout: 30000 });
    await page.waitForSelector('#variety-name-0', { timeout: 60000 });
    await page.waitForTimeout(1500);
    const a4 = await alerts(page);
    say(`  step 4 carried-over line shown: ${(await statuses(page)).includes(CARRIED)} · alerts (${a4.length}): ${a4.join(' | ')} · ถัดไป disabled: ${await nextButton(page).isDisabled()}`);
    await shoot(page, 'renewal-step4');
    await context.close();

    say('scene B: the same draft as a replacement with no ข้อ ๒ field');
    const raw = new PrismaClient();
    await raw.application.update({ where: { id: fx.draftD }, data: { formData: fx.replacement, updatedAt: new Date() } });
    await raw.$disconnect();
    context = await signedIn(browser);
    page = await context.newPage();
    page.on('response', (res) => { if (res.status() >= 500) { failures.push(`${res.status()} ${res.url()}`); } });
    await resumeToStep3(page);
    say(`  step 3 coordinates value: ${JSON.stringify(await page.inputValue('#coordinates'))}`);
    say(`  step 3 carried-over line shown: ${(await statuses(page)).includes(CARRIED)}`);
    const b3 = await alerts(page);
    say(`  step 3 alerts (${b3.length}): ${b3.join(' | ')} · asterisks ${await asterisks(page, IDS)} · ถัดไป enabled: ${await nextButton(page).isEnabled()}`);
    await shoot(page, 'replacement-step3');
    await nextButton(page).click();
    await page.waitForURL(/\/step\/4/, { timeout: 30000 });
    await page.waitForSelector('#variety-name-0', { timeout: 60000 });
    await page.waitForTimeout(1500);
    const b4 = await alerts(page);
    say(`  step 4 alerts (${b4.length}): ${b4.join(' | ')} · variety asterisk ${await asterisks(page, ['variety-name-0'])} · carried-over line shown: ${(await statuses(page)).includes(CARRIED)} · ถัดไป enabled: ${await nextButton(page).isEnabled()}`);
    await shoot(page, 'replacement-step4');
    await nextButton(page).click();
    await page.waitForURL(/\/step\/5/, { timeout: 30000 }).catch(() => {});
    say(`  after ถัดไป on step 4: ${page.url()}`);

    say(`  5xx responses: ${failures.length ? failures.join(', ') : 'none'}`);
    fs.writeFileSync(path.join(OUT, 'walk-output.txt'), `${lines.join('\n')}\n`);
    await browser.close();
})().catch((error) => {
    console.error(`WALK FAILED: ${error.message.split('\n')[0]}`);
    fs.writeFileSync(path.join(OUT, 'walk-output.txt'), `${lines.join('\n')}\nWALK FAILED: ${error.message.split('\n')[0]}\n`);
    process.exit(1);
});

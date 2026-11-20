'use strict';
// Round-2 browser walk against the local stack. Three scenes, each at 390x844 and 1440x900:
// (M4) draft D resumed straight onto step 3 names every กทล.1 gap on landing with ถัดไป dead;
// (M4) step 4 re-entered with a purpose chosen and no variety names the gap on landing;
// (I2) the revision page's ส่งกลับ refused 422 shows the field in Thai with the edit link.
const fs = require('fs');
const path = require('path');
const { chromium } = require('/home/ubuntu/work/GACP-Certification-Application/apps/web-app/node_modules/@playwright/test');

const WEB = process.env.WALK_WEB_URL || 'http://localhost:3000';
const OUT = process.env.WALK_OUT || '/tmp/ff/r2/walk/shots';
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture.json'), 'utf8'));
const SIZES = { phone: { width: 390, height: 844 }, desktop: { width: 1440, height: 900 } };
const lines = [];
const say = (line) => { lines.push(line); console.log(line); };
const alerts = (page) => page.locator('[role="alert"]').allTextContents();

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

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch();
    const failures = [];
    say(`round-2 walk at ${WEB} ${new Date().toISOString()}`);

    // Scene 1: resumed draft lands on step 3 (M4).
    const context = await signedIn(browser);
    const page = await context.newPage();
    page.on('response', (res) => { if (res.status() >= 500) { failures.push(`${res.status()} ${res.url()}`); } });
    // In the way an applicant resumes: the wizard opens on step 2 (the holder is read there),
    // the draft is hydrated from the server, and ถัดไป lands on step 3 with nothing typed.
    await page.goto(`${WEB}/health/applications/new/step/2`, { waitUntil: 'networkidle' });
    say(`  landed on: ${page.url()}`);
    const next2 = page.getByRole('button', { name: 'ถัดไป' });
    await next2.waitFor({ timeout: 60000 });
    for (let i = 0; i < 60 && await next2.isDisabled(); i += 1) { await page.waitForTimeout(1000); }
    say(`  step 2 ถัดไป enabled (holder complete): ${await next2.isEnabled()}`);
    await next2.click();
    await page.waitForURL(/\/step\/3/, { timeout: 30000 }).catch(async () => say(`  did not reach step 3: ${page.url()}`));
    await page.waitForSelector('#coordinates', { timeout: 60000 });
    await page.waitForTimeout(1500);
    say(`  step 3 landed on: ${page.url()} · site name shown: ${JSON.stringify(await page.inputValue('#site-name'))}`);
    const a3 = await alerts(page);
    say(`  step 3 alerts on landing, nothing touched (${a3.length}): ${a3.join(' | ')}`);
    say(`  step 3 ถัดไป disabled: ${await page.getByRole('button', { name: 'ถัดไป' }).isDisabled()}`);
    await shoot(page, 'step3-resumed-gaps');

    // Scene 2: complete step 3, choose a purpose on step 4, leave, and come back (M4).
    await page.getByRole('button', { name: 'เป็นเจ้าของที่ดินเอง' }).click();
    await page.fill('#land-doc-type', 'โฉนด');
    await page.fill('#land-doc-number', '12345');
    await page.fill('#coordinates', '18.7883, 98.9853');
    await page.fill('#plants-per-cycle', '500');
    await page.fill('#cycles-per-year', '2');
    await page.waitForTimeout(500);
    say(`  step 3 alerts after filling (${(await alerts(page)).length}) · ถัดไป enabled: ${await page.getByRole('button', { name: 'ถัดไป' }).isEnabled()}`);
    await page.getByRole('button', { name: 'ถัดไป' }).click();
    await page.waitForURL(/\/step\/4/, { timeout: 30000 });
    await page.waitForSelector('#variety-name-0', { timeout: 60000 });
    await page.getByRole('button', { name: 'ส่งออกเพื่อการค้า (ภ.ท. 10)' }).click();
    await page.waitForTimeout(3500);
    say(`  step 4 alerts after choosing a purpose only (${(await alerts(page)).length})`);
    await page.goto(`${WEB}/health/applications/new/step/3`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#coordinates', { timeout: 60000 });
    await page.goto(`${WEB}/health/applications/new/step/4`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#variety-name-0', { timeout: 60000 });
    await page.waitForTimeout(1500);
    const a4 = await alerts(page);
    say(`  step 4 re-entered, nothing touched: alerts (${a4.length}): ${a4.join(' | ')}`);
    say(`  step 4 ถัดไป disabled: ${await page.getByRole('button', { name: 'ถัดไป' }).isDisabled()}`);
    await shoot(page, 'step4-resumed-gap');

    // Scene 3: the revision door refuses by field name (I2).
    await page.goto(`${WEB}/health/applications/${fx.revision}/revision`, { waitUntil: 'networkidle' });
    const send = page.getByRole('button', { name: 'ส่งกลับให้เจ้าหน้าที่ตรวจ' });
    await send.waitFor({ timeout: 60000 });
    for (let i = 0; i < 30 && await send.isDisabled(); i += 1) { await page.waitForTimeout(1000); }
    say(`  revision page: ส่งกลับ enabled: ${await send.isEnabled()}`);
    await send.click();
    await page.waitForTimeout(2500);
    const aR = await alerts(page);
    say(`  revision alerts after refusal (${aR.length}): ${aR.join(' | ')}`);
    const edit = page.getByRole('link', { name: 'แก้ไขข้อมูลในคำขอ' });
    say(`  edit link: ${await edit.count()} · href: ${await edit.first().getAttribute('href').catch(() => null)}`);
    say(`  raw code on screen: ${(await page.textContent('body')).includes('APPLICATION_INCOMPLETE')}`);
    await shoot(page, 'revision-refused');

    say(`  5xx responses: ${failures.length ? failures.join(', ') : 'none'}`);
    fs.writeFileSync(path.join(OUT, 'walk-output.txt'), `${lines.join('\n')}\n`);
    await browser.close();
})().catch((error) => {
    console.error(`WALK FAILED: ${error.message.split('\n')[0]}`);
    fs.writeFileSync(path.join(OUT, 'walk-output.txt'), `${lines.join('\n')}\nWALK FAILED: ${error.message.split('\n')[0]}\n`);
    process.exit(1);
});

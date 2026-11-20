'use strict';
// Browser walk of steps 3 and 4 against the local stack: the inline กทล.1 field messages at
// 390x844 and 1440x900, then step 3 filled and step 4's variety message. Prints statuses only.
const fs = require('fs');
const path = require('path');
const { chromium } = require('/home/ubuntu/work/GACP-Certification-Application/apps/web-app/node_modules/@playwright/test');

const WEB = process.env.WALK_WEB_URL || 'http://localhost:3000';
const OUT = process.env.WALK_OUT || '/tmp/ff/walk/shots';
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture.json'), 'utf8'));
const SIZES = { phone: { width: 390, height: 844 }, desktop: { width: 1440, height: 900 } };
const lines = [];
const say = (line) => { lines.push(line); console.log(line); };

async function shoot(page, name) {
    for (const [tag, size] of Object.entries(SIZES)) {
        await page.setViewportSize(size);
        await page.waitForTimeout(400);
        const file = path.join(OUT, `${name}-${size.width}x${size.height}.png`);
        await page.screenshot({ path: file, fullPage: true });
        say(`  shot ${tag}: ${path.basename(file)}`);
    }
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: SIZES.desktop, locale: 'th-TH' });
    await context.addInitScript(({ token, user }) => {
        window.localStorage.setItem('accessToken', token);
        window.localStorage.setItem('user', JSON.stringify(user));
        window.localStorage.setItem('lastActivity', String(Date.now()));
    }, { token: fx.token, user: { ...fx.userA, healthId: fx.userA.canonicalId, userType: 'health' } });
    const page = await context.newPage();
    const failures = [];
    page.on('response', (res) => { if (res.status() >= 500) { failures.push(`${res.status()} ${res.url()}`); } });

    say(`walk steps 3-4 at ${WEB} ${new Date().toISOString()}`);
    // The middleware gates /health on the httpOnly auth_token cookie, which the web app sets
    // through its own route after login; the same route, with the minted token.
    const cookieRes = await context.request.post(`${WEB}/api/session/set-cookie`, { data: { token: fx.token, cookieName: 'auth_token' } });
    say(`  session cookie set: ${cookieRes.status()}`);
    // In through step 2 as an applicant does: the holder record is read there, then ถัดไป.
    await page.goto(`${WEB}/health/applications/new/step/2`, { waitUntil: 'networkidle' });
    say(`  landed on: ${page.url()}`);
    const next2 = page.getByRole('button', { name: 'ถัดไป' });
    await next2.waitFor({ timeout: 60000 });
    for (let i = 0; i < 60 && await next2.isDisabled(); i += 1) { await page.waitForTimeout(1000); }
    say(`  step 2 ถัดไป enabled (holder complete): ${await next2.isEnabled()}`);
    await next2.click();
    await page.waitForURL(/\/step\/3/, { timeout: 30000 });
    await page.waitForSelector('#coordinates', { timeout: 60000 });
    say(`  step 3 reached: ${page.url()}`);

    // The site and contact, so the only gaps left are the กทล.1 fields under test.
    await page.fill('#site-name', 'แปลงสมุนไพรบ้านทดสอบ');
    await page.fill('#site-address', '99/9 หมู่ 3');
    await page.fill('#site-subdistrict', 'หนองหาร');
    await page.fill('#site-district', 'สันทราย');
    await page.fill('#site-province', 'เชียงใหม่');
    await page.fill('#site-contact-name', 'สมชาย ใจดี');
    await page.fill('#site-phone', '081-234-5678');
    await page.check('#site-contact-informed').catch(() => {});
    await page.getByRole('button', { name: 'กลางแจ้ง' }).click();
    await page.fill('#area-sqm', '1600');
    // Wrong values are named at once; blanks are named once left.
    await page.fill('#coordinates', 'หน้าวัด');
    await page.fill('#plants-per-cycle', '0');
    await page.focus('#cycles-per-year'); await page.focus('#land-doc-type'); await page.focus('#land-doc-number'); await page.focus('#area-sqm');
    await page.waitForTimeout(300);
    const alerts3 = await page.locator('[role="alert"]').allTextContents();
    say(`  step 3 alerts (${alerts3.length}): ${alerts3.join(' | ')}`);
    const nextDisabled = await page.getByRole('button', { name: 'ถัดไป' }).isDisabled();
    say(`  step 3 ถัดไป disabled while incomplete: ${nextDisabled}`);
    await shoot(page, 'step3-errors');

    // Fill the fields the paper asks; the button comes alive.
    await page.getByRole('button', { name: 'เป็นเจ้าของที่ดินเอง' }).click();
    await page.fill('#land-doc-type', 'โฉนด');
    await page.fill('#land-doc-number', '12345');
    await page.fill('#coordinates', '18.7883, 98.9853');
    await page.fill('#plants-per-cycle', '500');
    await page.fill('#cycles-per-year', '2');
    await page.waitForTimeout(500);
    const alertsAfter = await page.locator('[role="alert"]').allTextContents();
    const nextEnabled = await page.getByRole('button', { name: 'ถัดไป' }).isEnabled();
    say(`  step 3 alerts after filling (${alertsAfter.length}) · ถัดไป enabled: ${nextEnabled}`);
    await shoot(page, 'step3-complete');
    await page.getByRole('button', { name: 'ถัดไป' }).click();
    await page.waitForURL(/\/step\/4/, { timeout: 30000 });
    await page.waitForSelector('#variety-name-0', { timeout: 60000 });
    say(`  step 4 reached: ${page.url()}`);

    await page.getByRole('button', { name: 'ส่งออกเพื่อการค้า (ภ.ท. 10)' }).click();
    await page.getByRole('button', { name: 'เมล็ดพันธุ์' }).first().click();
    await page.waitForTimeout(300);
    const alerts4 = await page.locator('[role="alert"]').allTextContents();
    say(`  step 4 alerts (${alerts4.length}): ${alerts4.join(' | ')}`);
    say(`  step 4 ถัดไป disabled without a variety: ${await page.getByRole('button', { name: 'ถัดไป' }).isDisabled()}`);
    await shoot(page, 'step4-errors');
    await page.fill('#variety-name-0', 'หางกระรอกภูพาน');
    await page.waitForTimeout(500);
    say(`  step 4 alerts after naming (${(await page.locator('[role="alert"]').allTextContents()).length}) · ถัดไป enabled: ${await page.getByRole('button', { name: 'ถัดไป' }).isEnabled()}`);
    await shoot(page, 'step4-complete');

    say(`  5xx responses: ${failures.length ? failures.join(', ') : 'none'}`);
    fs.writeFileSync(path.join(OUT, 'walk-output.txt'), `${lines.join('\n')}\n`);
    await browser.close();
})().catch((error) => { console.error(`WALK FAILED: ${error.message.split('\n')[0]}`); process.exit(1); });

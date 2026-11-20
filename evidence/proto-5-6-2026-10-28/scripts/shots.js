'use strict';
// Browser walk of prototypes 5 and 6 on the local stack, at 1440x900 and 390x844.
// Applicant: herb list and two herb pages. Field inspector: herb admin pages, then the image
// assessment page with three sample photos. Prints statuses only, never a token.
const fs = require('fs');
const path = require('path');
const { chromium } = require('/home/ubuntu/work/GACP-Certification-Application/apps/web-app/node_modules/@playwright/test');

const WEB = process.env.WALK_WEB_URL || 'http://localhost:3000';
const OUT = process.env.WALK_OUT || '/tmp/proto56/walk/shots';
const SAMPLES = '/tmp/proto56/walk/samples';
const fx = JSON.parse(fs.readFileSync('/tmp/proto56/secret/fixture.json', 'utf8'));
const SIZES = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };
const say = (line) => console.log(line);

async function shoot(page, name) {
    for (const size of Object.values(SIZES)) {
        await page.setViewportSize(size);
        await page.waitForTimeout(600);
        const file = path.join(OUT, `${name}-${size.width}x${size.height}.png`);
        await page.screenshot({ path: file, fullPage: true });
        say(`  shot ${path.basename(file)}`);
    }
    await page.setViewportSize(SIZES.desktop);
}

async function session(browser, user, cookieName) {
    const context = await browser.newContext({ viewport: SIZES.desktop, locale: 'th-TH' });
    await context.addInitScript(({ token, profile }) => {
        window.localStorage.setItem('accessToken', token);
        window.localStorage.setItem('user', JSON.stringify(profile));
        window.localStorage.setItem('lastActivity', String(Date.now()));
    }, { token: user.token, profile: { ...user, token: undefined, userType: user.role === 'health' ? 'health' : 'provider' } });
    const res = await context.request.post(`${WEB}/api/session/set-cookie`, { data: { token: user.token, cookieName } });
    say(`  ${user.role} session cookie: ${res.status()}`);
    const page = await context.newPage();
    page.on('response', (r) => { if (r.status() >= 500 || (r.url().includes('/api/') && r.status() >= 400)) { say(`  ! ${r.status()} ${r.url()}`); } });
    return page;
}

async function visit(page, url, waitFor, name) {
    await page.goto(`${WEB}${url}`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForSelector(waitFor, { timeout: 120000 });
    say(`  ${url} -> ${page.url().replace(WEB, '')}`);
    await shoot(page, name);
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch();
    say(`walk prototypes 5 and 6 at ${WEB} ${new Date().toISOString()}`);

    const farmer = await session(browser, fx.farmer, 'auth_token');
    await visit(farmer, '/health/herbs', 'text=กระท่อม', 'p5-01-health-herbs');
    await visit(farmer, '/health/herbs/KRATOM', 'text=พ.ร.บ.พืชกระท่อม พ.ศ. 2565', 'p5-02-health-kratom');
    say(`  kratom source links: ${await farmer.locator('a[href^="https://"]').count()}`);
    const newsLabels = await farmer.locator('text=แหล่งข่าว ยังไม่ได้ตรวจกับราชกิจจานุเบกษา').count();
    say(`  kratom news labels: ${newsLabels}`);
    if (newsLabels !== 4) { throw new Error(`expected 4 news labels on KRATOM, saw ${newsLabels}`); }
    await visit(farmer, '/health/herbs/CANNABIS', 'text=เกณฑ์ปริมาณ THC ในช่อดอก', 'p5-03-health-cannabis');

    const inspector = await session(browser, fx.inspector, 'provider_token');
    await visit(inspector, '/provider/herbs', 'text=มีแหล่งอ้างอิง', 'p5-04-provider-herbs');
    await visit(inspector, '/provider/herbs/TURMERIC', 'text=เกณฑ์ปริมาณ curcuminoids', 'p5-05-provider-turmeric');
    const writeButtons = await inspector.getByRole('button', { name: /เพิ่มรายการ|นำเข้าจำนวนมาก/ }).count();
    say(`  turmeric write buttons for field_inspector: ${writeButtons}`);
    if (writeButtons !== 0) { throw new Error(`field_inspector still sees ${writeButtons} write buttons`); }

    await visit(inspector, '/provider/image-assessment', '[data-testid="model-card"]', 'p6-01-image-assessment-empty');
    const card = await inspector.locator('[data-testid="model-card"]').textContent();
    say(`  model card says target not measured on herbs: ${card.includes('ยังไม่ได้วัดบนสมุนไพร 6 ชนิด')} · says 'ขึ้นไป': ${card.includes('ขึ้นไป')}`);
    if (!card.includes('ยังไม่ได้วัดบนสมุนไพร 6 ชนิด') || card.includes('เป้าตามสัญญา 85% ขึ้นไป')) { throw new Error('model card target sentence is wrong'); }
    for (const sample of ['powdery-mildew-correct', 'virus-correct', 'leaf-spot-wrong']) {
        await inspector.setInputFiles('#ia-file', path.join(SAMPLES, `${sample}.jpg`));
        await inspector.getByRole('button', { name: 'ประเมินภาพ' }).click();
        await inspector.waitForSelector('[data-testid="disease-result"]', { timeout: 60000 });
        const verdict = await inspector.locator('[data-testid="disease-result"] p.text-base').textContent();
        say(`  ${sample}: ${verdict}`);
        await shoot(inspector, `p6-02-assess-${sample}`);
    }
    await browser.close();
})().catch((error) => { console.error(error.message); process.exit(1); });

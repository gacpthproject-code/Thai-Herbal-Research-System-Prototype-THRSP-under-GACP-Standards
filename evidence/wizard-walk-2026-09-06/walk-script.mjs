import { chromium } from '@playwright/test';
const BASE = 'http://127.0.0.1:3099';
const OUT = '/home/ubuntu/work/GACP-Certification-Application/evidence/wizard-walk-2026-09-06';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1800 }, locale: 'th-TH' })).newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url().replace(BASE, '')}`); });
page.on('request', (r) => { if (r.method() !== 'GET') console.log(`  [REQ ${r.method()}] ${r.url().replace(BASE,'')}`); });
page.on('requestfailed', (r) => errors.push(`NETFAIL ${r.url()} :: ${r.failure()?.errorText}`));
page.on('response', async (r) => {
    if (r.url().includes('/requirements')) {
        let b = ''; try { b = (await r.text()).slice(0, 300); } catch {}
        console.log(`  [REQUIREMENTS ${r.status()}] ${r.url().replace(BASE,'')} :: ${b}`);
    }
    if (r.url().includes('/applications/draft')) {
        let body = ''; try { body = (await r.text()).slice(0, 220); } catch {}
        console.log(`  [DRAFT ${r.request().method()} ${r.status()}] ${r.url().replace(BASE,'')} :: ${body}`);
    }
});

async function dump(tag, from) {
    const t = await page.innerText('body');
    const i = from ? t.indexOf(from) : 0;
    console.log(`\n=== ${tag} ===  url: ${page.url()}`);
    console.log(t.slice(i < 0 ? 0 : i, (i < 0 ? 0 : i) + 2200));
    await page.screenshot({ path: `${OUT}/${tag}.png`, fullPage: true });
}
async function next() {
    const b = page.locator('button:has-text("ถัดไป")').first();
    const dis = await b.isDisabled();
    if (dis) { console.log('!! ปุ่มถัดไปยังกดไม่ได้ — หยุดตรงนี้'); return false; }
    await b.click(); await page.waitForTimeout(3000); return true;
}

await page.goto(`${BASE}/auth/health/login`, { waitUntil: 'networkidle', timeout: 90000 });
await page.fill('#identifier', '1100100100012');
await page.fill('#password', 'Test@12345');
await page.click('button:has-text("เข้าสู่ระบบ")');
await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 90000 }).catch(() => null);

await page.goto(`${BASE}/health/applications/new/step/1`, { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(1500);
await page.click('text=ยังไม่เคยได้รับใบรับรอง GACP สำหรับแปลงนี้');
await page.waitForTimeout(400);
await page.click('text=ขอรับรองแหล่งผลิตในขั้นการเพาะปลูกและเก็บเกี่ยว');
await page.click('text=จดทะเบียนวิสาหกิจชุมชนและยื่นในนามกลุ่ม');
// autosave debounce = 3000ms — คนจริงใช้เวลามากกว่านี้ รอให้ร่างถูกสร้างก่อน
await page.waitForTimeout(6000);
const head = (await page.innerText('body')).split('\n').slice(0, 12).join(' | ');
console.log('แถบบนสุด:', head);
await dump('02-step1-filled', 'ประเภทคำขอและผู้ยื่น');
if (await next()) {
    await dump('03-step2', 'ตัวตนผู้ยื่นคำขอ');
    const FILL2 = {
        'identity-communityName': 'วิสาหกิจชุมชนสมุนไพรบ้านทดสอบ',
        'identity-presidentName': 'สมชาย เกษตรทอง',
        'identity-presidentIdCard': '1100100100012',
        'identity-nationality': 'ไทย',
        'identity-communityRegistrationNo': '5-50-07-11/1-0001',
        'identity-houseCode': '12345678901',
        'identity-address': '99/9 หมู่ 3 ตำบลทดสอบ อำเภอสันทราย จังหวัดเชียงใหม่ 50210',
        'identity-phone': '0812345678',
        'identity-email': 'somchai@gacpth.com',
    };
    for (const [id, v] of Object.entries(FILL2)) {
        const el = page.locator(`#${id}`);
        if (await el.count()) { await el.fill(v); }
    }
    await page.waitForTimeout(4000);

    if (await next()) {
        // รอให้ hydration ของร่างเดิมจบก่อน ไม่งั้นค่าที่พิมพ์ลงไปถูกเขียนทับ
        await page.waitForTimeout(6000);
        console.log('=== ขั้น 3 ===  url:', page.url());
        for (const [id, v] of Object.entries({
            'site-name': 'แปลงสมุนไพรบ้านทดสอบ',
            'site-phone': '0812345678',
            'site-address': '99/9 หมู่ 3 ตำบลทดสอบ อำเภอสันทราย จังหวัดเชียงใหม่ 50210',
            'land-doc-type': 'โฉนด',
            'land-doc-number': '12345',
            'area-sqm': '1600',
            'plants-per-cycle': '500',
            'cycles-per-year': '2',
        })) {
            const el = page.locator(`#${id}`);
            if (await el.count()) { await el.fill(v); }
        }
        await page.click('button:has-text("เช่าที่ดินจากผู้อื่น")');
        await page.waitForTimeout(800);
        const landlord = page.locator('#landlord-name, [id*="landlord"]').first();
        if (await landlord.count()) { await landlord.fill('นายให้เช่า ที่ดินงาม'); }
        // ปุ่มลักษณะพื้นที่เป็นสวิตช์ กดซ้ำ = ปลดติ๊ก · ตรวจสถานะก่อนแล้วค่อยกด
        const areaBtn = page.locator('button:has-text("อาคารระบบปิด")').first();
        const attrs = await areaBtn.evaluate((e) => ({ pressed: e.getAttribute('aria-pressed'), cls: e.className.slice(0, 120) }));
        console.log('ปุ่ม อาคารระบบปิด:', JSON.stringify(attrs));
        if (attrs.pressed !== 'true') { await areaBtn.click(); }
        // ติ๊กเพิ่ม "กลางแจ้ง" — B1: การติ๊กสองข้อต้องขอ "ภาพถ่ายแปลง" เพิ่ม ไม่ใช่แทนที่ "แบบแปลนอาคาร"
        const outdoor = page.locator('button:has-text("กลางแจ้ง")').first();
        const outdoorPressed = await outdoor.evaluate((e) => e.getAttribute('aria-pressed'));
        if (outdoorPressed !== 'true') { await outdoor.click(); }
        await page.waitForTimeout(5000);
        console.log('ปุ่มถัดไปของขั้น 3 disabled =', await page.locator('button:has-text("ถัดไป")').first().isDisabled());
        await page.screenshot({ path: `${OUT}/04-step3.png`, fullPage: true });
        const t3 = await page.innerText('body');
        console.log('--- ขั้น 3 หลังกรอก: ส่วนเอกสาร ---');
        const at = t3.indexOf('เอกสาร');
        console.log(t3.slice(at > 0 ? at : 0).slice(0, 900));

        if (await next()) {
            await page.waitForTimeout(3000);
            console.log('=== ขั้น 4 ===  url:', page.url());
            const t4 = await page.innerText('body');
            console.log(t4.slice(t4.indexOf('ตรวจทาน') + 8).slice(0, 1400));
            await page.screenshot({ path: `${OUT}/05-step4.png`, fullPage: true });
            // ขั้น 4: พืช + วัตถุประสงค์ + สายพันธุ์
            // ทุกปุ่มบนขั้นนี้เป็นสวิตช์เช่นกัน — กดเฉพาะที่ยังไม่ถูกเลือก
            for (const label of ['กัญชา', 'ส่งออก', 'เมล็ดพันธุ์', 'ในประเทศ']) {
                const b = page.locator(`button:has-text("${label}")`).first();
                if (await b.count()) {
                    const pressed = await b.evaluate((e) => e.getAttribute('aria-pressed'));
                    if (pressed !== 'true') { await b.click(); await page.waitForTimeout(300); }
                }
            }
            for (const [id, v] of Object.entries({
                'variety-name-0': 'พันธุ์ทดสอบ ก',
                'variety-source-0': 'ศูนย์ขยายพันธุ์พืชเชียงใหม่',
                'variety-qty-0': '500',
                'variety-unit-0': 'ต้น',
            })) {
                const el = page.locator(`#${id}`);
                if (await el.count()) { await el.fill(v); }
            }
            await page.waitForTimeout(4000);
            await page.screenshot({ path: `${OUT}/05-step4.png`, fullPage: true });

            if (await next()) {
                await page.waitForTimeout(4000);
                console.log('=== ขั้น 5 ===  url:', page.url());
                const t5 = await page.innerText('body');
                console.log(t5.slice(t5.indexOf('ตรวจทาน') + 8).slice(0, 2000));
                await page.screenshot({ path: `${OUT}/06-step5.png`, fullPage: true });

                if (await next()) {
                    await page.waitForTimeout(5000);
                    console.log('=== ขั้น 6 ===  url:', page.url());
                    const t6 = await page.innerText('body');
                    console.log(t6.slice(t6.indexOf('ตรวจทาน') + 8).slice(0, 2500));
                    await page.screenshot({ path: `${OUT}/07-step6.png`, fullPage: true });
                }
            }
        }
    }
}
console.log('จบการเดิน');
await browser.close();

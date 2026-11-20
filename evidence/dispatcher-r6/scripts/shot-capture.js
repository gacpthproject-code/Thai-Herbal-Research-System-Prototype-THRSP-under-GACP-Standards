'use strict';

/*
 * Captures the round-6 screens from the web app on SHOT_WEB, desktop 1440x900 and phone 390x844: the booking
 * dialog in every state, a late booking taken through both reasons to a saved visit, and the inspector page.
 * At each state it records where the dialog and its action button sit, whether the dialog scrolls, and whether
 * a click on the button would land on it. usage: node shot-capture.js <fixture.json> <out-dir>
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('/home/ubuntu/work/wt-dispatcher/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');

const WEB = process.env.SHOT_WEB || 'http://127.0.0.1:3751';
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };
const LONG = 240000;
const OTHER_TEXT = 'ผู้ยื่นขอเลื่อนเพราะต้องเก็บเกี่ยวรอบนี้ให้เสร็จก่อน';

async function settle(page) {
    await page.waitForLoadState('networkidle', { timeout: 120000 }).catch(() => undefined);
    await page.waitForTimeout(800);
}

async function main() {
    const fixture = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    const outDir = process.argv[3];
    fs.mkdirSync(outDir, { recursive: true });
    const browser = await chromium.launch();
    const host = new URL(WEB).hostname;
    const shots = [];
    const failures = [];
    const measures = [];
    const consoleErrors = [];

    const watch = (page, label) => {
        page.on('console', (msg) => { if (msg.type() === 'error') { consoleErrors.push({ label, text: msg.text().slice(0, 400) }); } });
        page.on('pageerror', (error) => consoleErrors.push({ label, text: `pageerror: ${String(error.message).slice(0, 400)}` }));
        page.on('response', (res) => { if (res.url().includes('/api/') && res.status() >= 400) { consoleErrors.push({ label, text: `${res.status()} ${res.request().method()} ${new URL(res.url()).pathname}` }); } });
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
        await context.addInitScript(() => {
            document.addEventListener('DOMContentLoaded', () => {
                const style = document.createElement('style');
                style.textContent = 'nextjs-portal { display: none !important; }';
                document.head.appendChild(style);
            });
        });
        return context;
    };
    const screen = async (label, run) => {
        try { await run(); } catch (error) { failures.push({ label, error: String(error.message).slice(0, 3000) }); }
    };

    /** Scrolls the button into view the way a person would, then records where it and its dialog sit. */
    const measure = async (page, state, size, button) => {
        await button.scrollIntoViewIfNeeded().catch(() => undefined);
        const viewport = page.viewportSize();
        const box = await button.boundingBox();
        const dialog = page.getByRole('dialog').first();
        const dialogBox = await dialog.boundingBox();
        const scroll = await dialog.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, scrollTop: Math.round(el.scrollTop), overflowY: getComputedStyle(el).overflowY, maxHeight: getComputedStyle(el).maxHeight }));
        const onScreen = Boolean(box && box.y >= 0 && box.x >= 0 && box.y + box.height <= viewport.height && box.x + box.width <= viewport.width);
        let click = 'lands on the button';
        try { await button.click({ trial: true, timeout: 5000 }); } catch (error) { click = String(error.message).split('\n').filter((line) => /outside of the viewport|intercepts|Timeout/.test(line)).slice(0, 2).join(' | ') || 'does not land'; }
        const round = (b) => (b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null);
        const entry = { state: `${state}-${size}`, button: await button.innerText().catch(() => '?'), viewport, buttonBox: round(box), dialogBox: round(dialogBox), dialogScroll: scroll, onScreen, click };
        measures.push(entry);
        if (!onScreen || click !== 'lands on the button') { throw new Error(`${entry.state}: "${entry.button}" not reachable: ${JSON.stringify(entry)}`); }
    };

    for (const [size, viewport] of Object.entries(VIEWPORTS)) {
        await screen(`booking-${size}`, async () => {
            const context = await providerContext(viewport, 'dispatcher');
            const openBooking = async (number, label) => {
                const page = watch(await context.newPage(), label);
                await page.goto(`${WEB}/provider/calendar`, { timeout: LONG });
                await settle(page);
                await page.getByText(number).first().waitFor({ timeout: LONG });
                const book = page.getByRole('button', { name: 'จัดคู่นัดตรวจ' });
                const card = page.locator('div').filter({ hasText: number }).filter({ has: book }).last();
                await card.getByRole('button', { name: 'จัดคู่นัดตรวจ' }).click();
                await page.getByText('ผู้ติดต่อหน้างาน').first().waitFor({ timeout: 60000 });
                await page.waitForTimeout(500);
                return page;
            };
            const dialogOf = (page) => page.getByRole('dialog').filter({ hasText: 'กำหนดวันนัดหมายตรวจประเมิน' });

            let page = await openBooking(fixture.booking[size].ready, `booking-ready-${size}`);
            let dialog = dialogOf(page);
            await shoot(page, '04a-booking-opened', size, { dialog: true });
            await dialog.getByRole('button', { name: 'ดูชื่อและเบอร์ผู้ติดต่อหน้างาน' }).click();
            await dialog.getByText('นายสมศักดิ์ ดูแลแปลง').waitFor({ timeout: 60000 });
            await dialog.getByText('นายสมศักดิ์ ดูแลแปลง').scrollIntoViewIfNeeded();
            await page.waitForTimeout(400);
            await shoot(page, '04b-booking-site-contact-shown', size, { dialog: true });
            await measure(page, '04c-booking-save-button', size, dialog.getByRole('button', { name: 'บันทึกนัดหมาย' }));
            await page.waitForTimeout(400);
            await shoot(page, '04c-booking-scrolled-to-save-button', size, { dialog: true });
            await page.close();

            page = await openBooking(fixture.booking[size].late, `booking-late-${size}`);
            dialog = dialogOf(page);
            const none = dialog.getByText('ยังไม่มีผู้ติดต่อหน้างาน');
            await none.waitFor({ timeout: 60000 });
            await shoot(page, '05-booking-without-site-contact', size, { dialog: true });
            await dialog.locator('input[type="date"]').fill(fixture.lateVisitDay[size]);
            await dialog.locator('input[type="time"]').fill('13:00');
            await dialog.locator('button[role="combobox"]').first().click();
            await page.getByRole('option', { name: fixture.inspectorName }).click();
            await page.getByRole('listbox').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);

            const save = dialog.getByRole('button', { name: 'บันทึกนัดหมาย' });
            await measure(page, '05a-booking-save-button', size, save);
            await save.click();
            const late = dialog.getByTestId('stated-reason-lateVisit');
            await late.waitFor({ timeout: 60000 });
            const lateChoice = late.getByText('ไม่มีผู้ตรวจพื้นที่ว่างก่อนกำหนด');
            await lateChoice.scrollIntoViewIfNeeded();
            await lateChoice.click();
            await page.waitForTimeout(400);
            await shoot(page, '05b-booking-late-reasons-with-sides', size, { dialog: true });

            const confirm = dialog.getByRole('button', { name: 'ยืนยันนัดหมายพร้อมเหตุผล' });
            await measure(page, '05b-booking-confirm-with-late-reason', size, confirm);
            await confirm.click();
            const overCap = dialog.getByTestId('stated-reason-overCap');
            await overCap.waitFor({ timeout: 60000 });
            const other = overCap.locator('input[type="radio"][value="OTHER"]');
            await other.scrollIntoViewIfNeeded();
            await other.check();
            const text = overCap.locator('textarea');
            await text.fill(OTHER_TEXT);
            await measure(page, '05c-booking-confirm-with-both-reasons', size, confirm);
            await page.waitForTimeout(400);
            await shoot(page, '05c-booking-both-reasons-scrolled-to-confirm', size, { dialog: true });

            await confirm.click();
            await dialog.waitFor({ state: 'hidden', timeout: 60000 });
            await page.getByText('นัดหมายการตรวจแล้ว').first().waitFor({ timeout: 30000 });
            await page.waitForTimeout(300);
            await shoot(page, '05d-booking-saved', size, { dialog: true });
            await page.close();
            await context.close();
        });

        await screen(`inspector-${size}`, async () => {
            const context = await providerContext(viewport, 'inspector');
            const page = watch(await context.newPage(), `inspector-${size}`);
            await page.goto(`${WEB}/provider/audits/${fixture.ids.visit}`, { timeout: LONG });
            await settle(page);
            const banner = page.getByTestId('audit-vocab-guidance-banner');
            await banner.waitFor({ timeout: LONG });
            await banner.scrollIntoViewIfNeeded();
            await page.waitForTimeout(600);
            measures.push({ state: `06-inspector-banner-${size}`, bannerText: (await banner.innerText()).trim() });
            await shoot(page, '06-inspector-page-banner-thai', size, { dialog: true });
            await context.close();
        });
    }

    await browser.close();
    fs.writeFileSync(path.join(outDir, 'shots.json'), JSON.stringify({ shots: shots.sort(), measures, failures, consoleErrors }, null, 2));
    console.log('captured', shots.length, 'screens;', failures.length, 'failed');
    if (failures.length) { console.log(JSON.stringify(failures, null, 2)); }
    process.exit(failures.length ? 2 : 0);
}

main().catch((error) => { console.error('capture failed:', error.message); process.exit(1); });

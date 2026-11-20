'use strict';

/**
 * Screens that changed in fix/admin-role-split round 2, taken from the real app: next dev from
 * the tree (WEB_BASE, default http://127.0.0.1:3097) in front of the backend from the tree, on a
 * scratch database (DATABASE_URL). Fixtures are synthetic; each admin signs in through the
 * real login page (/auth/provider/login). Prints no secret.
 *
 * usage: DATABASE_URL=<walk db> node shoot.js <out dir>
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '../../..');
const backend = path.join(repo, 'apps/backend');
const web = path.join(repo, 'apps/web-app');
const { PrismaClient } = require(require.resolve('@prisma/client', { paths: [backend] }));
const bcrypt = require(require.resolve('bcryptjs', { paths: [backend] }));
const { chromium } = require(require.resolve('@playwright/test', { paths: [web] }));

const BASE = process.env.WEB_BASE || 'http://127.0.0.1:3097';
const outDir = process.argv[2];
const db = new PrismaClient();
const sfx = crypto.randomUUID().slice(0, 6);
const PASSWORD = `Shot#${crypto.randomBytes(6).toString('hex')}Aa1`;
let seq = 0;
const log = [];

async function account(org, role, firstName, { login = false, groups = [] } = {}) {
    seq += 1;
    const id13 = String(crypto.randomInt(1e12, 1e13));
    const user = await db.user.create({
        data: {
            canonicalId: `shot-${sfx}-${seq}`, email: `shot-${seq}-${sfx}@screens.test`,
            password: login ? await bcrypt.hash(PASSWORD, 10) : 'x', role, status: 'ACTIVE',
            firstName, lastName: 'ภาพหน้าจอ', organizationId: org, accountType: 'PROVIDER', authType: 'PROVIDER_ID',
            providerId: id13, providerIdHash: crypto.createHash('sha256').update(id13).digest('hex'),
        },
        select: { id: true },
    });
    for (const code of groups) {
        const group = await db.roleGroup.findUnique({ where: { code }, select: { id: true } });
        await db.userGroupMembership.create({ data: { userId: user.id, groupId: group.id, organizationId: org } });
    }
    return { id: user.id, providerId: id13, role };
}

async function signIn(browser, actor) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'th-TH' });
    const page = await context.newPage();
    await page.goto(`${BASE}/auth/provider/login`, { timeout: 180000 });
    await page.fill('#provider-id', actor.providerId);
    await page.fill('#provider-password', PASSWORD);
    await Promise.all([
        page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 120000 }),
        page.click('button[type="submit"]'),
    ]);
    await page.close();
    return context;
}

async function settle(page) {
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(800);
}

async function shot(page, name, note) {
    await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false });
    log.push(`${name}.png: ${note}`);
}

async function addStaffDialog(browser, actor, name, note) {
    const context = await signIn(browser, actor);
    const page = await context.newPage();
    await page.goto(`${BASE}/provider/management`, { timeout: 180000 });
    await settle(page);
    await page.getByRole('button', { name: 'เพิ่มพนักงาน' }).first().click();
    await page.waitForSelector('[role="dialog"]', { timeout: 30000 });
    await page.waitForTimeout(500);
    const dialog = page.locator('[role="dialog"]');
    const position = await dialog.locator('label:has-text("ตำแหน่ง")').locator('xpath=..').innerText().catch(() => '');
    await shot(page, name, `${note} · ช่องตำแหน่งในหน้าต่างอ่านได้ว่า "${position.replace(/\s+/g, ' ').trim()}"`);
    await context.close();
}

async function main() {
    fs.mkdirSync(outDir, { recursive: true });
    const org = (await db.organization.create({
        data: { name: `กรมทดสอบภาพ ${sfx}`, slug: `shot-${sfx}`, code: `SHOT_${sfx}`.toUpperCase() },
    })).id;
    const dtamAdmin = await account(org, 'system_admin_dtam', 'ผู้ดูแลกรม', { login: true });
    await account(org, 'system_admin_dtam', 'ผู้ดูแลกรมสำรอง');
    await account(org, 'system_admin_platform', 'ผู้ดูแลแพลตฟอร์ม');
    const dispatcher = await account(org, 'dispatcher', 'ผู้จัดคิว', { groups: ['dispatcher'] });
    await account(org, 'finance_officer_platform', 'การเงินบริษัท');

    const browser = await chromium.launch();
    try {
        await addStaffDialog(browser, dtamAdmin, '01-dtam-admin-add-staff-dialog',
            'ผู้ดูแลกรมกด "เพิ่มพนักงาน": ช่องตำแหน่งเริ่มที่ผู้ตรวจเอกสาร (บทบาทแรกของฝั่งกรม) ไม่ใช่คำเก่า reviewer ที่ว่างเปล่า');

        const context = await signIn(browser, dtamAdmin);
        const page = await context.newPage();
        await page.goto(`${BASE}/provider/settings/work-config`, { timeout: 180000 });
        await settle(page);
        await page.getByRole('button', { name: 'เพิ่ม stage activity config ใหม่' }).click();
        await page.waitForTimeout(500);
        const groupSelect = page.locator('select').nth(1);
        const groupOptions = await groupSelect.locator('option').allInnerTexts();
        // A headless browser does not paint an open native dropdown; show the same <select> as a list.
        await groupSelect.evaluate((el) => { el.setAttribute('size', String(el.options.length)); el.style.height = 'auto'; });
        await shot(page, '02-dtam-admin-work-config-create-row',
            `ค่าตั้งการส่งงาน แถวเพิ่มใหม่ (ช่องกลุ่มแสดงเป็นรายการ เพราะเบราว์เซอร์แบบไม่มีจอไม่วาดดรอปดาวน์ที่เปิด): ตัวเลือกกลุ่มผู้รับงานคือ ${groupOptions.filter((o) => o.trim()).join(', ')} ไม่มี finance_officer_platform`);
        fs.writeFileSync(path.join(outDir, '02-work-config-candidate-groups.json'), `${JSON.stringify(groupOptions, null, 2)}\n`);

        await page.goto(`${BASE}/provider/management/users/${dispatcher.id}/groups`, { timeout: 180000 });
        await settle(page);
        const addSelect = page.locator('select[aria-label="เลือกกลุ่มผู้ใช้ที่จะเพิ่ม"]');
        const groupList = await addSelect.locator('option').evaluateAll((els) => els.map((e) => e.value));
        await addSelect.evaluate((el) => { el.setAttribute('size', String(el.options.length)); el.style.height = 'auto'; });
        await shot(page, '03-dtam-admin-user-groups',
            `หน้าจัดกลุ่มของผู้จัดคิว (ช่องเพิ่มกลุ่มแสดงเป็นรายการ): รายการเพิ่มกลุ่มคือ ${groupList.join(', ')} (ฝั่งกรมเท่านั้น ไม่มี finance_officer_platform)`);
        fs.writeFileSync(path.join(outDir, '03-user-groups-options.json'), `${JSON.stringify(groupList, null, 2)}\n`);
        await context.close();
    } finally {
        await browser.close();
    }
    fs.writeFileSync(path.join(outDir, 'run-log.txt'), `${log.join('\n')}\n`);
    console.log(log.join('\n'));
}

main()
    .catch((error) => { console.error('shoot failed:', error.message); process.exitCode = 1; })
    .finally(() => db.$disconnect());

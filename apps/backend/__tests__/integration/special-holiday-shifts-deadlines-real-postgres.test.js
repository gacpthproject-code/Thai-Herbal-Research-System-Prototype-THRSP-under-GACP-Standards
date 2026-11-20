/**
 * วันหยุดพิเศษเป็นข้อมูลมีวันที่กำกับ ผู้ดูแลฝั่งกรมเพิ่มได้ และกำหนดแก้ไขข้ามวันนั้น
 * (operator คำสั่ง 28 และ 32, 2026-10-07) · real Postgres
 *
 * D17 (audit 2026-10-07): ปฏิทินวันหยุดเป็นตารางในโค้ด วันหยุดพิเศษที่ ครม. ประกาศกะทันหันต้อง deploy
 * ถึงจะนับ
 */

'use strict';

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');

const mockActor = { current: null };
jest.mock('../../middleware/auth-middleware', () => {
    const actual = jest.requireActual('../../middleware/auth-middleware');
    const { tenantContextMiddleware } = jest.requireActual('../../middleware/tenant-context-middleware');
    const bindTenant = tenantContextMiddleware();
    const attach = (req, res, next) => {
        req.user = { ...mockActor.current };
        return bindTenant(req, res, next);
    };
    return { ...actual, authenticateAny: attach, authenticateHealth: attach, authenticateProvider: attach, authenticateToken: attach };
});

// The table is append-only, so every run takes its own week: a random Monday inside the accepted
// year range (this Bangkok year − 1 … + 2) whose next two weeks hold no built-in holiday and no row
// an earlier run added.
const { isHoliday, getZonedParts: zoned } = require('../../utils/working-days');
async function freshWeek(raw) {
    const thisYear = zoned(new Date()).year;
    let first = Date.UTC(thisYear, 0, 1, 5);
    while (new Date(first).getUTCDay() !== 1) { first += 86400e3; }
    for (;;) {
        const monday = new Date(first + crypto.randomInt(0, 150) * 7 * 86400e3);
        const days = Array.from({ length: 14 }, (_, i) => new Date(monday.getTime() + i * 86400e3));
        if (zoned(days[13]).year > thisYear + 2 || days.some((dd) => isHoliday(dd))) { continue; }
        const iso = days.map((dd) => new Date(`${zoned(dd).isoDate}T00:00:00Z`));
        if (await raw.specialHoliday.count({ where: { date: { in: iso } } })) { continue; }
        return { monday, tuesday: zoned(days[1]).isoDate, wednesday: zoned(days[2]).isoDate };
    }
}
let WEEK;
let MONDAY_NOON_BKK;
let TUESDAY;

d('วันหยุดพิเศษที่ผู้ดูแลกรมเพิ่ม ทำให้กำหนดแก้ไขเลื่อน (real Postgres)', () => {
    let raw;
    let app;
    const sfx = crypto.randomUUID().slice(0, 8);
    const fx = { userIds: [] };
    const { addWorkingDays, getZonedParts } = require('../../utils/working-days');
    const { buildRevisionDeadlineFormData } = require('../../routes/api/provider/handlers/workflow-side-effects');

    async function staff(role) {
        const id = crypto.randomUUID();
        const key = `sh-${role}-${sfx}`;
        await raw.user.create({
            data: {
                id, canonicalId: key, providerId: key, password: 'x', role, authType: 'PROVIDER_ID', accountType: 'PROVIDER',
                email: `${key}@example.test`, firstName: role, lastName: 'ทดสอบ', organizationId: fx.org, status: 'ACTIVE',
            },
        });
        fx.userIds.push(id);
        return { id, role, canonicalRole: role, organizationId: fx.org };
    }

    beforeAll(async () => {
        raw = new PrismaClient();
        await raw.$connect();
        WEEK = await freshWeek(raw);
        MONDAY_NOON_BKK = WEEK.monday;
        TUESDAY = WEEK.tuesday;
        fx.org = (await raw.organization.create({ data: { name: `sh-${sfx}`, slug: `sh-${sfx}`, code: `SH_${sfx}`.toUpperCase() } })).id;
        fx.admin = await staff('system_admin_dtam');
        fx.platform = await staff('system_admin_platform');
        fx.inspector = await staff('field_inspector');
        app = express();
        app.use(express.json());
        app.use('/api/admin', require('../../routes/api/admin'));
    });

    afterAll(async () => {
        await raw.auditLog.deleteMany({ where: { actorId: { in: fx.userIds } } }).catch(() => {});
        await raw.user.deleteMany({ where: { id: { in: fx.userIds } } }).catch(() => {});
        await raw.organization.deleteMany({ where: { id: fx.org } }).catch(() => {});
        await raw.$disconnect();
    });

    const add = (actor, body) => {
        mockActor.current = actor;
        return request(app).post('/api/admin/special-holidays').send(body);
    };
    const day = (date) => getZonedParts(date).isoDate;

    test('ก่อนเพิ่ม: วันทำการถัดจากจันทร์คืออังคาร · ผู้ตรวจพื้นที่และผู้ดูแลแพลตฟอร์มเพิ่มไม่ได้', async () => {
        expect(day(addWorkingDays(MONDAY_NOON_BKK, 1))).toBe(TUESDAY);
        expect((await add(fx.inspector, { date: TUESDAY, name: 'x', reason: 'ทดสอบสิทธิ์' })).status).toBe(403);
        expect((await add(fx.platform, { date: TUESDAY, name: 'x', reason: 'ทดสอบสิทธิ์' })).status).toBe(403);
        expect(await raw.specialHoliday.count({ where: { date: new Date(`${TUESDAY}T00:00:00Z`) } })).toBe(0);
    });

    test('ผู้ดูแลกรมเพิ่มวันอังคาร → วันทำการและกำหนดแก้ไข 5 วันทำการเลื่อนออกไปหนึ่งวัน', async () => {
        const before = buildRevisionDeadlineFormData({ requestedAt: MONDAY_NOON_BKK }).dueAt;
        const res = await add(fx.admin, { date: TUESDAY, name: 'วันหยุดพิเศษทดสอบ', reason: 'มติ ครม. ทดสอบ' });
        expect({ status: res.status, date: res.body?.data?.date }).toEqual({ status: 201, date: TUESDAY });

        expect(day(addWorkingDays(MONDAY_NOON_BKK, 1))).toBe(WEEK.wednesday);
        const after = buildRevisionDeadlineFormData({ requestedAt: MONDAY_NOON_BKK }).dueAt;
        expect(day(after)).toBe(day(addWorkingDays(before, 1)));

        const again = await add(fx.admin, { date: TUESDAY, name: 'ซ้ำ', reason: 'ซ้ำวันเดิม' });
        expect({ status: again.status, code: again.body.code }).toEqual({ status: 409, code: 'SPECIAL_HOLIDAY_EXISTS' });

        const list = await request(app).get('/api/admin/special-holidays');
        expect(list.body.data.map((r) => r.date)).toContain(TUESDAY);
    });

    test('ตารางเป็น append-only: แก้หรือลบแถวไม่ได้', async () => {
        await expect(raw.$executeRawUnsafe(`UPDATE special_holidays SET name = 'x' WHERE date = '${TUESDAY}'`)).rejects.toThrow(/append-only/);
        await expect(raw.$executeRawUnsafe(`DELETE FROM special_holidays WHERE date = '${TUESDAY}'`)).rejects.toThrow(/append-only/);
    });

    test('ตาราง TRUNCATE ไม่ได้ (security review L4)', async () => {
        await expect(raw.$executeRawUnsafe('TRUNCATE special_holidays')).rejects.toThrow(/append-only/);
        expect(await raw.specialHoliday.count({ where: { date: new Date(`${TUESDAY}T00:00:00Z`) } })).toBe(1);
    });

    test('บันทึก audit ไม่สำเร็จ → วันหยุดไม่ถูกเพิ่ม (เขียนในทรานแซกชันเดียวกัน, L4)', async () => {
        const { auditLogger } = require('../../middleware/audit-logger');
        const spy = jest.spyOn(auditLogger, 'logWithin').mockRejectedValueOnce(new Error('audit store down'));
        try {
            const res = await add(fx.admin, { date: WEEK.wednesday, name: 'วันหยุดพิเศษทดสอบ', reason: 'มติ ครม. ทดสอบ' });
            expect(res.status).toBe(500);
            expect(await raw.specialHoliday.count({ where: { date: new Date(`${WEEK.wednesday}T00:00:00Z`) } })).toBe(0);
        } finally {
            spy.mockRestore();
        }
    });

    test('เพิ่มแล้วมีแถว audit SPECIAL_HOLIDAY_ADDED หนึ่งแถว', async () => {
        const rows = await raw.auditLog.findMany({ where: { actorId: fx.admin.id, action: 'SPECIAL_HOLIDAY_ADDED' } });
        expect(rows).toHaveLength(1);
        const metadata = typeof rows[0].metadata === 'string' ? JSON.parse(rows[0].metadata) : rows[0].metadata;
        expect(metadata).toMatchObject({ date: TUESDAY });
    });

    test.each([
        ['วันที่ไม่มีในปฏิทิน 31 ก.พ.', () => ({ date: `${zoned(new Date()).year}-02-31` })],
        ['เดือน 13 วัน 45', () => ({ date: `${zoned(new Date()).year}-13-45` })],
        ['เกินปีหน้าสองปี', () => ({ date: `${zoned(new Date()).year + 3}-06-10` })],
        ['ก่อนปีที่แล้ว', () => ({ date: `${zoned(new Date()).year - 2}-06-10` })],
        ['ชื่อยาวเกิน 200 ตัวอักษร', () => ({ name: 'ก'.repeat(201) })],
        ['เหตุผลยาวเกิน 1000 ตัวอักษร', () => ({ reason: 'ก'.repeat(1001) })],
    ])('%s → 400 SPECIAL_HOLIDAY_INVALID ไม่มีแถวใหม่', async (_label, override) => {
        const before = await raw.specialHoliday.count();
        const res = await add(fx.admin, { date: WEEK.wednesday, name: 'วันหยุดพิเศษทดสอบ', reason: 'มติ ครม. ทดสอบ', ...override() });
        expect({ status: res.status, code: res.body.code }).toEqual({ status: 400, code: 'SPECIAL_HOLIDAY_INVALID' });
        expect(await raw.specialHoliday.count()).toBe(before);
    });
});

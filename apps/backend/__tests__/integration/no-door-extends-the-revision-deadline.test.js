/**
 * เจ้าหน้าที่ต่อเวลาแก้ไขไม่ได้ และไม่มีประตูไหนรับจำนวนวันจากผู้เรียก (operator คำสั่ง 28 และ 32,
 * 2026-10-07: 5 วันทำการต่อรอบ แก้ได้ไม่จำกัดรอบ เลยกำหนด = ยกเลิกอัตโนมัติ · ลบ /extend)
 *
 * D6 (audit 2026-10-07): /api/revision-deadline รับ daysAllowed จาก body, /extend ต่อเวลาได้ซ้ำ,
 * และ /submit ของผู้ยื่นเปลี่ยนแค่แถว deadline ไม่เดินสถานะคำขอ ⇒ คำขอค้าง REVISION_REQUESTED
 * ตลอดไปและ cron ข้าม · /provider/admin/deadline-extension รับ extensionDays จาก body
 *
 * ทั้งสี่ประตูถูกลบ · การส่งงานแก้ไขของผู้ยื่นมีทางเดียวคือ POST /api/applications/submit
 */

'use strict';

const request = require('supertest');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');

d('ไม่มีประตูต่อเวลาแก้ไขหรือรับจำนวนวันจากผู้เรียก (real server)', () => {
    let app;

    beforeAll(async () => {
        app = require('../../server');
        await require('../../services/prisma-database').connect();
    }, 120000);

    test.each([
        ['post', '/api/revision-deadline/app-1', { daysAllowed: 30 }],
        ['post', '/api/applications/revision-deadline/app-1', { daysAllowed: 30 }],
        ['put', '/api/revision-deadline/app-1/extend', { days: 3 }],
        ['put', '/api/applications/revision-deadline/app-1/extend', { days: 3 }],
        ['put', '/api/revision-deadline/app-1/submit', {}],
        ['put', '/api/applications/revision-deadline/app-1/submit', {}],
        ['post', '/api/provider/admin/deadline-extension', { applicationId: 'app-1', extensionDays: 10, reason: 'ขอขยายเวลา' }],
    ])('%s %s → 404', async (method, path, body) => {
        const res = await request(app)[method](path).send(body);
        expect(res.status).toBe(404);
    });
});

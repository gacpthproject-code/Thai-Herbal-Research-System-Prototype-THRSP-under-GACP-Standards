/**
 * ไม่มีประตูชุดคำขอ (bundles) แล้ว (D13, audit 2026-10-07 · คำสั่ง 12)
 *
 * POST /bundles/:id/submit พาสมาชิกทุกใบไปหยุดที่ SUBMITTED โดยไม่มีใบเสนอราคาและไม่มีทางจ่าย
 * ⇒ คำขอค้างถาวร · ประตูที่เหลือ (สร้างชุด เพิ่ม/ถอดคำขอ ลบชุด) ไม่มีหน้าเว็บเรียก และการผูก
 * bundleId ให้ร่างทำให้การยื่นข้ามการแตกเคสตามลักษณะพื้นที่ (fanOutByAreaType คืนร่างที่มี
 * bundleId ไปตรง ๆ) · ตอนนี้ bundle ถูกสร้างเฉพาะตอนยื่นที่ POST /api/applications/submit
 */

'use strict';

const request = require('supertest');
const { describeIfTestDatabase: d } = require('../../test-support/test-database');

d('ไม่มีประตูชุดคำขอ (real server)', () => {
    let app;

    beforeAll(async () => {
        app = require('../../server');
        await require('../../services/prisma-database').connect();
    }, 120000);

    const ID = '11111111-1111-4111-8111-111111111111';
    test.each(['/api/applications/bundles', '/api/application-bundles'].flatMap((base) => [
        ['post', `${base}/${ID}/submit`],
        ['get', `${base}/my`],
        ['get', `${base}/${ID}`],
        ['post', base],
        ['post', `${base}/${ID}/applications`],
        ['delete', `${base}/${ID}/applications/${ID}`],
        ['delete', `${base}/${ID}`],
    ]))('%s %s has no handler', async (method, path) => {
        // POST /api/applications/bundles reaches GET /api/applications/:id's path, so the
        // not-found middleware answers 405 with an Allow header that leaves POST out.
        const res = await request(app)[method](path).send({});
        const allowed = String(res.headers.allow || '').toUpperCase().split(/\s*,\s*/);
        expect({ status: res.status, allowsMethod: allowed.includes(method.toUpperCase()) })
            .toEqual({ status: res.status === 405 ? 405 : 404, allowsMethod: false });
    });
});

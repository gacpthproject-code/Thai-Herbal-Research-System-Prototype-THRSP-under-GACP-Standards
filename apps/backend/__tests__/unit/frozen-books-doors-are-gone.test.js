/**
 * รอบแก้ 3 ข้อ 3 (รีวิว M1 ของ 97d7ea80e) — ประตูใบกำกับภาษีซื้อและปิดงวดบัญชีถูกถอดออกทั้งหลัง
 *
 * คำสั่ง 59 แช่แข็งและซ่อนใบกำกับภาษีซื้อกับการปิดงวดบัญชี คำสั่ง 12 (pre-production) ให้ลบของที่เลิกใช้
 * ทิ้งทั้งก้อน · หน้าเว็บของทั้งสองถูกลบไปแล้ว (c0189018b) แต่ประตู API ยัง mount อยู่ จึงยังปิดงวดได้
 * ทาง API แล้วรายการลงบัญชีอัตโนมัติ (CN/DN/settlement) ของงวดนั้นถูกปฏิเสธ โดยไม่มีจอเปิดงวดคืน
 *
 * ใบนี้ผูก *มติ* ไม่ใช่ไฟล์: ใครเอาประตูกลับมา mount ใต้ /api/finance โดยไม่มีมติใหม่ จะแดงที่นี่
 * วัดสองชั้น — ประตูจริง (router ทั้งก้อนของ routes/api/index.js ตอบ 404 แม้ผู้เรียกเป็นการเงินบริษัท)
 * และต้นทาง (ไฟล์ route และ service ใบกำกับภาษีซื้อหายไป และ index.js ไม่ mount เส้นทางนี้)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/auth-middleware', () => {
    const actual = jest.requireActual('../../middleware/auth-middleware');
    const attach = (req, _res, next) => {
        req.user = {
            id: 'fin-1', canonicalId: 'fin-1', role: 'finance_officer_platform',
            canonicalRole: 'finance_officer_platform', organizationId: 'org-1',
        };
        return next();
    };
    return { ...actual, authenticateAny: attach, authenticateHealth: attach, authenticateProvider: attach, authenticateToken: attach };
});
jest.mock('../../shared/logger', () => {
    const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { ...l, createLogger: jest.fn(() => l) };
});

const BACKEND = path.resolve(__dirname, '../..');
const GONE_FILES = [
    'routes/api/finance/purchase-invoices.js',
    'routes/api/finance/period-close.js',
    'services/purchase-invoice-service.js',
];
const PI = '/api/finance/purchase-invoices';
const PC = '/api/finance/period-close';

describe('รอบแก้ 3 ข้อ 3 — ไม่มีประตูใบกำกับภาษีซื้อและปิดงวดบัญชีเหลืออยู่', () => {
    let app;
    beforeAll(() => {
        app = express();
        app.use(express.json());
        app.use('/api', require('../../routes/api/index'));
    });

    test.each([
        ['get', PI],
        ['post', PI],
        ['get', `${PI}/pi-1`],
        ['post', `${PI}/pi-1/approve`],
        ['post', `${PI}/pi-1/reject`],
        ['post', `${PI}/pi-1/mark-paid`],
        ['get', PC],
        ['post', PC],
        ['get', `${PC}/check?year=2026&month=9`],
        ['post', `${PC}/pc-1/reopen`],
    ])('%s %s ตอบ 404 แม้ผู้เรียกเป็นการเงินบริษัท', async (method, url) => {
        const res = await request(app)[method](url).send({ year: 2026, month: 9, reason: 'x' });
        expect(res.status).toBe(404);
    });

    test('ไฟล์ route และ service หายไปแล้ว และ index.js ไม่ mount เส้นทางเหล่านี้', () => {
        for (const rel of GONE_FILES) {
            expect({ rel, exists: fs.existsSync(path.join(BACKEND, rel)) }).toEqual({ rel, exists: false });
        }
        const src = fs.readFileSync(path.join(BACKEND, 'routes/api/index.js'), 'utf8');
        expect(src).not.toMatch(/purchase-invoices|period-close/);
    });
});

/**
 * F-A8b-15 (a8 walk round 2, item 6) — ประตูสมุดรายวันทั่วไปถูกถอดออกทั้งหลัง
 *
 * คำสั่ง 59 แช่แข็งและซ่อนรายการปรับปรุงด้วยมือ คำสั่ง 64 ค9 ถอดสมุดรายวันออกจากขอบเขต
 * คำสั่ง 12 (pre-production) ให้ลบของที่เลิกใช้ทิ้งทั้งก้อน ไม่เก็บทางผ่านเก่าไว้
 *
 * ใบนี้ผูก *มติ* ไม่ใช่ไฟล์: ใครเอาประตูกลับมา mount ใต้ /api/finance โดยไม่มีมติใหม่ จะแดงที่นี่
 * วัดสองชั้น — ประตูจริง (router ทั้งก้อนของ routes/api/index.js ตอบ 404 แม้ผู้เรียกเป็นการเงินบริษัท)
 * และต้นทาง (ไฟล์ route หายไป และ index.js ไม่ mount เส้นทางนี้)
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
const ROUTE_FILE = 'routes/api/finance/manual-journal-entries.js';
const DOOR = '/api/finance/manual-journal-entries';

describe('F-A8b-15 — ไม่มีประตู /api/finance/manual-journal-entries เหลืออยู่', () => {
    let app;
    beforeAll(() => {
        app = express();
        app.use(express.json());
        app.use('/api', require('../../routes/api/index'));
    });

    test.each([
        ['get', DOOR],
        ['post', DOOR],
        ['get', `${DOOR}/je-1`],
        ['post', `${DOOR}/je-1/approve`],
        ['post', `${DOOR}/je-1/post`],
        ['post', `${DOOR}/je-1/reject`],
    ])('%s %s ตอบ 404 แม้ผู้เรียกเป็นการเงินบริษัท', async (method, url) => {
        const res = await request(app)[method](url).send({ lines: [] });
        expect(res.status).toBe(404);
    });

    test('ไฟล์ route ไม่มีอยู่แล้ว และ index.js ไม่ mount เส้นทางนี้', () => {
        expect(fs.existsSync(path.join(BACKEND, ROUTE_FILE))).toBe(false);
        const src = fs.readFileSync(path.join(BACKEND, 'routes/api/index.js'), 'utf8');
        expect(src).not.toMatch(/manual-journal-entries/);
    });
});

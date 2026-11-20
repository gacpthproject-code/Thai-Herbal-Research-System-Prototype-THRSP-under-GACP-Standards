'use strict';

/**
 * ตารางเทียบและ CSV ของ /api/standards ต้องล็อกอินเจ้าหน้าที่ เหมือน API อื่นของหน้า /provider/standards
 * ใช้ middleware จริง ไม่ mock: ไม่มี token ต้องได้ 401 NO_TOKEN ก่อนแตะฐานข้อมูล
 */

jest.mock('../../services/prisma-database', () => ({ prisma: {} }));
jest.mock('../../shared/logger', () => {
    const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { ...l, createLogger: jest.fn(() => l) };
});

const express = require('express');
const request = require('supertest');

const app = express();
app.use('/api/standards', require('../../routes/api/certificates/standards'));

test.each([
    '/api/standards/comparison',
    '/api/standards/comparison/export.csv',
])('%s โดยไม่ล็อกอิน ได้ 401 NO_TOKEN จาก middleware จริง', async (url) => {
    const res = await request(app).get(url);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('NO_TOKEN');
});

test('SKILL.md แถว Doors บอกว่าสองประตูนี้ต้องล็อกอิน ไม่ใช่สาธารณะ (governance docs follow every change)', () => {
    const skill = require('fs').readFileSync(
        require('path').resolve(__dirname, '../../../../.claude/skills/gacp-standards-requirements/SKILL.md'), 'utf8');
    const doors = skill.split('\n').find((line) => line.startsWith('| Doors |'));
    expect(doors).toContain('`/comparison`, `/comparison/export.csv` (authenticateProvider)');
    expect(doors).not.toContain('export.csv` (public)');
});

/**
 * คำสั่ง 154 (2026-10-28): หน้าจอห้ามอ้างเกินจริง ตารางเทียบมาตรฐานเคยเรียกระดับ REQUIRED ว่า "ข้อบังคับ"
 * ซึ่งอ่านได้ว่าบังคับตามกฎหมาย ทั้งที่ มกษ. 3502 และ ASEAN GAP เป็นมาตรฐานอ้างอิง (ASEAN GAP เรียกตัวเองว่า
 * recommended practices และไม่มีระบบรับรองของตัวเอง) ระดับนี้จึงใช้คำว่า "ข้อกำหนด" และ legend บอกว่าไม่ใช่กฎหมาย
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const page = readFileSync(resolve(__dirname, '..', 'app', 'provider', 'standards', 'compare', 'page.tsx'), 'utf8');

describe('หน้าตารางเทียบ 3 มาตรฐาน', () => {
    it('ป้ายระดับ REQUIRED คือ "ข้อกำหนด" และไม่มีคำว่า "ข้อบังคับ" ทั้งหน้า', () => {
        expect(page).toContain("REQUIRED: 'ข้อกำหนด'");
        expect(page).not.toContain('ข้อบังคับ');
    });

    it('legend บอกว่าข้อกำหนดเป็นของมาตรฐานอ้างอิง ไม่ใช่กฎหมาย และไม่อ้างการรับรอง', () => {
        expect(page).toContain('ไม่ใช่กฎหมาย');
        expect(page).not.toContain('เพื่อการรับรอง');
    });
});

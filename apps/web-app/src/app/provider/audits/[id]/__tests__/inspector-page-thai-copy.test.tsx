/**
 * Order 51 (operator 2026-10-09): no English jargon on Thai screens. The inspector's job sheet tells
 * the inspector why a job cannot be acted on in Thai only; it said "สถานะใบเสร็จและ Workflow".
 */

import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const SRC = fs.readFileSync(path.resolve(__dirname, '..', 'page.tsx'), 'utf8');

describe('the inspector job sheet speaks Thai', () => {
    it('the notice for a job that cannot be acted on names no English word', () => {
        const notice = SRC.match(/งานนี้ไม่อยู่ในสถานะที่สามารถดำเนินการได้[^<\n]*/)?.[0] ?? '';
        expect(notice).toContain('กรุณาตรวจสอบสถานะใบเสร็จ');
        expect(notice).not.toMatch(/[A-Za-z]/);
    });
});

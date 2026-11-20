/**
 * คำบนจอของสถานะปิดของคำขอ (operator 2026-10-07, standing order 30)
 *
 * EXPIRED แสดง "ยกเลิก (เลยกำหนด)" · CANCELLED แสดง "ยกเลิก" คำเดียวทุกหน้า
 * "หมดอายุ" สงวนไว้ให้ใบรับรอง ห้ามใช้กับคำขอ
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { STATUS_LABELS, getStatusLabel } from '../workflow-states';

const SRC = join(__dirname, '..', '..', '..');

function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
            if (name === '__tests__' || name === 'node_modules') continue;
            walk(full, out);
        } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\./.test(name)) {
            out.push(full);
        }
    }
    return out;
}

describe('DOC_FEE_PAID บอกสิ่งที่รออยู่ ไม่ใช่เรื่องเงิน', () => {
    // คำขอต่ออายุมาถึงสถานะนี้โดยยังไม่ได้จ่ายอะไรเลย ป้ายต้องจริงทั้งสองเส้นทาง
    it('DOC_FEE_PAID = "รอตรวจเอกสาร"', () => {
        expect(STATUS_LABELS.DOC_FEE_PAID).toBe('รอตรวจเอกสาร');
        expect(getStatusLabel('DOC_FEE_PAID')).toBe('รอตรวจเอกสาร');
    });
});

describe('ป้ายสถานะปิดของคำขอ', () => {
    it('EXPIRED = "ยกเลิก (เลยกำหนด)" และ CANCELLED = "ยกเลิก" จากแหล่งเดียว', () => {
        expect(STATUS_LABELS.EXPIRED).toBe('ยกเลิก (เลยกำหนด)');
        expect(STATUS_LABELS.CANCELLED).toBe('ยกเลิก');
        expect(getStatusLabel('EXPIRED')).toBe('ยกเลิก (เลยกำหนด)');
        expect(getStatusLabel('CANCELLED')).toBe('ยกเลิก');
    });

    it('ไม่มีไฟล์เว็บใดจับคู่ EXPIRED ของคำขอกับ "หมดอายุ" หรือพิมพ์ "คำขอหมดอายุ"', () => {
        const offenders: string[] = [];
        for (const file of walk(SRC)) {
            const text = readFileSync(file, 'utf8');
            if (/\bEXPIRED\b['"]?\s*:\s*['"`][^'"`]*หมดอายุ/.test(text)) {
                // ใบรับรอง/ใบสมัครสมาชิก (ไม่ใช่คำขอ) ที่ใช้ชื่อสถานะเดียวกัน
                if (!/\/(admin\/certificates|health\/certificates|finance\/StatusBadge)/.test(file)) offenders.push(`${file} (EXPIRED→หมดอายุ)`);
            }
            if (/คำขอหมดอายุ/.test(text)) offenders.push(`${file} (คำขอหมดอายุ)`);
        }
        expect(offenders).toEqual([]);
    });
});

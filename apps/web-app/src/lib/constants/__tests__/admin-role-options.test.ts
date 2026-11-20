/**
 * รายการบทบาทของดรอปดาวน์ใน /admin/*
 *
 * เขียนใหม่ 2026-09-10 หลัง operator สั่งตัดขาดจากคำเก่า — ไฟล์เดิมตรึงสามอย่างที่
 * ไม่มีอยู่แล้ว: แถว `ACCOUNT` (คำเปล่า) พร้อมธง `isLegacy`, ค่าตัวพิมพ์ใหญ่ยุคก่อนใน
 * ช่อง `value`, และการนับ "10 บทบาท" ที่รวมคำเปล่าเข้าไปด้วย
 *
 * สิ่งที่ยังต้องตรึง และเป็นเหตุผลที่ไฟล์นี้มีอยู่ตั้งแต่แรก: ทุกบทบาทที่แต่งตั้งได้ต้อง
 * ปรากฏในดรอปดาวน์ — บทบาทที่ตกหล่นแปลว่าผู้ดูแลแต่งตั้งคนไปทำงานนั้นไม่ได้เลย
 * (อาการเดิม: Tier 16 แยกฝ่ายบัญชีแล้วสามหน้าจอไม่มีตัวเลือกใหม่)
 */

import {
    ADMIN_ROLE_OPTIONS,
    ADMIN_ROLE_OPTIONS_WITH_ALL_PREFIX,
    managedElsewhereNote,
    roleOptionsAssignableBy,
    staffRoleOptionsAssignableBy,
} from '../admin-role-options';
import { CANONICAL_ROLES } from '../canonical-roles';

describe('admin-role-options — รายการบทบาทของดรอปดาวน์', () => {
    it('ทุกบทบาทที่แต่งตั้งได้อยู่ในรายการ', () => {
        const values = ADMIN_ROLE_OPTIONS.map((o) => o.value).sort();
        expect(values).toEqual([
            CANONICAL_ROLES.CERTIFICATE_APPROVER,
            CANONICAL_ROLES.DISPATCHER,
            CANONICAL_ROLES.DOCUMENT_REVIEWER,
            CANONICAL_ROLES.FIELD_INSPECTOR,
            CANONICAL_ROLES.FINANCE_OFFICER_DTAM,
            CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM,
            CANONICAL_ROLES.HEALTH,
            CANONICAL_ROLES.SYSTEM,
            CANONICAL_ROLES.SYSTEM_ADMIN_DTAM,
        ].sort());
    });

    it('ผู้ดูแลของบริษัทไม่อยู่ในรายการโดยเจตนา — ต้องตั้งนอกประตูนี้', () => {
        const values = ADMIN_ROLE_OPTIONS.map((o) => o.value);
        expect(values).not.toContain(CANONICAL_ROLES.SYSTEM_ADMIN_PLATFORM);
    });

    it('`value` กับ `canonical` เป็นคำเดียวกันทุกแถว', () => {
        const mismatched = ADMIN_ROLE_OPTIONS
            .filter((o) => o.value !== o.canonical)
            .map((o) => o.value);
        expect(mismatched).toEqual([]);
    });

    it('ทุกแถวมีป้ายภาษาไทย', () => {
        const noLabel = ADMIN_ROLE_OPTIONS.filter((o) => !o.label || !/[ก-๙]/.test(o.label));
        expect(noLabel).toEqual([]);
    });

    it('ไม่มีค่าซ้ำ', () => {
        const values = ADMIN_ROLE_OPTIONS.map((o) => o.value);
        expect(new Set(values).size).toBe(values.length);
    });

    it('ไม่มีคำที่ปลดระวางแล้วหลงเหลือ', () => {
        const retired = ['admin', 'account', 'account_dtam', 'account_platform',
            'platform_admin', 'auditor', 'scheduler', 'ADMIN', 'ACCOUNT'];
        const found = ADMIN_ROLE_OPTIONS
            .map((o) => o.value)
            .filter((v) => retired.includes(v));
        expect(found).toEqual([]);
    });

    it('บทบาทที่ไม่ใช่คนถูกซ่อน และมีตัวเดียว', () => {
        const hidden = ADMIN_ROLE_OPTIONS.filter((o) => o.hidden);
        expect(hidden.map((o) => o.value)).toEqual([CANONICAL_ROLES.SYSTEM]);
    });
});

describe('ตัวแปรของแต่ละหน้าจอ', () => {
    it('ตัวกรองมี "ทุกบทบาท" เป็นแถวแรก และไม่มีแถวที่ซ่อนไว้', () => {
        expect(ADMIN_ROLE_OPTIONS_WITH_ALL_PREFIX[0].value).toBe('ALL');
        expect(ADMIN_ROLE_OPTIONS_WITH_ALL_PREFIX.some((o) => o.hidden)).toBe(false);
        expect(ADMIN_ROLE_OPTIONS_WITH_ALL_PREFIX).toHaveLength(
            ADMIN_ROLE_OPTIONS.filter((o) => !o.hidden).length + 1,
        );
    });

    const DTAM_ADMIN = CANONICAL_ROLES.SYSTEM_ADMIN_DTAM;
    const PLATFORM_ADMIN = CANONICAL_ROLES.SYSTEM_ADMIN_PLATFORM;
    const valuesFor = (admin: string) => roleOptionsAssignableBy(admin).map((o) => o.value);

    it('ตัวเลือกตอนตั้งบทบาทไม่มีบทบาทที่ไม่ใช่คน', () => {
        for (const admin of [DTAM_ADMIN, PLATFORM_ADMIN]) {
            expect(roleOptionsAssignableBy(admin).some((o) => o.hidden)).toBe(false);
            expect(valuesFor(admin)).not.toContain(CANONICAL_ROLES.SYSTEM);
        }
    });

    // คำสั่ง 13, 34(2): ทุกบทบาทบนจอต้องมีผู้ดูแลแต่งตั้งได้หนึ่งฝั่งพอดี ไม่ตกหล่น ไม่ทับกัน
    it('ทุกบทบาทที่แต่งตั้งได้ มีผู้ดูแลหนึ่งฝั่งพอดีที่เลือกมันได้', () => {
        const visible = ADMIN_ROLE_OPTIONS.filter((o) => !o.hidden).map((o) => o.value).sort();
        const dtam = valuesFor(DTAM_ADMIN);
        const platform = valuesFor(PLATFORM_ADMIN);
        expect([...dtam, ...platform].sort()).toEqual(visible);
        expect(dtam.filter((v) => platform.includes(v))).toEqual([]);
    });

    it('การเงินแต่ละฝั่งแต่งตั้งโดยผู้ดูแลฝั่งของตัวเอง', () => {
        expect(valuesFor(DTAM_ADMIN)).toContain(CANONICAL_ROLES.FINANCE_OFFICER_DTAM);
        expect(valuesFor(DTAM_ADMIN)).not.toContain(CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM);
        expect(valuesFor(PLATFORM_ADMIN)).toEqual([CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM]);
    });

    it('ผู้อนุมัติใบรับรองเลือกได้โดยผู้ดูแลกรม ถ้าตกหล่นจะไม่มีใครอนุมัติคำขอได้เลย', () => {
        expect(valuesFor(DTAM_ADMIN)).toContain(CANONICAL_ROLES.CERTIFICATE_APPROVER);
        expect(staffRoleOptionsAssignableBy(DTAM_ADMIN).map((o) => o.value))
            .toContain(CANONICAL_ROLES.CERTIFICATE_APPROVER);
    });

    it('ประตูที่สร้างเฉพาะเจ้าหน้าที่ไม่เสนอบทบาทผู้ขอรับรอง', () => {
        expect(staffRoleOptionsAssignableBy(DTAM_ADMIN).map((o) => o.value)).not.toContain(CANONICAL_ROLES.HEALTH);
    });

    it('คนที่ไม่ใช่ผู้ดูแลไม่มีบทบาทให้เลือก', () => {
        expect(roleOptionsAssignableBy(CANONICAL_ROLES.DISPATCHER)).toEqual([]);
        expect(roleOptionsAssignableBy(null)).toEqual([]);
    });

    it('แถวของบัญชีอีกฝั่งบอกว่าใครเป็นผู้จัดการ', () => {
        expect(managedElsewhereNote(CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM)).toBe('ผู้ดูแลบริษัทเป็นผู้จัดการ');
        expect(managedElsewhereNote(CANONICAL_ROLES.SYSTEM_ADMIN_PLATFORM)).toBe('ผู้ดูแลบริษัทเป็นผู้จัดการ');
        expect(managedElsewhereNote(CANONICAL_ROLES.DISPATCHER)).toBe('ผู้ดูแลกรมเป็นผู้จัดการ');
        expect(managedElsewhereNote(CANONICAL_ROLES.SYSTEM)).toBe('จัดการจากหน้านี้ไม่ได้');
    });
});

/**
 * ดรอปดาวน์บทบาทตอนเพิ่มผู้ใช้ในองค์กร ต้องตรงกับบทบาทที่ประตูยอมให้ผู้ดูแลแพลตฟอร์มตั้ง
 *
 * เจอตอนสร้างบัญชี demo ผ่าน UI จริง 2026-09-12: หน้า /admin/organizations เก็บรายการ
 * บทบาทของตัวเอง ซึ่งเพี้ยนจากประตูจนปุ่มตายและแต่งตั้งผู้อนุมัติไม่ได้ · อาการเงียบ ไม่มีเทสไหนแดง
 *
 * ตั้งแต่คำสั่ง 13, 34(2) ประตูนี้ (POST /api/platform-admin/organizations/:id/users) ตั้งได้
 * เฉพาะบทบาทฝั่งบริษัท เทสจึงเทียบดรอปดาวน์กับกติกาของหลังบ้านตรง ๆ และตรึงว่าผู้อนุมัติ
 * ใบรับรองยังแต่งตั้งได้ ที่ประตูของผู้ดูแลกรม
 */
import fs from 'node:fs';
import path from 'node:path';

import {
    ADMIN_ROLE_OPTIONS,
    staffRoleOptionsAssignableBy,
} from '../admin-role-options';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const backend = require('../../../../../backend/shared/canonical-rbac.js');

const PLATFORM_ADMIN = 'system_admin_platform';
const DTAM_ADMIN = 'system_admin_dtam';

describe('ดรอปดาวน์ "เพิ่มผู้ใช้ในองค์กร" ตรงกับประตู', () => {
    const offered = staffRoleOptionsAssignableBy(PLATFORM_ADMIN).map((o) => o.value);
    const doorAllows: string[] = backend.rolesAssignableBy(PLATFORM_ADMIN).filter(backend.isProviderRole);

    it('ประตูยอมให้ตั้งอย่างน้อยหนึ่งบทบาท ถ้าว่าง เทสนี้จะผ่านโดยไม่ได้ตรวจอะไร', () => {
        expect(doorAllows.length).toBeGreaterThanOrEqual(1);
    });

    it('ทุกบทบาทบนดรอปดาวน์ ประตูยอมให้ตั้ง ไม่มีปุ่มที่กดแล้วถูกปฏิเสธ', () => {
        expect(offered.filter((v) => !doorAllows.includes(v))).toEqual([]);
    });

    it('ทุกบทบาทที่ประตูยอม มีให้เลือกบนดรอปดาวน์', () => {
        expect(doorAllows.filter((v) => !offered.includes(v))).toEqual([]);
    });

    it('ไม่มีบทบาทฝั่งกรมบนดรอปดาวน์ของผู้ดูแลแพลตฟอร์ม', () => {
        expect(offered.filter((v) => backend.roleAffiliation(v) === 'certification_body')).toEqual([]);
    });

    /**
     * แถวนี้คือแถวที่ถ้าหายไป ระบบจะออกใบรับรองไม่ได้เลยทั้งระบบ ตอนนี้แต่งตั้งที่ประตูของผู้ดูแลกรม
     * ตรึงแยกไว้เพื่อให้ข้อความตอนแดงบอกตรง ๆ ว่าอะไรพัง
     */
    it('ผู้อนุมัติใบรับรองยังแต่งตั้งได้ โดยผู้ดูแลกรม', () => {
        const approver = staffRoleOptionsAssignableBy(DTAM_ADMIN).find((o) => o.value === 'certificate_approver');
        expect(approver?.label).toBe('ผู้อนุมัติใบรับรอง');
        expect(backend.rolesAssignableBy(DTAM_ADMIN)).toContain('certificate_approver');
    });

    it('ทุกค่าเป็นตัวพิมพ์เล็กตามคำศัพท์ปัจจุบัน ไม่มีคำเก่าตัวพิมพ์ใหญ่ค้าง', () => {
        for (const option of ADMIN_ROLE_OPTIONS) {
            expect(option.value).toBe(option.value.toLowerCase());
            expect(option.canonical).toBe(option.value);
        }
    });
});

/**
 * หน้าจอต้องอ่านจาก SSOT ไม่ใช่เก็บรายการของตัวเอง — ตรวจที่ไฟล์ เพราะการเรนเดอร์
 * ดรอปดาวน์ของ Radix ใน jsdom ไม่เปิดรายการออกมาให้อ่านโดยไม่คลิก
 */
describe('หน้าเพิ่มผู้ใช้ไม่เก็บรายการบทบาทของตัวเอง', () => {
    const dialog = fs.readFileSync(
        path.resolve(__dirname, '../../../app/admin/organizations/_components/create-user-dialog.tsx'),
        'utf8',
    );

    it('อ่านรายการจาก staffRoleOptionsAssignableBy ตามบทบาทของผู้ใช้ที่เข้าสู่ระบบ', () => {
        expect(dialog).toContain('staffRoleOptionsAssignableBy(viewer?.role)');
        expect(dialog).toMatch(/from '@\/lib\/constants\/admin-role-options'/);
    });

    it('ไม่มี SelectItem ที่ฝังค่าบทบาทไว้ในไฟล์ และไม่มีค่าปริยายเป็นผู้ดูแลกรม', () => {
        expect(dialog).not.toMatch(/<SelectItem value="[a-zA-Z_]+">/);
        expect(dialog).not.toContain("'system_admin_dtam'");
    });
});

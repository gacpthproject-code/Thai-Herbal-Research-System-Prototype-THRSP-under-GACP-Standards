'use strict';

/**
 * คำสั่ง operator 89 ข: สคริปต์ฉุกเฉินปฏิเสธก่อนล้าง เมื่อเป้าหมายไม่ใช่เจ้าหน้าที่ ผู้ขอไม่ใช่ผู้ดูแลระบบฝั่งเดียวกัน
 * (คำสั่ง 13 และ 17) เป้าหมายยังมีรหัสสำรองที่ไม่ได้ใช้ (ขั้นตอน ก ใช้แทน) หรือธงบังคับ 2FA ยังไม่เปิด
 * ตารางการปฏิเสธทั้งชุดอยู่ที่นี่ ไม่ต้องมีฐานข้อมูล · การล้างจริงอยู่ใน staff-2fa-emergency-reset-real-postgres
 */

const { refusal, parseArgs } = require('../../scripts/ops/staff-2fa-emergency-reset');
const { CANONICAL_ROLES: R } = require('../../shared/canonical-rbac');

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const account = (role, extra = {}) => ({
    id: `${role}-${extra.organizationId || ORG_A}`, role, status: 'ACTIVE', organizationId: ORG_A, isDeleted: false,
    twoFactorEnabled: true, twoFactorMethod: 'TOTP', twoFactorBackupCodes: [], ...extra,
});
const env = { REQUIRE_MFA_FOR_PRIVILEGED: 'true' };
const dtamAdmin = account(R.SYSTEM_ADMIN_DTAM);
const platformAdmin = account(R.SYSTEM_ADMIN_PLATFORM, { organizationId: ORG_B });

describe('order 89 ข: the emergency reset refuses before it clears', () => {
    test('goes only for a staff account with 2FA on and no unused backup code, asked by an active admin of its side', () => {
        expect(refusal({ env, target: account(R.DOCUMENT_REVIEWER), requester: dtamAdmin })).toBeNull();
        expect(refusal({ env, target: account(R.FINANCE_OFFICER_PLATFORM, { organizationId: ORG_B }), requester: platformAdmin })).toBeNull();
        // the platform admin crosses organizations (order 17); the DTAM admin does not
        expect(refusal({ env, target: account(R.FINANCE_OFFICER_PLATFORM), requester: platformAdmin })).toBeNull();
    });

    test.each([
        ['the flag is off', { env: { REQUIRE_MFA_FOR_PRIVILEGED: 'false' } }, /REQUIRE_MFA_FOR_PRIVILEGED/],
        ['the flag is unset', { env: {} }, /REQUIRE_MFA_FOR_PRIVILEGED/],
        ['the target does not exist', { target: null }, /ไม่พบบัญชีเป้าหมาย/],
        ['the target is deleted', { target: account(R.DOCUMENT_REVIEWER, { isDeleted: true }) }, /ไม่พบบัญชีเป้าหมาย/],
        ['the target is an applicant', { target: account(R.HEALTH) }, /ไม่ใช่บัญชีเจ้าหน้าที่/],
        ['the requester does not exist', { requester: null }, /ไม่พบบัญชีผู้ดูแลระบบ/],
        ['the requester is not active', { requester: account(R.SYSTEM_ADMIN_DTAM, { status: 'INACTIVE' }) }, /ไม่ได้ใช้งานอยู่/],
        ['the requester is not an admin', { requester: account(R.DOCUMENT_REVIEWER) }, /คำสั่ง 13/],
        ['the requester is the admin of the other side', { requester: platformAdmin }, /คำสั่ง 13/],
        ['the requester is the target itself (review L2)', { target: dtamAdmin, requester: dtamAdmin }, /ผู้ขอเป็นบัญชีเป้าหมายเอง/],
        ['the DTAM admin is of another organization', { target: account(R.DOCUMENT_REVIEWER, { organizationId: ORG_B }) }, /คำสั่ง 17/],
        ['the target has no 2FA', { target: account(R.DOCUMENT_REVIEWER, { twoFactorEnabled: false }) }, /ไม่ได้เปิดการยืนยันตัวตนสองชั้น/],
        ['the target is on the retired EMAIL method', { target: account(R.DOCUMENT_REVIEWER, { twoFactorMethod: 'EMAIL' }) }, /ไม่ได้เปิดการยืนยันตัวตนสองชั้น/],
        ['the target still has an unused backup code', { target: account(R.DOCUMENT_REVIEWER, { twoFactorBackupCodes: ['h1'] }) }, /รหัสสำรองที่ไม่ได้ใช้ 1 รหัส.*ขั้นตอน ก/],
        ['the target holds its codes as a JSON string', { target: account(R.DOCUMENT_REVIEWER, { twoFactorBackupCodes: '["h1","h2"]' }) }, /2 รหัส/],
    ])('refuses when %s', (_name, input, pattern) => {
        expect(refusal({ env, target: account(R.DOCUMENT_REVIEWER), requester: dtamAdmin, ...input })).toMatch(pattern);
    });

    test('parseArgs needs all four inputs and nothing else', () => {
        expect(parseArgs(['--target', 't', '--requester', 'r', '--confirmation', 'c 1', '--approval', 'a 2']).args)
            .toEqual({ target: 't', requester: 'r', confirmation: 'c 1', approval: 'a 2' });
        expect(parseArgs(['--target', 't']).error).toMatch(/--requester --confirmation --approval/);
        expect(parseArgs(['--target']).error).toMatch(/ต้องมีค่า/);
        expect(parseArgs(['--target', '--requester']).error).toMatch(/ต้องมีค่า/);
        expect(parseArgs(['--password', 'x']).error).toMatch(/ไม่รู้จัก/);
        expect(parseArgs([]).error).toContain('วิธีใช้');
    });
});

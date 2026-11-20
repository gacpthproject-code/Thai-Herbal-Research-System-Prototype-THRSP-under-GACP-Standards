// ด่านแยกฝั่งการเงิน — สัญญา segregation-of-duties (§6.2 · VIS-ACCT-02)
//
// ไฟล์นี้เดิมชื่อ canonical-rbac-account-split.test.js และตรึงคำศัพท์ยุค Tier 16
// (`account_dtam` / `account_platform` / คำเปล่า `account`) · หลัง operator สั่งตัดขาด
// จากคำเก่า 2026-09-10 คำเหล่านั้นไม่มีอยู่แล้ว แต่ **ข้อตกลงที่ไฟล์นี้ปกป้องยังอยู่เหมือนเดิม**
// จึงเขียนใหม่ด้วยคำปัจจุบัน ไม่ใช่ลบทิ้ง:
//
//   - ไม่มีบทบาทใดอนุมัติ ยืนยัน หรือออกใบเสร็จการชำระเงินเอง (operator 2026-10-06)
//   - การเงินสองฝั่งเห็นข้อมูลชุดเดียวกัน และถือสิทธิ์อ่านล้วน

'use strict';

const {
  CANONICAL_ROLES,
  PERMISSIONS,
  ROLE_GROUPS,
  normalizeRole,
  hasPermission,
  isProviderRole,
} = require('../../shared/canonical-rbac');

describe('การเงินสองฝั่ง — คำศัพท์', () => {
  it('มีบทบาทการเงินสองตัว แยกกรม/บริษัทชัดเจน', () => {
    expect(CANONICAL_ROLES.FINANCE_OFFICER_DTAM).toBe('finance_officer_dtam');
    expect(CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM).toBe('finance_officer_platform');
  });

  it('ไม่มีคำเปล่าที่ตัดสินฝั่งไม่ได้เหลืออยู่', () => {
    expect(normalizeRole('account')).toBeNull();
    expect(normalizeRole('accountant')).toBeNull();
    expect(normalizeRole('finance')).toBeNull();
  });
});

describe('ไม่มีบทบาทใดอนุมัติหรือยืนยันการชำระเงิน (operator 2026-10-06)', () => {
  // การชำระเงินตัดสถานะด้วย webhook ที่ยืนยันลายเซ็นแล้วเท่านั้น และใบเสร็จออกจากการตัดสถานะนั้น
  // สิทธิ์ที่เคยให้คนตรวจสลิป ออกใบเสร็จเอง หรือดูบัญชีธนาคารสำหรับการโอน ต้องไม่มีอยู่ในตาราง
  const retiredKeys = /^(payment_slip|bank_account|receipt)\./;

  it('ตารางสิทธิ์ไม่มีคีย์ของการตรวจสลิป บัญชีธนาคาร หรือการออกใบเสร็จด้วยมือ', () => {
    expect(Object.values(PERMISSIONS).filter((p) => retiredKeys.test(p))).toEqual([]);
  });

  it('การเงินทั้งสองฝั่งถือสิทธิ์ชุดเดียวกัน และเป็นสิทธิ์อ่านล้วน', () => {
    const perms = (role) => Object.values(PERMISSIONS).filter((p) => hasPermission(role, p)).sort();
    const dtam = perms(CANONICAL_ROLES.FINANCE_OFFICER_DTAM);
    expect(perms(CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM)).toEqual(dtam);
    expect(dtam).toEqual([
      PERMISSIONS.ACCOUNTING_DASHBOARD_READ,
      PERMISSIONS.APPLICATION_VIEW_ALL,
      // No AUDIT_TIMELINE_READ: workflow history is not billing data (order 14).
      PERMISSIONS.INVOICE_VIEW_ALL,
      PERMISSIONS.REPORT_EXPORT,
    ].sort());
  });

  it('ผู้ขอรับรองไม่มีสิทธิ์ใดนอกจากยื่นและดูคำขอของตน', () => {
    const role = normalizeRole('health');
    expect(Object.values(PERMISSIONS).filter((p) => hasPermission(role, p)).sort())
      .toEqual([PERMISSIONS.APPLICATION_SUBMIT, PERMISSIONS.APPLICATION_VIEW_SELF].sort());
  });
});

describe('กลุ่มบทบาทของฝ่ายการเงิน', () => {
  it('ACCOUNT_STAFF และ FINANCE มีการเงินทั้งสองฝั่ง', () => {
    for (const group of [ROLE_GROUPS.ACCOUNT_STAFF, ROLE_GROUPS.FINANCE]) {
      expect(group).toContain(CANONICAL_ROLES.FINANCE_OFFICER_DTAM);
      expect(group).toContain(CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM);
    }
  });

  it('ไม่มีคำเก่าตกค้างในกลุ่มไหนเลย', () => {
    const retired = ['account', 'accountant', 'ACCOUNTANT', 'ACCOUNT_DTAM',
      'ACCOUNT_PLATFORM', 'ADMIN', 'SUPER_ADMIN', 'AUDITOR', 'SCHEDULER'];
    for (const [name, group] of Object.entries(ROLE_GROUPS)) {
      const found = group.filter((r) => retired.includes(r));
      expect({ group: name, found }).toEqual({ group: name, found: [] });
    }
  });
});

describe('ทั้งสองฝั่งเป็นเจ้าหน้าที่', () => {
  it('isProviderRole รับทั้งคู่', () => {
    expect(isProviderRole(CANONICAL_ROLES.FINANCE_OFFICER_DTAM)).toBe(true);
    expect(isProviderRole(CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM)).toBe(true);
  });
});

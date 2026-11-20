/**
 * H4 — accounting sub-nav + active-tab matching.
 *
 * The per-side tab filter (visibleAccountingTabs: DTAM saw only ar-aging) was
 * removed — operator 2026-09-11 "finance ต้องเห็นเหมือนกัน". This file now pins
 * the one tab set every viewer gets, and the active-tab matcher.
 *
 * F-A8b-15 (staging walk 2026-10-27): ใบกำกับภาษีซื้อ, สมุดรายวันทั่วไป and
 * ปิดงวดบัญชี are gone from the sub-nav. Order 59 froze and hid purchase invoices,
 * manual journal entries and the period close; order 64 ค9 removed the automatic
 * journal and the input-VAT report; order 12 deletes retired flows outright.
 * ภาษีหัก ณ ที่จ่าย stays: the ทบ.50 ทวิ register that juristic payers send us
 * (orders 56(6), 59(4), 64 ค2).
 */
import { describe, expect, it } from '@jest/globals';

import * as tabsModule from '../accounting-tabs';

const { ACCOUNTING_TABS, isAccountingTabActive } = tabsModule;

describe('[H4] ACCOUNTING_TABS — one set, no side filter', () => {
  it('lists the three accounting tabs that remain', () => {
    expect(ACCOUNTING_TABS.map((t) => t.href)).toEqual([
      '/provider/accounting/ar-aging',
      '/provider/accounting/reports',
      '/provider/accounting/wht',
    ]);
  });

  it('no longer exports a side-based visibility filter', () => {
    expect((tabsModule as Record<string, unknown>).visibleAccountingTabs).toBeUndefined();
  });
});

describe('[H4] isAccountingTabActive', () => {
  it('index tab is active ONLY on the exact /provider/accounting path', () => {
    expect(isAccountingTabActive('/provider/accounting', '/provider/accounting')).toBe(true);
    // must NOT light up on a sub-route (would double-highlight with the sub-tab)
    expect(isAccountingTabActive('/provider/accounting', '/provider/accounting/ar-aging')).toBe(false);
  });

  it('sub-tabs are active by path prefix', () => {
    expect(isAccountingTabActive('/provider/accounting/ar-aging', '/provider/accounting/ar-aging')).toBe(true);
    expect(isAccountingTabActive('/provider/accounting/wht', '/provider/accounting')).toBe(false);
    expect(isAccountingTabActive('/provider/accounting/wht', null)).toBe(false);
  });
});

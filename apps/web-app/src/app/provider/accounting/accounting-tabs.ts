/**
 * Accounting sub-nav config + pure helpers (H4).
 *
 * Lives OUTSIDE layout.tsx because Next.js App Router route files (layout.tsx)
 * may only export a restricted set (default component + metadata/dynamic/etc.) —
 * arbitrary named exports make `next build` fail with "Layout does not match the
 * required types of a Next.js Layout" (caught only at image-build, not by tsc /
 * PR CI). Keeping the const + helpers here lets the layout and the unit test both
 * import them while the layout stays a clean default-only export.
 */
export interface AccountingTab {
  href: string;
  label: string;
}

// The index tab (href='/provider/accounting', label 'ใบเสร็จ') was removed
// from this sub-nav; the page itself is untouched and still reachable by
// direct URL (it is also the tile-home destination for ACCOUNT_NAV's
// "ธุรกรรมการเงิน" tile — see nav-config.ts) — only this tab button is gone.
//
// Every tab is shown to every role that can open /provider/accounting — the two
// finance roles see the same set (operator 2026-09-11 "finance ต้องเห็นเหมือนกัน").
// The per-side filter that used to hide five tabs from the DTAM finance role is gone.
//
// ใบกำกับภาษีซื้อ, สมุดรายวันทั่วไป and ปิดงวดบัญชี left with their pages (F-A8b-15): order 59
// froze and hid them, order 64 ค9 removed the journal and the input-VAT report, order 12
// deletes retired flows outright. ภาษีหัก ณ ที่จ่าย stays: the ทบ.50 ทวิ register juristic
// payers send us (orders 56(6), 59(4), 64 ค2).
export const ACCOUNTING_TABS: readonly AccountingTab[] = [
  { href: '/provider/accounting/ar-aging', label: 'ลูกหนี้ค้างชำระ' },
  { href: '/provider/accounting/reports', label: 'รายงานการเงิน' },
  { href: '/provider/accounting/wht', label: 'ภาษีหัก ณ ที่จ่าย' },
];

/** A tab is active on an exact match for the index, else by path prefix. */
export function isAccountingTabActive(tabHref: string, pathname: string | null): boolean {
  if (!pathname) { return false; }
  if (tabHref === '/provider/accounting') { return pathname === tabHref; }
  return pathname.startsWith(tabHref);
}

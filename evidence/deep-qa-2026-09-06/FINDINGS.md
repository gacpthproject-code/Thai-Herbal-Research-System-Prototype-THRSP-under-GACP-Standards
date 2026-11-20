# Deep QA 2026-09-06 — findings from pressing the real buttons

Environment: throwaway Postgres migrated from zero (134 migrations — proves the pending
ones deploy), backend + Next.js booted from the tree, every action driven through the real
DOM in Chromium (Playwright) or the real HTTP doors. Cast created through the real
registration doors: 20 farmers, 14 staff (2 per department).

## What the walk PROVED works
- Registration: 34/34 accounts created and every one logs in (health door + admin
  provider-creation door + the out-of-band platform_admin seam the product itself requires).
- The six-step wizard end to end: login → 6 steps → uploads → ส่วนที่ ๔ declarations →
  ยื่นคำขอ → PENDING_DOC_FEE. **13 farmers filed real applications through the browser**,
  across all three scenarios (1 / 2 / 3 ลักษณะพื้นที่, medical / export purposes).
- The fee is a SUM per cultivation type on a real quotation: 3 types = 105,930, itemised
  แบบกลางแจ้ง/โรงเรือน/อาคารระบบปิด × งวดที่ 1/2, and the total is the lines' sum.
- The payment page shows the accepted quotation and the online-pay entry.

## Defects the walk FOUND — every one fixed and committed this session
1. **Submit judged by the dead 9-step schema** (`7444ea81`) — a complete v2 filing was
   refused 422 on 16 fields no screen writes. The v1-hard-lock class at scale: NO filing
   made through the live wizard could be submitted at all. Backend suites were all green.
2. **Under-billing: 3 types billed as 1** (`f5188dbe`) — the quotation read a column the
   wizard never writes and fell back to `?? 1`: 35,310 where 105,930 was owed, −70,620 per
   filing. Only pressing the door showed it.
3. **Silent 422 at the review page** (`22d25614`) — the refusal died in the console; the
   box said only "กรอกให้ครบ". Now it names the fields.
4. **Payment dead-end** (`48f797ab`) — an accepted quotation with money due offered no way
   to pay: two circular gates each waiting for a row only the page could create.

The pattern across all four: **the unit suite exercised both ends and never the hop
between them.** Every fix carries a pure-function test of the seam plus a real-DOM re-press.

## Code-quality audit (separate agent, measurable — see verdict below)
Verdict: maintainable by a competent engineer who did not write it; NOT vibe-coding by the
measures that can be counted (naming 0 violations / 329 files, TODO+FIXME 0.003%, 82% of
sampled assertions test behaviour not shape, comments cite ticket numbers). Real risk is
not "messy code" but "fails without anyone knowing" — 4 endpoints answer HTTP 200 with
empty data when a query throws, 2 without a log line. Highest-leverage fixes recorded in
BACKLOG-FOUND (F-QA-ERRLOG, F-QA-GATES, F-QA-DUP).

## Staff journeys — every department, real browser, real handoff
- All 7 department portals open with a real staff login and land on their own surface
  (not bounced): document_reviewer → /provider/reviewer, scheduler → /provider/coordinator,
  auditor → /provider/audits, account_dtam → /provider/accounting/dtam, account_platform →
  /provider/accounting/platform, admin → /admin/dashboard, platform_admin →
  /admin/organizations. Screenshots: shots/staff-*.png.
- The departmental HANDOFF walked with real state transitions through the real state
  machine (writeApplicationStatus, each hop a real role's edge):
  farmer files (PENDING_DOC_FEE) → account_dtam settles the doc fee (DOC_FEE_PAID) →
  scheduler assigns the reviewer (ASSIGNED_FOR_REVIEW) → the reviewer opens
  /provider/reviewer/:id/document-check and sees THIS application: the uploaded COA with
  รับเอกสารนี้/ขอเอกสารเพิ่ม, the checklist rows, and the derived ข้อ 1.4 verdict
  (ขอบข่าย IN · คุณสมบัติ PASS · สรุป INCOMPLETE). Screenshots: shots/reviewer-*.png.

## Break-test เส้นกลาง-ปลาย (stack แยก, ต่อจากการ merge)
เดินต่อจากผู้ตรวจเอกสาร ผ่านการส่งต่อจริงในเบราว์เซอร์ + real service:
- ผู้ตรวจกด "รับคำขอ" (ACCEPT_ALL) ในเบราว์เซอร์ → `DOC_APPROVED` → `PENDING_AUDIT_FEE`, applicant notified (WIRE 200)
- ใบเสนอราคางวด 2 ถูกต้อง: `88,275` = 3 รูปแบบ (OUTDOOR/GREENHOUSE/INDOOR × 25,000 + platform + VAT) — additive fee ทำงานตลอดสาย
- **ด่านออกใบรับรอง (onsite-evidence-gate) ปฏิเสธถูกต้องเมื่อไม่มีหลักฐานหน้างาน** — `NO_ONSITE_AUDIT` · การป้องกัน zero-evidence-cert (Critical ที่เคยปิด) ยังยืนอยู่จริงบนโค้ดปัจจุบัน

เส้นที่เหลือ (onsite evidence capture → cert mint → T&T/QR → factory) ทำ definitive
view-in-the-loop walk บน staging.gacpth.com เมื่อ staging ต่อ Supabase project เสร็จ —
เพื่อให้ operator กดดูจริง แทนที่จะเดินซ้ำบน throwaway ที่มองไม่เห็น

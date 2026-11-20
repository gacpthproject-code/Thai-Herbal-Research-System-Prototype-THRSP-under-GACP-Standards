# Task 7 view-pack — tile-home-nav closing walk

Live Playwright walk against the real dev stack (Next.js `localhost:3000` +
backend `localhost:8000`, Supabase-backed DB), captured 2026-08-21. Every
role's home → into one menu → back home; farmer shot at both mobile
(390×844) and desktop (1920×1080). Script: reconstructed from
`.superpowers/sdd/2026-08-20-tile-home-redesign` session scratch
(`task7-shots/walk.js`), run from `apps/web-app` so `@playwright/test`
resolves; screenshots land in `screenshots/`.

Full jest run: `test-output.txt` (257 suites / 2053 tests, all green — see
report for the reconciliation against the pre-existing baseline).
`tsc-output.txt`: the 62-line pre-existing e2e-phase0 baseline, unchanged.
`probe-fail-loud-proof.txt`: Step 1 RED/GREEN proof for the nav-config
integrity probe.

| # | File | What it proves |
|---|---|---|
| 01 | `01-farmer-home-desktop-1920.png` | Farmer (walk1, has cert) tile home, desktop. 6 primary tiles + "เมนูเพิ่มเติม" row (ทีมงาน/แบบสำรวจ/ความรู้สมุนไพร). No sidebar, no top menu-link row — slim bar only (N2). |
| 02 | `02-farmer-status-page-desktop.png` | Clicking "ตรวจสอบสถานะ" from home lands on `/health/status` (N6 — the retired "ภาพรวม" content is folded into this single status page). |
| 03 | `03-farmer-back-home-via-crumb.png` | `BackHomeCrumb` returns to `/health/home` from status. |
| 04 | `04-farmer-avatar-menu-desktop.png` | Avatar dropdown holds exactly โปรไฟล์ + ออกจากระบบ — proves logout lives here (RULING 1), not in the bottom nav. |
| 05 | `05-farmer-home-mobile-390.png` | Same home tile grid at farmer's primary viewport, 390×844. |
| 06 | `06-farmer-bottom-nav-5-items-no-logout.png` | Close-up of `<nav aria-label="หน้าหลัก">` — exactly 5 items (หน้าหลัก/สถานะ/ชำระเงิน/ใบรับรอง/การปลูก), **no 6th "ออก" button**. Direct visual proof of RULING 1 (the fix committed in this task) and the new pinned test in `bottom-nav.test.tsx`. |
| 07 | `07-farmer-certificates-mobile.png` | Tapping the "ใบรับรอง" bottom-nav item navigates to `/health/certificates`. |
| 08 | `08-farmer-back-home-via-bottom-nav.png` | Tapping "หน้าหลัก" in the bottom nav returns to `/health/home` — the full mobile menu→back loop. |
| 09 | `09-farmer-home-no-cert-locked-mobile.png` | Second farmer specimen (farmerA, no active cert), mobile home — confirms the tile grid renders correctly for a non-certified farmer too. (The bottom-nav lock badge on "การปลูก" is timing-sensitive against the certs fetch and isn't legible at this crop; the lock behavior itself is covered live by `bottom-nav.test.tsx`'s lock-state tests, not re-asserted from this screenshot.) |
| 10 | `10-auditor-home-single-real-tile.png` | Auditor tile home shows **only** "งานตรวจแปลง" — the two dead tiles ("นัดหมายลงพื้นที่", "ประวัติผลตรวจ", which pointed at nonexistent routes) are gone (Step 1/2 nav-integrity fix). |
| 11 | `11-auditor-audits-page-not-404.png` | The one real tile lands on `/provider/audits` — a real page, not a 404. |
| 12 | `12-reviewer-home.png` | Reviewer tile home — "ตรวจเอกสาร" tile. |
| 13 | `13-reviewer-page-not-404.png` | Tile now points at `/provider/reviewer` (was the dead `/provider/review`) — real page confirmed live. |
| 14 | `14-scheduler-home.png` | Scheduler tile home — "จัดคิวแบ่งงาน" tile. |
| 15 | `15-scheduler-queue-page.png` | Lands on `/provider/scheduler/queue`, a real page. |
| 16 | `16-account-home.png` | Account tile home — "ธุรกรรมการเงิน" tile. |
| 17 | `17-account-accounting-page-no-slip-tab.png` | Tile lands on `/provider/accounting`; the sub-nav tab row shows ลูกหนี้ค้างชำระ / เงินสดรับประจำวัน / กระทบยอดธนาคาร / รายงานการเงิน / ภาษีหัก ณ ที่จ่าย / ใบกำกับภาษีซื้อ / สมุดรายวันทั่วไป / ปิดงวดบัญชี — **no "สลิป & ใบเสร็จ" tab**, confirming the ตรวจสลิป menu removal (RULING 3 / N12). Page content itself is unchanged and still reachable directly. |
| 18 | `18-admin-dashboard-redirects-to-home.png` | Admin hitting the legacy `/provider/dashboard` entry point now auto-redirects to `/provider/home` (RULING 2 — `providerLandingPath` now routes ADMIN there) and shows the admin tile set (จัดการผู้ใช้ / รายงาน / ตั้งค่าระบบ). |
| 19 | `19-admin-reports-tile-lands-on-real-dashboard.png` | The "รายงาน" tile lands on `/admin/dashboard` (was the dead `/admin/reports`) — a real KPI page, not a 404. |

## Not covered

- **platform_admin**: no credential was provided for this role in the UAT
  seed file used for this walk (only farmer/reviewer/auditor/scheduler/
  account/admin + the two farmer specimens were seeded); its landing
  (`/admin/organizations`) and single nav tile are unchanged by this task
  and are covered by unit tests (`nav-config.test.ts`,
  `landing-route-coherence.test.ts`), not a live screenshot.
- No flow in this task is flag-gated or mocked — every shot above is a real
  authenticated session against the live dev stack.

# W1 batch A — five design/copy fixes — 2026-08-21

Branch: `fix/design-reproducibility`. One commit per fix, TDD (RED shown before GREEN) for A1/A2/A5;
grep/fs-based regression tests for A3/A4 copy/link fixes, following the repo's existing pattern
(`(marketing)/__tests__/no-fabricated-fees.test.ts`, `apps/backend/__tests__/unit/thai-copy-style-gate.test.js`).

## A1 — equal-height cards (herbs + planting grids)
Commit: `09854844`
Verified: `apps/web-app/src/app/health/herbs/client-view.tsx` Link+Card at lines 83-84 (unchanged from
audit); `apps/web-app/src/app/health/planting/client-view.tsx` Link+Card at lines 132-133 (unchanged).
Changed: added `h-full` to both the `Link` and `Card` in each file, plus `no-underline` on the herbs
Link (was rendering underlined text — no global anchor text-decoration reset exists in this repo).
Planting's grid item is actually `motion.div > Link > Card`; the `motion.div` is the true CSS grid
item and is already stretched by Grid's default `align-items: stretch`, so only the Link+Card needed
`h-full` — same two-level pattern the operator's nav-tile.tsx fix used.
New tests: `apps/web-app/src/app/health/herbs/__tests__/herbs-grid-equal-height.test.tsx`,
`apps/web-app/src/app/health/planting/__tests__/planting-grid-equal-height.test.tsx` (mirrors
`nav-tile.test.tsx`'s equal-height assertion). RED: `A1-RED.txt` (both fail on missing `h-full`).
GREEN: `A1-GREEN.txt` (2/2 passed). Also reran `nav-tile.test.tsx` (5/5 passed, no regression).

## A2 — raw status code shown to farmers
Commit: `1df9661b`
Verified: `apps/web-app/src/app/health/establishments/[id]/client-view.tsx:296` rendered
`{cycle.status}` directly (unchanged line number from audit).
Map used: exported `STATUS_META` from
`apps/web-app/src/app/health/planting/[id]/planting-cycle-detail-page-config.ts` (was a
non-exported local const) instead of creating a second copy. Chose this one over 3 other
pre-existing near-duplicate maps in the codebase (health/planting/client-view.tsx's
`statusLabelMap`, admin/planting's `STATUS_LABEL`, trace/plot-cycle's `CYCLE_STATUS_LABEL`) because
it's the config file for the actual page these cycle links point to (`/health/planting/[id]`), and
its label values agree with the farmer-facing planting pages (`COMPLETED: 'ปิดรอบแล้ว'`) — the admin
variant uses a different label (`'เสร็จสิ้น'`) for the same status, so it was NOT interchangeable.
Unknown-status fallback: `'ไม่ทราบสถานะ'`, matching the existing convention in
`components/finance/StatusBadge.tsx`.
New test: `.../establishments/[id]/__tests__/cycle-status-label.test.tsx` — mounts the page, clicks
the "cycles" Radix tab (activates on `mousedown`, not `click`), asserts a known status renders its
Thai label and an unmapped status renders the honest fallback, never the raw code. RED: `A2-RED.txt`
(shows raw "GROWING"/"SOME_UNMAPPED_STATUS" in the DOM). GREEN: `A2-GREEN.txt`. Also reran the 3
existing `planting/[id]/__tests__` suites (27/27 passed).

## A3 — Thai copy defects
Commit: `8328d2f7`
- Thai/Latin spacing: `"ของGACP"` → `"ของ GACP"` in `health/start`, `health/sop-templates`,
  `health/official-documents` client-views — exactly the 3 places grep found.
- Em dash: ran the repo's real enforcement gate, `scripts/ci/check-thai-copy-style.js` (an
  AST/string-literal scanner, not naive grep — see its own test suite's false-positive notes). It
  reported only 1 web-app hit (`login-chooser.tsx`) plus 6 backend hits (out of scope for this
  batch). Its blind spot: it only scans string/template literals, not JSX text nodes split by
  `{expression}` containers — where the other 4 of the audit's "about 5" live. Manually verified
  and fixed all 5: `login-chooser.tsx` (coming-soon notice body), `GeneralLedgerViewer.tsx` (account
  line), `invoice-detail-modal.tsx` (refund-confirm line), `member-permission-matrix.tsx` (confirm
  dialog), `report-modal.tsx` (header line). Re-ran the gate after: 7→6 issues (the 1 it could see,
  fixed; 6 backend ones unchanged, confirming no new violations). `thai-copy-gate-before.txt` /
  `-after.txt`.
- Register: `health/payments/client-view.tsx` lines 347/409/411 — all 3 ท่าน → คุณ, confirmed no
  other ท่าน left in that file.
Excluded (untouched, verified): `health/account/erasure/**` (ท่าน still present, checked explicitly),
`en-footer.ts`/`th-footer.ts` (not touched).
New test: `apps/web-app/src/__tests__/thai-copy-defects-a3.test.ts` (fs-read + substring assertions,
one describe block per defect class, plus an exclusion-guard block). RED: `A3-RED.txt` (4/5
sub-tests fail — first draft of the em-dash test was a whole-file "no em dash anywhere" check, which
false-failed on legitimate comment usage in `login-chooser.tsx`; corrected to assert the exact known
defect substrings only, matching the real gate's own documented false-positive lesson). GREEN:
`A3-GREEN.txt` (9/9). Also reran `login-chooser.test.tsx` (24/24), `payments-states.test.tsx`,
`modal-aria-labelledby.test.tsx` (report-modal-specific), `member-permission-matrix.test.ts`,
`member-healthid-masked.test.ts` (27/27) — all green, no regression.

## A4 — dangling links to retired dashboard routes
Commit: `8589782c`
Found 6 real (non-test, non-comment) `/health/dashboard` references and 4 `/provider/dashboard`
references, matching the audit's counts. Of the 6 health-side, 2
(`applications/new/_steps/steps/success-step.tsx`, `applications/new/_steps/layout.tsx`) are under
the wizard directory owned by another agent this session — NOT touched, verified untouched in the
test. Fixed the remaining 4, plus 1 extra found during verification: `app/health/page.tsx`'s bare
`redirect('/health/dashboard')` — safe to update because `health/dashboard/page.tsx` is an
unconditional `redirect('/health/home')` shim (confirmed by reading it), so this only removes a
redirect hop with no behavior change. Fixed: `health/error.tsx`, `health/onboarding/onboarding-client.tsx`
(both the Complete-handler `router.push` and the Skip Link), `app/not-found.tsx`, `app/health/page.tsx`.
Provider-side: fixed all 4 — `provider/profile/page.tsx`, `provider/not-found.tsx`,
`provider/error.tsx` (identical shape to their health counterparts).
Hard exclusion respected: `lib/constants/auth-routes.ts` untouched (verified both
`HEALTH_DASHBOARD_ROUTE` and `PROVIDER_DASHBOARD_ROUTE` constants still present) — read
`auth/callback/[provider]/client-view.tsx:166` and confirmed this IS the actual post-login redirect
target (`isProviderRole(role) ? PROVIDER_DASHBOARD_ROUTE : HEALTH_DASHBOARD_ROUTE`), so per the
task's own warning this was correctly left alone.
Deliberately NOT changed: `app/provider/page.tsx`'s `redirect('/provider/dashboard')`. Read
`provider/dashboard/page.tsx` and confirmed it is NOT a dead shim like the health one — it branches
per role (`providerLandingPath`: scheduler→coordinator, auditor→audits, document_reviewer→reviewer,
account_dtam/platform→their own accounting URLs; only admin/legacy falls through to
`/provider/home`). Hardcoding `/provider/home` at the root would skip that role branching for every
other role — a real behavior change, not a dangling-link fix, so left as-is and reported rather than
changed.
New test: `apps/web-app/src/__tests__/dangling-dashboard-links-a4.test.ts` — asserts the fixed files
reference the new routes and not the old ones, AND asserts the 3 exclusions are still exactly as
expected (auth-routes.ts constants present, provider/page.tsx still points at
`/provider/dashboard`, the wizard files still reference `/health/dashboard`). RED: `A4-RED.txt`
(5/8 fail pre-fix, 3 exclusion-checks already pass). GREEN: `A4-GREEN.txt` (8/8). Also reran
`bottom-nav.test.tsx`, `slim-bar.test.tsx`, `dashboard-layout-bell.test.tsx`,
`dashboard-layout-language-toggle.test.tsx`, `nav-config.test.ts` (36/36) — no regression.

## A5 — invalid markup + retired per-plant metrics
Commit: `2f398593`
Verified: `apps/web-app/src/app/admin/planting/[id]/page.tsx` lines 201-211 — all 11 summary rows
were `<p>label: <p className="font-bold">value</p></p>`, not just some of them.
Read R8 in `docs/superpowers/specs/2026-08-20-planting-tnt-design.md` before touching anything:
"ไม่ทำระดับ 'ต้น' อีกแล้ว ... 'จำนวนต้น' เป็นแค่ตัวเลขในข้อมูลรอบปลูก ไม่ใช่การติดตามรายหน่วย" —
per-plant tracking retired permanently, and legacy PlantUnit fields are explicitly "ไม่ลบในงานนี้"
(not deleted in this work, left for legacy-sweeper).
Changed: inner `<p>` → `<span>` on all 5 SURVIVING rows (the invalid-nesting fix applies file-wide
in this block). Removed exactly 6 rows reporting per-PLANT counts: จำนวนต้น (`_count.plantUnits`),
ต้นตามแผน/ต้นที่ใช้งาน/ต้นที่ถูกถอน/เกินแผน/ยังไม่จัดสรร (`integrity.*`) — matching the task's count.
Kept (not per-plant): สถานะรอบปลูก, วันเริ่มปลูก, กำหนดเก็บเกี่ยว, ชุดเก็บเกี่ยว (harvest-BATCH count),
กิจกรรม (cultivation-log count). Did NOT touch the `AdminCycleDetail` type, the `_count`/`integrity`
fields it still declares, the two `apiClient.get` calls, or the integrity Alert banner above (lines
146-153) which also reads `overPlanCount`/`unassignedCount` — that's a data-quality warning, a
different UI purpose from a per-plant metric row, and the task only named the summary-tab rows.
New test: `.../admin/planting/[id]/__tests__/summary-tab-markup-and-metrics.test.tsx` — mounts the
page, switches to the "สรุป" (summary) Radix tab, asserts (1) no `<p>` contains a nested `<p>`, (2)
none of the 6 retired labels render, (3) all 5 kept labels still render. RED: `A5-RED.txt` (2/3
fail: nested-`<p>` assertion found 11 elements, retired-labels assertion found "จำนวนต้น" present;
the "keeps 5 rows" check already passed since those rows already existed). GREEN: `A5-GREEN.txt`
(3/3).

## Cross-cutting verification
- `npx tsc --noEmit -p tsconfig.json` after all 5 fixes: 62 lines total, same as the stated
  `e2e-phase0/*.spec.ts` baseline — zero new lines (`tsc-after-A1-A5.txt`).
- `eslint` run per-fix on every touched file (including new test files): clean (exit 0) in every
  case — A1/A2 combined run, A3 run, A4 run, A5 run all recorded in this session's tool output.
- Pre-commit hook (system-integrity + trust-domain lint + long suite) ran to completion on every
  commit; none were bypassed with `--no-verify`.

## Not reproduced / not touched, with reasons
- A4: `app/provider/page.tsx` — evaluated, deliberately NOT changed (role-branching, see above).
- A4: 2 of the original 6 `/health/dashboard` hits are inside `applications/new/**` — owned by
  another agent this session, not touched.
- A3: 6 backend em-dash violations (`entity-service.js`, `notification-view.selftest.js`,
  `canonical-application-validator.js`) surfaced by `check-thai-copy-style.js` — out of scope (task
  named web-app files only); confirmed unchanged (before/after gate counts: 7→6, backend hits
  identical in both).
- Nothing in the batch failed to reproduce; all 5 findings were verified at (or within a few lines
  of) the cited locations before any edit.

## H17 — ACCOUNTANT / SCHEDULER / ADMIN read any application by raw id — 2026-08-23

Status: DONE(probe:jest __tests__/unit/h17-application-visibility-scope.test.js) — live-proven on the real DB, NOT yet deployed to preview

### Root cause
`apps/backend/shared/application-visibility.js:113` (pre-fix) ended in `return null` for every role it had not
narrowed, and `withVisibility()` (`:124-130`) reads `null` as "no additional constraint". So **"no scope defined
for this role" meant "read the whole table"** — a default-allow fall-through, not a deliberate grant. Function-level
`APPLICATION_VIEW_ALL` + `AUDIT_TIMELINE_READ` are held by scheduler and all three account roles
(`shared/canonical-rbac.js:166,188-193,210-229`), so nothing else stopped them on the three surfaces.

### The scope decided per role, and why (from code, not assumption)
Three explicit buckets; anything in none of them now returns `DENY_ALL` (`{ id: '__no_application_scope__' }`).
1. **UNRESTRICTED — `admin`, `platform_admin`.** Kept broad on purpose: ADMIN holds every permission
   (`canonical-rbac.js:232-235`) and is the override on every workflow edge; narrowing it breaks the admin
   surfaces that legitimately span the tenant. Its exposure is the flag-gated org-scoping work (ADR-014), not this bug.
2. **ASSIGNMENT-SCOPED — `auditor`, `document_reviewer`.** Unchanged.
3. **WORK-POOL-SCOPED — `scheduler`, `account`, `account_dtam`, `account_platform`.** These do work a tenant-wide
   pool, but only a slice of the lifecycle. The slice is **derived from the SSOT**, not hand-listed: the states named
   on either side of that role's own rows in `ROLE_TRANSITIONS` (`services/workflow-transition-service.js:107-139`).
   · scheduler → DOC_FEE_PAID, ASSIGNED_FOR_REVIEW, AUDIT_FEE_PAID, AUDIT_CONFIRMED (assign-reviewer + confirm-audit)
   · account\* → PHASE_1/2_SLIP_UNDER_REVIEW, PENDING_DOC_FEE, DOC_FEE_PAID, PENDING_AUDIT_FEE, AUDIT_FEE_PAID
   Neither role loses a product surface: the scheduler dashboard queries directly
   (`scheduler-dashboard-handler.js:28-46`), accounting runs on `routes/api/finance/*` (slip approve/reject included —
   `finance/payment-slips.js:460,557`), neither passes through this filter; and the frontend does not admit either role
   to `/provider/applications` at all (`web-app/src/lib/provider-role-config.ts:87`).
   `health` / `system` / any future role → DENY_ALL (applicants read their own via `routes/api/applications/*`).

### RED → GREEN
RED (before the fix), `npx jest __tests__/unit/h17-application-visibility-scope.test.js`:
`Tests: 27 failed, 25 passed, 52 total` — the 27 are every cross-boundary case on all three surfaces
(detail / activities / audit-timelines) plus the unit "absent scope must deny"; the 25 that already passed are the
"legitimate read still works" half, which must stay green in both directions.
GREEN (after): `Tests: 52 passed, 52 total`, plus `__tests__/application-visibility.test.js` 21 passed (73 total).
No regression in the neighbours that exercise this module: `admin-positive-bypass`, `auditor-scope-correctness`,
`cross-role-boundary`, `account-side-cross-boundary`, `workflow-audit-timelines-handler`,
`x2-fix-d-rbac-defense-in-depth`, `auditor-routes-rbac` → **215 passed**; the 8 audits/decision-letter suites → **75 passed**.

### Live proof (same Supabase DB in both columns; 25 applications)
BEFORE = `https://preview.gacpth.com` (main, unfixed). AFTER = the fixed build mounted locally on the SAME database
(`127.0.0.1:8124`, provider-applications + provider-auth routers only, GET-only, no cron/queue workers). The fix is
**not deployed to preview**, so "after on preview" is not claimable until it ships.

| role | surface probe | BEFORE | AFTER |
|---|---|---|---|
| scheduler | detail / activities / audit-timelines on DRAFT, CERTIFIED, PHASE_1_SLIP_UNDER_REVIEW | 200/200/200 | 404/404/404 |
| scheduler | same three on DOC_FEE_PAID, ASSIGNED_FOR_REVIEW (its pool) | 200 | 200 |
| account | same three on DRAFT, CERTIFIED, ASSIGNED_FOR_REVIEW | 200/200/200 | 404/404/404 |
| account | same three on PHASE_1_SLIP_UNDER_REVIEW, DOC_FEE_PAID (its settlement window) | 200 | 200 |
| admin | all five statuses, all three surfaces | 200 | 200 (intentional) |

Full-table enumeration of all 25 ids through the detail endpoint:
`account 25/25 → 14/25` · `scheduler 25/25 → 7/25` · `admin 25/25 → 25/25`
(responses carrying a 13-digit national id: account 19 → 14, scheduler 19 → 5).

### What this does NOT fix
- **Data minimisation.** The accountant still receives `formData` (national id + address) for the 14 applications
  inside its settlement window. Trimming the projection for account\* is the report's second recommendation; it is a
  response-shape change on `formData`, whose key layout varies per row, so I did not guess at it. Follow-up.
- **Cross-organization reads by admin/platform_admin** — deliberately deferred to the ADR-014 Phase E.2 org
  read-scoping / RESTRICTIVE RLS rollout, unchanged here.
- Money behaviour: nothing touched. No amount, charge, settlement or ledger path changed — the slip approve/reject
  route does not use this filter (verified: `withVisibility` has no caller under `routes/api/finance/`).

Files: `apps/backend/shared/application-visibility.js` · `apps/backend/__tests__/unit/h17-application-visibility-scope.test.js` (new) · `apps/backend/__tests__/application-visibility.test.js`
The three route handlers needed no edit — they already 404 on an empty result
(`routes/api/provider/applications.js:473-476,638-645`, `handlers/workflow-audit-timelines-handler.js:46-62`);
the bug was entirely the filter's default-allow.

Evidence: `%TEMP%/claude/.../scratchpad/h17/` — `live-before.txt`, `live-after.txt`,
`live-before-account-enumeration.txt`, `all-apps.json`, `after.sh`, `enum-after.sh`, `live-server.js`.
Cleanup: both probe servers stopped (ports 8123/8124); no rows created — the only DB side effect is normal login on
the UAT accounts. Account 4310100001149 never touched.

## B-NAV batch (items 1-5) — 2026-08-22
Status: DONE(probe: jest 27 suites/180 tests + tsc --noEmit + eslint + ratchet.sh + system-integrity-check.js §8b, all in-session on worktree gacp-wt-nav)
Did:
- Item 1: BackHomeCrumb moved to DashboardLayout shell (`dashboard-layout.tsx`) — auto-renders on every inner health+provider page via new `findNavLabelForPath` (nav-config.ts:568), suppressed on the role's own home path and via new `hideBackHomeCrumb` prop (used for `/health/more`, health/layout.tsx:38). Removed the sole direct caller (`health/status/client-view.tsx:148`).
- Item 2: `/help` gets `HelpBackHomeCrumb` (new file, app/help/help-back-home-crumb.tsx) — derives farmer vs officer home from `AuthService.getUser().role` via `normalizeRole`, same rule as the slim-bar logo; anonymous falls back to `/`.
- Item 3: added `bottomNav`/`shortTH` to the primary item in AUDITOR_NAV, REVIEWER_NAV, SCHEDULER_NAV, ACCOUNT_NAV, ADMIN_NAV(x3), PLATFORM_ADMIN_NAV; added secondary items standards/surveys/herbs/datasets to auditor+reviewer, image-assessment to auditor only (nav-config.ts). DashboardLayout's bottom nav unified into one code path driven by new `canonicalRole` prop (provider-layout.tsx:82 now passes its resolved role down) — no fork.
- Item 4: new `ALL_NAV_ARRAYS`/`findNavLabelForPath` exports + `nav-config-route-integrity.test.ts` (every {key,path} resolves to a real page.tsx; every known role non-empty). Confirmed existing `scripts/system-integrity-check.js` §8b still parses all new entries clean.
- Item 5: 6 tools (site-analysis, training, sop-templates, sop-builder, reports, documents) added to FARMER_NAV as secondary items; `/health/more` untouched (W3-8 not in scope).
Ratchet: hardcode=36 todo=56 env-direct=122 dup-source=2 — unchanged from baseline (ratchet.sh PASS)
Blocked: -
Next: W2-4 (admin portal onto nav-config+BackHomeCrumb, separate AdminLayout untouched here); W3-8 retire /health/more once operator confirms.
Evidence: worktree C:/Users/charo/Documents/GitHub/gacp-wt-nav (branch feat/nav-completion, uncommitted); test output captured this session (RED then GREEN, see reply for RED excerpt); tsc/eslint/ratchet/integrity-check runs above.

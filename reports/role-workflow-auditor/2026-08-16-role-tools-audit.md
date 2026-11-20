# Role Tools Audit — all 8 canonical roles × S0–S6 — 2026-08-16

Status: DONE(probe:manual-code-read — no automated probe exists for this deliverable class; every claim below is a file/line read in this session, no DB/staging access available) — see §7 for exact unverifiable items marked PENDING.

Scope: adversarial, read-only audit of ROLE TOOLS (SEE / DO / DATA SOURCE / LEAST-PRIVILEGE) for the 8 canonical roles in `apps/backend/shared/canonical-rbac.js:33-60` — `health`, `document_reviewer`, `scheduler`, `auditor`, `account_dtam`, `account_platform`, `admin`, `platform_admin`. No code changed. No `account`/`reviewer`/`audit`/`farmer` aliases used below except when quoting code that still contains them.

**S0–S6 mapping used** (no file defines S0–S6 literally — confirmed by grep of `docs/`, `GAP-MAP.md`, `docs/contract/manual/`; same caveat raised in `reports/role-workflow-auditor/2026-08-06-reviewer.md:11`). Collapsed from the 20-state machine, `apps/backend/services/workflow-transition-service.js:18-39`:

| Step | Meaning | States |
|---|---|---|
| S0 | ยื่นคำขอ | `DRAFT→SUBMITTED` |
| S1 | ชำระค่าธรรมเนียมเอกสาร | `PENDING_DOC_FEE→PHASE_1_SLIP_UNDER_REVIEW→DOC_FEE_PAID` |
| S2 | ตรวจเอกสาร | `ASSIGNED_FOR_REVIEW⇄REVISION_REQUESTED→DOC_APPROVED` |
| S3 | ชำระค่าตรวจประเมิน | `PENDING_AUDIT_FEE→PHASE_2_SLIP_UNDER_REVIEW→AUDIT_FEE_PAID` |
| S4 | จัดตารางตรวจประเมิน | `AUDIT_FEE_PAID→AUDIT_CONFIRMED` |
| S5 | ตรวจภาคสนาม/ตัดสิน | `CAR_PENDING⇄CAR_REVIEWING→AUDIT_PASSED→APPROVED` |
| S6 | ออกใบรับรอง | `APPROVED→CERTIFIED` |

---

## 1. Direct answer — does `RLS = SELECT TRUE` mean roles can cross organization boundaries?

**Yes, structurally possible; not proven-exploited in this session (no live Postgres available).**

- DB-level RLS is a permissive no-op: `rls_observe_check()` is `SELECT TRUE` unconditionally — `apps/backend/prisma/migrations/20260502060000_rls_quiet_observe_only/migration.sql:39-50`. `ADR-014-phase-e2-rls-decision.md:1,20-22` (status **OPEN**, dated 2026-05-03, still open today): *"The DB enforces nothing at the row level — application-layer `tenant-prisma-extension` is the only barrier."*
- The **only** real defense is a Prisma Client Extension, and it is partial by design:
  - Covers `findMany/findFirst/count/aggregate/groupBy` only — `apps/backend/services/tenant-prisma-extension.js:290-309`. `findUnique/update/delete` are explicitly **not** scoped: *"deferred to Phase 3... if the row is in a different tenant, RLS hides it"* (`tenant-prisma-extension.js:18-23`) — but RLS never actually flips to enforcing (previous bullet), so by-id reads/writes on `TENANT_SCOPED_MODELS` (`tenant-prisma-extension.js:40-129`, ~55 models incl. `User`, `Application`, `Invoice`, `PaymentTransaction`, `Certificate`) have **zero** row-level tenant check anywhere in the stack today.
  - Fails open whenever tenant context is unbound: `tenant-context-middleware.js:61-67` — *"Anonymous, public, or platform-admin route — let the request through without a tenant scope."* Any authenticated user whose `organizationId` doesn't resolve (legacy row, or `platform_admin` by design) skips the org filter entirely on every read that *does* go through `findMany/findFirst` (`applyReadScopes`, `tenant-prisma-extension.js:217-234`).
  - Global kill switch: `TENANT_READ_ORG_SCOPE=false` disables the backstop platform-wide with no independent second gate (`tenant-prisma-extension.js:206-208`).
- Concrete example found this session: `apps/backend/routes/api/admin/applications.js:122-151` (`GET /api/admin/applications`, the tenant-ADMIN cross-application list) has **no explicit `organizationId` in its `where`** — it relies 100% on the Prisma-extension backstop. If `TENANT_READ_ORG_SCOPE=false` or the requesting admin's `organizationId` fails to resolve, this endpoint silently returns every tenant's applications to a tenant-scoped admin.
- A real cross-org integration test exists (`apps/backend/__tests__/integration/tenant-isolation-cross-org-be.test.js`) proving the class of bug the backstop was built for — I did not execute it this session (no DB), so I cite it as evidence the team is aware of the exact gap, not as proof of current pass/fail. **PENDING** live verification.

---

## 2. Ranked findings

### F1 [HIGH] RLS gap — see §1 (cross-cutting, all roles, all tenant-scoped models)

### F2 [HIGH] Two independent "who is admin" gates disagree about `platform_admin`, in both directions

- **Gate A** — `apps/backend/middleware/require-admin.js:10-31`: literal `normalizeRole(user.role) !== CANONICAL_ROLES.ADMIN` → 403. **No `platform_admin` admission.** Guards the entire `/api/admin/*` tree: `apps/backend/routes/api/admin/index.js:7-19` (users, `user-permissions` GRANT/REVOKE, application override + `force-status` + `revert-last-transition`, `audit-log`, `requirement-rules`, `config`, `plants`, `planting-cycles`). A **third**, hand-duplicated copy of the same literal check lives in `apps/backend/routes/api/admin/applications.js:34-47` (`isAdminRole`/local `requireAdmin`) — three independent implementations of "is this exactly admin," already diverged on the one dimension that matters.
- **Gate B** — `apps/backend/middleware/role-middleware.js:40-42` inside `requireRole()`: *"platform_admin ... satisfies every provider role requirement."* Backs the `roleMiddleware.*` presets (`adminOnly` line 92, `providerOnly` 98, `financeOnly` 107, etc.) used on `/api/criteria/*` writes (`routes/api/applications/criteria.js:106,173,212`), `/api/applications/wizard/admin/*` (`routes/api/applications/wizard.js:96-118`), `/api/templates` writes (`routes/api/documents/templates.js:115,173`), and the legacy `/api/audit`,`/api/audit/stats` (see F4).
- **FE mirrors Gate A's exclusion, not Gate B's inclusion**: `apps/web-app/src/lib/provider-role-config.ts:66-84` — *"PLATFORM_ADMIN (cross-tenant governance) reaches ONLY its org-management portal `/admin/organizations`"* — `platform_admin` is listed in **zero** other `PROVIDER_AREAS` route rules (`provider-role-config.ts:65-227`). The shipping Edge gate `decideProviderRouteAccess` (`apps/web-app/src/lib/middleware-helpers.ts:145-171`) bypasses only literal `ADMIN` (line 164) — **not** `PLATFORM_ADMIN`. There is no `/platform-admin` FE surface at all (`find src/app -iname "*platform-admin*"` → no results this session).
- **Net effect**: `canonical-rbac.js:34-38,221-224` documents `platform_admin` as *"a superset of ADMIN (all permissions)"* — true for the in-memory permission Set, **false** for the actual route surface: platform_admin is **under**-privileged vs. admin on `/api/admin/*` (arguably correct per SEC-PROV-001, but contradicts the "superset" comment), while simultaneously **over**-reaching, via the undifferentiated Gate-B bypass, into scattered global-config-write endpoints (`criteria`, `wizard admin`, `templates`) that were never designed with `platform_admin` in mind and that no FE page ever routes it to. Two different "root" roles exist in the codebase (FE trusts `admin`; a chunk of backend trusts `platform_admin`) and they only partially overlap. This is exactly the "role missing a tool it needs" / "backend authorizes what no UI shows" pattern the audit asked for, on the platform's single highest-privilege role.
- Not itself proven as a **data** leak: `Criteria`/document-template models are not in `TENANT_SCOPED_MODELS` (`tenant-prisma-extension.js:40-129` — not found), so they read as global master data by design; I did not open the underlying Prisma schema to independently confirm this — **PENDING**.

### F3 [MEDIUM] `role-middleware.js` presets are a second, stale RBAC source — pre-dates the Tier-16 `ACCOUNT` split, never updated

- `apps/backend/middleware/role-middleware.js:90-123` — `providerOnly` (98), `financeOnly` (107), `healthOrProvider` (122) all hardcode `'account'` and never mention `'account_dtam'`/`'account_platform'`. `requireRole()`'s matching is exact-string / exact-canonical (`role-middleware.js:17-26,44-49`) — an `account_dtam` or `account_platform` caller matches **neither** `rawAllowed` nor `canonicalAllowed` on these three presets and gets 403, even though `canonical-rbac.js`'s own header (`canonical-rbac.js:47-50`) says *"New users should be provisioned as ACCOUNT_DTAM or ACCOUNT_PLATFORM"* and the migration script defaults existing `ACCOUNT` rows to `ACCOUNT_PLATFORM`.
- Live blast radius: `financeOnly` gates all of `apps/backend/routes/api/finance/quotes.js` (`quotes.js:30,64,133,179,207,335` — GET/POST quotes, PUT status, POST send). Grepping the entire web-app frontend (`app/`, `lib/`) for `/api/quotes` this session returned **zero** callers — this route is FE-dead (superseded by the correctly-scoped, per-side `apps/backend/routes/api/applications/quotations.js:14-21,55-60`, which explicitly grants `ACCOUNT_DTAM`→DTAM-only and `ACCOUNT_PLATFORM`→PLATFORM-only). So `finance/quotes.js` is simultaneously dead-from-the-FE **and** would 403 the modern accounting roles if ever called directly.
- Same stale-preset pattern also narrows `providerOnly`-gated routes below the pre-split `account` role's reach: `apps/backend/routes/api/applications/revision-deadline.js:18,193,620`, `apps/backend/routes/api/audit/post-audit.js:25,148`, `apps/backend/routes/api/audit/site-analyses.js:6,25` — a legacy bare-`account` user could reach these; `account_dtam`/`account_platform` (the canonical replacement) cannot. Business impact unclear (finance roles may not need these) — flagged for operator judgment, not asserted as active harm.
- Correct source of truth exists and is used elsewhere: `canonical-rbac.js:273-287` `ROLE_GROUPS.FINANCE`/`ACCOUNT_STAFF` both include `ACCOUNT_DTAM`+`ACCOUNT_PLATFORM`. The drift is that two authorization tables (`canonical-rbac.js` groups vs. `role-middleware.js` presets) coexist and only one was updated at the Tier-16 split.

### F4 [MEDIUM] Legacy/dead tool: `GET /api/audit` + `GET /api/audit/stats`

- `apps/backend/routes/api/audit/audit.js:23-25` — `const auditLogs = []` — an in-process array, comment: *"fallback for file-based logging."* `GET /` (line 279) and `GET /stats` (line 303) read **only** this array, not the Prisma `AuditLog` table.
- Gated `adminOnly` (`audit.js:272,279,303` → `role-middleware.js`, so `platform_admin` also reaches it per F2's Gate B).
- Mounted twice: `apps/backend/routes/api/index.js:285` (`/api/audit`) and again inside the consolidated `/api/audits` root at `index.js:280-281` (`auditsRouter` mounted before `require('./audit/audit')` at the same `/` — which one actually answers `GET /api/audits/` and `GET /api/audits/stats` depends on whether `auditsRouter` defines those exact paths; **not resolved this session** — PENDING).
- The real, Prisma-backed audit trail is `apps/backend/routes/api/admin/audit-log.js`, mounted at `apps/backend/routes/api/admin/index.js:18`. An admin/auditor hitting the legacy path gets a near-empty, single-process, restart-losing view while believing it is "the" audit log.

### F5 [MEDIUM] Doc-vs-code drift: who issues the certificate (S6)

- `docs/architecture/2026-05-04-canonical-workflow-status-dictionary.md:55` (`CERTIFIED | certificate issued | admin`), `:101` (system row: `APPROVED→CERTIFIED (when admin issues cert)`), `:331` (§10 table: `/api/certificates/* (admin issue)`). The doc self-declares at `:27`: *"This document is prescriptive. Anything that contradicts it is a bug."*
- Actual code has removed this path entirely: `apps/backend/services/workflow-transition-service.js:148-156` gives `APPROVED->CERTIFIED` to **AUDITOR**, not admin/system, with an explicit 2026-06-05 product-decision comment: *"the two-person... SoD gate... has been removed... NO second auditor and NO approver≠evaluator constraint (admin is not in the workflow)."* `ROLE_TRANSITIONS[SYSTEM]` (`workflow-transition-service.js:171-196`) has **no** `APPROVED->CERTIFIED` entry at all.
- `apps/backend/services/application-status-writer.js:967` auto-mints the certificate directly on the `AUDIT_PASSED` write. `apps/backend/routes/api/certificates/certificates.js:70,114,216,280,336` — **five GET routes, zero POST/issue route**. FE already caught up: no "issue certificate" action found in `apps/web-app/src/app/admin/certificates/client-view.tsx` (grepped for `issue|Issue|ออกใบรับรอง` — only `issuedDate` display field matched).
- Admin's actual S5/S6 authority today is force-override/recovery only: `apps/backend/routes/api/admin/applications.js:513` (`force-status`), `:561` (`revert-last-transition`), both `requireAdmin`-gated, matching the deliberate SoD hardening in `canonical-rbac.js:296-309` (**AUDIT-001**, 2026-06-24: *"ADMIN/SUPER_ADMIN REMOVED — admin is not in the audit decision path"*, `ROLE_GROUPS.AUDITORS` = auditor only, `ADMIN_AUDIT_OVERRIDE` reserved for force/recovery routes). The **code** is internally consistent; the separate architecture doc is stale and, by its own rule, is the filed bug.

### F6 [MEDIUM] No maker-checker across document-review AND on-site-audit-and-certify for one `auditor`

- `ROLE_TRANSITIONS[AUDITOR]` (`workflow-transition-service.js:140-157`) grants the **same** role both the S2 document-review edges (`ASSIGNED_FOR_REVIEW→DOC_APPROVED|REVISION_REQUESTED`, identical to `document_reviewer`'s grant at `:132-135`) **and** the entire S5/S6 chain through `APPROVED->CERTIFIED`. The team has explicitly ruled on removing the second-person check for the `AUDIT_PASSED→APPROVED` hop specifically (F5's cited comment). I found no equivalent ruling — in code or docs — for whether the *same* auditor-role individual assigned as document reviewer at S2 may also be the on-site auditor at S4/S5 for the *same* application, self-carrying it end-to-end with zero second person. Not asserted as a bug (the team is demonstrably SoD-aware elsewhere); flagged as an open question for the operator.

### F7 [LOW] `GET /api/audits/reassignable` over-broad read vs. narrowly-gated write

- `apps/backend/routes/api/audit/audits-reassign.js:45` — gated only `providerOnly` (any of admin/document_reviewer/auditor/scheduler/legacy-account — see F3 for who that actually excludes), exposing applicant names, plant type, current auditor, days-overdue to every provider role.
- The matching write, `POST /:id/reassign` (`audits-reassign.js:81-89`), correctly double-gates down to `REASSIGN_ROLES = [ADMIN, SCHEDULER]` inline (line 32,82-89) after the same broad `providerOnly` file-level check. The read was not narrowed to match. Whether `applicationService.listReassignableAudits()` (called with zero args, `audits-reassign.js:50`) is tenant-scoped only through the Prisma-extension backstop was not independently verified this session — **PENDING**.

---

## 3. Per-role capability summary (S0–S6)

Ground truth for **DO** = `ROLE_TRANSITIONS` (`workflow-transition-service.js:99-197`, cited per-role below). Ground truth for FE **SEE**/reachability = `provider-role-config.ts:65-227` (provider roles) and `application-listing-handlers.js` (health). **DATA** = the Prisma model + explicit scope found in the route/service.

### health (applicant)
- **DO**: `DRAFT→SUBMITTED` (S0), `PENDING_DOC_FEE→PHASE_1_SLIP_UNDER_REVIEW` (S1), `REVISION_REQUESTED→ASSIGNED_FOR_REVIEW` / `CAR_PENDING→CAR_REVIEWING` (S2/S5 resubmit), `PENDING_AUDIT_FEE→PHASE_2_SLIP_UNDER_REVIEW` (S3) — `workflow-transition-service.js:100-106`.
- **SEE/DATA**: every applicant query is scoped by `healthId: identity.healthId`, not just role — `apps/backend/routes/api/applications/application-listing-handlers.js:101-103,125-127,132-133` (`GET /my`, `/my/statuses`) both explicitly 403 if `req.user.healthId` is empty, closing the class of "provider token + Prisma `undefined`-filter = full dump" bug before it can happen. `GET /` (`application-listing-handlers.js:59-91`) has its own hardened provider-branch allow-list (`PROVIDER_LISTING_ROLES`, line 49-57) citing a previously-fixed CVE-class bug (X1-D §4 H-2, unfiltered `findMany` for a healthId-less caller) — verified fixed, not reproduced.
- **LEGACY SLIP** (fresh-verified this session): S1/S3 payment UI is slip-only by default. `apps/web-app/src/lib/config/checkout-mode.ts:42-44` `isCheckoutUiEnabled()` requires the exact string `'true'`; `apps/web-app/src/app/health/payments/client-view.tsx:298` renders the Stripe checkout entry only behind that flag, while `SlipUploadModal` (`client-view.tsx:25,710`) renders unconditionally. Backend default confirms: `apps/backend/.env.example:180` `STRIPE_CHECKOUT_ENABLED="false"` — *"the legacy slip surface keeps serving in-flight applications."* Both flags default off/absent → today, every `health` user sees the slip-upload path only. (Matches `reports/role-workflow-auditor/2026-08-06-farmer.md` L-090, independently re-verified here with fresh file reads.)

### document_reviewer
- **DO**: `ASSIGNED_FOR_REVIEW→DOC_APPROVED|REVISION_REQUESTED` only (S2) — `workflow-transition-service.js:132-135`. No payment-slip permission at all: `canonical-rbac.js:174-179` grants `APPLICATION_VIEW_ALL`, `APPLICATION_DOC_REVIEW`, `APPLICATION_WORKFLOW_TRANSITION`, `AUDIT_TIMELINE_READ` — no `PAYMENT_SLIP_*`. Correct least-privilege (confirmed, not just inherited from a prior report).
- **SEE**: `provider-role-config.ts:90-102` — own landing `/provider/reviewer`; `/provider/applications` shared with admin/auditor (`:87-89`); explicitly excluded from `/provider/audits` (`:150-153`, comment: "DR retains read access to audit timelines via per-application detail pages" only).
- **FIXED since 2026-08-06**: the prior report's F-03 ("assign-reviewer write bypasses the canonical status writer") no longer reproduces — `apps/backend/routes/api/provider/handlers/scheduler-assign-reviewer-handler.js:113-119` now calls `workflowTransitionService.buildTransitionUpdate` and adds an explicit tenant guard with a `platform_admin` exemption (`:74-84`).

### scheduler
- **DO**: `DOC_FEE_PAID→ASSIGNED_FOR_REVIEW` (S2 entry) and `AUDIT_FEE_PAID→AUDIT_CONFIRMED` (S4) — `workflow-transition-service.js:136-139`.
- **SEE/DATA**: `apps/backend/routes/api/audit/scheduling.js:57-68` (`GET /queue`) — deliberately narrow, well-scoped `platform_admin` cross-org carve-out: *"Only PLATFORM_ADMIN... may target another org; everyone else is pinned to their own org"* (comment cites a prior hardening, "#508 hardened only the write/assign path"). This is the pattern F2 should generalize to.
- **Over-broad read**: F7 above (`GET /api/audits/reassignable`).

### auditor
- **DO**: document-review edges (same as `document_reviewer`) **plus** `AUDIT_CONFIRMED→{AUDIT_PASSED,CAR_PENDING,REJECTED}`, `CAR_REVIEWING→{AUDIT_PASSED,CAR_PENDING}`, `AUDIT_PASSED→{APPROVED,CAR_REVIEWING}`, `APPROVED→CERTIFIED` — `workflow-transition-service.js:140-157`. See F5 (auto-issues cert), F6 (no maker-checker across S2+S4/S5/S6 for one person).
- **SEE/DATA**: on-site inspection endpoints correctly split read vs. write: file-level `AUDIT_STAFF` (admin/reviewer/auditor/scheduler can preview) at `apps/backend/routes/api/audit/onsite.js:65`, but every mutating route (`/start`,`/checklist`,`/photo`,`/gps-verify`,`/decision`) narrows to `requireRole(ROLE_GROUPS.AUDITORS)` — auditor-only — at `onsite.js:301,337,387,435,510`. Correct least-privilege.

### account_dtam / account_platform
- **DO**: identical transition set for both — `PHASE_1_SLIP_UNDER_REVIEW→{DOC_FEE_PAID,PENDING_DOC_FEE}`, `PHASE_2_SLIP_UNDER_REVIEW→{AUDIT_FEE_PAID,PENDING_AUDIT_FEE}` (S1/S3) — `workflow-transition-service.js:120-131`. Side-wall enforced one layer down, not at the transition gate.
- **DATA**: `resolveAllowedIssuerSides()` (`apps/backend/services/payment-slip-service.js:246-260`) — `ACCOUNT_DTAM→['DTAM']`, `ACCOUNT_PLATFORM→['PLATFORM']`, fail-closed (`[]` = deny) on any unrecognized role. Both `approveSlip`/`rejectSlip` re-check the side on every call (`payment-slip-service.js:1062-1080,1401-1414`, explicit `INVALID_REVIEWER_SIDE`/403 on mismatch or unclassifiable side — "fail CLOSED" per the code's own comment). Verified solid; no cross-side leak found.
- **SEE**: FE tab visibility mirrors the backend split exactly — `apps/web-app/src/app/provider/accounting/accounting-tabs.ts:20-41` hides platform-only tabs (WHT, purchase-invoices, manual-journal-entries, period-close, reports) from the DTAM lane via `dtam: false` + `visibleAccountingTabs()`; matches the backend route comments for those same sub-routers (`routes/api/index.js:177-179,188-190,196-197,226-229,236-237`). No mismatch found.
- **MISSING TOOL**: F3 — `financeOnly`/`providerOnly` (`role-middleware.js`) still 403 both split roles on `finance/quotes.js` and a handful of `providerOnly`-gated audit-support routes; live impact appears low (FE never calls the affected `quotes.js` route) but the gate is objectively stale.

### admin
- **DO**: transition bypass ("any allowed transition") but **not** listed in `ROLE_TRANSITIONS` at all — falls through to edge-legality-only (`workflow-transition-service.js:268-291` `canTransition`, admin has no entry so the role-gate branch is skipped). Real day-to-day authority is `/api/admin/applications` force/override/recovery (`admin/applications.js:175,513,561`) — confirmed **not** a normal S5/S6 decision-maker (AUDIT-001, F5).
- **Gate**: the one role `require-admin.js` (F2 Gate A) protects correctly and strictly — arguably *too* strictly, since it excludes `platform_admin` (F2).
- **Doc drift**: F5 — the architecture doc still describes admin as the certificate issuer; the code disagrees.

### platform_admin
- **DO/SEE**: F2 is this role's whole story — under-privileged on `/api/admin/*` + no FE surface beyond `/admin/organizations` (`provider-role-config.ts:74,83`; confirmed no `/platform-admin` FE directory exists), over-reaching via the `role-middleware.js` blanket bypass into `criteria`/`wizard admin`/`templates`/legacy `audit` that no FE page routes it to.
- **DATA**: `apps/backend/routes/api/platform-admin/organizations.js:8-14,89-92` — the one surface built *for* this role — correctly wraps every handler in `withoutTenantScope()` by explicit design (cross-tenant org CRUD is the point), gated `ROLE_GROUPS.PLATFORM_ADMIN_ONLY` (`canonical-rbac.js:257-259`, confirmed tenant-`admin` does NOT satisfy this group — verified by `apps/backend/__tests__/unit/platform-admin-rbac.test.js:128-130`, not executed this session).
- **Provisioning**: `apps/backend/scripts/grant-platform-admin.js:112-116` flips only `role`; does **not** null the user's pre-existing `organizationId`. A platform_admin promoted from an existing tenant admin therefore *keeps* that org bound for any route that doesn't explicitly `withoutTenantScope()` — meaning the cross-tenant reach via F2's Gate-B bypass is data-dependent on provisioning history, not guaranteed on every platform_admin account. **PENDING** — could not check actual account data this session.

---

## 4. Verified-safe / no-finding (checked and clean, listed for balance)

- Health ownership scoping (healthId-based, explicit 403 on missing claim) — §3 above.
- `account_dtam`/`account_platform` slip side-wall, fail-closed — §3 above.
- Onsite audit mutation routes narrowed to `AUDITORS` beyond the broader file-level `AUDIT_STAFF` read gate — §3 above.
- Scheduler queue's explicit, narrow `platform_admin` cross-org carve-out — §3 above.
- Accounting FE tab visibility vs. backend DTAM/PLATFORM route split — §3 above.
- `scheduler-assign-reviewer-handler.js` — previously-flagged canonical-writer bypass (2026-08-06 report F-03) confirmed fixed.
- `application-listing-handlers.js` `GET /` provider branch — previously-fixed unfiltered-dump class of bug (X1-D §4 H-2) confirmed still fixed.

---

## 5. Method / what I did not do

- No DB/staging access this session — all Prisma-extension and RLS claims are static-code reads, not runtime proof. Marked PENDING where load-bearing.
- Did not execute `tenant-isolation-cross-org-be.test.js`, `platform-admin-rbac.test.js`, or any other test file cited as evidence-of-awareness.
- Did not open the Prisma schema files directly to confirm `Criteria`/`DocumentTemplate` model names/tenancy independent of `tenant-prisma-extension.js`'s model list.
- Did not resolve the `/api/audits/` vs `/api/audit/` double-mount precedence (F4) at the Express-routing level (would need either a runtime request or a line-by-line diff of `auditsRouter`'s registered paths).
- Focused depth on backend route/middleware/service code and the FE provider-role-config/middleware layer; did not re-derive every FE component byte-for-byte for `document_reviewer`/`scheduler`/`auditor` (relied on `provider-role-config.ts` as the FE SSOT, which the codebase itself designed to prevent drift between nav/route/landing — see its own header comment, `provider-role-config.ts:1-28`).

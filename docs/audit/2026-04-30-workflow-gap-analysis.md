# GACP — System-Wide Workflow & Tenancy Gap Analysis

> **Historical research note (2026-04-30).** This document is an
> internal audit that uses Odoo (LGPL-3.0 open-source ERP) as a
> *reference pattern* to benchmark workflow / multi-tenancy / audit
> trail discipline. **GACP does not use Odoo as a dependency** —
> the references are research-only, kept as an audit trail. New
> contributors should read it as "things we considered" not
> "frameworks we adopted".

**Date**: 2026-04-30
**Method**: 4 parallel Plan-agent audits across Backend architecture, Frontend views, Data model, and Admin tooling. Cross-referenced with the canonical state machine (`apps/backend/services/workflow-transition-service.js`), all 15 Prisma schema files, and the ADR-016 work-queue rollout (PRs #77–#90, all live as of 2026-04-30).
**Scope**: Which workflow / tenancy patterns we've already adopted, what's still missing, and what's deliberately not worth chasing.
**Companion to**: `docs/adr/ADR-016-work-activity-tracking.md`, `docs/audit/2026-04-30-provider-role-page-alignment.md`, `docs/audit/2026-04-30-health-portal-audit.md`.

---

## 1. Where we already match Odoo

The 13-PR session that landed today (2026-04-30) closed several Odoo gaps that had been latent in the v3.x codebase:

| Odoo concept | GACP equivalent | Status |
|---|---|---|
| `mail.activity` (per-record work items with assignee, deadline, candidate group) | `WorkActivity` model + `work-activity-service` | ✅ Phase 1A |
| `res.groups` (multi-group user model) | `RoleGroup` + `UserGroupMembership` M2M | ✅ Phase 1C |
| `ir.cron` (scheduled actions framework) | `node-cron` jobs in `jobs/scheduler.js` | ✅ infrastructure exists; admin UI missing (gap #G5 below) |
| Workflow state machine | `services/workflow-transition-service.js` w/ legacy aliases + role permissions | ✅ explicit transition table |
| `ir.attachment` (polymorphic file model) | partially — `PaymentSlip` has the right shape, but ~25 other storage points don't | ❌ **GAP #G1** |
| `mail.template` (DB-backed templates) | `DocumentTemplate` for PDFs only; notification + email templates hard-coded | ❌ **GAP #G2** |
| Tracked fields | `application-status-writer` for `Application.status` only | ❌ **GAP #G3** |
| `ir.rule` (per-record permissions) | RLS observe-only on `tenant_id`; no fine-grained rules | ❌ **GAP #G4** |
| Multi-company / multi-currency | ADR-014 Phase 1-3 (tenant-scoped on 50+ tables) | ✅ |
| Audit log (hash-chain) | `AuditLog` model + `auditLogger.js` (ADR-012) | ✅ data; UI missing (gap #G6) |
| Per-user notification preferences | `User.notificationSettings` JSON, default-allow | ✅ Phase 7 |
| Form view with related-records | `/provider/applications/[id]` "งาน" tab embeds activities | ✅ Phase 2 |
| Status bar (visual progression) | 8-step `MiniStepper` on HEALTH detail page | ✅ |
| Search/filter URL params | `/provider/work?workType=&state=&group=` + filter chips | ✅ Phase 5 |
| CSV export | `/provider/analytics/work` CSV (UTF-8 BOM) | ✅ Phase 5 |
| `ir.config_parameter` (key/value config) | `SystemConfig` table | ✅ schema; allowlist needs generalising (gap #G11) |

**Net assessment**: GACP has matched Odoo on **state machine**, **work activities**, **multi-group users**, **multi-tenancy**, **audit logging**, **notification preferences**, and **basic search/CSV**. The remaining gaps fall into three buckets: data-model hygiene, frontend view depth, and admin tooling.

---

## 2. Top gaps — ranked by impact ÷ effort

| # | Gap | Domain | Effort | Value | Why this rank |
|--:|---|---|:---:|:---:|---|
| **G1** | **Polymorphic `Attachment` model** | data-model | L | **HIGH** | ~25 file-pointer fields scattered across 15 models (`Application.attachments` JSON, `PaymentSlip.fileUrl`, `AuditChecklist.sections.evidence`, `Certificate.pdfUrl`, etc.). PDPA delete-by-user is impossible in one query. No virus-scan pipeline. The `PaymentSlip` schema is the proof this scales. |
| **G2** | **DB-backed notification + email templates** | backend / admin | M | **HIGH** | `NotifyTemplates` is a ~50-entry hard-coded JS object; `email-templates/*.html` referenced but the directory doesn't exist (silent fallback to `getDefaultTemplate()`). Stakeholder copy edits need a deploy. `DocumentTemplate` is already the right shape — extend with a `kind` field. |
| **G3** | **Generalised tracked-field writer** | backend / data-model | M | **HIGH** | `application-status-writer.js` proves the pattern. `auditorProviderId`, `phase1Status`, `phase2Status`, `WorkActivity.assignedUserId`, `Certificate.revokedAt` all change without going through a canonical writer. Auditor reassignment is silently logged across 3 different files. |
| **G4** | **Per-record visibility (`ir.rule`-lite)** | backend security | M | MED-HIGH | Auditor today can `GET /api/provider/applications/:id` for any application in their tenant — the frontend hides these from list views, but the API is open. Gap closes via a `applicationsVisibleTo(user)` Prisma `where` fragment, applied through `BaseRepository.findMany`. |
| **G5** | **Audit Log viewer UI** | admin | S-M | **HIGH** | Hash-chained `AuditLog` table is fully populated; Phase 1D writes admin actions; **no UI**. PDPA + Thai gov audit "show me every config change in the last 30 days" answer is currently "I'll write you a SQL query." All data exists. |
| **G6** | **User detail improvements** | admin | S | **HIGH** | `lastLoginAt` / `isLocked` / `twoFactorEnabled` already in schema — UI shows none of them. Admin can't see when an auditor last logged in or unlock a locked account without DB access. |
| **G7** | **Chatter sidebar on application form** | frontend | M | MED-HIGH | Today coordination messages get squeezed into transition `comment` fields. There's no place to ask "is this lab result OK?" without forcing a state change. Highest BPMN-ergonomics gap. |
| **G8** | **Bulk actions on work queue** | frontend | S-M | MED-HIGH | Coordinators routinely re-assign 12 SLIP_REVIEWs from a sick teammate. Today: 12 clicks. With selection + bulk panel: 2 clicks. List page already structured, just needs a checkbox column + bulk endpoint. |
| **G9** | **`NumberSequence` model** | data-model | M | MED-HIGH | Three concrete bugs: BE vs CE year inconsistency between draft + webhook generators, multi-tenant collision (uses non-tenant-scoped count), random-number generator in webhook. Plus admins can't change formats without a deploy. |
| **G10** | **Calendar grid for `/provider/calendar`** | frontend | L (M for month-only) | MED-HIGH | Auditor double-booking is a real risk; current list view hides it. FullCalendar `resourceTimeline` plugin gives auditor-as-row capacity view + drag-to-reschedule using existing API. |
| **G11** | **Soft-delete consistency + auto-filter** | data-model | S-M | MED | `isDeleted` exists on most tables but is missing on `ApplicationDraft`, `Subscription`, `AuditChecklist`, `MeetingRoom`, `ConsumerFeedback`. No auto-filter — every query manually adds `where: { isDeleted: false }` and a missed one returns tombstones. Tenant Prisma extension is the natural place to add it. |
| **G12** | **Cron / Scheduled-Actions viewer** | admin / ops | M | MED | 8 hardcoded crons in `scheduler.js`. Ops can't answer "did the slip-SLA check fire today?" without SSH-grep. Light: introspection-based read-only viewer + per-job last-run badge + run-now button. |
| **G13** | **Saved filters per user** | frontend | S | MED | "All applications I'm reviewing this week" is the same query every Monday. URL params (Phase 5) are sharable but not pinned per-user. Single thin table + a "Save current filter" chip. |
| **G14** | **Organization branding/settings editor** | admin | M | HIGH at tenant #2 | `Organization` table has `settings JSON` field but no admin UI. First non-DTAM certifier onboarding will hard-block on "where do I upload their cert seal?" Pure UI work; schema exists. |
| **G15** | **Auditor/reviewer FK cleanup** | data-model | S | MED | `Application.{reviewer,headAuditor,scheduler,auditor}ProviderId` are `String?` with no FK; `ScopeOfWork.assignedAuditor`, `AuditChecklist.auditorName`, `MeetingRoom.hostName` are denormalised strings that go stale. Convert to proper `User.id` FKs + drop denorm columns. |
| **G16** | **Kanban view for `/provider/work`** | frontend | M | MED | WorkActivity has 4 states (TODO/CLAIMED/IN_PROGRESS/DONE) — perfect kanban shape. Drag = call existing claim/done API. `@dnd-kit/core` is small. Beneficiary: provider only, but it's the highest-volume daily UI. |
| **G17** | **`RecordFollower` (opt-in subscriptions)** | data-model | S | MED-LOW | Senior reviewer wants to monitor a high-stakes app without being assigned. Today notifications are role-broadcast only. Single small table. |
| **G18** | **Notification template manager UI** | admin | M | HIGH | Counterpart to G2 — once templates are DB-backed, ops needs a CRUD page with placeholder palette + preview. Department leadership signs off on official wording multiple times a year. |
| **G19** | **`/admin/*` vs `/provider/settings/*` consolidation** | frontend / admin | S | MED | Two parallel admin shells exist; `/admin/users` redirects to `/provider/management`; ops staff don't know which to use. Cosmetic but compounds with each new admin page. |
| **G20** | **Graph view + sparklines on KPI dashboard** | frontend | M | MED | Today: 4 cards + 3 tables, no charts. "Daily completed work over 30 days" is a sparkline question. Recharts (~50KB) covers the pattern. |

---

## 3. What we deliberately should NOT chase

These are Odoo concepts that don't carry over to a Thai gov-cert-portal:

| Pattern | Why skip |
|---|---|
| `ir.actions.server` + `base.automation` (no-code event→action UI) | The admin user base is Ministry officers, not developers. Letting them write filter expressions on a regulatory state machine is a footgun. `StageActivityConfig` (Phase 1D) covers the highest-value no-code case. |
| Workflow as DB rows | State edges encode DTAM regulatory law — they're verified by integration tests. Moving them to mutable DB rows undermines auditability. Phase 1D got the abstraction line right (configs in DB, transitions in code). |
| Multi-language `Translation` table | Thai is the only target locale; English is fallback for international auditors. Defer until first non-Thai certification standard onboards. |
| External IDs (xmlid) | Natural codes (`PlantSpecies.code`, `RoleGroup.code`, etc.) already cover the high-value cases. The missing pieces (`DocumentTemplate.code` doesn't exist as `@unique` yet) are a one-off, not a system pattern. |
| Generic computed-fields engine (`@api.depends`) | Hot paths are small. Targeted fixes (a `dueBucket` column refreshed by SLA cron, an LRU cache on `feeService`) win without the framework. |
| Full Partner unification | Suppliers, billing contacts, vendors are write-once, read-rarely-on-display. Not an ERP. Narrow scope (auditor FKs only) covered in G15. |
| Double-entry accounting | Single-entry billing is right-sized for ~32k THB cert workflows. Add a `PaymentApplication` table if/when Subscription refunds force the issue — not now. |
| Product / Pricelist | DTAM-regulated fees aren't negotiable per-tenant. Subscription has 4 SKUs hard-coded. Over-engineering. |
| Backup/Restore admin UI | PDPA exfil risk — keep `pg_dump` outside the app, run by ops. |
| Customer Portal field-visibility config | Visibility ties to PDPA + Thai gov disclosure rules — regulatory, not tenant-configurable. |
| Studio-style report designer | Cert PDF is a legal artifact; redesigning by ops is a feature only on Odoo's enterprise plan. |
| Module installation UI | N/A for monolithic deploy. |
| Schema introspection | Pays off at 50+ form types; we have ~7. |
| Translations admin UI | Same as multi-language `Translation` table — defer. |
| Inline cell edit on lists | Status-machine records validate transitions; navigating to detail is the right UX. |
| Onboarding wizard for new tenants | Manual 2-step provisioning already works; tenants arrive a few times a year. Defer until tenant #5. |

---

## 4. Recommended phases (Phase 15+)

Group the 20 gaps into **4 implementation waves** with coherent value bundles. Each wave is ~2-4 PRs.

### Wave A — "Hygiene & Security" (highest priority)

Closes G1, G3, G4, G11, G15. ~2-3 weeks of focused work, 5-7 PRs.

| PR | Gap | Scope |
|---|---|---|
| Phase 15 | G3 generalised tracked-field writer | Generalise `application-status-writer` into `trackedWriter({ table, trackedFields, emitAudit })`. Migrate `auditorProviderId`, `phase1Status`/`phase2Status`, `WorkActivity.assignedUserId`. ESLint rule per tracked field. |
| Phase 16 | G4 per-record visibility | `applicationsVisibleTo(user)` Prisma `where` fragment + apply via `BaseRepository.findMany`. Auditor sees only `WHERE auditorProviderId = me OR sameReviewerAuditor`. |
| Phase 17 | G11 soft-delete cleanup | Add missing columns to `ApplicationDraft`, `Subscription`, `AuditChecklist`, `MeetingRoom`, `ConsumerFeedback`. Extend `tenant-prisma-extension.js` with auto-filter `isDeleted=false` (with `includeDeleted: true` opt-out for recycle-bin views). |
| Phase 18 | G15 auditor FK cleanup | Convert `String?` provider-id columns on `Application` / `ScopeOfWork` / `AuditChecklist` / `MeetingRoom` to FKs. Drop denorm `auditorName` / `hostName` columns. Migration handles existing rows. |
| Phase 19 | G1 polymorphic `Attachment` model | New `Attachment` table with `(resModel, resId, field, fileUrl, ...)`. Per-resource backfill (slip-flow first as proof — already structured). 5-10 commits over 2 weeks. |

**Wave A delivers**: PDPA compliance posture (single delete-by-user query path), audit completeness (every consequential field tracked), security hardening (no horizontal escalation in API), data integrity (no stale denorm names).

### Wave B — "Operator productivity" (high frequency, daily wins)

Closes G2, G5, G6, G18, G7. ~2 weeks, 4-5 PRs.

| PR | Gap | Scope |
|---|---|---|
| Phase 20 | G5 audit log viewer | Single read-only paginated table at `/provider/admin/audit-log` with 4 filters (actor / category / date / severity) + CSV export. Zero new schema. |
| Phase 21 | G6 user detail improvements | Show `lastLoginAt`, lock badge, 2FA badge in user list. Detail page tabs (Profile / Login History / Permissions / Sessions). 3 new admin actions: force-reset, unlock, disable-2FA — all audit-logged. |
| Phase 22 | G2+G18 DB-backed notification templates + admin UI | Extend `DocumentTemplate` with `kind` enum (`NOTIFICATION_INAPP`/`EMAIL`/`SMS`/`PDF`). Migrate `NotifyTemplates` JSON. Admin UI at `/provider/admin/notification-templates` with placeholder palette + preview. |
| Phase 23 | G7 chatter sidebar | New `application_messages` collection + right-column thread on `/provider/applications/[id]` and `/health/applications/[id]`. `internalOnly` flag separates staff-only from applicant-visible. Followers extend notification dispatch. |

**Wave B delivers**: Compliance evidence (audit log discoverable), security posture (visible 2FA + lock state), stakeholder agility (Department signoff on copy without a PR), workflow ergonomics (free-form discussion without forcing a state change).

### Wave C — "Workflow UX" (visual + bulk)

Closes G8, G16, G10, G13, G20. ~2-3 weeks, 5 PRs.

| PR | Gap | Scope |
|---|---|---|
| Phase 24 | G8 bulk actions | Checkbox column on `/provider/work` list rows. Floating bulk action bar: claim / unclaim / reassign. New `POST /api/provider/work/bulk { ids, action, payload }` returning per-id success/failure (atomic NOT required). |
| Phase 25 | G16 kanban view | `?view=kanban` toggle on `/provider/work`. `@dnd-kit/core`. 4 columns (TODO/CLAIMED/IN_PROGRESS/DONE). Drag = call existing claim/done API. Honors URL filters. |
| Phase 26 | G13 saved filters | Tiny `user_saved_filters { userId, scope, name, urlParams }` table. "Save current filter" button in chip bar; pinned filters render as additional chips above. |
| Phase 27 | G10 calendar grid | FullCalendar v6 + `resourceTimeline` for `/provider/calendar`. Auditor-as-row capacity view. Drag-to-reschedule calls existing `POST /scheduler/audit-schedules/:id`. Conflict detection client-side. |
| Phase 28 | G20 graph view | Recharts (~50KB). Add "completed/day" sparkline to KPI cards. Add "lead-time histogram" (claim → done) per workType. |

**Wave C delivers**: Coordinator productivity (12 clicks → 2 for bulk reassign), visual workflow management, no-double-book auditor scheduling, persistent personal queries, trend interpretation.

### Wave D — "Ops & multi-tenant readiness" (lower priority)

Closes G9, G12, G14, G17, G19. ~2 weeks, 5 PRs.

| PR | Gap | Scope |
|---|---|---|
| Phase 29 | G9 `NumberSequence` model | New table with format string + `nextNumber` + `resetPeriod`. Atomic UPDATE...RETURNING for race-free generation. Migrate the 8 generator call sites. Fixes BE/CE inconsistency + multi-tenant collision. |
| Phase 30 | G12 cron viewer | Light `JobRun` table — `(jobName, startedAt, finishedAt, success, output)` written by JobScheduler. Read-only viewer at `/provider/admin/scheduled-actions` with run-now button. |
| Phase 31 | G17 `RecordFollower` | Single table + extend notification dispatcher to read followers in addition to role-broadcast. "Follow this application" button on detail pages. |
| Phase 32 | G14 org branding/settings editor | Detail page at `/admin/organizations/[id]` with branding tab (logo, colors, cert seal). Files go through new `Attachment` model from Wave A. Member list links to `/provider/management/users/[id]`. |
| Phase 33 | G19 admin shell consolidation | Fold `/admin/*` items into `/provider/settings/*` left-nav (gated by `CANONICAL_ROLES.ADMIN`). Single coherent settings hub matching Odoo's "everything in Settings" pattern. |

**Wave D delivers**: Ready for tenant #2 onboarding (branding works), ops debuggability (cron status visible), follow-this-record UX, generator correctness (no more random invoice number collisions).

---

## 5. Per-domain summary

### Backend (architecture + workflow patterns)

- **Done well**: `mail.activity` (WorkActivity), multi-group users, audit log hash-chain, soft-delete (mostly), workflow state machine.
- **Gaps**: tracked-field writer generalisation (G3), per-record visibility (G4), DB-backed templates (G2), polymorphic attachments (G1).
- **Skip**: `ir.actions.server`, full mixin pattern, generic computed fields, workflow-as-data.

### Frontend (views + UX)

- **Done well**: List view (with filter chips, Phase 5), form view with related-records tab (Phase 2), HEALTH activity timeline (Phase 6), CSV export (Phase 5).
- **Gaps**: chatter (G7), bulk actions (G8), saved filters (G13), kanban (G16), calendar grid (G10), graphs (G20).
- **Skip**: pivot view (static dimensions cover bottleneck-finding), Gantt, search-query parser, inline cell edit, status-bar admin override.

### Data model (schemas + audit + tenancy)

- **Done well**: Multi-tenancy (ADR-014), audit log (ADR-012), work activities (ADR-016), multi-group users.
- **Gaps**: polymorphic `Attachment` (G1), `NumberSequence` (G9), tracked fields (G3), soft-delete consistency (G11), auditor FK cleanup (G15), `RecordFollower` (G17).
- **Skip**: full Partner unification, double-entry accounting, Product/Pricelist, multi-language Translation table, external IDs, generic computed-fields engine, workflow-as-data, schema introspection.

### Admin tooling

- **Done well**: Work-config CRUD (Phase 1D), bulk import/export (Phase 2), user-group memberships UI (Phase 1C), notification preferences (Phase 7), platform organization CRUD (existing).
- **Gaps**: audit log viewer (G5), user detail (G6), notification template manager (G18 paired with G2), org branding editor (G14), cron viewer (G12), shell consolidation (G19).
- **Skip**: automated-actions UI, translations admin, backup/restore UI, portal-visibility config, module installation, Studio.

---

## 6. Estimate summary

| Wave | Gaps closed | Total effort | PR count | Bundle value |
|---|---|---|---|---|
| **A** Hygiene & Security | G1, G3, G4, G11, G15 | ~3 weeks | 5 PRs | PDPA + audit + security + integrity |
| **B** Operator productivity | G2, G5, G6, G7, G18 | ~2 weeks | 4-5 PRs | Compliance evidence + visible 2FA + chatter + copy agility |
| **C** Workflow UX | G8, G10, G13, G16, G20 | ~3 weeks | 5 PRs | Daily coordinator wins + visual mgmt + scheduling |
| **D** Multi-tenant readiness | G9, G12, G14, G17, G19 | ~2 weeks | 5 PRs | Tenant #2 ready + ops debuggability |

**Total addressable scope**: ~10 weeks of focused engineering across 4 waves. Each wave is internally coherent and can ship independently. Wave A is on the critical path for compliance (PDPA + Thai gov audit); waves B-D are productivity gains.

---

## 7. Conditions for triggering this analysis again

Re-run the gap analysis when any of:

1. **Tenant #2 onboards** — non-DTAM certifier joins. Wave D becomes critical; G14 (branding) is the immediate blocker.
2. **First Subscription refund hits production** — single-entry billing breaks down. Add `PaymentApplication` table (deferred from this audit).
3. **PDPA delete-by-user request fired in production** — current state: 15-table walk. After Wave A (G1 attachment): single query. If this happens before Wave A ships, G1 becomes immediate.
4. **Audit % breach > 10% sustained for 30 days** — SLA targetHours wrong for real workload (already adjustable via Phase 1D admin UI).
5. **First non-Thai certification standard onboards** — Translation table (deferred) becomes valuable.

---

## 8. What this audit deliberately doesn't cover

- **Performance/scale** — no load testing; recommendations assume current N (~30 in-flight applications, ~28 staff users, single tenant).
- **Mobile app** — shelved per ADR-015.
- **Test coverage gaps** — separate audit; the current rollout has unit + integration tests for new code but not full coverage analysis.
- **DevOps / CI / deployment topology** — recommendations stay code-level; infrastructure is operator-controlled.
- **Master audit plan items (T-001, T-005, EPIC-01/02/06)** — gated on contract sign-offs, not in scope for engineering-driven analysis.

---

**Bottom line**: GACP has done the hard architectural work (state machine, work activities, multi-tenancy, audit log, multi-group users). The remaining gaps are concrete and well-scoped. **Wave A (Hygiene & Security) is the highest priority** — closes PDPA + audit + security gaps that compound with each new tenant or regulatory review. The other 3 waves deliver productivity wins on top of a hardened base.

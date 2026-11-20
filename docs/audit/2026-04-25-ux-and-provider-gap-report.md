# UX/UI & Provider Dashboard Gap Report

> **Historical research note (2026-04-25).** This audit benchmarks
> GACP's UX polish against mature business-system reference platforms
> (Odoo open-source ERP cited as a reference pattern). **GACP does
> not use Odoo as a dependency** — references are research-only,
> kept as audit trail. New contributors should read this as
> "polish gaps we identified" not "frameworks we adopted".

Date: 2026-04-25
Scope: Health portal + Provider portal
Goal: bring the platform closer to mature business-system polish (Odoo cited as reference)

---

## 1. Layout architecture — current state

There are **three** competing layout patterns living in the codebase:

| # | File | Status |
|---|---|---|
| ✅ | `apps/web-app/src/components/layout/dashboard-layout.tsx` | **Canonical.** Used by `app/health/layout.tsx` and `app/provider/components/provider-layout.tsx`. |
| ❌ | `apps/web-app/src/components/ui/sidebar.tsx` | **Dead code.** No imports across `apps/web-app/src` (verified via grep). Leftover from earlier iterations. |
| ❌ | `apps/web-app/src/components/ui/mobile-header.tsx` | **Dead code.** Same situation. |
| ✅ | `apps/web-app/src/app/provider/coordinator/coordinator-context-panel.tsx` | Reviewed 2026-04-30 — not a parallel navigation sidebar; standard right-rail content panel (urgent items + KPI + auditor workload). Renamed from `coordinator-sidebar.tsx` so the audience name doesn't keep tripping over the misnomer. Top-nav stays in canonical `DashboardLayout`. |

### Action 1.1 — delete dead code
Removing the unused `sidebar.tsx` / `mobile-header.tsx` will cut ~400 lines of code, two places to maintain a "Pro tier" check (currently still hard-coded `accountTier === 'PRO'` there even though we now have entitlements), and removes the risk of someone importing them and double-rendering nav.

### Action 1.2 — fold coordinator sidebar into layout (RESOLVED 2026-04-30)
Re-reviewed: the file in question (`coordinator-sidebar.tsx`) is not actually a parallel navigation sidebar. It's a right-rail content panel (urgent monitoring + KPI tiles + auditor workload bars) rendered alongside the queue table in a `lg:grid-cols-3` layout where the queue takes 2 columns and the panel takes 1. Top-level navigation has always lived in `DashboardLayout` via `ProviderLayout`. The audit's "two navigation systems" framing was inaccurate — there's only one nav, and a normal supplementary content rail.

Renamed to `coordinator-context-panel.tsx` to remove the "sidebar" misnomer, added a header comment clarifying intent, and updated `client-view.tsx` import. No layout structure change needed.

---

## 2. Orphan pages — pages without nav entry

The canonical nav has only **6 items each side** (intentionally simplified per `docs/architecture/navigation-simplification-plan.md`), but the codebase contains many more pages. They're reachable by direct URL only.

### Health portal — orphan pages
50 page.tsx files exist; nav exposes 6. Orphans worth surfacing:

| Page | Recommendation |
|---|---|
| `/health/establishments` | Merge under "การปลูก" or expose at "โปรไฟล์ → สถานประกอบการ" |
| `/health/documents` | Expose at "เอกสาร" tab inside applications detail (already partially done) |
| `/health/export-documents`, `/health/official-documents` | Either merge into "ใบรับรอง" detail or hide if not yet implemented |
| `/health/reports` | Premium-gated tab inside dashboard |
| `/health/resources`, `/health/sop-templates`, `/health/sop-builder` | Add a "ทรัพยากร / SOP" nav item, OR expose from dashboard quick actions |
| `/health/site-analysis` | Expose under planting cycle detail |
| `/health/training` | Profile sub-tab |
| `/health/tracking/*` | Tracking is now under planting cycle — pages here should redirect (some already do) |
| `/health/start`, `/health/start/readiness` | Onboarding flow — should be a one-time wizard from dashboard |

### Provider portal — orphan pages (the bigger problem)
25 page.tsx files; nav exposes 6. **19 orphan pages** = mostly the cause of "provider dashboard ยังไม่เสร็จ":

| Page | Status | Recommendation |
|---|---|---|
| `/provider/analytics` | Built | **Add to nav** under "รายงาน" |
| `/provider/calendar` | Built | **Add to nav** for scheduler/auditor roles |
| `/provider/coordinator` | Auto-routed for scheduler | OK, but rename and expose for admin too |
| `/provider/criteria` | Built | Admin-only sub-nav |
| `/provider/documents` | Built | Admin sub-nav (templates) |
| `/provider/management` | Built | Admin sub-nav (user management) |
| `/provider/planting` | Built | **Add to nav** as "การปลูก / Trace" |
| `/provider/profile` | Built | Header dropdown (already there) |
| `/provider/receipts` | Built | Folded under "การเงิน" |
| `/provider/reports` | Built | Folded under "รายงาน" |
| `/provider/scheduler/reassign` | Built | Sub-page of audits |
| `/provider/dashboard/admin` | Built | Auto-routed for admin |

### Action 2.1 — restructure provider nav
Two-tier nav: top-level (6 items) stays simple; add sub-nav inside each section. Concrete top-level for provider:

```
แดชบอร์ด → /provider/dashboard
คำขอ → /provider/applications
ตรวจประเมิน → /provider/audits
ปฏิทิน → /provider/calendar     ← NEW
รายงาน → /provider/analytics    ← NEW (sub-tabs: analytics, reports, receipts)
การเงิน → /provider/accounting
ใบรับรอง → /provider/certificates
ตั้งค่า → /provider/settings/system  (admin → management/criteria/documents as sub-tabs)
```

8 top-level instead of 6 — still ERP-grade, but exposes everything that's actually built.

---

## 3. Application wizard — UI inconsistency

The wizard renders 12 step components from `app/health/applications/new-legacy/steps/`. Sizes are wildly uneven:

| Step | Lines | Status |
|---|---|---|
| consent | 124 | Production-ready |
| plant_selection | 436 + 466 (config panels) | Heavy but consistent |
| **purpose** | **25** | **Stub — auto-redirects to step 4.** Step 3 was removed but the file remains as a redirect placeholder |
| general | 304 + 488 (sections) | Production-ready |
| farm_info | 490 + 345 + 231 (3 files) | Heavy, partially OK |
| production_info | 291 + 238 + 185 + 209 | Production-ready |
| quality_control | 363 | Production-ready |
| documents | 392 + 493 (config) | Production-ready |
| review | 403 | Production-ready |
| quote | 187 | Production-ready |
| invoice | 275 | Production-ready |
| success | 232 | Production-ready |

### Action 3.1 — kill the redirect stub
`purpose-step.tsx` is a 25-line `useEffect(() => router.replace('/step/4'))` redirect. This causes the brief flash users see between step 2 and step 4 — they perceive it as the wizard "glitching". Remove the step from `ALL_STEPS` so we never navigate to it in the first place.

### Action 3.2 — wizard chrome consistency
`application-step-page.tsx` uses three different visual elements (numbered avatar, tip banner, content card). Several legacy steps render their own `<h2>` and toolbar — duplicating the chrome. Audit each step for stray top-level headings/tool bars and remove (chrome is the page's job, not the step's).

### Action 3.3 — `new` vs `new-legacy` directories
`/health/applications/new/page.tsx` is a 12-line file that just `redirect('/step/1')`. The actual step components live under `new-legacy/steps/` but are imported by the `new/step/[id]/page.tsx`. This dual-naming is confusing — every new contributor gets lost.

Recommendation: rename `new-legacy/` → `new/_steps/` (Next.js underscore-prefixed → not routed) and delete the bare `new/page.tsx` redirect. One source of truth, no "legacy" naming.

---

## 4. Provider dashboard — complete vs incomplete inventory

Looking at `app/provider/**`:

| Feature | Built? | Polish? |
|---|---|---|
| Officer Dashboard (queue + KPI) | ✅ | ⚠️ KPI calc has fallback paths — looks fine but coverage TBD |
| Application list/detail | ✅ | ✅ |
| Review decision modal | ✅ | ✅ |
| Audit list/detail | ✅ | ⚠️ |
| Audit decision modal + online audit | ✅ | ⚠️ |
| Calendar/scheduling | ✅ | ⚠️ Not in nav |
| Coordinator (scheduler dashboard) | ✅ | ⚠️ Custom sidebar |
| Accounting | ✅ | ⚠️ Not finance-grade — flat list |
| Receipts | ✅ | ⚠️ Orphan |
| Reports / Analytics | ✅ | ⚠️ Orphan |
| Certificates | ✅ | ✅ |
| Criteria (admin) | ✅ | ⚠️ Admin only |
| Documents/templates (admin) | ✅ | ⚠️ Admin only |
| Management (users, admin) | ✅ | ⚠️ Admin only |
| Planting / cycles trace | ✅ | ⚠️ Orphan |
| Settings / system | ✅ | ✅ |
| Profile | ✅ | ✅ |
| Scheduler reassign | ✅ | ⚠️ |
| Print application | ✅ | ✅ |
| **Audit checklist designer** | ❌ | needed for ERP-grade audit |
| **Workflow visualizer** | ❌ | needed |
| **SLA dashboard** | ❌ | metric exists but no drill-down |
| **Notification center** | ⚠️ partial | Bell icon present, no inbox page |
| **Activity feed (mail.thread)** | ❌ | needed |
| **Custom report builder** | ❌ | needed (Odoo Studio equivalent) |
| **Import/export workflows (data tools)** | ❌ | needed |
| **Audit log viewer (provider-side)** | ❌ | needed |

So the perception "provider dashboard ยังไม่เสร็จเยอะ" comes from:
1. Many built pages aren't in nav → look missing.
2. ERP-grade features (workflow visual, custom reports, mail thread, data tools) genuinely don't exist.

---

## 5. Concrete next-session backlog (in priority order)

### Quick wins (each < 1 day)
1. **Delete dead code** — `components/ui/sidebar.tsx`, `components/ui/mobile-header.tsx`. One commit.
2. **Restructure provider nav** to 8 top-level items per Action 2.1. One commit.
3. **Kill `purpose-step.tsx` redirect** + remove from `ALL_STEPS`. One commit.
4. **Rename `new-legacy/` → `new/_steps/`** + delete `new/page.tsx` redirect. One commit.
5. **Add explicit "Subscription" nav item under profile dropdown** for both portals.

### Medium (each ~1-3 days)
6. **Provider sub-nav** — when a top-level item is selected, show contextual sub-items in a secondary bar (Odoo-style "menu/breadcrumb").
7. **Notification inbox page** — convert the bell into a real inbox at `/notifications` with mark-as-read, filtering.
8. **Activity feed component** (mail.thread analogue) — attach to applications, audits, cycles. Comments + state changes + audit log all in one timeline.
9. **SLA drill-down** — clicking the "SLA risk" KPI on dashboard navigates to a filtered list view.
10. **Health onboarding wizard cleanup** — `/health/start` → unify with `/health/applications/new/step/1` so users have one path.

### Strategic (multi-week)
11. **Workflow engine v0** (planned in roadmap) — declarative state machine table. Removes hard-coded transitions in controllers.
12. **Record-level ACL `policy/` layer** (planned) — replaces ad-hoc filter-by-userId with `can(user, action, record)` everywhere.
13. **Audit checklist designer** (provider) — visual builder, criteria templates per plant species.
14. **Custom report builder** (Studio analogue) — drag-and-drop column picker, saved views.
15. **Subscription billing integration** — wire up Omise/Stripe checkout, webhook handling, dunning.

---

## 6. Quality gauge — Odoo / Oracle comparison

| Dimension | Target (Odoo) | Current | Gap |
|---|---|---|---|
| Nav clarity | 1-click to any built feature | ~30% of pages reachable from nav | High |
| Form/list/kanban/gantt views | All four common | List + form only | Medium |
| Workflow visualizer | Yes (per model) | None | High |
| Activity feed (mail.thread) | Universal | None | High |
| Per-record ACL | Yes (record rules) | Role-based only | Medium |
| Custom views / Studio | Yes | None | High (strategic) |
| Mobile responsive | Yes | Yes (Capacitor app) | Low |
| Accessibility (WCAG AA) | Partial | Partial | Medium |
| Localization pipeline | gettext per module | i18next, partial | Low |
| Print/report templates | Yes (QWeb) | Partial (HTML only) | Medium |

**Verdict:** UX is at "polished MVP" — ahead of typical CRUD admin templates, behind Odoo by ~60% of feature parity. Closing items 1–10 would put us at ~80%; items 11–15 are the real "enterprise leap".

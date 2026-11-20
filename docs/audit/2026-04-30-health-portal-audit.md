# HEALTH Portal — Page Audit

**Date**: 2026-04-30
**Scope**: Every page under `apps/web-app/src/app/health/`, cross-referenced with `healthNavigation` (6 items), the active `DashboardLayout` mobile/desktop nav, `/api/applications/*` routes, and the canonical 19-state workflow in `apps/backend/services/workflow-transition-service.js`.
**Companion to**: `docs/audit/2026-04-30-provider-role-page-alignment.md`
**Method**: Read-only sweep of every `client-view.tsx` and `page.tsx` in the tree.

---

## 1. Page inventory matrix

`healthNavigation` (`apps/web-app/src/lib/constants.ts:42-49`) defines exactly 6 nav items: `dashboard`, `applications`, `payments`, `certificates`, `planting`, `profile`. The active layout (`apps/web-app/src/components/layout/dashboard-layout.tsx`) renders all six on desktop and the same six (minus `payments`) on the mobile bottom-tab bar (`HEALTH_MOBILE_KEYS`).

| Route | File | Purpose | Status |
|---|---|---|---|
| `/health` | `page.tsx` | Redirect → `/health/dashboard` | alive |
| `/health/dashboard` | `dashboard/client-view.tsx` | Main hub: stats + action panel + recent apps | alive (but see §2.4) |
| `/health/applications` | `applications/client-view.tsx` | List w/ filter & 8-step mini-stepper | alive |
| `/health/applications/new` | `applications/new/...` (wizard) | 9-step wizard via `_steps/layout.tsx` | alive |
| `/health/applications/new/step/[id]` | `step/[id]/page.tsx` | Dynamic wizard step renderer | alive |
| `/health/applications/new/step/3` | `step/3/page.tsx` | Static redirect → `step/4` (purpose was merged) | alive (intentional) |
| `/health/applications/[id]` | `[id]/client-view.tsx` | Detail + 8-step stepper + activity timeline (Phase 6) | alive |
| `/health/applications/[id]/edit` | `[id]/edit/client-view.tsx` | Re-enter wizard for `REVISION_REQUESTED`, `CAR_PENDING`, `DRAFT` | alive |
| `/health/applications/[id]/car` | `[id]/car/client-view.tsx` | Upload CAR evidence | alive |
| `/health/applications/[id]/preview` | `[id]/preview/client-view.tsx` | Read-only printable preview | alive |
| `/health/applications/preview` | `preview/client-view.tsx` | Pre-submit preview before phase-1 payment | alive |
| `/health/applications/amendment` | `amendment/client-view.tsx` | Edit existing certificate fields (post-cert) | alive — but uses legacy POST (§2.5) |
| `/health/applications/renewal` | `renewal/client-view.tsx` | Cert renewal multi-step | alive |
| `/health/applications/replacement` | `replacement/client-view.tsx` | Lost/damaged cert replacement | alive |
| `/health/applications/tracking` | `tracking/client-view.tsx` | 10-step Track & Trace per app | duplicate of `[id]` Phase 6 timeline; orphan |
| `/health/payments` | `payments/client-view.tsx` | Invoice list + slip-upload modal | alive |
| `/health/certificates` | `certificates/client-view.tsx` | Cert cards + QR + download | alive |
| `/health/planting` | `planting/client-view.tsx` | Cycle list | alive |
| `/health/planting/new` | `planting/new/client-view.tsx` | New cycle wizard | alive |
| `/health/planting/[id]` | `planting/[id]/client-view.tsx` | Cycle detail w/ tabs | alive |
| `/health/planting/[id]/activities` | `planting/[id]/activities/...` | Activity log | alive |
| `/health/profile` | `profile/page.tsx` + `profile-client.tsx` | Profile edit + member info | alive |
| `/health/profile/notifications` | `profile/notifications/page.tsx` | Notification prefs (Phase 7) | alive |
| `/health/notifications` | `notifications/client-view.tsx` | Inbox of received notifications | alive (linked from bell icon) |
| `/health/start` | `start/client-view.tsx` | Service catalog landing | orphan |
| `/health/start/readiness` | `start/readiness/client-view.tsx` | Pre-application readiness checklist | orphan |
| `/health/establishments` | `establishments/client-view.tsx` | Farm list | orphan |
| `/health/establishments/new` | `establishments/new/...` | New farm | orphan |
| `/health/establishments/[id]` | `establishments/[id]/...` | Farm detail | orphan |
| `/health/documents` | `documents/client-view.tsx` | Generic doc-by-id lookup | orphan |
| `/health/documents/[id]` | `documents/[id]/...` | Doc detail | orphan |
| `/health/tracking` | `tracking/page.tsx` | Track-&-trace landing | semi-orphan |
| `/health/tracking/lots` | `tracking/lots/...` | Lot list | semi-orphan |
| `/health/tracking/cycles/[id]` | `tracking/cycles/[id]/page.tsx` | (need to inspect) | likely orphan |
| `/health/tracking/logs` | `tracking/logs/page.tsx` | tiny placeholder | orphan |
| `/health/tracking/plants/[qr-code]` | `tracking/plants/[qr-code]/...` | Plant QR landing | orphan |
| `/health/training` | `training/client-view.tsx` | Training records CRUD | orphan |
| `/health/site-analysis` | `site-analysis/client-view.tsx` | Site analysis CRUD | orphan |
| `/health/sop-builder` | `sop-builder/client-view.tsx` | SOP form builder | orphan |
| `/health/sop-templates` | `sop-templates/client-view.tsx` | SOP template gallery | orphan |
| `/health/reports` | `reports/client-view.tsx` | ภ.ท.27/28 monthly reports | orphan |
| `/health/resources` | `resources/page.tsx` | External agency links | orphan |
| `/health/settings` | `settings/client-view.tsx` | Lang/dark-mode/password (overlaps `/health/profile`) | semi-orphan |
| `/health/export-documents` | `export-documents/client-view.tsx` | CoA / Phytosanitary info | orphan |
| `/health/official-documents` | `official-documents/client-view.tsx` | Cert + invoice doc archive | orphan |
| `/health/subscription` | `subscription/client-view.tsx` | Subscription tier picker | orphan (intentional — `BILLING_FREE_TIER_FOR_ALL=true`) |

**Orphan summary (not reachable from any nav surface)**: 18 routes plus partially-reachable ones. `app-shell.tsx`, `mobile-bottom-nav.tsx`, and `sidebar-nav.tsx` reference them but are themselves unused dead code.

---

## 2. Broken / stale things (P0 — blocking)

### 2.1 Slip-flow workflow states not recognised by frontend ⚠️ TOP

`workflow-transition-service.js:18-46` declares `PHASE_1_SLIP_UNDER_REVIEW` and `PHASE_2_SLIP_UNDER_REVIEW` as canonical workflow states (added 2026-04-29). HEALTH actively transitions into them: `PENDING_DOC_FEE → PHASE_1_SLIP_UNDER_REVIEW`, `PENDING_AUDIT_FEE → PHASE_2_SLIP_UNDER_REVIEW` (lines 218-219).

Frontend mapping is missing in **three places**:
- `apps/web-app/src/lib/constants/workflow-states.ts:12-35` — `WORKFLOW_STATES` array doesn't list them. `STATUS_LABELS` and `STATUS_COLORS` (lines 40-83) have no entries → `getStatusLabel()` returns the raw uppercase string.
- `apps/web-app/src/lib/health-dashboard-stage.ts:134-204` — `normalizeHealthDashboardStage()` falls through every branch and ends at the default `UNDER_DOCUMENT_REVIEW`. The dashboard, list, and detail-page mini-stepper will say "เจ้าหน้าที่กำลังตรวจสอบเอกสารของท่าน" when actually the slip is being reviewed.
- `apps/web-app/src/lib/status-mapping.ts:55+` — `STATUS_NEXT_ACTIONS` has no entries → `getStatusInfo()` and `isUserActionRequired()` return undefined for slip-review states; the dashboard "⚡ ต้องดำเนินการ" panel silently skips the application.

### 2.2 Application list page uses inconsistent status normaliser

`applications/client-view.tsx:67-76` calls `classifyDashboardStage()` which delegates to `normalizeHealthDashboardStage()` — same bug as 2.1.

### 2.3 Dashboard envelope unwrapping risk

`dashboard/client-view.tsx:105` calls `api.get('/api/applications/my')`. Wrapping does NOT unwrap `{ data: [...] }` envelope.

### 2.4 `applications/tracking` page is dead code with stale state model

`applications/tracking/client-view.tsx:58-71` hard-codes the legacy 11-state palette — none exist in the canonical state machine.

### 2.5 `amendment` and `replacement` POST to legacy endpoint

Both pages POST to `/api/applications` (no resource segment). Active route is `/api/applications/submit`.

---

## 3. Missing user-facing features (P1 — UX gaps)

| Gap | Detail |
|---|---|
| **Cancel/delete a draft** | Backend has `DELETE /api/applications/draft/:id` but **no UI button**. |
| **Re-upload after slip rejection** | Modal supports it but list page badge stays wrong; no deep link. |
| **Revision-deadline visibility** | Only shown in detail page action banner; no countdown badge in list view. |
| **CAR flow visibility** | Only entry point is the action button on detail page when state matches. |
| **REJECTED_LAB retry path** | Backend allows `REJECTED_LAB → SUBMITTED` for HEALTH but no UI surfaces this. |
| **Mobile-friendliness** | Healthier than provider — `dashboard-layout.tsx` ships a working mobile bottom-tab bar. No equivalent of the provider audit's "deleted mobile-header" issue. |
| **Subscription page is unreachable** | Intentional while `BILLING_FREE_TIER_FOR_ALL=true`. |

---

## 4. UI consistency gaps (P2)

| Issue | Files |
|---|---|
| `SummaryHeader` usage is inconsistent. Used in `applications/`. Not used in `payments/`, `certificates/`, `planting/`. | various |
| Two icon libraries mixed — `lucide-react` vs `@tabler/icons-react`. | inconsistent |
| Two button systems — primitives vs raw `<button>` w/ tailwind in payments. | `payments/`, `slip-upload-modal.tsx` |
| Bottom mobile nav duplicated logic between `app-shell.tsx` and `dashboard-layout.tsx`. Only the latter is rendered. | dead code |
| Notification preferences URL depth difference: `/health/notifications` (inbox) vs `/health/profile/notifications` (prefs). | naming |
| `payments/client-view.tsx:33-40` `mapStatus` uses payment-record statuses separate from canonical `WORKFLOW_STATES` — undocumented. | low priority |
| English vs Thai mixing in `tracking/client-view.tsx:241-245` deadline panel. | low priority |

---

## 5. Recommended top P0 fix

**Add slip-review workflow states to the frontend mapping layer.**

Highest-impact, smallest-scope change because:
- Every HEALTH applicant who uses the slip-flow (the only payment path now) hits this.
- Three+1 small files; one focused PR; ~60-80 LOC.
- Sister issue to the provider audit's "missing NAV_ROLE_RULES" finding — same shape, same impact, same size.

**Files to touch**:
1. `apps/web-app/src/lib/constants/workflow-states.ts` — add 2 entries to `WORKFLOW_STATES`, `STATUS_LABELS`, `STATUS_COLORS`.
2. `apps/web-app/src/lib/health-dashboard-stage.ts` — classify slip-review states in `normalizeHealthDashboardStage()` (recommend mapping back to `PENDING_FEE_PHASE*` with sub-status copy so the 8-step stepper is preserved).
3. `apps/web-app/src/lib/status-mapping.ts` — add 2 `STATUS_NEXT_ACTIONS` entries with `urgency: 'none'`, no `actionLabel`.
4. `apps/web-app/src/app/health/applications/[id]/application-detail-page-config.ts:49-58` — add `STATUS_META` entries.

**Out of scope (defer)**: orphan-route cleanup, `applications/tracking` deletion, draft cancel button, deadline visibility upgrade, `amendment`/`replacement` endpoint migration, dead-code removal of `app-shell.tsx` / `mobile-bottom-nav.tsx` / `sidebar-nav.tsx`.

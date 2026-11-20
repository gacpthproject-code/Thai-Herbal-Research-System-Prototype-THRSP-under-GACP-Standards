# Provider Portal — Role × Page Alignment Audit

**Date**: 2026-04-30
**Scope**: Every `page.tsx` under `apps/web-app/src/app/provider/`, cross-referenced with `canonical-rbac.js` permissions, `NAV_ROLE_RULES` visibility, and ADR-001 four-pillar staff structure.
**Method**: Plan agent ran a read-only sweep — read RBAC source, navigation rules, page components, and the `/api/provider/*` route mounts.
**Output**: Mismatches between what each role is allowed to do vs. what each page presents.

---

## 1. Role responsibilities

**ADMIN (`admin`)** — *Executive Committee* pillar (ADR-001 §4). KPI oversight + signature authority. RBAC-wise gets every permission (`Object.values(PERMISSIONS)`) — true superuser. Day-to-day work should be dashboards, KPI, and exception override; not document review or audit execution.

**SCHEDULER (`scheduler`)** — *Central Dispatch* pillar (§1). Queueing, SLA assignment, reminders. Permissions: `APPLICATION_VIEW_ALL`, `APPLICATION_SCHEDULE`, `APPLICATION_WORKFLOW_TRANSITION`, `AUDIT_TIMELINE_READ`, `REPORT_EXPORT`. No document-review or audit-record permissions — pure dispatcher.

**DOCUMENT_REVIEWER (`document_reviewer`)** — *Unified Audit + Inspection* pillar (§2, document side). Permissions: `APPLICATION_VIEW_ALL`, `APPLICATION_DOC_REVIEW`, `APPLICATION_WORKFLOW_TRANSITION`, `AUDIT_TIMELINE_READ`. Reviews submitted documents, raises revision requests, transitions workflow forward to the audit gate.

**AUDITOR (`auditor`, includes consolidated HEAD_AUDITOR)** — *Unified Audit + Inspection* pillar (§2, field/trace side). Permissions: doc review + `APPLICATION_AUDIT_RECORD` + `AUDIT_SUBMIT` + `REPORT_EXPORT`. Field/online inspections, evidence (GPS check-in, photos), CARs, final approval since HEAD_AUDITOR was merged in.

**ACCOUNT (`account`)** — *Financial Reconciliation* pillar (§3). Permissions: `ACCOUNTING_DASHBOARD_READ`, `INVOICE_VIEW_ALL`, `RECEIPT_ISSUE`, `REPORT_EXPORT`, `AUDIT_TIMELINE_READ`, plus the new slip-flow set: `BANK_ACCOUNT_READ_ALL/MANAGE`, `PAYMENT_SLIP_READ_ALL/REVIEW`. After the 2026-04-29 RFC, core job is reviewing manually-uploaded transfer slips, reconciling bank accounts, issuing receipts.

---

## 2. Page inventory matrix

`NAV_ROLE_RULES` keys: items not listed (e.g. `dashboard`, `applications`, `profile`) are visible to **all** provider roles by the comment-documented default. Listed: `coordinator` (ADMIN/SCHEDULER), `audits` (ADMIN/AUDITOR/REVIEWER), `calendar` (ADMIN/SCHEDULER/AUDITOR), `analytics` (ADMIN/REVIEWER/AUDITOR/ACCOUNT), `accounting` (ADMIN/ACCOUNT), `certificates` (ADMIN/AUDITOR/REVIEWER), `management` (ADMIN), `settings` (ADMIN).

| Path | Function | NAV visibility | Should be used by | Verdict |
|---|---|---|---|---|
| `/provider` | Redirect → `/provider/dashboard` | all | all | ✅ |
| `/provider/dashboard` | Role-aware dashboard | all | all 5 roles | ✅ |
| `/provider/dashboard/admin` | Redirect → `/admin/dashboard` | all (redirect) | ADMIN | ✅ |
| `/provider/applications` | List w/ workflow filter | all | all 5 roles read | ✅ |
| `/provider/applications/[id]` | Detail + ReviewDecisionModal | all | DOC_REVIEWER, AUDITOR, ADMIN write | ⚠️ (modal trigger renders for SCHEDULER + ACCOUNT too) |
| `/provider/applications/[id]/print` | Printable form | all | all | ✅ |
| `/provider/audits` | Auditor dashboard + Final Approval queue | ADMIN/AUDITOR/REVIEWER | AUDITOR (+ ADMIN) | ⚠️ REVIEWER lacks `AUDIT_SUBMIT`; backend will 403 |
| `/provider/audits/[id]` | Job sheet: GPS check-in, evidence, decision | ADMIN/AUDITOR/REVIEWER | AUDITOR | ⚠️ same |
| `/provider/calendar` | Schedule audits, assign auditor | ADMIN/SCHEDULER/AUDITOR | SCHEDULER (+ ADMIN); AUDITOR view-only | ✅ |
| `/provider/coordinator` | Central dispatch console | ADMIN/SCHEDULER | SCHEDULER (+ ADMIN) | ✅ |
| `/provider/scheduler/reassign` | Reassign auditor on stuck audit | all (no rule) | SCHEDULER (+ ADMIN) | ⚠️ no nav gate |
| `/provider/analytics` | Cross-cutting analytics | ADMIN/REVIEWER/AUDITOR/ACCOUNT | ADMIN primary | ✅ |
| `/provider/reports` | Period summary + KPI | all (no rule) | ADMIN, AUDITOR, REVIEWER | ⚠️ no nav gate |
| `/provider/accounting` | Slip review + receipt + subscription tabs | ADMIN/ACCOUNT | ACCOUNT (+ ADMIN) | ✅ |
| `/provider/receipts` | Issue receipt for paid invoice | all (no rule) | ACCOUNT (+ ADMIN) | ⚠️ no nav gate; should be merged |
| `/provider/certificates` | Active certs dashboard, expiring list | ADMIN/AUDITOR/REVIEWER | AUDITOR primary + ADMIN | ✅ |
| `/provider/documents` | Document template CRUD | all (no rule) | ADMIN only (master data) | ❌ doesn't belong |
| `/provider/criteria` | GACP audit criteria CRUD | all (no rule) | ADMIN only (master data) | ❌ doesn't belong |
| `/provider/planting` | Planting cycles, traceability data | all (no rule) | AUDITOR (verify trace) | ⚠️ duplicate of `/admin/planting` |
| `/provider/planting/[id]` | Planting cycle detail | all | AUDITOR | ⚠️ same |
| `/provider/management` | Provider member CRUD | ADMIN | ADMIN | ⚠️ duplicates `/admin/users` |
| `/provider/settings` | Redirect → `/provider/settings/system` | ADMIN | ADMIN | ✅ (redirect) |
| `/provider/settings/system` | System-wide feature flags + global config | ADMIN | ADMIN | ❌ duplicates `/admin/settings` |
| `/provider/profile` | Self-profile + role JD view | all (no rule) | all 5 roles | ✅ |
| `/provider/login` | Redirect → `PROVIDER_LOGIN_ROUTE` | n/a | n/a | ✅ |

---

## 3. Findings grouped

### A. Pages clearly aligned (14)
`/provider`, `/provider/dashboard`, `/provider/dashboard/admin`, `/provider/applications`, `/provider/applications/[id]/print`, `/provider/calendar`, `/provider/coordinator`, `/provider/analytics`, `/provider/accounting`, `/provider/certificates`, `/provider/management` (correct ADMIN-gating, but see §C5), `/provider/settings` (redirect), `/provider/profile`, `/provider/login`.

### B. Pages misaligned — function vs visible role

1. **`/provider/audits` and `/provider/audits/[id]`** — `NAV_ROLE_RULES.audits` lets DOCUMENT_REVIEWER see them, but the page renders AuditorDashboard, FinalApprovalList, GPS check-in, and evidence upload. DOCUMENT_REVIEWER does not have `AUDIT_SUBMIT` or `APPLICATION_AUDIT_RECORD` — the backend will 403 and the UI will look broken.
   **Fix**: drop `DOCUMENT_REVIEWER` from `NAV_ROLE_RULES.audits`; restrict to `[ADMIN, AUDITOR]`.

2. **`/provider/scheduler/reassign`** — Logically a SCHEDULER tool, but no `NAV_ROLE_RULES` entry → all provider roles see it.
   **Fix**: add `'reassign': [ADMIN, SCHEDULER]`, OR merge into `/provider/coordinator` as a tab (data already overlaps).

3. **`/provider/reports`** — Cross-functional KPIs, no nav rule, backend only `authenticateProvider`s without role check. ACCOUNT and SCHEDULER can pull data they don't need.
   **Fix**: add `'reports': [ADMIN, AUDITOR, DOCUMENT_REVIEWER]` + add `requireCanonicalPermission(REPORT_EXPORT)` server-side. Or merge into `/provider/analytics`.

4. **`/provider/receipts`** — Issuing receipts is an ACCOUNT function (`RECEIPT_ISSUE`), but no nav rule → DOCUMENT_REVIEWER and AUDITOR see it.
   **Fix**: add `'receipts': [ADMIN, ACCOUNT]`, OR merge into `/provider/accounting` (`pending_receipt` tab already exists there).

5. **`/provider/applications/[id]`** — Review modal renders for everyone, but only DOC_REVIEWER/AUDITOR/ADMIN can act. SCHEDULER + ACCOUNT see action UI that 403s.
   **Fix**: hide the `ReviewDecisionModal` trigger when the current role lacks `APPLICATION_DOC_REVIEW`. Keep read-only detail.

### C. Pages that don't belong in `/provider`

1. **`/provider/settings/system`** — Toggles global feature flags. `/admin/settings/page.tsx` already exists. Two doors → drift risk.
   **Recommendation**: delete; have `/provider/settings` redirect to `/admin/settings`.

2. **`/provider/criteria`** — GACP audit criteria are master data (TESTING / PRODUCTION / HYGIENE…). Master-data = `MASTER_DATA_MANAGE` = ADMIN only.
   **Recommendation**: move to `/admin/criteria` (or `/admin/master-data/criteria`).

3. **`/provider/documents`** — Document template CRUD (cert / invoice / lot label). Same master-data shape.
   **Recommendation**: move to `/admin/documents` (or `/admin/master-data/templates`). Auditors who consume a template don't need a CRUD page.

4. **`/provider/planting` and `/provider/planting/[id]`** — Near-duplicate of `/admin/planting`. Useful to AUDITOR for trace spot-checks only.
   **Recommendation**: (a) delete the `/provider/planting` pages and embed the cycle viewer as a tab inside `/provider/audits/[id]`, OR (b) keep but add `'planting': [ADMIN, AUDITOR]` + reuse the `/admin/planting` component (don't keep two parallel JSX trees).

5. **`/provider/management`** — Provider user CRUD. Component name + endpoint indicate ADMIN utility.
   **Recommendation**: rename to `/provider/admin/users` (ADMIN sub-area), OR merge into `/admin/users`. Pick one source of truth.

### D. Missing pages — gaps per pillar

- **Pillar 1 (Central Dispatch / SCHEDULER)** — no dedicated *auto-assignment / round-robin* tool. `/provider/coordinator` shows queues + manual assign only; SLA/round-robin policy not configurable in UI. Reassignment lives off-nav.
- **Pillar 3 (Financial / ACCOUNT)** — `BANK_ACCOUNT_MANAGE` permission exists (since 2026-04-29 slip-flow RFC) but there is **no `/provider/accounting/bank-accounts`** page. Bank-account CRUD currently has no UI; must hit API directly. Most visible RBAC→UI gap in the system.
- **Pillar 4 (Executive Committee / ADMIN)** — no signature-authority workspace. Cert signing folded into `/provider/audits` since HEAD_AUDITOR consolidated. Acceptable but worth noting.
- **AUDITOR** — no clear *trace verification* page; `/provider/planting` mirror is the only entry. Should be a per-application tool, not top-level.

---

## 4. Cleanup recommendations (priority-ordered)

1. **P0 — Add missing `NAV_ROLE_RULES` entries** for `reassign`, `reports`, `receipts`, `documents`, `criteria`, `planting`, `profile`. Today the layout silently shows them to every provider role because of the "unlisted = visible to all" rule. Biggest source of mis-shown nav items; one focused PR fixes it.

2. **P0 — Delete `/provider/settings/system`** and redirect `/provider/settings` → `/admin/settings`. Duplicate is already drifting (different feature flags could appear in only one).

3. **P0 — Build `/provider/accounting/bank-accounts`** (or a tab inside `/provider/accounting`). `BANK_ACCOUNT_MANAGE` permission was added with the 2026-04-29 slip-flow RFC and has no UI.

4. **P1 — Move `/provider/criteria` → `/admin/criteria`** and `/provider/documents` → `/admin/documents`. Both are master-data CRUD; should live next to `/admin/users` and `/admin/organizations`.

5. **P1 — Merge `/provider/receipts` into `/provider/accounting`** as the `pending_receipt` tab (already exists). Delete the standalone page.

6. **P1 — Merge `/provider/reports` into `/provider/analytics`**. Same data domain, same audience.

7. **P1 — Drop `DOCUMENT_REVIEWER` from `NAV_ROLE_RULES.audits`**. Reviewers have no audit-execution permission.

8. **P2 — Move `/provider/scheduler/reassign` into `/provider/coordinator`** as a "Reassign" tab.

9. **P2 — Hide `ReviewDecisionModal` trigger on `/provider/applications/[id]`** when the current role lacks `APPLICATION_DOC_REVIEW`. Keep detail view; hide write actions.

10. **P2 — Decide between `/provider/management` and `/admin/users`**. Recommendation: keep `/admin/users`, redirect `/provider/management`, drop duplicate.

11. **P2 — Delete `/provider/planting`** OR convert into a read-only tab inside `/provider/audits/[id]`.

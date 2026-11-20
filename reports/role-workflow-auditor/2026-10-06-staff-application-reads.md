# role-workflow-auditor — staff application reads (listing + detail doors)

- Date: 2026-10-06 · Tree: main `8a2f801a1` · Mode: read-only, code evidence (no runtime probe)
- Status: **PENDING** — findings come from reading the code only. No HTTP probe was run in this session.
- Scope: what each staff role READS through the application listing and detail doors.
  Roles: `document_reviewer`, `dispatcher`, `field_inspector`, `certificate_approver`,
  `finance_officer_dtam`, `finance_officer_platform`, `system_admin_dtam`, `system_admin_platform`.

## The doors

| Door | File · symbol | Scope applied |
|---|---|---|
| `GET /api/applications/` (provider branch, caller has no `healthId`) | `apps/backend/routes/api/applications/application-listing-handlers.js` · `PROVIDER_LISTING_ROLES` + `router.get('/')` | **None.** `prisma.application.findMany({ where: { isDeleted: false }, take: 100 })`. No `withVisibility`, no status slice, no org scope |
| `GET /api/applications/:id` (health detail) | `application-workflow-handlers.js` · `router.get('/:id')` | `holderReadWhere(holderScope(req))`. Staff hold no memberships, so they get nothing (correct) |
| `GET /api/provider/applications/` | `routes/api/provider/applications.js` · `router.get('/')` | `withVisibility(baseWhere, req.user)` |
| `GET /api/provider/applications/queue` | `routes/api/provider/handlers/applications.js` · `applicationsQueue` | `withVisibility` |
| `GET /api/provider/applications/:id` (provider detail) | `routes/api/provider/applications.js` · `router.get('/:id')` | `withVisibility`. Returns full `formData`, `workflowHistory`, all comments (incl. `internalOnly`), and applicant `email` and `phoneNumber` |
| `GET /api/provider/applications/:id/activities`, `/:id/audit-timelines` | same file / `workflow-audit-timelines-handler.js` | `withVisibility` |
| `GET /api/provider/applications/:applicationId/checklist` | `controllers/audit-checklist-controller.js` · `getByApplication` | **None.** Checks `authenticateProvider` only: `where: { applicationId }` |
| `GET /api/provider/applications/:applicationId/sow` | `controllers/sow-controller.js` · `listByApplication` | **None.** Checks `authenticateProvider` only |

Row filter SSOT: `apps/backend/shared/application-visibility.js` · `applicationVisibilityFilter`.
- `UNRESTRICTED_ROLES` = `system_admin_dtam` and `system_admin_platform`.
- `field_inspector` sees rows where `auditorId`, `headAuditorId` or `reviewerId` is the caller. It also has a `sameReviewerAuditor` branch.
- `document_reviewer` sees rows where `reviewerId` or `formData.PROVIDERAssignment.reviewerId` is the caller.
- `WORK_POOL_ROLES` see a status slice. For `dispatcher` and `certificate_approver` the slice comes from `ROLE_TRANSITIONS`. For finance it is `FINANCE_READ_WINDOW`.
- Every other role gets `DENY_ALL`.

## Live exposure (first)

**F1. `GET /api/applications/` gives a system-wide list to six staff roles and skips the row filter.**
- Who gets it: `PROVIDER_LISTING_ROLES` admits `system_admin_dtam`, `document_reviewer`, `field_inspector`, `dispatcher`, `finance_officer_dtam` and `finance_officer_platform`.
- What they get: the newest 100 applications in the whole system. This covers every status, DRAFT and unpaid filings included, and every organization.
- Fields returned (`mapHealthApplication` in `routes/api/helpers/applications-helpers.js`): `id`, `applicationNumber`, `entityId` (the holder company), `plantName`, `serviceType`, `status`, `workflowState`, `phase1Status`, `phase2Status`, `createdAt`, `submittedAt`, `dashboardStage`, `hasCertificate`, `isRenewal`, `revisionDueAt`, `carDueAt`.
- No applicant name or contact is returned.
- Is it live? Yes. The code is identical in `aa82f753`, which runs on staging and demo (checked with `git show aa82f753:…`). The platform is pre-production, so only test data is exposed.

Rulings this breaks:
- `field_inspector` "receives work only after payment" (2026-09-27): the inspector sees unpaid and unassigned filings.
- The row filter's own contract: "an absent scope means DENY". This door simply does not call it.

**F1b (chain). The listing door's IDs open two unscoped detail doors.**
- `GET /api/provider/applications/:applicationId/checklist` and `/sow` check only `authenticateProvider`.
- So any provider role can read the audit checklist (inspection findings and auditor name) and the SOW of any application whose id it holds. F1 hands out those ids.
- This reaches `finance_officer_*` (inspection findings are not billing data) and `field_inspector` (applications not assigned to it).

## Per-role table

| Role | Should see (rulings + S0–S6) | Sees today | Gap |
|---|---|---|---|
| `document_reviewer` | Applications assigned to it for document review (S2), from `ASSIGNED_FOR_REVIEW` onward | Provider doors: assigned only (`applicationVisibilityFilter`, DOCUMENT_REVIEWER branch). **`/api/applications/`: the system-wide 100** | F1 |
| `dispatcher` | Paid filings waiting for routing: `DOC_FEE_PAID`/`ASSIGNED_FOR_REVIEW` (S1→S2) and `AUDIT_FEE_PAID`/`AUDIT_CONFIRMED` (S3) | Provider doors: that slice (`workPoolStatuses` derived from `ROLE_TRANSITIONS[DISPATCHER]`). **`/api/applications/`: the system-wide 100, all statuses** | F1 |
| `field_inspector` | Only applications it is assigned to inspect, and only after payment. It must not be the document reviewer of the same application (2026-10-05) | Provider doors: `auditorId`/`headAuditorId`/`reviewerId` = self. `auditorId` is written only when an application moves from `AUDIT_FEE_PAID` to `AUDIT_CONFIRMED` (`services/audit-scheduling-service.js` · `assignAuditor`; `scheduler-audit-schedules-post-handler.js` state gate), so the payment rule holds on these doors. Separation is enforced when the reviewer is assigned, when the inspector is assigned, and when a decision is made (`shared/reviewer-inspector-separation.js`). **`/api/applications/`: the system-wide 100, unpaid included.** **checklist/sow: any application** | F1, F1b. The `sameReviewerAuditor` branch has no purpose left: the `reviewerId` branch already covers it, and the flag means "the same person does both", which the 2026-10-05 ruling forbids (cleanup) |
| `certificate_approver` | Filings waiting for the S5 decision: `AUDIT_PASSED`, `APPROVED`, `CERTIFIED` | Provider doors: slice from `ROLE_TRANSITIONS[CERTIFICATE_APPROVER]`. `/api/applications/` → 403 `PROVIDER_ROLE_REQUIRED` (not in `PROVIDER_LISTING_ROLES`). Correct by accident | Inconsistent allow-list (F2) |
| `finance_officer_dtam` | The same billing view as platform finance, read-only (2026-09-11/27). Billing lives under `/api/finance/*` and `/provider/accounting` | Provider doors: `FINANCE_READ_WINDOW` (4 statuses), identical for both roles, so parity holds. The detail door returns full `formData` and applicant email/phone, which is not billing data. The web front end does not let finance into `/provider/applications` (`apps/web-app/src/lib/provider-role-config.ts`, id `applications`). **`/api/applications/`: the system-wide 100.** **checklist/sow: any application** | F1, F1b, F3 |
| `finance_officer_platform` | Same as DTAM finance | Same as DTAM finance. Listed **twice** in `PROVIDER_LISTING_ROLES`: harmless in a `Set`, but it looks like a slot meant for a different role | F1, F1b, F2, F3 |
| `system_admin_dtam` | Administers its own organization | `UNRESTRICTED_ROLES` returns `null`, so it sees every organization. `/api/applications/` gives the system-wide 100 | F4: per the comment above `SYSTEM_ADMIN_PLATFORM` in `canonical-rbac.js` (ADR-014), only `system_admin_platform` should cross organizations. Neither door scopes by `organizationId`, and the RLS policy is observe-only, as the comment in `application-visibility.js` itself says |
| `system_admin_platform` | Cross-organization (ADR-014) | Provider doors: unrestricted. `/api/applications/` → 403 (not in the list) | F2 (harmless; the provider door is its door) |

Also found (outside the read scope, item 4 residue):
- `application-workflow-handlers.js` · `router.get('/:id/activities')` · `WORK_TYPE_LABEL_TH` still carries `SLIP_REVIEW: 'ตรวจสลิปการชำระเงิน'`.
- The comment next to it says "auto-issue on slip approval".
- Slip review was retired 2026-09-11, so this is retired-flow residue.

## Findings

- **F1 (High, live, pre-production data):** the provider branch of `GET /api/applications/` does not use `withVisibility`.
- **F1b (High):** the checklist and SOW GET doors have no row filter.
- **F2 (Low):** `PROVIDER_LISTING_ROLES` lists `FINANCE_OFFICER_PLATFORM` twice and leaves out `CERTIFICATE_APPROVER` and `SYSTEM_ADMIN_PLATFORM`. The list is a second, drifting copy of the role policy. `withVisibility` already decides per role.
- **F3 (Medium, data minimisation):** finance roles can read applicant PII and full `formData` through the provider detail door. They have no UI on that door, and their rulings scope them to billing data.
- **F4 (Medium, needs ADR check):** `system_admin_dtam` is cross-organization on every visibility-filtered door.
- **F5 (Low, residue):** `SLIP_REVIEW` label and comment in the applicant activities door.

## Proposed minimal server-side fix (diff sketch, not applied)

### Fix 1 — listing door uses the one row filter (closes F1 and F2)

```diff
--- a/apps/backend/routes/api/applications/application-listing-handlers.js
+++ b/apps/backend/routes/api/applications/application-listing-handlers.js
@@
-const { normalizeRole, isProviderRole, CANONICAL_ROLES } = require('../../../shared/canonical-rbac');
+const { normalizeRole, isProviderRole } = require('../../../shared/canonical-rbac');
+// One row filter for every staff read of applications (shared/application-visibility.js).
+const { withVisibility } = require('../../../shared/application-visibility');
@@
-const PROVIDER_LISTING_ROLES = new Set([
-    CANONICAL_ROLES.SYSTEM_ADMIN_DTAM,
-    CANONICAL_ROLES.DOCUMENT_REVIEWER,
-    CANONICAL_ROLES.FIELD_INSPECTOR,
-    CANONICAL_ROLES.DISPATCHER,
-    CANONICAL_ROLES.FINANCE_OFFICER_DTAM,
-    CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM,
-    CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM,
-]);
@@
-            if (
-                !canonicalRole
-                || !isProviderRole(canonicalRole)
-                || !PROVIDER_LISTING_ROLES.has(canonicalRole)
-            ) {
+            if (!canonicalRole || !isProviderRole(canonicalRole)) {
@@
             const allApps = await prisma.application.findMany({
-                where: { isDeleted: false },
+                // Each role sees its own rows: inspector = assigned (auditorId is written only
+                // at AUDIT_FEE_PAID→AUDIT_CONFIRMED, i.e. after payment), reviewer = assigned,
+                // dispatcher/approver/finance = their status slice, admins = unrestricted.
+                where: withVisibility({ isDeleted: false }, req.user),
                 orderBy: { createdAt: 'desc' },
                 take: 100,
```

RED test to write first:
1. In `apps/backend/routes/api/applications/__tests__/`, use a `field_inspector` token and two applications. The first is `PENDING_AUDIT_FEE`, unassigned. The second is `AUDIT_CONFIRMED` with `auditorId` = the inspector.
2. Call `GET /api/applications/` and expect only the second.
3. Add the same check for `finance_officer_dtam` and `finance_officer_platform`: both must return the same set, and only rows inside `FINANCE_READ_WINDOW`.
4. Run against a real Postgres, not a mocked prisma (lesson: a mocked dependency hides a dead feature).

### Fix 2 — checklist / SOW reads use the same filter (closes F1b)

```diff
--- a/apps/backend/routes/api/provider/applications.js
+++ b/apps/backend/routes/api/provider/applications.js
+async function requireVisibleApplication(req, res, next) {
+    try {
+        const visible = await applicationService.findVisibleApplicationIdSlice({
+            where: withVisibility({ id: req.params.applicationId, isDeleted: false }, req.user),
+        });
+        if (!visible) { return res.status(404).json({ success: false, error: 'Application not found' }); }
+        return next();
+    } catch (error) {
+        logger.error('[provider applications] requireVisibleApplication failed', { message: error.message });
+        return res.status(500).json({ success: false, error: 'Failed to verify application visibility' });
+    }
+}
-router.get('/:applicationId/sow', authenticateProvider, sowController.listByApplication);
+router.get('/:applicationId/sow', authenticateProvider, requireVisibleApplication, sowController.listByApplication);
-router.get('/:applicationId/checklist', authenticateProvider, auditChecklistController.getByApplication);
+router.get('/:applicationId/checklist', authenticateProvider, requireVisibleApplication, auditChecklistController.getByApplication);
```

The same pattern already runs on `/:applicationId/activities`, through `findVisibleApplicationIdSlice`.

### Fix 3 (optional, F3) — finance gets no PII on the provider detail door

In `routes/api/provider/applications.js` · `router.get('/:id')`:
- When `normalizeRole(req.user.canonicalRole)` is in `FINANCE_ROLES`, drop `applicant.email`, `applicant.phoneNumber` and the raw `formData` from the select.
- Return only `id`, `applicationNumber` and `status`.
- Alternatively, take finance out of `WORK_POOL_ROLES` and leave billing to `/api/finance/*`.

This is data minimisation, and both finance roles still get the same view. The rulings say "billing only" but do not name this door, so a one-line operator confirmation is advisable.

### Fix 4 (F4) — not proposed as code here

Whether `system_admin_dtam` may cross organizations is an ADR-014 question, so it needs an operator ruling. Today the system effectively has one DTAM organization.

### Cleanup (F5, and the `sameReviewerAuditor` branch)

- Remove the `SLIP_REVIEW` label and the slip-approval comment from `WORK_TYPE_LABEL_TH`.
- Remove the redundant `sameReviewerAuditor` OR-branch from the `field_inspector` scope. The `reviewerId` branch already covers it.

## Not verified (what would make this DONE)

- No runtime probe was run. To move this to DONE:
  - Check that `GET /api/health` `revision` on staging/demo = `aa82f753` (or later).
  - Log in as a `field_inspector` test account and call `GET /api/applications/`.
  - Expected today: up to 100 rows across statuses. Expected after Fix 1: assigned rows only.

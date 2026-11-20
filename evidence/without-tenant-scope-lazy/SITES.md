# withoutTenantScope + lazy PrismaPromise — every call site (branch fix/without-tenant-scope-lazy)

Site list: `withoutTenantScope(() => <prisma|tx|client|db>.<model>.<op>(...))` with no `await` inside the callback, found by the
review's scan script run from `apps/backend` on this tree — **48 sites** (the review said 44; the table lists all 48 the script
prints). Sites whose callback is a `{ ... }` block or starts with `await`, or calls an async function, were never affected (the
work started inside the run) and are not listed. An interactive `prisma.$transaction(async ...)` starts eagerly — checked on the
scratch Postgres (callback saw store `null`), so `restamp-revision-deadlines.js:122` and `entity-service.js:745,799` are unaffected.

Key for the effect columns
- **N0** — the caller holds no tenant (cron, script, login callback, queue worker, unauthenticated cron route). Before: same
  rows, plus a false "missing context" RLS-shadow signal on tenant-scoped models (`tenant-prisma-extension.js:359-364`, because
  `isWithoutTenantScope()` was false when the query ran). After: same rows, no false signal.
- **G** — global model (not in `TENANT_SCOPED_MODELS`): the tenant never touched these queries. No change.
- **FU** — `findUnique`: the extension adds no read filter to it; before, only the shadow compare could log. No row change.
- **proven** = the integration test in `apps/backend/__tests__/integration/without-tenant-scope-lazy.int.test.js` (RED outputs in
  this folder). Everything else is read from the code, not run.

| # | site | model.op | caller tenant | before | after |
|---|---|---|---|---|---|
| 1 | jobs/dtam-remittance-batch-job.js:62 | CheckoutOrder.groupBy | none (cron) | N0 | N0 |
| 2 | jobs/payment-closure-job.js:97 | PaymentReminderLog.findMany (by invoiceId) | none (sweep loop, called at :251) | N0 | N0 |
| 3 | jobs/payment-closure-job.js:125 | CheckoutOrder.findFirst (by invoiceId) | none (called at :259) | N0 | N0 |
| 4 | jobs/payment-closure-job.js:154 | User.findFirst (by canonicalId) | invoice's org (inside runWithTenantContext :268, call at :422) | filtered to that org; applicant sits there → found | unfiltered by-key lookup → same row |
| 5 | jobs/payment-closure-job.js:180 | Invoice.findMany | none (cron) | N0 | N0 |
| 6 | jobs/payment-reminder-job.js:117 | Invoice.findMany | none (cron) | N0 | N0 |
| 7 | jobs/revision-deadline-checker.js:56 | RevisionDeadline.findMany | none (cron) | N0 | N0 |
| 8 | jobs/revision-deadline-checker.js:263 | User.findFirst (by canonicalId) | deadline's org (runWithTenantContext :109) | filtered to that org; applicant found | same row, unfiltered by key |
| 9 | jobs/revision-deadline-checker.js:291 (now :294) | User.findMany dispatchers + DTAM admins, **no org filter** | deadline's org | fan-out stayed in the deadline's org only because the lazy promise inherited it | **source fix alone widened it to every org** (RED: red-output-revision-deadline.txt) → **call site changed**: explicit `organizationId: orgId`, wrapper removed → same recipients as before — proven |
| 10 | jobs/scheduler.js:54 | Certificate.findMany | none (cron) | N0 | N0 |
| 11 | jobs/settlement-reconcile-job.js:118 | CheckoutOrder.findMany (money) | none (cron) | N0 | N0 — proven (pin: both orgs' stale orders reach the gateway question, nothing re-driven) |
| 12 | jobs/sla-processor.js:22 | Application.findMany | none (cron) | N0 | N0 |
| 13 | jobs/waiver-sla-escalation-job.js:33 | WaiverReopenRequest.findMany | none (cron) | N0 | N0 |
| 14 | jobs/work-activity-sla-monitor.js:28 | WorkActivity.findMany | none (cron) | N0 | N0 |
| 15 | routes/api/platform-admin/organizations.js:133 | Organization.create | platform admin's org | G | G |
| 16 | routes/api/platform-admin/organizations.js:205 | Organization.findMany | platform admin's org | G | G |
| 17 | routes/api/platform-admin/organizations.js:239 | Organization.findUnique | platform admin's org | G | G |
| 18 | routes/api/platform-admin/organizations.js:289 | Organization.findUnique | platform admin's org | G | G |
| 19 | routes/api/platform-admin/organizations.js:299 | Organization.update | platform admin's org | G | G |
| 20 | routes/api/platform-admin/organizations.js:379 | Organization.findUnique | platform admin's org | G | G |
| 21 | routes/api/platform-admin/organizations.js:429 | User.create with explicit organizationId = target org | platform admin's org | target ≠ caller org → **500** (proven RED: red-output-provisioning.txt; cause read from code: the extension's cross-tenant write guard, `tenant-prisma-extension.js:246-256` — the route log does not print the message) | **201**, row in the target org — proven |
| 22 | routes/api/provider/waiver-reopen.js:48 | User.findFirst (by canonicalId) | staff caller's org | applicant outside the caller's org not found → that notification silently skipped | found |
| 23 | routes/api/system/cron.js:344 | User.findFirst (by canonicalId) | none (cron-secret route, no req.user) | N0 | N0 |
| 24 | routes/api/system/provider.js:92 | User.findFirst (mutation target) | PLATFORM_ADMIN's org | cross-org target → **404** for PATCH/PUT/DELETE (masked S6: the count below was never reached) | found → S6 count runs in the target org — proven (PATCH 409 / control 200) |
| 25 | routes/api/system/provider.js:705 | User.findFirst (unlock target) | PLATFORM_ADMIN's org | cross-org target → 404 | found (same shape as #24; not separately run) |
| 26 | scripts/ops/batch-reinstate-wrongful-expiry.js:81 | User.findUnique | none (script) | N0 / FU | N0 |
| 27 | scripts/ops/batch-reinstate-wrongful-expiry.js:93 | Application.findMany | none (script) | N0 | N0 |
| 28 | scripts/ops/identify-wrongful-expiry-cohort.js:60 | Application.findMany | none (script) | N0 | N0 |
| 29 | scripts/ops/identify-wrongful-expiry-cohort.js:98 | Application.findMany | none (script) | N0 | N0 |
| 30 | scripts/ops/identify-wrongful-expiry-cohort.js:108 | Invoice.count | none (script) | N0 | N0 |
| 31 | scripts/ops/restamp-revision-deadlines.js:82 | Application.findMany | none (script) | N0 | N0 |
| 32 | scripts/ops/restamp-revision-deadlines.js:122 | $transaction(async …) | none (script) | eager — unaffected | unaffected |
| 33 | scripts/ops/waiver-anomaly-report.js:162 | WaiverReopenRequest.findMany | none (script) | N0 | N0 |
| 34 | services/auth/thaid-identity-service.js:195 | IdentityLink.upsert | none (ThaiD callback, before login) | G | G |
| 35 | services/auth/thaid-identity-service.js:245 | IdentityLink.findUnique | none | G | G |
| 36 | services/auth/thaid-identity-service.js:269 | User.findFirst (by hmac) | none | N0 | N0 |
| 37 | services/document-precheck/service.js:224 | DocumentPrecheck.findUnique | none (queue failure handler, queue-service.js:112) | N0 / FU | N0 |
| 38 | services/document-precheck/service.js:301 | DocumentPrecheck.findUnique | none (Bull processor) | N0 / FU | N0 |
| 39 | services/entity-effective-permissions-service.js:182 | EntityMemberPermissionGrant.findMany (S7) | request, caller's org | REVOKE stored under another org invisible → **revoked permission stays effective** — proven RED | REVOKE honoured — proven |
| 40 | services/entity-service.js:439 | EntityMemberPermissionGrant.findMany (S7 snapshot) | request / tx, caller's org | grants under another org not seen → **not deleted** on revoke / transfer / re-invite — proven RED (revokeMember left 1 row) | cleared — proven |
| 41 | services/notification/domain-helpers.js:380 | User.findMany platform staff | applicant's submit / checkout request | only platform staff inside the applicant's org (multi-org: none → ADMIN_ALERT_NO_RECIPIENT) | platform staff wherever they sit, as the helper documents |
| 42 | services/notification/domain-helpers.js:485 | Application.findUnique | applicant's request | FU | FU |
| 43 | services/notification/domain-helpers.js:564 | Notification.findFirst (price-drift dedup) | applicant's checkout request | alert rows carry the recipient's org → never matched → alert repeats each press (multi-org) | dedup matches |
| 44 | services/provider-user-service.js:110 | User.findFirst (global uniqueness) | admin's request | duplicate email/providerId in another org not seen by this check → the create relies on DB unique constraints (not run here) | the service's own 409 |
| 45 | services/provider-user-service.js:598 | User.count (S6 last-admin) | PLATFORM_ADMIN / admin request | counted in the **caller's** org; B's last admin removable whenever the caller's org has an admin — proven RED (service resolves, no 409) | counts the target org → 409 — proven |
| 46 | services/quotation-service.js:1254 | Quotation.findFirst (by id, money) | settlement: the order's own org (reconcile :145 re-enters it) | same org as the quotation → same row | same row |
| 47 | services/waiver-approvers.js:32 | User.findMany approvers of `organizationId` | route: caller's org · job (#13 path): none | route: org overwritten → the **caller's** org's approvers get the notice instead of the application's org's | the application's org's approvers |
| 48 | services/waiver-approvers.js:54 | User.findFirst active approver of `request.organizationId` | approver's request, own org | org check defeated: an approver from org X passes for a request in org Y | approver must belong to the request's org — **see concern in the report** |

Evidence in this folder
- red-output.txt — first RED (unit + integration) on dcfee694, tenant-context unchanged
- red-output-provisioning.txt — RED for #21 with tenant-context reverted to main
- red-output-revision-deadline.txt — RED for #9 with the source fix applied, plus the main control (passes on main)
- test-output.txt — GREEN, both new suites
- related-suites-output.txt — every existing suite that mentions the touched modules, with the fix; 2 failing suites re-run on
  main's tenant-context: same 4 failures (pre-existing)

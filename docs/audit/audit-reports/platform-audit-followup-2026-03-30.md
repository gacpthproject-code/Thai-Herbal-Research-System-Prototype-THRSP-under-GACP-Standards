# Platform Audit Follow-Up

Date: 2026-03-30

Supersedes the earlier root-level checklist by re-verifying the current repository state and separating resolved findings from still-open risks.

## Scope

- Backend layering drift and duplicate service surfaces
- Frontend raw API-call drift outside `lib/api` and service hooks
- Incomplete code on critical backend integration paths
- Deployment and release documentation sprawl
- Static quality gates that are safe to run in the current environment

## Team Routing

- Primary owner: `software-analysis`
- Supporting owners: `backend-service`, `frontend-product`, `workflow-business-rules`, `qa-release-observability`

## Commands Run

```bash
git status --short
npm run check:max-lines
npm run check:encoding
npm run check:security-conventions
npm run audit:vnext
```

Additional read-only scans were run with PowerShell because `rg.exe` is not executable in this environment.

## Current Status At A Glance

### Improved Since The Earlier Checklist

- `/payments` is mounted only once in `apps/backend/routes/api/index.js`
- `npm run check:security-conventions` now passes
- The earlier `server-production.js` mock checklist entrypoint could not be found at its former path
- Root-level component sprawl in `apps/web-app/src/components` appears largely cleaned up; only `index.ts` remains at the root

### Still Open And High Signal

- Backend layering drift is still widespread: 96 route files and 13 controller files contain direct Prisma usage
- Frontend raw `fetch()` usage still exists in 10 app/component files outside `src/app/api`
- Service ownership is still fragmented across duplicate, legacy, and wrapper files in email, notification, cache, and Ksher payment domains
- `apps/backend/services/lab-connectors/index.js` still contains three `Not implemented` throws in the base connector
- `npm run check:encoding` still fails with 63 UTF-8 BOM files, including active runtime files
- Deployment and release guidance is spread across 27 files under `docs/deployment` and `docs/releases`

## Findings

### 1. Backend Layering Drift Remains The Largest Structural Problem

Evidence gathered from current source:

- 96 route files contain direct Prisma usage (`529` matches)
- 13 controller files contain direct Prisma usage (`85` matches)

Representative files:

- `apps/backend/routes/api/admin/applications.js`
- `apps/backend/routes/api/applications/applications.js`
- `apps/backend/routes/api/audit/audits.js`
- `apps/backend/routes/api/trace/lots.js`
- `apps/backend/controllers/audit-checklist-controller.js`
- `apps/backend/controllers/wizard-controller.js`

Why this matters:

- The repo rule is `Route -> Service -> Repository/Prisma`
- These files mix HTTP handling, business rules, and persistence writes in the same module
- Multi-step writes are harder to transaction-wrap, test, and audit

### 2. Frontend API Drift Is Concentrated In Tracking And Trace Screens

Current read-only scan found 10 files with 18 raw `fetch()` calls outside `src/app/api`.

Representative files:

- `apps/web-app/src/app/(public)/verify/[certNumber]/page.tsx`
- `apps/web-app/src/app/health/applications/[id]/preview/page.tsx`
- `apps/web-app/src/app/health/tracking/lots/page.tsx`
- `apps/web-app/src/app/health/tracking/plants/[qr-code]/page.tsx`
- `apps/web-app/src/app/trace/batch/[qr-code]/page.tsx`
- `apps/web-app/src/app/trace/lot/[lot-id]/page.tsx`
- `apps/web-app/src/app/trace/plant/[qr-code]/page.tsx`
- `apps/web-app/src/app/trace/plot-cycle/[qr-code]/page.tsx`
- `apps/web-app/src/app/trace/[qr-code]/page.tsx`

Why this matters:

- Repo rules require API access to flow through `lib/api/apiClient` and client-side services
- These pages are doing data access, retry behavior, and response parsing inline
- The drift is clustered enough to refactor by feature instead of one file at a time

### 3. Duplicate Service Surfaces Need Reclassification

The earlier checklist treated several duplicate filenames as active duplicate implementations. The current repository state is more nuanced.

#### 3.1 Email service is still split across two active implementations

Active files:

- `apps/backend/services/email-service.js`
- `apps/backend/services/email/email-service.js`

Evidence:

- `apps/backend/jobs/sla-processor.js` imports `../services/email-service`
- `apps/backend/services/application-service/application-draft-query-methods.js` imports `../email/email-service`
- `apps/backend/services/application-service/application-review-revision-methods.js` imports `../email/email-service`
- `apps/backend/services/notification-service.js` imports `./email/email-service`

Why this matters:

- The root service exports an instantiated singleton and includes SLA-specific methods such as `sendSLABreachNotification`
- The nested service exports the class and centers on template-based email delivery
- Both are active, which creates divergent entrypoints, inconsistent APIs, and hidden behavior differences

#### 3.2 Notification service has one active core plus one zombie stub

Files:

- Active: `apps/backend/services/notification-service.js`
- Zombie/stub: `apps/backend/services/notification/notification-service.js`

Evidence:

- Current imports point to the root service, not the stub
- The stub exports placeholder async methods returning `{ success: true }`
- The stub is also one of the files flagged by `check:encoding`

Why this matters:

- This is less an active duplicate implementation and more a dead alias that can mislead maintainers
- The presence of both files suggests an incomplete migration

#### 3.3 Cache service is mostly consolidated, but a compatibility wrapper remains

Files:

- Primary: `apps/backend/services/cache-service.js`
- Wrapper: `apps/backend/services/cache/cache-service.js`

Evidence:

- The nested file is a backward-compatibility re-export of the primary service
- Current runtime imports found by scan resolve to the root service

Why this matters:

- This is lower risk than email/notification, but still part of the repo's legacy surface area
- It should eventually be retired once imports are fully canonical

#### 3.4 Ksher payment service still has two different implementations

Files:

- `apps/backend/services/ksher-service.js`
- `apps/backend/services/payment/ksher-service.js`

Evidence:

- `apps/backend/services/payment/index.js` exposes the nested `payment/ksher-service.js`
- No active imports were found for the root `services/ksher-service.js`
- The two files have different method signatures for `createOrder` and different implementation depth

Why this matters:

- The root file appears to be a legacy mock/orphan
- Keeping both files raises the odds of future accidental imports or incompatible test assumptions

### 4. Incomplete Integration Code Still Exists On A Critical Trust Path

`apps/backend/services/lab-connectors/index.js` still contains three base-class methods that throw `Not implemented`:

- `fetchResults`
- `submitSample`
- `getTestStatus`

Why this matters:

- This is in the lab/integration trust surface, not an isolated prototype folder
- The derived connectors are implemented, but the base class is still a runtime trap if a new connector lands without full coverage
- The repo should prefer an explicit feature-gated abstract pattern or validation guard rather than a generic runtime crash

### 5. Encoding Hygiene Is Still A Repo-Wide Operational Risk

`npm run check:encoding` currently fails with 63 UTF-8 BOM files.

Examples from active paths:

- `apps/backend/routes/api/provider/applications.js`
- `apps/backend/services/notification/notification-service.js`
- `apps/web-app/src/lib/services/auth-service.ts`
- `docs/audit-reports/backend-audit-auth.md`

Why this matters:

- This repo includes Thai content and already has a formal encoding gate
- BOM issues increase the risk of mojibake, noisy diffs, and inconsistent tooling behavior
- The current failure count is large enough to justify its own cleanup workstream

### 6. Large File Risk Is Still Concentrated In A Few Hotspots

`npm run audit:vnext` reported:

- 13 files at or above 500 lines
- 85 files in the 400-499 line warning band

Top risk files:

- `apps/web-app/src/app/provider/coordinator/page.tsx` (`672` lines)
- `apps/backend/routes/api/integration/lab-integration.js` (`516` lines)
- `apps/backend/services/invoice-service.js` (`505` lines)
- `apps/backend/constants/document-slots.js` (`504` lines)
- `apps/backend/services/crypto/timestamp-service.js` (`501` lines)
- `apps/web-app/src/lib/services/auth-service.ts` (`499` lines from `check:max-lines`)

Why this matters:

- These files sit near auth, invoice, provider operations, and integration surfaces
- Large files amplify merge risk and hide layering drift inside otherwise successful builds

### 7. Deployment And Release Guidance Is Better Organized Than Before, But Still Wide

Current doc scan found 27 files under:

- `docs/deployment`
- `docs/releases`

Why this matters:

- The docs are no longer scattered only at repo root, which is an improvement
- However, the operational guidance is still broad enough that teams may struggle to identify the canonical entrypoint for preview vs production vs release evidence

## Recommended Execution Order

1. `backend-service` + `workflow-business-rules`
   Move direct Prisma out of the most active workflow routes first, starting with admin applications, core applications, audit, and trace.

2. `frontend-product`
   Consolidate the tracking and trace pages behind `lib/api` + feature services so the same endpoint logic is not repeated page by page.

3. `backend-service`
   Collapse email and notification entrypoints into one canonical module per domain, then delete or quarantine dead stubs and orphan mocks.

4. `integration-trust` + `backend-service`
   Replace `Not implemented` throws in the lab connector base with a safer abstraction contract and explicit registration checks.

5. `qa-release-observability`
   Open a dedicated BOM cleanup workstream and keep `check:encoding` as a release blocker.

6. `platform-infra` + release owners
   Declare a single deployment docs entrypoint and treat the rest as supporting runbooks/templates.

## Suggested Checklist For The Next Fix Sprint

- [ ] Pick 5-10 highest-traffic route files with direct Prisma and extract service boundaries
- [ ] Refactor all tracking/trace raw `fetch()` calls into service modules using `apiClient`
- [ ] Merge to one email entrypoint and one notification entrypoint
- [ ] Remove or archive the root `ksher-service.js` if it is confirmed unused
- [ ] Replace lab connector base `Not implemented` throws with explicit abstract-contract guards
- [ ] Burn down the 63 BOM files in one isolated cleanup PR
- [ ] Publish a deployment/release docs index that defines the canonical runbook for each environment

## Evidence Paths

- `docs/audit-reports/carpet-bomb-audit-baseline-2026-03-30.md`
- `apps/backend/routes/api/admin/applications.js`
- `apps/backend/services/lab-connectors/index.js`
- `apps/backend/services/email-service.js`
- `apps/backend/services/email/email-service.js`
- `apps/backend/services/notification-service.js`
- `apps/backend/services/notification/notification-service.js`
- `apps/backend/services/ksher-service.js`
- `apps/backend/services/payment/ksher-service.js`
- `apps/web-app/src/app/health/tracking/lots/page.tsx`
- `apps/web-app/src/lib/services/provider-api.ts`

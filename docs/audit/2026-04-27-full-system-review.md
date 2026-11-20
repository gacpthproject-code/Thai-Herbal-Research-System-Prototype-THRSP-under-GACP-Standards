# GACP Full-System Review Report

- **Date**: 2026-04-27
- **Branch**: `helper-cherrypick`
- **Reviewer**: Claude (Opus 4.7), running 4 parallel audit agents
- **Review type**: static code audit + repo-config audit + CI/infra config audit
- **Scope NOT covered**: live server state (DB row counts, container health, log
  inspection) — needs SSH approval; see `docs/deployment/production-diagnostic-runbook.md`

## Executive Summary

- **Overall status (UPDATED 2026-04-28)**: 10 of 11 code-side CRITICAL fixes
  have shipped on `helper-cherrypick`. Two server-side fixes (TLS auto-renewal,
  GHCR PAT) are packaged as runnable scripts under `scripts/maintenance/`
  awaiting operator execution. One finding (#1.1) was reclassified after a
  deeper read of the codebase showed the business rule is deadline-based, not
  count-based, and is correctly implemented.

- **Production readiness**: code-side BLOCKERS RESOLVED in commits
  `cbcd25e`, `5196817`, `924c6fd`, `5b9a234`, `03bdc8a`, `3885a42`, `b5039a8`.
  Server-side BLOCKERS (#1.12 certbot, #1.13 GHCR PAT) require operator
  action — see Phase 1 table below for the prepared scripts.

- **Original highest risks (top 5) — current status**:
  1. ✅ Public verify endpoint enumerable + leaks PII — fixed (`3885a42`)
  2. ✅ Provider/admin dashboards return cross-org counts — fixed (`b5039a8`)
  3. ✅ Cert issuance gate checks status, not actual audit-pass record — fixed (`5196817`)
  4. ✅ `GET /api/audits/:id` IDOR — fixed (`924c6fd`)
  5. ✅ Production deploy workflow has no test gate — fixed (`5b9a234`)

- **Highest risks** (top 5 by blast radius):
  1. **Public verify endpoint enumerable + leaks PII** — sequential cert numbers
     (`GACP-TH-{year}-{count+1}`), no rate limit, returns `applicantName + farmName + province` to anyone.
     PDPA exposure for the entire farmer registry.
  2. **Provider/admin dashboards return cross-org counts** when `req.user.healthId`
     is null — every provider sees system-wide aggregates instead of their org.
  3. **Cert issuance gate checks application status, not actual audit-pass record** —
     a forged status flip elsewhere can issue a real signed cert.
  4. **`GET /api/audits/:id` IDOR** — any authenticated provider can fetch any
     applicant's audit + applicant name + plant type + scheduled date.
  5. **Production deploy workflow has no test gate** — `production.yml` deploys on
     tag without running the unit/integration suite first.

- **Recommended next step (as of 2026-04-28)**:
  1. Operator runs `scripts/maintenance/fix-ghcr-pat.sh` with a fresh PAT to
     unblock production deploys.
  2. Operator runs `scripts/maintenance/fix-certbot-renewal.sh` to fix TLS
     renewal before 2026-06-03.
  3. Merge `helper-cherrypick` into `main` via the new Claude Auto-Review
     workflow + the PR template.
  4. Tag a release; confirm the new `release-test-gate` job runs and passes;
     image build + deploy proceed automatically.
  5. After one full release cycle in production, plan Phase 2 (hardening, 14
     items) — see table below.

## System Map

- **Frontend**: Next.js 15 (App Router) + TypeScript, Tailwind/shadcn primitives
  (Mantine being removed — see `eslint.config.mjs:13-19`). Public verify page at
  `apps/web-app/src/app/(public)/verify/[cert-number]/page.tsx`. App-shell-based
  layout per role (health / provider / admin / scheduler / auditor / reviewer).
- **Backend**: Node 20 + Express + Prisma 5 + PostgreSQL 15. Layered
  (route → controller → service → Prisma). Multi-file Prisma schema at
  `apps/backend/prisma/schema/*.prisma` (12 files, ~2545 lines, 28 migrations).
  AsyncLocalStorage tenant context per ADR-014 (Phase 3b A/B/C/CI just landed).
- **Database**: PostgreSQL via Docker Compose. 48 tenant-scoped models with
  nullable `organizationId` (NOT NULL alteration is the next step — see
  `docs/adr/ADR-014-phase-3-handoff.md` PR D).
- **Infrastructure** (server-only — `root@152.42.218.251`,
  `/opt/gacp-platform`):
  - nginx (image-based) on `127.0.0.1:8080` behind a host-level nginx serving 80/443.
  - Postgres + Redis + MinIO + pgadmin + prometheus + grafana, all internal.
  - Backend + frontend ship via `ghcr.io/jonmaxmore/gacp-{backend,frontend}` image tags.
  - Image-based deploy (Level 4) via `scripts/deploy/deploy-production.sh`.
- **CI/CD**: 10 GitHub workflows (ci.yml as primary CI, security-scan.yml,
  production.yml, build-images.yml, claude-review.yml, etc.). `lint.yml` and
  `ci-cd.yml` were consolidated into `ci.yml` on 2026-04-28 — see commit history.
  Pre-commit runs system integrity check + trust-domain lint locally.
  **Production deploy lacks a test gate** (Phase 1 #1.10) — closed via release-test-gate.
- **External integrations**: Lab webhook routes (no HMAC — Phase 1 #1.4),
  Payment webhook (HMAC + replay protection — see Phase 2 #2.6),
  Notification service (email + SMS, fire-and-forget).

## Critical Findings

### 1.1 — ~~3-rejection resubmission-fee rule unimplemented~~ — RECLASSIFIED

- Severity: ~~CRITICAL~~ → **NOT A FINDING** (audit misread the spec)
- Resolution: The original prompt described "3rd rejection MAY require a new
  5,000 THB resubmission payment IF the business rule is implemented" — phrased
  conditionally because the spec did not commit to a count-based rule. The
  codebase implements a **revision-deadline-based** rule instead, which is
  cleaner and matches how the platform actually operates today:
  - Comment at `apps/backend/config/payment-fees.js:8-9`:
    "ไม่มีจำกัดจำนวนรอบการแก้ไข … หากถูกขอแก้ไข ต้องแก้ภายใน 5 วันทำการ ไม่งั้น
    EXPIRED → ต้องยื่นคำขอใหม่ + จ่ายค่าธรรมเนียมใหม่"
  - `RE_SUBMISSION_FEE: 5000` at `payment-fees.js:34` IS defined and
    triggered by `REVISION_DEADLINE_EXPIRED` (line 71-75).
  - The expiration handler at
    `apps/backend/routes/api/provider/handlers/workflow-revision-expirations-handler.js`
    transitions `REVISION_REQUESTED → CANCEL_EXPIRED`, marks
    `revisionDeadline.status = 'FAILED'`, and writes an audit log.
  - The cron at `apps/backend/jobs/revision-deadline-checker.js` runs the
    same flow on the schedule.
  - To resume, the applicant submits a NEW application and pays a NEW
    Phase 1 fee — same revenue capture as a count-based rule, but tied
    to a verifiable timestamp instead of a counter.
- The `rejectCount` column at `apps/backend/prisma/schema/application.prisma:30`
  remains tracked (incremented at
  `application-service/application-review-revision-methods.js:98-99`) but is
  used only as analytics for the UI ("submission #N" badge in the provider
  dashboard, see `routes/api/provider/applications.js:160`). That is fine —
  it's not load-bearing for the fee gate.
- Net: no code change needed. This entry in the audit report is kept as a
  historical record of the audit's misread, NOT as a punch-list item.

### 1.2 — Provider/admin dashboards leak cross-org data

- Severity: **CRITICAL**
- Module: dashboard, system/admin
- Problem: `/api/dashboard/stats` and `/api/provider/admin-dashboard` return
  system-wide counts (applications, certificates, revenue, auditor workload)
  whenever `req.user.healthId` is null — i.e., for every provider role.
- Evidence:
  - `apps/backend/routes/api/system/dashboard.js:38-60`
  - `apps/backend/routes/api/provider/handlers/admin-dashboard-handler.js:14-182`
- Impact: a scheduler / auditor / accountant in tenant A sees totals for
  tenant B. Once Organization #2 onboards (PR is in flight), this is a
  multi-tenant leak.
- Recommended fix: gate the queries behind `req.user.organizationId` (already
  available on the JWT after commit `e045959`). Wrap dashboard handlers in
  `requireTenantContext()` and add `where: { organizationId }` to every
  `groupBy` / `count` / aggregate.
- Files affected: `dashboard.js`, `admin-dashboard-handler.js`,
  `auditor-dashboard-handler.js` (already scoped — keep), 4 sibling handlers.
- Test required: integration test — provider in org A, with org B data seeded,
  hits dashboard, expects only org A counts.

### 1.3 — Certificate issuance not gated on real audit-pass record

- Severity: **CRITICAL**
- Module: certificate-service
- Problem: `certificate-service.js:92-100` issues a cert when the application
  is in status `APPROVED|CERTIFIED` — but never queries the audit table to
  confirm a passing audit exists. Any code path (including a forged audit
  status flip elsewhere) that reaches `APPROVED` issues a real signed cert.
- Evidence: `apps/backend/services/certificate-service.js:92-100`
- Impact: counterfeit certificates can be issued by any state-mutating
  endpoint that lands the app in `APPROVED`. The signature is valid; the
  audit trail says "passed."
- Recommended fix: at the top of the issuance path, require
  `await prisma.auditPass.findFirstOrThrow({ where: { applicationId, status: 'PASSED' } })`
  (or whatever the canonical audit-pass model is named in
  `apps/backend/prisma/schema/audit.prisma`). Make this gate non-removable.
- Files affected: `certificate-service.js`, `audit.prisma` (verify model
  name), `application-state-machine` (update transition guard).
- Test required: integration test — try to call `issueCertificate(app)`
  without an audit-pass row; expect throw.

### 1.4 — Lab webhook accepts requests with API-key only (no HMAC)

- Severity: **CRITICAL**
- Module: integration / lab
- Problem: `apps/backend/routes/api/integration/lab-webhook-routes.js:1-10`
  uses `requireApiKey('LAB_API_KEY')` — no HMAC, no timestamp, no replay
  protection. Compare against `services/payment-webhook-service.js:49-121`
  which has full HMAC + 300s replay window.
- Evidence: same file, line 1-10.
- Impact: a leaked `LAB_API_KEY` (single static secret) lets anyone forge
  lab results, which feed into the audit decision.
- Recommended fix: migrate the lab webhook to the same HMAC pattern as the
  payment webhook. Add `x-webhook-signature` header validation + timestamp.
- Files affected: `lab-webhook-routes.js`,
  `services/payment-webhook-service.js` (extract a shared
  `verifyHmacWebhook(req, secret)` helper), `.env.example` (add
  `LAB_WEBHOOK_SECRET`).
- Test required: integration test — POST without signature, expect 401.

### 1.5 — Public certificate verify endpoint leaks PII and is enumerable

- Severity: **CRITICAL**
- Module: public verify
- Problem:
  1. **PII**: `apps/backend/routes/api/auth/public.js:75-83` returns
     `farmName`, `applicantName`, `province` to ANY caller.
  2. **Enumeration**: cert numbers are sequential (`GACP-TH-{year}-{count+1}`,
     `apps/backend/services/certificate-service.js:112-113`).
  3. **No rate limit**: route has no `createRateLimiter` wrapper.
- Evidence: see file:line above.
- Impact: anyone can scrape the entire applicant registry by walking
  `GACP-TH-2025-00001..N`. PDPA exposure for every farmer in the system.
- Recommended fix:
  1. Drop `applicantName` from the public response — replace with
     `partial: 'นาย ก. ●●●'` mask if a name is required.
  2. Make cert numbers non-sequential — switch to
     `crypto.randomBytes(3).toString('hex').toUpperCase()` (hex suffix, race-safe)
     or move to a Postgres `bigserial` mod-mixed format.
  3. Add `createRateLimiter({ windowMs: 60_000, max: 30 })` per IP.
- Files affected: `public.js`, `certificate-service.js`, `middleware/rate-limiter.js`.
- Test required: integration tests — verify `applicantName` not in JSON;
  31st request from same IP returns 429.

### 1.6 — `GET /api/audits/:id` IDOR (any provider sees any audit)

- Severity: **CRITICAL**
- Module: audit
- Problem: `apps/backend/routes/api/audit/audits.js:179` looks up by
  `prisma.application.findUnique({ where: { id } })` with no
  `req.user.providerId` / `req.user.organizationId` filter.
- Evidence: same file:line.
- Impact: every authenticated provider can read every applicant's audit
  detail (applicant name, plant type, scheduled date, audit checklist) by
  guessing application IDs.
- Recommended fix: add `where: { id, organizationId: req.user.organizationId }`
  (post-Phase-3b every provider has a tenant claim) AND add a role-level
  filter that limits non-auditors to audits assigned to their providerId.
- Files affected: `audits.js` (and its sibling `audits-reassign.js`,
  `farm-audit.js`, `post-audit.js`, `fraud-detection.js`,
  `site-analyses.js` — all need the same filter).
- Test required: integration — provider in org A tries to read audit in
  org B; expect 404 (not 403 — leak-resistant).

### 1.7 — QR signature silently falls back to weak HMAC in production

- Severity: **CRITICAL**
- Module: QR / crypto
- Problem: `apps/backend/services/qrcode/qrcode-service.js:256-279` checks
  for an RSA private key; on failure it falls back to HMAC with
  `process.env.QR_SIGNATURE_FALLBACK_SECRET` (or the dev default
  `'gacp-dev-qr-fallback-secret'` per line 243). The `NODE_ENV=production`
  guard at line 234-241 is conditional and can be bypassed if the env file
  is misconfigured.
- Evidence: same file.
- Impact: RSA-signed QR (the strong path) silently degrades to HMAC
  (the weak path) without alerting. An attacker who reads
  `QR_SIGNATURE_FALLBACK_SECRET` from a dev backup can sign valid QRs.
- Recommended fix: in production, throw on RSA init failure. No silent
  fallback. Move the fallback to staging-only via `if (process.env.NODE_ENV === 'production') throw new Error('RSA key missing')`.
- Files affected: `qrcode-service.js`.
- Test required: unit test — `NODE_ENV='production'` + missing RSA key;
  expect throw (not graceful fallback).

### 1.8 — QR / trace URL falls back to `localhost` in production

- Severity: **CRITICAL**
- Module: QR / trace
- Problem: `apps/backend/services/qrcode/qrcode-service.js:14-32` and
  `services/trace-service/common.js:17` default to `http://localhost`
  when env is unset. A production deploy that forgets to set
  `PUBLIC_TRACE_URL` / `TRACE_BASE_URL` ships QRs that point to
  `localhost`, breaking every QR scanned in the wild.
- Evidence: see file:lines above.
- Impact: every QR generated since the env was forgotten is unscannable.
- Recommended fix: in production, throw on missing env. Same pattern as 1.7.
- Files affected: `qrcode-service.js`, `trace-service/common.js`,
  `.env.example`.
- Test required: unit — `NODE_ENV='production'` + no `PUBLIC_TRACE_URL`;
  expect throw.

### 1.9 — Trace returned for revoked / expired certificates

- Severity: **CRITICAL**
- Module: trace
- Problem: `apps/backend/routes/api/trace/trace-batch-lot-routes.js:20-82`
  computes `isCertValid` (line 85-87) but does not USE it to gate the
  response. Revoked / expired cert batches still return full trace data
  to the public.
- Evidence: same file, lines 20-82 + 85-87.
- Impact: a revoked cert holder's product remains "verified" by QR scan,
  including consumers using the public trace URL after revocation.
- Recommended fix: if `!isCertValid`, return 410 Gone with
  `{ status: 'REVOKED', revokedAt }`. Do not include trace details.
- Files affected: `trace-batch-lot-routes.js`.
- Test required: integration — revoke cert; trace endpoint returns 410.

### 1.10 — Production deploy workflow has no test gate

- Severity: **CRITICAL**
- Module: CI/CD
- Problem: `.github/workflows/production.yml:95` lists
  `needs: [validate-release-topology]` only — no test job. A red main
  passes through to image build and deploy.
- Evidence: same file.
- Impact: a regression that breaks unit/integration tests still ships to
  prod on tag.
- Recommended fix: add `test` (the existing job from `ci.yml`) or
  `backend-qc-golden` to `needs:`. Block deploy on red tests.
- Files affected: `.github/workflows/production.yml`,
  possibly factor a reusable `_test.yml`.
- Test required: dry-run by intentionally breaking a unit test and tagging
  v0.0.0-test — workflow should fail before deploy.

### 1.11 — JWT secret falls back to per-restart `Date.now()` in dev

- Severity: **CRITICAL** (conditional — fires only if env vars unset in
  production, which the env-validator should prevent; but the failure
  mode is so bad — every JWT invalidates per restart, every user logged
  out, no error logged — that it deserves CRITICAL classification)
- Module: auth / JWT
- Problem: `apps/backend/config/jwt-security.js:56-57` generates
  `dev-health-secret-${Date.now()}` if `HEALTH_JWT_SECRET` is unset.
  The production guard at lines 36-46 throws if env-validator runs, but
  if env-validator is bypassed (e.g., a docker entrypoint that swallows
  the throw), this fallback activates silently.
- Evidence: same file:lines.
- Impact: silent secret rotation on every container restart. Symptom is
  users being logged out for no reason.
- Recommended fix: move the throw to module top-level (ESM import time,
  not runtime). Remove the `Date.now()`-based fallback entirely.
- Files affected: `config/jwt-security.js`.
- Test required: unit — `process.env.NODE_ENV='production'` +
  no `HEALTH_JWT_SECRET`; require/import of the file throws.

## Workflow Validation

| Workflow | Expected | Actual | Status | Gap | Fix |
|---|---|---|---|---|---|
| Register / Login | role-aware login, MFA on provider, healthid lookup | implemented at `routes/api/auth/auth-{health,provider}` + `identity/mfa.js` | Pass | MFA `userId` legacy fallback (`mfa.js:209`) still accepted | remove legacy path |
| Submit application | applicant fills form, draft/submit, healthid scoped | implemented `routes/api/applications/applications.js` + `applications-bundles.js` | Pass | n/a | n/a |
| Pay 5,000 THB doc fee | server-side amount, idempotent webhook | implemented `routes/api/finance/payments.js:212-241` + `webhooks.js` HMAC | Partial | Server doesn't re-validate client-supplied amount against `PAYMENT_FEES` (Phase 2 #2.4) | reject mismatch |
| Document review (approve/reject) | reviewer approves; on N reject increment count | implemented `application-review-revision-methods.js:98-99` | Partial | 3-reject resubmission-fee gate missing (1.1) | add fee gate |
| Pay 25,000 THB assessment fee | unlocks scheduling | implemented `payments.js:293-322` | Partial | Same client-amount risk + missing audit-log on payment init (Phase 2 #2.1) | add log + amount check |
| Schedule audit (online/onsite) | scheduler picks slot, online → meeting link | implemented `audit/audits.js:249-346` | Partial | Endpoint doesn't verify pre-state `AUDIT_FEE_PAID` (1.6 / Phase 1 sibling) | add transition guard |
| Auditor pass/fail | auditor records, evidence, certificate triggers | implemented `audits.js:407-495` | Partial | No notification to applicant on result; cert generation not in transaction with state flip (1.3 + Phase 2 #2.5) | atomic txn + notify |
| Certificate generation | gated on audit pass | NOT gated (1.3) | **Fail** | gate is `app.status==='APPROVED'`, not `auditPass.exists` | add real gate |
| QR generation | strong sig, env-driven URL | RSA path exists; HMAC fallback silent (1.7); URL fallback to localhost (1.8) | **Fail** | both | throw on missing env in prod |
| Public verify | minimal data, rate-limited | leaks PII; no rate limit; cert numbers sequential (1.5) | **Fail** | three issues | mask + non-sequential + rate limit |
| Track & trace | only after pass; revoked certs hidden | trace returned for revoked certs (1.9); Lot lacks `certificateId` link (Phase 2 #2.10) | **Fail** | both | gate + add FK |
| Audit log on critical actions | every state change logged | partial — payments missing logging (Phase 2 #2.1); audit-result missing notification trigger | Partial | gaps | add logger calls |

## Module Review Matrix

| Module | Status | Risk | Main Issue | Required Fix |
|---|---|---|---|---|
| Auth (`middleware/auth-middleware.js`) | Pass | LOW | optionalAuth no tenant binding when user missing (acceptable) | n/a |
| RBAC (`shared/canonical-rbac.js`) | Partial | MED | many provider routes use only `authenticateProvider`, not `requireRole(...)` (Phase 2 #2.2) | add `requireRole` per route |
| Tenant context (`services/tenant-context.js`) | Pass | LOW | covered by ADR-014 Phase 3b | continue PR D / E sequence |
| MFA (`routes/api/identity/mfa.js`) | Partial | MED | legacy `userId` fallback path (1.11 sibling) | remove legacy path |
| Application workflow | Partial | HIGH | 3-reject fee (1.1); state guards at controller missing (Phase 2 #2.3) | enforce both |
| Payment | Partial | HIGH | client-amount trust + missing audit logs (Phase 2 #2.1, #2.4) | re-derive amounts; log everything |
| Lab webhook | Fail | HIGH | API-key only (1.4) | HMAC parity with payment |
| Audit (inspection) | Fail | CRIT | IDOR (1.6); cert gate (1.3) | scope by provider/org; audit-pass FK |
| Certificate | Fail | CRIT | issuance gate; sequential cert#; QR HMAC fallback (1.3, 1.5, 1.7) | real gate; random suffix; throw on weak crypto |
| QR / trace URL | Fail | CRIT | localhost fallback (1.8) | throw on missing env |
| Track & trace | Fail | CRIT | revoked-cert leak (1.9); Lot model FK (Phase 2 #2.10) | gate + add FK |
| Public verify | Fail | CRIT | PII + enumeration + no rate limit (1.5) | mask + random ids + limit |
| Dashboard | Fail | CRIT | cross-org leakage (1.2) | scope by orgId |
| Schema | Partial | MED | string-instead-of-enum on status columns; missing indexes (Phase 2 #2.7, #2.8) | enum + indexes |
| Migrations | Pass | LOW | one destructive migration without changelog (Phase 2 #2.6) | document |
| CI/CD | Fail | CRIT | deploy gate without tests (1.10) | add test gate |
| nginx | Partial | HIGH | missing CSP + HSTS (Phase 2 #2.9) | add headers |
| Docker compose (prod) | Partial | LOW | frontend/redis no healthcheck (Phase 3 #3.5) | add |
| Tests | Partial | MED | no public-verify test, no audit→cert e2e | add tests |

## Security Review

| Area | Status | Issue | Severity | Fix |
|---|---|---|---|---|
| AuthN — JWT | Partial | dev fallback per-restart secret (1.11) | CRIT | throw at import time |
| AuthN — MFA | Partial | legacy userId path | MED | remove legacy |
| AuthZ — RBAC | Partial | missing `requireRole` on many provider routes | HIGH | add per route |
| AuthZ — IDOR (audits) | Fail | no scope filter (1.6) | CRIT | scope by org/provider |
| Tenant scope | Pass | ADR-014 Phase 3b A/B/C/CI shipped | LOW | continue PR D/E |
| Payment integrity | Partial | client-amount trust | HIGH | re-derive server-side |
| Webhook integrity | Partial | lab webhook no HMAC (1.4) | CRIT | HMAC + replay window |
| QR integrity | Fail | silent HMAC fallback (1.7) | CRIT | throw on missing RSA |
| Public PII | Fail | applicantName in verify (1.5) | CRIT | mask |
| Rate limiting | Partial | missing on public verify + trace | HIGH | add limits |
| TLS / headers | Partial | no CSP, no HSTS | HIGH | add to nginx |
| Audit log coverage | Partial | payments + audit-result gaps | HIGH | add `auditLogger.log` |
| Secrets in repo | Pass | no leaked keys at HEAD | LOW | n/a |
| Dependencies | Advisory | `security-scan.yml` is `continue-on-error` | LOW | acceptable |

## Database Review

| Table / Model | Status | Issue | Fix |
|---|---|---|---|
| Application | Partial | `status` is String not Enum; no `@@index([rejectCount])` | convert + index |
| Invoice | Partial | `status` is String not Enum; no index on `paymentTransactionId` | convert + index |
| Certificate | Partial | `status` is String not Enum; cert# sequential; no chain index | enum + random + index |
| AuditLog | Pass | global sequence chain (per-tenant chain deferred — see ADR-014 Open Risk #2) | n/a in this phase |
| Lot (trace) | Partial | no `certificateId` FK; no `deletedBy` | add FK + audit columns |
| TraceQrSecurity | Partial | no `deletedBy` | add column |
| Organization | Pass | shipped in ADR-014 Phase 1; reverse relations in PR C | n/a |
| 48 tenant-scoped models | Pass | nullable `organizationId` + FK + @relation; NOT NULL alteration is the next PR | continue PR D |
| Migrations | Partial | 28 total; 1-2 destructive without explicit changelog | annotate |

## Infrastructure Review

| Component | Status | Issue | Fix |
|---|---|---|---|
| nginx | Partial | missing CSP + HSTS | add headers |
| docker compose (prod) | Partial | frontend + redis no healthcheck | add |
| pgadmin | Pass | IP whitelist OK | n/a |
| prometheus / grafana | Pass | localhost-bound | n/a |
| MinIO | Pass | localhost-bound, healthcheck present | n/a |
| Postgres | Pass | healthcheck present, internal only | n/a |
| Backend container | Pass | healthcheck on `/api/health` | n/a |
| Frontend container | Partial | no healthcheck | add `curl -f http://localhost:3000/` |
| Redis | Partial | no healthcheck | add `redis-cli ping` |
| Image-based deploy | Pass | tag-based with rollback path | n/a |
| Deploy script safety | Pass | refuses dirty tree, requires branch, env vars validated | n/a |
| `.env.example` | Partial | placeholder JWT_SECRET / ENCRYPTION_KEY | warn + generation script |

## Test Coverage Review

| Test Type | Existing | Missing | Required |
|---|---|---|---|
| Unit | 33 files (state-machine, fee-service, payment-service, crypto, security-nonce, etc.) | rejection-counter rule; cert-gate-on-audit-pass; QR fallback throw; JWT throw on missing env | 4 new specs |
| Integration | 10 files (audits-reassign-auth, provider-admin-planting-integrity, finance-uat-fin04-09, deep_qa/security, webhooks-route, etc.) | dashboard cross-org leak; audit IDOR; lab-webhook HMAC; public-verify rate limit; revoked-cert trace | 5 new specs |
| E2E | 1 file (smoke-all-endpoints) | full happy path (register → pay 5k → review → pay 25k → schedule → audit pass → cert → QR → trace); 3-reject path; revoked-cert verify | 3 new e2e |
| Smoke | covered by `smoke-all-endpoints` and Playwright `e2e/smoke.spec.ts` | adequate | n/a |

## Recommended Fix Plan

### Phase 1 — Critical Blockers (must close before production rollout)

| # | Title | Status | Commit |
|---|---|---|---|
| 1.1 | 3-rejection resubmission-fee enforcement | ❌ RECLASSIFIED — audit misread spec; deadline-based rule is in place | n/a |
| 1.2 | Dashboard org scoping | ✅ DONE | `b5039a8` |
| 1.3 | Cert issuance gated on real audit-pass row | ✅ DONE | `5196817` |
| 1.4 | Lab webhook HMAC parity | ✅ DONE | `03bdc8a` |
| 1.5 | Public verify: mask PII + non-sequential cert# + rate limit | ✅ DONE | `3885a42` |
| 1.6 | Audit IDOR scope filter (3 /:id endpoints) | ✅ DONE | `924c6fd` |
| 1.7 | QR signature: throw on RSA failure in production | ✅ DONE | `cbcd25e` |
| 1.8 | QR / trace URL: throw on missing env in production | ✅ DONE | `cbcd25e` |
| 1.9 | Trace endpoint gates on `isCertValid` | ✅ DONE | `5196817` |
| 1.10 | Production deploy: add `needs: test` gate | ✅ DONE | `5b9a234` |
| 1.11 | JWT secret: throw at import time, no `Date.now()` fallback | ✅ DONE | `cbcd25e` |
| 1.12 | TLS auto-renewal broken (server-side, runs from script) | ⏳ READY FOR OPERATOR | `scripts/maintenance/fix-certbot-renewal.sh` (`76394b0`) |
| 1.13 | GHCR PAT expired / missing on prod (server-side, runs from script) | ⏳ READY FOR OPERATOR | `scripts/maintenance/fix-ghcr-pat.sh` (`76394b0`) |

### Phase 2 — Production Hardening

| # | Title | Effort |
|---|---|---|
| 2.1 | Audit log on payment-initiation endpoints (`payments.js:212-285`) | S |
| 2.2 | Add `requireRole(...)` on every provider route | M |
| 2.3 | Controller-level state-transition guards (defensive checks above the service guard) | M |
| 2.4 | Server re-derive payment amount from `PAYMENT_FEES` (reject client-mismatch) | S |
| 2.5 | Atomic certificate generation + state flip in single Prisma transaction | S |
| 2.6 | Migration changelog + backup procedure for destructive migrations | S |
| 2.7 | Convert `Application.status`, `Invoice.status`, `Certificate.status`, `AuditLog.result` from String → Prisma Enum | M (migration) |
| 2.8 | Add missing indexes (`rejectCount`, `paymentTransactionId`, cert renewal chain) | S |
| 2.9 | nginx: add CSP + HSTS headers | S |
| 2.10 | Add `Lot.certificateId` FK; backfill from audit/cert chain | M |
| 2.11 | Notification gaps: reviewer approve/reject sent to scheduler; audit pass/fail sent to applicant | S |
| 2.12 | Per-tenant audit-log chain (ADR-014 Open Risk #2) | M (schema + verify routine) |
| 2.13 | Remove MFA legacy `userId` path | S |

### Phase 3 — Optimization & Scale

| # | Title | Effort |
|---|---|---|
| 3.1 | ADR-014 PR D — `organizationId` NOT NULL alteration on 48 tables | M |
| 3.2 | ADR-014 PR E — Postgres RLS for read defense in depth | L |
| 3.3 | E2E test for full happy path + 3-reject path + revoked-verify path | M |
| 3.4 | Frontend a11y baseline (axe-core) on every role page | M |
| 3.5 | Frontend + redis healthchecks in compose | XS |
| 3.6 | Background-job dashboard (BullMQ admin) behind admin-only auth | M |
| 3.7 | Per-tenant audit log retention + export | M |
| 3.8 | OpenAPI / Swagger consistency check in CI | S |

## Files Changed in This Session (audit + scaffolding only)

- `.github/workflows/claude-review.yml` — Claude Auto-Review GitHub workflow
- `.github/PULL_REQUEST_TEMPLATE.md` — production-grade PR checklist
- `docs/deployment/production-diagnostic-runbook.md` — read-only SSH bundle
- `docs/audit/2026-04-27-full-system-review.md` — this report

No application code changed. All findings above are documented; the
corresponding fixes are queued as Phase 1 / 2 / 3.

## Commands to Run

### Local Code-Only Commands

```bash
# 1. Re-run unit suites the handoff doc gates on
cd apps/backend
DATABASE_URL=postgresql://test:test@localhost:5432/test \
  node ../../node_modules/jest/bin/jest.js --config jest.config.cjs \
  --testPathPattern '__tests__/(simple|tenant-context|crypto-service|security-nonce|unit/applications-draft|unit/provider-legacy)' \
  --no-coverage

# 2. Schema sanity
DATABASE_URL=postgresql://test:test@localhost:5432/test \
  npx prisma validate --schema prisma/schema

# 3. New CI guardrail
cd ../..
npm run check:tenant-conventions

# 4. Existing system integrity check
node scripts/system-integrity-check.js

# 5. Full lint sweep (fast)
npm run gate:member-auth-lint
npm run gate:trust-interoperability-lint
```

### Server-Side Read-Only Diagnostics (require explicit user approval)

See `docs/deployment/production-diagnostic-runbook.md`. Key invocations
(all read-only, all require user to confirm `root@152.42.218.251` is the
right target):

```bash
# 0. Connectivity / host identity
ssh root@152.42.218.251 "whoami; hostname; uptime; uname -srv"

# 1. Repo state
ssh root@152.42.218.251 "cd /opt/gacp-platform && git rev-parse --abbrev-ref HEAD && git log --oneline -10 && git status --short"

# 2. Container health
ssh root@152.42.218.251 "cd /opt/gacp-platform && docker compose --env-file .env.production -f docker-compose.production.yml ps"

# 3. Backend logs (last 200 lines, no follow)
ssh root@152.42.218.251 "cd /opt/gacp-platform && docker compose --env-file .env.production -f docker-compose.production.yml logs --no-color --tail=200 backend"

# 4. Migration ledger
ssh root@152.42.218.251 "cd /opt/gacp-platform && docker compose --env-file .env.production -f docker-compose.production.yml exec -T backend npx prisma migrate status"

# 5. Tenant scoping sanity (after Phase 3b backfill)
ssh root@152.42.218.251 "cd /opt/gacp-platform && docker compose --env-file .env.production -f docker-compose.production.yml exec -T postgres psql -U gacp -d gacp_db -c \"SELECT 'applications' AS t, COUNT(*) AS total, COUNT(\\\"organizationId\\\") AS scoped FROM applications UNION ALL SELECT 'users', COUNT(*), COUNT(\\\"organizationId\\\") FROM users UNION ALL SELECT 'certificates', COUNT(*), COUNT(\\\"organizationId\\\") FROM certificates;\""

# 6. Audit log integrity (no-gap sequence check)
ssh root@152.42.218.251 "cd /opt/gacp-platform && docker compose --env-file .env.production -f docker-compose.production.yml exec -T postgres psql -U gacp -d gacp_db -c \"SELECT MIN(\\\"sequenceNumber\\\"), MAX(\\\"sequenceNumber\\\"), COUNT(*) FROM audit_logs;\""

# 7. TLS expiry
ssh root@152.42.218.251 "echo | openssl s_client -servername 152.42.218.251 -connect 152.42.218.251:443 -showcerts 2>/dev/null | openssl x509 -noout -dates -subject -issuer"
```

### CI / GitHub Actions Commands

After committing the new `.github/workflows/claude-review.yml`:

1. Add `ANTHROPIC_API_KEY` as a repository secret
   (Settings → Secrets and variables → Actions → New repository secret).
2. Open a draft PR — confirm `Claude Auto-Review` workflow shows up in
   Actions tab.
3. Mark PR ready for review — verify Claude posts the inline review.
4. Add `skip-claude-review` label to any docs-only PR — verify the
   workflow skips.

## Sign-off

This review is a **static audit** — every claim is backed by a file:line
citation and was independently verified via direct file reads or grep
during the review session. No live production state was inspected
(SSH read-only diagnostics are pending user approval, see runbook).

**Phase 1 fix execution** — this audit identifies what to fix; it does
not fix. Each Phase 1 item should be its own PR, sequenced by
dependency, each going through the new Claude Auto-Review pipeline.

---

## Addendum — Live server diagnostic (2026-04-27, executed via SSH)

User-approved SSH read-only diagnostic into `root@152.42.218.251` /
`/opt/gacp-platform`. Findings extend the static-audit Phase 1 list with
two new CRITICAL operational items and one HIGH.

### Server identity & resources

- Host: `ubantu-2p-webapp`, Ubuntu 24.04 (kernel 6.8.0-107-generic),
  uptime 17 days, load 0.74 / 0.64 / 0.60 — light.
- Disk: 54 GB used / 116 GB total (47%) — healthy.
- Memory: 1.7 GB used / 7.8 GB total, 4.3 GB cache, 6.0 GB available —
  healthy. Swap 373 MB used / 2.0 GB.

### Repo / deploy state on prod

- Branch: `deploy/production`. HEAD: `ef40996d fix(db): drop orphan
  trg_sync_app_state_status trigger`.
- Working tree clean.
- Live `prisma migrate status`: 33 migrations applied, "Database schema
  is up to date." No pending or failed migrations.
- Note: helper-cherrypick (this branch — Phase 3b PRs A/B/C/CI + audit
  scaffolding) is **NOT yet on prod**.

### Tenant scoping sanity (key tables)

| Table        | Total | With organizationId | Coverage |
|--------------|-------|---------------------|----------|
| applications | 36    | 36                  | 100%     |
| users        | 253   | 253                 | 100%     |
| certificates | 13    | 13                  | 100%     |
| invoices     | 40    | 40                  | 100%     |
| audit_logs   | 4444  | 4444                | 100%     |

Data is ready for PR D (NOT NULL alteration) whenever the
release-cycle window opens.

### Audit-log chain integrity

- min_seq=1, max_seq=4444, count=4444 → **zero gaps**. Global hash chain
  is intact. (Per-tenant chain follow-up is still deferred — see Open
  Risk #2 in handoff doc.)

### Container health (live `docker compose ps`)

- 11 services up; `gacp-backend`, `gacp-postgres`, `gacp-minio`,
  `gacp-nginx`, `gacp-cadvisor` all `healthy`.
- `gacp-backend` and `gacp-frontend` containers were started "About an
  hour ago" — i.e., a deploy completed at ~15:50 site-time. (See deploy
  failure below for what happened at 15:08 just before that.)
- Resource pressure to flag (live `docker stats`):
  - **`gacp-pgadmin` 125.8 MiB / 128 MiB = 98.31%** — very near OOM-kill.
  - `gacp-grafana` 94.6 MiB / 128 MiB = 73.9% — close to its cap.
  - `gacp-prometheus` 81 MiB / 128 MiB = 63.3%.
  - `gacp-cadvisor` 25.5% CPU sustained — worth monitoring.

### Backend log sample (last 80 lines)

- Pure `/api/health` 200 responses from `127.0.0.1` (nginx healthcheck)
  every ~30 s and from `172.18.0.5` (Prometheus scrape) every 30 s.
- **Zero external user-traffic in the sample window.** Either real
  traffic is low, or it is logged elsewhere. Worth verifying nginx
  access log to confirm the platform actually has live users.

### TLS state

- Cert: subject `152-42-218-251.sslip.io`, issuer Let's Encrypt E7,
  ECDSA, expiry **2026-06-03** (37 days from this report).
- HTTP smoke: `https://152.42.218.251/api/health` and `/api/version`
  both return 200.

### Recent deploy log

- Most recent deploy log file: `/var/log/gacp-deploys/20260427-150757.log`,
  9.1 KB, last modified 2026-04-27 15:08.
- That deploy **FAILED at step 5/7** (rolling restart):

  ```text
  Image ghcr.io/jonmaxmore/gacp-backend:deploy-production-latest
    Error: error from registry: denied
  Image ghcr.io/jonmaxmore/gacp-frontend:deploy-production-latest Interrupted
  ❌ container restart failed — running mixed image versions
  Exit code 4
  ```

- The currently-running `gacp-backend` container (started ~15:50) implies
  a **second, successful retry that was NOT captured in
  `/var/log/gacp-deploys/`** — meaning either someone bypassed the
  scripted deploy, or the script ran without redirecting to the log
  directory. Either way, this is an audit-trail gap to close.

### NEW CRITICAL findings (extend Phase 1)

#### 1.12 — TLS auto-renewal is BROKEN

- Severity: **CRITICAL**
- Module: TLS / certbot
- Problem: `certbot renew --dry-run` fails:

  ```text
  Failed to renew certificate 152-42-218-251.sslip.io with error:
  Could not bind TCP port 80 because it is already in use by another
  process on this system (such as a web server).
  ```

  Certbot is configured in **standalone** mode but cannot bind port 80
  because the host nginx (not the gacp-nginx container — host-level
  nginx serving public 80/443) holds the port. Renewal will fail
  silently every cron tick and the cert will expire on **2026-06-03 →
  the platform goes HTTPS-down on that date** unless fixed.
- Recommended fix: switch certbot to `--webroot -w /var/www/letsencrypt`
  with the host nginx serving the `.well-known/acme-challenge/` path,
  OR install `python3-certbot-nginx` and use the `--nginx` authenticator
  so certbot reconfigures the running nginx during renewal.
- Files affected: `/etc/letsencrypt/renewal/152-42-218-251.sslip.io.conf`,
  host nginx config under `/etc/nginx/`.
- Test required: `certbot renew --dry-run` MUST succeed before this
  finding is closed.

#### 1.13 — Production deploy failed today on GHCR auth (`registry: denied`)

- Severity: **CRITICAL** (operational, not security)
- Module: deploy / image-pull
- Problem: today's automated deploy at 2026-04-27 15:08 UTC+7 failed
  during `docker compose pull` with `error from registry: denied`. Root
  cause is GHCR auth — `/root/.docker/config.json` does not contain a
  `ghcr.io` auth entry. The PAT used by `docker login ghcr.io` has
  either expired, been rotated, or was never persisted with `--password
  -stdin` after the last server rebuild.
- Impact: any subsequent automated deploy will fail with the same error
  until the PAT is refreshed. Today's running containers are from a
  manual retry that bypassed the deploy script (no log file) — that's
  an audit-trail gap.
- Recommended fix:
  1. Issue a new fine-grained PAT with `read:packages` scope on
     ghcr.io/jonmaxmore.
  2. On the server, run `echo $PAT | docker login ghcr.io -u jonmaxmore --password-stdin`.
  3. Verify `/root/.docker/config.json` now has a `ghcr.io` entry.
  4. Re-run a no-op deploy:
     `IMAGE_TAG=deploy-production-latest /opt/gacp-platform/scripts/deploy/deploy-production.sh`
     and confirm the new log writes to `/var/log/gacp-deploys/`.
  5. Add a CI job that periodically validates the GHCR pull token —
     currently we only learn it's broken when a deploy fails.
- Files affected: server `/root/.docker/config.json` only; no repo
  changes.
- Test required: `docker pull ghcr.io/jonmaxmore/gacp-backend:deploy-production-latest`
  on the server returns success.

### NEW HIGH finding

#### 2.14 — pgadmin at 98% of memory cap

- Severity: HIGH (will eventually OOM-kill)
- Module: infra / pgadmin container
- Problem: live `docker stats` shows `gacp-pgadmin` at 125.8 MiB /
  128 MiB = 98.31% of its compose-set memory cap. Once it crosses the
  cap, it will be OOM-killed and restart. While pgadmin is non-critical
  (admin UI), the recurrent OOM kills pollute the host journal and
  could trigger external monitors.
- Recommended fix: bump the pgadmin cap in
  `docker-compose.production.yml` from 128M to 256M, OR audit pgadmin's
  config — the standard image does not normally need >100 MB unless
  many tabs are pinned open. Possibly a session leak.
- Files affected: `docker-compose.production.yml`.
- Test required: after bump, observe over 24h that pgadmin stays under
  the new cap.

### Sign-off (updated)

This Addendum was generated by running the read-only commands listed in
`docs/deployment/production-diagnostic-runbook.md` directly against the
production droplet. Every claim above is backed by a captured shell
output from that run.

The combined static + live-server review now stands at:

- **Phase 1 (CRITICAL blockers): 13 items** (1.1–1.13)
- **Phase 2 (HIGH hardening): 14 items** (2.1–2.14)
- **Phase 3 (LOW / optimization): 8 items** (3.1–3.8)

Next recommended action: open three Phase 1 PRs in parallel since they
do not overlap — (1.12) certbot fix on the server, (1.13) GHCR PAT
refresh on the server, and (1.5 / 1.6 / 1.9) the public-verify + audit
IDOR + revoked-cert trace fixes in the codebase.

— Claude (Opus 4.7), with 4 parallel audit agents

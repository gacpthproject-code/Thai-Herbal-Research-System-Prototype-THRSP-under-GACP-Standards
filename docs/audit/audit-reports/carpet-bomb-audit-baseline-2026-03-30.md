# Carpet-Bomb Audit Baseline

Date: 2026-03-30

## Scope

This sweep covered:

- repo-level control-plane verification
- static multi-agent code review
- selected CI and architecture checks that can run safely from this environment

This sweep did not run the dynamic carpet-bomb runtime suite against a live target.

Reason:

- `node scripts/test/run-all-agents.js` defaults to `https://gacpth.com`
- the suite performs authenticated and stateful actions
- no explicit safe `BASE_URL` was approved for this run

## Control-Plane Fixes Applied During The Sweep

- Repointed root `package.json` script aliases to `scripts/ci`, `scripts/test`, and `scripts/tools`
- Fixed moved CI scripts that still resolved the repo root as `scripts/`
- Fixed the encoding checker import after `encoding-mojibake-utils.js` moved under `scripts/tools`
- Fixed `scripts/tools/vnext-audit.js` so it scans the whole repo, not only `scripts/`
- Realigned infra scorecard and network diagram paths used by infra contract checks

## Commands Run

| Command | Result | Notes |
| --- | --- | --- |
| `node scripts/review/run-all-review-agents.js` | PASS with findings | 6,327 findings total, 3,571 warnings, 0 critical |
| `npm run check:max-lines` | PASS | delta check clean for this change |
| `npm run check:encoding` | FAIL | 63 UTF-8 BOM files still present across backend, web, docs, and scripts |
| `npm run check:security-conventions` | FAIL | direct `req.ip` usage and `Math.random()` found in runtime backend code |
| `npm run audit:vnext` | PASS | 12 files >= 500 lines, 86 files in 400-499 range, 25 frontend `any` occurrences |
| `npm run check:orphan-routes` | PASS | route mount map is consistent after root-path fix |
| `npm run check:provider-api-surface` | FAIL | legacy provider API usage still exists in `apps/web-app/src/lib/services/provider-api.ts:12` |
| `npm run check:infra-contracts` | PASS | infra contract set is internally consistent after path and topology fixes |
| `npm run check:production-topology` | PASS | compose and nginx topology align with docs |
| `npm run check:ux-ui-baseline` | PASS | baseline UI a11y checks passed |
| `npm run score:provider-evaluation` | PASS | AWS 95.3%, GCP 94.4%, Azure 87.1%, DigitalOcean 66.5% |
| `node scripts/ci/production-readiness-check.js` | WARN | readiness score 90%, blocked by missing local Jest runtime and legacy provider API surface usage |
| `npm run typecheck:web` | BLOCKED | local `tsc` was not resolvable in this environment |
| `npm run build` | BLOCKED | backend `prisma` executable was not available in this environment |
| `npm run test -- --runInBand` | BLOCKED | backend local `jest` binary was not available in this environment |

## Static Review Baseline

The 10-agent static suite reported 0 critical issues, but that score is misleading because the warning volume is still high.

High-signal totals:

- Code quality: 2,336 findings
- Logic and flow: 2,830 findings
- API endpoints: 481 findings
- System design: 107 findings
- Frontend: 278 findings
- Backend: 28 findings
- Database: 76 findings
- Duplicate or zombie files: 51 findings
- Lint and debug: 74 findings
- Sitemap and flow: 66 findings

## High-Signal Findings

### 1. Layering drift is still widespread

- Controllers still touch Prisma directly in multiple places such as `apps/backend/controllers/auth-controller.js`, `apps/backend/controllers/audit-checklist-controller.js`, and `apps/backend/controllers/wizard-controller.js`
- Many route files still contain inline business logic, including `apps/backend/routes/api/applications/applications.js`, `apps/backend/routes/api/cultivation/plant-units.js`, `apps/backend/routes/api/finance/invoice-payment-handlers.js`, and `apps/backend/routes/api/provider/handlers/planting.js`

### 2. Multi-write backend flows are missing transaction boundaries

Examples flagged by the backend review:

- `apps/backend/services/application-service/application-payment-finalization-methods.js`
- `apps/backend/services/application-service/application-review-revision-methods.js`
- `apps/backend/services/auth/password-management.js`
- `apps/backend/services/certificate-service.js`
- `apps/backend/services/prisma-auth-service.js`

### 3. Security conventions still fail on active backend code

- Direct `req.ip` usage remains in `apps/backend/middleware/api-key-auth.js`, `apps/backend/middleware/sanitize-input.js`, and `apps/backend/routes/api/system/webhooks.js`
- `Math.random()` remains in runtime backend code at `apps/backend/routes/api/provider/handlers/auditor-session-handler.js`

### 4. Provider API surface is not fully canonical yet

- `apps/web-app/src/lib/services/provider-api.ts:12` still calls a legacy provider scheduler route pattern

### 5. Large frontend and backend files still dominate change risk

Examples from the static suite:

- `apps/web-app/src/app/provider/coordinator/page.tsx`
- `apps/backend/routes/api/integration/lab-integration.js`
- `apps/backend/services/invoice-service.js`
- `apps/backend/constants/document-slots.js`
- `apps/backend/services/crypto/timestamp-service.js`

### 6. Database hygiene needs a focused pass

The database review flagged missing timestamps and index candidates on active models such as:

- `ApplicationComment`
- `AuditLog`
- `PaymentAudit`
- `PaymentReconciliation`
- `Notification`
- `TraceQrScan`

### 7. Encoding hygiene is still an open repo-wide problem

The encoding checker now runs correctly and reports 63 UTF-8 BOM files. This is a real cleanup backlog, not a tool failure.

## Environment Gaps

These are environment blockers, not confirmed code defects:

- `npm run typecheck:web` failed because `tsc` was not available from the current install state
- `npm run build` failed because backend `prisma` was not available from the current install state
- `npm run test` failed because the backend local `jest` binary was missing from the current install state

## Recommended Workstreams

- `authen-security`: remove direct `req.ip` access, replace insecure random IDs, audit cookie and bearer transport consistency
- `provider-id-team`: remove legacy provider API surface usage and align scheduler routes
- `workflow-business-rules` plus `backend-service`: move inline route logic into services and add transactions to multi-write flows
- `database-data`: add missing timestamps and index review for high-traffic foreign keys
- `frontend-product` plus `ux-ui-design`: split oversized pages and add missing loading and error states on portal pages
- `qa-release-observability`: run the dynamic carpet-bomb suite only after a safe local or preview target is confirmed

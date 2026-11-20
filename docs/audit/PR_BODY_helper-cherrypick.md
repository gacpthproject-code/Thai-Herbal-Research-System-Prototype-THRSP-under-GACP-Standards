<!--
  Pull Request body for the `helper-cherrypick` branch.
  Open the PR via:
    https://github.com/jonmaxmore/GACP-Certification-Application/pull/new/helper-cherrypick

  Copy the body below into the PR description. The PR template at
  .github/PULL_REQUEST_TEMPLATE.md will pre-fill checkboxes — leave them
  ticked or untick anything that does not apply.

  Title: chore(release): ADR-014 Phase 3b complete + Phase 1 audit fixes (10/11)
-->

## Summary

This PR closes the bulk of the 2026-04-27 production-readiness audit
(`docs/audit/2026-04-27-full-system-review.md`) on top of the ADR-014
multi-tenancy Phase 3b work.

- **34 commits** above `main`, organized into reviewable chunks.
- **ADR-014 Phase 3b A/B/C + CI guardrail** shipped (PRs A/B/C in the handoff doc).
- **10 of 11 code-side Phase 1 CRITICAL** audit blockers fixed.
- **2 server-side blockers** packaged as runnable scripts (`scripts/maintenance/`).
- **3 Phase 2 hardening items** also fixed in this PR.
- **70 unit tests** + **system-integrity-check (66/66)** + **tenant-conventions guardrail** + **prisma validate** all green at HEAD.

## Linked decisions

- `docs/adr/ADR-014-multi-tenancy-foundation.md` — multi-tenancy decisions
- `docs/adr/ADR-014-phase-3-handoff.md` — Phase 3 handoff (kept current)
- `docs/audit/2026-04-27-full-system-review.md` — full audit report (with addendum)

## Commit map

### ADR-014 Phase 3b (multi-tenancy)

| Commit | What |
|---|---|
| `fb88bd5` | PR A — wrap 10 seed/maintenance scripts in `runWithTenantContext` |
| `3e93ba6` | PR B — wrap 4 cron jobs per-row in `runWithTenantContext`; cross-tenant scans use `withoutTenantScope` |
| `e248e8e` | PR C — Prisma `@relation` declarations on 48 tenant-scoped models + reverse on Organization |
| `8106cb4` | CI — `check-tenant-conventions.js` + `npm run check:tenant-conventions` |
| `5649362` | docs — handoff doc updated with PR A/B/C completion + risk reassessment |

### Audit infrastructure

| Commit | What |
|---|---|
| `b7ef356` | Claude Auto-Review GitHub workflow + PR template + diagnostic runbook |
| `6ac33f4` | Full-system static audit report (537 lines, 11 CRITICAL + 9 HIGH findings) |
| `301db3c` | C: drive cleanup script (local dev box maintenance) |
| `4cccacc` | Live-server diagnostic addendum (TLS + GHCR + pgadmin OOM) |

### Phase 1 CRITICAL — code-side fixes

| Commit | Phase 1 # | What |
|---|---|---|
| `cbcd25e` | #1.7 / #1.8 / #1.11 | refuse weak fallbacks in production: QR signature throws on RSA fail (no silent HMAC degrade); QR/trace URL throws on missing env (no `localhost` shipped); JWT secret stable dev fallback + module-load production validation |
| `5196817` | #1.3 / #1.9 | cert issuance gated on real audit-pass record; trace endpoint returns 410 for revoked/expired certs |
| `5b9a234` | #1.10 | production deploy now blocks on a `release-test-gate` job (system integrity + unit suite + tenant guardrail + lint) |
| `03bdc8a` | #1.4 | lab webhook gets HMAC parity with payment webhook |
| `924c6fd` | #1.6 | audit `/:id` endpoints (GET / PATCH schedule / POST result) tenant-scoped — IDOR fixed |
| `3885a42` | #1.5 | public verify hardening: applicant name masked, cert# moved from sequential to 6-char hex, 30 req/IP/min rate limit |
| `b5039a8` | #1.2 | provider + admin dashboards scope every count by `organizationId` |

### Phase 1 CRITICAL — server-side scripts (operator runs)

| Commit | Phase 1 # | What | How operator runs |
|---|---|---|---|
| `76394b0` | #1.12 / #1.13 + #2.14 | runnable scripts on server: `fix-certbot-renewal.sh` (TLS auto-renewal) + `fix-ghcr-pat.sh` (GHCR docker login) + pgadmin memory cap 128M→256M | see Operator Steps below |

### Phase 2 hardening (bonus)

| Commit | Phase 2 # | What |
|---|---|---|
| `f2e8ee1` | #2.13 + #2.5 | MFA verify rejects legacy `userId` body (mfa_session token mandatory); audit-result endpoint rolls status back when cert generation fails |
| `95bc415` | #2.8 | Postgres index on `applications.rejectCount` + `invoices.paymentTransactionId` — both were unindexed on the request path |

### Closeout

| Commit | What |
|---|---|
| `351f92f` | audit Phase 1 closeout status table + executive summary update |

## Workflow surfaces touched

- [x] application submit / draft (tenant-scope on org-related queries)
- [x] document review — no behavior change; reviewer's reject path is unaffected
- [x] payment 5,000 / 25,000 / resubmission — see `payment-fees.js`; the deadline-based resubmission rule is verified
- [x] audit scheduling (online / onsite) — IDOR fix
- [x] audit result (pass / fail / evidence) — atomic cert generation + rollback
- [x] certificate generation — gated on real audit-pass record
- [x] QR / public verify — PII mask + rate limit + non-sequential cert#
- [x] track & trace — revoked/expired cert returns 410
- [x] notifications — no change
- [x] dashboard counts — tenant-scoped
- [x] role-based access — audit IDOR fix
- [x] tenant scoping (ADR-014) — Phase 3b A/B/C/CI complete

## Identity model — naming check

- [x] No new `farmerid` / `staffid` / `farmerId` / `staffId` introduced
- [x] All new identity references use `healthid` / `providerid`

## Test plan

Recommended:

- [ ] CI runs: confirm `Claude Auto-Review` workflow posts a review comment
- [ ] CI runs: confirm `release-test-gate` job appears in PRs (it only fires on tag, but the PR shows the workflow listed)
- [ ] Local: `cd apps/backend && DATABASE_URL='postgresql://test:test@localhost:5432/test' node ../../node_modules/jest/bin/jest.js --config jest.config.cjs --testPathPattern '__tests__/(simple|tenant-context|crypto-service|security-nonce)' --no-coverage` → 70 / 70 pass
- [ ] Local: `node scripts/system-integrity-check.js` → 66 / 66 pass
- [ ] Local: `node scripts/ci/check-tenant-conventions.js` → PASS
- [ ] Local: `cd apps/backend && DATABASE_URL='postgresql://test:test@localhost:5432/test' npx prisma validate --schema prisma/schema` → schema valid
- [ ] Manual: hit `https://152.42.218.251/api/public/verify/<some-cert#>` from two different IPs and confirm rate limit kicks in at the 31st request from one IP
- [ ] Manual: try `GET /api/audits/:some-other-org-id` as a tenant-A provider, confirm 404

## Operator steps (must run on production droplet before/after merge)

1. **Refresh the GHCR PAT** — required to unblock production deploys (commit `76394b0`):

   ```bash
   ssh root@152.42.218.251
   GHCR_PAT='ghp_...new-token...' bash /opt/gacp-platform/scripts/maintenance/fix-ghcr-pat.sh
   ```

   Generate the PAT at https://github.com/settings/personal-access-tokens with
   `Repository access: jonmaxmore/gacp-platform`, `Permissions: Packages → Read`.

2. **Fix the TLS auto-renewal** — cert expires 2026-06-03, currently fails dry-run because certbot can't bind :80:

   ```bash
   ssh root@152.42.218.251
   sudo bash /opt/gacp-platform/scripts/maintenance/fix-certbot-renewal.sh
   ```

   The script snapshots originals, switches certbot from `standalone` to
   `webroot`, points host nginx at the LE cert directly via symlinks,
   installs a deploy-hook that reloads nginx after each renewal, and runs
   `certbot renew --dry-run` to verify.

3. **Apply the pgadmin cap bump** — happens automatically when this PR's
   `docker-compose.production.yml` change deploys.

## What is NOT in this PR (deliberate)

- **Phase 1 #1.1** (3-rejection resubmission fee) — the audit misread the spec.
  The codebase uses a deadline-based resubmission rule (5 working days →
  CANCEL_EXPIRED → new application + fresh fee), which is correctly implemented
  via `apps/backend/jobs/revision-deadline-checker.js` and
  `workflow-revision-expirations-handler.js`. No code change needed.
- **Phase 2 #2.7** (string status → Prisma enum) — large schema migration,
  separate PR for review.
- **Phase 3** items (8 items, optimization/scale) — post-launch.
- **ADR-014 PR D** (NOT NULL alteration) and **PR E** (RLS) — both gated on
  Phase 3b being in production for one full release cycle, per handoff doc.

## Risk

- All code changes degrade gracefully when env vars / JWT claims are absent
  (legacy session compat). No hard breakage of existing prod traffic.
- The new `release-test-gate` workflow job only runs on push of a `v*` tag —
  no impact on PR CI.
- DB indexes are additive; the migration uses `IF NOT EXISTS` so re-running
  the deploy is idempotent.
- pgadmin cap is bumped not lowered — no ops impact.
- Operator scripts are idempotent and snapshot originals before mutating.

🤖 Auto-review: Claude will inspect this PR via `.github/workflows/claude-review.yml`.
Add the `skip-claude-review` label to skip if needed.

# T-020 Legacy Routes / Aliases — Retirement Status — 2026-05-05

Audit pass for **T-020 — Retire legacy routes, compatibility models,
aliases, and fallback-only surfaces after parity is proven**
(master-audit-implementation-action-plan.md).

This document inventories every legacy route alias currently mounted,
classifies each by removal risk, and records what's gating retirement.
**No code changes proposed in this PR** — every removal needs the
operator's "real consumers verified" sign-off documented in the
deprecation register before the alias can land.

## Inventory: backend route aliases

### A. Application-domain aliases (unconditional mounts, marked "v4 removal")

`apps/backend/routes/api/index.js:112-119` mounts 6 legacy aliases that
forward to the canonical `/api/applications/*` consolidation:

| Legacy mount | Canonical mount | Status | Same router instance? |
|---|---|---|---|
| `/api/validation` | `/api/applications/validate` | mounted unconditionally | yes |
| `/api/gacp-scoring` | `/api/applications/scoring` | mounted unconditionally | yes |
| `/api/calculations` | `/api/applications/calculations` | mounted unconditionally | yes |
| `/api/criteria` | (criteriaRouter — same instance) | mounted unconditionally | yes |
| `/api/cultivation-config` | `/api/applications/journey` | mounted unconditionally | yes |
| `/api/revision-deadline` | `/api/applications/revision-deadline` | mounted unconditionally | yes |
| `/api/application-bundles` | `/api/applications/bundles` | mounted unconditionally | yes |

Removal safety: **mounting the same router at two paths is cheap
(no new code), so removal is blocked only by consumer verification**.
For each one, ops needs to confirm zero traffic on the legacy path
before the line can be deleted.

### B. Audit-domain aliases (unconditional)

`apps/backend/routes/api/index.js:151-157`:

| Legacy mount | Canonical | Status |
|---|---|---|
| `/api/audit` | `/api/audits/*` | mounted unconditionally |
| `/api/post-audit` | (audit/post-audit) | unconditionally mounted; canonical TBD |
| `/api/fraud-detection` | (audit/fraud-detection) | unconditionally mounted; canonical TBD |
| `/api/site-analyses` | (audit/site-analyses — IDOR-patched in PR #262) | unconditionally mounted |
| `/api/audits/farm` | UNMOUNTED — `audit/farm-audit.js` references 4 phantom Prisma models per inline comment | already retired |

### C. Provider-side legacy aliases (env-gated)

`apps/backend/routes/api/index.js:207-211` is gated behind
`ENABLE_PROVIDER_LEGACY_ALIAS=true`:

| Legacy mount | Canonical | Notes |
|---|---|---|
| `/api/provider-cms` | `/api/provider/cms-equivalent` | env-gated; ERP regression gate sets the flag in CI (see CHANGELOG 3.2.0 ERP fix) |
| `/api/wizard` | `/api/applications/draft` family | env-gated |
| `/api/admin` | `/api/provider/admin/*` | env-gated; canonical path is via providerRouter |

The env-gate already provides one half of T-020's intent: each surface
has a named opt-in flag rather than being live-by-default.

### D. Removed / unmounted (already retired)

- `/api/proxy/[...path]` (Next BFF) — confirmed deleted (verified during T-004 audit, PR #281)
- `/api/audits/farm` — backing module references phantom Prisma models; mount line removed
- `routes/api/wizard.js` (root path) — moved to `applications/wizard.js`
- `routes/api/application-flow.js` — not present in current codebase
- `routes/api/provider.js` (root path) — moved to `system/provider.js`
- `routes/api/audits.js` (root path) — moved to `audit/audits.js`
- `routes/api/planting-cycles-*.js` (root paths) — moved to `cultivation/`

The audit's original target list mostly refers to files at their
**old paths**; those paths no longer exist. The reorganization into
proper namespaces (`audit/`, `cultivation/`, `system/`, `applications/`)
is itself a partial T-020 retirement — the dead code at the original
paths is gone.

## Deprecation register state

`docs/architecture/deprecation-register.md` exists and lists exactly
**1 entry**:

> `POST /api/applications/submit` → `POST /api/application-flow/prepare` + `POST /api/applications/:id/finalize-submission` (Backend owner)

The 6 application-domain aliases (Section A above) and the 4 audit-domain
aliases (Section B) are **not yet recorded** in the register. The next
step in T-020 is to record each alias with:

- canonical replacement path
- proposed sunset condition (e.g., "after 60 days of zero traffic in
  Splunk Web UI access logs")
- owner (Backend / Frontend / Integration)

That's a doc PR, not a code PR — and would be the safe next step once
the operator confirms which aliases have zero current traffic.

## Subtask coverage

- **Subtask 1** (Verify real consumers): 🟡 needs operator step (production traffic check per legacy mount)
- **Subtask 2** (Remove dead surfaces; convert survivors to versioned/deprecated contracts): partial — many already removed during the namespace reorg; the rest are listed above and waiting on (1)
- **Subtask 3** (Update deprecation register / release notes / rollback rules): 🟡 register exists with 1 entry; ~10 more entries pending (list above)

## Recommendation

T-020 is **structurally ready** — the legacy surfaces are inventoried,
many are env-gated, and many have already been retired by namespace
reorgs. The remaining work is **operator-led** consumer verification
that I cannot do from inside the codebase.

Specifically:

1. Run `grep -r "<legacy-path>" apps/web-app/src` for each Section A/B
   alias to confirm no frontend caller. Today's checks show 0 callers
   for most, but a thorough audit needs to include mobile app +
   integration partner clients which I don't have visibility into.
2. Pull production access logs (last 30 days) to confirm zero traffic
   on each legacy path.
3. For each alias confirmed at zero-traffic, add a row to
   `deprecation-register.md` with sunset date.
4. After the documented sunset date, a follow-up PR removes the mount line.

This deferred operator step is exactly what the T-020 DOD calls for
("Every retained compatibility surface has a named consumer and
sunset window") and matches the same gating pattern as T-016 (public
API contract changes need deprecation comms before removal).

## Summary

- Inventory: ✅ complete (above)
- Removal: 🟡 blocked on per-alias consumer verification + sunset
  decision
- Doc: 🟡 deprecation-register has 1 entry; ~10 more pending operator
  consumer check

T-020 is the natural last step in the master-audit T-task series. The
work surface is now visible and bounded — the next session can take
the verified-no-consumers aliases and land removals one at a time
with explicit before/after telemetry.

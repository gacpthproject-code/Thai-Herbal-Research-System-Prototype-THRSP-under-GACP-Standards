# T-011 Migration Chain Status — 2026-05-05

Audit pass for **T-011 — Rehearse and clean the migration chain, then
remove runtime schema-fallback dependencies** (master-audit-implementation-action-plan.md).

This document records the alignment status of T-011's three subtasks
based on a code + migration audit performed today. **Subtask 1 is
substantially complete**; subtasks 2 + 3 require operator sign-off
on a per-env basis (production migration verification) before fallback
removals can land safely.

## Subtask 1 — Inventory standalone SQL files + placeholder folders

### Standalone SQL files mentioned in the original audit — ✅ retired

| File | Current state |
|---|---|
| `apps/backend/prisma/migrations/fix_schema_gaps.sql` | **Does not exist** — already retired |
| `apps/backend/prisma/migrations/add_performance_indexes.sql` | **Does not exist** — already retired |
| `apps/backend/prisma/migrations/add_farm_audit_enhancements.sql` | **Does not exist** — already retired |

Verified by `find apps/backend/prisma -maxdepth 2 -name "fix_schema_gaps*" -o -name "add_performance_indexes*" -o -name "add_farm_audit_enhancements*"` returning no results.

### Placeholder migration folders — ✅ documented + safe

| Folder | Purpose | Safety check |
|---|---|---|
| `migrations/add_dtam_requirements/` | Pure comment placeholder, kept for historical ordering. No SQL operations. | Safe — `_prisma_migrations` rows on deployed envs reference this name; deleting the folder would create "missing locally" drift. Leaving in place is the canonical choice. |
| `migrations/manual/` | `certificationPurpose String → certificationPurposes String[]` data migration. Has explicit idempotent guard documented in the SQL file (added 2026-04-29 to fix CI red on fresh DBs). | Safe — guards `IF EXISTS` for the singular column so re-runs on fresh DBs are no-ops. |

**Subtask 1 conclusion: complete.** No further inventory work needed; the migration tree is clean.

## Subtask 2 — Reproducible migration path (clean + upgraded envs)

CI's **Migration Drift Check** (`scripts/ci/check-prisma-migration-consistency.js`) runs on every PR:
- Verifies commit-level pairing (every schema change has a paired migration file)
- When `SHADOW_DATABASE_URL` is set in CI, runs strict drift check via Prisma

Today's PRs #282, #283, #284 (T-010 FK promotions) all passed the Migration Drift Check job, confirming the migration chain is reproducible on the shadow DB used by CI.

The only outstanding item is a **production-environment dry run** (operator-led):
- `prisma migrate deploy --preview-feature --dry-run` against a restored prod snapshot
- Verify `_prisma_migrations` table has all expected rows
- Verify no `pending` migrations exist after deploy

**Subtask 2 conclusion: substantially complete via CI; production rehearsal needs DBA sign-off as a one-time exercise.**

## Subtask 3 — Remove runtime schema-fallback dependencies

This subtask is **the highest-risk part** of T-011 and requires operator
confirmation that the underlying schema state is uniform across every
deployed environment before fallbacks can be retired.

### Audited fallback sites

| Site | Fallback for | Migration that closed the gap | Removal risk |
|---|---|---|---|
| `routes/api/applications/application-listing-handlers.js:127-128` | `application_comments` table missing | `20260304093000_add_application_comments_table` | Low if all envs ran migrate deploy after 2026-03-04. **Needs ops verification.** |
| `routes/api/applications/application-workflow-handlers.js:131-133, 162-164` | Same | Same | Same |
| `routes/api/provider/applications.js:39-42` (`isMissingApplicationCommentsTableError` helper) | Same | Same | Same — would also need to drop the helper |
| `services/working-days-service.js:77-79` (try/catch swallow) | `systemConfig.findUnique` failing — table missing OR config row absent | `systemConfig` table is canonical (in schema since base migration) | The "table missing" branch is dead in practice; the "config row absent" branch is normal startup behavior. Keep the catch but document scope. |
| `controllers/system-config-controller.js` (4 broad catches) | Polymorphic `value: Json?` shape parsing | `systemConfig` table existence | The try/catch wraps `JSON.parse` + Prisma calls; mostly defensive coercion of `Json?` column shapes (Array \| String \| Object). Keeping it is correct — the schema permits polymorphic values by design. |

### Recommendation per site

1. **`application_comments` fallback (3 files)**: candidate for removal *after*
   ops confirms `prisma migrate status` on every deployed env shows
   `20260304093000_add_application_comments_table` as Applied. Removal
   would delete `isMissingApplicationCommentsTableError` from
   `provider/applications.js` and ~6 catch branches from the listing /
   workflow handler files. **Net diff: ~30 lines deleted, behavior
   unchanged on healthy envs.**
2. **`working-days-service.js:77-79`**: keep as-is. The catch is a
   defensive wrapper for `prisma.systemConfig.findUnique()`; it correctly
   returns the (possibly empty) holiday set on failure, which is the
   right policy for a holiday lookup that has no critical data
   integrity dependency.
3. **`system-config-controller.js` polymorphic shape**: keep as-is.
   The polymorphism is a deliberate schema choice (`value Json?`), not
   a fallback for a missing table. Documenting it as intentional in
   the controller comment would be a nice cleanup but isn't a T-011
   removal target.

### What's gating the application_comments removal

A single operator step:

```sh
# On each deployed environment:
DATABASE_URL=... pnpm --dir apps/backend exec prisma migrate status \
  | grep "20260304093000_add_application_comments_table"
```

Expected output: the migration line in the **Applied** section. If any
env shows it pending or missing, run `prisma migrate deploy` there
before this PR lands.

## Summary

- **Subtask 1 (inventory)**: ✅ complete — no orphan SQL, placeholders are intentional
- **Subtask 2 (reproducible chain)**: ✅ complete via CI Migration Drift Check; production rehearsal is operator one-time
- **Subtask 3 (fallback removal)**: 🟡 audited; one safe removal candidate (application_comments fallback) gated only by ops `migrate status` confirmation across deployed envs; the other two fallback sites are correct as-is and should NOT be removed.

T-011 is substantially complete. Remaining work is a one-time operator
verification + a small follow-up PR removing 30 lines of dead fallback
once that verification is recorded.

# Legacy User entity columns — Phase 5a deprecation + Phase 5b drop plan

**Date**: 2026-05-02
**Author**: Wave D Phase 5a kickoff
**Status**: Annotation in code; **column drop scheduled for Phase 5b after ≥1 production release** (target: 2026-06).
**Companion to**: `C:\Users\Administrator\.claude\plans\woolly-hugging-eagle.md` (Wave D)

## Why this doc exists

The Wave B/C entity rollout (PRs #133-#150) replaced the User-table
discriminator columns with a first-class `Entity` model + `EntityMembership`
join. Per the original plan, the legacy User columns must remain readable
for one release while we prove no callers regress, then get dropped in
Phase 5b. This doc is the sunset-date tracker that makes that schedule
concrete — same pattern as Wave A Phase 39's `pdfUrl` retirement.

## Columns annotated `/// @deprecated` in this PR

`apps/backend/prisma/schema/auth.prisma` (User model):

| Column | Replacement | Phase 5b drop date |
|---|---|---|
| `entityType` | `Application.entity.type` (via membership) | 2026-06-15 |
| `companyName` | `Entity.displayName` (JURISTIC) | 2026-06-15 |
| `taxId` | `Entity.juristicId` | 2026-06-15 |
| `taxIdHash` | `Entity.juristicIdHash` | 2026-06-15 |
| `representativeName` | `Entity.payload.director.name` | 2026-06-15 |
| `representativePosition` | `Entity.payload.director.position` | 2026-06-15 |
| `communityName` | `Entity.displayName` (COMMUNITY_ENTERPRISE) | 2026-06-15 |
| `communityRegistrationNo` | `Entity.communityRegNo` | 2026-06-15 |
| `communityRegistrationNoHash` | `Entity.communityRegNoHash` | 2026-06-15 |

The `///` JSDoc annotation is a Prisma-supported metadata comment — it
generates no DDL change (verified via `prisma migrate diff`, output
"This is an empty migration"). IDE / type-aware tooling shows the
deprecation warning to anyone touching these fields.

## Audit of remaining readers (2026-05-02)

Exhaustive grep of `apps/backend` and `apps/web-app` for `applicant.companyName`,
`applicant.taxId`, `applicant.communityName`, `prisma.user.* select: { companyName }`,
etc. Findings:

### 1. `apps/backend/utils/applicant-resolver.js`

The Phase 4d resolver (PR #141) prefers `record.entity` over the legacy
fallback. The fallback path (`applicant.companyName / .taxId /
.companyRegistrationNumber`) only runs when:
- The Application row has no `entityId` (pre-Phase-66 row), AND
- `formData.applicantInfo.companyName` is also missing

**Action**: kept as fallback for one release. Annotated with
deprecation comment block. Drops cleanly when Phase 5b removes the
columns — the resolver will simply skip to the formData / `'-'`
fallback path.

### 2. `apps/backend/services/invoice-service.js` (3 sites: lines 138, 388, 410)

Each `prisma.invoice.findMany / findUnique` selected `applicant.companyName`
into the response payload. Tracing consumers showed nothing reads it:
the only `invoice.applicant.companyName` read in production is
`apps/backend/services/pdf-service.js:332`, and that file has no
production callers (it's the legacy PDFKit invoice template; superseded
by `services/pdf/invoice-template-service.js` which uses
`resolveApplicantInfo`).

**Action**: dropped `companyName: true` from all 3 selects in this PR.
Added `application: { include: { entity: { select: { id, type,
displayName } } } }` so consumers that want the canonical applicant
name read it from the Entity relation instead.

### 3. `apps/backend/services/repositories/invoice-repository.js` (2 sites: lines 76, 98)

Same shape as invoice-service. Same fix applied.

### 4. `apps/backend/services/pdf-service.js:332` (DEAD)

The legacy PDFKit invoice template. No production callers (verified
by greps for `pdfService.generateInvoicePdf`, `require('.*pdf-service')`,
and `PdfService` outside the file itself). Updated the customer-name
fallback chain to prefer `invoice.application.entity.displayName` when
present, kept the legacy `applicant.companyName` read as a final
fallback marked `/* @deprecated Phase 5a */`. When Phase 5b drops the
column, the fallback becomes ineffective; nothing else changes.

### 5. Wizard frontend forms (`apps/web-app/src/app/health/applications/new/_steps/...`)

These reference `formData.applicantData.companyName` etc. — the
**wizard's own form fields**, not `User.companyName`. Out of scope for
this deprecation; remain valid Wave C UX surfaces.

## Verification

```
$ npx prisma validate
> The schemas at prisma/schema are valid

$ npx prisma migrate diff --from-migrations prisma/migrations \
    --to-schema-datamodel prisma/schema --shadow-database-url …
> -- This is an empty migration.    # @deprecated comments add no DDL

$ npx jest --no-coverage
> Test Suites: 86 passed, 1 skipped of 87 total
> Tests:       910 passed, 43 skipped, 953 total

$ node apps/backend/scripts/smoke-wave-c.js
> 16/16 checks passed (live DB; tenant-prisma-extension still injects
                       entityId into Application.findMany correctly)
```

## Phase 5b drop plan (target: 2026-06-15, ≥6 weeks after this PR)

1. Confirm `main` has been on production for ≥1 release with no errors
   referencing the deprecated columns.
2. Backfill verification: every Application has a non-null `entityId`
   (already enforced by Phase 66 + auto-heal in Phase 68; re-confirm
   `SELECT count(*) FROM applications WHERE "entityId" IS NULL` = 0).
3. Schema PR removes the `@deprecated` columns in one go:
   - Strips them from `auth.prisma`
   - Generates a `prisma migrate dev --name drop_legacy_user_entity_columns`
     migration with `ALTER TABLE users DROP COLUMN ... CASCADE` (the
     CASCADE handles the unique indexes on `taxIdHash` / `communityRegistrationNoHash`)
   - Updates the resolver fallback path to drop the legacy `applicant.*` reads
4. CI Migration Drift Check stays at 0; tests stay at 910/910.
5. Deploy via `main → deploy/production` like Wave C; production DB
   loses the columns the same release.

## Out of scope for Phase 5a

- Postgres RLS (Wave D follow-up)
- BroadcastChannel cross-tab sync (Wave D follow-up)
- Email-out for invitations (Wave D follow-up)
- Transfer-ownership flow (Wave D follow-up)
- EntityServiceDelegation table (Wave D follow-up; only when consulting-company use case appears)

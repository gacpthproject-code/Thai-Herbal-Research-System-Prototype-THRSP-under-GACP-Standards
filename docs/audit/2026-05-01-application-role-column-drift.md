# Application role column drift — analysis & migration plan

**Date**: 2026-05-01
**Author**: Wave A wrap-up (Phase 41 followup to Wave A release notes)
**Status**: Analysis only — no code or schema changes in this doc PR.
**Companion to**: `docs/deployment/2026-05-01-wave-a-release-notes.md`, `docs/audit/2026-04-30-workflow-gap-analysis.md`

## Why this doc exists

Wave A's Phase 17 added FK relations on the four `*ProviderId` columns of `Application`. Phase 21 then hot-fixed a regression in the visibility filter caused by checking those columns when production data actually lives somewhere else. The result is **eight parallel role-assignment columns on `applications`**, only one of which is populated in production.

Future work — specifically G3 consumer migration (porting `phase1Status` / `phase2Status` writes through `tracked-writer`, and porting auditor-reassignment through it too) — is blocked on having a single canonical home for each role assignment. This doc inventories the situation and recommends the clean-up.

## The eight columns

```
applications:
  auditorId              text     populated: 8 of 38 rows
  auditorProviderId      text     populated: 0 of 38 rows
  headAuditorUserId      text     populated: 0 of 38 rows
  headAuditorProviderId  text     populated: 0 of 38 rows
  reviewerUserId         text     populated: 0 of 38 rows
  reviewerProviderId     text     populated: 0 of 38 rows
  schedulerUserId        text     populated: 0 of 38 rows
  schedulerProviderId    text     populated: 0 of 38 rows
```

Verified on prod 2026-05-01 via `psql -U gacp -d gacp_db`.

The first column (`auditorId` → `User.id`) is the only one that gets data. Everything else is schema-only.

## How we got here

Following the schema/code archaeology done during Phases 17 and 21:

1. **Original schema** (pre-Wave A): `Application` had four `*ProviderId String?` columns. They were declared with the comment "ROLE CLARIFICATION (ใช้คำว่า ProviderId ชัดเจน)" — the intent was that they'd reference `User.providerId`, the external provider ID.

2. **Reality on the writer side**: `audits.js` and `audits-reassign.js` write `auditorId: req.body.newAuditorId`, where the body field is a `User.id` (uuid), not a `User.providerId` (numeric provider code). The JSON DB column ended up named `auditorId` to match the writer, but it never made it into the Prisma schema until Phase 21.

3. **Phase 17 (#94)** added Prisma `@relation` declarations + DB FK constraints on the four `*ProviderId` columns. Constraints succeeded because all those columns were null. The relations are technically valid but reference a column nobody writes.

4. **Phase 21 hot-fix (#98)** — discovered during the Phase 19/20 visibility filter rollout that `auditorId` is the real column. Added `auditorId` / `headAuditorUserId` / `reviewerUserId` / `schedulerUserId` to the Prisma schema (they already existed in the DB as ghost columns) and updated the visibility filter to check both column sets.

So today's state: eight columns, one used, four with FK constraints to a column nobody writes, and four more that were declared just to make the visibility filter compile.

## Writer surface (production code only — tests excluded)

| Column | Writers in production code |
|---|---|
| `auditorId` | 8 sites: `routes/api/audit/audits.js:327` (schedule), `routes/api/audit/audits-reassign.js:133` (reassign), `routes/api/audit/farm-audit.js:95,140`, `routes/api/provider/handlers/workflow-transitions-handler.js:326`, `controllers/audit-checklist-controller.js:188` (Auditor.auditorId via `audit_checklists.auditorId`, distinct table) |
| `auditorProviderId` | **none** |
| `headAuditorUserId` | **none** |
| `headAuditorProviderId` | **none** |
| `reviewerUserId` | **none** |
| `reviewerProviderId` | **none** (mentioned at `scheduler-assign-reviewer-handler.js:109` but writing into `formData.PROVIDERAssignment` JSON, not the column) |
| `schedulerUserId` | **none** |
| `schedulerProviderId` | **none** |

The `formData.PROVIDERAssignment.reviewerProviderId` JSON field IS used (frontend writes it via assignment flow, then `workflow-transitions-handler.js:108` reads it for the REV-11 ownership check). But that's JSON, not the column.

## Reader surface

`auditorId` — read in many places (auditor dashboards, list endpoints, decision handlers, the visibility filter). **Real readers exist; this column is the system's source of truth for "who's the assigned auditor."**

Other 7 columns:
- The visibility filter (`shared/application-visibility.js`) checks all 7 as fail-safes for forward-compat (Phase 21 belt-and-suspenders).
- Phase 17's named relations (`reviewer`, `headAuditor`, `scheduler`, `auditor` on Application) reference the providerId set; they're queryable but always return null.
- Nobody else reads them.

## Recommended migration

**Goal**: collapse to a single canonical column per role, with a real FK to `User.id`.

```
applications:
  auditorId               text  FK -> users(id)   (KEEP — real data lives here)
  reviewerId              text  FK -> users(id)   (NEW name, replaces reviewerUserId/reviewerProviderId)
  headAuditorId           text  FK -> users(id)   (NEW name, replaces headAuditorUserId/headAuditorProviderId)
  schedulerId             text  FK -> users(id)   (NEW name, replaces schedulerUserId/schedulerProviderId)
```

Rationale for the rename:
- The current `*UserId` suffix (added in Phase 21) is ugly and inconsistent with `auditorId`.
- The `*ProviderId` columns are wrong (they were supposed to reference providerId; they don't).
- `reviewerId` / `headAuditorId` / `schedulerId` are clean, parallel `auditorId`, and unambiguously reference `User.id`.

## Migration steps (for the future PR)

This is **not** the PR — it's the recipe. Each step is a single, atomic migration:

### Step 1 — Add the new canonical columns

```sql
ALTER TABLE "applications"
  ADD COLUMN "reviewerId"     TEXT,
  ADD COLUMN "headAuditorId"  TEXT,
  ADD COLUMN "schedulerId"    TEXT;

CREATE INDEX "applications_reviewerId_idx"     ON "applications" ("reviewerId");
CREATE INDEX "applications_headAuditorId_idx"  ON "applications" ("headAuditorId");
CREATE INDEX "applications_schedulerId_idx"    ON "applications" ("schedulerId");
```

(No FK constraints yet — backfill first.)

### Step 2 — Backfill from formData JSON

The reviewer/scheduler/headAuditor data lives in `application.formData.PROVIDERAssignment` as JSON. Backfill into the new columns:

```sql
UPDATE "applications"
SET "reviewerId" = "formData"->'PROVIDERAssignment'->>'reviewerId'
WHERE "formData"->'PROVIDERAssignment'->>'reviewerId' IS NOT NULL;

-- repeat for schedulerId, headAuditorId
```

### Step 3 — Add FK constraints

```sql
ALTER TABLE "applications"
  ADD CONSTRAINT "applications_reviewerId_fkey"
    FOREIGN KEY ("reviewerId") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "applications_headAuditorId_fkey"
    FOREIGN KEY ("headAuditorId") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "applications_schedulerId_fkey"
    FOREIGN KEY ("schedulerId") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
```

### Step 4 — Migrate Prisma schema

- Add `reviewerId`, `headAuditorId`, `schedulerId` to `Application` model with named relations to `User`.
- Drop the four `*ProviderId` named relations (`ApplicationReviewer`, `ApplicationHeadAuditor`, `ApplicationScheduler`, `ApplicationAuditor`-on-providerId).
- Add the new ones (`ApplicationReviewer`, `ApplicationHeadAuditor`, `ApplicationScheduler` against User.id; `ApplicationAuditor` already correct on `auditorId`).
- Update User reverse relations on `auth.prisma`.

### Step 5 — Migrate writers

- `scheduler-assign-reviewer-handler.js`: write `reviewerId: reviewer.id` in addition to (eventually instead of) `formData.PROVIDERAssignment.reviewerId`.
- Any future scheduler / head-auditor assignment writers go through the columns directly.

### Step 6 — Simplify the visibility filter

`shared/application-visibility.js` currently OR's eight branches (Phase 21 belt-and-suspenders). Collapse to the four real columns:

```js
return {
    OR: [
        { auditorId: userId },
        { headAuditorId: userId },
        { AND: [{ sameReviewerAuditor: true }, { reviewerId: userId }] },
    ],
};
```

(The providerId-based branches and the *UserId-based branches both go away.)

### Step 7 — Drop the dead columns

```sql
-- Drop FK constraints first (Phase 17's adds)
ALTER TABLE "applications"
  DROP CONSTRAINT IF EXISTS "applications_reviewerProviderId_fkey",
  DROP CONSTRAINT IF EXISTS "applications_headAuditorProviderId_fkey",
  DROP CONSTRAINT IF EXISTS "applications_schedulerProviderId_fkey",
  DROP CONSTRAINT IF EXISTS "applications_auditorProviderId_fkey";

-- Drop the columns
ALTER TABLE "applications"
  DROP COLUMN IF EXISTS "reviewerProviderId",
  DROP COLUMN IF EXISTS "headAuditorProviderId",
  DROP COLUMN IF EXISTS "schedulerProviderId",
  DROP COLUMN IF EXISTS "auditorProviderId",
  DROP COLUMN IF EXISTS "reviewerUserId",
  DROP COLUMN IF EXISTS "headAuditorUserId",
  DROP COLUMN IF EXISTS "schedulerUserId";
```

That's 7 columns gone. `auditorId` stays as the only role column with the same name as before.

### Step 8 — G3 unblocked

With the schema canonical, the auditor-reassignment writer (`audits-reassign.js`) can be migrated to use `tracked-writer.trackedUpdate({ ..., trackedFields: ['auditorId'] })` and emit a proper audit row on every reassignment.

The `phase1Status` / `phase2Status` writes (8+ sites) are independent of this drift sort and can also use `trackedUpdate` once the codebase pattern is established.

## Risk assessment

**Low risk** because:
1. 7 of the 8 columns are 100% null in production. Dropping them loses nothing.
2. The single populated column (`auditorId`) is the canonical writer target — no rename, no behavior change for existing data.
3. The visibility filter currently OR's both column sets; simplifying to the real one is a code cleanup, not a behavior change.
4. The Phase 17 FKs to `User.providerId` were always vacuous — no real referential relationship existed.

**Care points**:
1. Step 4 (Prisma schema migration) regenerates the client. Any code that called `application.reviewer` / `application.headAuditor` / `application.scheduler` via the providerId-keyed relations would break — but those relations are unused (production data is null on the source columns anyway).
2. Step 6 (filter simplification) needs careful review of every call site of `withVisibility()`. The 13 unit tests cover the helper but not every call site.
3. The backfill in step 2 only applies to existing data. New writes need the writer migration in step 5 to keep populating the columns, otherwise the new `reviewerId` etc. stay null.

## Suggested PR breakdown

This is a 4-PR sequence, not a single mega-PR:

| PR | Steps | Risk |
|---|---|---|
| Future Phase A | 1, 2 (add new columns + backfill) | Low — additive |
| Future Phase B | 3, 4 (FK constraints + Prisma schema) | Low — additive |
| Future Phase C | 5, 6 (writer migration + filter simplification) | Med — touches assignment write path; regression testing needed |
| Future Phase D | 7 (drop the dead columns) | Low — destructive but everything's null |

After Phase D ships, G3 consumer migration can begin (Future Phase E onwards).

## Out of scope for this analysis

- The `audit_checklists` table also has an `auditorId` column. That references `User.id` and is its own thing — orthogonal to this Application drift sort. The Phase 18 G15 work added a User FK there already.
- `formData.PROVIDERAssignment.reviewerName` and similar denormalised display fields in formData. Those are JSON; clean-up belongs to a different doc.
- The `consumerFeedback.reviewedBy` and a handful of other `*reviewedBy String?` columns elsewhere. They're scoped to their own model and don't have parallel-column drift.

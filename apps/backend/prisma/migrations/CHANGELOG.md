# Migration changelog

A migration ledger that supplements `apps/backend/prisma/migrations/migration_lock.toml`. The lockfile records which migrations have been applied; this file records *what* each one did, *why*, and *how to roll back*.

The audit `docs/audit/2026-04-27-full-system-review.md` flagged that several destructive migrations had no changelog. This file closes that gap.

## How to use this file

- Every NEW migration that drops a column / table / constraint, renames a column, or otherwise loses data MUST add an entry below.
- Additive migrations (new tables, new nullable columns, new indexes) do NOT need entries — Prisma's auto-generated SQL + the migration name are self-documenting.
- Format each entry as:
  - **Migration**: `YYYYMMDDHHMMSS_<name>`
  - **What**: 1-2 sentences, plain English.
  - **Why**: link to the issue / ADR / audit finding that motivated it.
  - **Rollback**: exact commands an operator runs to undo. If irreversible, say "no automated rollback — see Recovery section below".
  - **Backup needed**: yes/no. If yes, which tables and where the backup lives.

## Pre-deploy checklist for destructive migrations

Before merging a PR that ships a destructive migration:

1. The PR description includes the matching CHANGELOG entry below.
2. `scripts/deploy/deploy-production.sh` step 2 (`pg_dump`) is verified
   green for the latest deploy log — i.e., the most recent backup is
   recent enough to roll back this migration.
3. The CHANGELOG entry includes a SQL rollback snippet OR explicitly
   marks the migration as one-way.
4. The deploy is scheduled in a low-traffic window (after-hours Thai
   time) unless the migration is verified to be lock-free.

## Destructive migrations on record

### `20260115092309_add_gacp_inputs`

- **What**: Despite the name "add", drops 13 columns from `harvest_batches`
  including `actualYield`, `estimatedYield`, `plotArea`, `qrCode`, and
  `trackingUrl`. Replaces them with a redesigned shape under
  `gacp_inputs.*` JSONB.
- **Why**: pre-ADR-014 cleanup of legacy harvest schema. Original
  columns were never populated in production beyond mock data.
- **Rollback**: irreversible without restoring from `pg_dump`. The
  dropped columns are not recoverable from the new JSONB layout.
- **Backup needed**: yes — `harvest_batches`. The deploy script
  captures a full DB backup at step 2.

### `20260208160000_replace_farmerid_with_healthid`

- **What**: Drops `farmerId` from `applications` and `invoices`. Replaces
  every reference with `healthId`. FK constraint on the old `farmerId`
  cascades, so dropping was safe at the schema level.
- **Why**: identity-model rename per the long-term naming convention
  (`healthid` for applicants, `providerid` for staff). The legacy term
  `farmer` was inconsistent with healthcare-adjacent terminology.
- **Rollback**: the SQL drops the column; recovery requires re-creating
  `farmerId` from `healthId` via a join through `users`. Documented but
  not scripted.
- **Backup needed**: yes — `applications`, `invoices`.

### `20260213195500_drop_legacy_farmer_staff_columns`

- **What**: Iterates every table that still had `farmerId` / `staffId`
  / `farmer_id` / `staff_id` columns and drops them with `DROP COLUMN
  CASCADE`. Cascades cover any FK pointing at them.
- **Why**: completes the identity-model rename started in
  `20260208160000_replace_farmerid_with_healthid`.
- **Rollback**: irreversible. The cascade is intentional and there's no
  shadow store of the dropped values.
- **Backup needed**: yes — full DB. The dynamic loop makes the affected
  table set hard to enumerate ahead of time.

### `20260222054000_remove_unused_external_identity_token_columns`

- **What**: Drops never-used identity-token columns from `users`. Listed
  in the migration body (around 4 columns).
- **Why**: prune dead schema before ADR-014. The columns held nothing.
- **Rollback**: re-adding the columns is trivial; data was always null.
- **Backup needed**: no.

### `20260425090000_add_application_phase2_expires_at_and_resync_schema`

- **What**: Drops `state` column from `applications`. Adds
  `phase2ExpiresAt` (DateTime?). Resyncs schema with several drift
  fixes.
- **Why**: `state` was a legacy denormalized copy of `status` that
  diverged. The single source of truth is now `status` (with the
  workflow-state machine in `apps/backend/shared/workflow-state-machine.js`).
- **Rollback**: re-add `state` then `UPDATE applications SET state = status`.
  Safe because the column was a copy.
- **Backup needed**: yes — `applications` (full table).
- **Production note**: this is the migration that exposed the orphan
  `trg_sync_app_state_status` trigger on prod (see commit `9a149e9`),
  fixed in `20260427120400_drop_orphan_state_trigger`.

### ADR-014 multi-tenancy migration set

These five migrations land together as the multi-tenancy foundation
(ADR-014). All are forward-only by design — backing out the entire set
is not supported. See `docs/adr/ADR-014-phase-3-handoff.md` for the
sequence rationale.

#### `20260427120000_add_organization_table`

- **What**: New table `organizations` + seed of `slug='default'` row.
- **Rollback**: drop the table. The 48 tenant-scoped tables were not
  modified yet at this point so this migration is reversible alone.
- **Backup needed**: no.

#### `20260427120100_add_organization_id_columns`

- **What**: Adds nullable `organizationId String?` + an index on it to
  48 tenant-scoped tables.
- **Rollback**: drop the column from each table.
- **Backup needed**: no — all values still NULL.

#### `20260427120200_backfill_default_organization`

- **What**: `UPDATE …SET organizationId = '<default-org-id>'` on every
  existing row in those 48 tables.
- **Rollback**: `UPDATE …SET organizationId = NULL`.
- **Backup needed**: no — the operation is recoverable.

#### `20260427120300_add_organization_fk_constraints`

- **What**: Adds `FOREIGN KEY (organizationId) REFERENCES organizations(id)
  ON DELETE RESTRICT ON UPDATE CASCADE` on each of the 48 tables.
- **Rollback**: drop each FK by name. The migration body lists them
  explicitly so dropping is a search/replace.
- **Backup needed**: no — schema only, no data change.
- **Side note**: Prisma schema didn't yet declare the matching `@relation`
  at this point (added in PR C, commit `e248e8e`), so for a brief window
  `prisma migrate dev` reported drift. The PR C commit closed the gap.

#### `20260427120400_drop_orphan_state_trigger`

- **What**: `DROP TRIGGER IF EXISTS` + `DROP FUNCTION IF EXISTS` on
  `trg_sync_app_state_status`. Idempotent with `IF EXISTS`.
- **Why**: a leftover from `prisma db push` early in the project's
  history that wasn't cleaned up when the `state` column was dropped
  in `20260425090000`. The orphan fired during the Phase-1.3 backfill
  and crashed prod with `record "new" has no field "state"`. Surgically
  dropped on prod during that incident; this migration re-applies the
  drop in code so any environment that ever had the orphan inherits the
  cleanup.
- **Rollback**: not meaningful — the trigger is bug-only, no production
  workload depends on it.
- **Backup needed**: no.

### `20260428120000_add_phase2_indexes` (current branch)

- **What**: `CREATE INDEX IF NOT EXISTS` on `applications.rejectCount`
  and `invoices.paymentTransactionId`. Both columns were read on the
  request path but unindexed.
- **Why**: Phase 2 #2.8 of the 2026-04-27 audit — provider list
  endpoint reads `rejectCount`, webhook reconciliation joins
  `paymentTransactionId`. Sequential scans were visible in
  `pg_stat_statements`.
- **Rollback**: `DROP INDEX IF EXISTS "applications_rejectCount_idx";
  DROP INDEX IF EXISTS "invoices_paymentTransactionId_idx";` — both
  safe at any time.
- **Backup needed**: no — additive only.

### `20260929155037_drop_dtam_remittance_schema`

- **What**: Drops table `dtam_remittance_batches` and columns
  `checkout_orders.dtam_fee_amount`, `dtam_remittance_status`, `"remittanceBatchId"`
  (with their FK, indexes and status CHECK). Rewrites
  `checkout_orders_total_arithmetic_check` to `total_payable_amount = platform_fee_gross
  OR status = 'CANCELLED'` and `checkout_orders_amounts_nonnegative_check` without the
  dropped column. Refuses (RAISE `DTAM_SCHEMA_DROP_REFUSED` with counts, nothing
  changed) while any order carries `dtam_fee_amount > 0` and is not CANCELLED, any batch
  is not OPEN, or any other non-CANCELLED row would break the new CHECKs.
- **Why**: operator 2026-09-11 "ถอดออกทั้งระบบ" and 2026-09-29 (the company settles with
  DTAM offline; the platform keeps no DTAM payable, pipeline or split). Contract half of
  `20260802150000_wave1_checkout_engine_expand`; PR1/PR2 removed every reader/writer.
  Plan: `reports/legacy-sweeper/2026-09-29-dtam-remittance-removal-plan.md`.
- **Rollback**: the SQL in the migration's header comment (restores the shape; sets
  `dtam_fee_amount = total_payable_amount - platform_fee_gross` on legacy rows; batch rows
  and remittance statuses do not come back — restore those from the dump). Grants are not
  restored: no migration grants on these tables, so re-apply only hand-made grants. Then
  deploy the previous image (PR2 code reads the dropped columns).
- **Backup needed**: yes — full `pg_dump` of each database right before `migrate deploy`
  (staging: `scripts/deploy/deploy-staging.sh` step 3; demo:
  `/var/backups/gacp/supabase/demo/<ts>_pre-pr3.sql.gz`). Pre-flight (read-only):
  `apps/backend/scripts/ops/check-dtam-schema-drop-preflight.js`. Runbook:
  `docs/operations/runbooks/deploy-pr3-drop-dtam-remittance-schema.md`.

### `20261006130000_certificate_validity_rules`

- **What**: Adds the table `certificate_validity_rules` (effectiveFrom unique; months a whole
  number of years, 12 to 120; a trigger refuses every UPDATE and DELETE) seeded with one rule,
  12 months from 2026-09-11 00:00 Asia/Bangkok. Replaces `certificates."validityYears"`
  (default 3) with `"validityMonths"` (no default, whole years); every existing row is converted
  exactly (years * 12) before the old column is dropped.
- **Why**: operator 2026-10-06 (application redesign phase 0, proposal §5; standing order 24):
  certificate validity is "1 ปีไปก่อน อาจเปลี่ยน", so it is dated data, not a constant. Issuance
  reads the rule in force on the issue date; issued certificates keep their stored term. The
  signed canonical JSON still carries `validityYears = validityMonths / 12` (an archived
  revision snapshot carries that key and is read as stored), so every stored documentHash and
  signature, live or archived, still verifies.
- **Deploy order**: migrate, then swap the image at once, chained with `&&`; staging first,
  then demo, each on its own database. The previous image writes `validityYears` and fails on
  the new schema; the new image is refused at boot on the old one. No expand/contract: the
  platform is pre-production. After each: `GET /api/certificate-validity` answers 12 months,
  and `GET /api/public/verify/:no` (plus `/revisions/1` for a revised certificate) still
  answers VALID. Runbook: `docs/operations/runbooks/deploy-certificate-validity-rules.md`.
- **Rollback**: the SQL in the migration's header comment (exact, every term is whole years);
  then deploy the previous image.
- **Backup needed**: yes, the usual pre-deploy `pg_dump` (the dropped column is recomputable
  from `validityMonths`, so the dump is a safety net, not the rollback path).

### `20261007090000_payment_reminders_by_milestone`

- **What**: Re-keys `payment_reminder_logs` from `invoiceId` to (`applicationId`, `milestone`):
  adds both columns, backfills them from each row's invoice (milestone from the
  `serviceType` suffix), deletes rows whose invoice had no application, then drops
  `invoiceId`, its unique index, index and foreign key. New unique key
  (`applicationId`, `milestone`, `reminderType`, `intendedDate`); FK to `applications`
  ON DELETE CASCADE; CHECK `milestone IN ('M1','M2')`.
- **Why**: operator order 32 (2026-10-07): the unpaid clock counts from the quotation (M1)
  and the document approval (M2). The reminder and closure sweeps worked from invoices,
  which exist only once the applicant presses "pay", so an applicant who never pressed it
  was never reminded and never closed (audit 2026-10-07 D3).
- **Deploy order**: migrate, then swap the image at once (the previous image writes
  `invoiceId`; the new image is refused at boot on the old schema).
- **Rollback**: the SQL in the migration's header comment; rows written after the
  migration have no invoice and are dropped by it. Then deploy the previous image.
- **Backup needed**: the usual pre-deploy `pg_dump` (the table is a dedup ledger; losing
  it at worst re-sends one reminder).

### `20261007100000_special_holidays`

- **What**: Creates `special_holidays` (one row per Bangkok calendar date, unique on `date`)
  with an append-only trigger that refuses UPDATE and DELETE.
- **Why**: operator orders 28 and 32 (2026-10-07): the 5-working-day revision window skips
  special holidays, and a special holiday is dated data that `system_admin_dtam` adds without
  a deploy (audit 2026-10-07 D17). A deadline already stamped is never recomputed.
- **Deploy order**: migrate, then swap the image (the old image never reads the table, so
  migrating first is safe).
- **Rollback**: the SQL in the migration's header comment (drop the table and the trigger
  function, delete the `_prisma_migrations` row), then deploy the previous image. Added
  holidays are lost; deadlines stamped while they existed keep their dates.
- **Backup needed**: the usual pre-deploy `pg_dump`.

### `20261009090000_dispatcher_tasks_close_on_leave`

- **What**: Closes (CANCELLED, with a reason) every open dispatcher task (`work_activities`
  workType `SCHEDULING`) whose application already left the stage that raised it, and deletes the
  `SCHEDULING` row of `sla_policies`.
- **Why**: operator order 27 (2026-10-06). Nothing closed the dispatcher's task on assignment or
  booking, so tasks of applications long past the queue counted as overdue forever (role-workflow
  audit 2026-10-06 dispatcher D6); the status writer now closes it on every stage exit. The
  dispatcher's time limit is dated working-day data in `config/business-rules.js` DISPATCHER, so
  the hours row was a second, dead source an admin could still edit.
- **Deploy order**: migrate and swap the image together (the old image would keep spawning tasks
  it never closes, which is harmless but leaves the same backlog until the next run).
- **Rollback**: the `INSERT` in the migration's header comment restores the policy row; closed
  tasks stay closed (their applications had left the stage).
- **Backup needed**: the usual pre-deploy `pg_dump`.

### `20261107120000_database_session_timezone_utc`

- **What**: `ALTER DATABASE <current database> SET timezone TO 'UTC'`. No table and no row changes.
- **Why**: the schema stores `timestamp(3)` with no zone, so `NOW()`, trigger and default writes are
  right only under a UTC session. On a scratch database set to Asia/Bangkok, 8 of 24 tests failed in
  the visit reminder and staff session suites.
- **Deploy order**: migrate, then start the backend, because the setting reaches new connections
  only. Needs the database owner. See `docs/operations/runbooks/deploy-database-session-timezone.md`
  for the checks before migrate and for the Supabase pooler.
- **Rollback**: `ALTER DATABASE ... RESET timezone` and delete the `_prisma_migrations` row, as in
  the migration's header comment.
- **Backup needed**: the usual pre-deploy `pg_dump`. It does not carry this setting unless taken
  with `--create`, so a database newly created for a restore needs the statement again, and probe
  `db-session-timezone` fails until it has it. Restoring over the existing database keeps the setting.

## Recovery section — full-DB restore from pg_dump

If a migration goes wrong AND its rollback is not reversible, restore
from the pre-deploy backup that `scripts/deploy/deploy-production.sh`
writes at step 2:

```bash
ssh root@152.42.218.251
cd /opt/gacp-platform
LATEST_BACKUP=$(ls -t /var/backups/gacp/ | head -1)
zcat /var/backups/gacp/${LATEST_BACKUP} | docker compose \
  --env-file .env.production \
  -f docker-compose.production.yml \
  exec -T postgres psql -U gacp gacp_db
```

This restores the DB to the state it had when that deploy started.
Any data written between the deploy and the restore is lost. Coordinate
with the on-call schedule before running this.

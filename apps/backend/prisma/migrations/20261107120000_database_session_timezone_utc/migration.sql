-- Every new session of this database runs in UTC.
--
-- The schema stores timestamp(3) with no zone, and Prisma reads those values as UTC. Code that takes
-- the time from Postgres (NOW(), CURRENT_TIMESTAMP in a trigger, a column default) writes the
-- session's wall clock, so under any other zone it stores a shifted value, and a comparison against
-- a stored value matches the wrong rows with no error. Measured on a scratch database set to
-- Asia/Bangkok: visit reminders matched nothing, and a revoke stamp landed seven hours ahead.
--
-- This changes a setting, not a table, and no stored row. Values already written stay as they are.
-- It reaches NEW connections only. See docs/operations/runbooks/deploy-database-session-timezone.md
-- for the restart that has to follow, and scripts/probes/db-session-timezone.sh for the proof.
--
-- Needs the database owner or a superuser. ALTER DATABASE takes a name, not an expression, so the
-- statement is built from current_database(), which also covers staging, demo and scratch names.
--
-- Rollback (manual):
--   DO $$ BEGIN EXECUTE format('ALTER DATABASE %I RESET timezone', current_database()); END $$;
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261107120000_database_session_timezone_utc';
-- then deploy the previous image.

DO $$
BEGIN
    EXECUTE format('ALTER DATABASE %I SET timezone TO ''UTC''', current_database());
END
$$;

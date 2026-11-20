-- Special holidays become dated data an admin adds (operator order 32, 2026-10-07: "วันหยุดพิเศษ
-- เป็นข้อมูลมีวันที่กำกับ ผู้ดูแลฝั่งกรมเพิ่มได้"; order 28: the 5-working-day revision window
-- skips weekends, public, substitute AND special holidays).
--
-- Before: every holiday was a table in code (utils/working-days.js), so a special holiday the
-- cabinet announced at short notice did not count until a deploy.
-- After: special_holidays holds one row per added day (the Bangkok calendar date). The working-day
-- helper reads the built-in calendar AND these rows, reloaded at boot, every hour and right after an
-- add. What a later holiday changes: a deadline stamped into a row (a revision due date, a minted
-- invoice dueDate) keeps its value; an unpaid milestone with no invoice yet has its due date
-- recomputed from its clock start on every reminder/closure sweep, so it moves.
--
-- APPEND-ONLY: triggers refuse every UPDATE, DELETE and TRUNCATE; the row is the record of why a
-- deadline falls where it does. One row per date.
--
-- Rollback (manual):
--   BEGIN;
--   DROP TABLE "special_holidays";
--   DROP FUNCTION "special_holidays_refuse_change"();
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261007100000_special_holidays';
--   COMMIT;
-- then deploy the previous image.

CREATE TABLE "special_holidays" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "special_holidays_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "special_holidays_date_key" ON "special_holidays"("date");

CREATE FUNCTION "special_holidays_refuse_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'special_holidays is append-only: % refused', TG_OP;
END;
$$;

CREATE TRIGGER "special_holidays_append_only"
    BEFORE UPDATE OR DELETE ON "special_holidays"
    FOR EACH ROW EXECUTE FUNCTION "special_holidays_refuse_change"();

CREATE TRIGGER "special_holidays_no_truncate"
    BEFORE TRUNCATE ON "special_holidays"
    FOR EACH STATEMENT EXECUTE FUNCTION "special_holidays_refuse_change"();

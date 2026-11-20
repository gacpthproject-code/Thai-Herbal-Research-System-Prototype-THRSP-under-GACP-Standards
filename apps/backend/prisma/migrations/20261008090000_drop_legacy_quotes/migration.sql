-- Drop the batch-11 legacy `quotes` table and invoices."quoteId" (F21, live walk 2026-10-07;
-- D1 of the approver/finance audit 2026-10-06). Nothing writes or reads them any more: the
-- /api/quotes door and its service were deleted in the same change, and the applicant's
-- quotation is the `quotations` table on the checkout rail.
--
-- Refuse rather than lose data: if any quote row, or any invoice still pointing at one,
-- exists on the database this runs against, the migration stops and nothing is dropped.
-- The operator then decides what happens to those rows.
--
-- The old image keeps serving /api/quotes while this runs. Both tables are locked before
-- they are looked at, in the transaction that drops them, so a quote it writes either
-- commits before the check (and the migration refuses) or waits until the drop is done.
--
-- While the lock request waits for a transaction that already holds "invoices", every new
-- invoice read queues behind it. So it waits 5 seconds at most: past that the deploy fails
-- with "canceling statement due to lock timeout", nothing is dropped, and Prisma records the
-- migration as failed. Run `prisma migrate resolve --rolled-back 20261008090000_drop_legacy_quotes`
-- and deploy again when the database is quieter. SET LOCAL holds for this migration only:
-- prisma migrate deploy runs the file as one implicit transaction.
SET LOCAL lock_timeout = '5s';
LOCK TABLE "quotes", "invoices" IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "quotes") THEN
        RAISE EXCEPTION 'drop_legacy_quotes: % row(s) in "quotes" — refusing to drop; operator decides',
            (SELECT count(*) FROM "quotes");
    END IF;
    IF EXISTS (SELECT 1 FROM "invoices" WHERE "quoteId" IS NOT NULL) THEN
        RAISE EXCEPTION 'drop_legacy_quotes: invoices still reference a quote — refusing to drop; operator decides';
    END IF;
END $$;

ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_quoteId_fkey";
DROP INDEX IF EXISTS "invoices_quoteId_idx";
ALTER TABLE "invoices" DROP COLUMN "quoteId";
DROP TABLE "quotes";

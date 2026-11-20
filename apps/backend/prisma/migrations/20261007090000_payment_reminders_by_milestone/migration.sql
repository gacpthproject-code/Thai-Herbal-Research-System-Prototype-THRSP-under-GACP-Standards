-- Payment reminders keyed by application + milestone, not by invoice (operator order 32,
-- 2026-10-07: "ไม่ชำระ: นับกำหนดงวด 1 จากวันออกใบเสนอราคา งวด 2 จากวันที่เอกสารผ่าน
-- เลยกำหนด = EXPIRED").
--
-- Before: the reminder and closure sweeps worked from checkout invoices, and an invoice is
-- minted only when the applicant presses "pay". An applicant who never pressed it was never
-- reminded and never closed: the application sat at PENDING_DOC_FEE / PENDING_AUDIT_FEE
-- forever (audit 2026-10-07 D3).
-- After: the unpaid clock starts at the quotation (M1) or the document approval (M2), and the
-- dedup ledger is keyed (applicationId, milestone, reminderType, intendedDate).
--
-- Existing rows are carried over: applicationId from their invoice, milestone from the
-- invoice serviceType suffix (CERTIFICATION_CHECKOUT_M1 / _M2; the legacy un-suffixed
-- CERTIFICATION_CHECKOUT was M1). A row whose invoice has no application cannot belong to any
-- clock and is removed.
--
-- Rollback (manual; rows written after this migration have no invoice and are dropped):
--   BEGIN;
--   ALTER TABLE "payment_reminder_logs" ADD COLUMN "invoiceId" TEXT;
--   UPDATE "payment_reminder_logs" r SET "invoiceId" = i.id FROM "invoices" i
--     WHERE i."applicationId" = r."applicationId" AND i."isDeleted" = false
--       AND i."serviceType" = 'CERTIFICATION_CHECKOUT_' || r."milestone";
--   DELETE FROM "payment_reminder_logs" WHERE "invoiceId" IS NULL;
--   ALTER TABLE "payment_reminder_logs" ALTER COLUMN "invoiceId" SET NOT NULL;
--   DROP INDEX "payment_reminder_logs_applicationId_milestone_reminderType__key";
--   DROP INDEX "payment_reminder_logs_applicationId_idx";
--   ALTER TABLE "payment_reminder_logs" DROP CONSTRAINT "payment_reminder_logs_applicationId_fkey";
--   ALTER TABLE "payment_reminder_logs" DROP COLUMN "applicationId", DROP COLUMN "milestone";
--   CREATE UNIQUE INDEX "payment_reminder_logs_invoiceId_reminderType_intendedDate_key"
--     ON "payment_reminder_logs"("invoiceId", "reminderType", "intendedDate");
--   CREATE INDEX "payment_reminder_logs_invoiceId_idx" ON "payment_reminder_logs"("invoiceId");
--   ALTER TABLE "payment_reminder_logs" ADD CONSTRAINT "payment_reminder_logs_invoiceId_fkey"
--     FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261007090000_payment_reminders_by_milestone';
--   COMMIT;
-- then deploy the previous image.

ALTER TABLE "payment_reminder_logs" ADD COLUMN "applicationId" TEXT, ADD COLUMN "milestone" TEXT;

UPDATE "payment_reminder_logs" r
   SET "applicationId" = i."applicationId",
       "milestone" = CASE WHEN i."serviceType" LIKE '%\_M2' ESCAPE '\' THEN 'M2' ELSE 'M1' END
  FROM "invoices" i
 WHERE i.id = r."invoiceId";

DELETE FROM "payment_reminder_logs" WHERE "applicationId" IS NULL;

ALTER TABLE "payment_reminder_logs"
  ALTER COLUMN "applicationId" SET NOT NULL,
  ALTER COLUMN "milestone" SET NOT NULL,
  ADD CONSTRAINT "payment_reminder_logs_milestone_check" CHECK ("milestone" IN ('M1', 'M2'));

DROP INDEX IF EXISTS "payment_reminder_logs_invoiceId_reminderType_intendedDate_key";
DROP INDEX IF EXISTS "payment_reminder_logs_invoiceId_idx";
ALTER TABLE "payment_reminder_logs" DROP CONSTRAINT IF EXISTS "payment_reminder_logs_invoiceId_fkey";
ALTER TABLE "payment_reminder_logs" DROP COLUMN "invoiceId";

CREATE UNIQUE INDEX "payment_reminder_logs_applicationId_milestone_reminderType__key"
  ON "payment_reminder_logs"("applicationId", "milestone", "reminderType", "intendedDate");
CREATE INDEX "payment_reminder_logs_applicationId_idx" ON "payment_reminder_logs"("applicationId");

ALTER TABLE "payment_reminder_logs" ADD CONSTRAINT "payment_reminder_logs_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

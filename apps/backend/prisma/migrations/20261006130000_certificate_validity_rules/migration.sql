-- Certificate validity becomes dated data (application redesign phase 0, operator 2026-10-06:
-- "อายุใบรับรอง 1 ปีไปก่อน อาจเปลี่ยน" — treat it as configurable, dated data).
--
-- Before: a constant in code (config/business-rules.js CERTIFICATE.VALIDITY_YEARS = 1) plus a
-- column default of 3 years on certificates."validityYears" that no longer matched it.
-- After:  certificate_validity_rules holds one row per ruling: from effectiveFrom on, a newly
-- issued certificate lasts `months`. Issuance reads the rule whose effectiveFrom is the latest
-- one at or before the issue instant. A later rule never touches a certificate already issued:
-- each certificate stores its own validityMonths and expiryDate.
--
-- APPEND-ONLY. A change of term is a new row with a later effectiveFrom, never an UPDATE: the
-- row that was in force is the record of why an existing certificate expires when it does.
-- The trigger certificate_validity_rules_append_only refuses every UPDATE and DELETE.
--
-- WHOLE YEARS ONLY. The operator ruling is a term in years (1 year now); months is the unit so a
-- later ruling can allow other terms, but until one does, a rule and a certificate both hold a
-- multiple of 12 months, at most 120. That keeps the signed validityYears (months / 12) an
-- integer and keeps the rollback below exact.
--
-- certificates."validityYears" (default 3) becomes "validityMonths" (no default). Every existing
-- row is converted exactly (years * 12); the signed canonical JSON still carries the key
-- validityYears = validityMonths / 12 (services/certificate-service.js certificateCanonicalJson),
-- so the stored documentHash and signature of every issued certificate still verify.
--
-- Rollback (manual; exact because every term is whole years):
--   BEGIN;
--   ALTER TABLE "certificates" ADD COLUMN "validityYears" INTEGER NOT NULL DEFAULT 3;
--   UPDATE "certificates" SET "validityYears" = "validityMonths" / 12;
--   ALTER TABLE "certificates" DROP COLUMN "validityMonths";
--   DROP TABLE "certificate_validity_rules";
--   DROP FUNCTION "certificate_validity_rules_refuse_change"();
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261006130000_certificate_validity_rules';
--   COMMIT;
-- then deploy the previous image.

CREATE TABLE "certificate_validity_rules" (
    "id" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "months" INTEGER NOT NULL,
    "createdBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificate_validity_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "certificate_validity_rules_months_whole_years" CHECK ("months" > 0 AND "months" <= 120 AND "months" % 12 = 0)
);

CREATE FUNCTION "certificate_validity_rules_refuse_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'certificate_validity_rules is append-only: % refused; add a rule with a later effectiveFrom', TG_OP
        USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "certificate_validity_rules_append_only"
    BEFORE UPDATE OR DELETE ON "certificate_validity_rules"
    FOR EACH ROW EXECUTE FUNCTION "certificate_validity_rules_refuse_change"();

CREATE UNIQUE INDEX "certificate_validity_rules_effectiveFrom_key" ON "certificate_validity_rules"("effectiveFrom");

-- The rule in force today: 12 months from 2026-09-11 00:00 Asia/Bangkok, the day the operator
-- set one year (commit a22007e4). Certificates issued before that date keep their stored term.
INSERT INTO "certificate_validity_rules" ("id", "effectiveFrom", "months", "createdBy", "reason")
VALUES (
    'b3f0c1de-2026-4911-8a12-000000000012',
    TIMESTAMP '2026-09-10 17:00:00',
    12,
    'operator',
    'operator 2026-09-11: อายุใบรับรอง 1 ปี (ยืนยันซ้ำ 2026-10-06: 1 ปีไปก่อน อาจเปลี่ยน)'
);

ALTER TABLE "certificates" ADD COLUMN "validityMonths" INTEGER;
UPDATE "certificates" SET "validityMonths" = "validityYears" * 12;
ALTER TABLE "certificates" ALTER COLUMN "validityMonths" SET NOT NULL;
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_validity_months_whole_years" CHECK ("validityMonths" > 0 AND "validityMonths" % 12 = 0);
ALTER TABLE "certificates" DROP COLUMN "validityYears";

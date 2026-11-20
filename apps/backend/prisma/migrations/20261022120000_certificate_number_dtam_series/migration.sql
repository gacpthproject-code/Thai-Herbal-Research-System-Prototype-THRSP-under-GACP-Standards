-- Certificate numbers join DTAM's own series, `{n}/{ปี พ.ศ.}` (operator order 134 task 1).
--
-- Additive only. Nothing that exists is changed: issued certificate numbers stay as they are,
-- and receipt_sequences keeps the 'TH-GACP' counters, so staging and demo continue numbering
-- from what they hold (order 135).
--
-- 1. blocked_certificate_numbers: numbers DTAM issued itself. Empty here; it is filled from the
--    register by scripts/seed-blocked-certificate-numbers.js, which reads a list kept outside
--    the repository.
-- 2. Two of the three numbering settings, as system_configs rows the operator can change with
--    scripts/set-certificate-numbering.js. The third, certificate.number.year-start, is NOT
--    seeded: the operator sets DTAM's real next number on release day (order 135). Until then
--    each year starts at the new-year rule's firstNumber, or continues past the counter.
--    ON CONFLICT DO NOTHING keeps a value already set.
--
-- Rollback (manual):
--   BEGIN;
--   DROP TABLE "blocked_certificate_numbers";
--   DELETE FROM "system_configs" WHERE "key" IN ('certificate.number.format', 'certificate.number.year-start', 'certificate.number.new-year-rule');
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261022120000_certificate_number_dtam_series';
--   COMMIT;
-- then deploy the previous image. Certificates issued meanwhile keep their `{n}/{ปี}` numbers;
-- the previous image still finds them only by exact stored value, not by the slug `{n}-{ปี}`.

CREATE TABLE "blocked_certificate_numbers" (
    "year" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_certificate_numbers_pkey" PRIMARY KEY ("year", "number"),
    CONSTRAINT "blocked_certificate_numbers_year_be" CHECK ("year" BETWEEN 2500 AND 2599),
    CONSTRAINT "blocked_certificate_numbers_number_positive" CHECK ("number" > 0)
);

INSERT INTO "system_configs" ("key", "value", "type", "description", "updatedBy", "updatedAt")
VALUES
    ('certificate.number.format', '{n}/{year}', 'STRING',
     'รูปแบบเลขใบรับรอง {n}/{year} ตามชุดเลขของกรม (คำสั่ง 134)', 'migration 20261022120000', CURRENT_TIMESTAMP),
    ('certificate.number.new-year-rule', '{"rule":"RESTART","firstNumber":1}', 'JSON',
     'ขึ้นปี พ.ศ. ใหม่ (เวลากรุงเทพ) เริ่มเลขที่ firstNumber (คำสั่ง 134)', 'migration 20261022120000', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

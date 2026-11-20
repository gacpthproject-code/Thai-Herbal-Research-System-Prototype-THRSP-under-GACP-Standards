-- The certificate holder record (operator orders 134 task 2 and 142).
--
-- Additive only. Two columns on "entities" say who vouches for the holder's identity:
--   identitySource      THAID | MORPROM when a verified login of the person whose national ID
--                       this INDIVIDUAL holder carries filled it; SELF_DECLARED otherwise.
--   identityVerifiedAt  when that verified login happened.
-- Every existing row becomes SELF_DECLARED: no row was ever filled from verified claims, so
-- claiming otherwise would be a guess. A later ThaiD login with the same ID upgrades it.
--
-- The PARTNERSHIP holder type and the rest of the holder record (person or signatory,
-- contact, house code under "payload".holder) need no DDL: "type" is TEXT and "payload" is
-- JSONB, both read through shared/holder-registry.js.
--
-- Rollback (manual):
--   BEGIN;
--   ALTER TABLE "entities" DROP CONSTRAINT "entities_identity_source_ck";
--   ALTER TABLE "entities" DROP COLUMN "identityVerifiedAt";
--   ALTER TABLE "entities" DROP COLUMN "identitySource";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261027120000_holder_identity_source';
--   COMMIT;
-- then deploy the previous image. Rows created meanwhile with type PARTNERSHIP stay; the
-- previous image reads them as an unknown holder type (no payer label, no step-2 fields).

ALTER TABLE "entities" ADD COLUMN "identitySource" TEXT NOT NULL DEFAULT 'SELF_DECLARED';
ALTER TABLE "entities" ADD COLUMN "identityVerifiedAt" TIMESTAMP(3);
ALTER TABLE "entities" ADD CONSTRAINT "entities_identity_source_ck"
    CHECK ("identitySource" IN ('THAID', 'MORPROM', 'SELF_DECLARED'));

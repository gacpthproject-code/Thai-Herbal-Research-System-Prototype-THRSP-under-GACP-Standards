-- Research consent on survey answers and expert interviews (operator order 34(5), 2026-10-07:
-- "ขอความยินยอมเพื่อการวิจัยก่อนตอบ"; modules audit 2026-10-07 finding D5).
--
-- survey_responses: the notice version the respondent accepted and when; and when the
-- respondent withdrew. A row with no consent (every row stored before this migration) is never
-- exported to the project research data store. The respondentUserId index serves the PDPA erasure
-- and withdrawal lookups (survey-service.anonymiseResponsesOfUser).
--
-- respondentMarker: keyed HMAC of (templateId, respondent User.id). Its unique index makes one
-- response per account per template, concurrent submits included. Withdrawal keeps the marker so a
-- withdrawn account cannot answer the same template again; erasure clears it. NULLs are distinct,
-- so rows stored before this migration and rows of erased accounts never collide.
--
-- expert_interviews: the interviewee's consent and its date, required before a transcript is
-- saved; and when the interviewee withdrew (the row is then anonymised).
--
-- Additive only: nullable columns, one boolean with a default, two indexes. No data is rewritten.
--
-- Rollback (manual):
--   BEGIN;
--   DROP INDEX IF EXISTS "survey_responses_templateId_respondentMarker_key";
--   DROP INDEX IF EXISTS "survey_responses_respondentUserId_idx";
--   ALTER TABLE "survey_responses" DROP COLUMN "respondentMarker", DROP COLUMN "researchConsentVersion",
--     DROP COLUMN "researchConsentAt", DROP COLUMN "researchConsentWithdrawnAt";
--   ALTER TABLE "expert_interviews" DROP COLUMN "intervieweeConsentGiven",
--     DROP COLUMN "intervieweeConsentDate", DROP COLUMN "intervieweeConsentWithdrawnAt";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261007110000_survey_research_consent';
--   COMMIT;

ALTER TABLE "survey_responses" ADD COLUMN "respondentMarker" TEXT,
ADD COLUMN "researchConsentVersion" TEXT,
ADD COLUMN "researchConsentAt" TIMESTAMP(3),
ADD COLUMN "researchConsentWithdrawnAt" TIMESTAMP(3);

ALTER TABLE "expert_interviews" ADD COLUMN "intervieweeConsentGiven" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "intervieweeConsentDate" TIMESTAMP(3),
ADD COLUMN "intervieweeConsentWithdrawnAt" TIMESTAMP(3);

CREATE INDEX "survey_responses_respondentUserId_idx" ON "survey_responses"("respondentUserId");

CREATE UNIQUE INDEX "survey_responses_templateId_respondentMarker_key" ON "survey_responses"("templateId", "respondentMarker");

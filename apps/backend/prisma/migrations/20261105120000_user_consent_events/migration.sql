-- History of every consent grant and withdrawal (operator order 160, 2026-11-05).
--
-- user_consents keeps one row per (user, category) and every write overwrites it, so the version
-- a person acknowledged before the latest one is lost. From now on the trigger
-- user_consents_record_event copies every insert, and every update that sets granted, version,
-- grantedAt or withdrawnAt (every consent-manager write sets all four), into user_consent_events
-- inside the same statement. Every writer is
-- covered, and the history costs the app no extra round trip. The screen comes from
-- metadata.source, which middleware/consent-manager.js sets from a closed list; anything else is
-- UNSPECIFIED. It records the screen the client says it showed, not a fact the server observed. An update that only blanks ipAddress or userAgent (PDPA erasure) adds no event.
--
-- ADDITIVE ONLY. A new table, two triggers, and a copy of today's user_consents rows into the new
-- table. No existing row is updated or deleted: the rows recorded at version 1.0.0 stay exactly
-- as they are, and their copies say source = 'CARRIED_FROM_CONSENT_ROW' with the row's own
-- updatedAt as the time, because that is the only history that exists for them.
--
-- APPEND-ONLY. The triggers user_consent_events_append_only and user_consent_events_no_truncate
-- refuse every UPDATE, DELETE and TRUNCATE.
-- No column holds an IP address or user agent, so PDPA erasure has nothing to scrub here:
-- userId points at a user row that erasure anonymizes in place.
--
-- Rollback (manual):
--   BEGIN;
--   DROP TRIGGER "user_consents_record_event" ON "user_consents";
--   DROP FUNCTION "user_consents_record_event"();
--   DROP TABLE "user_consent_events";
--   DROP FUNCTION "user_consent_events_refuse_change"();
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261105120000_user_consent_events';
--   COMMIT;
-- then deploy the previous image. No user_consents row is changed in either direction.

CREATE TABLE "user_consent_events" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "user_consent_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_consent_events_source_ck" CHECK ("source" IN (
        'REGISTRATION', 'APPLICATION_REVIEW', 'UPDATE_PROMPT', 'WORDING_NOTICE', 'UNSPECIFIED',
        'CARRIED_FROM_CONSENT_ROW'
    ))
);

CREATE INDEX "user_consent_events_userId_category_createdAt_idx" ON "user_consent_events"("userId", "category", "createdAt");
CREATE INDEX "user_consent_events_organizationId_idx" ON "user_consent_events"("organizationId");

ALTER TABLE "user_consent_events" ADD CONSTRAINT "user_consent_events_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_consent_events" ADD CONSTRAINT "user_consent_events_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "user_consent_events" ("id", "createdAt", "userId", "category", "version", "granted", "source", "organizationId")
SELECT gen_random_uuid()::text, c."updatedAt", c."userId", c."category", c."version", c."granted",
       'CARRIED_FROM_CONSENT_ROW', c."organizationId"
FROM "user_consents" c;

CREATE FUNCTION "user_consent_events_refuse_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'user_consent_events is append-only: % refused; record a new grant or withdrawal instead', TG_OP
        USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "user_consent_events_append_only"
    BEFORE UPDATE OR DELETE ON "user_consent_events"
    FOR EACH ROW EXECUTE FUNCTION "user_consent_events_refuse_change"();

CREATE TRIGGER "user_consent_events_no_truncate"
    BEFORE TRUNCATE ON "user_consent_events"
    FOR EACH STATEMENT EXECUTE FUNCTION "user_consent_events_refuse_change"();

ALTER TABLE "user_consent_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_consent_events_observe_tenant" ON "user_consent_events"
    FOR ALL
    TO PUBLIC
    USING (rls_observe_check('user_consent_events', "organizationId"))
    WITH CHECK (rls_observe_check('user_consent_events', "organizationId"));

CREATE FUNCTION "user_consents_record_event"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    meta jsonb := NEW."metadata";
    src text;
BEGIN
    IF jsonb_typeof(meta) = 'string' THEN
        BEGIN
            meta := (meta #>> '{}')::jsonb;
        EXCEPTION WHEN others THEN
            meta := NULL;
        END;
    END IF;
    IF jsonb_typeof(meta) = 'object' THEN
        src := meta ->> 'source';
    END IF;
    IF src IS NULL OR src NOT IN ('REGISTRATION', 'APPLICATION_REVIEW', 'UPDATE_PROMPT', 'WORDING_NOTICE') THEN
        src := 'UNSPECIFIED';
    END IF;
    INSERT INTO "user_consent_events" ("id", "createdAt", "userId", "category", "version", "granted", "source", "organizationId")
    VALUES (gen_random_uuid()::text, CURRENT_TIMESTAMP, NEW."userId", NEW."category", NEW."version", NEW."granted", src, NEW."organizationId");
    RETURN NULL;
END;
$$;

CREATE TRIGGER "user_consents_record_event"
    AFTER INSERT OR UPDATE OF "granted", "version", "grantedAt", "withdrawnAt" ON "user_consents"
    FOR EACH ROW EXECUTE FUNCTION "user_consents_record_event"();

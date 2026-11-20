-- How many accounts the next PDPA retention sweep (02:30 Asia/Bangkok) will anonymize, read-only.
-- Run as: psql ... -f next-run-count.sql   (opens a READ ONLY transaction; writes nothing)
-- Counts only; prints no names, ids or numbers of any person.
BEGIN READ ONLY;
SELECT
  count(*) FILTER (WHERE NOT "isDeleted")                                         AS open_accounts,
  count(*) FILTER (WHERE "isDeleted" AND "privacySettings"->'pdpaErasure'->>'status' = 'EXECUTED') AS erased_by_door_before_fix,
  count(*) FILTER (WHERE "isDeleted" AND coalesce("privacySettings"->'pdpaErasure'->>'status', '') <> 'EXECUTED') AS closed_by_one_step_button,
  count(*)                                                                         AS total_next_run
FROM users
WHERE "retainUntil" <= now() AND "legalHold" = false AND "isAnonymized" = false;
-- Closed or erased accounts still holding identifying values but NOT yet past retention:
-- the sweep reaches them only when retainUntil passes.
SELECT
  count(*) FILTER (WHERE "isDeleted" AND "privacySettings"->'pdpaErasure'->>'status' = 'EXECUTED') AS erased_waiting_for_retention,
  count(*) FILTER (WHERE "isDeleted" AND coalesce("privacySettings"->'pdpaErasure'->>'status', '') <> 'EXECUTED') AS closed_waiting_for_retention
FROM users
WHERE "retainUntil" > now() AND "isAnonymized" = false;
ROLLBACK;

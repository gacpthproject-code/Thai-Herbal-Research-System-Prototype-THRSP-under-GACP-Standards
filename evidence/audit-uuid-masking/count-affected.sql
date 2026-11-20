-- Read-only count of audit_logs rows whose metadata holds a UUID that the old
-- national-ID masker corrupted (main before fix/audit-uuid-masking): the mask
-- "d-XXXX-XXXX-X-dddd" glued to a hex character / hex group on either side.
--
-- UPPER BOUND, not an exact count: a real ID written glued to hex letters
-- (e.g. "ID1100000000008" -> "ID1-XXXX-XXXX-X-0008", or "...0008abc") is
-- counted too. Checked on 20,000 synthetic rows made with main's masker:
-- 224 counted = 224 truly corrupted (no glued-ID rows in that sample).
-- Coordinator ran it read-only 2026-10-03: staging 0 of 223 rows, demo 0 of 302.
-- Nothing is repairable: the original digits are gone.
BEGIN READ ONLY;
SELECT count(*)           AS affected_rows,
       min("timestamp")   AS first_seen,
       max("timestamp")   AS last_seen
FROM audit_logs
WHERE metadata IS NOT NULL
  AND metadata::text ~ '([a-fA-F]|[0-9a-fA-F]-)[0-9]-XXXX-XXXX-X-[0-9]{4}|[0-9]-XXXX-XXXX-X-[0-9]{4}([a-fA-F]|-[0-9a-fA-F])';
ROLLBACK;

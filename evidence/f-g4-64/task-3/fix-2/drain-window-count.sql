-- F-G4-64 — the drain window, counted before the gate goes live.
-- Coordinator ruling 5. READ-ONLY: every statement is a SELECT. Nothing here
-- writes, and nothing here should be run with --apply.
--
-- WHY THIS FILE EXISTS AND IS NOT ALREADY ANSWERED
-- Fix round 1 removed the slip rail's PHASE_1-only exemption
-- (services/payment-slip-service.js, assertQuotationAcceptedForSlip) and its
-- legacy fail-open. Two populations that could upload a slip yesterday cannot
-- after this merge:
--   (a) an application at a slip-uploadable state whose quotation is not
--       ACCEPTED/INVOICED — including every application that paid Phase 1 on
--       the CARD rail, where no gate ever demanded acceptance;
--   (b) an application with NO quotation row at all, which used to fail OPEN.
-- Ruling 5 assigns the counting to T5, and T5 counts PENDING_PAYMENT checkout
-- orders only. Query A below widens it to the slip rail. T5 does not exist in
-- the tree yet (execution order T1,T2,T3,T4,T7,T5...), so this file is the
-- artifact that carries the requirement until T5 lands.
--
-- WHO RUNS IT: the coordinator or the operator, against the demo database.
-- The implementer could not: reading DATABASE_URL is forbidden by the task's
-- hard rules, and the local server is unreachable. The count is therefore
-- reported as NOT DONE, not as zero.
--
-- SCHEMA PROVENANCE (checked, not assumed):
--   applications           prisma/schema/application.prisma:265  (@@map)
--   quotations             prisma/schema/billing.prisma:799      (@@map), isDeleted at :786
--   checkout_orders        prisma/schema/billing.prisma:1354     (@@map), no isDeleted column
--   uploadable states      services/payment-slip-service.js:332-348 (PHASE_STATE_TRANSITIONS)
--   accepted states        services/billing/quotation-gate.js (QUOTATION_ACCEPTED_STATES)


-- ── A. THE SLIP RAIL (the population the reviewer says nobody has counted) ───
-- Every application sitting at a state from which a slip may be uploaded
-- (PHASE_STATE_TRANSITIONS upload.from and upload.to, both phases) that has no
-- ACCEPTED or INVOICED quotation. Each row is an applicant who can no longer
-- pay by bank transfer until they accept a quotation — and, for the rows with
-- no quotation at all, until T7's self-heal issues one.
SELECT
    a.id,
    a."applicationNumber",
    a.status,
    (a."formData" ->> 'renewalOf') IS NOT NULL              AS is_renewal,
    q_any.n_rows                                            AS quotation_rows_total,
    CASE WHEN q_any.n_rows = 0 THEN 'NO_QUOTATION_AT_ALL'
         ELSE 'HAS_ROW_BUT_NOT_ACCEPTED' END                AS drain_reason
FROM applications a
LEFT JOIN LATERAL (
    SELECT count(*) AS n_rows
    FROM quotations q
    WHERE q."applicationId" = a.id AND q."isDeleted" = false
) q_any ON true
WHERE a."isDeleted" = false
  AND a.status IN (
      'PENDING_DOC_FEE', 'PHASE_1_SLIP_UNDER_REVIEW',   -- PHASE_1 upload.from / upload.to
      'PENDING_AUDIT_FEE', 'PHASE_2_SLIP_UNDER_REVIEW'  -- PHASE_2 upload.from / upload.to
  )
  AND NOT EXISTS (
      SELECT 1 FROM quotations q
      WHERE q."applicationId" = a.id
        AND q."isDeleted" = false
        AND q.status IN ('ACCEPTED', 'INVOICED')
  )
ORDER BY a.status, a.id;


-- ── A2. The same population as ONE number per bucket, for the evidence pack ──
SELECT
    a.status,
    CASE WHEN (a."formData" ->> 'renewalOf') IS NOT NULL THEN 'RENEWAL' ELSE 'NEW' END AS kind,
    count(*) AS affected
FROM applications a
WHERE a."isDeleted" = false
  AND a.status IN ('PENDING_DOC_FEE', 'PHASE_1_SLIP_UNDER_REVIEW',
                   'PENDING_AUDIT_FEE', 'PHASE_2_SLIP_UNDER_REVIEW')
  AND NOT EXISTS (
      SELECT 1 FROM quotations q
      WHERE q."applicationId" = a.id AND q."isDeleted" = false
        AND q.status IN ('ACCEPTED', 'INVOICED')
  )
GROUP BY 1, 2
ORDER BY 1, 2;


-- ── B. THE CARD RAIL (ruling 5's original scope — T5 owns this half) ────────
-- A PENDING_PAYMENT order for an application whose quotation is not accepted
-- cannot be re-entered once the gate is live.
SELECT
    c.id AS checkout_order_id,
    c."applicationId",
    c.milestone,
    c.status,
    a.status AS application_status
FROM checkout_orders c
JOIN applications a ON a.id = c."applicationId"
WHERE c.status = 'PENDING_PAYMENT'
  AND a."isDeleted" = false
  AND NOT EXISTS (
      SELECT 1 FROM quotations q
      WHERE q."applicationId" = c."applicationId"
        AND q."isDeleted" = false
        AND q.status IN ('ACCEPTED', 'INVOICED')
  )
ORDER BY c."applicationId";


-- ── C. THE RENEWAL BACKFILL QUESTION THIS ROUND'S BLOCKER FIX RAISES ────────
-- Renewals created BEFORE this merge carry no cultivationScopeCount (the column
-- was never stamped; totalAreaTypes took its schema default of 1). Any such row
-- whose formData declares more than one cultivation method was quoted for ONE
-- scope while the checkout rail would charge for N.
-- READ-ONLY, and deliberately NOT a repair: L3 forbids an agent mutating a
-- money path. If this returns rows, the operator decides the remedy.
SELECT
    a.id,
    a."applicationNumber",
    a.status,
    a."cultivationScopeCount",
    a."totalAreaTypes",
    a."formData" -> 'cultivationMethods' AS declared_methods,
    jsonb_array_length(COALESCE(a."formData" -> 'cultivationMethods', '[]'::jsonb)) AS declared_method_count
FROM applications a
WHERE a."isDeleted" = false
  AND (a."formData" ->> 'renewalOf') IS NOT NULL
  AND jsonb_typeof(a."formData" -> 'cultivationMethods') = 'array'
  AND jsonb_array_length(a."formData" -> 'cultivationMethods')
      > COALESCE(a."cultivationScopeCount", a."totalAreaTypes", 1)
ORDER BY a.id;
-- NOTE on C's precision: it compares against the RAW array length, while the
-- code counts DISTINCT normalised methods (fee-service collectUniqueCultivation
-- Methods). A renewal that declares ['outdoor','outdoor'] is one scope in code
-- and would show here as a false positive. C is a screen, not a verdict: every
-- row it returns must be re-checked with resolveCultivationScopeCount before
-- anything is concluded about it.

# Defect batch B: scheduling doors, 2026-10-05, branch fix/audit-scheduling-doors (from main f8daa816, not pushed)

Commits (5656fd4b, 89de8ea1, 7dd5934b, 6b4e9619, e39afb4b, 747a6ada), see `git log f8daa816..`.

| # | Item | Status | Where |
|---|---|---|---|
| 1 | Reschedule AUDIT_CONFIRMED via the calendar door | fixed | scheduler-audit-schedules-post-handler.js: accepts AUDIT_FEE_PAID or AUDIT_CONFIRMED; same guards plus the per-day cap (the calendar door previously had overlap only, not the cap); no status transition; application + evidence row in one tx |
| 2 | Calendar defaults ONSITE, shows backend warning | fixed | calendar/client-view.tsx, schedule-modal.tsx, schedule-evidence.ts; banner stays until dismissed; backend evidenceNote now plain Thai |
| 3 | Reassign updates both auditorId columns in one tx | fixed | audits-reassign.js + rebindEvidenceAuditor (arm-onsite-evidence.js); approveReschedule does the same |
| 4 | One Thai notification builder, both parties, Bangkok BE date | fixed | services/audit/audit-schedule-notices.js, used by queue door, calendar door, approveReschedule |
| 5 | Disclosure toggle restricted | fixed | audit-notes-disclosure.js: assigned inspector of that application or system_admin_dtam; item must belong to the path audit (was unchecked) |
| 6 | Per-slot request creates the deadline | fixed | workflow-side-effects.buildRevisionDeadlineFormData shared by both doors + handleRevisionDeadlines |
| 7 | Reviewer != inspector | fixed | shared/reviewer-inspector-separation.js; refused at assign reviewer, reviewer reassign, queue assign, calendar, audits-reassign, approveReschedule, and at decision (document-reviews verdict+decision, auditor audit-decision, onsite submitDecision). Codes REVIEWER_IS_APPLICATION_INSPECTOR, INSPECTOR_IS_APPLICATION_REVIEWER, DECISION_BY_REVIEWER_AND_INSPECTOR, DISCLOSURE_NOT_PERMITTED |
| 8 | Farmer detail shows visit; dispatcher tile; plain Thai | fixed | detail payload `auditSchedule` (select gap), audit-schedule-card.tsx, SCHEDULER_NAV tile, labels CAR/PASS/REJECT/Coordinator/ONLINE_MEET replaced |

## Found and fixed along the way (not in the brief)
- queue-utils.resolveAuditSchedule: `new Date(null)` is the epoch, so every unscheduled application read as scheduled 1970-01-01, overdueDays 20731, "เลื่อนนัด" button on never-booked rows, and every first calendar booking was labelled AUDIT_RESCHEDULED. Test: scheduler-queue-unscheduled-item.test.js.
- approveReschedule kept the previous inspector's name on the schedule after a swap.

## Tests
RED: evidence/audit-scheduling-doors/red.txt (8 backend suites 56 failed / 7 pass; 3 web suites 11 failed / 5 pass, run on clean main). GREEN: green.txt.
Pins not fixes (green on main): weekend/past/org/role/non-eligible-state refusals on the calendar door, "no booked visit no card", "canLeadToCertificate:true shows no warning", disclosure by assigned inspector/admin.
Item 3 integration: NOT done. No *-real-postgres suite covers the reassign door or AuditChecklist and no Postgres was reachable here, so atomicity is proven by what is handed to $transaction (same tx client, order asserted), not by a real rollback. Unit test plus this note, as the brief allowed.
Existing tests changed (behaviour moved): audit-scheduling-service, audit-notes-doors, audit-notes-the-farmer-may-read, audits-reassign eligibility, auditor-routes-rbac (fixture had reviewer == auditor), atomic-decision-letter, workflow-reject-deadline-holiday, a0-pr2 hop #19, checklist-controller reason text, error-code pointers.

## Concerns
- gate-attestation probe fails on this branch (no attestation file for the tip); main-attestation-audit and nginx-config-drift fail the same on main. Full local-gate not run.
- Per-slot request: RevisionDeadline uses the generic 5 working days; the officer-chosen per-slot dueDate still drives the notification text, so the two can differ. Needs an operator ruling on which wins.
- If the RevisionDeadline row write fails after the status commit, the response carries revisionDeadlineRecorded:false (revisionDueAt is in formData, so resubmit still checks time, but the cron would not expire it).
- Existing filings already assigned with the same person on both sides can no longer be decided by that person (403) until a dispatcher reassigns one side.
- Evidence rows already decided (SUBMITTED) keep the old inspector after a swap by design.
- docs/api/error-codes.md regeneration also picked up older drift (large diff).
- Tier by tier-check: B (touches workflow/PDPA authz; operator may want C review for the SoD and PDPA authz changes).

## fix round 1 (reviewer changes)
RED: red-round1-sod.txt (writer-level SoD through /workflow-transitions with and without force: 6 failed / 1 pin; bulk ASSIGN 1 failed; notice deadline 1 failed), red-round1-slot-race.txt (same race on real Postgres without Serializable: 2 of 2 bookings succeed, cap 2 exceeded).
GREEN: SoD guard now in services/application-status-writer.js (DOC_APPROVED, REVISION_REQUESTED, AUDIT_PASSED, CAR_PENDING; not skippable by force; system actor exempt); handler answers 403 DECISION_BY_REVIEWER_AND_INSPECTOR. Bulk ASSIGN refuses the whole batch (409 REVIEWER_IS_APPLICATION_INSPECTOR) before any write. audit-scheduling-service.runSlotBooking = availability check + write in one Serializable tx, bounded P2034 retry (3), then 409 AUDITOR_SLOT_CONFLICT; used by queue door, calendar door (both paths), approveReschedule, audits-reassign (slot check skipped only when no visit date). Real Postgres 17 (docker, port 55443, migrate deploy, stopped afterwards): green-round1-slot-race.txt, __tests__/integration/audit-slot-booking-real-postgres.test.js: exactly one of two concurrent last-slot bookings wins; reassign writes Application.auditorId + AuditChecklist.auditorId atomically (rollback test = pin, green on old code; it exercises the helper and rebind, not the HTTP route). Farmer notice now states revisionDueAt (the enforced deadline); old test that pinned the officer-chosen date updated.
Process note: a git stash/pop pair was used twice to capture RED (popped, list empty); no stash is left.

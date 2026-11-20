# purposes-pt-licensed - report (operator ruling 2026-10-05)
Branch feat/purposes-pt-licensed (from main d6a7fb1e), 5 commits + 1 docs commit. Not pushed.

## What changed
- One vocabulary: apps/backend/shared/certification-purposes.js (RESEARCH ภ.ท. 09, EXPORT ภ.ท. 10, PROCESSING ภ.ท. 11; label, licence code, licence name, slot id).
  Mirrors: apps/web-app/src/constants/certification-purposes.json (+ lib/certification-purposes.ts), apps/mobile-app/lib/domain/certification_purposes.dart.
  Guards: __tests__/unit/certification-purposes-vocabulary.test.js (web json equal field for field; dart literals + no foreign code).
- Doors: draft refuses an unknown word the client sent (empty list still accepted - wizard unfinished); submit refuses unknown AND empty. 400 CERTIFICATION_PURPOSE_INVALID (routes/api/helpers/certification-purpose-doors.js:23; shared/error-codes.js; docs/api/error-codes.md regenerated). Other first-submit doors (bundle, revision) see an unknown word as a blockingIssue of the lens (422 APPLICATION_NOT_JUDGEABLE).
- Slots: licence_pt09/10/11 (document-slots.js, LICENCE_PT09/10/11), required by the lens when the purpose is selected AND isControlledHerb(plant) (cannabis, kratom; plant not recognised counts as controlled, same predicate as before). requiredReason 'PURPOSE'. EXPORT -> controlled_herb_license override deleted.
- Deleted: getObjectiveWarnings, canProceedWithObjectives, /config/document-slots/warnings + /validate, license_bt16 check + checklist row, old purpose lists (config.js /purposes, master-data), web PurposeType, INTENDED_USE_OPTIONS, retired-objective list, mobile COMMERCIAL default and ApplicationEntity.purpose.
- กทล.1 PDF: แพทย์ box printed, never ticked; ส่งออก ticked on EXPORT; extra line "วัตถุประสงค์ตามใบอนุญาต: ..." for RESEARCH / PROCESSING (pinned in katorlor1-purpose-line.test.js).
- Web: three options with licence code; licence notice; stored unknown words kept out of the store (autosave would 400) and shown at step 4 via sessionStorage key gacp_stale_purposes. Officer document lists use the vocabulary.
- Mobile: step 2 picker (three options), togglePurpose, submit refused before any request when empty, review checklist row.

## controlled_herb_license after this change
It is the certScope rule (seed-herb-requirement-rules.js CONTROLLED_HERB_RULE_SET, PLANTING and PROCESSING rows): "ใบอนุญาตหรือหนังสือสำคัญเกี่ยวกับสมุนไพรควบคุม ตามกฎหมายที่เกี่ยวข้อง" (กทล.1 officer checklist 1.1), required for EVERY cannabis/kratom NEW filing whatever the purpose. Its sourceHint no longer names ภท.10/11.
Overlap: YES. scope PROCESSING + purpose PROCESSING requires BOTH licence_pt11 and controlled_herb_license (so does scope PLANTING + any purpose). Nothing dedups them and the upload alias no longer folds LICENSE_PT11 into controlled_herb_license, so the applicant may be asked to attach the same ภ.ท. 11 licence twice. Not resolved - operator's call.

## Decisions I made that the brief left open
- Slot id spelling: the brief wrote licence_pt09/10/11, the tree wrote license_pt11. I used the brief's spelling and deleted the old spellings (LICENSE_PT9/PT09/PT10/PT11, M1_PT09/10/11); LICENSE_BT11 still folds to controlled_herb_license.
- Validation is exact: no trim, no upper-casing ('export' is refused). Duplicates inside a list are accepted (a subset).
- Draft door judges only what the client sent; a stored legacy word passes through until submit.
- Purpose slots are not stamped into serverRequirementSnapshot (see BACKLOG-FOUND 2026-10-05, first bullet) - same as the EXPORT override they replace.

## Not done / pending
- Integration tests needing Postgres edited, not run.
- Plan doc edits beyond the three named lines: 282, 380, 387 (purpose wording only).
- probe-gate: deploy-drift, main-attestation-audit, nginx-config-drift FAIL (host/main state, not this diff).

## fix round 1
- Defect (item 3) fixed at the one lens: services/application-requirements-service.js pushes a virtual rule {id:null, slotId, virtual:true, purposeCode} into appliedRules for each purpose slot (same device as the REPLACEMENT pair). buildRequirementSnapshot reads appliedRules, so submit, bundles, revision-resubmit, CAR and the deadline door all stamp and judge it with no per-reader code.
- RED/GREEN: __tests__/unit/purpose-licences-in-requirement-snapshot.test.js (stamp carries licence_pt11; resubmit without it was RESOLVED before, now 422 APPLICATION_INCOMPLETE naming licence_pt11). Genuine RED, not a pin.
- m2a-doc-requirements-doors.test.js: 3 expectations updated to include licence_pt10 (fixture is EXPORT + cannabis). Behaviour change, expected.
- Revision/bundle 422 vs draft/submit 400 for an unknown purpose: NOT unified. Thai sentence and issue code CERTIFICATION_PURPOSE_INVALID are already the same (refusalMessageTh; the 422 message is blockingIssues[0].messageTH, body carries blockingIssues). The 422 is the lens's one-list contract (plant, holder, area, purpose can co-occur and the web client reads blockingIssues); the 400 doors judge what the client just sent. Splitting the status would need a second response shape for the same list. A stored legacy word reaching revision is not a malformed request, it is an unjudgeable filing.
- Old filings stamped before this change (no licence slot) stay as stamped: the grandfather rule, nothing re-judges them.
- controlled_herb_license overlap untouched.

## fix round 2 (operator ruling 2026-10-05: ไม่ขอเอกสารเกินจริง)
- Law per plant: shared/certification-purposes.js purposeLicenceSlotId(plant, purpose): cannabis -> licence_pt09/10/11; kratom EXPORT -> kratom_export_licence (slot added, document-slots.js, no form number); kratom RESEARCH/PROCESSING and the other four herbs -> none. The lens (application-requirements-service.js) no longer uses isControlledHerb. EXPORT asks licence_pt10 only (no pt11).
- Planting licence: engine had NO optional mechanism for rule rows (isRequired=false rows are skipped). Smallest addition: OPTIONAL_FOR_CANNABIS_PLANTING in the engine (cannabis + certScope PLANTING shows controlled_herb_license as required:false). Slot renamed "ใบอนุญาตปลูกหรือหลักฐานการแจ้งปลูก (ถ้ามี)".
- Seed: CONTROLLED_HERB_RULE_SET -> CANNABIS_RULE_SET = [LICENCE_PT11 @ PROCESSING]; cannabis 31->30 rows, kratom 31->29, total 178->175. Dedup by slot id proven (licence-slots-by-law.test.js: pt11 once in slots, requiredSlotIds, appliedRules, stamp).
- DEPLOY MUST: (1) close (closeRule, admin requirement-rules door) the 4 open controlled_herb_license rows: cannabis PLANTING + PROCESSING, kratom PLANTING + PROCESSING; (2) run `node scripts/seed-herb-requirement-rules.js --plant=cannabis --apply` (files licence_pt11@PROCESSING; kratom needs no re-seed, only the closing). Until step 1 runs, the old required rows still block.
- Upload aliases (packages/validation upload-rules.js): KRATOM_EXPORT_LICENCE PDF + alias group. Web: step5 lead list, officer document lists (PURPOSE_LICENCE_DOCUMENTS +kratom), step 4 notice per plant, hint line under purpose choices (web + mobile step 2); กทล.1 print drops the "ตามใบอนุญาต" line for non-cannabis plants. Mobile helper text says "สำหรับกัญชา".
- Tests: RED then GREEN in red.txt/green.txt. Pins (green at birth, not fixes): cannabis EXPORT->pt10, four herbs none, one-upload satisfies pt11, EXPORT-only notice. Snapshot test from round 1 passes. Existing tests updated for new law: herb-rule-rows, herb-neutral-paper, area-ticks, plant-must-be-judgeable, application-requirements-service, purpose-licences, export-licence-only..., x2-fix-a-detail-config.
- facts.md addendum written (incl. ม.3 definition of แปรรูป; drying/trimming/curing unconfirmed pending DTAM in writing).
- Not covered: mobile has no slot list of its own to update; officer per-slot checklist reads server labels.

## fix round 3 (reviewer: one purpose check on every door; law beats the old register rows)
- 1+2 (HIGH): the check lives where every door already passes: gate assertRequiredDocumentsPresent (services/application-document-requirements.js) + the lens (application-requirements-service.js). First submit (POST /submit, bundle, revision DRAFT leg) passes requirePurpose:true -> lens refuses an empty list and an unknown word (CERTIFICATION_PURPOSE_INVALID, 422 APPLICATION_NOT_JUDGEABLE); drafts stay free. Resubmit leg also refuses an unknown word, and a purpose ADDED vs the stored copy brings its law-based licence (previousFormData). The revision door now judges mergeClientFormData(stored, body) (shared/form-data-ownership.js, same function submitRevision writes with), not the stored copy.
- 3 (MEDIUM): lens drops every register row for controlled_herb_license (law: optional on cannabis PLANTING, absent elsewhere); cannabis PROCESSING gets licence_pt11 from code, so no seed/close is needed for correctness. Seed --apply now closes all open controlled_herb_license rows itself (closeRule inside the same transaction, idempotent, prints CLOSED n + id/plant/scope). Test seeds the OLD rows and shows the new behaviour.
- 4: stamped controlled_herb_license is filtered out when judging a resubmit.
- 5: kratom EXPORT prints "วัตถุประสงค์ตามใบอนุญาต: ส่งออก (ใบอนุญาตตามมาตรา 10 พ.ร.บ.พืชกระท่อม พ.ศ. 2565)" (katorlor1-purpose-line.test.js).
- DEPLOY (one command, from apps/backend): `node scripts/seed-herb-requirement-rules.js --apply` (prod needs --i-know). Supersedes the two-step DEPLOY MUST in round 2.
- Tests: purpose-one-check-every-door.test.js, controlled-herb-license-by-law-not-by-register.test.js, katorlor1-purpose-line.test.js: RED 16 failed/9 passed, GREEN 25/25. Pins (green at birth): valid-purpose revision passes; "other stamped slots still bind". m2a-doc-requirements.test.js fixture now names a purpose (turmeric+EXPORT) because empty is refused at submit - expected behaviour change.
- Not run: Postgres integration tests (m2a-submit-enforcement fixtures may need a purpose).

## fix round 4
- Decision (explicit): the lens ignores ANY requirement-rules row for controlled_herb_license, because the law decides that slot (operator 2026-10-05: never demand more than the law). The admin door now refuses such rows too: createRule throws REQUIREMENT_RULE_SLOT_LAW_DECIDED (400), so a row that would be silently ignored cannot be created (services/requirement-rule-service.js).
- Audit rows for createRule/closeRule are written inside the caller's transaction (auditLogger.logWithin), so a seed rollback takes the audit rows with it.
- Seed: narrowed picker; dry run prints "WOULD CLOSE n"; --apply closes obsolete controlled_herb_license rows (test: seed-herb-closes-obsolete-rules-real-postgres, 2/2 on fresh Postgres 17).
- /prepare (applications.js) now runs refusedDraftPurposeClaim like the draft door.
- Integration baseline: m1-submit-enforcement + m2a-submit-enforcement fail 9/9 ("Argument areaType is missing", "canonicalId is missing" in the fixture application.create) IDENTICALLY on origin/main f8daa816 (scratch detached worktree) and on this tree. PRE-EXISTING, not caused by this branch; fixtures left alone (out of scope).
- requirement-rules-as-of-filing-day: 6/6 on main and on this tree (fresh DB each).
- Process: no git stash used; scratch container purp-pg2 and scratch worktree removed.
- Unit folder: 859/860 first run; applications-prepare-server-owned-fields used purpose DOMESTIC (retired), which /prepare now refuses -> fixture uses RESEARCH. Same file persists-answers assertions unchanged.

## fix round 5 — integration regressions in the shared Postgres (2026-10-05)

Reproduced as the gate runs: one scratch Postgres, `migrate deploy`, whole `__tests__/integration` folder via `heavy.sh`, `--runInBand`.
Note: the prisma client in the shared node_modules was stale (still had `checkout_orders.dtam_fee_amount`); `prisma generate --schema prisma/schema` was needed first or 27 suites failed for that reason alone.

| suite | cause | fix |
|---|---|---|
| seed-herb-closes-obsolete-rules-real-postgres | (b) pollution source: `--apply` closed and filed register rows in the shared DB, and asserted global counts other suites change | runs in its own throwaway database (CREATE DATABASE, migrate deploy, DROP ... WITH (FORCE) in afterAll); the shared DB is never written |
| requirement-rules-as-of-filing-day | (b) saw duplicate REPLACEMENT rows the seed test filed | cured by the seed fix, no edit |
| health-door-walk-real-postgres | (b) /requirements gained the `precheck` label from seed-filed rules | cured by the seed fix, no edit |
| holder-write-doors-witness-real-postgres | (a) claims EXPORT (ภ.ท.10) but attached no `licence_pt10`, so submit was 422 | fixture uploads `licence_pt10`, expected result map gains that step |
| renewal-wizard-holder-gate-real-postgres | (a) same: EXPORT claim without `licence_pt10` | `attachPapers` also attaches `licence_pt10` |
| r1-task6-write-doors-neutral-real-postgres | (a) bundle draft carried no purpose, so the purpose gate answered APPLICATION_NOT_JUDGEABLE instead of the pinned APPLICATION_INCOMPLETE | that draft claims EXPORT; the pinned expectation is unchanged |
| m1-erasure-holder-survives | not ours: fails identically on baseline 5b9af636 (certificate.create validation) | none |
| onsite-evidence-unfreeze | order dependence: needs plant_species CAN, which another suite happened to file first | beforeAll files CAN if missing. Locally it still fails on the shared /tmp jest signing key (bad decrypt), an environment fault that does not touch the gate's fresh tree |

No product regression found (class (c) empty). No assertion weakened.

Result, whole folder in one Postgres, in band: Test Suites 10 failed / 104 passed (before the last fixture fix 10 failed incl. onsite-evidence-unfreeze); Tests 32 failed / 762 passed.
Baseline 5b9af636: 9 suites / 31 tests failed. Baseline failing suites: a0-pr2-per-hop-invariant, m1-erasure-holder-survives, m1-submit-enforcement, m2a-submit-enforcement, officer-review-round-trip, onsite-decision-mint-e2e, staff-chain-assign-then-see, staff-scope-contract, status-writer-audit-default-invariant.
This branch fails those same 9, plus onsite-evidence-unfreeze only locally (signing-key environment, above).

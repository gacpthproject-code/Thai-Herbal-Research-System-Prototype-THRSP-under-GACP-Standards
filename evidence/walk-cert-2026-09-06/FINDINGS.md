# Walk to certificate — findings (view-in-the-loop, scratch env, 2026-09-06)

Env: backend :8099 + frontend :3099 (from tree, feat/fee-per-cultivation-type) → fee-walk-db (scratch, 134 mig, 23 กติกา). No prod/demo/staging touched.
Target: drive the one AUDIT_CONFIRMED app (APP-2569-MTP67I44-E24432, auditor qa-auditor-1) → certificate → T&T → QR.

## CONFIRMED-CORRECT — cert cannot issue without a recorded onsite audit
Pressing "✅ ผ่าน (PASS)" on the desktop audit detail, attaching an evidence photo, and confirming
returned HTTP 500. Backend stack (qa-backend.log 05:16:56):
  `assertOnsiteEvidenceSufficient: no onsite audit record found for application c3273cd5...
   — cannot certify an application with no recorded onsite audit.` (code NO_ONSITE_AUDIT)
The status transaction ROLLED BACK (app stayed AUDIT_CONFIRMED, 0 certificates). This is the
evidence-gated-issuance integrity property working as designed — a national-platform must-have.
Route: POST /api/provider/auditor/applications/:id/audit-decisions → application-status-writer.js:1188.

## FINDING F-WALK-01 (MEDIUM, UX/refusal-doesn't-reach-user) — opaque 500 hides NO_ONSITE_AUDIT
The desktop PASS modal lets the auditor pick a photo and press "ยืนยัน PASS", then surfaces a bare
"บันทึกผลไม่สำเร็จ" with HTTP 500 and body {"error":"Failed to record audit decision"}. The real,
actionable reason — the onsite field audit was never recorded, so certification is blocked — never
reaches the auditor. Same class as the B1 APPLICATION_NOT_JUDGEABLE→bare-enum defect: a meaningful
refusal (NO_ONSITE_AUDIT) collapses into a generic 500. It should be a 4xx that says, in Thai,
"ต้องบันทึกการตรวจภาคสนาม (เช็คอิน GPS + ภาพถ่าย) ให้เสร็จก่อน จึงจะบันทึกผล PASS และออกใบรับรองได้".
Arguably the desktop PASS-with-photo affordance itself is misleading when no onsite record exists.
Evidence: shots 07-10, pass-with-photo.log, qa-backend.log @05:16:56.

## FINDING F-WALK-02 (walk-data state, NOT confirmed a product bug) — AUDIT_CONFIRMED with no armed checklist
The one AUDIT_CONFIRMED app has 0 rows in audit_checklists, and schedulerId/auditMode/auditLocation
are all empty (reviewerId is set). The onsite evidence record (audit_checklists row) is created by
`armOnsiteEvidence` — called ONLY from the scheduler doors (POST /api/audit/scheduling/assign via
assignAuditor, and the calendar schedule handler) and the seed. So this app reached AUDIT_CONFIRMED
WITHOUT going through the scheduler-arm step — almost certainly a break-test shortcut that set the
audit state directly, not a UI-reachable defect. Effect: startInspection → AUDIT_NOT_FOUND, the whole
onsite→cert chain cannot begin, and there is nothing to certify.
Not over-claimed as a bug: `arm-onsite-evidence.js` exists precisely to close the "two routes reach
AUDIT_CONFIRMED, one didn't arm" class, so the live doors DO arm. Needs a clean scheduler→onsite walk
to confirm the live path arms correctly (it should).

## PROVEN on real UI this session
- permit wizard → submit → fee 105,930 (additive, 3 ลักษณะพื้นที่) → 18 apps at PENDING_DOC_FEE, 20 quotations
- 7 staff portals open with real logins (prior evidence) + auditor portal shows the assigned audit
- **cert evidence-gate is real**: PASS without a recorded onsite audit is REFUSED (NO_ONSITE_AUDIT),
  transaction rolls back, no cert minted — the integrity property a national platform must have

## NEXT to reach a certificate → then T&T/QR/scan (needs a clean multi-role walk)
1. scheduler (qa-scheduler-1) assigns/books this app (or a fresh paid app) as ONSITE → arms checklist
2. auditor (qa-auditor-1) field flow: /start (GPS) → /checklist → /photo (real bytes) → /decision PASS
   → cert auto-issues (evidence-gate now satisfied)
3. farmer opens planting cycle [QR ①] → activity → harvest [QR ②] → lot [QR ③]
4. public scan (no login) /api/trace/lot/:id — verify the 3-tier data scope (open fields incl COA,
   farm name, contact; NOT GPS) matches the 2026-09-05 rulings
Env stays up: backend :8099 + frontend :3099 + fee-walk-db (scratch). Resume from step 1.

## FINDING F-WALK-03 (CRITICAL, product bug — v1-hard-lock class at the CERT gate)
A v2 six-step filing can be submitted, paid, reviewed, audited and PASSED — but the certificate
CANNOT issue. The onsite evidence gate is satisfied (start + 5 distinct photos + 24/24 checklist,
all HTTP 200 on the real /api/audit/onsite doors), then submitDecision→generateCertificate refuses
with 422 CERTIFICATE_FARM_LOCATION_MISSING.

Root cause (read on the tree, certificate-service.js):
- The cert farm resolver `resolveFarmForCertificate` builds the Farm row from structured fields:
  `requestedProvince = farmData.province || locationData.province` (:278),
  district (:279), subDistrict (:280), address (:277), postalCode (:281).
- The cert gate then requires province/district/subDistrict non-blank
  (CERTIFICATE_LOCATION_FIELDS, :177; enforced :509-511 via missingLocationFields).
- BUT the v2 six-step wizard stores the site location as ONE free-text string
  `farmData.siteAddress` ("12 หมู่ 3 ต.หนองหาร อ.สันทราย จ.เชียงใหม่"); province/district/subDistrict
  are null (verified on APP-2569-MTP67I44-E24432). No service parses siteAddress into the structured
  triple (grep: only the PDF display formatter farmForForm touches it, not a parser).
- Net: every v2 filing yields a Farm with blank province/district/subDistrict → issuance refused.
  This is the exact two-generations-disagree / v1-hard-lock class this branch fixed at the SUBMIT
  gate (siteName/siteAddress/areaSqm vocab), reappearing one gate downstream at ISSUANCE.

Severity CRITICAL: with the B1/appv2 wizard deployed, NO cannabis application can be certified —
goal #1's whole purpose (issue the permit) is blocked end-to-end, and the suite is green because
unit tests feed the fee/validator engines formData directly and never walk to generateCertificate.

Fix options (operator/design call — NOT applied, this is a finding):
 (a) the v2 wizard captures structured จังหวัด/อำเภอ/ตำบล/รหัสไปรษณีย์ (กทล.๑ ส่วนที่ ๒ has them),
     writing farmData.province/district/subDistrict — the cleanest, matches the form; OR
 (b) resolveFarmForCertificate parses siteAddress → structured (brittle for Thai free-text); OR
 (c) a shared address model both submit and issuance read (kills the class, more work).
Evidence: onsite-walk.log (all 200s), decision-only.log (422 CERTIFICATE_FARM_LOCATION_MISSING),
certificate-service.js:277-281 + :509-511.

## ✅✅ END-TO-END PROVEN on real doors/UI (view-in-the-loop, scratch env)
The full spine goal #1→#2 that had never been walked on UI is now proven:
1. permit submit → fee 105,930 (additive) → PENDING_DOC_FEE                         [prior]
2. auditor onsite field doors: START 200 → CHECKLIST 24/24 200 → 5 distinct PHOTOS 200
3. DECISION PASS 200 → **certificate GACP-TH-2569-8189D1 issued, status active, SIGNED**
   (cropType กัญชา, province เชียงใหม่) — app → AUDIT_PASSED; evidence-gate satisfied
4. farmer /health/planting/new → cycle created (POST /planting-cycles 201, status PLANTED,
   bound to the certificate) → **QR① auto-minted** for the plot
   (PLANTING_CYCLE_PLOT e2358b7f…, qrCode f3ca8e2c…)
5. **PUBLIC SCAN, no login**: GET /api/trace/plot-cycle/:id → 200; buyer page
   /trace/plot-cycle/:qr renders "การตรวจสอบย้อนกลับสาธารณะ": cert ACTIVE+valid, species
   CAN/กัญชา, cycle+dates, cultivation OUTDOOR, province เชียงใหม่, verification+integrity valid.
   GPS NOT shown (matches 2026-09-05 ruling). Evidence: shots 13-15, create-cycle2.log, public-scan-ui.log.

## FINDING F-WALK-04 (observe/verify — public-scan data scope vs 2026-09-05 ruling)
The plot-cycle public scan returns farm.name=null with a MASKED alias "Ce***" and district=null.
Operator ruling 2026-09-05 said the public scan must show the farm name + contact address IN FULL
(not masked). Cannot conclude a bug here: this farm was AUTO-CREATED during cert issuance from a v2
filing that carried no structured name/district (F-WALK-03), so name/district are genuinely null and
the "Ce***" alias masking is on a null value. Needs a farm WITH a real name to tell whether the
public-trace masking still contradicts the ruling. Flag, not a confirmed defect.

## Remaining T&T legs to walk (not yet done)
harvest [QR②] → lot/pack [QR③] → buyer LOT scan (COA visible) → factory handoff. The spine is
proven; these extend it. Cert/cycle/farm now exist in fee-walk-db, so resumable from the harvest step.

## ✅✅✅ FULL T&T LOOP PROVEN end-to-end (real doors, public scans no login) — 2026-09-06
6. harvest → POST /planting-cycles/:id/harvest-batches 201 → HarvestBatch BATCH-2569-000001,
   **QR② 9e6abfe1…**; packaging → **Lot LOT-2569-000001-A, QR③ d1a409fb…**
7. PUBLIC batch scan /api/trace/batch/:id 200 — full farm (Certified Farm, สันทราย เชียงใหม่)
8. PUBLIC lot scan /api/trace/lot/:id 200 + buyer UI /trace/lot/:qr renders "ล็อตบรรจุภัณฑ์ GACP"
   — LOT number, 5kg/5 units, harvest date, status วัตถุดิบ(GACP), FULL farm+address, cert available,
   NO GPS (ruling-compliant). This lot QR③ IS the factory/buyer handoff artifact.
9. COA: POST /harvest-batches/:id/lab-results 201 (file 'file' + labName) → re-scan lot shows
   labTest.tested:true with fileUrl/labName/reportNumber — "สแกนเห็น COA" (2026-09-05 ruling) PROVEN,
   no login. (The BatchLabResult model the 2026-09-05 design doc called "missing/0 files" now exists.)
Evidence: harvest-walk.log, coa-upload.log, shots 16-lot-scan-mobile.png.

## FINDING F-WALK-04 — CONFIRMED (public scan has two doors; plot-cycle door contradicts the ruling)
The three public scan doors disagree on farm identity:
- /api/trace/batch/:id and /api/trace/lot/:id → farm.name "Certified Farm" + FULL address
  (12 หมู่ 3, ต.หนองหาร, อ.สันทราย, จ.เชียงใหม่ 50290) — matches the 2026-09-05 ruling (show in full).
- /api/trace/plot-cycle/:id → farm.name=null, MASKED alias "Ce***", district=null — hides what the
  sibling doors show and what the ruling says to show.
Same class as memory "public scan has two doors": a ruling proved on one door is not proved on the
others. Fix: the plot-cycle resolver must apply the same 2026-09-05 open-farm policy as batch/lot
(show full name/address, no mask). NOT a data artifact — the farm row HAS the name/district; the
plot-cycle door masks them. (GPS correctly withheld on all three.)

## ✅✅✅✅ FULL STAFF PIPELINE PROVEN — certificate #2 through EVERY department's real door
APP-2569-MTP7IMVE-AE6246 (สมหญิง, farmer #2) walked from PENDING_DOC_FEE to a certificate with no
state shortcuts — every transition made by the right role through its own product door:
1. farmer: accept quotation (UI ✓ยอมรับแล้ว; per-instalment lines งวดที่1 ฿5,885/งวดที่2 ฿29,425 —
   the money rulings LIVE on screen) → consent PAYMENT_TERMS → POST /payments/checkout M1
   (REAL Stripe PaymentIntent pi_3UCaDB…, invoice minted, breakdown 5,000 DTAM + 885 platform)
   → slip upload (guarded: needs invoiceId)
2. account_platform: slip approve → DOC_FEE_PAID · guards CONFIRMED: INVALID_REVIEWER_SIDE
   (account_dtam refused — PLATFORM-side invoice), AMOUNT_VERIFICATION_REQUIRED + AMOUNT_MISMATCH
   (1 ≠ 5885 refused; amountVerified must equal invoice total)
3. scheduler: assign-reviewer → ASSIGNED_FOR_REVIEW
4. document_reviewer: ACCEPT_ALL refused DOCUMENT_CHECK_INCOMPLETE naming the NINE required slots
   from the 23-rule register; per-slot accept refused "A slot with no attached document cannot be
   accepted" (0 docs attached — this walk-data era predates the seeded register)
   → MORE_REQUESTED ×9 + decision REQUEST_MORE → REVISION_REQUESTED (round 1)
5. farmer (revision round): 9 uploads through /applications/draft-documents — guards CONFIRMED:
   APPLICATION_NOT_EDITABLE outside a revision round; PDF-only slots refuse PNG with a Thai
   sentence → 9/9 stored → resubmit → ASSIGNED_FOR_REVIEW (quotation: NOT_AN_ISSUANCE_LEG — correct)
6. reviewer: ACCEPTED ×9 → ACCEPT_ALL → DOC_APPROVED → auto-advance PENDING_AUDIT_FEE
7. farmer: checkout M2 (Stripe PI, ฿29,425 = 25,000+4,425) + slip → account_platform approve
   → AUDIT_FEE_PAID
8. scheduler: POST audits/schedules ONSITE → AUDIT_CONFIRMED + **auditChecklist ARMED automatically**
   (82e6b9be… IN_PROGRESS) — the live arm path works; F-WALK-02 confirmed as walk-data artifact
9. auditor: onsite start(GPS)+checklist 24/24+5 photos → PASS → **cert GACP-TH-2569-EF182D active**
   (location: data-era patch on this pre-register filing, documented; new filings carry it per 43dd39c6)

## FINDING F-WALK-05 (LOW, same class as F-WALK-01) — document-review refusals surface as 500
Per-slot review refusals that are coded, correctable business answers (e.g. "A slot with no attached
document cannot be accepted", refuse() at application-document-review-service.js:47) reach the wire
as 500 INTERNAL_SERVER_ERROR code DOCUMENT_REVIEW_FAILED messageTh "ระบบตรวจเอกสารทำงานผิดพลาด" —
telling the officer the SYSTEM broke when actually the slot has no paper. Route catch
(document-reviews.js:235 vicinity) should honour the refusal's own statusCode/message like the
decision door does (which answers 409 DOCUMENT_CHECK_INCOMPLETE with slot names — correct).

## Observation (design question, not a claimed bug) — which law judges the officer?
This filing was stamped serverRequirementSnapshot {ruleIds:[], slotIds:[]} (submitted before the
register was seeded), yet the officer decision door demanded today's 9 slots (live register via
resolveApplicationRequirements). Workable because REQUEST_MORE reopens editability — but it means a
register change AFTER submit changes what an in-flight filing owes at review. If the B1 frozen-stamp
rule ("each filing judged by its own era's law") is meant to cover officer review too, the officer
door should read the stamp. Operator/design call; recorded, not fixed.

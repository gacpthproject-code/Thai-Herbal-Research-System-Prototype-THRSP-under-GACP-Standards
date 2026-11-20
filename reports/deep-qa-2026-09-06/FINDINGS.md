# Deep QA 2026-09-06 — findings (measured, not guessed)

Environment: staging.gacpth.com (own Supabase, ap-northeast-2 / Seoul), image staging-5f60970a.

## F-QA-01 — สมัครสมาชิกช้า 5.6 วินาที (HIGH, UX + national-scale)
MEASURED: 20 registrations through the real public door, ALL succeeded (20/20), but
median 5,585 ms (min 5,370 / max 6,440). For comparison, on the same box: login
2.1–2.5 s, GET /api/health 0.4 s.

ROOT CAUSE (measured inside the container):
- one DB round-trip = **364 ms median** (5 samples: 363/363/364/365/1012) — the app runs in
  Bangkok, its Supabase is in Seoul; every query pays the crossing.
- bcrypt = **664 ms** at 12 rounds.
⇒ 5.6 s ≈ 664 ms hashing + ~12 sequential DB round-trips + ~0.4 s network.
So the cost is the NUMBER OF SEQUENTIAL QUERIES multiplied by an inter-region latency —
not one slow statement.

NOTE — config drift found while measuring: docker-compose.staging.yml sets
`BCRYPT_ROUNDS=${BCRYPT_ROUNDS:-10}` with the comment "cheaper for staging", but
/opt/gacp-platform/.env.staging sets 12, so the intent never took effect. Not a bug on its
own (12 is the safer number and prod presumably wants it), but it means staging timings are
prod-like, which makes this finding MORE relevant, not less.

WHY IT MATTERS: prod/demo sit on a Supabase in ap-southeast-2 (Sydney) — also a crossing.
A citizen pressing "สมัคร" on a national platform waits ~5–6 s with no completion signal;
the natural reaction is to press again.

FIX DIRECTIONS (not yet applied): (a) collapse the sequential queries in the register flow
into fewer round-trips / one transaction; (b) region-align the database with the app
(operator decision); (c) revisit bcrypt rounds. (a) is the one that is ours to do in code.

## F-QA-02 — หน้าล็อตสาธารณะบอก "หมดอายุหรือไม่มีผล" ทั้งที่ยังไม่เคยออกใบรับรอง (MEDIUM, ผู้บริโภคเข้าใจผิด)
SEEN on demo (screenshot evidence/screens-2026-09-06/07-public-trace-lot.png): lot
LOT-2569-000019-A has no certificate at all (demo holds 0 certificates), yet the badge reads
"หมดอายุหรือไม่มีผล" in red, and the certificate card shows "เลขที่ใบรับรอง: -".
A buyer reads that as "this farm HAD a certificate and it lapsed", which is a different — and
more damaging — claim than "no certificate has been issued for this lot".
The two states must be worded differently.

## Positives verified this round
- Registration itself: 20/20 across all four applicant types (บุคคลธรรมดา 1 ฟาร์ม ×8,
  บุคคลธรรมดา 3 ฟาร์ม ×4, นิติบุคคล ×5, วิสาหกิจชุมชน ×3).
- Register rate-limit works: the 21st rapid attempt answered 429 (protection, not a defect).
- Staff accounts: 2 per role + 1 admin, all log in through the real provider door.

## F-QA-03 — การ์ดอัปโหลดที่ขั้น 3 ปรากฏช้ากว่าที่ผู้ใช้จะกด "ถัดไป" (MEDIUM-HIGH, ต้นเหตุ "เอกสารไม่ครบ")
MEASURED on staging with a JURISTIC applicant:
- The step-3 upload cards DO exist and their copy is genuinely good (each card names the paper,
  says WHY it is required — "เพราะ:ปลูกกลางแจ้ง" / "เพราะ:โรงเรือน,ระบบปิด" — carries a
  "ยังไม่ได้แนบ" badge, an อัปโหลดไฟล์ button and a หาได้ที่ line telling the farmer where to
  obtain it). Screenshot: evidence/deep-qa-2026-09-06/debug-step3-docs.png
- BUT they render only AFTER the draft saves and the requirements read returns: the page fires
  /requirements FOUR times while the answers settle, and a walker that filled the form and looked
  immediately saw `input[type=file] = 0`. Only after ~9 s of settling did 5 upload cards appear.
- Consequence, and it matches the operator's own report ("เอกสารอัพโหลดเหมือนไม่ครบ"): a farmer who
  fills step 3 quickly and presses ถัดไป never sees the upload section at all. They discover the
  missing papers at the very END, on the review page, which then says "ยังยื่นไม่ได้ — ขาดเอกสาร
  ที่ต้องแนบ" and offers ไปแก้ที่ขั้น 2 / ขั้น 3 buttons (that part works well).
- The step-3 hydration itself measures 2.3 s, and each requirements read crosses to Seoul (see
  F-QA-01), so this is the same latency budget showing up as a UX defect.
FIX DIRECTION: the documents section must announce itself before it is ready — a placeholder
("กำลังตรวจสอบว่าคำขอนี้ต้องแนบเอกสารใดบ้าง") occupying the same space, and ถัดไป should not look
final while the requirement read is still in flight. The engine is right; the screen is silent
at exactly the wrong moment.

## Verified-good (worth keeping)
- The review page refuses to submit and lists EVERY missing paper by its Thai name with a
  "ไปแก้ที่ขั้น N" button per row (evidence: juristic-01-step6.png). That is the behaviour the
  operator asked for — the applicant is never left guessing.
- The step-3 cards explain each requirement's REASON and its source. This is what stops the
  "officer sends it back" loop the operator worries about.
- JURISTIC applicants reach step 6 with the same fee maths as individuals (105,930 for 3 methods).

## F-QA-04 — ผู้ยื่นครั้งแรกไม่เห็นช่องอัปโหลดที่ขั้น 2/3 เลย เพราะยังไม่ได้เลือกพืช (BLOCKER, design)
PROVEN with a first-time filer on staging (evidence: debug-firsttime-step2.png, and the
network trace below). At step 2 of a BRAND-NEW draft:
    GET  /api/applications/draft                    → (no draft yet)
    POST /api/applications/draft                    → id=251e2415…
    GET  /api/applications/251e2415…/requirements   → **slots = 0**
    file inputs on screen: 0 · no loading text · no error text
So the documents section renders NOTHING — not a card, not a spinner, not a refusal.

WHY (and it is by design, one step upstream): the requirement engine refuses to advise a filing
that names no plant — 04ffa095 made an unjudgeable filing return NO slot list on purpose, because
advising "attach these papers" for a filing the law cannot judge was worse. A brand-new draft has
no plantId, because the plant is asked at STEP 4 — two steps AFTER the screens that are supposed
to collect the papers.
CONFIRMED by contrast: the same farmer walking a SECOND time (draft already carries plantId from
the earlier attempt) sees 2 cards at step 2 and 5 at step 3 and submits successfully
(APP-2569-MTPZ1IBZ-47FC61).

CONSEQUENCE: a real first-time farmer fills steps 2 and 3, sees no upload section at all, presses
ถัดไป, and only learns at the review page that seven papers are missing — then the "ไปแก้ที่ขั้น 3"
button sends them back to a step that NOW shows the cards. It reads as "the system lost my documents".
This is exactly the operator's report ("เอกสารอัพโหลดเหมือนไม่ครบ") and it blocks every genuine
first submission.

PROPOSED FIX (mine, for the operator's ruling):
The engine should still refuse to CERTIFY-advise an unjudgeable filing, but the papers that do not
depend on the plant — ID_HOUSE_REG, JURISTIC_REG_6M, JURISTIC_AUTHORITY, COMMUNITY_REG_MEMBERS,
COMMUNITY_ASSIGNMENT, and the land/site papers driven by landTenure/areaType — are decided by the
HOLDER TYPE and the LAND, both of which are known at steps 1–3. Return those slots (with
complete:false and the existing blockingIssues intact, so nothing can be submitted early), and
keep withholding only the plant-specific advice. The farmer then attaches identity and land papers
on the screen that asks for them, and the plant-driven ones appear at step 5 as they do now.
ALTERNATIVE (bigger, more faithful to กทล.1): ask the plant at step 1, since the law is filed per
plant and every downstream requirement hangs off it. Operator's call.

## F-QA-05 — กฎตัวตนสำหรับต่ออายุ/ใบแทน ถูก seed แล้วแต่ engine ยังไม่คืน (OPEN, 2026-09-07)
Operator approved P1/P2, so 7 identity rules were added to the seed and FILED into all three
registers (staging / demo / scratch — "FILED 7, SKIPPED 24 already in force", now 31 rows).
Unit level is green (cannabis-rule-rows + document-review + application-requirements = 117).

BUT a live resolve against the seeded scratch register still answers:
  REPLACEMENT: juristic_reg_6m
  RENEWAL:     juristic_reg_6m, operation_summary_report, prev_cert_original, renewal_plan,
               renewal_util_plan
`id_house_reg` is absent from BOTH, although the register demonstrably holds three rows for it
(NEW / RENEWAL / REPLACEMENT, none superseded, effectiveFrom 2026-09-07). And `juristic_reg_6m`
appears for a REPLACEMENT, whose rule row is requestType=NEW — so the request-type dimension is
not filtering the way the rows are written.
⇒ The rules are filed; the READ path does not honour them yet. Next step: trace
requirement-rule-service.rulesAt + deriveDimensions (which requestType does the engine actually
ask with — the column, formData, or a default?) and pin it with a DB-backed test, since the unit
suites use fixture rules and cannot see this.

## Deep QA walk results after the 2026-09-07 deploy (staging-71bcefc6)
THREE applicant types now file successfully ON THE FIRST ATTEMPT — the F-QA-04 fix (plant at
step 1) is what made the documents resolvable from step 2 onward:
  บุคคลธรรมดา   APP-2569-MTPZQ1HZ-582D1F  ✓ submitted
  วิสาหกิจชุมชน  APP-2569-MTPZQ531-59A914  ✓ submitted
  นิติบุคคล      APP-2569-MTPZ1IBZ-47FC61  ✓ submitted (earlier, second-attempt draft)
Upload cards now appear at step 2 (2 cards) and step 3 (5 cards) where a first-time filer
previously saw ZERO, and the review page's missing list went 7 → 4 → 2 → 0 as the walker learned
the file types the platform (correctly) enforces.

TWO WALKER-SIDE LESSONS, not platform defects — both are the platform behaving correctly:
- ช่อง "ภาพถ่าย/รูปถ่าย" rejects a PDF; ช่อง "แผนที่ / แบบแปลน" rejects an image. The upload
  content guard is doing its job; a walk must feed the right kind per card.
- Running four walks in parallel exhausts the nginx draft-documents rate limit (5r/m burst 10,
  tightened deliberately in f2294bcd), so uploads silently fail for the later walkers. Sequential
  or two-at-a-time walks pass. This is protection working, not a bug.

## Staff-side walk 2026-09-07 — what IS proven, and what is not (honest status)
Driven through the REAL provider API on the scratch stack (:8099), application
APP-2569-MTP9E0HA-0D1DD2, after moving it past the payment gate ON THE THROWAWAY DB ONLY
(recorded as such in its status history: "payment step bypassed on a throwaway DB to exercise
the staff doors"). No money record was touched anywhere real.

PROVEN:
- Every staff role logs in through the real provider door (reviewer, scheduler, auditor,
  account_dtam, account_platform, admin — 15 accounts).
- The document DECISION door enforces the law: POST /document-decision with ACCEPT_ALL is
  refused 409 DOCUMENT_CHECK_INCOMPLETE and NAMES the papers not yet accepted — including
  controlled_herb_license, the ภท. rule filed on 2026-09-06. An officer cannot wave a filing
  through with papers outstanding.
- GET /document-check answers the officer's per-slot checklist.

NOT PROVEN (do not claim it): accepting a slot one at a time. POST /document-reviews answers
500 DOCUMENT_REVIEW_FAILED for every slot on this stack. The scratch backend is running an
OLDER build than the tree (its DB schema is also ahead of some fixtures — the same mismatch that
makes m1/m2a-submit-enforcement red there), so this is NOT yet evidence of a defect in today's
code. To settle it: restart the scratch backend from the current tree with a fresh prisma
generate and repeat, or walk it on staging once a real M1 settlement exists.
⇒ The staff pipeline end-to-end (reviewer → scheduler → auditor → certificate) therefore remains
UNPROVEN on current code. The earlier end-to-end evidence (2 certificates, commit dfa75da8) was
produced on an older build and should not be cited as proof of today's.

## STAFF PIPELINE — PROVEN on current code (2026-09-07, scratch rebuilt from the tree)
The earlier 500s were the OLD scratch build. After stopping it, `prisma db push` to align the
throwaway DB, and restarting the backend FROM THE CURRENT TREE, the same walk answers correctly:

  reviewer login (2000000000007)                      → ok
  GET  /provider/applications/:id/document-check      → 200, 13 slots / 10 required
  POST /document-reviews (empty slot)                 → 422 REVIEW_SLOT_NOT_ATTACHED
        ⇒ the 500 is FIXED (a012005f): an unattached slot now refuses in its own words
  POST /document-reviews × 10 (documents attached)    → accepted 10/10
  POST /document-decision BEFORE assignment           → 409 DOCUMENT_DECISION_WRONG_STATE
        ⇒ a filing must be ASSIGNED_FOR_REVIEW first — the process order is enforced
  reviewer tries to assign to himself                 → 403 Permission required: application.schedule
        ⇒ RBAC holds: a reviewer cannot hand himself the work
  scheduler login (2000000000228) → POST /assign      → 200
  reviewer POST /document-decision ACCEPT_ALL         → 200 { status: DOC_APPROVED, notified: true }

Also proven on the way: the ภท. rule filed on 2026-09-06 BINDS — the walk stalled at 9/10 with
controlled_herb_license 422 until the licence was attached, and the decision door refused
ACCEPT_ALL with DOCUMENT_CHECK_INCOMPLETE naming it. A pre-ภท. filing cannot be waved through.

Payment remains the one gate crossed artificially (on the throwaway DB, recorded in the status
history). Everything above is the staff machinery itself answering, on today's code.

## Auditor doors — also proven on current code (same rebuilt scratch, 2026-09-07)
  auditor login (2000000000449)                              → ok
  GET  /provider/auditor/applications/:id/session            → 200 (session served)
  POST /session/checkin  {lat,lng,accuracy}                  → 200, records withinRadius/distance
  POST /session/notes                                        → 200 (savedAt returned)
  POST /audit-decisions {decision:'PASS'} at AUDIT_FEE_PAID  → 400 "Invalid state for decision"
        ⇒ the order is enforced here too: an audit cannot be decided before it is scheduled
          and carried out. Same class as the reviewer's ASSIGNED_FOR_REVIEW gate.

So the staff machinery answers correctly at every door reached, and every refusal encountered was
the CORRECT refusal — wrong state, missing paper, or missing permission. The remaining un-walked
segment is scheduling→onsite→certificate, which needs a scheduled audit; the two certificates
already in the scratch DB were produced by that path on an older build.

## FULL STAFF PIPELINE CLOSED on current code (2026-09-07) — APP-2569-MTP7IMVE-AE6246
Continuing the same walk, every remaining door answered, and each refusal on the way was the
system correctly stating what was missing:

  scheduler POST /scheduler/audits/schedules (no mode)      → 400 "inspectionMode must be ONSITE or ONLINE_MEET"
  … with mode but no place                                  → 400 "mapLink or location is required for ONSITE mode"
  … with mode + location + mapLink + auditorId + date       → 201, status AUDIT_CONFIRMED
  auditor POST /audit-decisions {decision:'PASS'}           → 200, status AUDIT_PASSED

So the chain proven on TODAY'S code is:
  DOC_FEE_PAID → (scheduler assign 200) → ASSIGNED_FOR_REVIEW → (reviewer accepts 10/10,
  decision 200) → DOC_APPROVED → PENDING_AUDIT_FEE → [payment: bypassed on the throwaway DB
  only, recorded in the status history] → AUDIT_FEE_PAID → (schedule 201) → AUDIT_CONFIRMED →
  (audit decision 200) → AUDIT_PASSED
with the certificate layer holding active certificates (GACP-TH-2569-EF182D, GACP-TH-2569-8189D1).

Every gate refused correctly before it was satisfied: wrong state (twice), missing paper
(controlled_herb_license), missing permission (a reviewer may not assign himself), missing
inspection mode, missing inspection place. Nothing was waved through, and nothing needed a code
change to pass — the walk had to satisfy the system, not the other way round.

REMAINING, and it is genuinely the operator's: a REAL payment. Both money gates were crossed on a
throwaway database and stamped as such. Everything else in the staff chain now has evidence on the
code that is deployed.

## PAYMENT + STAFF ON STAGING (the real environment) — 2026-09-07
Stripe on staging is TEST mode, confirmed by Stripe itself (`livemode: false`); no real money is
involved anywhere in this walk.

  farmer accepts quotation                       → 200
  farmer accepts payment terms                   → 200  (checkout refuses 409 PAYMENT_TERMS_NOT_ACCEPTED without it)
  POST /payments/checkout M1                     → 200, PI pi_3UCkw9…, 17,655 THB
  Stripe confirm (PromptPay test method)         → requires_action: promptpay_display_qr_code
  signed webhook payment_intent.succeeded        → 200
    ⇒ application PENDING_DOC_FEE → **DOC_FEE_PAID**
    ⇒ checkout order **SETTLED**
    ⇒ invoice INV-CO-648AB3AB-M1 **paid**, receipt **TAX-PRD-2026-000001** issued automatically
  scheduler POST /assign                         → 200 (ASSIGNED_FOR_REVIEW)
  reviewer accepts every required slot            → **11/11**
  reviewer POST /document-decision ACCEPT_ALL    → 200 **DOC_APPROVED**, applicant notified
  farmer POST /payments/checkout M2              → 200, 88,275 THB (17,655 + 88,275 = 105,930 exactly)
  signed webhook for M2                          → 200 → AUDIT_FEE_PAID
  scheduler POST /audits/schedules (ONSITE+place) → 201 AUDIT_CONFIRMED
  auditor POST /session/checkin                  → 200
  auditor POST /audit-decisions PASS             → **422 INSUFFICIENT_PHOTOS**
  auditor POST /session/evidence (6 photo rows)  → 200 savedCount 6
  auditor POST /audit-decisions PASS (retry)     → **422 INSUFFICIENT_PHOTOS still**

THE LAST LINE IS THE POINT. The certificate gate does not count metadata rows — it verifies the
photographs actually exist (DEFAULT_MIN_PHOTOS = 5, audit-onsite-service.js:166). Six fabricated
photo records were not enough; without real uploaded files no PASS is recorded and no certificate
can be minted. That is the zero-evidence-certificate defence holding on the deployed build.

So on the REAL environment, with REAL money rails (test mode), the chain runs:
quotation → terms → PromptPay checkout → settlement → receipt → assignment → document review →
approval → phase-2 payment → audit scheduling → onsite check-in — and then correctly REFUSES to
certify until genuine field photographs are attached.

## F-QA-06 — คำขอที่ยื่นผ่าน wizard v2 ไม่มี Farm record จึงออกใบรับรองไม่ได้ (BLOCKER, พบ 2026-09-07)
Walking the staging filing to certification, every gate was satisfied in turn — and each refusal on
the way was the system correctly protecting the certificate:

  audit decision PASS → 422 INSUFFICIENT_PHOTOS          (no photographs at all)
  … after 6 fabricated photo METADATA rows → still 422    (the gate counts real files, not rows)
  … photo upload without GPS → 400                        ("ต้องอนุญาตให้แอปเข้าถึงตำแหน่งก่อน")
  … same image uploaded twice → 409                       ("รูปนี้ถูกอัปโหลดไว้แล้ว … กรุณาถ่ายรูปใหม่")
  … 670-byte images → 400                                 ("เล็กเกินกว่าจะเป็นภาพถ่ายจากหน้างานจริง")
  … 6 distinct 2.3 MB GPS-tagged photos → 6/6 uploaded
  audit decision PASS → 422 INCOMPLETE_CHECKLIST          (the 24-item GACP checklist was empty)
  … 24 items submitted → 200
  audit decision PASS → **422 CERTIFICATE_FARM_LOCATION_MISSING** ("ขาด ที่อยู่")

THE DEFECT: the filing carries the address the farmer typed at step 3 —
  {"siteAddress":"12 หมู่ 3","province":"เชียงใหม่","district":"สันทราย","subDistrict":"หนองหาร"}
— but `application.farmId` is **(none)**. The v2 submit path never creates or links a Farm row, and
the certificate reads its location from the FARM, not from formData. So a filing made through the
current wizard can pass documents, payment, scheduling, photographs and the full checklist, and
still be unable to receive a certificate.

This is the same class as F-QA-04 (the screen writes one place, the gate reads another) and it is
the last blocker on the production line. Fix direction: the submit path must materialise the Farm
(name, address, subDistrict, district, province, postal code, coordinates) from farmData and stamp
`application.farmId`, so the certificate can name the place it certifies. Everything upstream of it
is now proven working on staging.

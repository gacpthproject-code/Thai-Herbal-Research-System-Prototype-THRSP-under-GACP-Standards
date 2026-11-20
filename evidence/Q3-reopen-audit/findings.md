# Q3 — REOPEN-READINESS AUDIT — findings (spec-reader, read-only)
> ผลจาก spec-reader dispatch 2026-08-03 — persist โดย orchestrator ตามที่ส่งกลับ ไม่แก้ไขเนื้อหา
> Mandate: `evidence/Q3-reopen-audit/mandate.md`

หมายเหตุ scope: ไม่พบ artifact ชื่อ "S0–S6" ใน code ใด ๆ — dictionary จริงที่ contract test pin คือ 20 states ใน `apps/backend/services/workflow-transition-service.js:18-39` (pinned โดย `apps/backend/__tests__/unit/canonical-contract-verification.test.js:22-47`); "7-step workflow" มีเฉพาะใน comment (`apps/backend/shared/checkout-status.js:7-8`) → การ map S0–S6 = **AMBIGUOUS** (ดูท้ายรายงาน)

---

## ข้อ 1 — TERMINAL จริงไหม

**Application**
- CONFIRMED — terminal แท้ (ไม่มี exit edge): `CERTIFIED`, `REJECTED`, `CANCEL_EXPIRED` — `workflow-transition-service.js:70-71,83`; pinned: `canonical-contract-verification.test.js:78-84`
- CONFIRMED — `EXPIRED` **ไม่ใช่ terminal แล้ว**: SYSTEM-only edges `EXPIRED→REVISION_REQUESTED/CAR_PENDING` (waiver-reopen, owner ruling 2026-07-08) — `workflow-transition-service.js:72-80,181-182`
- CONFIRMED — มี "terminal" **สองนิยามที่ไม่ตรงกัน**: writer's `TERMINAL_STATUSES = {REJECTED, EXPIRED, CANCEL_EXPIRED, CERTIFIED}` (`application-status-writer.js:131-136`, export :833-838, ใช้ต่อใน `payment-slip-service.js:16-21`) นับ EXPIRED เป็น terminal ทั้งที่ transition table เปิด exit ให้แล้ว
- CONFIRMED — **ไม่มี DB CHECK บน `applications.status`** เลย: CHECK เดียวในระบบอยู่ที่ checkout/remittance tables (`prisma/migrations/20260802150000_wave1_checkout_engine_expand/migration.sql:50-59,118-120`) → terminal ของ application บังคับที่ JS layer เท่านั้น (writer + fence)
- CONFIRMED — EXPIRED-exit fence ใน canonical writer: ออกจาก EXPIRED ได้เฉพาะ actorRole=system หรือ `breakGlassReopen:true` — `application-status-writer.js:303-343`

**Sticky-return (แยกจาก terminal ชัดเจน)**
- CONFIRMED — returnable-by-design ไม่ใช่ terminal: `REVISION_REQUESTED↔ASSIGNED_FOR_REVIEW`, `CAR_PENDING↔CAR_REVIEWING↔AUDIT_PASSED` loop ไม่จำกัดรอบ — `workflow-transition-service.js:59,66-68,200-203`; slip reject `PHASE_*_SLIP_UNDER_REVIEW→PENDING_*_FEE` — :55,63

**CheckoutOrder / Invoice / Remittance**
- CONFIRMED — vocabulary: `SETTLED`/`CANCELLED` terminal, `EXPIRED→PENDING_PAYMENT` returnable — `shared/checkout-status.js:21-46`; DB CHECK บังคับเฉพาะ**ค่า** ไม่บังคับ**transition** (migration :50-52)
- CONFIRMED — `canTransitionCheckout` **ไม่ถูกเรียกใช้ runtime ที่ไหนเลย** — ผู้ใช้เดียวคือ unit test (`__tests__/unit/checkout-vocabulary.test.js:70-84`); probe pin มีเฉพาะฝั่ง "ใครเขียน SETTLED ได้" (`scripts/probes/settle-webhook-only.sh:5-13`) ไม่ pin การออกจาก terminal
- CONFIRMED — Invoice ไม่มี state machine เลย: statuses รวม `CANCELLED`/`FORFEITED`/`HELD` (`services/invoice-service.js:19-23`, `services/invoice/invoice-finance-ops.js:14-21`); guard เป็นจุด ๆ (hold ปฏิเสธ CANCELLED/FORFEITED :31-33; `releaseHold` HELD→previousStatus จาก metadata :70-98 = returnable-by-design)
- CONFIRMED — remittance: `RECONCILED` terminal, `BATCHED→PENDING` ย้อนได้โดย design — `shared/dtam-remittance-status.js:37-42`

## ข้อ 2 — RESURRECTION PATHS (terminal → non-terminal)

1. CONFIRMED — **waiver-reopen (sanctioned)**: same-case `EXPIRED→origin` โดย SYSTEM ใน tx เดียว + SoD + hash-chain — `services/waiver-reopen-service.js:406-447`; batch WRONGFUL_EXPIRY :485-634; route `routes/api/provider/waiver-reopen.js:80,118`
2. CONFIRMED — **admin force-status**: `assertTransition:false` (`services/admin-application-service.js:302-339`); exclusion เป็นฝั่ง **TARGET เท่านั้น** (DRAFT/EXPIRED/REJECTED — :55-65) → **จาก `REJECTED`/`CERTIFIED` ออกไป state ใดก็ได้** โดยไม่มี fence; `BREAK_GLASS_REOPEN` เปิดทางออก EXPIRED (:77-82,314)
3. CONFIRMED — **admin PATCH /:id/status** (ADMIN_STATUS_OVERRIDE): `assertTransition:false` — `routes/api/admin/applications.js:172-373` (:321) — รู FROM-side เดียวกัน (REJECTED/CERTIFIED ออกได้; EXPIRED ติด fence เพราะไม่ส่ง breakGlass)
4. CONFIRMED — **revert-last-transition**: ถ้า transition ล่าสุดคือ X→CERTIFIED/REJECTED การ revert คือ resurrect กลับ X — ไม่มี terminal check (มีแค่ guard status==lastTransition.toStatus) — `services/admin-application-service.js:365-469` (:414-429)
5. CONFIRMED — **fence เชื่อ string `actorRole`**: caller ใดอ้าง `'system'` ก็ข้าม EXPIRED fence ได้ — `application-status-writer.js:312-314`; ตัวอย่างจริง: `scripts/force_certify.js:18-25` (dev script, actorRole SYSTEM, assertTransition default false), `controllers/e2e-controller.js:356-365` (มี gate: ไม่ register ใน production + secret — `routes/api/system/e2e.js:9,26-49`)
6. CONFIRMED (code shape) / INFERRED (exploitability ขึ้นกับ timing ของ Stripe) — **checkout settle ไม่มี terminal gate**: `settleFromPaymentIntent` short-circuit เฉพาะ `SETTLED` (`services/checkout/checkout-settlement-service.js:112-114`) → order ที่ `EXPIRED`/`CANCELLED` ถูก settle ได้ (ขัด `ALLOWED_CHECKOUT_TRANSITIONS`, DB ไม่กัน) และ workflow unlock (:215-228) เรียก writer ด้วย actorRole `'SYSTEM'` โดย**ไม่ส่ง** `assertTransition:true` → application ที่ terminal แล้ว (รวม EXPIRED เพราะ system ข้าม fence) ถูกดันไป `DOC_FEE_PAID`/`AUDIT_FEE_PAID` ได้ — ต่างจาก slip lane ซึ่งมี live-row gate + `SETTLED_ON_TERMINAL_CASE` alert (`services/payment-slip-service.js:1253-1259,996-1016,1461-1494`)
7. CONFIRMED — seed/demo direct writer เข้าสู่ terminal: `scripts/update-health1-certified.js:65-69` (eslint-disable + เขียน CERTIFIED ตรง) — ทิศเข้า ไม่ใช่ออก แต่เป็น writer นอกวินัย

### เพิ่มเติมรอบ 2 (fix cycle 1/3 — completeness auditor ตีกลับ, spec-reader verify อิสระแล้วยืนยันครบทั้ง 5 กลุ่ม)
> Baseline fence ที่ใช้ตัดสินทุกกลุ่ม (`application-status-writer.js:312-343`): throw เฉพาะเมื่อ `from=EXPIRED` — **REJECTED / CERTIFIED / CANCEL_EXPIRED ไม่มี fence ใด ๆ** และ `assertTransition` default = false (`:288,:345`)

8. **CONFIRMED — 🚩 CRITICAL คลาสใหม่: bundle submit ให้ผู้สมัคร resurrect เคส terminal ของตัวเองได้ โดยไม่ต้องมีสิทธิ์ใด ๆ** — `routes/api/applications/application-bundles.js:307-317` เรียก `writeApplicationStatus` ต่อ linked app ด้วย `toStatus:'SUBMITTED'`, `actorRole:'HEALTH'`, **ไม่ส่ง assertTransition, ไม่ส่ง onAudit hook**; route auth = `authenticateHealth` (`:275`); link ไม่มี status filter ทั้งสองทาง (`:180-184`, `:92-100` ใช้ที่ `:223-231`); live 2 mount (`routes/api/index.js:123,147`) → เจ้าของเคสเอง link เคส `REJECTED`/`CERTIFIED`/`CANCEL_EXPIRED` เข้า bundle แล้ว submit = resurrect **เงียบ ไร้หลักฐาน ไร้ role พิเศษ** (EXPIRED เท่านั้นติด fence)
9. CONFIRMED — **provider-portal status-override (admin override ทางที่ 4)**: `routes/api/provider/handlers/admin.js:377-484` — target validation แค่ `WORKFLOW_STATES.includes(newStatus)` (`:407`) **ไม่มี exclusion list ทั้ง target และ FROM-side**, `assertTransition:false` (`:439`); mount `routes/api/provider/admin.js:13` — คนละไฟล์/คนละ mount กับ item 3
10. CONFIRMED — **provider-portal batch-actions (ทางที่ 5)**: `routes/api/provider/handlers/admin.js:98-244`; `findApplicationsByIds` ไม่กรอง status (`services/admin-application-service.js:542-549`) → terminal เข้า batch ได้ → writer `toStatus` = `ASSIGNED_FOR_REVIEW`/`REVISION_REQUESTED` ไม่ส่ง assertTransition (`:174-201`)
11. CONFIRMED — **ADMIN `force` บน canonical workflow-transitions endpoint (ทางที่ 6)**: `routes/api/provider/handlers/workflow-transitions-handler.js:66,229-238,349-358` → `buildTransitionUpdate` (`services/workflow-transition-service.js:326-336`): `force=true` **ข้าม `canTransition` + `canRoleTransition` ทั้งก้อน** (`:330,:334`) และข้าม mandatory comment (`:346`); REJECTED มี allowed-set ว่าง (`:71`) แต่ force ข้ามได้; mount `routes/api/provider/applications.js:323-324`
13. **CONFIRMED — คลาสใหม่ (รอบ 3): status write ที่ไม่ผ่าน writer chokepoint เลย** — `prisma/seed-gacp.js:321-323` ใช้ `prisma.application.upsert({ where:{applicationNumber}, update:{ status: app.status, ... } })` เขียนทับ row เดิมเป็น state non-terminal (`:150` ASSIGNED_FOR_REVIEW, `:164` APPROVED, `:178` AUDIT_CONFIRMED) โดยไม่จำกัด from-state → terminal ทุกตัวรวม EXPIRED ถูกเขียนกลับได้ **โดยไม่ผ่าน `writeApplicationStatus` เลย** = ไม่มี EXPIRED fence, ไม่มี `assertCanonicalStatus`, ไม่มี audit, ไม่มี version bump
    - **guard ของ repo มองไม่เห็น**: ESLint `gacp/no-direct-application-status-write` เป็น error (`apps/backend/eslint.config.js:80`) แต่ match เฉพาะ `update`/`updateMany` — `apps/backend/eslint-rules/no-direct-application-status-write.js:65` → **`upsert` เป็นรูของ guard เอง**
    - ไม่ใช่ ad-hoc script: เป็น Prisma seed hook (`apps/backend/package.json:75` ในบล็อก `"prisma"` — ไม่ใช่ npm script; เรียกด้วย `prisma db seed`) และ **CI รันไฟล์นี้ตรง ๆ** ที่ `.github/workflows/ci.yml:643` (แก้ถ้อยคำตาม auditor รอบ 3 — ของจริงแรงกว่าที่เขียนรอบแรก)
    - auditor ยืนยันด้วยการรันจริง: `npx eslint prisma/seed-gacp.js` → **0 violations** (ไม่มี .eslintignore, ไม่ติด ignores block)
    - **ผลต่อ baseline ของรายงานนี้**: ข้อความ "Baseline fence ที่ใช้ตัดสินทุกกลุ่ม" (ต้นข้อ 2 รอบ 2) ตั้งอยู่บนสมมติฐานว่า status write ทุกตัวผ่าน chokepoint เดียว — item นี้หักล้างสมมติฐานนั้น: **การป้องกัน terminal ที่ writer layer ไม่ครอบทุก writer**
14. CONFIRMED — **scripts/seed writers เพิ่มอีก 3 ตัว** (ใช้ `actorRole:'SYSTEM'` → ข้าม EXPIRED fence, ไม่ส่ง assertTransition): `scripts/fix_status.js:12-20` (app ล่าสุดตัวไหนก็ได้ → SUBMITTED), `scripts/uat-set-revision.js:15-30` (→ REVISION_REQUESTED), `prisma/seed-approve.js:33-60` (filter `status:{not:'APPROVED'}` ครอบ terminal ทั้งหมด → AUDIT_CONFIRMED → APPROVED แล้ว `generateCertificate` :71)

## ข้อ 3 — UNIQUENESS (ข้อชี้ขาด)

- CONFIRMED — partial unique ทั้งหมดในระบบ (inventory จาก migrations): open work-activity per (app,workType,stage) — `20260430160000:115-117`; **one OPEN checkout per (applicationId, milestone)** WHERE PENDING_PAYMENT — `20260802150000:89-94`; one ACTIVE invoice per (applicationId, serviceType) — `20260701010000:87-89`; waiver PENDING-per-app / APPROVED-LENIENCY-per-app — `20260708030000:53-60`, `20260708060000:10-14`; gatewayRef / trace-qr — `20260306200000:8-15`
- CONFIRMED — **ทุกตัว scope ที่ applicationId — ไม่มีสักตัวที่ scope healthId/entityId/farm/plot** ("1 เคส active ต่อ farmer" ไม่มีอยู่ทั้งใน DB และใน app layer: wizard สร้าง application+farm ใหม่อิสระ — `services/application-service/application-submission-methods.js:56-79,129-167`; `createDraftForHealth` ไม่มี guard — `application-applicant-query-methods.js:162-164`)
- CONFIRMED — precedent เคสที่สองต่อคนเดิมมีอยู่แล้วและไม่ชนอะไร: renewal สร้าง Application ใหม่ให้ healthId+entityId เดิม — `services/renewal-service.js:305-319`
- INFERRED (จาก inventory ข้างบน) — เคสใหม่หลังเคสเก่า terminal **ไม่ชน constraint ใด**; สิ่งเดียวที่ต้องออกใหม่คือ `applicationNumber @unique` (`prisma/schema/application.prisma:9`; precedent placeholder: `renewal-service.js:302-303`) และข้อจำกัดรอง `ApplicationDraft @@unique([userId, status])` (`application.prisma:282`) เฉพาะกรณี flow ผ่าน wizard-draft

## ข้อ 4 — 1:1 ASSUMPTIONS

- CONFIRMED — ผูกแบบ per-application ทั้งสิ้น → เคสใหม่ = namespace ใหม่ ไม่พัง: `phase1InvoiceId`/`phase2InvoiceId`/`phase1SlipId`/`phase2SlipId @unique` (`application.prisma:67,72,82,87`); invoice partial unique per (app,serviceType); `RevisionDeadline.applicationId @unique` (`prisma/schema/audit.prisma:119`); checkout `invoiceId`/`paymentTransactionId`/`stripePaymentIntentId @unique` (`billing.prisma:1284-1293`)
- CONFIRMED — Certificate **ไม่** unique ต่อ application (index เท่านั้น — `certification.prisma:139`); dedupe เป็น status-aware findFirst (`services/certificate-service.js:958-976`); มี chain columns `renewedCertificateId`/`previousCertificateId` (`certification.prisma:84-85`)
- CONFIRMED — cross-case link ที่มีอยู่เป็น **JSON marker** ไม่ใช่ FK: `formData.renewalOf` (`renewal-service.js:288-296`)
- INFERRED — จุดที่ "พัง/ต้องตัดสิน" ถ้าเคสสองอ้างเคสแรก: (ก) settlement อ่านต่อ applicationId เดียว (`waiver-reopen-service.js:98-121` ผ่าน `computePhaseSettlement`) → เคสใหม่มองไม่เห็นค่าธรรมเนียมที่ settle ในเคสเก่า — ถ้า design ต้องการ reuse เงินข้ามเคสแบบ waiver จะไม่มีทางเดินปัจจุบัน (ประเด็นเงิน); (ข) ไม่มี constraint กัน cert 'active' สองใบต่อ farm เดียว (ไม่มี unique บน farmId — `certification.prisma:132-141`) ถ้าเคสเก่า CERTIFIED แล้วเปิดเคสใหม่จนออก cert ที่สอง

## ข้อ 5 — REOPEN HACKS ที่มีอยู่แล้ว

- CONFIRMED — ทางการ: waiver-reopen (same-case, EXPIRED-only, SoD, reason ≥20 ตัวอักษร + masked, hash-chain) — แต่**ไม่มี field เลขที่หนังสืออนุมัติ** — `prisma/schema/waiver.prisma:40-59`
- CONFIRMED — ไม่ทางการ/หลักฐานอ่อน: `BREAK_GLASS_REOPEN` (reason free-text ≥10 — `admin-application-service.js:40,71-82`); ADMIN_STATUS_OVERRIDE (comment ≥5 — `routes/api/admin/applications.js:215-220`); revert-last-transition (reason ≥10 — `admin-application-service.js:41,381-386`); dev scripts `force_certify.js` / `update-health1-certified.js` (ไม่มีหลักฐานอนุมัติเลย)
- CONFIRMED — ไม่มี `reopenedFrom`/`resurrect`/`revive` field ใด ๆ ใน schema (grep ทั้ง repo — hits เป็น comment/entity-grant semantics เท่านั้น)

## ข้อ 6 — EXPAND FEASIBILITY

- CONFIRMED — precedent additive ล้วนมีครบ: `entityId` nullable เพิ่มกลางทาง (`application.prisma:24-30`), WaiverReopenRequest table ใหม่ (`20260708030000`), Wave-1 EXPAND-only (`20260802150000:4-6`), suspension columns "Nullable + additive — no backfill" (`certification.prisma:72-81`)
- INFERRED (ฐาน: ข้อ 3 = ไม่มี constraint ขวาง + precedents ข้างบน) — `reopenedFrom` + เลขหนังสืออนุมัติเพิ่มเป็น nullable columns/table ได้แบบ **EXPAND ล้วน** ไม่มีของเดิมบังคับ contract; terminal rows ของเคสเก่าไม่ต้องแตะ transition table (ตรง design "เปิดเคสใหม่")
- AMBIGUOUS — การอยู่ร่วมของ **สอง semantic**: design ใหม่ (new-case + หนังสืออนุมัติ) vs waiver-reopen เดิม (same-case, EXPIRED-only, pinned ใน contract test :80-84 + fence + `FORCE_STATUS_EXCLUSIONS` text) — ถ้า design ครอบ EXPIRED ด้วย = 2 กลไกต่อ 1 state; ถ้าแทนที่ = contract test/fence/exclusion text ต้อง revise — ผลต่างใหญ่, operator ต้องเลือก

---

## การจัดกอง

**(a) สอดคล้องอยู่แล้ว**
1. ไม่มี uniqueness/app-guard ขวางเคสใหม่ต่อ farmer/plot (ข้อ 3 ทั้งชุด) — เหตุผล: constraint ทั้งหมด per-application
2. renewal-service = precedent new-case-linked-to-old ที่รันจริง (`renewal-service.js:305-319`) — เหตุผล: พิสูจน์แล้วว่า pattern นี้ไม่ชนระบบ
3. 1:1 per-application ทั้งหมด reset ตามเคสใหม่ (ข้อ 4) — เหตุผล: namespace แยกโดยโครงสร้าง
4. canonical writer + hash-chain audit hook + contract-test pins พร้อมรองรับ transition ที่ต้องมีหลักฐาน — เหตุผล: โครง evidence มีแล้ว

**(b) ขัด — ต้องแก้ก่อน design ลง**
1. Checkout settle ไม่มี terminal gate (order EXPIRED/CANCELLED → SETTLED; app terminal → resurrect ผ่าน SYSTEM writer ไร้ assertTransition) — `checkout-settlement-service.js:112,215-228` — เหตุผล: เป็น resurrection ทางเงินที่ไร้หลักฐานอนุมัติ ขัด invariant "reopen คือทางออกเดียวจาก terminal" ที่ design ตั้งอยู่; slip lane มี gate แล้ว (`payment-slip-service.js:1253-1259,996-1016,1461-1494`) lane ใหม่ไม่มี
2. **Admin override 6 ทาง** (แก้จาก "3 ทาง" ในรอบแรก — รอบ 2 พบเพิ่ม 3) ออกจาก `REJECTED`/`CERTIFIED`/`CANCEL_EXPIRED` ได้ด้วย free-text ไร้ SoD/เลขหนังสืออนุมัติ — (1) force-status `admin-application-service.js:302-339` (2) PATCH `/admin/applications/:id/status` `routes/api/admin/applications.js:321` (3) revert-last-transition `admin-application-service.js:365-469` (4) provider status-override `routes/api/provider/handlers/admin.js:377-484` (5) provider batch-actions `handlers/admin.js:98-244` + `admin-application-service.js:542-549` (6) workflow-transitions force+ADMIN `workflow-transitions-handler.js:66,229-238` + `workflow-transition-service.js:326-336` — เหตุผล: ถ้าปล่อยไว้ design ใหม่กลายเป็น "polite path ข้างประตูหลัง" (ตรรกะเดียวกับที่ codebase บันทึกไว้ที่ `application-status-writer.js:303-311` ตอนสร้าง EXPIRED fence); blast radius ใหญ่กว่าที่รอบแรกประเมินเท่าตัว
2b. **🚩 CRITICAL (คลาสใหม่ ไม่ใช่ทางที่ 7 ของ admin-override): bundle submit — ผู้สมัครธรรมดา resurrect เคส terminal ของตัวเองได้** — `routes/api/applications/application-bundles.js:307-317` (auth `authenticateHealth` :275; link ไร้ status filter :180-184, :92-100) — เหตุผล: threat model ต่างจากทุกข้อข้างบนโดยสิ้นเชิง — **ไม่ต้องมี privileged role, ไม่มี reason, ไม่มี audit hook** ขัดตรงกับ invariant ของ design ("ออกจาก terminal ได้เฉพาะ role เจ้าหน้าที่ + เลขหนังสืออนุมัติ") = privilege escalation ฝั่ง identity/สิทธิ์ ต้องปิดก่อน design ลง
3. Fence เชื่อ string `actorRole:'system'` — `application-status-writer.js:312-314` + ตัวอย่าง `scripts/force_certify.js` — เหตุผล: exclusivity ของ reopen flow พังได้จาก caller ที่อ้าง role เอง (สิทธิ์/identity)
4. **Writer chokepoint ไม่ครอบทุก writer + guard มีรูที่ `upsert`** — `prisma/seed-gacp.js:321-323` (ผูกกับ `npm run seed`, `package.json:75`) เขียน status ข้าม `writeApplicationStatus` ทั้งหมด; ESLint rule จับแค่ `update`/`updateMany` (`eslint-rules/no-direct-application-status-write.js:65`) — เหตุผล: design ตั้งอยู่บน "ออกจาก terminal ได้ทางเดียวคือ reopen ที่มีหลักฐาน" ซึ่งบังคับที่ writer layer เท่านั้น ถ้ายังมีทางเขียนที่ข้าม writer ได้ (และ lint มองไม่เห็น) invariant นั้นไม่จริงตั้งแต่ต้น — ต้องปิดรูก่อน ไม่ใช่แค่เลิกใช้ seed ตัวนี้

**(c) ขัด — รอแก้พร้อมงาน reopen ได้**
1. นิยาม terminal สองแหล่ง (TERMINAL_STATUSES vs no-exit rows) — `application-status-writer.js:131-136` vs `workflow-transition-service.js:70-83`
2. ไม่มี `reopenedFrom`/approval-ref field — additive ทำพร้อมงานได้ (ข้อ 6)
3. Cross-case link precedent เป็น JSON (`renewalOf`) ไม่ใช่ FK — ตัดสิน format ตอน implement
4. Settlement/fee-reuse อ่าน per-application (`waiver-reopen-service.js:98-121`) — รอ policy เงินของเคส reopen
5. `ApplicationDraft @@unique([userId, status])` (`application.prisma:282`) — กระทบเฉพาะถ้า flow ผ่าน wizard-draft
6. Checkout `EXPIRED→PENDING_PAYMENT` edge ไม่มี writer (implementation สร้าง order ใหม่แทน — `stripe-checkout-service.js:119-148`) + `canTransitionCheckout` ไม่ถูก enforce — reconcile ได้พร้อมงาน
7. Dev scripts — รอบแรก `force_certify.js`, `update-health1-certified.js`; **รอบ 2 เพิ่ม** `scripts/fix_status.js:12-20`, `scripts/uat-set-revision.js:15-30`, `prisma/seed-approve.js:33-60` (ทั้งหมด `actorRole:'SYSTEM'` → ข้าม EXPIRED fence, ไม่ส่ง assertTransition) — offline ไม่มี auth surface จึงเป็น (c); เป็นหลักฐานเสริมของ (b)3 fence เชื่อ string `'system'`

---

## บรรทัดสรุป

**ข้อ 3 (UNIQUENESS) ชี้ขาด: design "เปิดเคสใหม่ผูกเคสเก่า" ทำได้เลย** — ไม่มี DB constraint หรือ app-level guard ใดที่ scope ต่อ farmer/plot/farm ขวางเคสที่สอง (ทุก unique เป็น per-applicationId; มี renewal precedent รันจริง) — เงื่อนไขเดียวคือ applicationNumber ใหม่

**Material notes (แตะ เงิน / identity / สิทธิ์):**
- **🚩 CRITICAL ลำดับแรกสุด: (b)2b bundle submit — ผู้สมัครธรรมดา resurrect เคส terminal ของตัวเองได้ ไร้ role พิเศษ ไร้ audit** (`application-bundles.js:307-317`) — ร้ายแรงกว่าทุก admin path เพราะไม่ต้องมีสิทธิ์เลย
- เงิน: (b)1 checkout-settle resurrect ไร้ terminal gate; (c)4 fee-reuse ข้ามเคสยังไม่มีทางเดิน; (b)2b ทางอ้อม (SUBMITTED รีสตาร์ท payment lifecycle)
- สิทธิ์/identity: (b)2 admin override **6 ทาง** (ไม่ใช่ 3 — รอบ 2 พบเพิ่ม 3 ทางฝั่ง provider portal) ออกจาก REJECTED/CERTIFIED/CANCEL_EXPIRED ไร้ SoD/หลักฐาน; (b)3 fence เชื่อ string actorRole (+ scripts 5 ตัวใน (c)7 เป็นตัวอย่างจริง)

**บันทึกกระบวนการ (verify-before-claim):** findings ข้อ 2 ผ่าน 3 รอบกว่าจะครบ — รอบแรกส่งไม่ครบ, completeness auditor ตีกลับ FAIL พบ 5 กลุ่มตกหล่น (spec-reader verify อิสระยืนยันจริงทั้งหมด, แก้ admin-override 3→6), **รอบสาม auditor ตีกลับอีกครั้ง** พบ item 13 (`seed-gacp.js` upsert ข้าม writer + รูของ ESLint guard) ซึ่งหักล้าง baseline assumption ของรายงานเอง — orchestrator verify สามข้อนี้ด้วยตัวเองก่อน persist เอกสารนี้คือฉบับหลัง integrate รอบ 3 (fix cycle 2/3)
- AMBIGUOUS ที่แตะสิทธิ์+เงินพร้อมกัน: การอยู่ร่วม/แทนที่ระหว่าง design ใหม่กับ waiver-reopen เดิม, นิยาม "role เจ้าหน้าที่" (ไม่มี generic officer ใน CANONICAL_ROLES), terminal set ที่ design ครอบ (EXPIRED นับไหม) — ทั้งสามข้อเป็น product/operator decision ก่อนวาง schema

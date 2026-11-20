# SPEC-READER Report — A0-AUDIT-EMISSION (2026-08-06)

> วิธีอ่าน: CONFIRMED = ยืนยันจากโค้ดจริง 2 grep pass cross-check (บทเรียน BACKLOG-FOUND.md:38) · INFERRED = อนุมานพร้อมระดับความมั่นใจ · AMBIGUOUS = ต้องให้ senior-swe/operator ตัดสิน

## CONFIRMED — (ก) Caller inventory ของ `writeApplicationStatus`

**ส่ง onAudit แล้ว (audit row atomic ใน tx เดียวกัน) — 6 จุด:**
1. routes/api/audit/audits.js:531 (GP-8 audit result) — hook :553-560
2. routes/api/provider/handlers/admin.js:175 (admin batch) — :183-186
3. routes/api/provider/handlers/admin.js:430 (admin override legacy) — :446-453
4. routes/api/provider/handlers/workflow-transitions-handler.js:469 (cert-voiding reversal) — :472
5. routes/api/provider/handlers/workflow-transitions-handler.js:483 (revision/CAR decision + auto-chain) — :486
6. services/waiver-reopen-service.js:406 (R2 EXPIRED→origin) — :419

**เขียน audit แยกแต่ใน tx เดียวกัน (เทียบเท่า) — 1 จุด:**
7. routes/api/admin/applications.js:312 — auditLogger.logWithin :352-370 ใน $transaction เดียวกัน

**ไม่มี onAudit = ช่องโหว่จริง (status เดินแต่ไม่มี canonical audit row) — 16 จุด live:**
8. routes/api/applications/applications.js:654 (DRAFT→SUBMITTED, GP-1c)
9. applications.js:684 (SUBMITTED→PENDING_DOC_FEE)
10. applications.js:723 (correction resubmit)
11. application-workflow-handlers.js:169 (EXPIRED helper, GP-5b)
12. application-bundles.js:360 (bundle submit loop)
13. applications-car.js:132 (CAR deadline expired)
14. applications-car.js:199 (CAR evidence resubmit)
15. routes/api/system/cron.js:260 (auto-expire cron)
16. **provider/handlers/auditor-audit-decision-handler.js:252 (GP-8 PASS/CAR/REJECT — hop เดียวกับที่ mint cert)** [Tier C]
17. provider/handlers/applications.js:178 (assign — dead code, ไม่มี FE caller ตาม L-081)
18. workflow-transitions-handler.js:168 (EXPIRED local copy)
19. scheduler-audit-schedules-post-handler.js:194 (schedule →AUDIT_CONFIRMED, GP-7)
20. workflow-side-effects.js:151 (auto-chain DOC_APPROVED→PENDING_AUDIT_FEE, GP-6a)
21. workflow-revision-expirations-handler.js:81 (forced expire)
22. provider/work.js:496 (work-inbox generic transition)
23. **services/checkout/checkout-settlement-service.js:216-227 (Stripe webhook settle — เส้นเงิน GP-4)** [Tier C/MONEY]
+ dev scripts (นอก live path): scripts/fix_status.js:12, force_certify.js:18, uat-set-revision.js:15, verify-e2e.js:56,81

**Bypass writer ทั้งตัว (plain prisma.update — ไม่มี fence/assertTransition/onAudit) — 4 จุด:**
- B1: application-provider-query-methods.js:172-178 ผ่าน scheduler-assign-reviewer-handler.js:146-149 — **เส้น live จริง** (FE coordinator/client-view.tsx:185) = L-081
- B2: routes/api/audit/audits.js:314 (POST /schedule →AUDIT_CONFIRMED)
- B3: provider/auditor.js:130 (final-approvals AUDIT_PASSED→APPROVED — cert-adjacent) [Tier C]
- B4: provider/auditor.js:219 (reject-to-auditor + cert revoke) [Tier C]

**แก้ข้อมูล GAP-MAP:** :68 อ้าง audits.js:362 (PATCH /:id/schedule) ว่า bypass — ตรวจแล้ว updateData ที่ :395-401 ไม่มี key `status` = column-only ไม่ใช่ status bypass → AMBIGUOUS #1

## INFERRED
- สองคลาสต้องแก้คนละแบบ: คลาส "ผ่าน writer แต่ไม่ส่ง onAudit" (#8-23) แก้ที่ caller · คลาส bypass (B1-B4) แตะ writer contract ไม่ถึง — ต้องแก้เส้นทาง (confidence: high)
- onAudit callback เป็น best-effort (application-status-writer.js:222-236 swallow+warn) — atomic จริงเฉพาะเมื่อส่ง tx handle; ทั้ง 6 จุดที่ส่งแล้วส่ง tx ครบ (confidence: high)
- B2 + #19 น่าจะเป็น 2 ใน "FOUR schedule writers" ของ GAP-MAP:68 — อีก 2 ตัวยังไม่พบ (confidence: medium)

## AMBIGUOUS — รอ senior-swe/operator
1. audits.js:362: GAP-MAP stale หรือมี path ที่ยังไม่เจอ — ตัดจาก scope หรือ re-verify?
2. schedule writers เจอ 2/4 — ต้อง sweep เพิ่มไหม?
3. **[MATERIAL — cert surface]** decision-handler:252 กับ auditor.js:130/:219 อยู่คนละฝั่งของ cert-mint moment — นับเป็น hop เดียวหรือสองใน RED-test invariant?
4. B1 ชนกับ L-081 (PENDING triage) — A0 รอหรือครอบไปเลยแล้วให้ L-081 supersede?
5. #17 dead route — เขียน RED กันเชิงป้องกันหรือตัดออก?

## (ค) RED-test scope เสนอ (invariant: "status write ผ่านจุดนี้ → audit row 1 แถวใน tx เดียวกัน" — ปัจจุบัน FAIL)
ลำดับ: (1) #23 settle [MONEY] (2) #16 decision (3) B3/B4 (4) B1 (5) B2 (6) #8/#9/#12 submit hops (7) ที่เหลือ #10-22

## (จ) Non-goals
ไม่แตะ money mutation (Law 3.4) · ไม่เลือกกลไกแก้ (writer default-on vs lint vs per-caller) — เป็นงาน design phase · ไม่ตัดสิน AMBIGUOUS เอง

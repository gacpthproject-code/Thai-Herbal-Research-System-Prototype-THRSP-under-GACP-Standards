## Q3 — REOPEN-READINESS AUDIT — 2026-08-03

Phase: (read-only audit — ไม่มี RED/GREEN) PLAN(mandate) → AUDIT → EVIDENCE → REPORT
Status: DONE — auditor PASS รอบ 3 | fix cycles 2/3 (ตีกลับ 2 ครั้ง ก่อนครบ)

Did:
- spec-reader ตรวจ 6 ข้อตาม mandate → `evidence/Q3-reopen-audit/findings.md` (จัดกอง a/b/c ทุกข้อมี file:line, ไม่มี patch ตามคำสั่ง)
- auditor completeness 3 รอบ: รอบ 1 FAIL (ข้อ 2 ตกหล่น 5 กลุ่ม) → รอบ 2 FAIL (ตกหล่นอีก 1: seed upsert ข้าม writer) → รอบ 3 **PASS** (AST scan ทั้ง repo 69 call sites + raw SQL + eslint-disable + caller sweep ของ writeApplicationStatus ~30 จุด — ไม่มีตกหล่นเพิ่ม ไม่มี over-claim)

Found (ผลชี้ขาด + ของที่ต้องรู้ก่อนออกแบบ):
1. **ข้อ 3 ชี้ขาด: design "เปิดเคสใหม่ผูกเคสเก่า" ทำได้เลย** — ไม่มี unique/partial-unique ตัวใด scope ที่ healthId/entityId/farmId/plot (ทุกตัว per-applicationId); precedent รันจริงคือ renewal (`services/renewal-service.js:319`) เงื่อนไขเดียวคือ applicationNumber ใหม่
2. **ข้อ 6: `reopenedFrom` + เลขหนังสืออนุมัติ เพิ่มได้แบบ EXPAND ล้วน** — ไม่มีของเดิมบังคับ contract (precedent: entityId nullable, WaiverReopenRequest, Wave-1, suspension columns)
3. **กอง (b) ต้องแก้ก่อน design ลง — 5 รายการ** โดย 2 อันดับแรกคือของที่รอบแรกมองไม่เห็น:
   - **🚩 (b)2b CRITICAL: ผู้สมัครธรรมดา resurrect เคส terminal ของตัวเองได้** ผ่าน bundle link-then-submit — ไม่ต้องมี role พิเศษ ไม่มี reason ไม่มี audit hook (`routes/api/applications/application-bundles.js:307-317`, auth `authenticateHealth` :275)
   - **(b)4: writer chokepoint ไม่ครอบทุก writer + ESLint guard มีรูที่ `upsert`** (`prisma/seed-gacp.js:321-323`, rule `no-direct-application-status-write.js:65`, รันใน CI `ci.yml:643`) — หักล้างสมมติฐานว่า terminal ถูกกันที่ writer layer จุดเดียว
   - (b)1 checkout settle ไร้ terminal gate [เงิน], (b)2 admin override **6 ทาง** (ไม่ใช่ 3), (b)3 fence เชื่อ string `actorRole:'system'`
4. กอง (a) 4 รายการ (สอดคล้องอยู่แล้ว), กอง (c) 7 รายการ (แก้พร้อมงาน reopen ได้)
5. AMBIGUOUS ที่ต้องให้ operator ตัดสินก่อนวาง schema: อยู่ร่วม/แทนที่ waiver-reopen เดิม, นิยาม "role เจ้าหน้าที่" (ไม่มี generic officer ใน CANONICAL_ROLES), terminal set ที่ design ครอบ (EXPIRED นับไหม)

Ratchet: n/a — งานนี้ไม่มี diff โค้ด (gate §4 ใช้เฉพาะข้อ 5-6 ตามคำสั่ง operator)

Blocked: —

Next (operator เลือกรายการจาก findings ก่อน remediation ตาม mandate):
1. ตัดสิน AMBIGUOUS 3 ข้อ (ข้อ 5 ข้างบน)
2. เลือกว่าจะปิดกอง (b) ข้อไหนก่อน — ผมเสนอลำดับตาม severity: (b)2b → (b)4 → (b)1 → (b)2 → (b)3
3. remediation เป็นงานแยกตาม mandate

Evidence: `evidence/Q3-reopen-audit/` — mandate.md, findings.md (ฉบับหลัง integrate 3 รอบ), orchestration-log.md, report.md

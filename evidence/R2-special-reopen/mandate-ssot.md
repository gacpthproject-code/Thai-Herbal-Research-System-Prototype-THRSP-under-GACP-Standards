# R2 SPECIAL REOPEN — มติที่ operator ยืนยันแล้ว (SSOT)
> operator 2026-08-03 — เก็บ verbatim
> **ช่องว่างที่พบ**: R2 ไม่เคยมีไฟล์ mandate ในรีโป (ต่างจาก AUTH-01 ที่มี `evidence/AUTH-01/mandate.md`)
> คำสั่ง R2 ฉบับเต็มอยู่ในบทสนทนาอย่างเดียว → ไฟล์นี้คือการปิดช่องว่างนั้น ทุก "APPLIED" ใน `evidence/DECISIONS-CROSSREF.md` อ้างมาที่ไฟล์นี้

## มติ (verbatim จาก operator)
1. pattern = **เปิดเคสใหม่ผูกเคสเก่า**
2. **เคสเดิม terminal ตลอดไป**
3. **EXPIRED + CANCELLED = terminal**
4. **EXPAND-only**
5. **ห้าม copy ข้อมูลอัตโนมัติ** (carry-over = ธง L3 รอนิติกร)
6. **approval record immutable void-only**
7. **role ชั่วคราว = Admin เท่านั้น** (ธง L2)
8. **`REOPEN_ENABLED` default OFF**

## คำสั่งจาก R2 instruction เดิม (2026-08-03) ที่ orchestrator ใช้อ้างอิงแต่ **ยังไม่เคย persist** — ขอ operator ยืนยัน
- "ห้ามสร้าง path ที่เปลี่ยน status เคส terminal — ทุกกรณี รวม admin"
- "**ห้ามให้ผู้สมัครเห็น/เรียก endpoint reopen**"
- "Approval record ไม่มี update/delete — void-only pattern" (ตรงกับมติข้อ 6 ข้างบน)
- S1–S5 (schema+migration / action+precondition+audit / flag / UI หลัง flag / banner)
- ธง L1–L4 = blocked-on-legal (อำนาจอนุมัติ / นิยาม role เจ้าหน้าที่ / carry-over / waiver coexist)

## คำตอบคำถามค้างที่ operator ให้ไว้แล้ว (บันทึกอยู่ที่ `QUEUE.md:20-22`)
- **EXPIRED = terminal** ยืนยัน — ใช้ `TERMINAL_STATUSES` เป็น SSOT
- **Waiver-coexist + นิยาม role เจ้าหน้าที่**: ค้าง รอหนังสือหารือนิติกรกรมฯ — **ห้าม assume ใน implementation ใด ๆ**

---

## REVISION 2026-08-03 — R2 FINAL (requirement ปิดสมบูรณ์) ทับไฟล์นี้
> ACTIVE requirement ย้ายไป `final-requirements.md` — ไฟล์นี้คงไว้เป็นประวัติ
- ข้อ 7 เดิม ("role ชั่วคราว = Admin เท่านั้น") → **[SUPERSEDED 2026-08-03 — FINAL ข้อ 6: reviewer/Audit กดตรง ไม่มีขาอนุมัติ ไม่มี Account]** ดู `legal-basis.md`
- ข้อ 6 เดิม ("approval record immutable void-only") → **[SUPERSEDED เชิงโครง — ไม่มี approval record; record ของ reopen action เข้ากติกา append-only ตาม FINAL ข้อ 4]**
- ข้อ 3 เดิม (EXPIRED+CANCELLED = terminal) → ยังจริง แต่ scope ต้นทาง reopen **แคบลง**เป็น "เฉพาะเคสที่ถูกปิดโดย cron FINAL ข้อ 5"
- ข้อ 1, 2, 4, 5, 8 → คงเดิม ไม่ขัด FINAL

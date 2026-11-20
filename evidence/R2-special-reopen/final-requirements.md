# R2 FINAL — requirement ปิดสมบูรณ์ (operator 2026-08-03, verbatim)
> ไฟล์นี้คือ **ACTIVE requirement เพียงแหล่งเดียวของ R2** — ทับทุก revision ก่อนหน้า
> ประวัติที่ถูกทับ: `mandate-ssot.md` (§REVISION ท้ายไฟล์) · `legal-basis.md` (L2) · `DECISIONS-CROSSREF.md` (banner หัวหมวด R2)
> ลำดับงานที่ operator สั่ง: **spec-reader gap analysis รวมทุก revision เทียบ sticky-return + design เดิม + D-1..D-13 → gap report → operator อนุมัติ → implement**

## ข้อกำหนด (verbatim)

1. **จ่ายช้า = ค้าง pending ไม่มี expiry** — spec-reader ตรวจว่าไม่มี expiry แอบอยู่ รายงานอย่างเดียว

2. **นาฬิกา 5 วันทำการ** (Thai calendar canonical) เริ่มนับเมื่อเจ้าหน้าที่แจ้งผลไม่ผ่านของรอบล่าสุด — **reset ทุกรอบ วนไม่จำกัดครั้ง นับเลขครั้งต่อ stage** — ระหว่างเคสอยู่ในมือเจ้าหน้าที่ **นาฬิกาเกษตรกรหยุด**

3. **Notification บังคับถึงเกษตรกร**: ผลไม่ผ่าน + รายการประเด็นต้องแก้ + กำหนดส่ง + ช่องทาง — **จดหมายในระบบเก็บถาวร**

4. **Append-only ทุก role ทุกกรณี ไม่มี edit/delete** — อัปเดต = record ใหม่มีเลขครั้ง ของเก่าคงอยู่ — spec-reader audit write path ทั้งหมดใน correction flow (file:line ครบ) ก่อนออกแบบ, **auditor ตรวจซ้ำแกนนี้พิเศษ**

5. **หลุดกรอบ 5 วัน → cron ปิดเคสอัตโนมัติ** (idempotent, audit log, ปฏิทิน+โครงเดียวกับ reminder job)

6. **Reopen (เคสปิดจากข้อ 5 เท่านั้น)**:
   - **reviewer (ตกตรวจเอกสาร) / Audit (ตกลงพื้นที่) กดได้เลย — ไม่มีขาอนุมัติ ไม่มี Account ใน process ทุกจุด**
   - **บังคับครบสามอย่างมิฉะนั้นทำไม่ได้ (test pin)**: note เหตุผล / เอกสารแสดงความจำนงลูกค้า / บันทึกผู้ทำ+role+เวลา+เคสต้นทางอัตโนมัติ
   - เปิดเคสใหม่ผูก `reopenedFrom` เคสเก่าคง terminal — pattern เดิม
   - **รายการ reopen ทั้งหมด query ย้อนได้** (มี list view สำหรับผู้มีสิทธิ์ดู)

7. **legal-basis.md**: mark คำตอบ L2 เดิม ("บัญชีเท่านั้น") เป็น `[SUPERSEDED 2026-08-03 by operator decision — Account ไม่อยู่ใน process reopen]` — active requirement = ข้อ 6 เท่านั้น **implementer/auditor ห้ามอ้างรายการ superseded**

## ผลต่อใบตัดสินใจเดิม (orchestrator สรุปเพื่อชี้ทาง gap report — spec-reader ตรวจซ้ำ)
| ข้อเดิม | ผลจาก FINAL |
|---|---|
| D-6 (Admin เท่านั้น / service-level check) | **SUPERSEDED** — ข้อ 6: reviewer/Audit กดตรง ไม่มีขาอนุมัติ ไม่มี Account |
| D-10 (void-only ของ approval record) | **SUPERSEDED เชิงโครง** — ไม่มี approval record แล้ว; record ของ reopen action เข้ากติกา append-only ข้อ 4 |
| D-4/D-5 (เคสต้นทาง = EXPIRED/CANCEL_EXPIRED) | **NARROWED** — ต้นทาง = เฉพาะเคสที่ถูกปิดโดย cron ข้อ 5; gap report ต้องตอบว่า cron เขียน status อะไร + แยกจาก terminal อื่นได้อย่างไร |
| D-2 (waiver coexist — ธง L4) | ยังค้าง แต่ scope แคบลง — gap report ต้องเทียบว่าเคสที่ cron ปิดทับกับเคสที่ waiver-reopen ครอบหรือไม่ |
| D-7 (ผู้สมัครห้ามเห็น reopen) | **ต้องทบทวน** — ข้อ 3 บังคับ notification ถึงเกษตรกร (คนละเรื่องกับ reopen visibility แต่ต้องวางเส้นให้ชัดใน gap report) |
| D-1 (เงิน — เคสใหม่จ่ายซ้ำ?) | **ยังไม่ถูกตอบใน FINAL** — ยัง OPEN (Law 3.4: orchestrator ไม่เสนอ) |
| D-11ข (PDPA delete vs immutable ไฟล์แนบ) | ยัง OPEN — ตอนนี้แรงขึ้นเพราะข้อ 6 บังคับแนบ "เอกสารแสดงความจำนงลูกค้า" |
| D-3/D-8/D-12/D-13 (createdBy=UUID / FK จริง / เลขคำขอ / flag) | คงเดิมตาม crossref — ไม่ขัด FINAL |

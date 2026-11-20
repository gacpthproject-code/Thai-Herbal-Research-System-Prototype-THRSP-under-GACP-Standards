# Census — AREA "invoice" (slot 10, ใบเสนอราคา / payment step)

- Reader: subagent, 2026-09-01
- File read IN FULL: `apps/web-app/src/app/health/applications/new/_steps/steps/invoice-step.tsx` (705 lines)
- Legal authority read end-to-end first: `reports/research/2026-09-01-dtam-application-baseline/facts.md`
- Comparison basis given by coordinator: **นอกขอบ กทล.1** — การเงินของแพลตฟอร์มอยู่ใต้ F-G4-64; งานของ census นี้คือระบุเฉพาะสิ่งที่ปนเรื่อง **เอกสาร/รีวิว** เข้ามาในขั้นนี้

## สรุปหัวเรื่อง

1. ขั้นนี้ **สะอาดเกือบทั้งหมด** ในแง่ กทล.1: ไม่มี field กรอกข้อมูลคำขอ ไม่มี slot เอกสารแนบ และ **ไม่มี upload surface ใด ๆ ในไฟล์นี้** (slip อัพโหลดที่ `/health/payments` นอกไฟล์นี้ — comment บรรทัด 340-341) ทุกอย่างเป็นการเงินแพลตฟอร์มใต้ F-G4-64 ซึ่ง facts.md ไม่มีอำนาจเหนือ (กทล.1 ไม่มีเรื่องค่าธรรมเนียม/ใบเสนอราคาเลย — §2 ระบุเพียง "ผู้ประกอบการจ่ายค่าตรวจแล็บ" กรณีพิเศษใน §3)
2. จุดปนเรื่อง **เอกสาร/รีวิว** ที่พบมี 2 จุด และเป็นการ "เอ่ยชื่อ" ไม่ใช่ surface จริง:
   - **บรรทัด 569-584** (branch "คำขอนี้ยังไม่ได้ยื่น"): copy + ปุ่มชี้ไป "หน้าตรวจสอบคำขอ" (`/health/applications/preview`) — หน้านี้คือหน้าที่ ruling 7 (facts.md §4) สั่งรื้อ+ยุบเหลือ "หน้าตรวจทานเดียว" ⇒ **REWORD**: ชื่อประตู/route ในขั้นนี้ต้องตามหน้าที่ยุบแล้ว มิฉะนั้นจะชี้หน้าที่ไม่มีอยู่หรือชื่อไม่ตรง
   - **บรรทัด 630-634**: ประโยคนำทาง "เจ้าหน้าที่การเงินจะตรวจสอบหลักฐานการชำระเงินก่อนคำขอจะเข้าสู่**ขั้นตอนตรวจเอกสาร**" — เป็นที่เดียวที่ขั้นรีวิวเอกสารถูกเอ่ยถึง; เป็น copy บอกลำดับเท่านั้น ไม่มี UI รีวิว/เอกสารรั่วเข้ามา ⇒ KEEP พร้อมหมายเหตุ
3. ไม่มีรายการใดในไฟล์นี้ที่ขอเอกสาร/ข้อมูลเกิน DTAM (ruling 2) — checkbox เดียวที่มีคือ acceptance-of-record ของใบเสนอราคา (การเงินแพลตฟอร์ม ไม่ใช่คำรับรอง ส่วนที่ ๔ ของ กทล.1 ซึ่ง facts.md map ไป consent step อยู่แล้ว)

## ตาราง census (ทุก field / option / checkbox / slot / section / behaviour)

| # | file:line | kind | สิ่งที่ UI แสดง (Thai) | verdict | อ้างอิง | หมายเหตุ |
|---|---|---|---|---|---|---|
| 1 | invoice-step.tsx:383 | page-section | หัวข้อ "ใบเสนอราคาของคำขอนี้" + ลิสต์ทุก row (dtam+platform) | KEEP | นอกขอบ กทล.1 — F-G4-64 | แสดง QT-PRD- row จาก register ทุกฉบับ; pre-W14 มี 2 ฉบับ |
| 2 | invoice-step.tsx:432 | page-section | เอกสารใบเสนอราคา (เลขที่/วันที่/มีผลถึง/รายการ 2 งวดต่อ scope/ยอดรวม+ตัวอักษรไทย) | KEEP | นอกขอบ กทล.1 — F-G4-64 | ยอดจาก row verbatim ไม่มีคำนวณสด (spec §3.2); กทล.1 ไม่มีตารางค่าธรรมเนียม |
| 3 | invoice-step.tsx:222 | behaviour | ชื่อผู้ขอ/ชื่อองค์กร/เลขภาษี-เลขบัตร/ที่อยู่/โทรศัพท์ บนหัวเอกสาร | KEEP | นอกขอบ กทล.1 — F-G4-64 | echo ข้อมูล ส่วนที่ ๑ จาก wizard state เพื่อจ่าหน้าเอกสารเท่านั้น — ไม่มีช่องกรอกใหม่ |
| 4 | invoice-step.tsx:413 | page-section | ประกาศ scopeMismatch "ใบเสนอราคาฉบับนี้ออกตามจำนวนรูปแบบการปลูกที่คำขอระบุไว้ในวันที่ออกใบ…" | KEEP | นอกขอบ กทล.1 — F-G4-64 (ruling 12 ของ F-G4-64) | เอ่ยถึงเนื้อคำขอ (จำนวนรูปแบบการปลูก) แต่ไม่ขอเอกสาร/ไม่เปิดรีวิว — ยอดตรึง ณ วันออกใบ |
| 5 | invoice-step.tsx:467 | field | checkbox "ข้าพเจ้ารับทราบและยอมรับใบเสนอราคาเลขที่ … และยืนยันจำนวนเงินตามใบเสนอราคาข้างต้น" (หนึ่ง tick ต่อฉบับ) | KEEP | นอกขอบ กทล.1 — F-G4-64 | tick = acceptance ของจริง (POST accept แล้วเชื่อ row ที่ตอบกลับ) ไม่ใช่คำรับรอง ส่วนที่ ๔ |
| 6 | invoice-step.tsx:489 | page-section | ประกาศ row หมดอายุ (lapsedNotice) — ไม่วาด tick | KEEP | นอกขอบ กทล.1 — F-G4-64 | replacement ออกที่หน้ารายการชำระเงิน ไม่สัญญาเกินจริง |
| 7 | invoice-step.tsx:497 | page-section | "ใบเสนอราคาฉบับนี้ไม่สามารถกดยอมรับได้แล้ว กรุณาติดต่อเจ้าหน้าที่ พร้อมแจ้งเลขที่เอกสาร …" | KEEP | นอกขอบ กทล.1 — F-G4-64 | branch EXPIRED/REJECTED ที่รับไม่ได้และไม่ lapsed |
| 8 | invoice-step.tsx:377 | page-section | กล่อง error (role=alert) ข้อความ localError | KEEP | นอกขอบ กทล.1 — F-G4-64 | ประกาศผล refuse ของ accept/payment ต่อ screen reader |
| 9 | invoice-step.tsx:359 | page-section | สถานะโหลด "กำลังโหลดใบเสนอราคาของคำขอนี้" | KEEP | นอกขอบ กทล.1 — F-G4-64 | — |
| 10 | invoice-step.tsx:524 | page-section | "ไม่พบรหัสคำขอ" + ปุ่ม "ไปขั้นตอนยืนยันคำขอ" (→ step/9) | KEEP | นอกขอบ กทล.1 — F-G4-64 | branch ไม่มี applicationId (stale bookmark) — ชี้ประตูที่ถูกต้อง ไม่แตะเรื่องเอกสาร |
| 11 | invoice-step.tsx:545 | page-section | "ตรวจสอบใบเสนอราคาไม่สำเร็จ" + ปุ่ม "รีเฟรช" | KEEP | นอกขอบ กทล.1 — F-G4-64 | lookup ล้มเหลว ≠ ไม่มีใบ — copy ตามจริง |
| 12 | invoice-step.tsx:569 | page-section | "คำขอนี้ยังไม่ได้ยื่น … กรุณาไปที่หน้าตรวจสอบคำขอ" + ปุ่ม "ไปหน้าตรวจสอบคำขอ" (→ /health/applications/preview) | **REWORD** | facts.md §4 ruling 7 | จุดปนเรื่องรีวิวจุดเดียวที่ต้องแก้: ruling 7 สั่งยุบ "ตรวจทานและส่ง"+"พรีวิว" เหลือหน้าตรวจทานเดียว — ชื่อปุ่ม/ข้อความ/route ในขั้นนี้ต้องตามชื่อและ route ของหน้าที่ยุบแล้ว (ตอนนี้เรียก "หน้าตรวจสอบคำขอ" ชี้ preview เดิม) |
| 13 | invoice-step.tsx:593 | page-section | "ระบบกำลังออกใบเสนอราคาของคำขอนี้" + ปุ่ม "รีเฟรช" | KEEP | นอกขอบ กทล.1 — F-G4-64 | GET re-issue idempotent — รีเฟรชเปลี่ยนผลได้จริงใน branch นี้ |
| 14 | invoice-step.tsx:630 | page-section | "กดปุ่มด้านล่างเพื่อไปหน้ารายการชำระเงิน … เจ้าหน้าที่การเงินจะตรวจสอบหลักฐานการชำระเงินก่อนคำขอจะเข้าสู่ขั้นตอนตรวจเอกสาร" | KEEP | นอกขอบ กทล.1 — F-G4-64; ลำดับ จนท. ตรวจเอกสาร = facts.md §2 (ส่วน จนท. 1.4) | ที่เดียวที่ "ขั้นตอนตรวจเอกสาร" ถูกเอ่ย — เป็น copy บอกลำดับ ไม่มี surface รีวิว/เอกสารเข้ามาในขั้นนี้ |
| 15 | invoice-step.tsx:646 | page-section | คำอธิบายปุ่ม disabled 3 branch: "กรุณาติ๊กยอมรับ…ทุกฉบับ" / "…เพราะ{lapsedNotice}" / "…ติดต่อเจ้าหน้าที่ พร้อมแจ้งเลขที่เอกสาร …" | KEEP | นอกขอบ กทล.1 — F-G4-64 | ทุก branch ขอเฉพาะ act ที่มี control จริงบนจอ |
| 16 | invoice-step.tsx:669 | option | ปุ่ม "ย้อนกลับ" (→ step/9) | KEEP | นอกขอบ กทล.1 — F-G4-64 | navigation ล้วน |
| 17 | invoice-step.tsx:673 | behaviour | ปุ่ม "ไปหน้าชำระเงิน" / "กำลังเปิดหน้าชำระเงิน..." — POST /payments/phase1/:id แล้วไป /health/payments (slip flow) | KEEP | นอกขอบ กทล.1 — F-G4-64 | invoice ออกฝั่ง server; **ไม่มี upload surface ในขั้นนี้** — slip อัพโหลดที่หน้า /health/payments นอกไฟล์นี้ |
| 18 | invoice-step.tsx:675 | behaviour | DEMO_MODE bypass: `isNextDisabled={DEMO_MODE ? false : !canProceed || isProcessing}` | KEEP | นอกขอบ กทล.1 — F-G4-64 | demo เท่านั้น; ฝั่ง server services/billing/quotation-gate.js ยัง refuse ถ้ายอมรับไม่ครบ — เครื่องบังคับอยู่หลังบ้าน ไม่ใช่ปุ่ม |
| 19 | invoice-step.tsx:290 | behaviour | handleAccept — tick คือ acceptance: POST accept, เชื่อ row ที่กลับมา, refuse แยก 3 เหตุ + reload เมื่อ INVALID_QUOTATION_STATUS | KEEP | นอกขอบ กทล.1 — F-G4-64 | overlay ของ withAcceptedRow (บรรทัด 96) กัน lineItems/scopeMismatch หาย |
| 20 | invoice-step.tsx:686 | behaviour | print style A4 + data-print-hide (พิมพ์เฉพาะตัวเอกสารใบเสนอราคา) | KEEP | นอกขอบ กทล.1 — F-G4-64 | — |

## สิ่งที่ตรวจแล้ว "ไม่พบ" (ยืนยันโดยการอ่านทั้งไฟล์)

- **upload surface: 0** — ไม่มี input file / dropzone / attachment slot ใด ๆ ในไฟล์นี้
- **field กรอกข้อมูลคำขอ: 0** — ข้อมูลผู้ขอเป็น read-only echo จาก wizard state (บรรทัด 222-251) ใช้จ่าหน้าเอกสารเท่านั้น
- **surface รีวิว/checklist จนท.: 0** — มีเพียงการเอ่ยชื่อขั้น (แถว 14) และประตูไปหน้า preview (แถว 12)
- คำรับรอง/consent ของ กทล.1 ส่วนที่ ๔ ไม่ปรากฏในขั้นนี้ (ถูกต้อง — facts.md map ไป consent step)

## Verdict รวม

- KEEP: 19 (ทั้งหมดคือการเงินแพลตฟอร์มใต้ F-G4-64 — นอกอำนาจ กทล.1 ตาม brief ของ coordinator)
- REWORD: 1 (แถว 12 — ชื่อ/route ประตู "หน้าตรวจสอบคำขอ" ต้องตามหน้าตรวจทานเดียวของ ruling 7)
- CUT / OPTIONAL / CONDITIONAL / MOVE_TO_AUDIT / GENERATE: 0

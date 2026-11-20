# verify-33 — SKEPTIC check: behaviour persist เอกสาร purpose ลง store (category "purpose-license", sourceStep 1) — 2026-09-01

Role: SKEPTIC พยายามหักล้าง verdict **CUT** ของ census (plant.md แถว 19) เพื่อปกป้องช่องของเกษตรกรจากการตัดเกิน

## Item ที่ตรวจ

| item | file:line | UI ปัจจุบัน | census verdict | census citation |
|---|---|---|---|---|
| behaviour persistPurposeDocuments — filter เอกสารเดิมที่ type อยู่ใน PURPOSE_DOCUMENT_SET ออก แล้วเขียนชุด ภท. ที่อัพโหลดแล้วกลับลง store พร้อม metadata `{required, category: 'purpose-license', sourceStep: 1}` | plant-selection-step.tsx:150-171 (เรียกจาก handler :173-193); PURPOSE_DOCUMENT_SET config.ts:258-260; buildPurposeDocumentState config.ts:353-371 (hydrate กลับ :41-46) | (ไม่มี UI — เก็บ state เอกสาร ภท.09/10/11 ลง documents store) | **CUT** | ตามแถว 14-16 (facts.md:30-53, :56) |

## Surfaces ที่กลไกนี้แตะ (census เฉพาะขอบเขต item — แถวหลักอยู่ใน plant.md)

| surface | file:line | Thai label ปัจจุบัน | แถว census เจ้าของ |
|---|---|---|---|
| upload slot M1_PT11 (required:true ทุก purpose) | plant-selection-config.ts:181-188 | "ภท.11 (คำขออนุญาตสมุนไพรควบคุม)" | plant.md แถว 14 REWORD→ช่องใบอนุญาตเดียว CONDITIONAL |
| upload slot M1_PT09 (required:true) | plant-selection-config.ts:189-196 | "ภท.09 (คำขออนุญาตเพาะปลูก)" | plant.md แถว 15 CUT (verify-30 upheld) |
| upload slot M1_PT10 (required:true) | plant-selection-config.ts:197-204 | "ภท.10 (คำขออนุญาตจำหน่าย/ส่งออก)" | plant.md แถว 16 CUT (verify-31 upheld) |
| union+dedupe ตามวัตถุประสงค์ (requiredDocumentTypes/uniqueSelectedPurposeDocs) | plant-selection-step.tsx:111-137 | ตัวนับ "อัปโหลดแล้ว X/Y" | plant.md แถว 17 CUT |
| isReady gate บังคับอัพโหลดครบก่อน Next | plant-selection-step.tsx:142-148, 204-211 | "บันทึกและไปขั้นตอนถัดไป" disabled | plant.md แถว 18 REWORD |
| downstream ผู้อ่าน category/type ชุดนี้ | review-completeness.ts:18 · packages/validation/src/upload-rules.js:113-119,191-196 | (ไม่มี UI) | census documents.md / upload-plumbing.md / backend-slots.md (verify-31 ระบุ :45,:135 CUT ฝั่ง backend) |

## ความพยายามหักล้าง — สิ่งที่ค้นแล้ว

1. **facts.md ทั้งฉบับ**: กทล.1 ส่วนที่ ๓ (facts.md:30-53) ไม่มีรายการ ภท. ใด ๆ · จุดเดียวที่ใกล้คือ checklist จนท. (facts.md:56) — "ใบอนุญาต/หนังสือสำคัญ **กรณี**...ที่ต้องได้รับอนุญาตตามกฎหมาย" กำกับตรงตัวว่าคือ*ตัวใบอนุญาต ไม่ใช่แบบคำขอ ภท.* และเป็นเงื่อนไข ไม่ใช่บังคับทุกราย → รองรับได้แค่ช่องเดียวแบบ CONDITIONAL (ดูดซับแล้วโดยแถว 14 REWORD) ไม่รองรับกลไก persist ชุด 3 ใบ required:true
2. **docs/requirements/gacp-document-requirements-research.md** (:261, :460): ระบุชื่อกฎหมายจริง — ประกาศกระทรวงสาธารณสุข เรื่อง สมุนไพรควบคุม (กัญชา) พ.ศ. 2565 — แต่บริบทคือกระบวนการขอ*ใบอนุญาตจำหน่าย/แปรรูป/ส่งออก*ต่อผู้อนุญาตตาม พ.ร.บ.คุ้มครองและส่งเสริมภูมิปัญญาการแพทย์แผนไทย พ.ศ. 2542 — เป็นคนละกระบวนการกับการยื่น กทล.1 ขอ GACP · ประกาศนี้สร้างหน้าที่*ถือใบอนุญาต*สำหรับกิจกรรมเหล่านั้น ซึ่งคือสิ่งที่ checklist จนท. ขอดู (ตัวใบ, conditional) — ไม่ได้บังคับให้แพลตฟอร์มเก็บ*แบบคำขอ* ภท. 3 ใบ ณ วันยื่น GACP
3. **docs/requirements/official-gacp-requirements-dtam.md:85-90**: ตาราง "แบบฟอร์มหลัก" มี ภ.ท.11/ภ.ท.12 สถานะ "ขาด" — เป็น gap-analysis ของแพลตฟอร์มรุ่นเก่า ไม่อ้างกฎกระทรวง/ประกาศฉบับใดว่าต้องแนบ ณ วันยื่น กทล.1 และขัดกับ full-text extract ใน facts.md ซึ่งเป็น authority ของ census นี้ · ยังลิสต์ฟอร์มไม่ตรงกับชุดในโค้ดด้วยซ้ำ (มี ภ.ท.12 ไม่มี ภ.ท.09/10)
4. **backend/prisma/shared**: seed-plants เสนอ licence types 'BhT 11/13/16' โดยไม่อ้างกฎหมาย (ตาม verify-31) · upload-rules.js:113-119,191-196 รับ M1_PT* / LICENSE_PT* เป็น alias — เป็น plumbing ตาม ๆ กัน ไม่ใช่ฐานกฎหมาย
5. **facts.md:75 (UNVERIFIED note)**: ฉบับกฎหมายใบอนุญาตที่ใช้บังคับ ณ วันยื่นยังไม่ยืนยัน — ห้าม seed ชื่อ ภท. ตายตัว ยิ่งทำให้กลไกที่ hardcode ชุด ภท.09/10/11 required:true ยืนไม่ได้

## ข้อโต้แย้งที่แรงที่สุดที่หาได้ (และคำตอบ)

- "ช่องใบอนุญาต conditional ที่เหลือ (แถว 14) ยังต้องมีที่เก็บ → ควรเป็น REWORD ไม่ใช่ CUT?" — ไม่: ความต้องการ storage ของช่องเดียวนั้นเป็นสมบัติของแถว 14 (REWORD) อยู่แล้ว · กลไกใน item นี้ตามที่สร้าง (ชุด 3 type ผูก purpose, union required:true, category "purpose-license", hydrate ด้วย PURPOSE_DOCUMENT_SET) ไม่มีส่วนใดรอดในรูปเดิมเมื่อเหลือช่องเดียวแบบ conditional — semantics ของ category เองก็ผิด (เก็บ*แบบคำขอ* ไม่ใช่*ใบอนุญาต*) · CUT พร้อม carve-out ("เหลือเท่าที่ช่องใบอนุญาตช่องเดียวต้องใช้") ตามที่ census เขียนไว้แล้ว คือคำตัดสินที่ตรงกว่า
- "ตัดแล้ว review-completeness/backend จะพัง" — เป็นลำดับงาน implementation ไม่ใช่ฐานกฎหมาย และแถวของ surfaces เหล่านั้นใน documents.md/upload-plumbing.md/backend-slots.md ถือ verdict สอดคล้องกันอยู่แล้ว

## Verdict

**upheld = true — CUT ยืนตามเดิม** ไม่พบกฎกระทรวง/ประกาศ/ช่องบนแบบ กทล.1 ที่ระบุชื่อได้ใน repo ที่บังคับให้เก็บ (persist) ชุดเอกสาร ภท.09/10/11 ตามวัตถุประสงค์ ณ วันยื่นคำขอ GACP กัญชา · ประกาศ สธ. สมุนไพรควบคุม (กัญชา) พ.ศ. 2565 ที่ repo อ้างถึงรองรับเพียง*ใบอนุญาต*แบบมีเงื่อนไขช่องเดียว (facts.md:56) ซึ่งแถว 14 REWORD ครอบคลุมแล้ว · สอดคล้อง verify-30 (ภท.09 CUT upheld) และ verify-31 (ภท.10 CUT upheld)

หมายเหตุถึง implementer (ไม่เปลี่ยน verdict): ตอนรื้อ ให้ถอด PURPOSE_DOCUMENT_SET filter (step.tsx:151-153) อย่างระวัง — มันเป็นตัวกันเอกสาร step อื่นไม่ให้ถูกเขียนทับ · ช่องใบอนุญาตเดียวที่เหลือต้องเก็บด้วย semantics ใหม่ (ตัวใบอนุญาต, conditional, ไม่ seed ชื่อ ภท. ตายตัวจนกว่ายืนยันฉบับกฎหมาย — facts.md:75) · downstream readers ของ category "purpose-license"/type M1_PT* (review-completeness.ts:18, upload-rules.js:113-119) ต้องตามไปพร้อมกันตามแถวของมันเอง

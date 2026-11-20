# verify-32 — behaviour union+dedupe เอกสารตามวัตถุประสงค์ + badge + empty-state (plant.md แถว 17) — 2026-09-01

Role: SKEPTIC พยายามหักล้าง verdict **CUT** เพื่อปกป้อง mechanism ของเกษตรกรจากการตัดเกิน

## Item ที่ตรวจ

| item | file:line | UI ปัจจุบัน | census verdict | census citation |
|---|---|---|---|---|
| behaviour union+dedupe + badge นับ + empty-state | plant-selection-config-panels.tsx:346-411, 413-415 · plant-selection-step.tsx:111-137 | "เอกสาร M1 ที่ต้องแนบ" + badge "X รายการบังคับ" + "Y/Z อัปโหลดแล้ว" + empty-state "เลือกวัตถุประสงค์ก่อน เพื่อแสดงรายการเอกสารที่ต้องแนบ" | **CUT** | facts.md §2: รายการแนบส่วนที่ ๓ คงที่ ไม่ผันตามวัตถุประสงค์ |

## สิ่งที่อ่านจริงใน session

- facts.md ทั้งฉบับ — ส่วนที่ ๓ (facts.md:30-53) branch ตาม เช่า/Outdoor-Indoor-Greenhouse/ประเภทผู้ยื่น/ต่ออายุ-ใบแทน เท่านั้น **ไม่มีแถวใด branch ตามวัตถุประสงค์** · ช่อง จนท. (facts.md:56) ขอ*ตัวใบอนุญาต* ไม่ใช่แบบคำขอ ภท.
- plant-selection-config.ts:34-42, 174-232 — ทุก purpose (COMMERCIAL/EXPORT/RESEARCH) ชี้ `M1_DOCUMENT_SET` ก้อนเดียวกัน 3 รายการ required:true ทั้งหมด · comment ในไฟล์เองประกาศว่า "exactly 3 forms regardless of purpose" และ "picking 1, 2, or all 3 purposes always yields exactly the 3 upload slots"
- plant-selection-config-panels.tsx:346-415 — union+dedupe IIFE, badge requiredCount (ค่าคงที่ = 3 เสมอ), badge uploadedCount, empty-state
- plant-selection-step.tsx:111-137 — union ฝั่ง state (requiredDocumentTypes, uniqueSelectedPurposeDocs, uploadedCount) กลไกเดียวกัน
- ค้น repo หา named legal basis: docs/requirements/*.md · apps/backend/constants/document-slots.js · shared/validation/prisma (grep ภท/สมุนไพรควบคุม/มาตรา 46/purpose→document)

## ความพยายามหักล้าง (ยกฐานที่แข็งที่สุดที่ repo มี)

**ผู้ท้าชิงเดียวที่มีชื่อกฎหมายจริง: apps/backend/constants/document-slots.js:8-15, 53-96** อ้าง "กฎกระทรวง พ.ศ. 2559" (ใต้ พ.ร.บ.คุ้มครองและส่งเสริมภูมิปัญญาการแพทย์แผนไทย — ระบอบใบอนุญาตสมุนไพรควบคุม) และ map ตามวัตถุประสงค์จริง: RESEARCH → ภ.ท.9 (ศึกษาวิจัย), EXPORT → ภ.ท.10 (ส่งออกเพื่อการค้า), จำหน่าย/แปรรูปเพื่อการค้า → ภ.ท.11 — ดูเผิน ๆ เหมือนพิสูจน์ว่า "เอกสารผันตามวัตถุประสงค์" มีฐานกฎหมาย แต่ล้มทุกทาง:

1. **ผิดระบบ ผิดวัน**: กฎกระทรวงนั้นคุมกระบวนการ*ขอใบอนุญาต*ที่ยื่นผ่าน herbctrl.dtam.moph.go.th (ระบบอื่นของกระทรวง) — ไม่ใช่รายการแนบของคำขอ GACP กทล.1 · document-slots.js เองยอมรับ: ภ.ท.9/10 = `canProceedWithout: true` "เนื่องจากยื่นผ่านระบบอื่น" (บรรทัด 438, 449) และทุก slot ภท. = `status: 'STUB'`
2. **กทล.1 ดูดซับสัญญาณนี้ไว้ที่เดียว**: ช่อง จนท. 1.1 ขอ "ใบอนุญาต/หนังสือสำคัญ กรณี...ที่ต้องได้รับอนุญาตตามกฎหมายที่เกี่ยวข้อง" = *ตัวใบอนุญาต* หนึ่งช่อง แบบ CONDITIONAL (facts.md:56) — แถว 14 (REWORD) รับหน้าที่นี้ไปแล้ว ฉบับกฎหมายที่ใช้บังคับยัง UNVERIFIED (facts.md:75) ห้าม seed ชื่อ ภท. ตายตัว
3. **ต่อให้รับฐานนั้น กลไกปัจจุบันก็ไม่ได้ implement มัน**: frontend ให้ทุก purpose ชุดเดียวกัน 3 ใบ required หมด — union/dedupe/sort เป็น no-op โดย construction · ป้ายฝั่ง web ยัง*ขัด*กับกฎกระทรวงที่อ้าง: web บอก ภท.09 = "คำขออนุญาตเพาะปลูก" แต่ของจริงคือ*ศึกษาวิจัย* (document-slots.js:9,57) — กลไกนี้ไม่ใช่ของที่กฎหมายฉบับใดรับรองได้
4. **หมายเหตุความน่าเชื่อถือ**: citation คู่ "ประกาศGACP Thai Platform พ.ศ. 2568" ใน document-slots.js:8,23 เป็นข้อความโดน branding find-replace (เทียบ "กับGACP Thaiฯ" บรรทัด 32) — ประกาศของแพลตฟอร์มไม่ใช่กฎหมาย ใช้เป็นฐานไม่ได้
5. docs/requirements/*.md ไม่มีข้อความใดผูกวัตถุประสงค์กับรายการแนบของคำขอ GACP · backend `getObjectiveWarnings` เป็น platform extra ที่ขัด ruling 1 อยู่เอง (จะถูกไล่ในแถว backend-slots)

## Census sub-surface ในขอบเขตแถวนี้ (ครบทุกชิ้น)

| sub-surface | file:line | UI ปัจจุบัน | verdict | อ้าง |
|---|---|---|---|---|
| union+dedupe+sort IIFE | panels:346-359 · step.tsx:111-137 | (ไม่มี UI ตรง — ผลิตรายการ 3 ใบเสมอ) | **CUT** | facts.md:30-53 ไม่ branch ตามวัตถุประสงค์ + no-op โดย construction (config.ts:174-179) |
| หัวข้อ "เอกสาร M1 ที่ต้องแนบ" + helper copy | panels:363-367, 377-379 | "เอกสาร M1 ที่ต้องแนบ" / "อัปโหลดเอกสารแต่ละรายการให้ครบ..." | **CUT** | ตายตามชุด ภท. แถว 14-16 (verify-30 ยืน CUT แล้ว) |
| badge "X รายการบังคับ" | panels:368-371 | "3 รายการบังคับ" (ค่าคงที่เสมอ) | **CUT** | ตัวนับที่ไม่เคยเปลี่ยนค่า = พิธีกรรม; ข้อมูลต้นทางถูกตัด |
| badge "Y/Z อัปโหลดแล้ว" | panels:372-374 · step.tsx:123-137 | "0/3 อัปโหลดแล้ว" | **CUT** | นับชุดที่ถูกตัด — pattern ตัวนับของจริงอยู่ที่ documents-step (คนละแถว census) |
| loop render DocumentUploader 3 ช่อง | panels:381-401 | ช่องอัพโหลด ภท.11/09/10 | (ตัดสินแล้วที่แถว 14-16: REWORD/CUT/CUT) | ไม่นับซ้ำที่นี่ |
| warning banner อัพโหลดไม่ครบ | panels:403-408 | "กรุณาอัปโหลดเอกสารบังคับให้ครบ..." | (ตัดสินแล้วที่แถว 18: REWORD gate) | ไม่นับซ้ำที่นี่ |
| empty-state | panels:413-415 | "เลือกวัตถุประสงค์ก่อน เพื่อแสดงรายการเอกสารที่ต้องแนบ" | **CUT** | ประโยคยืนยัน purpose-dependence ที่ฟอร์มกรมไม่มี (facts.md:20-21, 30-53) |

## สรุป

**upheld = true — CUT ยืนตามเดิม** ฐานเดียวที่ใกล้เคียง (กฎกระทรวง พ.ศ. 2559 / herbctrl.dtam ใน document-slots.js) เป็นระบอบใบอนุญาตคนละระบบ ไม่ได้สั่งให้คำขอ GACP แนบแบบคำขอ ภท. ณ วันยื่น และสัญญาณ "ใบอนุญาตตามกฎหมาย" ถูกดูดซับโดยช่อง CONDITIONAL ช่องเดียวของแถว 14 แล้ว · กลไก union ปัจจุบันเป็น no-op ที่ป้ายผิดความหมายด้วยซ้ำ

หมายเหตุถึง implementer (ไม่เปลี่ยน verdict): ถ้าภายหลัง operator ยืนยันฉบับกฎหมาย (facts.md:75) แล้วอยากให้ช่องใบอนุญาตช่องเดียวของแถว 14 โชว์ hint ตามวัตถุประสงค์ (วิจัย → ใบอนุญาตวิจัย, ส่งออก → ใบอนุญาตส่งออก) นั่นคืองานของแถว 14 — ไม่ใช่เหตุให้เก็บ union 3 ช่องนี้ไว้

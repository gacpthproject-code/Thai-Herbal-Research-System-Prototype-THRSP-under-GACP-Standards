# Census — AREA "documents" (step 8 อัปโหลดเอกสาร) — 2026-09-01

Reader: subagent (read-only census). Authority: `reports/research/2026-09-01-dtam-application-baseline/facts.md` (กทล.1 ส่วนที่ ๓ = §2, audit-day = §3, rulings = §4).

Files read in full:
- `apps/web-app/src/app/health/applications/new/_steps/steps/documents-step.tsx` (343 บรรทัด)
- `apps/web-app/src/app/health/applications/new/_steps/steps/documents-step-config.tsx` (497 บรรทัด — ทุก slot ทุก required flag)
- `apps/web-app/src/app/health/applications/new/_steps/steps/documents-step-dedupe.ts` (98 บรรทัด)

Slot inventory: 14 applicant-type slots + 29 base slots = **43 upload slots** + behaviours/page sections.

## สรุปตัวเลข

| verdict | จำนวน (slots) |
|---|---|
| KEEP | 12 |
| CUT | 14 |
| OPTIONAL | 5 |
| CONDITIONAL | 5 |
| MOVE_TO_AUDIT | 1 |
| GENERATE | 1 |
| REWORD | 5 |

ชุด "required:true เสมอ" ปัจจุบันมี 15 slot ทั่วไป + applicant docs; ชุดบังคับตาม กทล.1 จริงคือ A1, A3, A5, A6, A7, A8 + เอกสารคุณสมบัติตามประเภท + (A2, A4 ตามกรณี) — ต่างกันมาก

---

## 1. Applicant-type slots (documents-step-config.tsx)

### บุคคลธรรมดา (INDIVIDUAL_DOCS)

| id | line | label ปัจจุบัน | required | verdict | อ้าง | เหตุผล |
|---|---|---|---|---|---|---|
| IND_ID_CARD | 137 | สำเนาบัตรประชาชน | true | KEEP | facts.md §2 ส่วน จนท. 1.1 "บัตร ปชช.+ทะเบียนบ้านผู้ยื่น" | จนท. ตรวจรับรายการนี้จริงตาม กทล.1 |
| IND_HOUSE_REG | 138 | สำเนาทะเบียนบ้าน | true | KEEP | facts.md §2 ส่วน จนท. 1.1 | เดียวกัน |

**GAP (ไม่มี slot):** เอกสารคุณสมบัติบุคคลธรรมดาตาม กทล.1 — "หนังสือแสดงว่าดำเนินการภายใต้ความร่วมมือและกำกับดูแลของผู้รับอนุญาตผลิตยาแผนปัจจุบัน/แผนโบราณ/ผลิตภัณฑ์สมุนไพร" (facts.md §2 กลุ่มคุณสมบัติ แถวบุคคลธรรมดา) **หายไปทั้งใบ** — เป็นเอกสารบังคับของประเภทผู้ยื่นที่กรมกำหนด แต่ wizard ไม่ขอ

### วิสาหกิจชุมชน (COMMUNITY_DOCS)

| id | line | label ปัจจุบัน | required | verdict | อ้าง | เหตุผล |
|---|---|---|---|---|---|---|
| COM_SVC01 | 142 | หนังสือรับรอง สวช.01 | true | KEEP | facts.md §2 กลุ่มคุณสมบัติ วิสาหกิจชุมชน "สำเนาหนังสือจดทะเบียนวิสาหกิจชุมชน" | ตรงแถวกรม (รหัส สวช.01 อยู่ใน ส่วนที่ ๑.๑ ด้วย) — คำอธิบายควรระบุเงื่อนไขของกรม: สถานะยังดำเนินกิจการ + วัตถุประสงค์สอดคล้อง |
| COM_TVC03 | 143 | ทะเบียนรายชื่อสมาชิก ท.ว.ช.3 | true | KEEP | facts.md §2 กลุ่มคุณสมบัติ วิสาหกิจชุมชน "บัญชีรายชื่อสมาชิก" | คือองค์ประกอบบัญชีรายชื่อสมาชิกที่กรมขอ |
| COM_MEMBER_LIST | 144 | รายชื่อสมาชิกวิสาหกิจชุมชน | true | CUT | — | **ซ้ำกับ COM_TVC03** — กรมขอบัญชีรายชื่อสมาชิกหนึ่งรายการ ไม่ใช่สอง; เกิน DTAM = ตัด (ruling 2) |
| COM_PRESIDENT_ID | 145 | สำเนาบัตรประชาชนประธาน | true | KEEP | facts.md §2 ส่วน จนท. 1.1 (ผู้ยื่นวิสาหกิจ = ประธาน ตาม ส่วนที่ ๑.๑) | จนท. ตรวจบัตร ปชช. ผู้ยื่น/วิสาหกิจ |
| COM_MEETING_DOC | 146 | รายงานการประชุมที่เกี่ยวข้อง | true | REWORD | facts.md §2 กลุ่มคุณสมบัติ วิสาหกิจชุมชน "หนังสือแสดงว่าผู้ยื่นได้รับมอบหมายให้ดำเนินกิจการแทนวิสาหกิจ" | สิ่งที่กรมขอคือ**หนังสือมอบหมายดำเนินกิจการแทนวิสาหกิจ** ไม่ใช่รายงานการประชุมทั่วไป — เปลี่ยน label/semantics เป็นหนังสือมอบหมาย (ruling 3: อันนี้คือเอกสารแนบคุณสมบัติ คงไว้ ไม่ใช่ฟีเจอร์มอบอำนาจ) |
| COM_HOUSE_CODE | 147 | เลขรหัสประจำบ้าน | false | CUT | facts.md §1 ส่วนที่ ๑.๑ | เลขรหัสประจำบ้านเป็น**ช่องกรอก**ใน ส่วนที่ ๑.๑ ไม่ใช่เอกสารแนบ — เก็บเป็น field ในขั้นตอนผู้ยื่น ไม่ใช่ slot อัปโหลด PDF |

### นิติบุคคล (JURISTIC_DOCS)

| id | line | label ปัจจุบัน | required | verdict | อ้าง | เหตุผล |
|---|---|---|---|---|---|---|
| JUR_COMPANY_REG | 151 | หนังสือรับรองนิติบุคคล กพ. | true | KEEP | facts.md §2 กลุ่มคุณสมบัติ นิติบุคคล "สำเนาหนังสือรับรองการจดทะเบียนนิติบุคคล (≤6 เดือน)" | ตรงแถวกรม รวมเงื่อนไขอายุ 6 เดือนใน description แล้ว — หมายเหตุ: แถวกรมยอมรับทางเลือก "หนังสือจดทะเบียนวิสาหกิจ/วิสาหกิจเพื่อสังคม/สหกรณ์การเกษตร" ด้วย ควรสะท้อนใน description |
| JUR_DIRECTOR_LIST | 152 | รายชื่อผู้ถือหุ้น/กรรมการ | true | KEEP | facts.md §2 กลุ่มคุณสมบัติ นิติบุคคล "บัญชีรายชื่อกรรมการ/หุ้นส่วน/สมาชิก" | ตรงแถวกรม |
| JUR_DIRECTOR_ID | 153 | สำเนาบัตรประชาชนกรรมการ | true | KEEP | facts.md §2 ส่วน จนท. 1.1 | บัตร ปชช. ผู้ยื่น (ผู้มีอำนาจลงนามตาม ส่วนที่ ๑.๓) |
| JUR_POA | 154 | หนังสือมอบอำนาจ | false | CONDITIONAL | facts.md §2 กลุ่มคุณสมบัติ นิติบุคคล "หนังสือแสดงว่าผู้ยื่นเป็นผู้แทน/ผู้มีอำนาจทำการแทน" + ส่วน จนท. 1.1 "หนังสือมอบอำนาจ+สำเนาบัตรผู้มอบ" | คงเป็นเอกสารแนบตาม กทล.1 (ruling 3) — บังคับเฉพาะกรณีผู้ยื่นไม่ใช่กรรมการผู้มีอำนาจเอง; จนท. ตรวจคู่กับสำเนาบัตรผู้มอบซึ่งควรระบุใน description |
| JUR_TAX_REG | 155 | ภ.พ.20 (ทะเบียนภาษีมูลค่าเพิ่ม) | false | CUT | — | ไม่มีในกทล.1 ทั้งฉบับ; เกิน DTAM (ruling 1, 2) |
| JUR_COMPANY_CERT | 156 | หนังสือบริคณห์สนธิ/ข้อบังคับ | false | CUT | — | ไม่มีในกทล.1; เกิน DTAM (ruling 2) |

---

## 2. Base slots (documents-step-config.tsx — getDocumentRequirements)

### หมวด license

| id | line | label ปัจจุบัน | required | verdict | อ้าง | เหตุผล |
|---|---|---|---|---|---|---|
| LICENSE_PT11 | 178 | แบบ ภท.11 (คำขออนุญาตสมุนไพรควบคุม) | true (ทุกราย) | REWORD | facts.md §2 ส่วน จนท. 1.1 "ใบอนุญาต/หนังสือสำคัญ กรณีการปลูก/แปรรูปกัญชาที่ต้องได้รับอนุญาต — คือ*ตัวใบอนุญาต* ไม่ใช่แบบคำขอ ภท." | ตัวอย่างตรงตัวของ REWORD ในโจทย์: slot ขอ**แบบคำขอ** ภท.11 แทนที่จะขอ**ตัวใบอนุญาต/หนังสือสำคัญ** — แก้ semantics เป็นตัวใบอนุญาตปลูก/แปรรูปกัญชาตามกฎหมายที่เกี่ยวข้อง และควรเป็น CONDITIONAL "กรณีที่กฎหมายบังคับต้องมีใบอนุญาต" (facts.md §4 หมายเหตุ UNVERIFIED: ฉบับกฎหมายที่ใช้บังคับต้องยืนยันก่อน seed กติกา) |
| LICENSE_PT9 | 186 | แบบ ภท.9 (คำขออนุญาตวิจัย/ส่งออกสมุนไพร) | REQUIRE_WHEN_MATCHED (RESEARCH, EXPORT) | CUT | — | เป็น**แบบคำขอ** ไม่ใช่ใบอนุญาต (จนท. 1.1 เจาะจงว่าไม่ใช่แบบคำขอ ภท.) และเงื่อนไข RESEARCH ไม่ใช่วัตถุประสงค์ของ กทล.1 ด้วยซ้ำ (ส่วนที่ ๒ มีแค่ ☐ ทางการแพทย์ ☐ ส่งออก — facts.md §1) |
| LICENSE_PT10 | 197 | แบบ ภท.10 (ใบอนุญาตส่งออกสมุนไพรควบคุม) | REQUIRE_WHEN_MATCHED (EXPORT) | CONDITIONAL | facts.md §2 ส่วน จนท. 1.1 (ใบอนุญาตตามกฎหมายที่เกี่ยวข้อง) | อันนี้เป็น**ใบอนุญาต**จริง — คงเป็น conditional เฉพาะวัตถุประสงค์ส่งออก; ฉบับกฎหมายที่บังคับยัง UNVERIFIED (facts.md ท้ายไฟล์) — ยืนยันก่อนตั้งเป็นบังคับ |
| CRIMINAL_BG | 206 | หนังสือรับรองประวัติอาชญากรรม | false | CUT | — | ไม่มีใน กทล.1/ข้อกำหนด; ไม่มีฐานกฎหมายอื่นที่อ้างได้จาก repo; เกิน DTAM (ruling 2) |

### หมวด basic

| id | line | label ปัจจุบัน | required | verdict | อ้าง | เหตุผล |
|---|---|---|---|---|---|---|
| REG_FORM | 216 | แบบคำขอรับรองมาตรฐาน GACP | true | GENERATE | facts.md §1 (ส่วนที่ ๑, ๒, ๔ คือสิ่งที่ wizard เก็บอยู่แล้ว) + §3 "ยื่นชุดสมัคร (แบบลงทะเบียน + SOP + เอกสารประกอบ)" | นี่คือตัว กทล.1 ที่กรอกแล้ว — wizard เก็บข้อมูลส่วนที่ ๑/๒/๔ ครบอยู่แล้ว ระบบต้อง**สร้างไฟล์ให้เอง**จากข้อมูล ไม่ใช่ให้เกษตรกรไปหาแบบฟอร์มมากรอกมืออัปโหลดซ้ำ |
| LAND_TITLE | 224 | เอกสารสิทธิ์ในที่ดิน | true | KEEP | facts.md §2 A1 | ตรง A1 ทุกราย — description ควรพูดถึง "หนังสืออนุญาตใช้ที่ดินรัฐ" เป็นทางเลือกตามแถวกรมด้วย (มี น.ส.3 อยู่แล้ว) |
| LAND_CONSENT | 232 | หนังสือยินยอมให้ใช้พื้นที่ | REQUIRE_WHEN_MATCHED (landOwnership: RENT, CONSENT) | CONDITIONAL | facts.md §2 A2 "เฉพาะกรณีเช่า/ขอใช้ที่ดินผู้อื่น" | ตรง A2 และเงื่อนไขถูกทิศแล้ว — คงไว้ตามเดิม |

### หมวด location

| id | line | label ปัจจุบัน | required | verdict | อ้าง | เหตุผล |
|---|---|---|---|---|---|---|
| SITE_MAP | 244 | แผนที่แสดงที่ตั้งสถานประกอบการ | true | KEEP | facts.md §2 A3 | ตรง A3 ทุกราย — description ควรครบองค์ประกอบ A3: พิกัด + **เส้นทางเข้าถึง** + ขนาดแปลง + **สิ่งปลูกสร้างใกล้เคียง** (ปัจจุบันขาดสองอย่างหลัง) |
| BUILDING_PLAN | 252 | แปลนอาคารหรือแปลนโรงเรือน | REQUIRE_WHEN_MATCHED (INDOOR, GREENHOUSE, INDOOR_CONTROLLED) | CONDITIONAL | facts.md §2 A4 "เฉพาะ Indoor/Greenhouse" | เงื่อนไขถูกทิศ — หมายเหตุ: A4 ของกรมคือแบบแปลน **+ ภาพถ่ายภายนอกและภายใน** เป็นชุดเดียวกัน (ดู INTERIOR_PHOTOS) |
| EXTERIOR_PHOTOS | 262 | ภาพถ่ายภายนอกสถานที่ | true | KEEP | facts.md §2 A7 (ทุกราย) + A4′ (Outdoor) + A4 (Indoor/Greenhouse: ภาพถ่ายภายนอก) | มีฐานทุกราย ผ่าน A7 "รูปถ่ายสถานที่ผลิต (ปลูก) และการเก็บเกี่ยว" — label/description ควรจัดคำตามกรม (Outdoor: ภาพแปลงปลูก+บริเวณโดยรอบ = A4′) |

### หมวด production

| id | line | label ปัจจุบัน | required | verdict | อ้าง | เหตุผล |
|---|---|---|---|---|---|---|
| PRODUCTION_PLAN | 272 | แผนการผลิตหรือแผนการเพาะปลูก | **false** | REWORD | facts.md §2 A5 (ทุกราย) | ทิศ required ผิด: A5 **บังคับทุกราย** แต่ slot เป็น optional — และ A5 ครอบ "แผนการใช้ประโยชน์/แปรรูป" ด้วย ซึ่ง label ปัจจุบันไม่พูดถึง |
| SECURITY_PLAN | 280 | แผนรักษาความปลอดภัยพื้นที่ | **false** | REWORD | facts.md §2 A6 (ทุกราย) | ทิศ required ผิด: A6 **บังคับทุกราย** — และ A6 รวม "วิธีนำส่วนของกัญชาที่เหลือไปใช้ประโยชน์" ซึ่งหายจาก label/description |
| INTERIOR_PHOTOS | 288 | ภาพถ่ายภายในสถานที่ผลิต | **false** | CONDITIONAL | facts.md §2 A4 "เฉพาะ Indoor/Greenhouse" (แบบแปลน + ภาพถ่ายภายนอกและภายใน) | ควรบังคับเฉพาะ Indoor/Greenhouse ตาม A4 (ปัจจุบัน optional ทุกราย ไม่ผูก cultivationMethods เลย) |

### หมวด quality

| id | line | label ปัจจุบัน | required | verdict | อ้าง | เหตุผล |
|---|---|---|---|---|---|---|
| SOP_MANUAL | 298 | คู่มือ SOP มาตรฐานการปฏิบัติงาน | true | KEEP | facts.md §2 A8 | ตรง A8 ทุกราย |
| CP_CCP_TABLE | 306 | ตาราง CP/CCP และจุดเฝ้าระวัง | **true** | CUT | — | ไม่มีใน กทล.1 ส่วนที่ ๓ และ §3 ก็ไม่ระบุ; ถ้ามีจริงก็เป็นเนื้อหาภายใน SOP (A8) — บังคับแยกใบ = เกณฑ์เพิ่มของแพลตฟอร์ม ขัด ruling 1 |
| INPUT_REPORT | 314 | รายงานการใช้วัตถุดิบและปัจจัยการผลิต | **true** | MOVE_TO_AUDIT | facts.md §3 ข้อ 1 "บันทึกการซื้อ/ใช้ปัจจัยการผลิต" | กรมจัดเป็นบันทึกที่ตรวจ ณ แปลงวันตรวจ ไม่ใช่เอกสารวันยื่น |
| EQUIPMENT_CALIBRATION | 322 | เอกสารสอบเทียบเครื่องมือ (ถ้ามี) | **true** | CUT | — | ไม่มีใน กทล.1/§3; label เขียน "(ถ้ามี)" แต่ flag เป็น required:true — ขัดกันเองใน slot เดียว; เกิน DTAM |

### หมวด training

| id | line | label ปัจจุบัน | required | verdict | อ้าง | เหตุผล |
|---|---|---|---|---|---|---|
| GACP_CERTIFICATE | 332 | ใบรับรอง E-learning GACP | **true** | CUT | — | ไม่มีใน กทล.1/ข้อกำหนด (หมายเหตุ: e-service ของกรมอาจมีรายการของตัวเอง — facts.md ระบุ UNVERIFIED, อ้างไม่ได้) |
| STRAIN_CERTIFICATE | 340 | เอกสารรับรองสายพันธุ์ | **true** | CUT | facts.md §1 ส่วนที่ ๒ ข้อ ๓ | พันธุ์/แหล่งที่มา/ปริมาณ เป็น**ช่องกรอก**ใน ส่วนที่ ๒ ข้อ ๓ ไม่ใช่เอกสารแนบ; เอกสารแนบเดียวที่กรมพูดถึงคือ "เกิน 2 ส่วนให้แนบรายละเอียดเพิ่ม" (รายละเอียด ไม่ใช่ใบรับรอง) |
| PROVIDER_TRAINING | 348 | หลักฐานการอบรมบุคลากร | false | CUT | — | ไม่มีใน กทล.1/§3; เกิน DTAM (ruling 2) |
| PROVIDER_TEST | 356 | ผลการทดสอบความรู้บุคลากร | false | CUT | — | เดียวกัน |

### หมวด lab

| id | line | label ปัจจุบัน | required | verdict | อ้าง | เหตุผล |
|---|---|---|---|---|---|---|
| SOIL_TEST | 366 | ผลตรวจดินหรือวัสดุปลูก | REQUIRE_WHEN_MATCHED (OUTDOOR, GREENHOUSE, INDOOR, VERTICAL_RACK) | OPTIONAL | facts.md §3 "โดยปกติกรมไม่ตรวจแล็บ … ผลตรวจน้ำ/ดิน/ช่อดอก/ใบรับรองแล็บ ไม่ใช่เอกสารบังคับตอนยื่น" | ต้องถอด REQUIRE_WHEN_MATCHED — ปัจจุบันบังคับกับแทบทุกวิธีปลูก ขัด §3 ตรง ๆ; เก็บได้แค่ ไม่บังคับ + ไม่นับ progress |
| NUTRIENT_SPEC | 376 | สเปกสารละลายธาตุอาหาร | REQUIRE_WHEN_MATCHED (HYDROPONIC, AEROPONIC) | CUT | — | ไม่มีใน กทล.1/§3; เป็นรายละเอียดกระบวนการที่อยู่ใน SOP (A8)/แผนการผลิต (A5) ได้; เกิน DTAM |
| WATER_TEST | 386 | ผลตรวจคุณภาพน้ำ | **true (ทุกราย)** | OPTIONAL | facts.md §3 (แถวเดียวกับ SOIL_TEST) | บังคับทุกรายขณะที่กรมบอกชัดว่าไม่ใช่เอกสารบังคับตอนยื่น — ลดเป็น ไม่บังคับ + ไม่นับ (ผูกกับ dedupe step-5 ด้วย ดู §4 ข้างล่าง) |
| FLOWER_TEST | 394 | ผลตรวจช่อดอก | false | OPTIONAL | facts.md §3 | optional อยู่แล้ว — คงเป็น ไม่บังคับ ไม่นับ |
| LAB_CERTIFICATE | 404 | หนังสือรับรองผลวิเคราะห์จากห้องปฏิบัติการ | REQUIRE_WHEN_MATCHED (EXPORT) | OPTIONAL | facts.md §3 "ใบรับรองแล็บ ไม่ใช่เอกสารบังคับตอนยื่น" | ถอดเงื่อนไขบังคับเมื่อส่งออก — กรมไม่ได้ตั้งเกณฑ์นี้ |

### หมวด other

| id | line | label ปัจจุบัน | required | verdict | อ้าง | เหตุผล |
|---|---|---|---|---|---|---|
| DESTINATION_CERT | 414 | เอกสารข้อกำหนดประเทศปลายทาง | SHOW_OPTIONAL_WHEN_MATCHED (EXPORT) | CUT | — | ไม่มีใน กทล.1/ข้อกำหนด; เกิน DTAM (ruling 2) |
| VIDEO_LINK | 426 | ลิงก์วิดีโอแสดงกระบวนการผลิต | false (LINK) | CUT | — | ไม่มีฐาน DTAM; description เองยอมรับว่า "ส่งเพิ่มได้ตอนตรวจประเมินภาคสนาม" — เกิน DTAM ในวันยื่น (ruling 2); การตัดพา videoLink input + setYoutubeUrl ใน documents-step.tsx:51-54,179,268-277 ไปด้วย |
| ADDITIONAL_DOCS | 434 | เอกสารเพิ่มเติม | false (BOTH) | OPTIONAL | facts.md §1 ส่วนที่ ๒ ข้อ ๓ "เกิน 2 ส่วนให้แนบรายละเอียดเพิ่ม" + §2 จนท. 1.4 (ขอเอกสารเพิ่มเป็นรายการ) | ช่องแนบอิสระมีที่ใช้จริงสองทางตามกรม (ใบรายละเอียดพันธุ์เกิน 2 ส่วน, เอกสารที่ จนท. ขอเพิ่ม) — คงเป็น ไม่บังคับ ไม่นับ |

---

## 3. Page sections / behaviours (documents-step.tsx + config)

| item | file:line | ปัจจุบัน | verdict | หมายเหตุ |
|---|---|---|---|---|
| แถบสถานะอัปโหลด + progress + badge "เอกสารบังคับ" | documents-step.tsx:203-219 | นับเฉพาะ required slots | KEEP | ตัวนับถูกออกแบบดี แต่เลขที่โชว์จะถูกก็ต่อเมื่อชุด required หดเป็นชุด DTAM ตามตารางข้างบน |
| กล่อง error รายการเอกสารขาด | documents-step.tsx:221-231, 186-197 | ระบุชื่อ 3 รายการแรก + จำนวนที่เหลือ | KEEP | สืบทอดความถูกผิดจากชุด required เช่นกัน |
| grid การ์ดเอกสาร + ป้าย "บังคับ/ไม่บังคับ" | documents-step.tsx:233-329, 256-260 | ป้ายตาม req.required | KEEP | โครง UI กลาง — ไม่มีประเด็น DTAM ของตัวเอง |
| ช่องกรอก URL วิดีโอ | documents-step.tsx:268-277 | Input type=url สำหรับ VIDEO_LINK | CUT | ตายตาม VIDEO_LINK slot |
| dropzone + `<input type=file>` + accept ตาม slot | documents-step.tsx:309-323, 238-239 | accept จาก slot table กลาง | KEEP | ruling 6 + F-G4-08: ชนิดไฟล์ตัดสินจาก `@gacp/validation/upload-rules` โมดูลเดียวกับ server (config:9, 463-466) — ถูกทาง |
| ปุ่ม "เปิด" ไฟล์ที่อัปโหลด | documents-step.tsx:289-296 | `window.open(file.url, '_blank')` | REWORD | ruling 6: top-level ต้องเป็น `Content-Disposition: attachment`, การเปิดดูให้ทำผ่าน in-page viewer (subresource) เท่านั้น — เปิดแท็บใหม่ top-level จะกลายเป็นบังคับดาวน์โหลด ไม่ใช่เปิดดู |
| ปุ่ม "ลบ" + DELETE draft-document | documents-step.tsx:298-305, 145-153 | ลบทั้ง server และ state | KEEP | — |
| ตรวจไฟล์ฝั่ง browser ก่อนอัปโหลด | documents-step.tsx:105-109 | checkUploadInBrowser ชั้นเดียวกับ server | KEEP | F-G4-08 — server คือ gate จริง |
| DEMO_MODE ข้าม gate เอกสารบังคับ | documents-step.tsx:181-184 | DEMO_MODE ‖ isComplete → step 9 | KEEP | เดโมเท่านั้น — ไม่มีมิติ DTAM; ระวังอย่าให้หลุด production |
| ซ่อน slot ที่ยื่นแล้วจากขั้นก่อน (dedupe filter) | documents-step.tsx:75-77 + dedupe.ts:74-98 | ซ่อนเมื่อมีหลักฐาน bytes ถึง server เท่านั้น | KEEP | ทิศถูก (กันเคส land title/water test หายเงียบ) |
| mapping M1_PT09/10/11 → LICENSE_PT9/10/11 | dedupe.ts:58-62 | โยงชื่อ step 2 ↔ step 8 | KEEP | ชะตากรรมผูกกับ verdict ของ slot ภท.: PT9 ถูก CUT, PT11 ถูก REWORD เป็นตัวใบอนุญาต — ตารางนี้ต้องแก้ตาม |
| ซ่อน LAND_TITLE เมื่อ step 5 มี fileUrl | dedupe.ts:88-91 | อิง fileUrl จริง | KEEP | A1 — ถูกทาง |
| ซ่อน WATER_TEST เมื่อ step 5 มี waterTestFileUrl | dedupe.ts:93-95 | อิง fileUrl จริง | KEEP | กลไกถูก แต่ slot ปลายทางกลายเป็น OPTIONAL ตาม §3 — กลไกยังใช้ได้กับ slot ไม่บังคับ |
| CATEGORY_LABELS 9 หมวด | config:469-479 | applicant/license/basic/location/production/quality/training/lab/other | REWORD | หลังตัดตามตาราง หมวด training จะว่างเปล่า, lab เหลือแต่ optional, license เหลือใบเดียว — จัดหมวดใหม่ตามโครง กทล.1 ส่วนที่ ๓ (เอกสารทุกราย A1-A8 / ตามกรณี / คุณสมบัติผู้ยื่น) |
| SUBMISSION_PHASE_GUIDE 3 ข้อ | config:481-497 | ข้อความแนะนำ เตรียม/อัปโหลด/ตรวจทาน | KEEP | copy แนะนำล้วน ไม่ผูกกติกา |
| ปุ่มนำทาง ย้อนกลับ/ถัดไป (step 7 ↔ 9) | documents-step.tsx:331-337 | isNextDisabled=false, gate อยู่ใน handleNext | KEEP | — |

---

## 4. GAP — สิ่งที่ กทล.1 ขอแต่ step นี้ไม่มี slot

1. **บุคคลธรรมดา: หนังสือความร่วมมือกับผู้รับอนุญาตผลิตยา/สมุนไพร** (facts.md §2 กลุ่มคุณสมบัติ) — หายทั้งใบ เป็นเอกสารคุณสมบัติบังคับของประเภทนี้
2. **กรณีต่ออายุ**: ต้นฉบับใบรับรองเก่า · แผนการปลูกและเก็บเกี่ยว/แปรรูป · แผนการใช้ประโยชน์ · รายงานสรุปผลการดำเนินการที่ผ่านมา (facts.md §2) — ไม่มี branch ต่ออายุใน step นี้เลย
3. **กรณีใบแทน**: ใบแจ้งความ (สูญหาย) · ใบรับรองเดิม (ถูกทำลาย/ลบเลือน) — ไม่มี
4. **A4′ ภาพถ่ายแปลงปลูก+บริเวณโดยรอบ (Outdoor)** — ไม่มี slot เฉพาะ Outdoor; EXTERIOR_PHOTOS ทุกรายพอกล้อมแกล้มแต่ semantics ไม่ตรง A4′
5. **สำเนาบัตรผู้มอบอำนาจ** คู่กับหนังสือมอบอำนาจ (จนท. 1.1) — JUR_POA ควรพูดถึงใน description

## 5. ข้อสังเกตภาพรวม

- ชุด required วันนี้ (15 base + applicant) โตกว่าชุด DTAM มาก: ผลตรวจน้ำบังคับทุกราย, ผลตรวจดินบังคับเกือบทุกวิธีปลูก, CP/CCP, สอบเทียบเครื่องมือ, E-learning, ใบรับรองสายพันธุ์ — ทั้งหมดขัด ruling 1 "บังคับได้เท่าที่กรมบังคับ"
- สวนทางกัน A5 (แผนการผลิต) กับ A6 (มาตรการความปลอดภัย) ซึ่งกรม**บังคับทุกราย** กลับเป็น optional ในระบบ — ผิดทั้งสองทิศพร้อมกัน
- REG_FORM คือประตูไปสู่ ruling ที่ใหญ่สุดของ area นี้: ระบบต้อง GENERATE กทล.1 จากข้อมูล wizard ไม่ใช่ขออัปโหลด
- โครง validation (slot table กลาง F-G4-08, dedupe หลักฐานจริง, browser=courtesy/server=gate) แข็งแรงและควรคงไว้ทั้งชุด ไม่ว่ารายการ slot จะหดเหลือเท่าไร

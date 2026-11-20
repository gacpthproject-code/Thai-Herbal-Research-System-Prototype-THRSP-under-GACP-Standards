# Application Submission v2 — ยื่นคำขอตามแบบ กทล.1 (Design)

> สถานะ: รอ operator รีวิว · เจ้าของการตัดสินใจ: operator (คำตัดสิน 7 ข้อ 2026-09-01 + อนุมัติงานออกแบบ)
> ฐานข้อเท็จจริง: `reports/research/2026-09-01-dtam-application-baseline/facts.md` (กทล.1 + ข้อกำหนดกรม อ่านเต็มฉบับ)
> ฐานสำมะโน: `reports/research/2026-09-01-dtam-application-baseline/mapping.md` (858 รายการ, ตัดสินรายตัว, ตรวจค้านยืน 58/58)
> แบบหน้าจอที่อนุมัติแล้ว: canvas "โครง Wizard กทล.1" (6 บอร์ด) — https://claude.ai/code/artifact/0a821aff-0e08-409b-bef4-5d07b1b275f0

## 0. เป้าหมายหนึ่งประโยค

เกษตรกรยื่นคำขอ GACP กัญชาได้ครบถ้วนถูกต้องตามแบบ กทล.1 ของกรม โดยกรอกน้อยที่สุดเท่าที่กฎหมายขอ อัปโหลดกระดาษแต่ละใบครั้งเดียว เห็นเอกสารของตัวเองในหน้า และผ่านหน้าตรวจทานเดียวที่เป็นความจริงฝั่งระบบก่อนจ่ายเงิน

## 1. กติกาที่ผูกการออกแบบ (operator rulings 2026-09-01 — เปลี่ยนไม่ได้ใน plan)

1. ชุดเอกสาร/ช่องกรอก**บังคับ** = กทล.1 เป๊ะ ไม่มีเกณฑ์เพิ่มของแพลตฟอร์ม
2. field เกินแบบ = ตัด (รายการตาม mapping.md)
3. ไม่มีฟีเจอร์มอบอำนาจการยื่น (หนังสือมอบหมายฯ ของวิสาหกิจเป็น*เอกสารแนบ* ไม่ใช่ฟีเจอร์)
4. หน้ารีวิวเจ้าหน้าที่ = checklist ส่วน จนท. ของ กทล.1 ข้อ 1.1-1.4 ขอเอกสารเพิ่ม**เป็นรายช่อง** พร้อมดูเอกสารในหน้า
5. กัญชาเท่านั้น พืชอื่นภายหลังเป็นชุดกติกา/ฟอร์มใหม่ ไม่ reuse
6. ไฟล์ใต้ /uploads คง `Content-Disposition: attachment` บน top-level navigation (PDPA) การดูทำผ่าน viewer ในหน้า (subresource) เท่านั้น
7. หน้า "ตรวจทานและส่ง" + "พรีวิว" ยุบเหลือ**หน้าตรวจทานเดียวที่อ่านจาก server** พร้อมรื้อ UX/UI ตามแบบที่อนุมัติ

## 2. สถาปัตยกรรม: กติกาเดียว ท่อเดียว ความจริงเดียว

### 2.1 Requirement engine — "บังคับ" มีเจ้าของเดียว
- แหล่งเดียว: ตาราง `requirement_rules` (มีอยู่แล้ว — กฎเป็นข้อมูลมีวันมีผล, ตัดสินตามวันที่ยื่นครั้งแรก ผ่าน `services/requirement-rule-service.js` + `application-document-requirements.js`)
- **Seed ชุดกฎกัญชา v1** (script เดียว, dated, additive — ไม่แตะ migration เดิม): แถวละ 1 slot บังคับ + เงื่อนไข
  มิติเงื่อนไข: คอลัมน์เดิม `holderType` (INDIVIDUAL/JURISTIC/COMMUNITY_ENTERPRISE), `requestType` (NEW/RENEWAL/REPLACEMENT), `plantCode` + คอลัมน์ nullable ใหม่ 3 ตัว (additive migration): `landTenure` (OWNED/STATE_PERMITTED/RENTED), `areaType` (OUTDOOR/INDOOR/GREENHOUSE/OTHER), `certScope` (PLANTING/PROCESSING) — NULL = ทุกค่า ตาม semantics เดิมของตาราง (ตรวจ schema จริงแล้ว 2026-09-01: ตารางไม่มีคอลัมน์ JSON จึงเพิ่มมิติเป็นคอลัมน์)
  · **คำเดียวกัน คนละจำนวน (แก้ 2026-09-05)**: `areaType` เป็นมิติของ *แถวกฎ* หนึ่งแถวหนึ่งค่า ซึ่งถูกแล้ว แต่ *คำขอ* หนึ่งใบมีได้หลายค่า เพราะ กทล.1 ส่วนที่ ๒ พิมพ์ ลักษณะพื้นที่ เป็น checkbox (facts.md:22) ⇒ เลนส์ถาม `rulesAt` **หนึ่งคำถามที่บรรจุทุกช่องที่ติ๊ก** (`areaType: string[]` → `IN` บวก NULL wildcard) ห้ามยุบหลายช่องเหลือค่าเดียวก่อนถาม การยุบแบบ *เอาที่คุมเข้มที่สุดชนะ* พิสูจน์แล้วว่า **ขอเอกสารขาด**: กฎสามแถวที่มี areaType เรียกเอกสารคนละใบกัน ติ๊ก กลางแจ้ง+โรงเรือน จึงทำให้ `field_surround_photos` หายไปทั้งจากรายการ จากด่านส่ง และจาก `missingRequired` โดยคำขอรายงานว่าครบ · ที่ถามครั้งเดียวไม่ใช่หลายครั้ง เพราะลำดับแถวที่ประทับลงคำขอต้องคงที่ (byte-stable) และเมื่อสองช่องเรียกเอกสารใบเดียวกัน เหตุผลที่แสดงยึดลำดับคำศัพท์ OUTDOOR, INDOOR, GREENHOUSE, OTHER
  · **กฎหมายต้องมีอยู่จริงก่อนจึงตัดสินได้ (แก้ 2026-09-05)**: ทะเบียนเก็บกฎ *รายพืช* คำขอที่ไม่ระบุชนิดพืช หรือระบุพืชที่ยังไม่มีกฎในทะเบียน ไม่ใช่ *คำขอที่ไม่ต้องใช้เอกสาร* แต่คือ *คำถามที่ตอบไม่ได้* ⇒ เลนส์ตอบเป็น `blockingIssues` และ `complete:false` เสมอ ด่านส่งปฏิเสธด้วย `APPLICATION_NOT_JUDGEABLE` (422) ไม่ใช่ข้อความว่าเอกสารขาด · ก่อนแก้: ผู้ยื่นบุคคลธรรมดาที่พิมพ์ชนิดพืชผิดถูกขอเอกสาร 0 ฉบับ จาก 9 ฉบับ
- **ชุด slot ตามกฎหมาย** (canonical id ใหม่ ชื่อสื่อความหมาย — L4: ไม่มี literal ซ้ำซ้อน):
  - ทุกราย: `LAND_RIGHTS` (A1) · `SITE_MAP_COORDS` (A3) · `PRODUCTION_UTIL_PLAN` (A5) · `SECURITY_RESIDUE_PLAN` (A6 รวม "วิธีนำส่วนที่เหลือไปใช้ประโยชน์") · `SITE_PHOTOS` (A7) · `SOP_MANUAL` (A8)
  - เงื่อนไข: `LANDLORD_CONSENT` (A2, เมื่อ RENTED) · `BUILDING_PLAN_PHOTOS` (A4, เมื่อ**ติ๊ก** INDOOR หรือ GREENHOUSE) · `FIELD_SURROUND_PHOTOS` (A4′, เมื่อ**ติ๊ก** OUTDOOR) — สองช่องนี้ไม่ใช่ทางเลือกของกัน: ติ๊กทั้งกลางแจ้งและในอาคาร ⇒ บังคับทั้งสองชุดพร้อมกัน · `CONTROLLED_HERB_LICENSE` (*ตัวใบอนุญาต*สมุนไพรควบคุมที่ออกแล้ว ไม่ใช่แบบคำขอ ภท. — ฐาน: ประกาศกระทรวงสาธารณสุข เรื่อง สมุนไพรควบคุม (กัญชา) พ.ศ. 2568: ช่อดอกเป็นสมุนไพรควบคุม ใบอนุญาตครอบ ศึกษาวิจัย/ส่งออก/จำหน่าย/แปรรูปเพื่อการค้า · เงื่อนไขช่อง: บังคับเมื่อวัตถุประสงค์ส่งออก (ใบจากสาย ภท.10) หรือขอรับรองการแปรรูป (ใบจากสาย ภท.11) · กรณียื่นใบอนุญาตค้างอยู่: ยื่น GACP ได้ เจ้าหน้าที่ใช้ประตู "ขอเอกสารเพิ่มรายช่อง" ตามพร้อมกำหนดวันส่ง — แนวปฏิบัติข้อนี้ต้องยืนยันกับกรมก่อน seed)
  - คุณสมบัติตามประเภท: `ID_HOUSE_REG` (บัตร+ทะเบียนบ้านผู้ยื่น/ประธาน) · วิสาหกิจ: `COMMUNITY_REG_MEMBERS` + `COMMUNITY_ASSIGNMENT` · บุคคลธรรมดา: `PRODUCER_SUPERVISION_LETTER` (หนังสือกำกับโดยผู้รับอนุญาตผลิตยา — **ช่องใหม่ ระบบเดิมไม่มี**) · นิติบุคคล: `JURISTIC_REG_6M` + `JURISTIC_AUTHORITY`
  - ต่ออายุ: `PREV_CERT_ORIGINAL` + `RENEWAL_PLAN` + `RENEWAL_UTIL_PLAN` + `OPERATION_SUMMARY_REPORT` (ชุดใหม่ทั้งชุด) · ใบแทน: `POLICE_REPORT` หรือ `DAMAGED_CERT`
  - OPTIONAL (ไม่บังคับ ไม่นับคะแนน ติดป้าย "ช่วยให้วันตรวจเร็วขึ้น"): `WATER_TEST`, `SOIL_TEST`, `ADDITIONAL_DOCS`
- `SLOT_ALIAS_GROUPS` (packages/validation/src/upload-rules.js) เพิ่ม fold: id เก่าทุกตัว (M1_PT11, CHANOTE/NS3/SPK, IND_ID_CARD, id-card, company-reg …) → canonical ใหม่ ⇒ เอกสารที่ผู้ใช้เดิมอัปไว้แล้ว**นับต่อได้ทันที** ไม่มี migration ข้อมูล
- **ทุก slot มีคำอธิบายประกอบสองบรรทัด**: "เอกสารนี้คืออะไร" + "หาได้ที่ไหน" (เช่น ใบอนุญาตสมุนไพรควบคุม: "ยื่นแบบ ภท.10/ภท.11 กับนายทะเบียน สสจ. จังหวัดที่ตั้งสถานประกอบการ หรือกรมฯ สำหรับ กทม. แล้วนำใบอนุญาตที่ออกแล้วมาแนบที่นี่") — ตอบโจทย์ operator: "เอกสารบางอย่างเกษตรกรหาที่ไหน" · ข้อความเก็บใน slot catalog ไม่ hardcode ใน component
- **API ใหม่ 1 ดวง**: `GET /api/applications/:id/requirements` → กติกาที่ resolve แล้วของคำขอใบนั้น `{dims: {…, areaTypes: string[], areaTypeOther}, slots: [{slotId, labelTH, required, reason, satisfied, fileUrl}], missingRequired, blockingIssues, complete}` (`areaTypes` = ชุดช่อง ลักษณะพื้นที่ ที่ติ๊ก เป็น array เสมอ ไม่ใช่ค่าเดียว · `blockingIssues` = เหตุที่คำขอนี้ยัง *ตัดสินไม่ได้* เช่นยังไม่ระบุชนิดพืช หรือพืชที่เลือกยังไม่มีกฎในทะเบียน ⇒ `complete` เป็นเท็จเสมอ) — wizard, หน้าตรวจทาน, validator ฝั่ง prepare/submit และหน้าเจ้าหน้าที่ อ่านตัวนี้ตัวเดียว (FE ไม่มี required hardcode อีก — documents-step-config.tsx ตาย)

### 2.2 ท่ออัปโหลดเดียว
- ประตูเดียว: `POST/GET/DELETE /api/applications/draft-documents` (ของเดิม — magic-byte guard, replace-by-slot, ลบ bytes) · **ลบ** `/api/wizard/draft-documents` (ไม่มีผู้เรียก)
- ทุกพื้นผิวอัปโหลดใน wizard ยิงประตูนี้ด้วย canonical slot id — จุดที่พังวันนี้ (step 6 ใบรับรองสายพันธุ์เขียนแค่ React state) ถูกตัดทิ้งตาม mapping (STRAIN_CERTIFICATE = CUT)
- ปุ่ม "เปิดดู" ทุกจุด = `openDocumentPreview` (fetch เป็น blob + objectURL, มีอยู่แล้วใน lib) render ใน modal viewer ของหน้า — ห้าม `window.open(url)` ตรง ๆ (ruling 6)

### 2.3 ระบบประกอบแบบ กทล.1 (GENERATE)
- service ใหม่ `services/pdf/katorlor1-template-service.js`: รับ application row → เอกสาร กทล.1 (โครงตรงแบบจริง 4 ส่วน + checklist ส่วนที่ ๓ ตามสถานะจริง · ส่วนที่ ๒ ต้องกา ลักษณะพื้นที่ **ทุกช่องที่ผู้ยื่นติ๊ก** และพิมพ์ข้อความ อื่น ๆ ระบุ ต่อท้ายช่องของมันตามที่กรอก) ออกสองรูป: HTML inline (หน้าตรวจทาน/หน้าเจ้าหน้าที่/หน้า [id]/preview ใช้ตัวเดียวกัน) + PDF (ประตู `/applications/:id/pdf` เดิม เปลี่ยน template)
- ช่อง `REG_FORM` (อัปโหลดแบบคำขอเอง) ตาย — ระบบเป็นผู้สร้างเสมอ

## 3. Wizard ใหม่ — 6 ขั้นตามแบบ (โครงตาม canvas ที่อนุมัติ)

| ขั้น | เนื้อหา (กรอก) | อัปโหลดในบริบท | แหล่งใน กทล.1 |
|---|---|---|---|
| 1 ประเภทคำขอและผู้ยื่น | รายใหม่ปลูก/แปรรูป · ต่ออายุ (+เลขใบเดิม) · ใบแทน · ประเภทผู้ยื่น 3 แบบ | — (ต่ออายุ/ใบแทน: ข้าม 2-5 ไปชุดเอกสารเฉพาะกรณี + ตรวจทาน) | หัวฟอร์ม |
| 2 ตัวตนผู้ยื่น | ช่องของประเภทตัวเองเท่านั้น (รวม สัญชาติ, สวช.01, เลขรหัสประจำบ้าน สำหรับวิสาหกิจ; Line ID = optional) | ID_HOUSE_REG + เอกสารคุณสมบัติตามประเภท | ส่วนที่ ๑ |
| 3 สถานที่และที่ดิน | ชื่อ/ที่ตั้ง/โทร · เอกสารที่ดิน (ประเภท เลขที่ เล่ม หน้า ออกโดย) · การถือครอง (+ชื่อผู้ให้เช่า) · ลักษณะพื้นที่ checkbox 4 ช่อง **ติ๊กได้หลายช่อง อย่างน้อย 1 ช่อง** (☐ กลางแจ้ง ☐ อาคาร/โรงเรือนระบบปิด ☐ โรงเรือนทั่วไป ☐ อื่น ๆ **ระบุ** = ช่องข้อความ บังคับกรอกเมื่อติ๊ก) · ขนาด ตร.ม. · พิกัด · ต้น/รอบ + รอบ/ปี | LAND_RIGHTS · SITE_MAP_COORDS · [เช่า] LANDLORD_CONSENT · [Indoor/GH] BUILDING_PLAN_PHOTOS · [Outdoor] FIELD_SURROUND_PHOTOS · SITE_PHOTOS | ส่วนที่ ๒ ข้อ ๑-๒ |
| 4 พันธุ์และวัตถุประสงค์ | วัตถุประสงค์ ☐การแพทย์ ☐ส่งออก (สองช่องเท่าแบบ — RESEARCH/COMMERCIAL ตาย, ไม่มี default แอบใส่) · เมล็ด/ส่วนอื่น: พันธุ์ แหล่งที่มา ปริมาณ นำเข้า/ในประเทศ · [แปรรูป] ส่วนของพืช/แหล่ง/ปริมาณ | — | ส่วนที่ ๒ ข้อ ๓ |
| 5 แผนงานและ SOP | — | PRODUCTION_UTIL_PLAN · SECURITY_RESIDUE_PLAN · SOP_MANUAL · [เงื่อนไข] CONTROLLED_HERB_LICENSE · optional: WATER/SOIL/ADDITIONAL | ส่วนที่ ๓ |
| 6 ตรวจทานหน้าเดียว | ดู §4 | — | ส่วนที่ ๔ |

- ขั้น 1-5 autosave ต่อขั้นเหมือนเดิม (prepare draft ตั้งแต่ขั้น 1 จบ → ตั้งแต่นั้น **ทุกอย่างเป็นความจริงฝั่ง server**; ค่า UI ชั่วคราวเท่านั้นที่อยู่ใน store)
- ขั้นเดิมที่หาย: consent (ยุบเข้าขั้น 6 ตาม ส่วนที่ ๔ ของแบบ ซึ่งเซ็นตอนท้ายฟอร์ม), plant-selection (ยุบเข้า 1+4 — พืช = กัญชา ค่าเดียว ruling 5), production-info + quality-control (ตัด/ย้ายวันตรวจตาม mapping: 64 รายการของสองขั้นนี้เป็น MOVE_TO_AUDIT), documents (step 8 ตาย — เอกสารกระจายเข้าบริบท), invoice (คงเป็นส่วนแสดงในขั้น 6 — โดเมน F-G4-64 ไม่แตะ), review+submit+preview (ยุบเป็นขั้น 6)

## 4. หน้าตรวจทานเดียว (ขั้น 6) — ตามบอร์ด "Step6Review" + "Katorlor1Doc"

- ข้อมูลทั้งหน้าอ่านจาก `GET /preview/applications/:id/preview` (ของเดิม) + `GET /applications/:id/requirements` (ใหม่) — **ไม่อ่าน wizard store เลย** (mergeFields/mergeDocuments/buildLocalFormData ตาย)
- ครบ/ไม่ครบตัดสินโดย engine §2.1 ตัวเดียว: การ์ดแดงรายการที่ขาด + ปุ่ม "ไปแก้ที่ขั้น N" (จุดแก้ตรงจุด — anchor ต่อ slot/field)
- แสดงแบบ กทล.1 ที่ระบบประกอบ (HTML inline จาก §2.3) + "เปิดดูทั้งฉบับในหน้า" (viewer เต็ม ตามบอร์ด Katorlor1Doc: พิมพ์ / ดาวน์โหลด PDF เป็นทางเลือก / ปิด)
- เอกสารรายช่อง: ชิปสถานะครบทุกใบ (จำนวนจริงขึ้นกับกรณี อย่างน้อย 7 ใบ · ติ๊กลักษณะพื้นที่หลายช่องทำให้ A4 และ A4′ มาพร้อมกัน จำนวนจึงเพิ่มได้อีก) กดเปิดดูในหน้า
- คำรับรอง ส่วนที่ ๔ ครบ 5 ข้อ + ยินยอมเปิดเผยข้อมูล (แถวละ checkbox — ไม่ย่อรวม) → ตราเวลา `declarationsAcceptedAt` ฝั่ง server ตอนกดยืนยัน
- สรุปค่าธรรมเนียมงวดที่ 1 จากใบเสนอราคาจริง (ราง F-G4-64 เดิม: accept quotation + consent + checkout — พฤติกรรมการเงิน**ไม่เปลี่ยนแม้แต่บรรทัดเดียว**)
- CTA เดียว "ยืนยันและไปชำระเงินงวดที่ 1" (เปิดเมื่อ engine บอกครบ) → `POST /applications/submit` → หน้าชำระเงิน · DEMO_MODE bypass ถูกลบออกจากประตู production
- หน้า/ไฟล์ที่ตายเพราะข้อนี้: `submit-step.tsx` (ซากไม่ถูก route), `applications/preview/client-view.tsx` (ยุบเข้าขั้น 6), review-step-helpers ส่วน browser-truth · `[id]/preview` คงอยู่เป็นหน้าดูเอกสารหลังยื่น แต่ render จาก katorlor1 service เดียวกัน + ใช้ `submittedAt` ไม่ใช่ `createdAt` + สถานะแปลไทย

## 5. หน้ารีวิวเจ้าหน้าที่ — ตามบอร์ด "OfficerReview" (ruling 4)

- โครง: ซ้าย checklist ตาม กทล.1 ส่วน จนท. (1.1 เอกสารประกอบคำขอรายช่องจาก engine เดียวกัน · 1.2 ขอบข่าย · 1.3 คุณสมบัติ · 1.4 ผลตรวจเบื้องต้น) ขวา viewer เอกสารในหน้า
- ต่อช่อง: `รับ` หรือ `ขอเอกสารเพิ่ม` (เหตุผลภาษาไทยถึงผู้ยื่น + กำหนดวันส่งเป็นวันทำการผ่าน `utils/working-days.js`) — บันทึกเป็นแถว per-slot review state (ตารางใหม่ `application_document_reviews`: applicationId, slotId, verdict ACCEPTED/MORE_REQUESTED, reason, dueDate, reviewerId, timestamps — **additive migration เดียวของงานนี้**, Tier C)
- ปุ่มตัดสินรวม: "รับคำขอ เอกสารครบถ้วน" (เปิดเมื่อทุกช่อง ACCEPTED) หรือ "ส่งคำขอเอกสารเพิ่ม N รายการ" → สถานะคำขอ REVISION_REQUESTED แบบ **slot-scoped**: ผู้ยื่นเห็นเฉพาะช่องที่ถูกขอ แก้เฉพาะช่องนั้น แนบใหม่แล้วส่งกลับ ไม่ต้องยื่นใหม่ทั้งชุด + in-app notification ตามราง notification เดิม
- ทุกการตัดสินมี audit row (reviewerId + เวลา + ช่อง + เหตุผล)

## 6. งานกวาดบ้าน (B5 — คำสั่ง "คลีนให้หมด")

ลบ (โค้ด + comment ที่บรรยายของที่ไม่มีแล้ว): `submit-step.tsx` · `documents-step.tsx`/`documents-step-config.tsx`/`documents-step-dedupe.ts` (แทนด้วย requirements API + upload-in-context) · `quality-control-step.tsx`/`quality-control-choice-card.tsx` · production-info panels ส่วนที่ CUT/AUDIT · `applications/preview/client-view.tsx` · route `/api/wizard/draft-documents` · slot ที่ตายใน `constants/document-slots.js` (27 CUT ตาม mapping — คงแถว alias ไว้ให้ fold อ่านย้อน) · ป้าย "(ถ้ามี)" ที่ required:true และคู่ขัดแย้งทั้งหมด · ข้อความ "แก้ไขจาก..." ค้างในไฟล์แนะแนวของโซนนี้ — ประวัติอยู่ที่ git, HARNESS_LOG/QA-LEDGER/evidence คงเดิม (audit trail)

## 7. ความเข้ากันได้ / การย้าย

- คำขอเก่า (CERTIFIED/กำลังเดิน): อ่านผ่าน alias fold — เอกสารเดิมนับเข้า slot ใหม่, ไม่มีการเขียนย้อนข้อมูล, ใบที่ออกแล้วไม่ถูกแตะ
- DRAFT ที่ค้างกลาง wizard เก่า (เช่น a5b28bb6 ของ farmer B): เปิดใน wizard ใหม่ได้ — field ที่ตัดหายจากฟอร์มแต่**ไม่ถูกลบจาก formData** (expand-before-contract; ลบตอน contract ใบหลังเมื่อ drain)
- ไม่มีการแก้ migration เดิม (APPLIED-IS-FROZEN) — ของใหม่ (additive ทั้งหมด): คอลัมน์มิติ 3 ตัวบน requirement_rules + ตาราง `application_document_reviews` + seed กติกา (data)

## 8. การทดสอบ / หลักฐาน (ตาม DoD ชั้น B/C)

- RED-first ทุก task ที่เปลี่ยน behavior · engine: unit ครบทุกเงื่อนไข (ประเภท×การถือครอง×ลักษณะพื้นที่×ประเภทคำขอ) **รวมเคสติ๊กหลายช่อง**: กลางแจ้ง+โรงเรือน ⇒ ได้ทั้ง FIELD_SURROUND_PHOTOS และ BUILDING_PLAN_PHOTOS ในคำตอบเดียว · อาคารระบบปิด+โรงเรือน ⇒ BUILDING_PLAN_PHOTOS ใบเดียวไม่ซ้ำ และเหตุผลที่แสดงคงที่ทุกครั้ง · ติ๊ก อื่น ๆ อย่างเดียว ⇒ ไม่มี A4/A4′ แต่ต้องมีข้อความระบุ · alias fold: เอกสาร id เก่านับเข้า slot ใหม่
- walk ใหม่ `a01` เขียนใหม่ตาม wizard 6 ขั้น (สองสถานะ, กดจริง) + walk เจ้าหน้าที่กด "ขอเอกสารเพิ่มรายช่อง" แล้วผู้ยื่นแก้ช่องเดียวส่งกลับ + view-pack ทั้งสองฝั่ง
- tier ตัดสินโดย `tier-check.sh` เท่านั้น — งานนี้มี migration หนึ่งใบ ⇒ อย่างน้อยหนึ่ง batch เป็น Tier C = operator merge

## 9. นอกขอบเขต (ชัด ๆ)

การเงิน/ใบเสนอราคา (F-G4-64 คงเดิม) · T&T (แช่แข็งที่ 297ea85d) · พืชอื่น · ThaiD · หน้า SOP builder/training (คนละโดเมน แม้ mapping จะแตะ officer มุมอื่น) · การ deploy ทุกชนิด

## Self-review (ทำแล้ว)

ไม่มี TBD/placeholder · ชุด slot ตรง facts.md §2 ทุกแถว · ขั้น 1-6 ครอบทุกช่องของ กทล.1 ส่วนที่ ๑-๔ (สอบกับตาราง §3) · จุดที่รอยืนยันกับกรม = แนวปฏิบัติเมื่อผู้ยื่นยังไม่ได้ใบอนุญาตสมุนไพรควบคุม (ยื่นค้างอยู่) — ยื่น GACP คู่ขนานได้หรือไม่ (ธงไว้ใน §2.1; ฉบับกฎหมายยืนยันแล้ว: ประกาศ สธ. สมุนไพรควบคุม (กัญชา) พ.ศ. 2568)

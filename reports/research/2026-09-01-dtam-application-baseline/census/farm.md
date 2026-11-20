# Census — AREA "farm" (wizard step 5: ข้อมูลฟาร์ม) — 2026-09-01

Authority: `reports/research/2026-09-01-dtam-application-baseline/facts.md` (read end to end).
Scope compared against: กทล.1 ส่วนที่ ๒ ข้อ ๑-๒ (สถานที่, ที่ดิน, ขนาด, พิกัด, ปริมาณ) + ลักษณะพื้นที่ (facts.md §1), เอกสารแนบ A1-A8 (§2), audit-day list (§3), operator rulings (§4).

Files read IN FULL:
- `apps/web-app/src/app/health/applications/new/_steps/steps/farm-info-step.tsx` (777 lines)
- `apps/web-app/src/app/health/applications/new/_steps/steps/farm-info-form-sections.tsx` (425 lines)
- `apps/web-app/src/app/health/applications/new/_steps/steps/farm-info-plots-land-sections.tsx` (271 lines)
- `apps/web-app/src/app/health/applications/new/_steps/steps/farm-info-config.tsx` (61 lines)
- `apps/web-app/src/app/health/applications/new/_steps/steps/address-subdistrict.ts` (66 lines)
- `apps/web-app/src/app/health/applications/new/_steps/steps/derive-location-type.ts` (74 lines)

Thai labels resolved from `apps/web-app/src/lib/i18n/dictionaries/sections/th-wizard.ts:429-483` (wizard.farmInfo.*) and `apps/web-app/src/constants/options.ts:12-55` (WATER_SOURCE/FILTRATION/IRRIGATION/LAND_OWNERSHIP/LAND_DOCUMENT options). Cited lines below point at the rendering site in the six census files.

## Verdict summary

- KEEP: farm identity/address/area/coordinates/plots machinery + land-document uploads — all map to กทล.1 ส่วนที่ ๒ ข้อ ๑-๒ and A1/A3.
- CUT: the entire water-infrastructure block (แหล่งน้ำ/ระบบให้น้ำ/ระบบกรอง) and the security/utility state fields (fence/CCTV/access-control/warning-sign, electricitySource) — no กทล.1 basis; security measures are attachment A6, a *document*, not form checkboxes (ruling 1-2).
- OPTIONAL: water-quality lab report (facts.md §3: ไม่ใช่เอกสารบังคับตอนยื่น) and plot name (UI row label only — must not block).
- REWORD: site-type option labels vs DTAM's exact ลักษณะพื้นที่ terms (+ missing อื่น ๆ ระบุ), CHANOTE "บังคับ" badge + "(ชนด)" typo, CONSENT ownership label vs "ได้รับอนุญาตใช้ที่ดินรัฐ".

## Items

### farm-info-step.tsx

| # | Item | Kind | Line | UI shows | Verdict | DTAM ref | Note |
|---|---|---|---|---|---|---|---|
| 1 | Readiness summary tiles | page-section | 621 | "ข้อมูลฟาร์มพื้นฐาน / พิกัด GPS ฟาร์ม / พื้นที่แปลงที่บันทึก" | KEEP | ส่วนที่ ๒ ข้อ ๑-๒ | Display-only status of DTAM-mapped fields; collects nothing extra. |
| 2 | totalAreaUnit pinned to 'Sqm' | behaviour | 75 | ตร.ม. (unit fixed, no picker) | KEEP | ส่วนที่ ๒ ข้อ ๒ | Matches the form's ขนาดพื้นที่ **(ตารางเมตร)** exactly; the old ไร่/งาน picker is already gone. |
| 3 | waterSource (state default) | field | 77 | (no UI — legacy state key) | CUT | — | Superseded by waterSourceDetail; no กทล.1 basis either way. Dead key in FarmData. |
| 4 | electricitySource (state default) | field | 78 | (no UI) | CUT | — | No กทล.1 field asks about electricity. Dead key. |
| 5 | hasFence (state default) | field | 79 | (no UI in this step) | CUT | A6 | มาตรการรักษาความปลอดภัย is attachment A6 — a document upload, not a checkbox. Structured security booleans are a platform extra (ruling 2). |
| 6 | hasCCTV (state default) | field | 80 | (no UI in this step) | CUT | A6 | Same as hasFence. |
| 7 | hasAccessControl (state default) | field | 81 | (no UI in this step) | CUT | A6 | Same as hasFence. |
| 8 | hasWarningSign (state default) | field | 82 | (no UI in this step) | CUT | A6 | Same as hasFence. |
| 9 | envChecks / securityChecks passthrough | behaviour | 256-257 | (no UI — copied from prior state into farmData at 553-554) | CUT | A6 | Carries checkbox inventories no DTAM field asks for; QC step's note (th-wizard.ts:540) even claims they are "กรอกไว้ในขั้นตอนข้อมูลฟาร์มแล้ว" — they are not rendered here. |
| 10 | Thai-bounds GPS validation (checkThaiCoordinates) | behaviour | 276-280 | — (gates "ระบุแล้ว") | KEEP | ส่วนที่ ๒ ข้อ ๒ | Guards ค่าพิกัดภูมิศาสตร์ against transposed pairs; supports a truthful พิกัด on the generated กทล.1. |
| 11 | Land-doc upload-on-select, server URL = truth | behaviour | 177-192 | "อัปโหลดไม่สำเร็จ กรุณาลองใหม่" on failure | KEEP | A1 | Ensures A1 bytes actually reach the server before the doc counts. |
| 12 | Water-test upload handler | behaviour | 201-219 | — | OPTIONAL | facts.md §3 | ผลตรวจน้ำ ไม่ใช่เอกสารบังคับตอนยื่น (กรมปกติไม่ตรวจแล็บ). Keep only as ไม่บังคับ, counting for nothing — validation already does not require it. |
| 13 | Auto-prefill farmName/address from profile | behaviour | 291-301 | "ฟาร์ม{ชื่อ}" | KEEP | ส่วนที่ ๒ ข้อ ๑ | Convenience prefill of DTAM-mapped fields; editable. |
| 14 | validate(): required fields + ≥1 land doc | behaviour | 426-521 | "Please complete highlighted required fields." ฯลฯ | KEEP | ส่วนที่ ๒ ข้อ ๑-๒ + A1 | Correctly accepts ANY one land-doc type (contradicting the CHANOTE-only "บังคับ" badge, item 33). Error strings are English on a Thai form — reword separately. Plot-name requirement at 479 should drop (item 27). |
| 15 | DEMO_MODE bypasses validation | behaviour | 524 | — | KEEP | — | Demo scaffolding only; no legal surface. Must never ship enabled to production. |
| 16 | Map modal "เลือกตำแหน่งฟาร์มบนแผนที่" | page-section | 680-764 | คลิกบนแผนที่… / กรอกพิกัด… + "ยืนยันตำแหน่ง" | KEEP | ส่วนที่ ๒ ข้อ ๒ | Capture surface for ค่าพิกัดภูมิศาสตร์; fail-closed tile config per residency posture. |
| 17 | ManualCoordinateEntry fallback | field | 737-743 | ละติจูด/ลองจิจูด | KEEP | ส่วนที่ ๒ ข้อ ๒ | Direct entry of the same พิกัด when no map tiles configured. |
| 18 | Plots-exceed-farm-area check | behaviour | 495-497 | "พื้นที่แปลงรวม … เกินพื้นที่ฟาร์มที่ระบุไว้ …" | KEEP | ส่วนที่ ๒ ข้อ ๒ | Internal consistency of ขนาดพื้นที่ before it lands on the generated form. |

### farm-info-form-sections.tsx

| # | Item | Kind | Line | UI shows | Verdict | DTAM ref | Note |
|---|---|---|---|---|---|---|---|
| 19 | Section "1) ข้อมูลพื้นฐานฟาร์ม" | page-section | 134-138 | "กรอกข้อมูลชื่อฟาร์ม ที่อยู่ จังหวัด และพื้นที่รวม" | KEEP | ส่วนที่ ๒ ข้อ ๑ | GAP: กทล.1 ข้อ ๑ also asks โทรศัพท์ + โทรสาร (ถ้ามี) of the สถานที่ — no field here (applicant phone is a different ส่วนที่ ๑ field). |
| 20 | farmName | field | 141 | "ชื่อฟาร์ม/สถานที่เพาะปลูก" (required) | KEEP | ส่วนที่ ๒ ข้อ ๑ | = ชื่อสถานที่ (พื้นที่ปลูก). |
| 21 | address | field | 151 | "ที่อยู่" (required) | KEEP | ส่วนที่ ๒ ข้อ ๑ | = ที่ตั้ง. |
| 22 | province | field | 161 | "จังหวัด" (required, master-data select) | KEEP | ส่วนที่ ๒ ข้อ ๑ | Part of ที่ตั้ง. |
| 23 | district | field | 173-194 | "อำเภอ/เขต" (required; select with free-text fallback) | KEEP | ส่วนที่ ๒ ข้อ ๑ | Part of ที่ตั้ง. |
| 24 | subdistrict | field | 202-222 | "ตำบล/แขวง" (required; select with free-text fallback) | KEEP | ส่วนที่ ๒ ข้อ ๑ | Part of ที่ตั้ง. |
| 25 | postalCode | field | 225-233 | "รหัสไปรษณีย์" (required, prefilled from ตำบล) | KEEP | ส่วนที่ ๒ ข้อ ๑ | Part of ที่ตั้ง; prefill behaviour in address-subdistrict.ts. |
| 26 | totalAreaSize | field | 241-250 | "พื้นที่รวมทั้งหมด (ตร.ม.)" + "1 ไร่ = 1,600 ตร.ม. · 1 งาน = 400 ตร.ม." (required) | KEEP | ส่วนที่ ๒ ข้อ ๒ | = ขนาดพื้นที่ (ตารางเมตร). |
| 27 | landOwnership | field | 251-258 | "กรรมสิทธิ์ที่ดิน — ต้องมีเอกสารประกอบ" (required ButtonGroup) | KEEP | ส่วนที่ ๒ ข้อ ๒ | = สถานะการถือครอง. GAP: DTAM's เช่า case asks **ชื่อผู้ให้เช่า** — no field exists; also no per-choice conditional A2 slot here (may live in documents step — other reader). |
| 27a | option OWN | option | 254 (options.ts:44) | "เจ้าของที่ดิน (มีโฉนด/น.ส.3)" | KEEP | ส่วนที่ ๒ ข้อ ๒ | = เจ้าของ. |
| 27b | option RENT | option | 254 (options.ts:45) | "เช่าที่ดิน (ต้องมีสัญญาเช่า)" | CONDITIONAL | ส่วนที่ ๒ ข้อ ๒ + A2 | Legal case exists; when picked DTAM requires ชื่อผู้ให้เช่า (missing field) and A2 หนังสือยินยอมจากผู้ให้เช่า (no slot in this step). |
| 27c | option CONSENT | option | 254 (options.ts:46) | "ได้รับอนุญาต (ต้องมีหนังสือยินยอม)" | REWORD | ส่วนที่ ๒ ข้อ ๒ | DTAM's third status is specifically "ได้รับอนุญาตใช้ที่ดิน**รัฐ**"; current label blurs state-land permission with private consent (which DTAM files under เช่า/ขอใช้ที่ดินผู้อื่น → A2). |
| 28 | Section "2) พิกัด GPS ฟาร์ม" | page-section | 263-309 | "ระบุตำแหน่งแปลงปลูกเพื่อการตรวจสอบ" | KEEP | ส่วนที่ ๒ ข้อ ๒ | = ค่าพิกัดภูมิศาสตร์. |
| 29 | Pick-from-map button | field | 274-279 | "เลือกจากแผนที่ — แนะนำ - แม่นยำที่สุด" | KEEP | ส่วนที่ ๒ ข้อ ๒ | Opens item-16 modal. |
| 30 | Use-current-location button | field | 280-292 | "ใช้ตำแหน่งปัจจุบัน — ต้องอยู่ที่ฟาร์ม" | KEEP | ส่วนที่ ๒ ข้อ ๒ | Device-GPS capture of the same coordinates. |
| 31 | GPS required alert / selected display | behaviour | 295-307 | "กรุณาระบุพิกัด GPS ของฟาร์ม (บังคับ)" / "พิกัดที่เลือก" | KEEP | ส่วนที่ ๒ ข้อ ๒ | พิกัด is a real กทล.1 field, so บังคับ is honest. |
| 32 | Section "3) ข้อมูลแหล่งน้ำ" | page-section | 311-315 | subtitle claims "ตามมาตรฐาน DTAM" | CUT | — (no กทล.1 basis) | กทล.1 ส่วนที่ ๒ has NO water field (facts.md §1 lists everything; "ไม่มีมากกว่านี้"). Subtitle's DTAM claim is false for application day. Ruling 1-2: extras = ตัด. Water-related records are audit-day matters at most (§3). |
| 33 | water sourceType | field | 319-326 | "ประเภทแหล่งน้ำ" (required select: บ่อบาดาล/น้ำประปา/น้ำฝน/แม่น้ำ-ลำธาร/สระน้ำ/คลองชลประทาน/อื่น ๆ (ระบุ)) (options.ts:12-20) | CUT | — | No กทล.1 field. Currently marked required — worse than extra: it blocks. |
| 34 | water irrigationType | field | 327-333 | "ระบบให้น้ำหลัก (ระดับฟาร์ม)" (น้ำหยด/สปริงเกลอร์/รดน้ำด้วยมือ/ท่วมขัง) (options.ts:33-38) | CUT | — | No กทล.1 field. |
| 35 | water otherSourceType | field | 336-350 | "ระบุแหล่งน้ำอื่น ๆ" (shown when sourceType=OTHER) | CUT | — | Falls with item 33. |
| 36 | water filtrationTypes | field | 352-375 | "ระบบกรองน้ำ (เลือกได้หลายรายการ)" — multi ChoiceCards: กรองเกษตร/RO/UV/กรองตะกอน/กรองคาร์บอน/ไม่มีการกรอง (options.ts:23-30) | CUT | — | No กทล.1 field. |
| 37 | water testFile | upload-surface | 377-396 | "ผลตรวจคุณภาพน้ำ (ถ้ามี) — แนบไฟล์รายงานผลตรวจเพื่อประกอบการพิจารณา" (.pdf/.jpg/.png) | OPTIONAL | facts.md §3 | §3: ผลตรวจน้ำ/ดิน/แล็บ **ไม่ใช่เอกสารบังคับตอนยื่น**; กรมปกติไม่ตรวจแล็บ. Already "ถ้ามี" and not validated — if kept at all, must stay labelled ไม่บังคับ and count for nothing. The code comment at 386-390 calling it "mandatory under the DTAM standard" is wrong per facts.md. |

### farm-info-plots-land-sections.tsx

| # | Item | Kind | Line | UI shows | Verdict | DTAM ref | Note |
|---|---|---|---|---|---|---|---|
| 38 | Section "4) แปลงปลูก" | page-section | 71-78 | "เพิ่มแปลงปลูกและระบุขนาดพื้นที่แต่ละแปลง" + badge "{n} แปลง" | KEEP | ส่วนที่ ๒ ข้อ ๒ | Structure carrier for per-แปลง data. GAP: กทล.1 ข้อ ๒ also asks **ปริมาณการปลูก (ต้น/รอบ, รอบ/ปี)** — not collected here (check production step — other reader); พิกัดต่อแปลง not collected (farm-level GPS only — acceptable if the generated form uses it, but multi-plot farms then print one พิกัด for all แปลง). |
| 39 | "เพิ่มแปลง" button | behaviour | 79-81 | "เพิ่มแปลง" | KEEP | ส่วนที่ ๒ ข้อ ๒ | Multi-plot entry. |
| 40 | พื้นที่แปลงรวม progress bar | page-section | 84-98 | "พื้นที่แปลงรวม {x}/{y} ตร.ม." | KEEP | ส่วนที่ ๒ ข้อ ๒ | Visual for item-18 consistency check. |
| 41 | plot.name | field | 123-130 | "ชื่อแปลง" (เช่น แปลง A) | OPTIONAL | — | No กทล.1 field asks a plot name; it is a row label. Currently REQUIRED (farm-info-step.tsx:479 "กรุณาระบุชื่อแปลง") — must stop blocking; auto-label "แปลงที่ n" suffices. |
| 42 | plot.areaSize | field | 131-138 | "ขนาดพื้นที่ (ตร.ม.)" | KEEP | ส่วนที่ ๒ ข้อ ๒ | = ขนาดพื้นที่ (ตารางเมตร) per แปลง. |
| 43 | plot.solarSystem | field | 139-145 | "ประเภทพื้นที่" (select from siteTypeOptions) | REWORD | ลักษณะพื้นที่ (ส่วนที่ ๒) | Semantics right, wording off: DTAM's checkbox is "ลักษณะพื้นที่" with กลางแจ้ง (Outdoor) / อาคารหรือโรงเรือนระบบปิด (Indoor) / โรงเรือนทั่วไป (Greenhouse) / **อื่น ๆ ระบุ** — the อื่น ๆ choice is missing entirely. Internal name `solarSystem` is a legacy misnomer (memory: rename wrong names). |
| 44 | ลบแปลง action | behaviour | 117-119 | trash icon, aria "ลบแปลง" | KEEP | — | Row management only. |
| 45 | Section "5) เอกสารสิทธิ์ที่ดิน" | page-section | 155-164 | "บังคับตามมาตรฐาน DTAM" + "เลือกเอกสารที่มีและอัปโหลดไฟล์ (อย่างน้อย 1 ชนิด)" | KEEP | A1 + ส่วนที่ ๒ ข้อ ๒ | A1 is genuinely ทุกราย. GAPS: กทล.1 ข้อ ๒ also asks the document's **เลขที่/เล่ม/หน้า/ออกโดย** — no metadata fields, upload only; no explicit "หนังสืออนุญาตใช้ที่ดินรัฐ" type (only via อื่น ๆ); A2 (หนังสือยินยอมผู้ให้เช่า, เช่า case) has no conditional slot in this step. |
| 46 | CHANOTE type + upload | option | 167, 195 (options.ts:51) | "โฉนดที่ดิน (ชนด)" + badge "บังคับ" | REWORD | A1 | Two defects: (a) "(ชนด)" is a typo — โฉนดที่ดิน = น.ส.4; (b) the "บังคับ" badge asserts the โฉนด specifically is mandatory, but A1 accepts กรรมสิทธิ์ **หรือ** สิทธิครอบครอง **หรือ** หนังสืออนุญาตใช้ที่ดินรัฐ — and the step's own validation (farm-info-step.tsx:505-517) already accepts any one type. Badge contradicts both DTAM and the code. |
| 47 | NS3 type + upload | option | 167 (options.ts:52) | "น.ส.3" | KEEP | A1 | สิทธิครอบครอง document. |
| 48 | SPK type + upload | option | 167 (options.ts:53) | "ส.ป.ก." | KEEP | A1 | State-allocated land right — within A1's หนังสืออนุญาตใช้ที่ดินรัฐ family. |
| 49 | OTHER type + name + upload | option | 202-207 (options.ts:54) | "อื่น ๆ (ระบุ)" + "ระบุชื่อเอกสาร" | KEEP | A1 | Catch-all for other A1 instruments; an explicit "หนังสืออนุญาตใช้ที่ดินรัฐ" type would serve better (see item-45 gap). |
| 50 | Per-type file upload surface | upload-surface | 237-250 | "คลิกเพื่อเลือกไฟล์ — PDF, JPG, PNG" + honest 3-state chip (กำลังอัปโหลด/uploaded/failed) | KEEP | A1 | Server-URL-as-truth contract; matches ruling 6 storage discipline. |

### farm-info-config.tsx

| # | Item | Kind | Line | UI shows | Verdict | DTAM ref | Note |
|---|---|---|---|---|---|---|---|
| 51 | SITE_TYPE_BY_CULTIVATION | option | 12-16 | กลางแจ้ง / โรงเรือน / อาคารควบคุม/ในร่ม | REWORD | ลักษณะพื้นที่ (ส่วนที่ ๒) | Align labels to DTAM's exact terms — กลางแจ้ง (Outdoor) / อาคารหรือโรงเรือนระบบปิด (Indoor) / โรงเรือนทั่วไป (Greenhouse) — and add อื่น ๆ ระบุ. Comment notes fee linkage; fee tiers survive a label fix. |
| 52 | getSiteTypeOptions | behaviour | 20-25 | — | KEEP | ลักษณะพื้นที่ | Narrows plot site-type choices to the cultivation methods declared earlier — keeps the wizard consistent with the declared ลักษณะพื้นที่. |
| 53 | ChoiceCard | behaviour | 29-59 | (generic check-card control) | KEEP | — | Presentation component; carries no data of its own. |

### address-subdistrict.ts

| # | Item | Kind | Line | UI shows | Verdict | DTAM ref | Note |
|---|---|---|---|---|---|---|---|
| 54 | Postal-code prefill on ตำบล pick | behaviour | 39-54 | — | KEEP | ส่วนที่ ๒ ข้อ ๑ | Fills รหัสไปรษณีย์ from the ตำบล dataset without locking it; supports an accurate ที่ตั้ง. |
| 55 | Clear ตำบล+postal on อำเภอ change | behaviour | 63-65 | — | KEEP | ส่วนที่ ๒ ข้อ ๑ | Prevents asserting a non-existent address combination. |

### derive-location-type.ts

| # | Item | Kind | Line | UI shows | Verdict | DTAM ref | Note |
|---|---|---|---|---|---|---|---|
| 56 | deriveLocationType | behaviour | 61-73 | — (feeds "วิธีการปลูก" on the printed form, Farm.cultivationMethod, fee fallback) | KEEP | ลักษณะพื้นที่ (ส่วนที่ ๒) | Derives the application's ลักษณะพื้นที่ from stated value → plots → cultivationMethods, most-controlled-wins. This is exactly the data the GENERATEd กทล.1 must print; without it every new application printed OUTDOOR. |

## Cross-cutting gaps this area exposes (fields DTAM asks that no file here collects)

1. โทรศัพท์ + โทรสาร (ถ้ามี) ของสถานที่ — กทล.1 ส่วนที่ ๒ ข้อ ๑.
2. ชื่อผู้ให้เช่า when สถานะการถือครอง = เช่า — ส่วนที่ ๒ ข้อ ๒ (and the A2 consent-letter slot for that case is not in this step).
3. เลขที่ / เล่ม / หน้า / ออกโดย of the land document — ส่วนที่ ๒ ข้อ ๒ (uploads exist, metadata does not).
4. ปริมาณการปลูก (ต้น/รอบ, รอบ/ปี) — ส่วนที่ ๒ ข้อ ๒ (verify whether the production step covers it — outside this area's files).
5. ลักษณะพื้นที่ "อื่น ๆ ระบุ" option — absent from both the option map (farm-info-config.tsx:12) and the plot select.
6. A4/A4' evidence (แบบแปลนอาคาร+ภาพถ่าย for Indoor/Greenhouse; ภาพถ่ายแปลง for Outdoor) — conditional on the site type chosen HERE, but no conditional slot in this step (likely documents step — other reader should confirm the conditionality is wired to this step's answer).

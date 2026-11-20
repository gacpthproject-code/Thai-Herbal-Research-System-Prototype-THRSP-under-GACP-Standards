# Census — AREA "quality" (wizard step 7: การควบคุมคุณภาพ) — 2026-09-01

Reader: quality-area census agent (1 of 12). Read-only.

Files read IN FULL:
- `apps/web-app/src/app/health/applications/new/_steps/steps/quality-control-step.tsx` (359 lines)
- `apps/web-app/src/app/health/applications/new/_steps/steps/quality-control-choice-card.tsx` (53 lines)

Supporting files read for labels/behaviour (options and Thai strings rendered by the step live here):
- `apps/web-app/src/app/health/applications/new/_steps/steps/quality-control-config.ts` (all option arrays + GACP checklist)
- `apps/web-app/src/app/health/applications/new/_steps/steps/quality-control-utils.ts` (required-field validation)
- `apps/web-app/src/lib/i18n/dictionaries/sections/th-wizard.ts:484-542` (`wizard.qc.*` Thai labels)

Authority: `reports/research/2026-09-01-dtam-application-baseline/facts.md` (read end to end). Assigned reference: **facts.md §3 — กรมตรวจระบบคุณภาพ ณ แปลง ไม่ใช่วันยื่น**.

## Headline finding

**Not one field in this step maps to a fill-in field of กทล.1.** ส่วนที่ ๒ ของ กทล.1 (facts.md §1) asks purpose, area type, place, land document, size, coordinates, planting quantity, and variety/plant-part — nothing about harvest method, maturity, trimming, drying, curing, storage or packaging. The practices this step interrogates are exactly what facts.md §3 assigns to the **on-site audit day** (บันทึกกิจกรรมแปลงปลูก · บันทึกการแปรรูป/บรรจุ · สต็อกวัตถุดิบ/ผลิตภัณฑ์ · บันทึกทำความสะอาด · บันทึกป้องกันกำจัดแมลง/สัตว์ศัตรู), and their application-day carrier is the **A8 SOP manual** (+ A5 production/use plan, A6 security & leftover-use measures, A7 photos) — uploads in the documents step, not wizard questions. Under operator ruling 1-2 (required set = กทล.1 ส่วนที่ ๓ only; excess = cut), the whole step should be removed from the application wizard; its substance moves to the audit-day evidence surface.

Blocking behaviour today: `validateHarvestForm` (quality-control-utils.ts:34-43) makes 4 answers mandatory (harvestMethod, dryingMethod, storageSystem, packagingType — + packaging detail when OTHER) — the platform blocks submission on questions DTAM never asks at submission.

The section subtitles cite "DTAM หมวด 10", "DTAM หมวด 11-14", "DTAM หมวด 1-3" and the checklist chips cite "หมวด 1/3/6/14" (config:94-99): **no such หมวด numbering exists in facts.md** — the [ข้อกำหนด] has only ข้อ 1-6. These citations cannot be traced to the legal baseline.

No upload surfaces exist in these two files. `quality-control-choice-card.tsx` is a purely presentational selectable card (no fields of its own).

## Item census

Abbrev: STEP = quality-control-step.tsx · CFG = quality-control-config.ts · UTILS = quality-control-utils.ts · CARD = quality-control-choice-card.tsx · TH = th-wizard.ts. Verdict vocabulary per coordinator brief.

### Page level

| # | Item | Kind | file:line | UI shows (Thai) | Verdict | DTAM basis | Note |
|---|---|---|---|---|---|---|---|
| 1 | Whole step "การควบคุมคุณภาพ" | page-section | STEP:35-357 | "การควบคุมคุณภาพ — กรอกรายละเอียดการเก็บเกี่ยว การทำแห้ง การบ่ม การจัดเก็บ และมาตรการ GACP" (TH:486-487) | MOVE_TO_AUDIT | facts.md §3 + §1 ส่วนที่ ๒ (ไม่มีช่องพวกนี้) + §4 ruling 1-2 | Remove the step from the wizard; practice descriptions live in A8 SOP / A5 แผนการผลิต uploads and are verified ณ แปลง |
| 2 | Summary tile "การเก็บเกี่ยว" (กำหนดแล้ว/ยังไม่ระบุ) | page-section | STEP:85-88 | "การเก็บเกี่ยว · กำหนดแล้ว/ยังไม่ระบุ" (TH:496,499-500) | CUT | — (ruling 2) | Progress chrome of a step with no กทล.1 basis; falls with the step |
| 3 | Summary tile "การจัดเก็บ/บรรจุภัณฑ์" | page-section | STEP:89-92 | "การจัดเก็บ/บรรจุภัณฑ์" (TH:497) | CUT | — (ruling 2) | Same |
| 4 | Summary tile "มาตรการ GACP" (x/6 ข้อ) | page-section | STEP:93-96 | "มาตรการ GACP · n/6 ข้อ" (TH:498,501) | CUT | — (ruling 2) | Self-scored count; counts toward nothing in กทล.1 |
| 5 | Error alert | behaviour | STEP:101-105 | "ข้อผิดพลาด" + validation message (TH:503) | CUT | — | Serves the 4 platform-invented required fields; falls with them |
| 6 | Required-field validation gate | behaviour | UTILS:34-43 (called STEP:64) | "กรุณาเลือกวิธีเก็บเกี่ยว/วิธีทำแห้ง/ระบบจัดเก็บ/ประเภทบรรจุภัณฑ์/ระบุรายละเอียดบรรจุภัณฑ์" | CUT | facts.md §1 ส่วนที่ ๒ (no such fields) + ruling 2 | Blocks submission on non-DTAM questions |
| 7 | Persisting `qualityControlChecks`/`qualityControlLabels` into application data | behaviour | STEP:71-76 | — | CUT | — (ruling 1) | Self-declared checklist stored as application content; no กทล.1 destination |
| 8 | Navigation (ย้อนกลับ / ถัดไป → step 8) | behaviour | STEP:348-354 | "ถัดไป / ย้อนกลับ" | CUT | — | Wizard chrome; renumber steps when the step is removed |
| 9 | Choice-card component | behaviour | CARD:13-52 | renders label+description card, single/multiple marker | CUT | — | Presentational only; no DTAM content of its own; falls with the fields it renders |
| 10 | Bottom note alert | page-section | STEP:342-346 | "หมายเหตุ: ข้อมูลระบบรักษาความปลอดภัย (รั้ว, CCTV, Access Control) กรอกไว้ในขั้นตอน \"ข้อมูลฟาร์ม\" แล้ว" (TH:538-541) | CUT | A6 is the real surface | DTAM wants มาตรการรักษาความปลอดภัย as attachment A6 (a document), not wizard fields anywhere; note falls with the step |

### Section: การเก็บเกี่ยว

| # | Item | Kind | file:line | UI shows (Thai) | Verdict | DTAM basis | Note |
|---|---|---|---|---|---|---|---|
| 11 | Section header | page-section | STEP:107-111 | "การเก็บเกี่ยว — ระบุวิธีการเก็บเกี่ยว ระยะความสุก และวิธีตัดแต่ง ตามข้อกำหนด GACP (DTAM หมวด 10)" (TH:488-489) | MOVE_TO_AUDIT | facts.md §3 ข้อ 1 | Citation "DTAM หมวด 10" has no basis in facts.md (ข้อกำหนดมีแค่ ข้อ 1-6) |
| 12 | วิธีการเก็บเกี่ยว * (choice cards, required) | field | STEP:113-124 (req UTILS:35) | "วิธีการเก็บเกี่ยว *" (TH:506) | MOVE_TO_AUDIT | §3 ข้อ 1 (บันทึกกิจกรรมแปลงปลูก) | Practice belongs in A8 SOP; verified ณ แปลง |
| 13 | — options (2) | option | CFG:34-35 | "เก็บด้วยมือ — เก็บเกี่ยวด้วยแรงงานคน เหมาะกับพืชคุณภาพสูง" · "เก็บด้วยเครื่องจักร — ใช้เครื่องจักร/อุปกรณ์ช่วยเก็บเกี่ยว" | MOVE_TO_AUDIT | §3 ข้อ 1 | Fall with parent field |
| 14 | ระยะความสุกที่เก็บเกี่ยว (select) | field | STEP:127-133 | "ระยะความสุกที่เก็บเกี่ยว" (TH:507) | MOVE_TO_AUDIT | §3 ข้อ 1 | |
| 15 | — options (3) | option | CFG:39-41 | "ระยะต้น (Early)" · "ระยะเต็มที่ (Peak)" · "ระยะปลาย (Late)" | MOVE_TO_AUDIT | §3 ข้อ 1 | |
| 16 | วิธีตัดแต่ง (select) | field | STEP:134-140 | "วิธีตัดแต่ง" (TH:508) | MOVE_TO_AUDIT | §3 ข้อ 1-2 | |
| 17 | — options (2) | option | CFG:45-46 | "ตัดแต่งสด (Wet Trim)" · "ตัดแต่งแห้ง (Dry Trim)" | MOVE_TO_AUDIT | §3 ข้อ 1-2 | |

### Section: หลังการเก็บเกี่ยว

| # | Item | Kind | file:line | UI shows (Thai) | Verdict | DTAM basis | Note |
|---|---|---|---|---|---|---|---|
| 18 | Section header | page-section | STEP:144-148 | "หลังการเก็บเกี่ยว — การทำแห้ง การบ่ม การจัดเก็บ และบรรจุภัณฑ์ (DTAM หมวด 11-14)" (TH:490-491) | MOVE_TO_AUDIT | §3 ข้อ 2/4-5 | "DTAM หมวด 11-14" untraceable in facts.md |
| 19 | วิธีทำแห้ง * (select, required) | field | STEP:151-159 (req UTILS:36) | "วิธีทำแห้ง *" (TH:509) | MOVE_TO_AUDIT | §3 ข้อ 2/4-5 (บันทึกการแปรรูป/บรรจุ) | |
| 20 | — options (7) | option | CFG:50-56 | "แขวนแห้ง" · "ตากบนชั้นตากแห้ง" · "ตากแดด" · "ตากในโรงเรือน" · "อบด้วยตู้อบ" · "เครื่องขจัดความชื้น" · "อื่น ๆ" | MOVE_TO_AUDIT | §3 ข้อ 2/4-5 | Note: OTHER here has no follow-up text field (unlike packaging) |
| 21 | ระบบระบายอากาศ (select) | field | STEP:160-167 | "ระบบระบายอากาศ" (TH:510) | MOVE_TO_AUDIT | §3 ข้อ 2/4-5 | |
| 22 | — options (3) | option | CFG:60-62 | "ลมธรรมชาติ" · "พัดลม (ไม่ส่งตรง)" · "ระบบปรับอากาศ (HVAC)" | MOVE_TO_AUDIT | §3 ข้อ 2/4-5 | |
| 23 | จำนวนวันที่ทำแห้ง (text) | field | STEP:171-177 | "จำนวนวันที่ทำแห้ง" ph "เช่น 7-14" (TH:511-512) | MOVE_TO_AUDIT | §3 ข้อ 2/4-5 | |
| 24 | อุณหภูมิ (°C) — ทำแห้ง (text) | field | STEP:178-184 | "อุณหภูมิ (°C)" ph "เช่น 18-25" (TH:513-514) | MOVE_TO_AUDIT | §3 ข้อ 2/4-5 | |
| 25 | ความชื้นสัมพัทธ์ (%RH) — ทำแห้ง (text) | field | STEP:185-191 | "ความชื้นสัมพัทธ์ (%RH)" ph "เช่น 45-55" (TH:515-516) | MOVE_TO_AUDIT | §3 ข้อ 2/4-5 | |
| 26 | ทำแห้งในห้องมืด (checkbox) | field | STEP:194-198 | "ทำแห้งในห้องมืด" (TH:517) | MOVE_TO_AUDIT | §3 ข้อ 2/4-5 | |
| 27 | มีกระบวนการบ่ม (Curing) (checkbox, toggles curing branch) | field | STEP:200-204 | "มีกระบวนการบ่ม (Curing)" (TH:518) | MOVE_TO_AUDIT | §3 ข้อ 2/4-5 | Gates conditional branch STEP:206-250 |
| 28 | ↳ ระยะเวลาบ่ม (สัปดาห์) (text; only if hasCuring) | field | STEP:209-215 | "ระยะเวลาบ่ม (สัปดาห์)" ph "เช่น 2-8" (TH:519-520) | MOVE_TO_AUDIT | §3 ข้อ 2/4-5 | Conditional branch censused |
| 29 | ↳ อุณหภูมิ (°C) — บ่ม (text; conditional) | field | STEP:216-222 | "อุณหภูมิ (°C)" ph "เช่น 15-21" (TH:521-522) | MOVE_TO_AUDIT | §3 ข้อ 2/4-5 | |
| 30 | ↳ ความชื้น (%RH) — บ่ม (text; conditional) | field | STEP:223-229 | "ความชื้น (%RH)" ph "เช่น 55-65" (TH:523-524) | MOVE_TO_AUDIT | §3 ข้อ 2/4-5 | |
| 31 | ↳ ภาชนะที่ใช้บ่ม (select; conditional) | field | STEP:232-239 | "ภาชนะที่ใช้บ่ม" (TH:525) | MOVE_TO_AUDIT | §3 ข้อ 2/4-5 | |
| 32 | ↳ — options (5) | option | CFG:72-76 | "โหลแก้ว" · "ถุงสุญญากาศ" · "ถุงบรรจุไนโตรเจน" · "ภาชนะควบคุมความชื้น" · "อื่น ๆ" | MOVE_TO_AUDIT | §3 ข้อ 2/4-5 | |
| 33 | ↳ ความถี่เปิดระบายอากาศ (select; conditional) | field | STEP:240-247 | "ความถี่เปิดระบายอากาศ" (TH:526) | MOVE_TO_AUDIT | §3 ข้อ 2/4-5 | |
| 34 | ↳ — options (3) | option | CFG:80-82 | "วันละ 2 ครั้ง" · "วันละ 1 ครั้ง" · "สัปดาห์ละ 1 ครั้ง" | MOVE_TO_AUDIT | §3 ข้อ 2/4-5 | |
| 35 | ระบบจัดเก็บ * (select, required) | field | STEP:253-261 (req UTILS:37) | "ระบบจัดเก็บ *" (TH:527) | MOVE_TO_AUDIT | §3 ข้อ 2 (สต็อกวัตถุดิบ/ผลิตภัณฑ์) | |
| 36 | — options (3) | option | CFG:66-68 | "ห้องควบคุมอุณหภูมิ" · "อุณหภูมิห้องปกติ" · "ไซโล/ถังเก็บ" | MOVE_TO_AUDIT | §3 ข้อ 2 | CONTROLLED gates item 37 |
| 37 | ↳ อุณหภูมิที่ควบคุม (°C) (text; only if storage=CONTROLLED) | field | STEP:262-270 | "อุณหภูมิที่ควบคุม (°C)" ph "เช่น 15-25" (TH:528-529) | MOVE_TO_AUDIT | §3 ข้อ 2 | Conditional branch censused |
| 38 | ความชื้นในที่เก็บ (%RH) (text) | field | STEP:273-278 | "ความชื้นในที่เก็บ (%RH)" ph "เช่น 45-60" (TH:530-531) | MOVE_TO_AUDIT | §3 ข้อ 2 | |
| 39 | เลือกประเภทบรรจุภัณฑ์ * (choice cards, required) | field | STEP:280-291 (req UTILS:38) | "เลือกประเภทบรรจุภัณฑ์ *" (TH:532) | MOVE_TO_AUDIT | §3 ข้อ 2/4-5 (บันทึกการแปรรูป/บรรจุ) | |
| 40 | — options (5) | option | CFG:86-90 | "บรรจุสุญญากาศ" · "ถุง/ซองฟู้ดเกรด" · "ถุงฟอยล์/อะลูมิเนียม" · "ภาชนะปิดสนิท" · "อื่น ๆ (ระบุ)" | MOVE_TO_AUDIT | §3 ข้อ 2/4-5 | OTHER gates item 41 |
| 41 | ↳ ระบุรายละเอียด (text; only if packaging=OTHER; required then, UTILS:39-41) | field | STEP:293-301 | "ระบุรายละเอียด" ph "เช่น ถุงกระดาษเคลือบ, กล่องกระดาษ" (TH:533-534) | MOVE_TO_AUDIT | §3 ข้อ 2/4-5 | Conditional branch censused |

### Section: มาตรการควบคุมคุณภาพ (GACP)

| # | Item | Kind | file:line | UI shows (Thai) | Verdict | DTAM basis | Note |
|---|---|---|---|---|---|---|---|
| 42 | Section header | page-section | STEP:304-308 | "มาตรการควบคุมคุณภาพ (GACP) — DTAM หมวด 1-3" (TH:492-493) | MOVE_TO_AUDIT | §3 | "DTAM หมวด 1-3" untraceable in facts.md |
| 43 | Intro alert | page-section | STEP:310-312 | "เลือกมาตรการที่ดำเนินการในสถานประกอบการ เพื่อเพิ่มความพร้อมก่อนประเมิน" (TH:536) | CUT | — (ruling 2) | Frames a self-assessment กทล.1 doesn't have |
| 44 | GACP self-check list (6 checkboxes, none blocking) | field | STEP:314-333 | list of 6 items with "หมวด" chips | MOVE_TO_AUDIT | §3 (กรมตรวจระบบคุณภาพ ณ แปลง) | Self-declaration; the department verifies these at the farm, not from checkboxes |
| 45 | ☐ มีขั้นตอนปฏิบัติงานมาตรฐาน (SOPs) | option | CFG:94 | "มีขั้นตอนปฏิบัติงานมาตรฐาน (SOPs)" chip "หมวด 1" | CUT | กทล.1 ส่วนที่ ๓ A8 | Duplicates required attachment A8 (คู่มือ SOP upload); the upload proves it — a checkbox adds nothing |
| 46 | ☐ มีบันทึกคุณภาพเป็นลายลักษณ์อักษร | option | CFG:95 | "มีบันทึกคุณภาพเป็นลายลักษณ์อักษร" chip "หมวด 3" | MOVE_TO_AUDIT | §3 ข้อ 1-2 (บันทึกการผลิต/ตรวจวัด) | Audit-day record-keeping evidence |
| 47 | ☐ มีมาตรการป้องกันการปนเปื้อน | option | CFG:96 | "มีมาตรการป้องกันการปนเปื้อน" chip "หมวด 1" | MOVE_TO_AUDIT | §3 (บันทึกทำความสะอาด; แล็บเฉพาะเมื่อพบความเสี่ยงปนเปื้อน) | |
| 48 | ☐ มีแผนจัดการศัตรูพืชแบบผสมผสาน (IPM) | option | CFG:97 | "มีแผนจัดการศัตรูพืชแบบผสมผสาน (IPM)" chip "หมวด 6" | MOVE_TO_AUDIT | §3 ข้อ 2 (บันทึกป้องกันกำจัดแมลง/สัตว์ศัตรู) | |
| 49 | ☐ มีระบบจัดการของเสีย | option | CFG:98 | "มีระบบจัดการของเสีย" chip "หมวด 1" | CUT | กทล.1 ส่วนที่ ๓ A6 | Substance = attachment A6 (วิธีนำส่วนของกัญชาที่เหลือไปใช้ประโยชน์, an upload); §3 names no waste record; checkbox has no basis |
| 50 | ☐ มีระบบตามสอบย้อนกลับ | option | CFG:99 | "มีระบบตามสอบย้อนกลับ" chip "หมวด 14" | MOVE_TO_AUDIT | §3 ข้อ 2 (สต็อก · เอกสารการขาย/ใบส่งของ) | |
| 51 | "หมวด" reference chips on each checklist row | behaviour | STEP:326 (values CFG:94-99) | "หมวด 1 / หมวด 3 / หมวด 6 / หมวด 14" | REWORD | facts.md [ข้อกำหนด] has only ข้อ 1-6 | If any row survives, cite the real ข้อกำหนด clause (ข้อ n) instead of an untraceable หมวด numbering |
| 52 | Selected-measures counter | page-section | STEP:335-339 | "มาตรการที่เลือก: n / 6" (TH:537) | CUT | — (ruling 2) | Score display; counts for nothing in กทล.1 |

## Totals

- Fields: 20 (incl. 5 conditional-branch fields: 3 curing inputs + curing container/burp selects behind `hasCuringProcess`; storage temp behind `CONTROLLED`; packaging detail behind `OTHER`)
- Option sets: 9 (33 individual options) + 6 GACP checklist items
- Upload surfaces: **0** in this area
- Verdict distribution: MOVE_TO_AUDIT 34 · CUT 17 · REWORD 1 · KEEP 0 — nothing in this step maps to a กทล.1 fill-in field.

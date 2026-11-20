# Census — AREA "review" (2026-09-01)

Reader scope (read in full):
- apps/web-app/src/app/health/applications/new/_steps/steps/review-step.tsx (447 lines)
- apps/web-app/src/app/health/applications/new/_steps/steps/review-step-helpers.ts (389 lines)
- apps/web-app/src/app/health/applications/new/_steps/steps/review-completeness.ts (80 lines)
- apps/web-app/src/app/health/applications/new/_steps/steps/submit-step.tsx (310 lines)
- apps/web-app/src/app/health/applications/new/_steps/steps/success-step.tsx (355 lines)
- apps/web-app/src/app/health/applications/preview/client-view.tsx (644 lines)
- apps/web-app/src/app/health/applications/[id]/preview/client-view.tsx (224 lines)

Authority: reports/research/2026-09-01-dtam-application-baseline/facts.md (read end to end first). Thai labels for review-step come from apps/web-app/src/lib/i18n/dictionaries/sections/th-wizard.ts:584-657 (checked).

Routing fact (read from apps/web-app/src/app/health/applications/_components/application-step-page.tsx:50-61): COMPONENT_MAP wires `review: StepReview` and `success: StepSuccess`. **StepSubmit (submit-step.tsx) is NOT in the map — it is unroutable dead code**; only its SubmitStatusPanel is unit-tested (submit-step-states.test.tsx). So the live pair ruling 7 collapses is: wizard StepReview (step 9) → /health/applications/preview?id= (query-param preview page). /health/applications/[id]/preview is a third, post-filing document-view surface.

## Ruling-7 ledger — what each page shows, where they duplicate, server vs browser truth, download buttons

### Page A — StepReview (wizard step 9, "ตรวจทานข้อมูลก่อนยืนยันคำขอ")
- Data source: MERGE of browser wizard state (zustand `state`) + server snapshot GET `/preview/applications/{id}/preview` (review-step.tsx:74, merge at 96, 176-199). Server rows and local rows are unioned; where they disagree the page shows both worlds through mergeFields — **not pure server truth**.
- Shows: 7-item completeness checklist w/ per-item "แก้ไขข้อมูล" jump (117-157, 303-334); OfficialApplicationDocument — a custom 10-section กทล.1-style render built by buildOfficialSections from **local state** (336-350, helpers 133-388); attachments list (mergeDocuments — local docs + stepDocuments + server preview docs + snapshot attachments, helpers 60-119); 3 confirm checkboxes (364-412); prepare door POST `/applications/prepare` → router.push to Page B (259-265).
- Download/print behaviour: onPrint → window.print() (349). No PDF download here.
- Browser-only facts presented as document facts: "วันที่สร้างพรีวิว" = new Date() (343); "สถานะการตรวจทาน" = client checklist verdict (345); every buildOfficialSections row reads `state.*` (browser), not the snapshot.

### Page B — /health/applications/preview?id= ("ตรวจสอบคำขอก่อนชำระเงินและยื่นทางการ")
- Data source: **server truth** — everything from GET `/preview/applications/{id}/preview` (preview/client-view.tsx:72). No wizard-state reads. This is the page whose completeness banner is `preview.summary.isComplete` (server, 292-302) and whose CTA actually files (POST `/applications/submit`) and routes to payment (153-245).
- Shows: applicant (309-324), step-1 selection (326-350), farm (352-383), production dates+yield (385-401), เอกสารแนบ table w/ status pill + "เปิด" button (403-446), fee summary (448-463), legacy phase-1 financial docs OR checkout phase-1 payment facts (471-547), footer status chips + 3 buttons incl. the real file+pay CTA (553-625).
- Download/print behaviour: "พิมพ์เอกสาร" → window.print() (272-279). "เปิด" per document → window.open(url, '_blank') (423-436) — a TOP-LEVEL navigation, which under ruling 6 (Content-Disposition: attachment on top-level) makes the "เปิด" (view) button behave as a download, not an in-page view. No in-page viewer exists on either page A or B — ruling 7's "เห็นเอกสารตัวเองในหน้า" is satisfied by neither.
- Edit affordance: "กลับไปแก้ไข" → /health/applications/new (281-287) — wizard root, not the failing section; page A's per-item jump is the ruling-7 "แก้ได้ตรงจุด" pattern, page B lacks it.

### Duplication map A↔B (the substance ruling 7 collapses)
| Fact | Page A | Page B |
|---|---|---|
| ชื่อผู้ยื่น/โทร/อีเมล | helpers 263-304 (state) | 309-324 (server) |
| พืชที่ขอรับรอง | 164, helpers 227 | 330-331 + dup again 375-376 |
| ประเภทคำขอ/บริการ | helpers 210 | 334-335 |
| วัตถุประสงค์ | helpers 211 | 338-339 |
| รูปแบบการปลูก | 166, helpers 228 | 342-347 |
| ชื่อฟาร์ม/ที่ตั้ง/พื้นที่ | helpers 238-247 | 356-381 |
| ผลผลิตคาดการณ์ | helpers 327 | 397-398 |
| เอกสารแนบรายการ+สถานะ | helpers 350-361 + attachments prop | 403-446 |
| print button | 349 | 272-279 |
| ค่าธรรมเนียม/งวด 1 | (checkbox copy only, 397-411) | 448-463 (จริง) |

### Page C — submit-step.tsx (dead)
Full duplicate of Page A's confirm section (same 3 checkboxes, same prepare POST, same payload) plus a 4-field browser-state summary card. Not routable (COMPONENT_MAP has no `submit` entry). Redirects to step/9 — i.e. even its own success path lands on Page A.

### Page D — success-step.tsx (wizard "success" slot)
- Server truth for the CLAIM (GET `/applications/{id}` → submissionClaim, 34-61) — good pattern.
- But the summary card mixes in browser state: ผู้ยื่นคำขอ, สถานที่ผลิต, พืชที่ขอรับรอง from `state.*` (196-212), and "วันที่ยื่นคำขอ" = new Date() at render time (64, 192-193) — a farmer opening this page a day later sees the wrong filing date.
- Timeline claims "ตรวจสอบเอกสารเบื้องต้น (ประมาณ 7-14 วันทำการ)" (247) — facts.md §3 says the department's stated turnaround is ~30 วัน; no cited basis for 7-14.
- Hardcoded contact โทร (02) 5647889 / contact@gacpth.com twice (287-288, 333-348).

### Page E — /health/applications/[id]/preview ("ตัวอย่างเอกสารคำขอ")
- Server truth: GET `/applications/{id}` (97); renders ApplicationDocumentView (220, component outside this census's file set — flagged to the components reader).
- Download behaviour: "ดาวน์โหลด PDF" → fetch `/api/applications/{id}/pdf` + blob + anchor.download (115-150) — the one real PDF download in this area; consistent with ruling 6 (attachment). "พิมพ์เอกสาร" → window.print (111-113, 202-204).
- Mislabels: "วันที่ยื่น" shows createdAt (195-197) though filing happens at phase-1 payment; status Badge prints the raw enum (199).

### Server-vs-browser verdict for the merge (ruling 7)
The surviving single page must be Page B's data source (server preview) + Page A's UX assets (per-item จุดแก้ jump, กทล.1-shaped document render as GENERATE, 3→2+fee confirm ticks) + an in-page document viewer (ruling 6: subresource viewer, not top-level window.open). Page C deleted outright. Page D keeps server-claim pattern, drops browser-state rows. Page E remains the post-filing document view backed by the same generated กทล.1.

## Item census

Verdicts cite facts.md rows: ส่วนที่ ๑ (๑.๑/๑.๒/๑.๓), ส่วนที่ ๒ (ข้อ ๑-๓ + วัตถุประสงค์/ลักษณะพื้นที่), ส่วนที่ ๓ (A1-A8 + คุณสมบัติ + ต่ออายุ/ใบแทน), ส่วนที่ ๔ (คำรับรอง ๑-๕ + ยินยอม), §3 (audit-day), §4 rulings 1-7, หัวฟอร์ม (ประเภทคำขอ).

### review-step.tsx
| line | item | kind | verdict | dtamRef | note |
|---|---|---|---|---|---|
| 74 | โหลด snapshot จาก server | behaviour | KEEP | ruling 7 | server truth source — the surviving page builds on this |
| 276 | banner กำลังโหลดข้อมูลพรีวิว | page-section | KEEP | ruling 7 | mechanics |
| 286 | banner โหลดพรีวิวไม่ได้ + ลองอีกครั้ง | page-section | KEEP | ruling 7 | mechanics |
| 119 | checklist: ข้อมูลความยินยอมและประเภทคำขอ | slot | KEEP | ส่วนที่ ๔ | maps consent step |
| 124 | checklist: ข้อมูลพืช วัตถุประสงค์ และวิธีปลูก | slot | KEEP | ส่วนที่ ๒ | ruling 5: plant fixed = กัญชา |
| 129 | checklist: ข้อมูลผู้ยื่นคำขอ | slot | KEEP | ส่วนที่ ๑ | |
| 134 | checklist: ข้อมูลฟาร์มและแปลงปลูก | slot | KEEP | ส่วนที่ ๒ ข้อ ๑-๒ | |
| 139 | checklist: ข้อมูลการเพาะปลูก (gate = propagationType+plantParts) | slot | REWORD | ส่วนที่ ๒ ข้อ ๓ | plantParts มีฐาน; propagationType เป็นเกณฑ์แพลตฟอร์ม — gate ต้องวัดตามข้อ ๓ (พันธุ์/ส่วนที่ใช้/แหล่งที่มา/ปริมาณ) |
| 143 | checklist: การเก็บเกี่ยวและคุณภาพ (gate = harvestMethod) | slot | CUT | ruling 2 | ไม่มีช่องกรอกนี้ใน กทล.1; ขั้นตอนงานอยู่ใน SOP (A8) ที่เป็นเอกสารแนบ |
| 148 | checklist: เอกสารประกอบคำขอ | slot | KEEP | ส่วนที่ ๓ / ruling 1 | gate ผ่าน documentsChecklistDone — ถูกทาง; รายการ requirement เองต้องถูกตัดให้เท่า ส่วนที่ ๓ (พื้นที่ documents census) |
| 314 | ปุ่ม "แก้ไขข้อมูล" ราย checklist item | behaviour | KEEP | ruling 7 | "แก้ได้ตรงจุด" — pattern ที่หน้าเดียวที่เหลือรอดต้องมี |
| 303-334 | banner ครบ/ไม่ครบ | page-section | REWORD | ruling 7 | คำตัดสินครบถ้วนมาจาก checklist ฝั่ง browser; หน้าเดียวที่เหลือรอดต้องใช้คำตัดสินฝั่ง server (summary.isComplete) |
| 336-350 | OfficialApplicationDocument render | page-section | GENERATE | ruling 1+7 | ตัว กทล.1 ที่กรอกแล้วต้องถูก generate จากข้อมูล wizard; โครง S1-S8 ปัจจุบัน (helpers) ไม่ตรงโครง ส่วนที่ ๑-๔ ของแบบจริง |
| 342 | metadata: ชื่อผู้ยื่นคำขอ | field | KEEP | ส่วนที่ ๑ | |
| 343 | metadata: วันที่สร้างพรีวิว = new Date() | field | REWORD | ruling 7 | นาฬิกา browser แสดงเป็นข้อเท็จจริงเอกสาร — ต้องเป็นเวลาฝั่ง server |
| 344 | metadata: เลขอ้างอิงคำขอ | field | KEEP | ส่วน จนท. | เลขอ้างอิงระบบ |
| 345 | metadata: สถานะการตรวจทาน (ครบถ้วน/ยังไม่ครบถ้วน) | field | REWORD | ruling 7 | มาจาก state browser — ต้องเป็นคำตัดสิน server |
| 349 | onPrint → window.print | behaviour | KEEP | ruling 6+7 | พิมพ์เอกสารที่ generate |
| 366-379 | checkbox ยืนยันว่าข้อมูลและเอกสารถูกต้อง | option | KEEP | ส่วนที่ ๔ (๔) | |
| 381-395 | checkbox ยอมรับเงื่อนไขและมาตรฐาน GACP | option | KEEP | ส่วนที่ ๔ (๕) | |
| 397-411 | checkbox รับทราบขั้นตอนพรีวิวและการชำระเงิน | option | REWORD | ruling 7 | คำอธิบายผูกกับ flow สองหน้า ("พาไปหน้าพรีวิว") ที่ ruling 7 ยุบ; คงเป็นคำรับทราบค่าธรรมเนียมบนหน้าเดียว |
| 259-265 | POST /applications/prepare → push /health/applications/preview?id | behaviour | REWORD | ruling 7 | ประตูส่งต่อไปหน้าที่สอง = การซ้ำที่ต้องยุบ; prepare+file+pay ต้องจบบนหน้าตรวจทานเดียว |
| 233 | payload default certificationPurposes=['COMMERCIAL'] | field | REWORD | ส่วนที่ ๒ | วัตถุประสงค์ตามแบบมีแค่ การแพทย์/ส่งออก; default เงียบ = แต่งคำตอบแทนผู้ยื่น |
| 250 | payload: lots | field | CUT | ruling 2 | lot/รุ่นการปลูก เป็นเรื่อง T&T หลังได้ใบรับรอง ไม่ใช่ช่องของ กทล.1 |
| 256 | payload: youtubeUrl | field | CUT | ruling 2 | ไม่มีฐาน DTAM |
| 215,437 | DEMO_MODE ข้าม gate ครบถ้วน/ติ๊กยืนยัน | behaviour | OPTIONAL | ruling 1 | scaffold เดโม — ต้องไม่ถึง production door |
| 189-198 | filter sensitive/bulky paths ออกจากพรีวิว | behaviour | KEEP | ruling 6 | PDPA/ความปลอดภัย |
| 176-199 | mergeFields(local, remote, meta) | behaviour | REWORD | ruling 7 | หน้าเดียวที่เหลือรอดต้อง render ความจริง server ไม่ merge state browser |
| 164 | selectionRows: ชนิดพืช | field | KEEP | ruling 5 | ค่าตายตัว = กัญชา |
| 166 | selectionRows: รูปแบบการปลูก | field | KEEP | ส่วนที่ ๒ ลักษณะพื้นที่ | |
| 434-440 | ApplicationNavigation ย้อน step 8 / ยืนยัน | page-section | KEEP | ruling 7 | |

### review-step-helpers.ts (buildOfficialSections — สิ่งที่เอกสารพรีวิวแสดง)
| line | item (Thai label) | kind | verdict | dtamRef | note |
|---|---|---|---|---|---|
| 198 | ยินยอมเปิดเผยข้อมูลส่วนบุคคล (PDPA) | field | KEEP | ส่วนที่ ๔ ยินยอม + ruling 6 | |
| 199 | ยอมรับหลักเกณฑ์การรับรอง GACP | field | KEEP | ส่วนที่ ๔ (๕) | |
| 167,200 | declarationRows (แถว consent ซ้ำจาก snapshot paths) | slot | CUT | ruling 7 | ซ้ำกับสองแถว typed ข้างบน — duplicate noise |
| 210 | ประเภทคำขอ | field | KEEP | หัวฟอร์ม กทล.1 | รายใหม่/ต่ออายุ/ใบแทน |
| 211 | วัตถุประสงค์การรับรอง | field | KEEP | ส่วนที่ ๒ | ตัวเลือกต้องเท่ากับ ☐การแพทย์ ☐ส่งออก เท่านั้น |
| 212 | เลขที่ใบรับรองเดิม (กรณีต่ออายุ/ขอใบแทน) | field | CONDITIONAL | หัวฟอร์ม (ต่ออายุ/ใบแทน) | แสดง/บังคับเฉพาะสองกรณีนั้น |
| 227 | ชนิดพืชหลัก | field | KEEP | ruling 5 | กัญชาอย่างเดียว |
| 228 | รูปแบบการปลูก | field | KEEP | ส่วนที่ ๒ ลักษณะพื้นที่ | Outdoor/Indoor/Greenhouse/อื่นๆ |
| 238 | ชื่อฟาร์ม/สถานที่เพาะปลูก | field | KEEP | ส่วนที่ ๒ ข้อ ๑ | |
| 239 | ที่อยู่ฟาร์ม | field | KEEP | ส่วนที่ ๒ ข้อ ๑ | |
| 240 | จังหวัด | field | KEEP | ส่วนที่ ๒ ข้อ ๑ | องค์ประกอบที่ตั้ง |
| 241 | อำเภอ/เขต | field | KEEP | ส่วนที่ ๒ ข้อ ๑ | |
| 242 | ตำบล/แขวง | field | KEEP | ส่วนที่ ๒ ข้อ ๑ | |
| 243 | รหัสไปรษณีย์ | field | KEEP | ส่วนที่ ๒ ข้อ ๑ | |
| 244 | พื้นที่รวมทั้งหมด | field | KEEP | ส่วนที่ ๒ ข้อ ๒ | แบบกำหนดหน่วยตารางเมตร |
| 245 | หน่วยพื้นที่รวม | field | REWORD | ส่วนที่ ๒ ข้อ ๒ | แบบใช้ ตร.ม. หน่วยเดียว — แสดง/แปลงเป็น ตร.ม. ให้ตรงแบบ |
| 246 | กรรมสิทธิ์ที่ดิน | field | KEEP | ส่วนที่ ๒ ข้อ ๒ | เจ้าของ/รัฐอนุญาต/เช่า+ชื่อผู้ให้เช่า |
| 247 | พิกัด GPS ฟาร์ม | field | KEEP | ส่วนที่ ๒ ข้อ ๒ | ค่าพิกัดภูมิศาสตร์ |
| 248 | ระบบกรองน้ำ | field | CUT | ruling 2 | กทล.1 ไม่มีช่องระบบน้ำ |
| 249 | ผลตรวจคุณภาพน้ำ | field | OPTIONAL | §3 | กรมปกติไม่ตรวจแล็บ; ไม่บังคับตอนยื่น — ต้องติดป้าย ไม่บังคับ และไม่นับคะแนน |
| 250 | เอกสารสิทธิ์ที่ดินที่เลือก | field | KEEP | ส่วนที่ ๒ ข้อ ๒ | ประเภทเอกสารที่ดิน (+A1 แนบ) |
| 251 | จำนวนแปลงปลูก | field | KEEP | ส่วนที่ ๒ ข้อ ๒ | แถวสรุปของข้อมูลแปลง |
| 252 | จำนวนล็อต/รุ่นการปลูก | field | CUT | ruling 2 | lots = หลังใบรับรอง; แบบขอ ต้น/รอบ + รอบ/ปี ซึ่งมีแถวอื่นแล้ว |
| 263 | ประเภทผู้ยื่นคำขอ (วิสาหกิจ) | field | KEEP | ส่วนที่ ๑ | เลือกหนึ่งประเภท |
| 264 | ชื่อวิสาหกิจชุมชน | field | KEEP | ๑.๑ | |
| 265 | ชื่อประธาน | field | KEEP | ๑.๑ | |
| 266 | เลขบัตรประชาชนประธาน | field | KEEP | ๑.๑ | |
| 267 | ที่อยู่ตามทะเบียน | field | KEEP | ๑.๑ | แบบยังขอ สัญชาติ · รหัส สวช.01 · เลขรหัสประจำบ้าน — ไม่มีแถวแสดง (ช่องว่างของ wizard ไม่ใช่ของหน้านี้ แต่บันทึกไว้) |
| 268 | โทรศัพท์ประธาน | field | KEEP | ๑.๑ | |
| 269 | อีเมล (วิสาหกิจ) | field | OPTIONAL | ๑.๑ "อีเมล (ถ้ามี)" | ติดป้าย ไม่บังคับ |
| 281 | ชื่อ (บุคคลธรรมดา) | field | KEEP | ๑.๒ | |
| 282 | นามสกุล | field | KEEP | ๑.๒ | |
| 283 | เลขบัตรประชาชน | field | KEEP | ๑.๒ | |
| 284 | ที่อยู่ | field | KEEP | ๑.๒ | |
| 285 | โทรศัพท์ | field | KEEP | ๑.๒ | |
| 286 | อีเมล (บุคคล) | field | OPTIONAL | ๑.๒ "อีเมล (ถ้ามี)" | แบบมี Line ID ด้วย — ไม่มีแถวแสดง (บันทึกช่องว่าง) |
| 297 | ประเภทผู้ยื่นคำขอ (นิติบุคคล) | field | KEEP | ส่วนที่ ๑ | |
| 298 | ชื่อบริษัท/นิติบุคคล | field | KEEP | ๑.๓ | |
| 299 | เลขทะเบียนนิติบุคคล/ภาษี | field | KEEP | ๑.๓ | |
| 300 | ที่อยู่บริษัท | field | KEEP | ๑.๓ | |
| 301 | โทรศัพท์บริษัท | field | KEEP | ๑.๓ | |
| 302 | ชื่อกรรมการผู้มีอำนาจ | field | KEEP | ๑.๓ ผู้มีอำนาจลงนาม | |
| 303 | เลขบัตรกรรมการ | field | CUT | ruling 2 | ๑.๓ ไม่ขอเลขบัตรกรรมการเป็นช่องกรอก; สำเนาบัตรเป็นเรื่องเอกสารแนบฝั่ง จนท. |
| 304 | อีเมลติดต่อ (นิติบุคคล) | field | OPTIONAL | ๑.๓ "อีเมล (ถ้ามี)" | |
| 319 | ส่วนของพืชที่เก็บเกี่ยว | field | KEEP | ส่วนที่ ๒ ข้อ ๓ | ส่วนของกัญชาที่ใช้ |
| 320 | ส่วนของพืชอื่น (ระบุ) | field | KEEP | ส่วนที่ ๒ ข้อ ๓ | เกิน 2 ส่วนให้แนบเพิ่ม |
| 321 | วิธีขยายพันธุ์ | field | REWORD | ส่วนที่ ๒ ข้อ ๓ | แบบแยก เมล็ด (ชื่อพันธุ์/นำเข้า-ในประเทศ/แหล่งที่มา/ปริมาณ) กับ ส่วนอื่นที่ไม่ใช่เมล็ด — semantics ต้องตามนั้น |
| 322 | ระบบให้น้ำหลัก | field | CUT | ruling 2 | ไม่มีใน กทล.1 |
| 323 | จำนวนสายพันธุ์ที่บันทึก | field | KEEP | ส่วนที่ ๒ ข้อ ๓ | แถวสรุป |
| 324 | ชื่อสายพันธุ์ที่บันทึก | field | KEEP | ส่วนที่ ๒ ข้อ ๓ | แบบยังขอ แหล่งที่มา+ปริมาณ ต่อพันธุ์ — ไม่แสดง (บันทึกช่องว่าง) |
| 325 | จำนวนต้นที่ปลูก | field | KEEP | ส่วนที่ ๒ ข้อ ๒ | ปริมาณการปลูก ต้น/รอบ |
| 326 | รอบการเก็บเกี่ยว/ปี | field | KEEP | ส่วนที่ ๒ ข้อ ๒ | รอบ/ปี |
| 327 | ผลผลิตคาดการณ์ | field | CUT | ruling 2 | ไม่มีช่องกรอกใน กทล.1; ถ้าจะมีอยู่ใน A5 แผนการผลิต (เอกสารแนบ) |
| 337 | การเก็บเกี่ยว (วิธี) | field | CUT | ruling 2 / A8 | ขั้นตอนงาน = SOP (A8) เอกสารแนบ ไม่ใช่ช่องกรอก |
| 338 | วิธีการทำแห้ง | field | CUT | ruling 2 / A8 | |
| 339 | ระบบจัดเก็บ | field | CUT | ruling 2 / A8 | |
| 340 | บรรจุภัณฑ์ | field | CUT | ruling 2 / A8 | |
| 341 | มาตรการควบคุมคุณภาพ (GACP) | field | CUT | ruling 2 / A8 | |
| 342 | อุณหภูมิการทำแห้ง | field | MOVE_TO_AUDIT | §3 (บันทึกการแปรรูป/กิจกรรมแปลง) | ค่าปฏิบัติการ = บันทึกวันตรวจ |
| 343 | ความชื้นระหว่างทำแห้ง | field | MOVE_TO_AUDIT | §3 | |
| 344 | อุณหภูมิการจัดเก็บ | field | MOVE_TO_AUDIT | §3 | |
| 345 | ความชื้นในการจัดเก็บ | field | MOVE_TO_AUDIT | §3 | |
| 355 | จำนวนเอกสารในรายการทั้งหมด | field | KEEP | ส่วนที่ ๓ | |
| 356 | จำนวนเอกสารบังคับ | field | KEEP | ส่วนที่ ๓ / ruling 1 | |
| 357 | จำนวนเอกสารที่อัปโหลดแล้ว | field | KEEP | ส่วนที่ ๓ | |
| 358 | จำนวนเอกสารบังคับที่ยังขาด | field | KEEP | ส่วนที่ ๓ | |
| 359 | รายการเอกสารที่อัปโหลดแล้ว (ชื่อไฟล์ join) | field | REWORD | ruling 7 (+4) | ต้อง "เห็นเอกสารตัวเองในหน้า" — พรีวิว in-page ไม่ใช่แค่ชื่อ |
| 60-119 | mergeDocuments (local+preview+snapshot union) | behaviour | REWORD | ruling 7 | หน้าเดียวที่เหลือรอดใช้รายการฝั่ง server เท่านั้น |
| 121-127 | buildLocalFormData (state ทั้งก้อน → formData) | behaviour | REWORD | ruling 7 | แหล่ง state browser ของพรีวิว — ต้องยุบ |
| 36-58 | getApplicantName / hasApplicantData (3 สาขา) | behaviour | KEEP | ส่วนที่ ๑ | ตรงโครง 3 ประเภทผู้ยื่น |

### review-completeness.ts
| line | item | kind | verdict | dtamRef | note |
|---|---|---|---|---|---|
| 47-63 | missingRequiredDocumentIds | behaviour | KEEP | ruling 1 | เอกสารบังคับพอใจได้ด้วยเอกสารบังคับเท่านั้น; optional นับเป็นศูนย์ — ตรงนิยาม OPTIONAL ของ baseline |
| 72-79 | documentsChecklistDone (ไม่มี requirement list = ไม่ครบ) | behaviour | KEEP | ruling 1 | กัน loading state กลาย 100% |

### submit-step.tsx (unroutable — ไม่อยู่ใน COMPONENT_MAP)
| line | item | kind | verdict | dtamRef | note |
|---|---|---|---|---|---|
| 95-307 | StepSubmit ทั้งหน้า | page-section | CUT | ruling 7 | ตายแล้ว (application-step-page.tsx:50-61 ไม่มี slot) + ซ้ำ confirm section ของ review-step ทุกองค์ประกอบ |
| 43-93 | SubmitStatusPanel (idle/submitting/error/success) | behaviour | CUT | ruling 7 | ไปกับหน้า; pattern สถานะย้ายไปหน้าเดียวที่เหลือรอดได้ |
| 242-256 | checkbox ยืนยันว่าข้อมูลและเอกสารถูกต้อง | option | CUT | ruling 7 (ซ้ำ ส่วนที่ ๔ (๔)) | duplicate ของ review-step.tsx:366 |
| 258-272 | checkbox ยอมรับเงื่อนไขและมาตรฐาน GACP | option | CUT | ruling 7 (ซ้ำ ส่วนที่ ๔ (๕)) | duplicate ของ review-step.tsx:381 |
| 274-288 | checkbox รับทราบขั้นตอนพรีวิวและการชำระเงิน | option | CUT | ruling 7 | duplicate ของ review-step.tsx:397 |
| 207-239 | การ์ดสรุปคำขอ (พืชที่ยื่นขอ/วัตถุประสงค์/ผู้ยื่นคำขอ/สถานที่ปลูก) | page-section | CUT | ruling 7 | state browser + enum ดิบ (plantId.toUpperCase, purposes ไม่แปล) |
| 111-169 | POST /applications/prepare ซ้ำ + push step/9 | behaviour | CUT | ruling 7 | ประตู prepare ที่สองของ flow เดียวกัน |
| 291-296 | Alert ขั้นตอนถัดไป (บรรยาย flow สองหน้า) | page-section | CUT | ruling 7 | |

### success-step.tsx (wizard slot "success")
| line | item | kind | verdict | dtamRef | note |
|---|---|---|---|---|---|
| 34-61 | ตรวจ claim กับ server ก่อนแสดงความยินดี | behaviour | KEEP | ruling 7 | server ตัดสิน ไม่ใช่เส้นทางที่มาถึง — pattern ถูก |
| 92-129 | สาขา ยังไม่ได้ยื่น / ตรวจไม่ได้ | page-section | KEEP | ruling 7 | ซื่อสัตย์ต่อความจริง |
| 133-152 | headline/subheadline/paymentBadge ตาม claim | page-section | KEEP | ruling 7 | mapped จาก server |
| 171-173,188-189 | เลขที่คำขอ | field | KEEP | ส่วน จนท. | เลขอ้างอิงการรับคำขอ |
| 64,192-193 | วันที่ยื่นคำขอ = new Date() ขณะ render | field | REWORD | ruling 7 | นาฬิกา browser; ต้องเป็น submittedAt ฝั่ง server — เปิดหน้าวันหลังได้วันที่ผิด |
| 196-204 | ผู้ยื่นคำขอ (จาก state) | field | REWORD | ruling 7 | ต้องอ่านจาก record ฝั่ง server ไม่ใช่ wizard state ที่กำลังถูก reset |
| 206-208 | สถานที่ผลิต (จาก state) | field | REWORD | ruling 7 | เช่นเดียวกัน |
| 210-212 | พืชที่ขอรับรอง (plantId.toUpperCase, fallback 'CANNABIS') | field | REWORD | ruling 5 | แสดงภาษาไทย "กัญชา" ไม่ใช่ enum ดิบ |
| 214-219 | สถานะการชำระเงิน badge | field | KEEP | ruling 7 | จาก server claim |
| 232-275 | timeline ขั้นตอนถัดไป (5 ขั้น) | page-section | REWORD | §3 (แจ้งผล ~30 วัน) | "7-14 วันทำการ" ไม่มีฐานอ้าง; ไทม์ไลน์ต้องตรงกระบวนการกรม (ตรวจ 3 แบบ) |
| 279-290 | Alert คำแนะนำสำคัญ + โทร/อีเมลติดต่อ | page-section | KEEP | ruling 7 | contact hardcode ((02) 5647889 / contact@gacpth.com) — ควรเป็น config (memory: no hardcode) |
| 293-330 | ปุ่ม ดูสถานะใบสมัคร/ดูคำขอทั้งหมด/ยื่นฉบับใหม่/กลับหน้าหลัก | behaviour | KEEP | ruling 7 | |
| 333-348 | footer ช่องทางติดต่อ | page-section | KEEP | ruling 7 | ซ้ำกับ Alert ด้านบน — เลือกที่เดียวได้ |

### preview/client-view.tsx (/health/applications/preview?id= — หน้า "พรีวิว" ในคู่ที่ ruling 7 ยุบ)
| line | item | kind | verdict | dtamRef | note |
|---|---|---|---|---|---|
| 51-641 | หน้าพรีวิวทั้งหน้า | page-section | REWORD | ruling 7 | เป้าหมายการยุบ: แหล่งข้อมูล server + ประตู file/pay ของหน้านี้อยู่ต่อ, ส่วนแสดงผลที่ซ้ำกับ StepReview ยุบเป็นหน้าเดียว |
| 72 | GET /preview/applications/{id}/preview | behaviour | KEEP | ruling 7 | ความจริงฝั่ง server ของหน้าเดียวที่เหลือรอด |
| 266-289 | header "ตรวจสอบคำขอก่อนชำระเงินและยื่นทางการ" + subtitle "แสดงข้อมูลจากระบบทั้งหมดแบบไม่ตัดฟิลด์..." | page-section | REWORD | ruling 1+7 | subtitle เคลมเกินจริง (หน้าเลือกฟิลด์เอง และไม่ใช่ กทล.1); เอกสารราชการตัวจริง = GENERATE กทล.1 |
| 272-279 | ปุ่ม พิมพ์เอกสาร → window.print | behaviour | KEEP | ruling 6 | ซ้ำกับ print ของ StepReview — หลังยุบเหลือปุ่มเดียว |
| 281-287 | ปุ่ม กลับไปแก้ไข → /health/applications/new | behaviour | REWORD | ruling 7 | ชี้ต้นวิซาร์ด ไม่ใช่จุดที่ผิด; ต้องเป็น per-section jump แบบ review-step:314 |
| 292-302 | banner ครบถ้วน/ยังขาดข้อมูล (summary.isComplete + missingFields) | page-section | REWORD | ruling 7 | คำตัดสิน server ถูกต้องแล้ว แต่ missingFields พิมพ์ key ดิบ join คอมมา — "ต้องอ่านรู้เรื่อง" |
| 312-313 | ชื่อ-นามสกุล ผู้ยื่น | field | KEEP | ส่วนที่ ๑ | ซ้ำกับ S5 ของ StepReview |
| 316-317 | โทรศัพท์ | field | KEEP | ส่วนที่ ๑ | |
| 320-321 | อีเมล | field | OPTIONAL | ส่วนที่ ๑ "(ถ้ามี)" | |
| 330-331 | พืชที่ขอรับรอง (plantId ดิบ) | field | REWORD | ruling 5 | แสดง "กัญชา" ไม่ใช่ id ดิบ |
| 334-335 | ประเภทบริการ | field | KEEP | หัวฟอร์ม | |
| 338-339 | วัตถุประสงค์ | field | KEEP | ส่วนที่ ๒ | |
| 342-347 | รูปแบบการปลูก | field | KEEP | ส่วนที่ ๒ ลักษณะพื้นที่ | |
| 326-327 | หัวข้อ section "ข้อมูลจากขั้นตอนที่ 1" | page-section | REWORD | ruling 7 | ตั้งชื่อตามหมายเลข step ภายใน ไม่ใช่โครง กทล.1 |
| 356-357 | ชื่อฟาร์ม | field | KEEP | ส่วนที่ ๒ ข้อ ๑ | |
| 360-361 | มาตรฐาน (standardCode, default 'GACP') | field | CUT | ruling 2 | ไม่มีช่องนี้ใน กทล.1 — meta แพลตฟอร์ม |
| 371-372 | ขนาดพื้นที่ + AREA_UNIT_LABEL | field | KEEP | ส่วนที่ ๒ ข้อ ๒ | |
| 375-376 | ชนิดพืช (farmInfo.plantType) | field | CUT | ruling 7 | ซ้ำกับ พืชที่ขอรับรอง (330) ในหน้าเดียวกัน — one fact one place |
| 379-380 | ที่ตั้ง | field | KEEP | ส่วนที่ ๒ ข้อ ๑ | |
| 389-390 | วันเริ่มปลูก | field | CUT | ruling 2 | ไม่มีช่องใน กทล.1; แผนการปลูกอยู่ใน A5 (เอกสารแนบ) |
| 393-394 | วันคาดเก็บเกี่ยว | field | CUT | ruling 2 / A5 | |
| 397-398 | ผลผลิตคาดการณ์ (kg) | field | CUT | ruling 2 / A5 | ซ้ำกับ helpers:327 ด้วย |
| 403-446 | ตารางเอกสารแนบ (ชื่อ/สถานะ) | upload-surface | KEEP | ส่วนที่ ๓ | สถานะ อัปโหลดแล้ว/ยังไม่พบไฟล์ จาก server |
| 423-436 | ปุ่ม "เปิด" → window.open(url, _blank) | behaviour | REWORD | ruling 6+7 | top-level navigation เจอ Content-Disposition: attachment → ปุ่ม "เปิดดู" กลายเป็นดาวน์โหลด; ต้องเป็น in-page viewer (subresource) เพื่อ "เห็นเอกสารตัวเองในหน้า" |
| 448-463 | สรุปค่าธรรมเนียม (scopeCount, งวด1/2 รัฐ+แพลตฟอร์ม, ยอดรวม) | page-section | KEEP | ruling 7 | ด่านสุดท้ายก่อนเสียเงิน — ตัวเลขจาก server breakdown; ไม่มีใน กทล.1 แต่เป็นความจริงการเงินของแพลตฟอร์มที่หน้ายุบต้องคงไว้ |
| 471-505 | เอกสารการเงินงวดที่ 1 (legacy 4 ช่อง ใบเสนอราคา/ใบแจ้งหนี้ รัฐ+แพลตฟอร์ม) | page-section | CONDITIONAL | ruling 7 | render เฉพาะ application ที่มี legacy split-rail rows จริง (hasLiveLegacyPhase1Documents) — ประวัติศาสตร์ ไม่ใช่ทางเดินใหม่ |
| 507-547 | การชำระเงินงวดที่ 1 (pill ชำระแล้ว/ยังไม่ชำระ + เลขใบแจ้งหนี้/ใบเสร็จ/วันที่/ยอด) | page-section | KEEP | ruling 7 | ความจริง checkout ฝั่ง server |
| 153-245 | handlePayment: POST /applications/submit → checkout redirect (หรือ legacy mint) | behaviour | KEEP | ruling 7 | ประตูยื่นจริง + จ่ายจริง — หัวใจของหน้าเดียวที่เหลือรอด |
| 555-559 | chip ชำระ/ยังไม่ชำระงวดที่ 1 | field | KEEP | ruling 7 | one phase-1 truth (isPhase1Paid) |
| 564-568 | chip ขั้นตอนถัดไป (Thai-mapped) | field | KEEP | ruling 7 | |
| 572-578 | ปุ่ม กลับไปรายการคำขอ | behaviour | KEEP | ruling 7 | |
| 581-589 | ปุ่ม เปิดรายการใบแจ้งหนี้งวดที่ 1 (ซ่อนตอน resubmit) | behaviour | KEEP | ruling 7 | |
| 590-623 | CTA state-aware (ยื่น+จ่าย / ส่งคำขอแก้ไข / ส่ง CAR / ชำระแล้ว) | behaviour | KEEP | ruling 7 | ผูก 422 ของ /submit เป็นผู้ตัดสิน resubmit |
| 603 | DEMO_MODE ข้าม completeness gate | behaviour | OPTIONAL | ruling 1 | demo scaffold |

### [id]/preview/client-view.tsx (/health/applications/[id]/preview — หน้าดูเอกสารหลังยื่น)
| line | item | kind | verdict | dtamRef | note |
|---|---|---|---|---|---|
| 25-223 | หน้า ตัวอย่างเอกสารคำขอ ทั้งหน้า | page-section | KEEP | ruling 7 | ไม่ใช่คู่ที่ ruling 7 ยุบ (เป็น document view หลังยื่น) แต่ตัว render (ApplicationDocumentView) ต้องเป็น กทล.1 ที่ generate ชุดเดียวกับหน้าตรวจทาน |
| 38-41 | redirect ไป login เมื่อไม่มี session | behaviour | KEEP | ruling 6 | PDPA — เอกสารเป็นข้อมูลส่วนบุคคล |
| 53-90 | fallback: id หาย → เปิดคำขอล่าสุดแทน | behaviour | REWORD | ruling 7 | เดาเอกสารแทนผู้ใช้ — ควรพาไปหน้ารายการให้เลือกเอง |
| 92-109 | GET /applications/{id} | behaviour | KEEP | ruling 7 | server truth |
| 111-113,202-204 | ปุ่ม พิมพ์เอกสาร | behaviour | KEEP | ruling 6 | |
| 115-150,205-213 | ปุ่ม ดาวน์โหลด PDF (fetch /api/applications/{id}/pdf → blob → anchor.download) | behaviour | KEEP | ruling 6 | download surface เดียวจริงของ area นี้; attachment-style ตรง ruling 6 |
| 192-194 | หัวเรื่อง ตัวอย่างเอกสารคำขอ + เลขที่คำขอ | field | KEEP | ส่วน จนท. | |
| 195-197 | "วันที่ยื่น" = formatDate(createdAt) | field | REWORD | ruling 7 | createdAt คือวันสร้าง draft; การยื่นเกิดตอนจ่ายงวด 1 — ต้องใช้ submittedAt |
| 199 | Badge สถานะ: application.status (enum ดิบ) | field | REWORD | ruling 7 | ต้องแปลไทยตาม workflow labels |
| 156-176 | error card + ปุ่มกลับรายการ/ยื่นใหม่ | page-section | KEEP | ruling 7 | |
| 215-217 | downloadError banner | page-section | KEEP | ruling 7 | ดาวน์โหลดพังไม่ล้มทั้งหน้า |
| 220 | ApplicationDocumentView render | page-section | GENERATE | ruling 1 | ต้องเป็น กทล.1 ที่ generate จากข้อมูล (component อยู่นอกชุดไฟล์ census นี้ — ส่งต่อ reader ฝั่ง components) |

## นับรวม
- KEEP 74 · CUT 24 · OPTIONAL 8 · CONDITIONAL 2 · MOVE_TO_AUDIT 4 · GENERATE 3 · REWORD 24 (นับจากตาราง)
- ประเด็นใหญ่ที่สุด 4 ข้อของ area นี้:
  1. submit-step.tsx ทั้งไฟล์ตายแล้ว (ไม่อยู่ใน COMPONENT_MAP) และซ้ำ confirm ของ review-step — ลบได้ทั้งก้อนภายใต้ ruling 7
  2. StepReview render เอกสารจาก browser state ขณะที่หน้า preview ใช้ server truth — การยุบต้องเอา data source ของหน้า preview + UX (per-item jump, กทล.1 GENERATE) ของ StepReview
  3. ปุ่ม "เปิด" เอกสารบนหน้า preview เป็น window.open top-level → ภายใต้ ruling 6 กลายเป็นดาวน์โหลด ไม่ใช่การเปิดดู — ไม่มี in-page viewer ที่หน้าไหนเลยใน area นี้
  4. ส่วนที่ ๗ (harvest/QC) ของเอกสารพรีวิวไม่มีฐาน กทล.1 ทั้ง section: 5 แถวเป็นเรื่อง SOP (A8), 4 แถวเป็นบันทึกวันตรวจ (§3)

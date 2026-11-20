# Census — AREA "officer" (หน้าเจ้าหน้าที่ตรวจเอกสาร) — 2026-09-01

Authority: `reports/research/2026-09-01-dtam-application-baseline/facts.md` (อ่านเต็มก่อนสำรวจ).
Benchmark ของ area นี้: **ruling 4** (หน้ารีวิว จนท. = checklist ตามส่วน จนท. ของ กทล.1 + พรีวิวเอกสารในหน้า + ขอเอกสารเพิ่มเป็นรายช่อง) + **ส่วนสำหรับเจ้าหน้าที่ท้าย กทล.1** (facts.md:55-57: checklist 1.1 เอกสารประกอบ, 1.2 ขอบข่าย, 1.3 คุณสมบัติ, 1.4 ผลตรวจ ครบ/ไม่ครบ + ขอเพิ่มเป็นรายการ + วันที่ผู้ยื่นจะส่งเพิ่ม).

Read-only census. ไฟล์ที่อ่านเต็ม (path ย่อจาก repo root, `W` = `apps/web-app/src`):

1. `W/app/provider/reviewer/page.tsx` (22 บรรทัด — metadata wrapper)
2. `W/app/provider/reviewer/client-view.tsx` (493)
3. `W/app/provider/applications/[id]/page.tsx` (818) — หน้ารีวิวจริงที่คิว reviewer ลิงก์ไป
4. `W/app/provider/applications/[id]/documents-tab-panel.tsx` (159)
5. `W/app/provider/applications/[id]/review-decision-modal.tsx` (153)
6. `W/app/provider/applications/[id]/provider-application-detail-config.ts` (289)
7. `W/app/provider/applications/[id]/review-gate.ts` (38)
8. `W/app/provider/applications/[id]/review-progress-tab-panel.tsx` (104) — **orphan: ไม่มีไฟล์ไหน import** (grep ทั้ง `W` เจอเฉพาะตัวเอง)
9. `W/app/provider/applications/[id]/activities-tab-panel.tsx` (267)
10. `W/components/application/application-document-view.tsx` (722) — tab "เอกสารคำขอ (เต็ม)"
11. `W/components/application/application-document-helpers.ts` (294)
12. `W/components/application/application-document-edit-config.ts` (234)
13. `W/app/provider/applications/[id]/print/client-view.tsx` (476) + `print-page-config.ts` (77)

---

## 0. สรุปภาพรวม (สิ่งที่หน้าให้ / สิ่งที่ขาด เทียบ ruling 4)

**หน้าปัจจุบันให้:**
- คิวงาน + KPI + SLA (reviewer launchpad) — workflow chrome ล้วน ไม่ใช่เนื้อหา กทล.1
- Documents tab: checklist เอกสาร 15 แถว (`DOCUMENT_FIELDS`) + ปุ่ม Preview → iframe ในหน้า (desktop split-pane + mobile dialog) — **มีพรีวิวในหน้าแล้วจริง** (สอดคล้อง ruling 4/6)
- ปุ่ม อนุมัติเอกสาร / ขอให้แก้ไข → modal ที่มี ประเภทการแก้ไข (4 ค่า) + รายการแก้ไขแบบ free-text + หมายเหตุ
- tab เอกสารคำขอ (เต็ม): render เอกสาร 9 หมวดแบบเดียวกับฝั่งผู้ยื่น + จนท. แก้ข้อมูล in-place ได้ (44 ฟิลด์)
- print form ที่มีส่วน "สำหรับเจ้าหน้าที่" แบบกระดาษ (ครบถ้วน/ไม่ครบถ้วน + ความเห็น + วันนัดตรวจ)

**ขาดเทียบส่วน จนท. กทล.1 (facts.md:55-57):**
- ไม่มี checklist 1.1 (บัตร ปชช.+ทะเบียนบ้าน / หลักฐานนิติบุคคล / หนังสือมอบอำนาจ+สำเนาบัตรผู้มอบ / เอกสารสิทธิ์ที่ดิน / **ตัวใบอนุญาต** ปลูก-แปรรูปกัญชา) เป็นแบบติ๊กบนหน้าเว็บ — มีแค่ doc-present checklist ที่รายการไม่ตรง กทล.1
- ไม่มี 1.2 ขอบข่ายการรับรอง (รับได้/ไม่ได้) และ 1.3 คุณสมบัติผู้ยื่น (ครบ/ไม่ครบ) เลย
- 1.4 ทำได้ครึ่งเดียว: modal ขอแก้ไขเป็น free-text ไม่ผูกกับช่องเอกสาร (ruling 4 สั่ง "เป็นรายช่อง") และ**ไม่มีช่องวันที่ผู้ยื่นจะส่งเพิ่ม** (backend มี revisionDueAt + countdown แสดงผล แต่ modal ไม่ให้ จนท. กำหนดวัน)
- checklist เอกสารของหน้ารีวิวขาดช่องบังคับตาม กทล.1 ส่วนที่ ๓ หลายใบ: A2 (ยินยอมผู้ให้เช่า), A4/A4′ (แปลน+ภาพถ่าย ตามลักษณะพื้นที่), A5 (แผนการผลิต/ใช้ประโยชน์), A6 (มาตรการความปลอดภัย), A7 (รูปถ่ายสถานที่), หนังสือมอบหมายแทนวิสาหกิจ, หนังสือความร่วมมือผู้รับอนุญาตผลิตยา (บุคคลธรรมดา), หนังสือผู้แทนนิติบุคคล, ชุดต่ออายุ, ชุดใบแทน — ขณะที่ **print page (`ALL_DOCUMENTS`) กลับรู้จัก LAND_CONSENT / EXTERIOR+INTERIOR_PHOTOS / PRODUCTION_PLAN / SECURITY_PLAN** แต่หน้ารีวิวจริงไม่แสดง → สองรายการเอกสารไม่ sync กัน (detail-config:119-135 vs print-page-config:26-53)
- checklist ปัจจุบันมีของที่ไม่มีฐาน DTAM: ประวัติอาชญากรรม, ใบ e-learning GACP, ผลตรวจน้ำ/ดิน (facts.md §3: ไม่บังคับตอนยื่น), และแถว ภ.ท.9 ซ้ำสองแถว (key alias `LICENSE_PT9`+`LICENSE_PT09` ต่างเป็นแถว render จริงทั้งคู่)
- ป้าย "ใบอนุญาต ภ.ท.11/ภ.ท.9" ชนหมายเหตุ facts.md:56 — จนท. ต้องเช็ค*ตัวใบอนุญาต* ไม่ใช่แบบคำขอ ภท. (ฉบับกฎหมายปัจจุบัน UNVERIFIED — facts.md:75)

---

## 1. Reviewer launchpad — `W/app/provider/reviewer/client-view.tsx`

ทั้งหน้าเป็น workflow chrome (คิว/SLA) ไม่ใช่ข้อมูลแบบฟอร์ม — ไม่มีข้อขัด ruling โดยตรง แต่ไม่มีอะไร map กับ กทล.1 นอกจากรองรับกระบวนการ ~30 วัน (facts.md:64)

| item | line | ที่แสดง | verdict | หมายเหตุ |
|---|---|---|---|---|
| KPI รอตรวจ | 201 | "รอตรวจ" → filter ASSIGNED_FOR_REVIEW | OPTIONAL | เครื่องมือคิว ไม่ใช่ข้อมูล DTAM |
| KPI ครบกำหนดใน 48 ชม. | 209 | "ครบกำหนดใน 48 ชม." | OPTIONAL | **bug ป้าย/ลิงก์**: tile นี้ href ไป `?status=REVISION_REQUESTED` (line 213) ซึ่งไม่ใช่ความหมาย "ใกล้ครบ SLA" |
| KPI เกินกำหนด/หมดอายุ | 217 | "เกินกำหนด/หมดอายุ" | OPTIONAL | สอดคล้องกรอบ ~30 วัน (facts.md:64) |
| KPI ตรวจแล้ววันนี้ | 225 | "ตรวจแล้ววันนี้" | OPTIONAL | — |
| ช่องค้นหาคิว | 322-329 | "ค้นหารายการในคิว" | OPTIONAL | — |
| ตัวกรองความสำคัญ | 331-344 | ทั้งหมด/สูง/ปานกลาง/ปกติ | OPTIONAL | "priority" ไม่มีฐาน DTAM; badge เกินกำหนด (line 382) fallback ใช้สตริง priorityHigh ('สูง') แทนคำว่า เกินกำหนด — ป้ายผิดความหมาย |
| ตารางคิว 4 คอลัมน์ | 366-438 | คำขอ/ผู้ยื่น/ขั้นตอน/ดำเนินการ | OPTIONAL | มอบหมายโดย… (line 398-403) = audit trail ที่ดี |
| กราฟ dashboard | 312 | ProviderDashboardCharts | OPTIONAL | — |
| timeline การดำเนินการล่าสุด | 446-472 | "การดำเนินการล่าสุด" | OPTIONAL | — |
| การ์ด secure access | 474-486 | "เข้าใช้งานอย่างปลอดภัย…Audit Trail" | OPTIONAL | copy โฆษณา ไม่มีผลงาน |

## 2. หน้ารีวิวคำขอ — `W/app/provider/applications/[id]/page.tsx`

| item | line | ที่แสดง | verdict | อ้างอิง/หมายเหตุ |
|---|---|---|---|---|
| key facts: Status / SLA / Submitted | 321-323 | สถานะ, "N วัน", วันที่ยื่น | OPTIONAL | SLA เทียบ ~30 วัน facts.md:64; ปัจจุบัน danger ที่ >5 วัน (config:171) เป็นเกณฑ์ platform เอง |
| key fact สาขา/Branch | 324 | "สาขา/Branch" | CUT | ไม่มีฐาน กทล.1 — แนวคิด platform |
| key fact Plant | 325 | ชื่อพืช | KEEP | ส่วนที่ ๒ (กัญชา) + ruling 5 กัญชาเท่านั้น |
| key fact ประเภทบริการ | 326 | NEW/RENEWAL | KEEP | หัวฟอร์ม กทล.1 ประเภทคำขอ (facts.md:18) — ขาดตัวเลือก "ใบแทน" |
| แถบมอบหมายงาน | 362-386 | ผู้ตรวจที่ได้รับมอบหมาย/มอบหมายโดย | OPTIONAL | ภายในองค์กร ไม่เกี่ยวผู้ยื่น — ไม่ใช่ "ฟีเจอร์มอบอำนาจการยื่น" ตาม ruling 3 |
| ปุ่มพิมพ์ฟอร์ม | 389-393 | "Print Form" → /print | GENERATE | ควรพิมพ์ กทล.1 ฉบับจริงที่ระบบ generate จากข้อมูล wizard (ruling: GENERATE) — ดู §7 print |
| action panel อนุมัติ/ขอให้แก้ไข | 420-462 | "อนุมัติเอกสาร" / "ขอให้แก้ไข" | KEEP | = ผลตรวจ 1.4 ครบถ้วน/ไม่ครบถ้วน (facts.md:57) — แต่ไม่มี 1.2/1.3 ประกอบการตัดสิน และไม่มี machine-check ว่าช่องบังคับครบก่อนกดอนุมัติ |
| read-only notice (role อื่น) | 475-491 | "บัญชีของคุณดูได้อย่างเดียว" | OPTIONAL | สอดคล้อง gate backend |
| การ์ดผู้ยื่น | 496-518 | ชื่อ, accountType badge, โทร, อีเมล | KEEP | ส่วนที่ ๑ (facts.md:11-16) — accountType โชว์ค่า enum อังกฤษดิบ (INDIVIDUAL) ควรเป็นไทย |
| การ์ดที่ตั้งฟาร์ม | 520-573 | ชื่อฟาร์ม, ที่อยู่, ลิงก์แผนที่, พืช, ประเภท, lat/lng | KEEP | ส่วนที่ ๒ ข้อ ๑-๒ (facts.md:23-24); map ผ่าน viewer ที่ operator ตั้ง (REV-04 แก้แล้ว) — ดีต่อ PDPA ruling 6 |
| overview: จำนวนต้น | 610 | "Plant count" | KEEP | ส่วนที่ ๒ ข้อ ๒ ปริมาณการปลูก (ต้น/รอบ) |
| overview: Est. yield | 611 | "Est. yield" | CUT | ไม่อยู่ใน กทล.1 — แผนการผลิตคือเอกสารแนบ A5 |
| overview: Seed source | 612 | "Seed source" | KEEP | ส่วนที่ ๒ ข้อ ๓ แหล่งที่มา |
| overview: post-harvest 3 ช่อง | 625-627 | วิธีเก็บเกี่ยว/ทำแห้ง/จัดเก็บ | CUT | รายละเอียดปฏิบัติอยู่ใน SOP (A8) ไม่ใช่ช่องกรอก กทล.1 |
| tab เอกสารคำขอ (เต็ม) | 589-591, 643-649 | ApplicationDocumentView | KEEP | ruling 4/7 — จนท. เห็นตรงกับผู้ยื่น |
| tab Activities | 652-654 | งานอัตโนมัติ + SLA | OPTIONAL | workflow ภายใน |
| tab Review History | 656-701 | timeline + comment + actor | OPTIONAL | audit trail — เก็บ ≥5 ปี ตาม facts.md:62 สนับสนุน |
| tab การพูดคุย + โน้ตภายใน | 707-784 | composer + toggle "โน้ตภายใน (เจ้าหน้าที่เท่านั้น)" | OPTIONAL | ไม่บังคับ; internalOnly ไม่ถึงผู้ยื่น |
| behaviour: จนท. แก้ข้อมูลคำขอ in-place | 248-255 (+edit-config ทั้งไฟล์, doc-view 340-357, 680-715) | "ผู้ตรวจที่ได้รับมอบหมายสามารถแก้ไขข้อมูลคำขอในหน้านี้ได้" (44 ฟิลด์) | CUT | ไม่มีฐาน DTAM — กระบวนการ 1.4 คือขอให้**ผู้ยื่น**ส่งเพิ่ม/แก้; จนท. แก้แทนขัดคำรับรองส่วนที่ ๔ (๔) ที่ผู้ยื่นรับรองว่าข้อมูลตนจริงครบถ้วน (facts.md:28) |

**ขาดในหน้านี้ (ต้องเพิ่มตาม ruling 4):**
- checklist 1.1 เอกสารประกอบคำขอ แบบติ๊กรายข้อ (บัตร ปชช.+ทะเบียนบ้าน · หลักฐานนิติบุคคล · หนังสือมอบอำนาจ+สำเนาบัตรผู้มอบ · เอกสารสิทธิ์ที่ดิน · **ตัวใบอนุญาต**ปลูก/แปรรูปกัญชา) — facts.md:56
- 1.2 ขอบข่ายการรับรอง (รับได้/ไม่ได้) — facts.md:57
- 1.3 คุณสมบัติผู้ยื่น (ครบ/ไม่ครบ ตามประเภทผู้ยื่น) — facts.md:57
- 1.4 ช่อง "วันที่ผู้ยื่นจะส่งเอกสารเพิ่ม" ใน modal ขอแก้ไข — facts.md:57

## 3. Documents tab — `documents-tab-panel.tsx` + `DOCUMENT_FIELDS` (detail-config.ts:119-135)

พฤติกรรม:
| item | line | verdict | หมายเหตุ |
|---|---|---|---|
| ปุ่ม Preview → iframe ในหน้า (split-pane xl+, dialog < xl) | panel:76-77, 104-109, 125-156 | KEEP | ตรง ruling 4 "พรีวิวในหน้า" + ruling 6 (iframe = subresource) |
| ปุ่ม Open `target="_blank"` | panel:80-85 | REWORD | ruling 6: top-level = `Content-Disposition: attachment` → ปุ่มนี้คือ "ดาวน์โหลด" ไม่ใช่ "เปิด" — เปลี่ยนป้าย/พฤติกรรมให้ตรงจริง |
| ไฮไลต์ช่องที่ถูกขอแก้ไข | panel:48-51, 66-71 | REWORD | จับคู่ item free-text กับชื่อเอกสารด้วย `toLowerCase().includes()` — เปราะ; ruling 4 ต้องการ "ขอเพิ่มเป็นรายช่อง" = โครงสร้างอ้าง key ช่องตรง ๆ |
| เครื่องหมาย ✓/✕ + badge Missing | panel:58-62, 87 | KEEP | รองรับผลตรวจ 1.4 |

รายการช่อง (`DOCUMENT_FIELDS`, config line ระบุ):
| # | key | ป้ายไทย | line | verdict | อ้างอิง |
|---|---|---|---|---|---|
| 1 | idCardDoc | บัตรประจำตัวประชาชน | 120 | KEEP | จนท. 1.1 (facts.md:56) |
| 2 | houseRegDoc | ทะเบียนบ้าน | 121 | KEEP | จนท. 1.1 |
| 3 | criminalBgDoc | หนังสือรับรองประวัติอาชญากรรม | 122 | CUT | ไม่มีใน กทล.1 ส่วนที่ ๓ และไม่มีฐานกฎหมายอื่นใน repo ที่อ้างได้ |
| 4 | LICENSE_PT11 | ใบอนุญาต ภ.ท.11 | 123 | REWORD | จนท. 1.1 ต้องการ*ตัวใบอนุญาต/หนังสือสำคัญ*ตามกฎหมาย ไม่ใช่แบบคำขอ ภท. (facts.md:56; print-config:30 เองบอกว่า ภท.11 = "คำขออนุญาตสมุนไพรควบคุม"); ฉบับกฎหมาย ณ วันยื่น UNVERIFIED (facts.md:75) |
| 5 | LICENSE_PT9 | ใบอนุญาต ภ.ท.9 | 124 | REWORD | เช่นเดียวกับ ภท.11 (print-config:31: "คำขออนุญาตวิจัย/ส่งออก") |
| 6 | LICENSE_PT09 | ใบอนุญาต ภ.ท.9 (แถวซ้ำ) | 125 | CUT | legacy alias เป็น**แถว render จริงแถวที่สอง** — จนท. เห็น ภ.ท.9 สองแถว; ยุบ alias ไว้ใน resolver ไม่ใช่ใน list |
| 7 | LICENSE_PT10 | ใบอนุญาต ภ.ท.10 (ส่งออก) | 126 | CONDITIONAL | เฉพาะวัตถุประสงค์ส่งออก (ส่วนที่ ๒ facts.md:21 + จนท. 1.1); ยืนยันฉบับกฎหมายก่อน (facts.md:75) |
| 8 | LAND_TITLE | เอกสารสิทธิ์ที่ดิน | 127 | KEEP | A1 + จนท. 1.1 |
| 9 | SITE_MAP | แผนผังแปลงปลูก | 128 | KEEP | A3 — ป้ายควรครอบตาม A3: ที่ตั้ง+พิกัด+เส้นทาง+ขนาด+สิ่งปลูกสร้างใกล้เคียง |
| 10 | WATER_TEST | ผลตรวจน้ำ | 129 | MOVE_TO_AUDIT | facts.md:63 — ไม่ใช่เอกสารบังคับตอนยื่น (กรมตรวจแล็บเฉพาะพบความเสี่ยง) |
| 11 | SOIL_TEST | ผลตรวจดิน | 130 | MOVE_TO_AUDIT | facts.md:63 เช่นเดียวกัน |
| 12 | SOP_MANUAL | คู่มือ SOP | 131 | KEEP | A8 |
| 13 | GACP_CERTIFICATE | ใบประกาศนียบัตรอบรม GACP | 132 | CUT | ไม่มีฐาน กทล.1 — platform extra (ruling 1/2) |
| 14 | companyRegDoc | หนังสือรับรองบริษัท | 133 | CONDITIONAL | นิติบุคคล — กลุ่มคุณสมบัติ (facts.md:50) + จนท. 1.1; เงื่อนไข "ออกให้ไม่เกิน 6 เดือน" ไม่มีที่ไหนตรวจ |
| 15 | communityRegDoc | หนังสือรับรองวิสาหกิจชุมชน | 134 | CONDITIONAL | วิสาหกิจชุมชน — กลุ่มคุณสมบัติ (facts.md:48) |

**ช่องที่ขาดจาก checklist นี้** (มีใน กทล.1 ส่วนที่ ๓ แต่หน้ารีวิวไม่มีแถวให้ตรวจ):
A2 หนังสือยินยอมผู้ให้เช่า/ให้ใช้ที่ดิน (CONDITIONAL เช่า — facts.md:36) · A4 แบบแปลนอาคาร+ภาพถ่ายนอก/ใน (CONDITIONAL Indoor/Greenhouse — facts.md:38) · A4′ ภาพถ่ายแปลง+รอบแปลง (CONDITIONAL Outdoor — facts.md:39) · A5 แผนการผลิต+แผนใช้ประโยชน์/แปรรูป (ทุกราย — facts.md:40) · A6 มาตรการรักษาความปลอดภัย+การใช้ส่วนที่เหลือ (ทุกราย — facts.md:41) · A7 รูปถ่ายสถานที่ผลิตและเก็บเกี่ยว (ทุกราย — facts.md:42) · หนังสือมอบหมายดำเนินกิจการแทนวิสาหกิจ (facts.md:48) · หนังสือความร่วมมือกับผู้รับอนุญาตผลิตยา (บุคคลธรรมดา — facts.md:49) · บัญชีรายชื่อกรรมการ+หนังสือผู้แทนนิติบุคคล (facts.md:50) · หนังสือมอบอำนาจ+สำเนาบัตรผู้มอบ (จนท. 1.1 — facts.md:56, ภายใต้ ruling 3 = เอกสารแนบ ไม่ใช่ฟีเจอร์) · ชุดต่ออายุ (facts.md:52) · ชุดใบแทน (facts.md:53)

## 4. Modal ตัดสินผลตรวจ — `review-decision-modal.tsx` + `REVISION_CATEGORIES` (config:108-113)

| item | line | ที่แสดง | verdict | หมายเหตุ |
|---|---|---|---|---|
| แจ้งอนุมัติ | 57-60 | "เอกสารบังคับครบถ้วนและถูกต้อง" | KEEP | = 1.4 ครบถ้วน; แต่ไม่มีการบังคับติ๊ก 1.1/1.2/1.3 ก่อน ("เอกสารบังคับครบ" เป็นแค่ข้อความ ไม่มีเครื่องตรวจ) |
| select ประเภทการแก้ไข | 69-74 (options config:108-113) | เอกสารขาด/เอกสารไม่ถูกต้อง/ข้อมูลไม่ตรงกัน/อื่น ๆ | OPTIONAL | 1.4 ไม่ได้แบ่งประเภท — เก็บได้แบบไม่บังคับ |
| รายการที่ต้องแก้ไข (free-text list) | 76-106 | "รายการที่ N" + เพิ่ม/ลบ | REWORD | ruling 4 "ขอเอกสารเพิ่มเป็นรายช่อง" → ต้องเลือกจากช่องเอกสาร/ฟิลด์ของคำขอ (structured key) ไม่ใช่พิมพ์อิสระที่ไป fuzzy-match ใน documents tab |
| หมายเหตุ textarea | 127-136 | "หมายเหตุ" | KEEP | 1.4 "ระบุ…" (facts.md:57) |
| (ขาด) วันที่ผู้ยื่นจะส่งเพิ่ม | — | ไม่มี | KEEP-เพิ่ม | 1.4 ระบุ "วันที่ผู้ยื่นจะส่งเพิ่ม" — backend มี `revisionDueAt`+countdown (config:178-196) แต่ จนท. ไม่มีช่องกำหนดวันใน modal |

## 5. tab เอกสารคำขอ (เต็ม) — `application-document-view.tsx` (+helpers)

หัวกระดาษ (364-385): ตราหน่วยงาน + "แบบ กทล 1" — **อ้างว่าเป็น กทล.1 แต่โครงเนื้อหาเป็น 9 หมวดของ wizard ไม่ใช่โครงส่วนที่ ๑-๔ ของแบบจริง** → GENERATE (ระบบต้อง render กทล.1 ฉบับจริงจากข้อมูล; ruling 1)

ฟิลด์รายตัว (verdict ตาม ruling 1/2 — เกิน DTAM = ตัด):
- §1 (394-404): ประเภทผู้ยื่น KEEP (ส่วนที่ ๑) · ชื่อผู้ยื่น KEEP · โทรศัพท์ KEEP · อีเมล KEEP (ถ้ามี) · Line ID KEEP (๑.๒/๑.๓; วิสาหกิจไม่มีช่องนี้ในฟอร์ม) · เลขบัตร/ทะเบียน KEEP · เลขผู้เสียภาษี/นิติบุคคล CONDITIONAL (๑.๓) · ที่อยู่ KEEP — **ขาด**: สัญชาติ + รหัสทะเบียน สวช.01 + เลขรหัสประจำบ้าน (๑.๑ — facts.md:14)
- §2 (411-423): ชนิดพืช REWORD (PLANT_NAMES helpers:48-55 มี 6 พืช — ruling 5 กัญชาเท่านั้น) · วัตถุประสงค์ REWORD (map วิจัย/การค้า/ส่งออก helpers:144-150 — DTAM ให้เลือก ☐ การแพทย์ ☐ ส่งออก facts.md:21) · วิธีปลูก KEEP (= ลักษณะพื้นที่ Outdoor/Indoor/Greenhouse; ขาด "อื่น ๆ ระบุ") · ประเภทบริการ KEEP (ขาด ใบแทน)
- §3 (433-462): ชื่อฟาร์ม KEEP (ข้อ ๑) · ที่อยู่ KEEP (ข้อ ๑; ขาดช่องโทรศัพท์/โทรสารของสถานที่) · พื้นที่รวม ตร.ม. KEEP (ข้อ ๒ — หน่วยตรง ตารางเมตร, `AREA_UNIT_LABEL`='ตร.ม.' lib/area.ts:15) · พิกัด GPS KEEP (ข้อ ๒) · การถือครองที่ดิน KEEP (ข้อ ๒; กรณีเช่าขาดช่องชื่อผู้ให้เช่า) · เอกสารสิทธิ์ (โฉนด/น.ส.3/ส.ป.ก.) KEEP (ข้อ ๒ ประเภทเอกสารที่ดิน; ขาด เลขที่/เล่ม/หน้า/ออกโดย) · แหล่งน้ำ CUT · การกรองน้ำ CUT · ระบบให้น้ำ CUT · ผลตรวจคุณภาพน้ำ MOVE_TO_AUDIT (facts.md:63) · ชนิดดิน CUT · pH ดิน CUT · ประวัติการใช้ที่ดิน CUT · ระบบรักษาความปลอดภัย (4 ติ๊ก 276-281) REWORD → A6 คือ*เอกสารแนบ*มาตรการความปลอดภัย ไม่ใช่ checkbox · ตารางแปลง (468-487) KEEP (ข้อ ๒)
- §4 (500-515): วิธีขยายพันธุ์ REWORD (ข้อ ๓ แยก เมล็ด/ส่วนอื่นที่ไม่ใช่เมล็ด) · ส่วนของพืช KEEP (ข้อ ๓) · วัสดุปลูก CUT · ระยะปลูก CUT · จำนวนต้น KEEP (ข้อ ๒ ต้น/รอบ) · รอบเก็บเกี่ยว/ปี KEEP (ข้อ ๒ รอบ/ปี) · ผลผลิตคาดการณ์ CUT (A5) · วัตถุประสงค์ผลผลิต CUT · IPM plan/methods/note MOVE_TO_AUDIT (facts.md:61 บันทึกป้องกันกำจัดแมลง) · ใบรับรอง GAP CUT · ใบรับรองอินทรีย์ CUT
- §5 ตารางพันธุ์ (526-545): ชื่อพันธุ์ KEEP (ข้อ ๓) · ประเภท (ปลูกเอง/ซื้อ/นำเข้า) REWORD → DTAM ถาม นำเข้า/ในประเทศ · แหล่งที่มา KEEP · สายพันธุ์ Sativa/Indica CUT · ปริมาณ KEEP
- §6 ตารางปัจจัยการผลิต (552-576): ทั้งตาราง (ประเภท/ชื่อ/ยี่ห้อ/NPK/อินทรีย์) MOVE_TO_AUDIT (facts.md:60 บันทึกการซื้อ/ใช้ปัจจัยการผลิต = วันตรวจ)
- §7 (586-612): วิธีเก็บเกี่ยว · ระยะความสุก · วิธีตัดแต่ง · วิธีทำแห้ง · ระยะเวลา/อุณหภูมิ/ความชื้นตาก · airflow · ชุด curing 6 ช่อง · ระบบจัดเก็บ · ควบคุมอุณหภูมิ/ความชื้นจัดเก็บ · บรรจุภัณฑ์ — **ทั้งหมด CUT**: รายละเอียดวิธีปฏิบัติอยู่ใน SOP (A8) และบันทึกวันตรวจ (facts.md:61) ไม่ใช่ช่องกรอก กทล.1
- §8 (618-620): มาตรการควบคุมคุณภาพ (ติ๊ก 6 ข้อ QC_CHECK_TH helpers:237-240) CUT (เนื้อหา SOP A8)
- §9 (622-677): grid เอกสาร + รูป inline + iframe PDF KEEP (ruling 4/6) — แต่ลิงก์ "เปิดไฟล์" target=_blank (632-639) REWORD เช่นเดียวกับปุ่ม Open · วิดีโอประกอบ youtubeUrl/videoLink (664-676) CUT (ไม่มีฐาน DTAM)

`REQUIRED_DOCUMENTS` (helpers:57-75) — ช่องที่เพิ่มจาก DOCUMENT_FIELDS:
- communityMeetingDoc "รายงานการประชุมวิสาหกิจ" (62) → REWORD: เอกสารคุณสมบัติจริงคือ "หนังสือแสดงว่าผู้ยื่นได้รับมอบหมายให้ดำเนินกิจการแทนวิสาหกิจ" (facts.md:48)
- directorListDoc "รายชื่อกรรมการ" (64) → CONDITIONAL นิติบุคคล (facts.md:50)
- powerOfAttorneyUrl "หนังสือมอบอำนาจ" (65) → CONDITIONAL — จนท. 1.1 คู่กับ*สำเนาบัตรผู้มอบ* (ไม่มีช่อง); ruling 3: เป็นเอกสารแนบ ไม่ใช่ฟีเจอร์มอบอำนาจ

## 6. review-progress-tab-panel.tsx — orphan

- REVIEW_STEPS 9 หมวด (23-33) + การ์ด revision + ฟิลด์ที่แก้แล้ว — **ไม่มีใคร import** (REV-12 ถูกถอด 2026-06-23 ตาม comment ใน review-gate.ts:30-32) → CUT (dead code); ถ้าจะฟื้น checklist ให้สร้างตาม 1.1-1.4 ของ กทล.1 ไม่ใช่ 9 หมวด wizard

## 7. Print page — `print/client-view.tsx` + `print-page-config.ts`

- ทั้งหน้า: หัวเรื่อง "แบบคำขอรับรองมาตรฐาน GACP …พืชสมุนไพร" (125-127), เลขส่วน (ส่วนที่ 3/4/5/6/7) ไม่ตรงส่วนที่ ๑-๔ ของ กทล.1 → **GENERATE**: ruling ให้ระบบผลิต กทล.1 ฉบับจริง ไม่ใช่ฟอร์มประดิษฐ์ของ platform
- คำรับรอง (403-413): ข้อความ 2 ย่อหน้า ไม่ใช่คำรับรอง (๑)-(๕) + ความยินยอมเปิดเผยข้อมูล ตามส่วนที่ ๔ (facts.md:28) → REWORD
- ส่วนสำหรับเจ้าหน้าที่ (433-462): ☐ ครบถ้วน ☐ ไม่ครบถ้วน (440-442) KEEP (1.4) — ขาด "ขอเอกสารเพิ่มเติม ระบุ…" + วันที่ส่งเพิ่ม + 1.2 + 1.3; ความเห็นเจ้าหน้าที่ (446) KEEP (1.4 ระบุ); วันที่นัดตรวจประเมิน (450) OPTIONAL (ไม่อยู่ในส่วน จนท. ของแบบ — เป็นขั้น audit)
- ฟิลด์เฉพาะ print ที่เกินแบบ: เลขทะเบียน สกท. (184) + รหัส ท.ว.ช.3 (185) REWORD → แบบขอ "รหัสทะเบียน สวช.01" (facts.md:14); จำนวนสมาชิก (188) CUT (บัญชีรายชื่อสมาชิกเป็นเอกสารแนบ facts.md:48); ทุนจดทะเบียน (211) CUT; ประเภทนิติบุคคล (208) CUT; บล็อกผู้ประสานงาน (226-238) CUT (ruling 2); ชื่อวิทยาศาสตร์ (254-255) CUT; ส่วนที่ใช้ (258-259) KEEP (ข้อ ๓)
- `ALL_DOCUMENTS` (config:26-53) รายการที่*ไม่มี*ในหน้ารีวิว: RENTAL_CONTRACT (39) OPTIONAL (A2 คือหนังสือยินยอม ไม่ใช่สัญญาเช่า) · LAND_CONSENT (40) CONDITIONAL=A2 · EXTERIOR_PHOTOS (44)/INTERIOR_PHOTOS (45) CONDITIONAL=A4/A4′ · PRODUCTION_PLAN (46) KEEP=A5 · SECURITY_PLAN (47) KEEP=A6 · STRAIN_CERTIFICATE (50) CUT · STAFF_TRAINING (51) CUT · VIDEO_LINK (52) CUT — **ความรู้เรื่อง A2/A4/A5/A6 อยู่ผิดที่**: print รู้ แต่ checklist หน้ารีวิว (DOCUMENT_FIELDS) ไม่รู้

## 8. review-gate.ts

- REVIEW_ACTION_ROLES = ADMIN/DOCUMENT_REVIEWER/AUDITOR (17-21) — OPTIONAL (โครง role ภายใน ไม่ขัดอะไรใน facts.md; AUDITOR กดอนุมัติเอกสารได้ด้วย — นโยบายภายในที่ operator ควรยืนยัน)

---

*Read-only census — ไม่มีการแก้ไฟล์ใดนอกจากรายงานฉบับนี้*

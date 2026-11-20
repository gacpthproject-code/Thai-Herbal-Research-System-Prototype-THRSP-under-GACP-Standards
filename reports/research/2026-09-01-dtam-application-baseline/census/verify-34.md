# verify-34 — SKEPTIC check: รางขั้น harvest "เก็บเกี่ยวและคุณภาพ" (MOVE_TO_AUDIT?)

Item under challenge: page-section `plant-selection-config.ts:309-315` ("เก็บเกี่ยวและคุณภาพ — วิธีเก็บเกี่ยว อบแห้ง บ่ม จัดเก็บ บรรจุ มาตรการ GACP"), proposed MOVE_TO_AUDIT per facts.md §3 ข้อ 1-2 (facts.md:60-61).

Role: refute if possible. Authority = facts.md (กทล.1 + ข้อกำหนด, operator rulings §4).

## VERDICT: UPHELD — MOVE_TO_AUDIT stands

## Refutation attempts (all failed)

1. **กทล.1 ส่วนที่ ๒ asks for it?** No. facts.md:20-25 is the exhaustive fill-in list ("ทั้งหมดที่ฟอร์มขอ ไม่มีมากกว่านี้"): purpose, area type, site name, land document/tenure, area size, coordinates, plant quantity, seed/strain sources. Zero fields on harvest method, drying, curing, storage, packaging, or QC self-declaration.
2. **กทล.1 ส่วนที่ ๓ attachments rescue it?** The topics ARE application-day — but only as uploads: A5 แผนการผลิต+แผนการใช้ประโยชน์/แปรรูป, A6 มาตรการรักษาความปลอดภัย+วิธีนำส่วนที่เหลือไปใช้ประโยชน์, A7 รูปถ่ายสถานที่ผลิตและการเก็บเกี่ยว, A8 SOP (facts.md:40-43). All are document slots in the **documents** step, not questionnaire fields; the repo already carries the SOP-harvest slot (`apps/backend/constants/document-slots.js:184-189` — `sop_harvest` "SOP การเก็บเกี่ยว", required). The application-day obligation is fully discharged there. This reinforces, not refutes, the verdict.
3. **The GACP 14-หมวด standard (หมวด 10 การเก็บเกี่ยว, 11 แปรรูปเบื้องต้น, 13 การบรรจุ, 14 จัดเก็บ/ขนส่ง)?** Those are audit-assessment criteria, not form fields — `docs/requirements/official-gacp-requirements-dtam.md:20-39` presents them as the certification standard evaluated at inspection (ตรวจประเมินสถานที่, ibid.:49-58). Audit-day again.
4. **ข้อกำหนด conditions?** facts.md:64: the application package = แบบลงทะเบียน + SOP + เอกสารประกอบ. facts.md §3 ข้อ 1-2 (lines 60-61) explicitly names บันทึกกิจกรรมแปลงปลูก, บันทึกการแปรรูป/บรรจุ, สต็อก, บันทึกทำความสะอาด, บันทึกป้องกันกำจัดแมลง as **audit-day records** — precisely the substance of this step.
5. **Licence-law basis (ภท.11/ภท.12 under พ.ร.บ. คุ้มครองและส่งเสริมภูมิปัญญาการแพทย์แผนไทย พ.ศ. 2542)?** Those are possession/sale licence forms; nothing in the repo shows them asking a harvest/drying questionnaire, and facts.md:56 wants the *licence itself* as a checklist document — unrelated to this step.
6. **Backend requires it?** `apps/backend/validation/canonical-application-validator.js:389-392` makes `harvest_method`/`drying_method` (and `storage_system`, :175-180) required at submit — but that is the platform mirroring its own wizard, not a DTAM/legal basis. It is downstream debt to unwind when the step moves (also `validateHarvestForm`, `quality-control-utils.ts:34-43`, forces harvestMethod/dryingMethod/storageSystem/packagingType in the UI).
7. **GENERATE angle?** กทล.1 has no harvest fields to fill (point 1), so this data feeds no generated form; A8 SOP is the applicant's own document per กทล.1, not a platform-generated one. No GENERATE basis.

## Full census of the challenged surface

Step rail entries (two surfaces of the same section):

| file:line | UI shows (TH) | verdict | citation |
|---|---|---|---|
| `apps/web-app/src/app/health/applications/new/_steps/steps/plant-selection-config.ts:309-315` | ขั้น "เก็บเกี่ยวและคุณภาพ — วิธีเก็บเกี่ยว อบแห้ง บ่ม จัดเก็บ บรรจุ มาตรการ GACP" | MOVE_TO_AUDIT | facts.md §3 ข้อ 1-2 (facts.md:60-61) |
| `apps/web-app/src/app/health/applications/new/_steps/application-flow-config.ts:107-113` | ขั้น "เก็บเกี่ยวและคุณภาพ" (isRequired: true) | MOVE_TO_AUDIT | same |

Fields the step renders (`quality-control-step.tsx`, options in `quality-control-config.ts`):

| file:line | UI shows (TH) | verdict | citation |
|---|---|---|---|
| quality-control-step.tsx:84-97 | สรุป 3 ช่อง (เก็บเกี่ยว/จัดเก็บ/มาตรการ GACP กี่ข้อ) — display only | MOVE_TO_AUDIT (inherits) | facts.md:60-61 |
| quality-control-step.tsx:113-124 + config:33-36 | วิธีเก็บเกี่ยว: เก็บด้วยมือ / เก็บด้วยเครื่องจักร (บังคับ, utils:35) | MOVE_TO_AUDIT | facts.md §3 ข้อ 1 (บันทึกกิจกรรมแปลงปลูก), facts.md:60 |
| quality-control-step.tsx:127-133 + config:38-42 | ระยะความสุก: ต้น/เต็มที่/ปลาย | MOVE_TO_AUDIT | facts.md:60 |
| quality-control-step.tsx:134-140 + config:44-47 | การตัดแต่ง: สด/แห้ง | MOVE_TO_AUDIT | facts.md:60 |
| quality-control-step.tsx:151-159 + config:49-57 | วิธีทำแห้ง 7 ตัวเลือก (บังคับ, utils:36) | MOVE_TO_AUDIT | facts.md §3 ข้อ 2 (บันทึกการแปรรูป/บรรจุ), facts.md:61 |
| quality-control-step.tsx:160-167 + config:59-63 | การหมุนเวียนอากาศ: ธรรมชาติ/พัดลม/HVAC | MOVE_TO_AUDIT | facts.md:61 |
| quality-control-step.tsx:171-191 | จำนวนวันตาก · อุณหภูมิ · ความชื้น (อบแห้ง) — 3 inputs | MOVE_TO_AUDIT | facts.md:61 |
| quality-control-step.tsx:194-198 | checkbox ห้องมืด (dryingDarkRoom) | MOVE_TO_AUDIT | facts.md:61 |
| quality-control-step.tsx:200-204 | checkbox มีกระบวนการบ่ม (hasCuringProcess) | MOVE_TO_AUDIT | facts.md:61 |
| quality-control-step.tsx:206-250 + config:71-83 (conditional: hasCuringProcess) | ระยะเวลา/อุณหภูมิ/ความชื้นการบ่ม · ภาชนะบ่ม 5 ตัวเลือก · ความถี่เปิดระบาย 3 ตัวเลือก | MOVE_TO_AUDIT | facts.md:61 |
| quality-control-step.tsx:252-261 + config:65-69 | ระบบจัดเก็บ: ควบคุมอุณหภูมิ/ปกติ/ไซโล (บังคับ, utils:37) | MOVE_TO_AUDIT | facts.md §3 ข้อ 2 (สต็อกวัตถุดิบ/ผลิตภัณฑ์), facts.md:61 |
| quality-control-step.tsx:262-270 (conditional: CONTROLLED) | รายละเอียดควบคุมอุณหภูมิ | MOVE_TO_AUDIT | facts.md:61 |
| quality-control-step.tsx:273-278 | ความชื้นห้องจัดเก็บ | MOVE_TO_AUDIT | facts.md:61 |
| quality-control-step.tsx:280-291 + config:85-91 | บรรจุภัณฑ์ 5 ตัวเลือก (บังคับ, utils:38) | MOVE_TO_AUDIT | facts.md §3 ข้อ 2 (บันทึกการแปรรูป/บรรจุ), facts.md:61 |
| quality-control-step.tsx:293-301 (conditional: OTHER) | ระบุบรรจุภัณฑ์อื่น (บังคับเมื่อ OTHER, utils:39-41) | MOVE_TO_AUDIT | facts.md:61 |
| quality-control-step.tsx:315-333 + config:94 | checkbox "มีขั้นตอนปฏิบัติงานมาตรฐาน (SOPs)" | CUT | ซ้ำกับ A8 (SOP เป็นเอกสารแนบวันยื่นในขั้น documents — facts.md:43; slot `document-slots.js:184-189`); checkbox self-declare ไม่ใช่ช่องใน กทล.1 |
| config:95 | checkbox "มีบันทึกคุณภาพเป็นลายลักษณ์อักษร" | MOVE_TO_AUDIT | facts.md §3 ข้อ 1-2 (บันทึกทั้งหมดตรวจ ณ แปลง), facts.md:60-61 |
| config:96 | checkbox "มีมาตรการป้องกันการปนเปื้อน" | MOVE_TO_AUDIT | facts.md:61 (บันทึกทำความสะอาด/ป้องกันปนเปื้อน = วันตรวจ) |
| config:97 | checkbox "มีแผนจัดการศัตรูพืชแบบผสมผสาน (IPM)" | MOVE_TO_AUDIT | facts.md:61 (บันทึกป้องกันกำจัดแมลง/สัตว์ศัตรู) |
| config:98 | checkbox "มีระบบจัดการของเสีย" | CUT | ซ้ำกับ A6 (วิธีนำส่วนของกัญชาที่เหลือไปใช้ประโยชน์ = เอกสารแนบวันยื่น facts.md:41 ในขั้น documents); checkbox ไม่ใช่ช่องใน กทล.1 |
| config:99 | checkbox "มีระบบตามสอบย้อนกลับ" | MOVE_TO_AUDIT | มาตรฐานหมวด 14 ประเมิน ณ แปลง (official-gacp-requirements-dtam.md:39); ไม่มีช่องใน กทล.1 |
| config:102-118 | แถบ workflow 3 ขั้น (display only) | MOVE_TO_AUDIT (inherits) | facts.md:60-61 |

No upload surfaces in this step. The `dtamRef: 'หมวด X'` badges (config:94-99) cite the audit standard, not the application form — consistent with MOVE_TO_AUDIT.

## Downstream debt if the section moves (for the coordinator, not part of the verdict)

- `apps/backend/validation/canonical-application-validator.js:175-180, 389-392` (step-7 required fields)
- `apps/web-app/.../quality-control-utils.ts:34-43` (UI validation)
- review/preview surfaces reading `harvestData` (review-step-helpers*.ts, preview-utils.js)

## Conclusion

upheld = true. No named กทล.1 field, no ข้อกำหนด clause, and no other Thai-law basis found in the repo requires a harvest/drying/curing/storage/packaging questionnaire at application day for cannabis. The application-day slice of this topic (A5, A6, A7, A8) already lives in the documents step as uploads, exactly as the census note says. facts.md §3 ข้อ 1-2 names the step's substance as audit-day record evidence. MOVE_TO_AUDIT is the correct verdict.

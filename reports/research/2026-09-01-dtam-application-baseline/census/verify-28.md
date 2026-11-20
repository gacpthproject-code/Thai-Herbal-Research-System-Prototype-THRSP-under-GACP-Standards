# verify-28 — SKEPTIC check: behaviour fetch /plants + PLANT_CODE_ALIAS + cannabis-first prioritization

- Item: `{"name":"behaviour fetch /plants + PLANT_CODE_ALIAS + cannabis-first prioritization","kind":"behaviour","file":".../plant-selection-step.tsx","line":47,"verdict":"CUT","dtamRef":"ruling 5"}`
- Role: skeptic — tried to REFUTE the CUT
- Result: **UPHELD — CUT stands**
- Date: 2026-09-01

## 1. What the behaviour actually is (read in session)

- `apps/web-app/src/app/health/applications/new/_steps/steps/plant-selection-step.tsx:47-86` — on mount, `api.get('/plants')`, normalize each row through `toPlantCode`, merge with `FALLBACK_PLANTS`, else fall back to the hardcoded 6.
- `plant-selection-step.tsx:213-231` — `prioritizedPlantOptions`: find cannabis (by code `'cannabis'`, or name containing กัญชา/cannabis), return `{featured:[cannabis], hidden:[the other 5]}`.
- `plant-selection-config.ts:262-271` — `PLANT_CODE_ALIAS`: cannabis, kratom, turmeric, ginger, plai, black_galangal (+ black_galingale/bsd aliases).
- `plant-selection-config.ts:345-351` — `toPlantCode`: lowercase + alias lookup, null → row dropped.
- `plant-selection-config.ts:87-142` — `FALLBACK_PLANTS`: 6 plants, only cannabis `enabled:true`.

The entire behaviour exists to service a multi-plant picker: load a catalogue, reconcile foreign codes, and sort cannabis to the front of a list of six.

## 2. Refutation attempts (all failed)

**(a) Does any กทล.1 field ask "which plant"?** No. facts.md §1 (ส่วนที่ ๑, ๒, ๔) has no plant-species field anywhere. The form itself is cannabis-scoped by its own title — facts.md:4 "แบบลงทะเบียนยื่นคำขอ … ของพืชกัญชา 'แบบกัญชา กทล 1'". The only variety-ish field is ส่วนที่ ๒ ข้อ ๓ (พันธุ์และส่วนของกัญชาที่ใช้ — facts.md:25), which is variety *within* cannabis and belongs to the cultivation step, not a species catalogue.

**(b) Future-proofing for other herbs?** Explicitly foreclosed by ruling 5 (facts.md:71): เปิดบริการกัญชาอย่างเดียว — พืชอื่นภายหลังเป็นชุด field/กติกาใหม่ **ไม่ reuse ของกัญชา**. The strongest possible defense of this behaviour ("keep the list for when kratom arrives") is the exact thing the operator ruled out. Ruling 2 (facts.md:68) then cuts anything exceeding DTAM's ask.

**(c) Any OTHER named Thai-law basis in the repo?** Searched docs/, apps/backend/constants-adjacent code, prisma seeds, routes:
- `docs/requirements/plant-document-comparison-matrix.md:4` cites พ.ร.บ. คุ้มครองและส่งเสริมภูมิปัญญาการแพทย์แผนไทย พ.ศ. 2542 above a 6-plant document matrix — but this is a platform-internal planning doc for a multi-plant offering, and it *contradicts* the baseline (e.g. it marks ผลตรวจดิน/น้ำ/ช่อดอก as บังคับ at application, while facts.md §3 บรรทัด 63 says lab results are NOT application-day documents). The 2542 Act is the basis of the ภท. controlled-herb permits (a separate census item about the licence upload slots) — it nowhere requires a plant-catalogue fetch or a cannabis-first sort at application time.
- `apps/backend/routes/api/cultivation/plants.js` (`GET /plants` → PlantController.getAllPlants) and `apps/backend/prisma/seed-plants.js` — plain catalogue, zero legal citation (grep for ประกาศ/พ.ร.บ/กฎกระทรวง/กทล: no matches).
- `apps/backend/routes/api/system/config.js:325-336` — a *second*, hardcoded 8-plant list (adds HEMP, ANDROGRAPHIS, ALOE_VERA, INDIAN_GOOSEBERRY; uses `PHLAI`), no citation.

**(d) Does the submit pipeline need the fetch?** No. `apps/backend/routes/api/applications/validation.js:100` and `:373` already default `plantType = 'cannabis'` server-side. Cannabis-as-constant is how the backend behaves today; the client-side catalogue fetch is not load-bearing for the DTAM-required data.

**(e) Decay evidence (bonus, strengthens CUT):** the alias map does not even reconcile with the sibling backend list — `system/config.js` returns `PHLAI`, but `PLANT_CODE_ALIAS` only knows `plai`; `HEMP`/`ANDROGRAPHIS`/`ALOE_VERA`/`INDIAN_GOOSEBERRY` are unmapped and silently dropped; `GINGER`/`BLACK_GALANGAL` are never served by that route. This is dead multi-plant scaffolding, not a mirror of any ministry system.

## 3. Census of every surface in the assigned files (completeness duty)

| Surface | file:line | UI shows (TH) | Verdict | Citation |
|---|---|---|---|---|
| fetch /plants + normalize + fallback | plant-selection-step.tsx:47-86 | (โหลดรายชื่อพืชจาก API, fallback 6 ชนิด) | **CUT** (this item) | ruling 5 (facts.md:71) + ruling 2 (facts.md:68); no กทล.1 field |
| cannabis-first prioritization | plant-selection-step.tsx:213-231 | (จัดกัญชาขึ้นก่อน ซ่อนที่เหลือ) | **CUT** (this item) | same; sorting a list that must not exist |
| PLANT_CODE_ALIAS + toPlantCode | plant-selection-config.ts:262-271, 345-351 | — (helper) | **CUT** (this item) | dies with the fetch; aliases 5 non-cannabis herbs |
| FALLBACK_PLANTS (6 ชนิด) | plant-selection-config.ts:87-142 | กัญชา · กระท่อม · ขมิ้นชัน · ขิง · ไพล · กระชายดำ | **CUT** — plant = ค่าคงที่ "กัญชา" ของระบบ | ruling 5 (facts.md:71); backend already constant (validation.js:100) |
| plant picker cards (featured/hidden) | plant-selection-step.tsx:236-241 via PlantSelectionConfigPanels | เลือกพืช | **CUT** (sibling item — "ตายตาม picker" confirmed) | ruling 5; กทล.1 has no species field |
| service type NEW | plant-selection-config.ts:151-157 | ขอรับรองใหม่ | KEEP | กทล.1 หัวฟอร์ม ประเภทคำขอ "รายใหม่" (facts.md:18) |
| service type RENEWAL | plant-selection-config.ts:158-164 | ต่ออายุใบรับรอง | KEEP (ต่ออายุไม่กรอกส่วนที่ ๑-๒ + แนบชุด ต่ออายุ) | facts.md:18, :52 |
| service type MODIFY | plant-selection-config.ts:165-171 | แก้ไขรายละเอียดใบรับรอง | REWORD → กทล.1 มี "ใบแทน" ไม่มี "แก้ไข"; การเปลี่ยนพื้นที่/พันธุ์/ส่วน = ยื่นคำขอใหม่ | facts.md:18 (ใบแทน), :28 ส่วนที่ ๔ (๓) |
| purpose COMMERCIAL | plant-selection-config.ts:208-215 | เพื่อการพาณิชย์ในประเทศ | REWORD → ฟอร์มมีแค่ ☐ เพื่อใช้ทางการแพทย์ ☐ เพื่อการส่งออก | กทล.1 ส่วนที่ ๒ วัตถุประสงค์ (facts.md:21) |
| purpose EXPORT | plant-selection-config.ts:216-223 | เพื่อการส่งออก | KEEP | ส่วนที่ ๒ วัตถุประสงค์ ☐ เพื่อการส่งออก (facts.md:21) |
| purpose RESEARCH | plant-selection-config.ts:224-231 | เพื่อการวิจัย | CUT — ไม่มีในวัตถุประสงค์ของฟอร์ม | facts.md:21 (มีเพียง 2 ช่อง) |
| upload slot ภท.11 | plant-selection-config.ts:181-188 | ภท.11 (คำขออนุญาตสมุนไพรควบคุม) — บังคับทุกวัตถุประสงค์ | REWORD + CONDITIONAL — จนท. checklist ขอ *ตัวใบอนุญาต* ไม่ใช่แบบคำขอ ภท. และเฉพาะกรณีต้องได้รับอนุญาตตามกฎหมาย | facts.md:56 + UNVERIFIED note facts.md:75 |
| upload slot ภท.09 | plant-selection-config.ts:189-196 | ภท.09 (คำขออนุญาตเพาะปลูก) | REWORD + CONDITIONAL — เดียวกัน | facts.md:56, :75 |
| upload slot ภท.10 | plant-selection-config.ts:197-204 | ภท.10 (คำขออนุญาตจำหน่าย/ส่งออก) | REWORD + CONDITIONAL — เดียวกัน | facts.md:56, :75 |
| cultivation methods multi-select | plant-selection-config.ts:234-256 | กลางแจ้ง · โรงเรือน · อาคารควบคุม | REWORD — ตรง ส่วนที่ ๒ "ลักษณะพื้นที่" แต่ขาดช่อง "อื่น ๆ ระบุ" | facts.md:22 |
| fee estimate (methods × 30,000) | plant-selection-step.tsx:139-140, config.ts:285 | ค่าธรรมเนียมโดยประมาณ | OPTIONAL — ไม่ใช่ช่อง กทล.1; เป็นจอแสดงราคาแพลตฟอร์ม ห้ามนับเป็นเงื่อนไขบังคับ | ruling 1 (facts.md:67); fee rules govern separately |
| gate `isReady` requires plant+service+purpose+method+docs | plant-selection-step.tsx:142-148 | ปุ่ม "บันทึกและไปขั้นตอนถัดไป" disabled | follows its inputs — re-derive after cuts | ruling 1-2 |

(Rows other than the three assigned CUT rows are cross-checks for sibling census items; verdicts there carry citations so the coordinator can reconcile, not to override those items' own verifiers.)

## 4. Verdict

**upheld = true. CUT is correct** (dtamRef ruling 5, facts.md:71; reinforced by ruling 2, facts.md:68). No named Thai-law or ministry-system basis found anywhere in the repo that requires fetching a plant catalogue, alias-mapping five non-cannabis herbs, or cannabis-first sorting at application time. The one legal citation near a multi-plant list (พ.ร.บ. ภูมิปัญญาการแพทย์แผนไทย พ.ศ. 2542 in plant-document-comparison-matrix.md:4) grounds the ภท. permit slots, not a species picker, and that doc is a superseded internal plan that contradicts facts.md §3. The plant identity survives as a system constant ("กัญชา" — already the backend default, validation.js:100), carried into the GENERATEd กทล.1; no UI behaviour is needed for it.

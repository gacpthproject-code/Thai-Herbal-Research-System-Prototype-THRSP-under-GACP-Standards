# verify-31 — SKEPTIC check: upload slot M1_PT10 «ภท.10 (คำขออนุญาตจำหน่าย/ส่งออก)» — 2026-09-01

Item under challenge (census proposal): **CUT** — `apps/web-app/src/app/health/applications/new/_steps/steps/plant-selection-config.ts:197-204`, note "เดียวกับ ภท.09 — ยุบเข้าช่องใบอนุญาตเดียว (conditional)".

## Verdict: **UPHELD — CUT stands**

Tried to refute; could not. Every possible basis fails:

1. **กทล.1 ส่วนที่ ๓ has no ภท. row at all** — facts.md:30-53 lists A1-A8, per-type qualification docs, renewal, replacement. No ภท.09/10/11 anywhere. Ruling 1 (facts.md:67): required set = กทล.1 ส่วนที่ ๓ exactly, no platform extras.
2. **The officer checklist wants the licence, not the request form** — facts.md:56: "ใบอนุญาต/หนังสือสำคัญ กรณีการปลูก/แปรรูปกัญชาที่ต้องได้รับอนุญาตตามกฎหมายที่เกี่ยวข้อง (คือ*ตัวใบอนุญาต* ไม่ใช่แบบคำขอ ภท.)". This slot uploads the *แบบคำขอ* (request form), and it is scoped to จำหน่าย/ส่งออก — the checklist row is scoped to ปลูก/แปรรูป. Two mismatches: wrong document class AND wrong activity.
3. **Repo-wide search found no named Thai-law basis** binding ภท.10 to application day:
   - `docs/requirements/gacp-document-requirements-research.md` cites พ.ร.บ.คุ้มครองและส่งเสริมภูมิปัญญาการแพทย์แผนไทย พ.ศ. 2542 ม.44-46 + ประกาศ สธ. เรื่อง สมุนไพรควบคุม (กัญชา) พ.ศ. 2565 — but names **ภ.ท.12** (lines 31, 253) as the cannabis sale/processing request form, never ภ.ท.10; and it describes a *separate licensing process* (a cover-letter file submitted to the licensing authority), not a GACP application attachment.
   - `docs/requirements/official-gacp-requirements-dtam.md:88-89` names ภ.ท.11/ภ.ท.12 (no ภ.ท.10), with no legal citation tying either to the GACP filing.
   - `apps/backend/prisma/seed-plants.js:32` offers licence-type options 'BhT 11', 'BhT 13', 'BhT 16' — no BhT 10, no cited law. No M1_PT10 constant exists in backend/prisma beyond a spelling test for M1_PT11 (`apps/backend/__tests__/unit/upload-slot-canonicalisation.test.js:56`).
   - `docs/architecture/2026-04-28-document-template-review.md:145`: ภ.ท.10 = export permit issued via herbctrl.dtam.moph.go.th, platform marked it STUB and does NOT generate it — a design note, not a legal requirement to attach at filing.
   - The repo's own form numbering is incoherent (ภ.ท.10 vs ภ.ท.11 vs ภ.ท.12 vs BhT 11/13/16 for overlapping purposes) — nothing here rises above vibes; nothing citable.
4. **Even the licence itself cannot be required:true today** — facts.md:75: the governing cannabis-licence instrument is UNVERIFIED; operator note says confirm the ฉบับ before seeding the "ใบอนุญาตตามกฎหมายที่เกี่ยวข้อง" rule. So the strongest defensible surface is the **conditional licence slot** — which already exists elsewhere in the census (step-8 `LICENSE_PT10`: census/documents.md:71 CONDITIONAL export-only; census/officer.md:109 CONDITIONAL). The merge note on this item points there. Keeping this step-2 request-form slot too would leave a duplicate surface with no basis.
5. **The slot's own conditionality is fake** — all three PURPOSE_OPTIONS (COMMERCIAL, EXPORT, RESEARCH) share the same `M1_DOCUMENT_SET` (plant-selection-config.ts:207-232 + dedupe comment :174-179), so a domestic-only or research-only grower is forced to upload a sale/export permit request form. Exactly the over-demand Ruling 2 (facts.md:68) orders cut; already flagged in `reports/design-cleanup-2026-08-21/04-WIZARD-VS-DTAM.md:47`.

Considered REWORD/CONDITIONAL (as verify-28 argued): rejected. REWORD keeps the slot with corrected semantics — but the corrected semantics (export licence, conditional) are already carried by the step-8 LICENSE_PT10 slot; two slots for one document is itself a platform extra. CUT + merge note is the coherent resolution.

## Census of every surface in plant-selection-config.ts

| # | Surface | file:line | UI currently shows (TH) | Verdict | Citation |
|---|---|---|---|---|---|
| 1 | plant option cannabis (enabled) | plant-selection-config.ts:88-96 | กัญชา | KEEP | Ruling 5 — cannabis only (facts.md:71) |
| 2 | plant options kratom/turmeric/ginger/plai/black_galangal (enabled:false) | :97-142 | กระท่อม·ขมิ้นชัน·ขิง·ไพล·กระชายดำ | KEEP (as disabled placeholders — must stay disabled) | Ruling 5: other plants = new rule set later (facts.md:71) |
| 3 | service option NEW | :151-157 | ขอรับรองใหม่ | KEEP | กทล.1 header ประเภทคำขอ รายใหม่ (facts.md:18) |
| 4 | service option RENEWAL | :158-164 | ต่ออายุใบรับรอง | KEEP | กทล.1 header ต่ออายุ (facts.md:18, :52) |
| 5 | service option MODIFY | :165-171 | แก้ไขรายละเอียดใบรับรอง | REWORD | กทล.1 header has รายใหม่/ต่ออายุ/ใบแทน only; changes to พื้นที่/เมล็ดพันธุ์/ส่วนที่ใช้ = ยื่นคำขอใหม่ per ส่วนที่ ๔ (๓) (facts.md:18, :28) — semantics must map to ใบแทน or คำขอใหม่, not a free-form amendment (other verifier's item; recorded here for completeness) |
| 6 | upload slot M1_PT11 ภท.11 (required:true, all purposes) | :182-188 | ภท.11 (คำขออนุญาตสมุนไพรควบคุม) | CUT (same reasoning as item under challenge) | facts.md:30-53 no ภท. row; facts.md:56 "ไม่ใช่แบบคำขอ ภท." (other verifier's item) |
| 7 | upload slot M1_PT09 ภท.09 (required:true, all purposes) | :190-196 | ภท.09 (คำขออนุญาตเพาะปลูก) | CUT — merged into single conditional licence slot | same rows; note under ประกาศ สธ. regime the licence covers ศึกษาวิจัย/ส่งออก/จำหน่าย/แปรรูปเพื่อการค้า — no repo-citable planting-permit form either (other verifier's item) |
| 8 | **upload slot M1_PT10 ภท.10 (required:true, all purposes) — ITEM UNDER CHALLENGE** | **:197-204** | **ภท.10 (คำขออนุญาตจำหน่าย/ส่งออก) — แบบคำขออนุญาตจำหน่ายหรือส่งออกสมุนไพรควบคุม** | **CUT — UPHELD** | facts.md:30-53 (no ภท. in ส่วนที่ ๓) + facts.md:56 (licence not request form; ปลูก/แปรรูป not จำหน่าย/ส่งออก) + facts.md:75 (licence law UNVERIFIED) + Rulings 1-2 (facts.md:67-68); surviving substance = step-8 LICENSE_PT10 CONDITIONAL(EXPORT) per census/documents.md:71, census/officer.md:109 |
| 9 | purpose option COMMERCIAL | :208-215 | เพื่อการพาณิชย์ในประเทศ | REWORD | กทล.1 ส่วนที่ ๒ purposes are exactly ☐ เพื่อใช้ทางการแพทย์ ☐ เพื่อการส่งออก (facts.md:21) — no "พาณิชย์ในประเทศ" checkbox exists (other verifier's item) |
| 10 | purpose option EXPORT | :216-223 | เพื่อการส่งออก | KEEP | ส่วนที่ ๒ ☐ เพื่อการส่งออก (facts.md:21) |
| 11 | purpose option RESEARCH | :224-231 | เพื่อการวิจัย | REWORD/CUT per its own verifier | not a ส่วนที่ ๒ checkbox (facts.md:21) |
| 12 | cultivation option outdoor | :235-241 | กลางแจ้ง | KEEP | ส่วนที่ ๒ ลักษณะพื้นที่ ☐ กลางแจ้ง (facts.md:22) |
| 13 | cultivation option greenhouse | :242-248 | โรงเรือน | KEEP | ☐ โรงเรือนทั่วไป (Greenhouse) (facts.md:22) |
| 14 | cultivation option indoor | :249-255 | อาคารควบคุม | KEEP | ☐ อาคาร/โรงเรือนระบบปิด (Indoor) (facts.md:22); note form also has ☐ อื่น ๆ ระบุ — missing option is its own verifier's item |
| 15 | APPLICATION_FLOW_STEPS labels (7 steps) | :287-337 | กำหนดข้อมูลคำขอ … ชำระค่าธรรมเนียม | navigation labels, not data fields — no verdict; step 5 copy "อัปโหลดเอกสาร M1" must change when M1 slots are cut | — |
| 16 | PURPOSE_DOCUMENT_SET / PLANT_CODE_ALIAS / CULTIVATION_FEE_PER_METHOD / helpers | :258-371 | (no UI surface — plumbing) | — | fee re-export governed elsewhere (constants/fees.ts) |

No conditional render branch hides slot 8: `M1_DOCUMENT_SET` is shared by all three purposes and dedupe guarantees the 3 slots render whenever any purpose is selected (:174-179, :207-232) — so the CUT removes it for every applicant type, plant, and area type alike.

## Cross-references
- Sibling rows on the same slot: census/plant.md:42 (CUT), census/verify-26.md:33 (CUT), census/verify-28.md:50 (argued REWORD+CONDITIONAL — answered in point 5 above), census/backend-slots.md:45 + :135 (backend request-form demand and export warning both CUT), census/upload-plumbing.md:32,:56 (plumbing map M1_PT10→LICENSE_PT10).
- The one legitimate ภท.10 surface (the licence itself, export-only, conditional, law-version pending facts.md:75) lives at documents-step-config / LICENSE_PT10 and is already CONDITIONAL in census/documents.md:71 and census/officer.md:109.

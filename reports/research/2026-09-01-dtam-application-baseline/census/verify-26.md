# verify-26 — skeptic check: option พืช "กัญชา" (การ์ดเด่น เลือกได้ตัวเดียว) — 2026-09-01

Item under challenge (census plant.md row 2):
- File: apps/web-app/src/app/health/applications/new/_steps/steps/plant-selection-config.ts:88-96 (`FALLBACK_PLANTS[0]`, code `cannabis`)
- Render: plant-selection-config-panels.tsx:96-155 — selectable card grid under "1) เลือกพืชหลัก", cannabis card shows "กัญชา / Cannabis" + badge "พร้อมยื่น"; it is the only enabled card (the other 5 are disabled, "ยังไม่เปิดรับ")
- Proposed verdict: **CUT** — ruling 5 (facts.md:7,71), "scope คงที่ ไม่ใช่ตัวเลือก"

## Refutation attempts (each must be a NAMED basis, not vibes)

1. **กทล.1 itself asks for the plant?** — NO. The form is plant-specific by title: "แบบลงทะเบียนยื่นคำขอใบรับรองแหล่งผลิต (ปลูก) เก็บเกี่ยวที่ดีและแปรรูปของ**พืชกัญชา**" (facts.md:4). ส่วนที่ ๒ enumerated in full (facts.md:20-25, "ทั้งหมดที่ฟอร์มขอ ไม่มีมากกว่านี้") has no "เลือกชนิดพืช" field. The closest field is ส่วนที่ ๒ ข้อ ๓ "พันธุ์และส่วนของกัญชาที่ใช้" (facts.md:25) — variety and plant part *within cannabis*, already covered by the cultivation step, not a species chooser.
2. **ข้อกำหนด conditions require it?** — NO. facts.md §3 (rows 59-64) is audit-day/record-keeping material; nothing there mentions species selection at application time.
3. **docs/requirements/official-gacp-requirements-dtam.md** — searched for ชนิดพืช / ระบุพืช / เลือกสมุนไพร / plant|herb selection: no match. No species-selection field is documented.
4. **docs/requirements/plant-document-comparison-matrix.md** — this is the 6-plant matrix the fallback list mirrors. It cites only พ.ร.บ.คุ้มครองและส่งเสริมภูมิปัญญาการแพทย์แผนไทย พ.ศ. 2542 *generically* (line 4), names no กฎกระทรวง/ประกาศ that requires a plant chooser on a GACP application, is dated 10 ธ.ค. 2568 (pre-baseline platform research), and is contradicted by the baseline on its own rows (e.g. ผลตรวจดิน/น้ำ/ช่อดอก marked ✅ required for cannabis at lines 36-38, while facts.md:63 says lab results are **not** application-day documents). It cannot outrank facts.md and does not name a legal obligation to *choose* a plant.
5. **ภท.09/10/11 permit family (พ.ร.บ. 2542 / ประกาศ สมุนไพรควบคุม)** — governs the *licence* the จนท. checklist asks to see (facts.md:56, ตัวใบอนุญาต ไม่ใช่แบบคำขอ ภท.). Those instruments fix cannabis as the controlled herb; they impose no plant-selection field on the GACP application. If anything they reinforce that the plant is a premise, not an answer.
6. **apps/backend/constants** — grep for plantId/plant_id/PLANT: no hit. No backend legal-basis constant ties a plant enum to a named law.
7. **DTAM e-service has a plant dropdown?** — UNVERIFIABLE (facts.md:75: domain unreachable during research). Per mandate, a guess is not a basis.

## Conclusion on item 26

No DTAM basis and no other named Thai-law basis found in the repo for offering กัญชา as a *selectable option* at application time. Under ruling 5 (facts.md:7,71) cannabis is the entire service scope — a single selectable card among 5 disabled ones is a choice with exactly one legal answer, i.e. not a field the กทล.1 asks and not information the system lacks. The system should hold plant=cannabis as a constant (the กทล.1 it generates is the cannabis form by construction). GENERATE does not apply (that verdict is for documents produced from wizard data); REWORD does not apply (no correct semantics exist for a one-answer chooser). **CUT is the correct verdict. UPHELD.**

## Census of every surface defined in plant-selection-config.ts (completeness per mandate; deep check above is item 26)

| Surface | file:line | UI shows (TH) | Verdict | Citation |
|---|---|---|---|---|
| option กัญชา (this item) | plant-selection-config.ts:88-96 (render panels:96-155) | "กัญชา / Cannabis" + "พร้อมยื่น" | **CUT — upheld** | ruling 5 (facts.md:7,71); no named field in กทล.1 ส่วนที่ ๒ (facts.md:20-25) |
| options กระท่อม·ขมิ้นชัน·ขิง·ไพล·กระชายดำ (disabled) | plant-selection-config.ts:97-142 (render panels:158-235) | "ตัวเลือกพืชอื่น" + 5 การ์ด "ยังไม่เปิดรับ" | CUT | ruling 5 (facts.md:71): พืชอื่น = ชุดกติกาใหม่ภายหลัง ไม่ reuse |
| option NEW | plant-selection-config.ts:151-157 | "ขอรับรองใหม่" | KEEP | กทล.1 หัวฟอร์ม "รายใหม่" (facts.md:18); missing กรม sub-split ปลูก+เก็บเกี่ยว / แปรรูป |
| option RENEWAL | plant-selection-config.ts:158-164 | "ต่ออายุใบรับรอง" | KEEP | กทล.1 หัวฟอร์ม "ต่ออายุ" (facts.md:18,52) |
| option MODIFY | plant-selection-config.ts:165-171 | "แก้ไขรายละเอียดใบรับรอง" | REWORD | กทล.1 third type is ใบแทน (facts.md:18,53); ส่วนที่ ๔ (๓) makes area/seed/part changes a new application (facts.md:28) |
| upload-slot ภท.11 (M1_PT11, required) | plant-selection-config.ts:180-188 | "ภท.11 (คำขออนุญาตสมุนไพรควบคุม)" | CUT/merge into licence slot | facts.md:30-53 lists no ภท. attachment; facts.md:56 wants ตัวใบอนุญาต ไม่ใช่แบบคำขอ ภท. |
| upload-slot ภท.09 (M1_PT09, required) | plant-selection-config.ts:189-196 | "ภท.09 (คำขออนุญาตเพาะปลูก)" | CUT | same as above |
| upload-slot ภท.10 (M1_PT10, required) | plant-selection-config.ts:197-204 | "ภท.10 (คำขออนุญาตจำหน่าย/ส่งออก)" | CUT | same as above |
| option COMMERCIAL | plant-selection-config.ts:208-215 | "เพื่อการพาณิชย์ในประเทศ" | REWORD | กทล.1 ส่วนที่ ๒ first box is "เพื่อใช้ทางการแพทย์" (facts.md:21) |
| option EXPORT | plant-selection-config.ts:217-223 | "เพื่อการส่งออก" | KEEP | กทล.1 ส่วนที่ ๒ (facts.md:21) |
| option RESEARCH | plant-selection-config.ts:224-231 | "เพื่อการวิจัย" | CUT | ส่วนที่ ๒ has exactly 2 boxes (facts.md:21); ruling 2 (facts.md:68) |
| option outdoor | plant-selection-config.ts:236-241 | "กลางแจ้ง" | KEEP | ส่วนที่ ๒ ลักษณะพื้นที่ ☐ กลางแจ้ง (facts.md:22); condition for A4′ (facts.md:39) |
| option greenhouse | plant-selection-config.ts:243-248 | "โรงเรือน" | KEEP | ☐ โรงเรือนทั่วไป (facts.md:22); condition for A4 (facts.md:38) |
| option indoor | plant-selection-config.ts:250-255 | "อาคารควบคุม" | REWORD | กรม wording "อาคาร/โรงเรือนระบบปิด (Indoor)" (facts.md:22); condition for A4 |
| fee re-export CULTIVATION_FEE_PER_METHOD | plant-selection-config.ts:285 | (fee estimate in step footer) | out of area scope | money path — L3/Tier C; not a DTAM application field |
| APPLICATION_FLOW_STEPS labels | plant-selection-config.ts:287-337 | 7 step labels | descriptive nav, no field of its own | step 1 description "เลือกพืช..." must drop the plant-selection wording when row 1-4 are cut |
| helpers toPlantCode / PLANT_CODE_ALIAS / buildPurposeDocumentState | plant-selection-config.ts:262-271, 345-371 | (no UI) | CUT with their surfaces | plumbing of the cut picker and ภท. slots (plant.md rows 4, 19) |

These neighbor verdicts agree with census plant.md rows 3-24; none of them, nor any repo document, supplies a basis that would flip item 26.

Verdict: **upheld=true, CUT** — ruling 5 (facts.md:7,71); no กทล.1 field (facts.md:20-25) and no other named Thai-law basis in the repo.

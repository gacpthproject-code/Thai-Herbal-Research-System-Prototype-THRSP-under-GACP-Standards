# verify-39 — skeptic check: hasCCTV (state default), farm-info-step.tsx:80 — 2026-09-01

Role: SKEPTIC defending the farmer's application from an over-eager cut.
Item under challenge (census farm.md item 6):

| field | value |
|---|---|
| name | hasCCTV (state default) |
| kind | field |
| file:line | apps/web-app/src/app/health/applications/new/_steps/steps/farm-info-step.tsx:80 |
| currentTh | (ไม่มี UI ในสเต็ปนี้) — state default `hasCCTV: false`, ไม่มี checkbox ให้กด |
| proposed verdict | CUT (dtamRef A6) |

## Verdict: **UPHELD — CUT stands** (citation: facts.md §2 A6 + §4 ruling 1-2)

## 1. What the code actually is (re-read this session)

- `farm-info-step.tsx:80` — `hasCCTV: false` appears only in the initial `useState` default of `formData`. Grep over the whole `_steps` tree finds **no render site**: the only other hits are the type declaration (`use-wizard-state.ts:93 hasCCTV?: boolean`) and the sibling `securityChecks` passthrough (`farm-info-step.tsx:257` reads prior state, `:554` copies it back out). The step's UI (`FarmInfoFormSections` props, farm-info-step.tsx:640-678) passes no security-checkbox surface.
- Consequence: every submission through this wizard carries `hasCCTV: false` as a constant the farmer never saw or set. The earlier audit `reports/design-cleanup-2026-08-21/04-WIZARD-VS-DTAM.md:23` already documented that step 7's copy claims รั้ว/CCTV were "กรอกไว้ในขั้นตอนข้อมูลฟาร์มแล้ว" while step 5 has no such field (`th-wizard.ts:538-541`).

## 2. Refutation attempts and why each fails

### 2a. Does the กทล.1 form itself ask a CCTV question? — No.
facts.md §1 ส่วนที่ ๒ lists ทั้งหมดที่ฟอร์มขอ ("ไม่มีมากกว่านี้"): วัตถุประสงค์ · ลักษณะพื้นที่ · สถานที่ · ข้อมูลแปลง/เอกสารที่ดิน/ขนาด/พิกัด/ปริมาณการปลูก · พันธุ์. No security boolean of any kind. Security reaches DTAM only as attachment **A6: "มาตรการรักษาความปลอดภัย + วิธีนำส่วนของกัญชาที่เหลือไปใช้ประโยชน์" (ทุกราย)** — a DOCUMENT (facts.md §2, row A6). A checkbox neither satisfies A6 nor maps to any named form field.

### 2b. Repo docs that say "CCTV 24/7 บังคับ" — checked, not a legal basis.
- `docs/requirements/gacp-document-requirements-research.md:52,67,104,135` and `docs/requirements/plant-document-comparison-matrix.md:29,91` assert "CCTV 24/7 ✅ บังคับ (Medical Grade)" for cannabis. Their only cited authorities (research.md:4, :457-461) are พ.ร.บ. คุ้มครองและส่งเสริมภูมิปัญญาการแพทย์แผนไทย พ.ศ. 2542 (ม.44-46) and ประกาศกระทรวงสาธารณสุข เรื่อง สมุนไพรควบคุม (กัญชา) พ.ศ. 2565 — the **สมุนไพรควบคุม licence regime**, not the GACP กทล.1 application. Neither citation is pinned to an article that mandates CCTV; the table rows ("Medical Grade", "เก็บข้อมูล 90 วัน", "Biometric บังคับ", "ภ.ท.12", "BhT 11/13/16") carry no per-row citation at all. That is vibes-level research, not a named-law basis.
- Even taken at face value, the กทล.1 interface to that other regime is the officer checklist row (facts.md §2 ส่วน จนท. 1.1): the **licence document itself** ("ใบอนุญาต/หนังสือสำคัญ กรณี...ที่ต้องได้รับอนุญาตตามกฎหมายที่เกี่ยวข้อง") — not the licence's underlying security details re-asked as wizard booleans. And facts.md's closing note marks the applicable licence law as **UNVERIFIED** — an unverified law cannot anchor a KEEP.
- The same unsourced research is what got seeded into `apps/backend/prisma/seed-plants.js:22,164` ("CCTV Plan" required doc, "แผนผังกล้อง CCTV") and `apps/mobile-app/lib/core/strategies/cannabis_strategy.dart:59-60,92` (CCTV checkbox hard-required in `validateSecurity`). Circular: platform docs → platform seed → platform UI. No new authority appears anywhere in the chain.

### 2c. Earlier internal audit recommended ADDING a security checklist — superseded.
`reports/design-cleanup-2026-08-21/04-WIZARD-VS-DTAM.md:83,167` proposed "เพิ่มเป็นคำถามจริง: checklist รั้ว/ประตูล็อก/CCTV/... + SECURITY_PLAN บังคับ", citing กทล.1 ส่วนที่ ๓ (f). But ส่วนที่ ๓ (f) **is** A6 — a document attachment — and the operator's 2026-09-01 rulings (facts.md §4 ข้อ 1-2) now bind: required set = กทล.1 exactly, "หัวข้อ/ตัวเลือกใน wizard ที่เกินความต้องการ DTAM = ตัด". A structured checkbox inventory is a platform extra. The correct fix for the step-7 false claim is deleting the claim, not resurrecting the checkboxes.

### 2d. Could a softer verdict fit? — No.
- **OPTIONAL**: the field has no UI; there is nothing to label ไม่บังคับ. It is a dead key that silently submits `false` — worse than absent, because it fabricates an unasked answer ("ไม่มี CCTV") into the application record.
- **MOVE_TO_AUDIT**: facts.md §3 lists audit-day records (บันทึกกิจกรรม, สต็อก, บันทึกทำความสะอาด...); CCTV is not among them. Whether the farm's security measures are adequate is judged from the A6 document and the onsite visit, not from this boolean.
- **CONDITIONAL / GENERATE / REWORD**: no named case in กทล.1 turns a CCTV boolean on; GENERATE applies to the A6/กทล.1 documents themselves (separate census items), not to a dead default; there is no label to reword.

## 3. Conclusion

CUT is correct, for the census's stated reason and one more: A6 มาตรการรักษาความปลอดภัย is a required **document** (ทุกราย) and no กทล.1 field asks a CCTV question (facts.md §1-§2); no other named Thai-law basis exists in the repo — the "CCTV บังคับ" trail (docs/requirements → seed-plants.js → cannabis_strategy.dart) is unsourced platform research about a different (and itself UNVERIFIED) licence regime. Additionally the field as shipped is dead state that asserts `false` on the farmer's behalf. Cutting it removes fabricated data from the application; the farmer's real security story stays fully served by the A6 upload slot.

Upheld: **true** · Corrected verdict: **CUT** (unchanged) · Citation: facts.md §2 A6, §1 ส่วนที่ ๒, §4 ruling 1-2.

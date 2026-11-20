# verify-29 — SKEPTIC check: purpose option RESEARCH "เพื่อการวิจัย"

Item under challenge (census verdict CUT, dtamRef "กทล.1 ส่วนที่ ๒ มี 2 ช่องเท่านั้น (facts.md:20-21) + ruling 2"):
`apps/web-app/src/app/health/applications/new/_steps/steps/plant-selection-config.ts:224-231` —
`PURPOSE_OPTIONS` entry `id: 'RESEARCH'`, UI shows "เพื่อการวิจัย — ปลูกเพื่อการศึกษาและวิจัยภายใต้โครงการที่ได้รับอนุมัติ".

Role: refute the CUT if any named Thai-law or ministry-system basis requires a research purpose
at APPLICATION time for cannabis. Read-only census; no repo file touched except this report.

## 1. Surface census (the challenged item and its wiring)

| # | file:line | UI shows (Thai) | verdict | citation |
|---|---|---|---|---|
| 1 | plant-selection-config.ts:224-231 (`RESEARCH` in `PURPOSE_OPTIONS`) | เพื่อการวิจัย — ปลูกเพื่อการศึกษาและวิจัยภายใต้โครงการที่ได้รับอนุมัติ | **CUT** | กทล.1 ส่วนที่ ๒ วัตถุประสงค์ = ☐ เพื่อใช้ทางการแพทย์ ☐ เพื่อการส่งออก เท่านั้น (facts.md:21) + ruling 1 (facts.md:67) + ruling 2 (facts.md:68); refutation attempts in §3 all fail |

Wiring verified: `certificationPurposes` is a required multi-select — step-2 completeness
demands `length > 0` (use-application-flow-store.ts:202) and the chosen ids flow into the
submit payload (submit-step.tsx:126, review-step.tsx:233) and auto-save
(use-auto-save.ts:148,162). Documents-wise the option is inert: all three purposes share the
identical `M1_DOCUMENT_SET` (plant-selection-config.ts:174-205,214,222,230), so RESEARCH
changes no upload slot — it only produces a purpose value that no กทล.1 checkbox can receive.
(The sibling options COMMERCIAL:209 and EXPORT:217 are separate census rows, not re-judged here.)

## 2. What the DTAM baseline says (re-read in full)

- กทล.1 ส่วนที่ ๒ (facts.md:20-21): the purpose field is closed — exactly two checkboxes,
  ☐ เพื่อใช้ทางการแพทย์ ☐ เพื่อการส่งออก. "ทั้งหมดที่ฟอร์มขอ ไม่มีมากกว่านี้" (facts.md:20).
  There is no research checkbox and no "อื่น ๆ ระบุ" escape on this field (unlike ลักษณะพื้นที่, facts.md:22).
- Ruling 1 (facts.md:67): ยื่นตามกรมเป๊ะ — no platform extras in the required set.
- Ruling 2 (facts.md:68): wizard options exceeding DTAM needs = ตัด.
- A RESEARCH selection is data the generated กทล.1 cannot carry — under the GENERATE
  doctrine (wizard data must fill the real form) it maps to nothing.

## 3. Refutation attempts — all fail

1. **ม.๔๖ พ.ร.บ.คุ้มครองและส่งเสริมภูมิปัญญาการแพทย์แผนไทย พ.ศ. 2542 / ประกาศ สธ. สมุนไพรควบคุม (กัญชา)** —
   the strongest candidate: "ศึกษาวิจัย" IS a named licensed activity under ม.46
   (reports/planting-audit/QR-MODEL-DECISION.md:470; docs/requirements/gacp-document-requirements-research.md:4).
   But the same sourced row states **การปลูกไม่ใช่กิจกรรมที่ต้องขอใบอนุญาต** — ม.46 covers
   ศึกษาวิจัย/ส่งออก/จำหน่าย/แปรรูปเพื่อการค้า as activities licensed via the herb-control
   system, not a field of the GACP application. The repo's own slot metadata agrees: the
   ภ.ท.9 research-licence request is filed "ผ่านระบบ herbctrl.dtam.moph.go.th" — a different
   ministry system — with `canProceedWithout: true` "เนื่องจากยื่นผ่านระบบอื่น"
   (apps/backend/constants/document-slots.js:55-62,433-441). A licence obligation living in
   another system does not make a purpose selector required on this application.
2. **"The wizard needs RESEARCH to trigger the ภ.ท.9 slot"** — no longer true and never a legal
   basis. In the current wizard every purpose maps to the same 3 slots
   (plant-selection-config.ts:174-205), so RESEARCH gates nothing; and the sibling census
   already CUT `LICENSE_PT09` itself on the same facts (census/backend-slots.md:44). Where a
   licence is genuinely required by other law, กทล.1 handles it as the จนท.-checklist
   conditional "ใบอนุญาต/หนังสือสำคัญ กรณี...ที่ต้องได้รับอนุญาตตามกฎหมายที่เกี่ยวข้อง"
   (facts.md:56) — the *ตัวใบอนุญาต*, conditionally, via the surviving reworded licence slot
   (backend-slots.md:46) — not via a purpose option.
3. **Backend mirrors** — `CERTIFICATION_PURPOSES` incl. RESEARCH 🔬
   (apps/backend/constants/master-data-constants.js:63-67), journey-config research matrix
   rows with `researchProtocol`/`principalInvestigator` fields
   (apps/backend/data/journey-config-matrix.js:247-253) — the platform's own invented
   taxonomy citing no law; a platform constant cannot be its own legal basis (ruling 1).
4. **ภ.ท.30 รายงานศึกษาวิจัย** (apps/backend/routes/api/documents/report-submissions.js:87-89;
   permit-form/readme.md:24) — a post-licence *reporting* form under the herb-control regime
   (กฎกระทรวง พ.ศ. 2559 family), record-keeping after the fact, not an application-day field
   of the GACP form. At most MOVE_TO_AUDIT-shaped territory for the licence system — and it is
   not even this platform's form.
5. **Internal research docs** (docs/requirements/gacp-document-requirements-research.md:4 —
   ม.44-46; docs/requirements/official-gacp-requirements-dtam.md:6) — describe the herbctrl
   licence flow; neither names a research purpose as a กทล.1 application field.
6. **DTAM e-service might ask it** — facts.md:75 marks the e-service's own field list
   UNVERIFIED (domain unreachable during research). An unverifiable guess is not a citable
   basis by the rules of this census.
7. **"Useful for reviewer context"** — vibes; ruling 2 cuts it. OPTIONAL is also unavailable:
   the selector is a required gate (use-application-flow-store.ts:202), and an option whose
   value no form checkbox can receive counts for nothing while polluting the generated กทล.1.

## 4. Verdict

**UPHELD — CUT.** กทล.1 ส่วนที่ ๒ offers exactly two purposes (การแพทย์ / ส่งออก —
facts.md:21); no named Thai law or ministry-system requirement found anywhere in the repo makes
a "เพื่อการวิจัย" purpose an application-time field of the GACP คำขอ for cannabis. The research
angle that does exist in Thai law (ม.46 ศึกษาวิจัย licence) lives in the separate herbctrl
licence system, is already represented — conditionally, as the *issued licence* — by the จนท.
checklist item (facts.md:56) and the surviving reworded licence slot, and per
QR-MODEL-DECISION.md:470 does not attach to cultivation at all. Cutting RESEARCH also removes
its dead weight: the `'RESEARCH'` member of `CertificationPurpose` and the backend mirror
(master-data-constants.js:64) fall under their own census rows.

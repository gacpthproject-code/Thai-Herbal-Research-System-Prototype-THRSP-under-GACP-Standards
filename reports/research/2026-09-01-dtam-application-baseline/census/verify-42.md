# verify-42 — envChecks/securityChecks passthrough into farmData (SKEPTIC check)

Item under challenge:
- file: apps/web-app/src/app/health/applications/new/_steps/steps/farm-info-step.tsx:256 (also 257, 553-554)
- kind: behaviour — no UI; copies prior state into farmData on Next
- current Thai surface: ไม่มี UI ในเว็บ — QC step note อ้างว่า "ข้อมูลระบบรักษาความปลอดภัย (รั้ว, CCTV, Access Control) กรอกไว้ในขั้นตอน 'ข้อมูลฟาร์ม' แล้ว" (th-wizard.ts:540) ซึ่งไม่จริง
- proposed verdict: CUT (dtamRef A6)

## What the code actually does (verified this session)
- farm-info-step.tsx:256-257 — `const [envChecks] = useState(state.farmData?.environmentChecks || {})` and same for `securityChecks`: **no setter destructured, no JSX renders them**. Grep over the file finds only lines 256/257/553/554.
- farm-info-step.tsx:553-554 — passthrough into `setFarmData` on Next. Data can never change in the web wizard; for a fresh application it is always `{}`.
- `hasFence/hasCCTV/hasAccessControl/hasWarningSign` (a different, boolean set) appear in this file only as initial defaults, lines 79-82 — also never rendered as inputs.
- Types: domain-types.ts:204-205 (`environmentChecks?/securityChecks?: Record<string, boolean>`).
- Downstream consumers only display: application-document-view.tsx:277-280 (officer view lists the boolean flags), print/client-view.tsx, mobile app (cannabis_strategy.dart renders a checklist — mobile scope, not this census).
- th-wizard.ts:538-541 — QC step note claims the security data was filled in the farm-info step. It is not; the note is false for the web wizard.

## Refutation attempts (all searched this session)
1. **facts.md re-read in full.** กทล.1 ส่วนที่ ๒ (facts.md:20-25, "ไม่มีมากกว่านี้") has no security or environment checkbox fields. The only security-related requirement at application time is **A6** (facts.md:41): "มาตรการรักษาความปลอดภัย + วิธีนำส่วนของกัญชาที่เหลือไปใช้ประโยชน์" — an **attached document**, ทุกราย. The wizard already carries this as an upload slot: documents-step-config.tsx:280 `SECURITY_PLAN` ("แผนรักษาความปลอดภัยพื้นที่"). A6 coverage does not depend on these checkbox records; that slot is its own census item.
2. **จนท. checklist** (facts.md:56) asks for the ใบอนุญาต/หนังสือสำคัญ for licensable cannabis activity — the licence itself, not any security-inventory field.
3. **facts.md §3 (audit-day list, lines 59-64)** names purchase/activity/sales/cleaning/pest/complaint records — no fence/CCTV checkbox inventory. So MOVE_TO_AUDIT is not citable either: §3 does not name this item.
4. **Repo-wide search for another named Thai-law basis.**
   - apps/backend/prisma/seed-plants.js:21-26 — per-plant `securityRequirements` ("CCTV 24/7 (Medical Grade)", "รั้วแข็งแรง ≥2 เมตร", "Biometric/Key Card") — file header cites no law; this is the multi-plant platform layer (operator ruling 5: cannabis only, no reuse).
   - docs/requirements/gacp-document-requirements-research.md:4 cites พ.ร.บ. คุ้มครองและส่งเสริมภูมิปัญญาการแพทย์แผนไทย พ.ศ. 2542 ม.44-46 — that is the **สมุนไพรควบคุม licence (ภ.ท.) regime at another window**, not the กทล.1 GACP application. Its "CCTV 24/7 บังคับ" table (lines 67-71) cites no clause of any กฎกระทรวง/ประกาศ. Even under that regime the requirement is a written แผนการดำเนินงานและมาตรการรักษาความปลอดภัย (line 256) — a document, which maps back to A6/SECURITY_PLAN, not to a checkbox Record.
   - docs/requirements/official-gacp-requirements-dtam.md:103 lists มาตรการรักษาความปลอดภัย as attachment row 8 — same conclusion: document, not fields.
5. **Could the verdict be GENERATE (checkboxes as input to generate the A6 document)?** No basis: facts.md and the operator rulings reserve generation for the filled กทล.1; A6 is an applicant-supplied attachment. And this item collects nothing — there is no UI to gather generation input from.

## Ruling application
- Operator ruling 1 (facts.md:67): required set = กทล.1 exactly, no platform extras. No กทล.1 field asks a security/environment checkbox inventory.
- Ruling 2 (facts.md:68): wizard content beyond DTAM = ตัด.
- Side effect of the cut: the false QC note at th-wizard.ts:540 must go with it (it is part of the same surface; noted for the coordinator).

## Verdict
**UPHELD — CUT** is correct.
- Citation for the absence: facts.md §1 ส่วนที่ ๒ ("ไม่มีมากกว่านี้") + §4 ruling 1-2. The legitimate security requirement at application time is A6 (facts.md:41), already satisfied by the SECURITY_PLAN upload slot (documents-step-config.tsx:280), which is a separate census item and is not harmed by this cut.
- No named Thai-law or ministry-system basis found in the repo that requires a checkbox security/environment inventory at APPLICATION time for cannabis; the only cited law (พ.ร.บ. 2542 ม.44-46) belongs to the ภท. licence regime and, even there, asks for a plan document, not checkboxes.

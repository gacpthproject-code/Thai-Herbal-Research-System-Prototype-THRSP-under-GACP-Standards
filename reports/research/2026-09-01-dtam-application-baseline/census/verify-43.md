# verify-43 — SKEPTIC check: "Section 3 ข้อมูลแหล่งน้ำ" (farm-info wizard) — proposed CUT

Item under challenge (census proposal): page-section at
`apps/web-app/src/app/health/applications/new/_steps/steps/farm-info-form-sections.tsx:311`,
UI shows "3) ข้อมูลแหล่งน้ำ — ตามมาตรฐาน DTAM", verdict CUT.

Role: skeptic — tried to REFUTE the cut by finding any named Thai-law or
ministry-system basis requiring water-source data at APPLICATION time for cannabis.

## Verdict: **UPHELD — CUT** (section-level)

## 1. What the section actually contains (full surface census)

Labels resolved from `apps/web-app/src/lib/i18n/dictionaries/sections/th-wizard.ts`
and `apps/web-app/src/constants/options.ts`.

| # | Surface | file:line | Current Thai label | Verdict | Citation |
|---|---|---|---|---|---|
| 0 | Section header | farm-info-form-sections.tsx:311-315 · th-wizard.ts:433 | "3) ข้อมูลแหล่งน้ำ" / subtitle "ตามมาตรฐาน DTAM" | CUT | facts.md §1 ส่วนที่ ๒ ("ทั้งหมดที่ฟอร์มขอ ไม่มีมากกว่านี้") has no water field; §2 A1-A8 has no water attachment. Subtitle's DTAM claim is false for application day. |
| 1 | Select ประเภทแหล่งน้ำ (**required**) | farm-info-form-sections.tsx:319-326 · th-wizard.ts:473 · options.ts:12-20 | "ประเภทแหล่งน้ำ" — options: บ่อบาดาล · น้ำประปา · น้ำฝน · แม่น้ำ/ลำธาร · สระน้ำ · คลองชลประทาน · อื่น ๆ (ระบุ) | CUT | No กทล.1 field (facts.md §1 ส่วนที่ ๒); no other named-law basis found (see §2 below). Currently `required` — blocks a farmer on data DTAM never asked for. |
| 2 | Select ระบบให้น้ำหลัก (ระดับฟาร์ม) | farm-info-form-sections.tsx:327-333 · th-wizard.ts:474 · options.ts:33-38 | "ระบบให้น้ำหลัก (ระดับฟาร์ม)" — ระบบน้ำหยด (Drip) · สปริงเกลอร์ · รดน้ำด้วยมือ · ท่วมขัง | CUT | Same — no DTAM/named-law basis. |
| 3 | Conditional TextInput (renders only when sourceType === 'OTHER') | farm-info-form-sections.tsx:336-350 · th-wizard.ts:475 | "ระบุแหล่งน้ำอื่น ๆ" | CUT | Follows parent field #1. |
| 4 | Multi-select ChoiceCards ระบบกรองน้ำ | farm-info-form-sections.tsx:352-375 · th-wizard.ts:476 · options.ts:23-30 | "ระบบกรองน้ำ (เลือกได้หลายรายการ)" — กรองเกษตร · RO · UV · กรองตะกอน · กรองคาร์บอน · ไม่มีการกรอง | CUT | Same — no basis anywhere. |
| 5 | FileInput upload slot | farm-info-form-sections.tsx:377-385 · th-wizard.ts:478-480 | "ผลตรวจคุณภาพน้ำ (ถ้ามี)" / "แนบไฟล์รายงานผลตรวจเพื่อประกอบการพิจารณา" | CUT | facts.md §3 (บรรทัด 63) says it **by name**: "ผลตรวจน้ำ/ดิน/ช่อดอก/ใบรับรองแล็บ **ไม่ใช่เอกสารบังคับตอนยื่น**" — กรมปกติไม่ตรวจแล็บ ยกเว้นพบความเสี่ยงปนเปื้อน (แล้วกรมเป็นผู้สั่งตรวจ, ผู้ประกอบการจ่าย). If the coordinator ever itemizes this slot separately, the nearest alternative is MOVE_TO_AUDIT/CONDITIONAL (risk-triggered only) — but as part of this section, cut. |
| 6 | Upload status lines (กำลังอัปโหลด... / error) | farm-info-form-sections.tsx:391-396 | "กำลังอัปโหลด..." + error text | CUT | Plumbing of slot #5; goes with it. |

No other render branches exist inside this section (the only conditional is #3).

## 2. Refutation attempts — all failed

1. **กทล.1 itself** — facts.md §1 ส่วนที่ ๒ is exhaustive ("ไม่มีมากกว่านี้"): objective, area type, site name, land document/holding/size/GPS/quantity, strains. No water. §2 attachments A1-A8 + qualification docs: no water. The เจ้าหน้าที่ checklist (§2 ท้าย กทล.1) also has no water row.
2. **[ข้อกำหนด] conditions doc** — facts.md §3 places water test results explicitly OUTSIDE the filing set (line 63) and treats farm records generally as ตรวจ-ณ-แปลง matters (lines 60-62).
3. **`docs/requirements/dtam-requirements-analysis.md:16-22`** — the only repo document that asks for exactly these three fields (ประเภทแหล่งน้ำ/ระบบกรองน้ำ/รูปแบบการให้น้ำ). Its own header states the source: "จากคอมเมนต์/บรีฟ" (line 6) — an unnamed brief, **not** a named กฎกระทรวง/ประกาศ and not the กทล.1 form. This is the document that originally begat the section (its §Frontend sketch at lines 173-177 matches the shipped UI one-to-one). Under operator rulings 1-2 (facts.md §4: required set = กทล.1 exactly; เกิน = ตัด) an unnamed brief cannot outrank the form's full text. Fails as a basis.
4. **`docs/standards/tas-3502-2561-records-and-traceability.md:19,29,38`** — มกษ. 3502-2561 names "บันทึกผลการวิเคราะห์น้ำและดิน" — but (a) as farm RECORDS inspected at audit, (b) conditional on contamination-risk conditions, (c) it is a MOAC GAP standard, not the DTAM cannabis application. Fails as an application-day basis.
5. **`apps/backend/prisma/seed-standards.js:42`** (US FDA "Water Quality", EPA) and **:75** (Thai GACP "site selection and water sources") — certification/audit criteria used for gap analysis, not application-form fields; the FDA row is not Thai law at all. Fails.
6. **Named-instrument sweep across docs/** — every กฎกระทรวง/ประกาศ cited in the repo (กฎกระทรวงการคลังเรื่องเงินรายได้แผ่นดิน, ประกาศกรมสรรพากร 200/2562, ...) is money/tax-side. None touches water.
7. **DTAM e-service portal** — facts.md line 75 marks it UNVERIFIED (unreachable during research); an unverified maybe cannot serve as a basis.

## 3. Additional finding — a false claim in the code

`farm-info-form-sections.tsx:386-390` carries a comment: "The water-quality report
is mandatory under the DTAM standard." This is contradicted by facts.md §3 line 63
(explicitly not mandatory at filing) and by the slot's own label "(ถ้ามี)"
(th-wizard.ts:478). When the cut is executed, this comment must go with it —
it would otherwise resurrect the section in a future "restore mandatory fields" pass.
Likewise the subtitle "ตามมาตรฐาน DTAM" (th-wizard.ts:433) is a false provenance
claim for application day.

Downstream surfaces that will need the same cut (noted for the coordinator, not
part of this item): `review-step-helpers-core.ts` (review page renders the water
block) and th-wizard.ts:67,112-115,126,251 (sibling water labels in the older
farm-section dictionary).

## Conclusion

upheld = **true**. Verdict stays **CUT**, citation "facts.md §1 ส่วนที่ ๒
(ไม่มีมากกว่านี้) + §2 A1-A8 (no water attachment) + §3 บรรทัด 63 (ผลตรวจน้ำ
ไม่ใช่เอกสารบังคับตอนยื่น) + ruling 1-2". The strongest counter-evidence in the
repo is an unnamed brief (dtam-requirements-analysis.md, "จากคอมเมนต์/บรีฟ") and
audit-side records standards — none is a named Thai-law or ministry-form basis
for application day.

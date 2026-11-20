# verify-44 — SKEPTIC check: water sourceType (ประเภทแหล่งน้ำ) — 2026-09-01

## Item under challenge
- `apps/web-app/src/app/health/applications/new/_steps/steps/farm-info-form-sections.tsx:319-326` — `<Select label=ประเภทแหล่งน้ำ ... required />`, options `WATER_SOURCE_OPTIONS` (`apps/web-app/src/constants/options.ts:12-20`): บ่อบาดาล / น้ำประปา / น้ำฝน / แม่น้ำ-ลำธาร / สระน้ำ / คลองชลประทาน / อื่น ๆ (ระบุ)
- Proposed verdict: **CUT** ("No กทล.1 basis; currently marked required, so it actively blocks — worse than a mere extra.")

## Verdict: **upheld — CUT** (with one correction to the note's mechanics, below)

## Bases hunted for and why each fails as an APPLICATION-TIME requirement

1. **กทล.1 ส่วนที่ ๒** (facts.md:20-25) — the complete fill-in list is: วัตถุประสงค์ · ลักษณะพื้นที่ · ชื่อสถานที่+ที่ตั้ง+โทร · เอกสารที่ดิน/สถานะถือครอง/ขนาด/พิกัด/ปริมาณปลูก · พันธุ์และส่วนของกัญชา. **No water question anywhere.** facts.md:20 states "ทั้งหมดที่ฟอร์มขอ ไม่มีมากกว่านี้".
2. **กทล.1 ส่วนที่ ๓ attachments A1-A8** (facts.md:30-43) — no water item. The closest official home for water-management practice is **A8 (SOP คู่มือมาตรฐานการปฏิบัติงาน)**, which is already a required upload — i.e. DTAM reads water handling out of the SOP, not out of a form field.
3. **facts.md §3 (ข้อกำหนด)** — line 63: "ผลตรวจน้ำ/ดิน/ช่อดอก/ใบรับรองแล็บ **ไม่ใช่เอกสารบังคับตอนยื่น**"; the department normally does not lab-test unless contamination risk is found. Water is explicitly an audit-day topic in the baseline.
4. **Prior repo analysis** `reports/design-cleanup-2026-08-21/04-WIZARD-VS-DTAM.md:78` — the strongest pro-keep evidence in the repo, and it is self-described as **"ใช่โดยอ้อม"** (indirect): gacp-4 §6.1 (water testing before planting) + คู่มือผู้ตรวจประเมิน 2569 (water-source risk-assessment **record**). Both are audit-criteria/record-keeping documents the auditor checks at the site, not fields the กทล.1 application asks. That report also predates the 2026-09-01 operator rulings; ruling 1 (facts.md:67) pins the required set to กทล.1 ส่วนที่ ๓ exactly, ruling 2 (facts.md:68) says wizard items beyond DTAM = ตัด. Its "คง" verdict was additionally premised on feeding the platform's signal-map — a platform scoring feature, not a legal basis.
5. **`apps/backend/prisma/seed-standards.js:42,75`** — "Water Quality" (FDA/EPA) and "GAP Guidelines … water sources" are gap-analysis criteria for foreign/parallel standards (WHO/FDA/GAP), used by the platform's own scoring. Not a named Thai-law application requirement; per rulings 1/2 they count for nothing at application time.
6. **`docs/standards/tas-3502-2561-records-and-traceability.md:29,38`** — มกษ. 3502-2561 mentions water only as **บันทึกผลการวิเคราะห์น้ำและดิน**, conditional on risk — record-keeping, i.e. audit-day, and it is a records standard, not an application form.
7. **Named-law sweep** — multiline regex over `docs/` for (กฎกระทรวง|ประกาศ|พ.ร.บ.|พระราชบัญญัติ) within 120 chars of (แหล่งน้ำ|คุณภาพน้ำ|น้ำที่ใช้): **no matches.** Consistent with the sweep in verify-36.md:16.
8. **`apps/backend/validation/application-schemas.js:212`** — `water_source_type: requiredString('ประเภทแหล่งน้ำ')` looks like a requirement, but it is the **legacy snake-case step-keyed contract** the live wizard never populates: `apps/backend/validation/canonical-application-validator.js:11-13` records that `validateAllSteps` saw `{}` on every real submit. Platform-authored legacy code is not a legal source in any case.
9. **facts.md:75 UNVERIFIED note** — the DTAM e-service portal might have its own field list, but it is unreachable and unverified; per the census rules a guess is not a basis.

## Correction to the census note (does not change the verdict)
"Currently marked required, so it actively blocks" is **wrong on the mechanics — on the live path nothing enforces it**:
- The `required` prop at `farm-info-form-sections.tsx:325` renders the required marking only. The step's `validate()` (`farm-info-step.tsx:426-521`) checks farmName/address/province/district/subdistrict/postalCode/totalAreaSize/landOwnership/GPS/plots/land-doc — **never `waterSourceDetail.sourceType`** — and `handleNext` (`:523-529`) proceeds with it empty.
- The live submit gate `canonical-application-validator.js` contains no water check (grep `water|น้ำ`: zero matches).
- The only enforcing schema is the dead legacy contract (basis 8 above).

So the field is a **false-required**: it tells the farmer บังคับ while counting for nothing — an over-ask AND a lie in the UI. Under ruling 2 that still lands on **CUT**, and arguably more firmly: it cannot even claim to be load-bearing anywhere.

## Scope note
This check covers item 44 only (the sourceType Select at :319). The sibling surfaces in the same water section are separate census items with their own rows: irrigation Select (`:327-333`), OTHER free-text (`:336-350`), filtration ChoiceCards (`:352-375`), water-test FileInput (`:377+` — that one is the surface facts.md §3 names as not-application-time).

## Engineering rider for the cutter (verdict-neutral)
- `standards-signal-map.js:61,99` reads the dead flat `farmData.waterSource` (see verify-36.md); if this dropdown is cut, the re-point plan named in verify-36's rider has no target — the signal rows themselves need an operator decision (they are platform extras under ruling 1).
- `apps/backend/routes/api/provider/handlers/application-form-fields-handler.js:79,105` and its test `provider-application-form-fields.test.js:164-170` use `waterSourceDetail.sourceType` as the canonical example of one-level nested merge — test fixture only, pick a surviving field when cutting.
- `farm-info-step.tsx:534-545` persists the whole `waterSourceDetail` object into formData on next; the state shape at `farm-info-form-sections.tsx:26-34` goes with it.

## Conclusion
No named กทล.1 field, no ข้อกำหนด clause, and no other named Thai-law or ministry-system source in the repo requires declaring a water source type at application time for cannabis. Every water reference found (gacp-4 §6.1, คู่มือ 2569, มกษ. 3502-2561, WHO/FDA gap criteria) is audit-day compliance or record-keeping, and the SOP attachment (A8) is the DTAM-sanctioned carrier of water-management detail. **CUT upheld.**

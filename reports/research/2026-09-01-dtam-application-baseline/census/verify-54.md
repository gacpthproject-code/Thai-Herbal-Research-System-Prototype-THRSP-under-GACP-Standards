# verify-54 — วัสดุปลูก (Select) — skeptic check, 2026-09-01

**Item under challenge** (census production.md row B9):
`apps/web-app/src/app/health/applications/new/_steps/steps/production-info-panels.tsx:120-128` —
Select `label="วัสดุปลูก"`, `description="DTAM: รองรับทั้งดิน, ไฮโดรโปนิกส์, แอโรโปนิกส์"`,
options = `PLANTING_MATERIAL_OPTIONS` (`apps/web-app/src/constants/options.ts:79-87`: ดิน · กาบมะพร้าว · เพอร์ไลท์ · ร็อควูล · ไฮโดรโปนิกส์ · แอโรโปนิกส์ · ดินผสม/อื่น ๆ).
Proposed verdict: **CUT** (ruling 2; "DTAM:" = false attribution; substance lives in SOP/A5).

**Assignment**: refute the CUT if any named DTAM/Thai-law basis requires this at APPLICATION time for cannabis.

## Refutation attempts (all failed)

1. **facts.md ส่วนที่ ๒ re-read** — the exhaustive list ("ทั้งหมดที่ฟอร์มขอ ไม่มีมากกว่านี้", facts.md:20-25): วัตถุประสงค์ · ลักษณะพื้นที่ (Outdoor/Indoor/Greenhouse/อื่น ๆ) · ชื่อ/ที่ตั้งสถานที่ · เอกสารที่ดิน+ถือครอง+ขนาด+พิกัด+ปริมาณการปลูก · พันธุ์และส่วนของกัญชา. **No growing-medium field.** The closest item, ลักษณะพื้นที่, is the AREA type — already captured in wizard step 2 and echoed read-only by this very page's Alert (panels:65-70) — not the medium. Hydroponics/aeroponics is not an "อื่น ๆ" area type answer; the form's อื่น ๆ belongs to ลักษณะพื้นที่, and stretching it to cover medium would still not make a mandatory medium dropdown.
2. **facts.md ส่วนที่ ๓ attachments (A1-A8)** — medium detail plausibly lives inside A5 (แผนการผลิต) and A8 (SOP), which ARE application-day attachments — but as document content, not a wizard field. That supports the census note verbatim, it does not refute CUT.
3. **facts.md §3 (audit-day)** — ผลตรวจดิน/วัสดุปลูก is explicitly NOT required at submission (facts.md:63 กรมปกติไม่ตรวจแล็บ); ปัจจัยการผลิต appear as purchase/use RECORDS for the on-site visit (facts.md:60). Neither names a medium-type declaration at application → MOVE_TO_AUDIT would misdescribe a one-off type dropdown; the field simply has no application-day home.
4. **Repo search for another named Thai-law basis** — grep over the whole repo for กฎกระทรวง/ประกาศกระทรวง/พ.ร.บ./ภท. within 200 chars of วัสดุปลูก/plantingMaterial/GrowingMedium: **zero matches**. The only repo documents claiming "DTAM ต้องการวัสดุปลูก" are `docs/requirements/dtam-requirements-analysis.md:24-29` and its derivatives (`dtam-implementation-status.md:30,119`, `dtam-implementation-final.md:25,289`, `dtam-implementation-progress.md:15`) — all sourced "จากคอมเมนต์/บรีฟ" (dtam-requirements-analysis.md:6), an uncited verbal brief. That is vibes, not a citable basis, and facts.md (the coordinator's full-text extract of the actual กทล.1 + ข้อกำหนด) supersedes it.
5. **Backend** — no route/validator/schema reads `plantingMaterial` by name (grep plantingMaterial|growingMedium|GROWING_MEDIUM in apps/backend: no matches); the value rides the untyped `formData` spread and nothing consumes it. `apps/backend/prisma/schema/gacp-compliance.prisma:43-57` `GrowingMedium` is a per-PlantingCycle record (post-cert cultivation/audit substance), and `apps/backend/data/journey-config-standards.js:5` "วัสดุปลูกและเมล็ดพันธุ์" is a GACP-standards journey category — neither is a กทล.1 application field.
6. **Prior independent analysis concurs** — `reports/design-cleanup-2026-08-21/04-WIZARD-VS-DTAM.md:90`: วัสดุปลูก/ชนิดดิน/ระยะปลูก → "ไม่ (gacp-4 §5.1-5.2 ขอผลตรวจดิน/วัสดุปลูก ไม่ขอชนิด)" → **ตัด ทั้ง 3 (ย้ายไป SOP)**.

## False-attribution check

The UI description "DTAM: รองรับทั้งดิน, ไฮโดรโปนิกส์, แอโรโปนิกส์" (panels:123) appears nowhere in facts.md. Its lineage is `docs/requirements/dtam-implementation-status.md:119` ("วัสดุปลูก (Medium) 90% — มีครบ รวม aeroponics"), i.e. the uncited brief. Confirmed: false attribution against the legal baseline.

## Census of the surfaces in scope of this challenge (no conditional branches skipped)

The Select renders unconditionally — no applicant-type / plant / area-type branch gates it (panels:119-128 has no conditional wrapper).

| # | Surface | file:line | UI shows | Verdict | Citation |
|---|---|---|---|---|---|
| 54 | วัสดุปลูก (Select) | production-info-panels.tsx:120-128 | label "วัสดุปลูก", desc "DTAM: รองรับทั้งดิน, ไฮโดรโปนิกส์, แอโรโปนิกส์" | **CUT** — upheld | No row in facts.md ส่วนที่ ๒ (facts.md:20-25); ruling 2 (facts.md:68); "DTAM:" attribution unsupported (nothing in facts.md); substance = A5/A8 document content (facts.md:40,43) + audit-day records (facts.md:60,63) |
| 54a-g | options ดิน / กาบมะพร้าว / เพอร์ไลท์ / ร็อควูล / ไฮโดรโปนิกส์ / แอโรโปนิกส์ / ดินผสม-อื่น ๆ | options.ts:80-86 (rendered panels:124) | 7 option labels | **CUT** — fall with the field | same |
| — | mirror surface: edit-config row 'วัสดุปลูก' | application-document-edit-config.ts:104 | select, same options | falls with 54 (flag for the fix batch — same CUT must remove this row or it resurfaces in the officer/edit view) | same |

Adjacent surfaces on the same page (Alert B1, วิธีการขยายพันธุ์ B3-B8, ชนิดดิน B17-24, ระยะปลูก, จำนวนต้น, รอบเก็บเกี่ยว, ผลผลิตคาดการณ์, plant parts, seed sources, production inputs) are separately rowed in census/production.md B1-B64 — not re-verdicted here.

## Verdict

**UPHELD — CUT stands.** No กทล.1 field, no ข้อกำหนด clause, and no named Thai-law citation anywhere in the repo requires declaring growing-medium type at application time for cannabis. The only contrary documents trace to an uncited brief that the facts.md full-text extract supersedes (ruling 1: ชุดบังคับ = กทล.1 เท่านั้น; ruling 2: เกิน = ตัด). The "DTAM:" description is a false attribution. Growing-medium substance reaches DTAM through A5 แผนการผลิต / A8 SOP uploads and audit-day records, exactly as the census note says.

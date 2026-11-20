# verify-57 — SKEPTIC check: options ชนิดดิน 7 ค่า (SOIL_TYPE_OPTIONS)

Date: 2026-09-01 · Role: skeptic (refute-the-cut) · Item under challenge:
`{"name":"options ชนิดดิน 7 ค่า","kind":"option","file":"apps/web-app/src/app/health/applications/new/_steps/steps/production-info-panels.tsx","line":133,"verdict":"CUT","dtamRef":"ruling 2","note":"ตกไปพร้อม field (options.ts:117-125)"}`

## Verdict: **CUT upheld** (refutation attempt failed)

## Surface censused (the item = the option list; each value rowed)

Consumer: `production-info-panels.tsx:129-136` — `<Select label="ชนิดดิน" data={SOIL_TYPE_OPTIONS}>`, no `*`, no validator entry (no `fieldErrors.soilType` branch), single render path — no conditional branches per applicant type / plant / area type gate this Select; it renders for every applicant.
Source: `apps/web-app/src/constants/options.ts:117-125` (the census note's "options.ts:117-125" resolves here — there is no `_steps/steps/options.ts`; SOIL_TYPE_OPTIONS lives in `src/constants/options.ts`).

| # | value | UI label (Thai) | verdict | citation |
|---|---|---|---|---|
| 1 | LOAM | ดินร่วน (Loam) | CUT | ruling 2 — no กทล.1 home (see below) |
| 2 | SANDY_LOAM | ดินร่วนปนทราย (Sandy Loam) | CUT | ruling 2 |
| 3 | CLAY_LOAM | ดินร่วนเหนียว (Clay Loam) | CUT | ruling 2 |
| 4 | SANDY | ดินทราย (Sandy) | CUT | ruling 2 |
| 5 | CLAY | ดินเหนียว (Clay) | CUT | ruling 2 |
| 6 | PEAT | ดินพีท (Peat) | CUT | ruling 2 |
| 7 | OTHER | อื่น ๆ/ไม่ใช้ดิน | CUT | ruling 2 — the "ไม่ใช้ดิน" (soilless) signal is already carried by the กทล.1 ลักษณะพื้นที่ checkbox (Indoor/Greenhouse, facts.md:22), which has its own census row; this option is not its vehicle |

## Refutation attempts (what the skeptic actually searched)

1. **facts.md full read** — ชนิดดิน appears nowhere: not in ส่วนที่ ๑ (identity), not in ส่วนที่ ๒ (facts.md:20-25 — purpose, area type, place, land document, holding status, size, coordinates, planting quantity, varieties/parts), not in attachments A1-A8 (facts.md:32-43), not in applicant-qualification docs, renewal, replacement, and not in the officer checklist (facts.md:55-57). Closest DTAM touchpoints are A5 แผนการผลิต and A8 SOP — both *uploads*, not wizard fields, per ruling 1 (required set = กทล.1 ส่วนที่ ๓ exactly).
2. **Lab/soil-quality angle** — facts.md:63: กรมปกติ**ไม่ตรวจแล็บ**; ผลตรวจดิน is explicitly not a submission document. If even the soil *test* is off the application, the soil *type* taxonomy has no stronger claim.
3. **Prior independent analysis concurs** — `reports/design-cleanup-2026-08-21/04-WIZARD-VS-DTAM.md:90`: วัสดุปลูก/ชนิดดิน/ระยะปลูก → "ไม่ (gacp-4 §5.1-5.2 ขอผลตรวจดิน/วัสดุปลูก ไม่ขอชนิด)" → **ตัด ทั้ง 3 (ย้ายไป SOP)**. So even the cited GACP standard text asks for test results, never a type picklist.
4. **Repo-wide legal search** — grep `soilType|soil_type|ชนิดดิน` across docs/, apps/backend/constants, shared/, prisma: the only docs/ hit is `docs/architecture/iot-scope-decision.md:21` (IoT scoping note, not law). `apps/backend/prisma/schema/farm.prisma:50` declares `soilType String?` — optional; `application-submission-methods.js:80` merely copies `farmData.soilType` into the Farm row. No named กฎกระทรวง / ประกาศ สธ. / ministry-form basis anywhere in the repo ties soil type to application time. `apps/backend/scripts/herb-content/*.json` soil mentions are advisory growing content, not requirements.
5. **Parent-field dependency** — census/production.md B17 (panels:129-136) already CUT the ชนิดดิน field itself with the same reasoning, and census/officer.md §3 CUT its officer-view echo. An option list has no life without its field; verify-55 (วัสดุปลูก) confirmed the sibling cut on the same SimpleGrid.

## Consistency notes

- The census row's note "ตกไปพร้อม field" is correct in substance; only the path shorthand is off — the list lives at `src/constants/options.ts:117-125`, not next to the panels file.
- Cut scope when applied: `SOIL_TYPE_OPTIONS` (constants/options.ts:117-125) + the Select at panels:129-136 + the `soilType` key in the step's form data types (`production-info-types.ts`, `hooks/domain-types.ts`) and its echoes in the review/print/document views (already rowed separately in production.md / officer.md — not re-verdicted here). Backend `Farm.soilType` column is out of census scope (read-only census; schema retirement is its own Tier C decision).
- Adjacent surfaces in the same Section 1 (วิธีการขยายพันธุ์, วัสดุปลูก, ระยะปลูก, จำนวนต้น, รอบเก็บเกี่ยว, ผลผลิตคาดการณ์) have their own rows in census/production.md B2-B24 — not re-verdicted here.

## Conclusion

No named กทล.1 field, no ข้อกำหนด clause, and no other Thai-law or ministry-system basis in the repo requires a soil-type answer at application time for cannabis. Ruling 2 applies. **CUT stands** for the option list and all 7 values.

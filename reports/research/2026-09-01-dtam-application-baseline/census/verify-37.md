# verify-37 — electricitySource (state default, no UI) — SKEPTIC CHECK — 2026-09-01

Item under challenge (census farm.md row 4):
`electricitySource` state default, `apps/web-app/src/app/health/applications/new/_steps/steps/farm-info-step.tsx:78`, verdict **CUT**, note "No กทล.1 field asks about electricity."

## Verdict: **UPHELD — CUT**

## 1. What the code actually is (re-read this session)

| file:line | what the UI shows | role |
|---|---|---|
| `apps/web-app/src/app/health/applications/new/_steps/steps/farm-info-step.tsx:78` | (ไม่มี UI — `electricitySource: ''` in the initial `formData` state only) | the item itself |
| `apps/web-app/src/app/health/applications/new/hooks/domain-types.ts:161` | — (`electricitySource?: string` on `FarmData`, under comment "โครงสร้างพื้นฐาน") | type carrier of the dead key |
| `apps/web-app/src/app/provider/applications/[id]/print/print-page-types.ts:73` | — (`electricitySource?: string`) | print-page type carrier |
| `apps/web-app/src/app/provider/applications/[id]/print/client-view.tsx:319` | `แหล่งไฟฟ้า` row in "โครงสร้างพื้นฐานและความปลอดภัย" table | downstream display — always empty, since no wizard surface ever sets the value |

Confirmed: no input, select, checkbox, or upload in the farm-info step (or its `FarmInfoFormSections` props at farm-info-step.tsx:640-678) binds `electricitySource`. `handleChange`/`validate` never touch it. It is a write-never state key.

## 2. Refutation attempt — searched for ANY other named basis

- **facts.md (authority, re-read in full this session):**
  - ส่วนที่ ๒ (facts.md:20-25) — วัตถุประสงค์, ลักษณะพื้นที่, ชื่อสถานที่/ที่ตั้ง, เอกสารที่ดิน/การถือครอง, ขนาดพื้นที่, พิกัด, ปริมาณการปลูก, พันธุ์/ส่วนของกัญชา. **No electricity item.**
  - ส่วนที่ ๓ attachments A1-A8 + คุณสมบัติ + ต่ออายุ/ใบแทน (facts.md:30-53) — **no electricity item.** A4 (Indoor/Greenhouse) asks for a แบบแปลนอาคาร *document* + photos, not a structured electricity-source field, so not even CONDITIONAL.
  - §3 audit-day list (facts.md:59-64) — production-input/activity/sales/cleaning/pest records; **electricity not named**, so MOVE_TO_AUDIT has no citation either.
  - เจ้าหน้าที่ checklist (facts.md:55-57) — no electricity item.
- **Repo-wide greps** (`electricitySource|electricity_source|ไฟฟ้า|แหล่งไฟ`, then bare `electric`, then `พลังงาน|utility|power supply`), all case-insensitive, whole repo:
  - `apps/backend/prisma/schema/farm.prisma:139` — `waterEC` = ค่าการนำ**ไฟฟ้า**ของน้ำ (dS/m), water electrical conductivity. Agronomy metric, unrelated to electricity supply. **No `electricitySource` column exists in prisma.**
  - `apps/backend/data/journey-config-options.js:59` and `apps/backend/controllers/master-data-controller.js:93` — "ค่าไฟฟ้าสูง" as a *cons* bullet describing Indoor cost. Descriptive copy, not a requirement.
  - `apps/backend/scripts/herb-content/data/*.json` — advisory herb content (solar dryers, energy cost of indoor, EC of nutrient solution). Educational text, no legal citation.
  - `apps/web-app/src/app/health/site-analysis/client-view.tsx:389` — water EC input, unrelated.
  - Standards layer (`seed-standards.js`, `standards-signal-map.js`, `seed-gacp.js`, `standards-analyzer-service.js`) — **zero hits** for ไฟฟ้า/electric/แหล่งไฟ/พลังงาน/utility.
  - No named กฎกระทรวง/ประกาศ/พ.ร.บ. anywhere in the repo ties an electricity declaration to the cannabis GACP application. Nothing in docs/ or shared/ either (the greps above covered the whole tree; only the 11 files listed matched, all accounted for).
- **Ruling check:** ruling 1 (facts.md:67) pins the application-time required set to กทล.1 ส่วนที่ ๓ exactly; ruling 2 (facts.md:68) says anything beyond DTAM = cut. Even if a GACP audit standard somewhere touched electrical safety, it could not make this an *application-time* field.

## 3. Conclusion

No กทล.1 field, no attachment, no audit-day record in [ข้อกำหนด], and no other named Thai-law or ministry-system basis anywhere in the repo asks for an electricity source at application time for cannabis. The key is also write-never in the wizard, so it carries no data. CUT is the exact verdict — not OPTIONAL (nothing collects it, and no usefulness basis is cited), not MOVE_TO_AUDIT (§3 never names electricity), not CONDITIONAL (A4 is a document, not this field).

**Execution note for the coordinator (no edits made — read-only census):** cutting farm-info-step.tsx:78 should take the dead key's carriers with it, or they become unreachable code / a permanently blank row: domain-types.ts:161, print-page-types.ts:73, and the `แหล่งไฟฟ้า` display row at provider print client-view.tsx:319 (that row can never render a value today).

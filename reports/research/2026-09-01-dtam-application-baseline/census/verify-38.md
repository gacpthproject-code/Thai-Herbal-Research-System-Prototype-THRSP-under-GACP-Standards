# verify-38 — skeptic check: hasFence (state default), farm-info-step.tsx:79 — verdict CUT

Date: 2026-09-01 · Checker role: SKEPTIC (tried to refute the CUT) · Result: **UPHELD**

## Item under check

| field | value |
|---|---|
| name | hasFence (state default) |
| kind | field |
| file:line | apps/web-app/src/app/health/applications/new/_steps/steps/farm-info-step.tsx:79 |
| current UI (Thai) | (ไม่มี UI ในสเต็ปนี้) — state default only, `hasFence: false` |
| proposed verdict | CUT |
| dtamRef in item | A3 (item's own note says: properly A6) |

## What the code actually does (verified this session)

- farm-info-step.tsx:79 sets `hasFence: false` in the initial `formData` state, beside `hasCCTV` (:80), `hasAccessControl` (:81), `hasWarningSign` (:82).
- **No UI in this step renders any of these booleans.** `FarmInfoFormSections` (invoked :640-678) receives no security prop; `securityChecks` (:257) is declared with no setter and passed through unchanged at :554. The census's "(ไม่มี UI ในสเต็ปนี้)" is accurate.
- The value is therefore submitted as a constant `false` on every application. Downstream consumers render nothing from it: provider print view shows badges only when true, else "-" (apps/web-app/src/app/provider/applications/[id]/print/client-view.tsx:326-330); document view emits '' (apps/web-app/src/components/application/application-document-view.tsx:277). The 2026-08-21 report already flagged this dead constant (reports/design-cleanup-2026-08-21/04-WIZARD-VS-DTAM.md:83 — "ส่งค่า false คงที่ทุกครั้ง").
- Step 7 (quality step) contains a note claiming these were "กรอกไว้ในขั้นตอน 'ข้อมูลฟาร์ม' แล้ว" (th-wizard.ts:538-541) — false today; that note is census'd separately (quality.md item 10, CUT).

## Refutation attempts and why each fails

1. **กทล.1 itself** — facts.md §1 ส่วนที่ ๒ lists the complete fill-in set ("ไม่มีมากกว่านี้"): objective, area type, site name, land document/holding, area size, coordinates, plant quantity, varieties. No security question anywhere. The officer checklist (facts.md:56-57) asks for documents, not security attributes. → no กทล.1 *field* basis.
2. **Security measures ARE required at application time — but as attachment A6** — facts.md:41: "A6 มาตรการรักษาความปลอดภัย + วิธีนำส่วนของกัญชาที่เหลือไปใช้ประโยชน์ | ทุกราย" — a *document upload*, ทุกราย. The platform already has that surface: SECURITY_PLAN document slot (apps/web-app/src/app/provider/applications/[id]/print/print-page-config.ts:47; apps/backend/prisma/seed-plants.js:165 `documentNameTH: 'มาตรการรักษาความปลอดภัย', isRequired: true`; census backend-slots.md:152 maps A6). A boolean field duplicating the document's content is a platform extra → ruling 2 (facts.md:68) cuts it.
3. **PlantSpecies.securityRequirements (CCTV 24/7, รั้ว ≥2 เมตร, Biometric)** — apps/backend/prisma/seed-plants.js:21-27. Carries **no named-law citation** — unlabeled seed data. The planting audit treats it as a public-trace data-leak problem, not a legal requirement (reports/planting-audit/PLANTING-TNT-AUDIT.md:205-208). A vibes-level seed list is not a basis.
4. **ประกาศกระทรวงสาธารณสุข เรื่อง สมุนไพรควบคุม (กัญชา) พ.ศ. 2565** (docs/requirements/gacp-document-requirements-research.md:260-261, 460-461) — governs the ภ.ท.11/ภ.ท.12 **sale/processing licence**, a different procedure from the GACP กทล.1 application. Even there, security is "แผนการดำเนินงานและมาตรการรักษาความปลอดภัย จำนวน 1 ชุด" (docs/requirements/gacp-document-requirements-research.md:256, §5.3 :319-324) — again a *document*, not form booleans. At GACP application time the officer checklist wants only the resulting licence itself (facts.md:56). → no transfer of a boolean requirement into the กทล.1 wizard.
5. **docs/requirements/official-gacp-requirements-dtam.md:103** — lists "มาตรการรักษาความปลอดภัย" as เอกสารประกอบ #8 (a document), claiming "✅ Step 5" — that claim is false in current code (no UI, see above) and the doc is superseded by facts.md as baseline. Still a document either way.
6. **04-WIZARD-VS-DTAM.md:83,167 proposed the opposite ("เพิ่มเป็นคำถามจริง" + checklist)** — a 2026-08-21 platform design proposal mapping to กทล.1 ส่วนที่ 3 (f), which *is* attachment A6, a document. The 2026-09-01 operator rulings supersede it: ruling 1 (required set = กทล.1 exactly) + ruling 2 (excess = cut). Turning a required *document* into required *checkboxes* is exactly the kind of platform extra ruling 2 forbids.
7. **MOVE_TO_AUDIT?** — facts.md §3 (audit-day items) lists records/logs; security measures are not named there. A6 is application-day, but as an upload — already covered by the SECURITY_PLAN slot, not by this boolean. → MOVE_TO_AUDIT wrong.
8. **GENERATE?** — nothing in facts.md instructs the system to generate the A6 document from wizard data; GENERATE is for the filled กทล.1 itself. → wrong.

## Verdict

**UPHELD — CUT is correct** for `hasFence` (state default) at farm-info-step.tsx:79. No named Thai-law or ministry-system basis requires a structured fence boolean at GACP application time for cannabis; DTAM's security requirement is attachment A6, a document upload, which the platform satisfies through the SECURITY_PLAN slot (kept elsewhere in the census). Citation: facts.md:41 (A6, ทุกราย) + facts.md:67-68 (rulings 1-2).

One correction to the item's metadata, not its verdict: `dtamRef` should read **A6**, not A3 (A3 is the map/location attachment, facts.md:37). The item's own note and the census of record (census/farm.md:33) already carry A6.

The same analysis covers siblings hasCCTV (:80), hasAccessControl (:81), hasWarningSign (:82) — census'd as farm.md items 6-8, each CUT/A6.

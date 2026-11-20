# verify-52 — SKEPTIC check: hasOrganicCert (hidden default) — 2026-09-01

Census item under attack: `{"name":"hasOrganicCert (hidden default)","kind":"field","file":"apps/web-app/src/app/health/applications/new/_steps/steps/production-info-step.tsx","line":64,"verdict":"CUT","dtamRef":"ruling 2","note":"ไม่มีช่องใน กทล.1"}`

## Item row (re-verified against the working tree)

| item | kind | file:line | UI ปัจจุบัน | verdict | citation |
|---|---|---|---|---|---|
| hasOrganicCert (hidden default) | field | apps/web-app/src/app/health/applications/new/_steps/steps/production-info-step.tsx:63 (census said 64 — actual init line is 63: `hasOrganicCert: false,`; line 64 is the closing `};`. Same off-by-one family as verify-51 found for hasGAPCert) | ไม่ render ใน wizard step ใด — default `false` ถูก persist เข้า productionData (handleNext, step:249-258). โผล่เป็น read-only "ใบรับรองอินทรีย์" ใน application-document-view.tsx:511 และเป็น editable boolean ใน application-document-edit-config.ts:113 | **CUT — UPHELD** | ruling 1+2 (facts.md:67-68) — ไม่มีช่องใน กทล.1 ส่วนที่ ๑/๒/๔ (facts.md:11-28) และไม่อยู่ในเอกสารแนบส่วนที่ ๓ A1-A8/คุณสมบัติ (facts.md:30-53) |

## Refutation attempts (all failed — no basis found)

1. **กทล.1 full text (facts.md §1-2)** — ส่วนที่ ๒ asks objective, area type, place, land document, holding status, area size, coordinates, plant quantity, varieties/parts. Attachments A1-A8 + qualification docs. Zero mention of organic certification. The officer checklist (facts.md:56) requires only the *cannabis cultivation licence* under the relevant law ("ใบอนุญาต/หนังสือสำคัญ กรณีการปลูก/แปรรูปกัญชาที่ต้องได้รับอนุญาตตามกฎหมายที่เกี่ยวข้อง") — a BhT-family licence, not an organic cert.
2. **ข้อกำหนด (facts.md §3)** — lists audit-day records and even exempts lab certificates at submission (facts.md:63). Nothing organic.
3. **Repo requirements docs** — docs/requirements/plant-document-comparison-matrix.md:42 marks "ใบรับรอง Organic" for cannabis NEW as ⚠️ (Optional/If Applicable) and :60 for RENEW as ❌; docs/requirements/gacp-document-requirements-research.md:88-90 files it under "ใบรับรอง (ไม่บังคับ)" and :190 marks it ❌ required. The platform's own research never claimed it was required, and cites no กฎกระทรวง/ประกาศ for it.
4. **Backend seed (decisive)** — apps/backend/prisma/seed-plants.js: the cannabis plant (code CAN, lines 13-38) has NO `hasOrganicCert` in its productionInputs; the checkbox exists only for GENERAL-group herbs (e.g. Turmeric, seed-plants.js:83) and even there is `required: false`. Under ruling 5 (cannabis only; other plants = a future new ruleset, facts.md:71), the GENERAL-group definition cannot carry the field into the cannabis wizard.
5. **Named-law search** — grep for มกษ/9000/IFOAM/กฎกระทรวง+อินทรีย์/ประกาศ+อินทรีย์ across md/js/ts/tsx/json/prisma: no Thai law or ministry rule anywhere in the repo ties organic certification to a cannabis GACP application. The repo's own herb knowledge base states Organic Thailand (มกษ. 9000) is a *voluntary* standard "แยกจาก GACP" (apps/backend/scripts/herb-content/data/TURMERIC.json:1437, BLACK_GALINGALE.json:1410).

## Why not OPTIONAL?

OPTIONAL requires the item to be useful and shown labeled ไม่บังคับ. This field is never rendered in the wizard — it is dead state that always persists `false`, so it informs nothing; the farmer cannot even set it. Its only downstream surfaces (document view :511, edit-config :113) display/edit a flag the applicant never chose. For cannabis it has no DTAM role at application or audit. Ruling 2 (facts.md:68): over-DTAM headers/options = cut. CUT, not OPTIONAL.

## Verdict

**UPHELD — CUT stands.** Correction to the census row: file:line should read production-info-step.tsx:**63** (the census's :64 points at the closing brace). Companion note: the persisted flag's downstream display/edit surfaces (application-document-view.tsx:511, application-document-edit-config.ts:113) and the type slots (use-wizard-state.ts:78, domain-types.ts:293) fall with it when the cut is executed.

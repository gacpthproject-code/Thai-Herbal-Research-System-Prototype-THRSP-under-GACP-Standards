# verify-51 — hasGAPCert (hidden default) — SKEPTIC check

Item under challenge (census/production.md:52):

| name | kind | file:line | UI (Thai) | proposed verdict | dtamRef |
|---|---|---|---|---|---|
| hasGAPCert (hidden default) | field | apps/web-app/src/app/health/applications/new/_steps/steps/production-info-step.tsx:62 (census said 63 — actual line is 62; line 63 is `hasOrganicCert: false`) | ไม่ render — default `false` ถูก persist เข้า productionData | CUT | ruling 2 |

## What the code actually does (read this session)

- `production-info-step.tsx:62` — `hasGAPCert: false` seeded into initial form state; **no input for it anywhere in the step** (grep across the wizard: no render site; `production-info-panels` receives formData but has no GAP control).
- The silent `false` is persisted via `setProductionData` (step:249-258) and later **surfaces to the officer** as a stated fact: `application-document-view.tsx:510` renders `ใบรับรอง GAP: <mapHasFlag(hasGAPCert)>` — i.e. the review page asserts "ไม่มีใบรับรอง GAP" about a question the farmer was never asked. It is also editable at `application-document-edit-config.ts:112` (label ใบรับรอง GAP, boolean).

## Refutation attempts (all failed)

1. **facts.md (the legal baseline, full re-read).** ส่วนที่ ๒ (facts.md:20-25) lists everything กทล.1 asks — objective, area type, site, land document, size, coordinates, quantities, varieties/parts. No GAP-certificate question. ส่วนที่ ๓ attachments A1-A8 + qualification docs (facts.md:30-50): no GAP certificate slot. Renewal (facts.md:52) requires ต้นฉบับ**ใบรับรองเก่า** — the DTAM GACP certificate itself, not a MOAC GAP cert, and it is a renewal *attachment*, not this boolean.
2. **Officer checklist "ใบอนุญาต/หนังสือสำคัญ…ตามกฎหมายที่เกี่ยวข้อง" (facts.md:56).** That is the cannabis cultivation *licence* (the ใบอนุญาต the จนท. checklist names, explicitly "คือตัวใบอนุญาต ไม่ใช่แบบคำขอ ภท."). A GAP certificate is a voluntary agricultural-standard certification (มกอช./กรมวิชาการเกษตร), not a licence under any named กฎกระทรวง/ประกาศ — it cannot ride on this row.
3. **มกษ. 3502-2561.** Every repo citation (docs/standards/tas-3502-2561-records-and-traceability.md; HARNESS_LOG.md:417,430; plot-code files) concerns ข้อ 8 record-keeping/plot codes — audit-day territory per facts.md §3, and no clause read in the repo requires *holding a prior GAP certificate* at application time. Not a basis.
4. **Platform's own research docs.** docs/requirements/plant-document-comparison-matrix.md:41,45 marks ใบรับรอง GAP for cannabis NEW as ⚠️ = "ถ้ามี (Optional/If Applicable)" and :59 marks renewal ❌; docs/requirements/gacp-document-requirements-research.md:189,206 lists it only for turmeric/ginger, บังคับ = ❌. These are internal research artifacts with no named law behind the GAP row — under ruling 1 ("ชุดบังคับ = กทล.1 ส่วนที่ ๓ เท่านั้น ไม่มีเกณฑ์เพิ่มของแพลตฟอร์ม") they cannot create a requirement, and "ถ้ามี" is exactly the vibes-level usefulness the census brief rejects as a basis.
5. **Backend seed truth.** apps/backend/prisma/seed-plants.js:82-83 — the `hasGapCert` checkbox belongs to **TUR (ขมิ้นชัน, GENERAL group)**, `required: false`; ditto the GAP document slots (seed-plants.js:198 TUR, :208 GIN, both `isRequired: false`). The **cannabis (CAN) plant config has no GAP field at all**. Ruling 5 = cannabis only; the only plants that ever carried this field are out of scope.
6. **Mobile app.** apps/mobile-app/lib/presentation/features/application/screens/wizard_steps/step_7_documents.dart:246 — 'ใบรับรอง GAP (ถ้ามี)', `false` (optional). Confirms even the sibling client never treated it as required.

## Why not OPTIONAL instead of CUT

OPTIONAL is for something *useful* that a farmer may voluntarily provide. This item is not that: it is a **hidden boolean the farmer never sees**, silently persisted as `false` and then displayed to the officer as an affirmative claim ("ใบรับรอง GAP: ไม่มี"). It contributes no voluntary evidence, and its only observable behavior is fabricating an answer to an unasked question — worse than useless under ruling 2 (ความเกินคือปัญหา) and misleading on the review surface ruling 4/7 cares about. If the platform ever wants a voluntary GAP-cert upload, that would be a new, rendered, labeled-ไม่บังคับ surface — not this field.

## Verdict

**UPHELD — CUT** (ruling 2; no กทล.1 field — facts.md §1 ส่วนที่ ๒ and §2 ส่วนที่ ๓ contain no GAP-certificate item; no other named Thai-law or ministry basis found anywhere in docs/, apps/backend/constants, apps/backend/prisma, or shared code). Correction to the census row: the field sits at production-info-step.tsx:**62**, not 63. Downstream cleanup the cut implies (same basis, noted for the coordinator): application-document-view.tsx:510 and application-document-edit-config.ts:112 render/edit the same phantom field.

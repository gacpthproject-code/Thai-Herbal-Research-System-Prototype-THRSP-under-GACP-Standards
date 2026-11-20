---
name: gacp-standards-requirements
description: Use when working with GACP certification standards, standard requirements, or gap-analysis — the Thai · WHO · ASEAN comparison table, evaluating an application against one standard, editing gacp-requirement-comparison.js, interpreting MET / NOT_MET / NEEDS_REVIEW verdicts, the site compliance score, or the ASEAN 10-country table. Cite each requirement by file:line and by the source document's clause, never from memory.
---

# GACP Standards & Requirements (ต้นแบบที่ 1)

## Source of truth

| Concern | File |
|---|---|
| 3 standards × 18 topics, each cell cited to a clause, plus the 4 source documents | `apps/backend/data/standards/gacp-requirement-comparison.js` |
| Comparison, CSV, per-application evaluation | `apps/backend/services/standards-analyzer-service.js` |
| Doors | `routes/api/certificates/standards.js`: `GET /api/standards`, `/comparison`, `/comparison/export.csv` (authenticateProvider), `/:code/analyze/:applicationId` (authenticateAny), `/asean/comparison` (public, draft) |
| Screens | `apps/web-app/src/app/provider/standards/{page,compare,who,thai-fda,asean}` · `_components/standard-analyze-view.tsx` |

The source documents were read by the team on 2026-10-28: มกษ. 3502-2561 (ACFS e-book, scanned, read page by page), ประกาศกรมการแพทย์แผนไทยฯ 2568 (Royal Gazette 142 ตอนพิเศษ 303 ง), WHO GACP 2003 (ISBN 92 4 154627 1), ASEAN GAP 2006. A new cell needs the clause read from the document itself; record the ref and the source id.

Facts that were wrong before and must stay fixed:
- WHO GACP sets no heavy-metal numbers (ข้อ 2.3.6 defers to national limits). The numeric limits on screen come from the DTAM 2568 annex and apply to cannabis flower only.
- There is no ASEAN GACP for medicinal plants (searched 2026-10-28). ASEAN GAP is for fresh fruit and vegetables; its scope note says so.
- `certification_standards` / `standard_requirements` tables and `prisma/seed-standards.js` are no longer read by the analyzer. Dropping them is a schema change (Tier C).
- Soil evidence (order 159, 2026-11-04): the SOIL topic's evidence is the lab soil-test report the applicant uploads to the `soil_test` slot, optional at submission like `water_test`; staff never sample soil, and the onsite form has no soil item. Soil follow-up 2 (same day): step 3 asks ปลูกในดิน / ไม่ใช้ดิน when อาคารระบบปิด is ticked, stored at `farmData.growingMedium` (`SOIL` | `SOILLESS`, `@gacp/validation/growing-medium`). It is required at submit when INDOOR is ticked and refused when it is not (`filing-fields.js` SITE_FIELDS). Only an INDOOR-only, SOILLESS filing loses the `soil_test` slot; a mixed filing keeps it. The analyzer gives that filing's SOIL `NEEDS_REVIEW` with the topic's `signals.soillessIndoor` reason. There is no "not applicable" verdict by ruling: the expert decides with the other pending cells.

## Verdicts = exactly 3

`MET` / `NOT_MET` / `NEEDS_REVIEW` (labels ผ่าน / ยังไม่ผ่าน / รอประเมิน). Precedence in `evaluateTopic`:

0. `signals.soillessIndoor` and the filing grows INDOOR-only without soil → NEEDS_REVIEW with that reason (SOIL only, order 159 soil follow-up 2)
1. a primary `signals.docs` slot uploaded → MET, unless the cell has `extraRequired`: then NEEDS_REVIEW and the evidence line names what the standard asks beyond Thai (primary documents and the onsite audit answer the Thai clause only)
2. `certifiedStates` and status ∈ {AUDIT_PASSED, APPROVED, CERTIFIED} → same as 1. WATER counts here (onsite checklist item 2.1 checks the water source and its test result). SOIL does not: the onsite checklist (`services/onsite-checklist-template.js`) has no soil item, so a passed audit says nothing about soil and only a SOIL_TEST upload makes it MET (review I1, 2026-11-04)
3. secondary docs or a filled `signals.form` path → NEEDS_REVIEW
4. `signals.manual` → NEEDS_REVIEW with that reason
5. a topic with no submission channel at all (no `docs`, `docsSecondary` or `form`: today PERSONNEL and REVIEW, because กทล.1 has no slot or field for them) → NEEDS_REVIEW, decided at the farm. The renewal summary report was removed from REVIEW on 2026-11-04: it summarises output and use, not the annual review มกษ. 8(2) asks for
6. any other topic with no evidence → NOT_MET + recommendation, because the applicant could have uploaded a document or filled the field (A5 plan item 3, 2026-11-04; an empty draft is "not met", not "awaiting an officer")

No topic is MET from platform capability. TRACEABILITY reads the application's own map, SOP manual and packaging fields like every other topic (A5 plan item 2, 2026-11-04); the lot and QR system opens after the certificate and is not evidence for the application.

Topics whose level for the chosen standard is ABSENT are left out of that standard's analysis.

## Comparison gaps

A cell's `level` follows the source wording: REQUIRED (ข้อกำหนด) = must, or a clause written as a plain statement of what is done (a control point); RECOMMENDED (ข้อแนะนำ) = should. The level word describes the wording, never legal force, so no screen, CSV or note calls a level "ข้อบังคับ" (order 154, test-enforced). WHO GACP 2003 is should throughout, so every WHO cell is RECOMMENDED and its few must sentences are marked inline as "เขียนว่าต้อง:" and keep the source's conditions (3.1 starts "In some countries"); มกษ. 3502 and ASEAN GAP cells are REQUIRED with "คำแนะนำ:" parts marked inline. ASEAN GAP calls itself "standards and recommended practices", a benchmark for national GAP programs with no ASEAN certification of its own; its scopeNote says so and never cites certification as the reason for REQUIRED.

For WHO and ASEAN cells: `ABSENT` → NOT_IN_STANDARD; `extraRequired` present → ADD (ต้องทำเพิ่ม, a REQUIRED clause or a must sentence in the source, missing from Thai); else `extraRecommended` present → RECOMMENDS (แนะนำให้ทำเพิ่ม); else THAI_COVERS. The on-screen counts are WHO 4 / 13 / 1 / 0 and ASEAN 14 / 0 / 3 / 1 (add / recommends / thaiCovers / notInStandard), pinned by `standards-requirement-comparison.test.js`. A cell where Thai is ABSENT and the other standard is not must carry one of the two extras (test-enforced). `/api/standards/comparison` and its CSV need a provider session.

## Traps

- Slots are compared through `getCanonicalSlotId` on both sides, so a renamed slot (LAND_DEED → LAND_RIGHTS) still counts and the evidence line names the row actually stored.
- A primary `docs` slot must be a slot no other paper folds into (test-enforced). SOP_MANUAL absorbs five old per-activity SOPs, so it may only be secondary evidence.
- HEALTH callers read within their holder scope; a non-owner gets the same 404 as not-found.
- The staff path of `GET /api/standards/:code/analyze/:applicationId` (`authenticateAny`) does not add `organizationScope(user)` itself: `analyzeApplication` in `standards-analyzer-service.js` finds by `{ id, isDeleted: false }` plus the holder fragment, which is empty for staff (checked 2026-11-03). Whether the tenant extension still walls it off, and whether finance roles can call it (staff-read-scope ruling 2026-10-06: finance reads billing only), is not proven. Before claiming staff read only their own organization here, prove it with a real-Postgres test.
- Site compliance score (`site-analysis-service.js`, PASS ≥ 70) is a different thing from `readinessPct`.
- The ASEAN 10-country table (`asean-gacp-comparison.js`) has no per-row citation. It is labelled a draft on screen; do not present it as verified.

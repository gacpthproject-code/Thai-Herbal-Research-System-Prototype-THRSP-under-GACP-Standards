# verify-41 — skeptic check: hasWarningSign (state default), farm-info-step.tsx:82 — verdict CUT

Date: 2026-09-01 · Checker role: SKEPTIC (tried to refute the CUT) · Result: **UPHELD**

## Item under check

| field | value |
|---|---|
| name | hasWarningSign (state default) |
| kind | field |
| file:line | apps/web-app/src/app/health/applications/new/_steps/steps/farm-info-step.tsx:82 |
| current UI (Thai) | (ไม่มี UI ในสเต็ปนี้) — state default only, `hasWarningSign: false` |
| proposed verdict | CUT |
| dtamRef in item | A6 |

## What the code actually does (verified this session)

- farm-info-step.tsx:82 sets `hasWarningSign: false` in the initial `formData` state, beside `hasFence` (:79), `hasCCTV` (:80), `hasAccessControl` (:81).
- **No UI in this step renders it.** Grep of the whole file for `hasWarningSign|hasFence|hasCCTV|hasAccessControl|securityChecks` hits only :79-82 (defaults), :257 (`securityChecks` declared via `useState` with **no setter**), and :554 (passed through unchanged). The census's "(ไม่มี UI ในสเต็ปนี้)" is accurate; the value is submitted as a constant `false` on every application.
- Downstream consumers render nothing from a constant false: provider print view shows the "ป้ายเตือน" badge only when true, else "-" (apps/web-app/src/app/provider/applications/[id]/print/client-view.tsx:329-330); document view emits '' (apps/web-app/src/components/application/application-document-view.tsx:280); edit config exposes it as a boolean labeled "ป้ายเตือน" (apps/web-app/src/components/application/application-document-edit-config.ts:101) — all dead weight fed by a constant.

## Refutation attempts (warning-sign-specific, beyond verify-38's shared analysis) and why each fails

1. **กทล.1 itself** — facts.md §1 ส่วนที่ ๒ is the complete fill-in set ("ไม่มีมากกว่านี้"): objective, area type, site name, land document/holding, area size, coordinates, plant quantity, varieties. No signage/security boolean anywhere. Officer checklist (facts.md:56-57) asks for documents, not site attributes. → no กทล.1 field basis.
2. **A6 (facts.md:41) requires security measures at application time — but as a document**: "มาตรการรักษาความปลอดภัย + วิธีนำส่วนของกัญชาที่เหลือไปใช้ประโยชน์ | ทุกราย" — an *attachment upload*, satisfied by the SECURITY_PLAN slot kept elsewhere in the census (backend-slots). Turning the document's content into a wizard boolean is a platform extra → operator ruling 2 (facts.md:68) cuts it.
3. **journey-config-matrix.js `securityRequirements: [... 'warning_signs']`** (apps/backend/data/journey-config-matrix.js:27,57,93,136,184,241,255,265,275; label :328 'ป้ายเตือน') — grep of that file for `พ.ร.บ|กฎกระทรวง|ประกาศ|มาตรา|law` returns **zero matches**: platform-invented seed data with no named-law citation. Not a basis.
4. **document-slots.js PHOTOS_SIGNAGE** (apps/backend/constants/document-slots.js:245-251, description 'ป้ายชื่อสถานที่/ป้ายเตือน/ป้ายความปลอดภัย', required:true) — a *photo slot*, its own census item; even if kept it does not require a boolean form field, and its required:true itself has no กทล.1 row narrower than A7 (รูปถ่ายสถานที่ผลิต). Cannot rescue this field.
5. **docs/requirements/gacp-document-requirements-research.md:345 "มีป้ายแจ้งเตือนข้อห้ามตามกฎหมายติดไว้ในจุดที่เห็นได้ชัดเจน"** — read in context (:319-352), this is a checklist line *inside the §5.3 security-plan document template* for the **ภ.ท. sale/processing licence** procedure under ประกาศ สธ. เรื่อง สมุนไพรควบคุม (กัญชา) พ.ศ. 2565 — a shop's sale-prohibition signage (no sale under 20, pregnant women), a different licence, a different premise type, and even there it is content of a submitted document, not a form boolean. At GACP application time the officer checklist wants only the resulting licence itself (facts.md:56). → no transfer into the กทล.1 wizard.
6. **use-gacp-data.ts:231 `{ id: 'warning_signs', nameTH: 'ป้ายเตือน' ... }`** — frontend master-data mirror of the same uncited journey-config seed. Not a basis.
7. **04-WIZARD-VS-DTAM.md:83,167 (2026-08-21) proposed making these real checkboxes** mapped to กทล.1 ส่วนที่ 3 (f) — that IS attachment A6, a document; the 2026-09-01 operator rulings supersede the proposal: ruling 1 (required set = กทล.1 exactly) + ruling 2 (excess = cut).
8. **MOVE_TO_AUDIT?** — facts.md §3 lists records/logs for audit day; signage is not named there. seed-standards.js has zero matches for ป้าย/sign. The wizard boolean maps to nothing audit-day either. → wrong verdict.
9. **GENERATE / REWORD / OPTIONAL / CONDITIONAL?** — nothing instructs generating an A6 document from wizard booleans (GENERATE is for the filled กทล.1); there is no correct semantics to reword a dead constant into; OPTIONAL still keeps a field DTAM never asks (ruling 2 cuts excess, and the field is not even rendered today); no named conditional case (เช่า/Indoor/นิติบุคคล/ต่ออายุ) attaches to it. → all wrong.

## Verdict

**UPHELD — CUT is correct** for `hasWarningSign` (state default) at farm-info-step.tsx:82, dtamRef A6 as stated. No named Thai-law or ministry-system basis requires a structured warning-sign boolean at GACP application time for cannabis; DTAM's security requirement is attachment A6 — a document upload, already covered by the SECURITY_PLAN slot. Citation: facts.md:41 (A6, ทุกราย) + facts.md:67-68 (operator rulings 1-2). Consistent with verify-38 (hasFence sibling, UPHELD CUT), re-verified independently this session including the warning-sign-specific candidates above.

Metadata note (no effect on verdict): the item's note says "Same as hasCCTV" while census/farm.md:36 says "Same as hasFence" — same sibling family either way.

# verify-40 — skeptic check: hasAccessControl (state default), farm-info-step.tsx:81 — verdict CUT

Date: 2026-09-01 · Checker role: SKEPTIC (tried to refute the CUT) · Result: **UPHELD**

## Item under check

| field | value |
|---|---|
| name | hasAccessControl (state default) |
| kind | field |
| file:line | apps/web-app/src/app/health/applications/new/_steps/steps/farm-info-step.tsx:81 |
| current UI (Thai) | (ไม่มี UI ในสเต็ปนี้) — state default only, `hasAccessControl: false` |
| proposed verdict | CUT |
| dtamRef in item | A6 |
| area | farm |

## What the code actually does (verified this session)

- farm-info-step.tsx:81 sets `hasAccessControl: false` in the initial `formData` state, beside `hasFence` (:79), `hasCCTV` (:80), `hasWarningSign` (:82).
- **No UI in this step renders the boolean.** Grep of farm-info-form-sections.tsx for `hasAccessControl|hasCCTV|hasFence|hasWarningSign` → zero matches; `FarmInfoFormSections` (farm-info-step.tsx:640-678) receives `formData` but never surfaces a security control; `securityChecks` (:257) is declared with no setter and passed through unchanged (:554). The census's "(ไม่มี UI ในสเต็ปนี้)" is accurate — the value is a constant `false` on every web application.
- Downstream consumers only decorate: provider print view shows a badge "ระบบควบคุมการเข้า-ออก" when true, else "-" (apps/web-app/src/app/provider/applications/[id]/print/client-view.tsx:328-330); document view emits 'ควบคุมการเข้าออก' or '' (apps/web-app/src/components/application/application-document-view.tsx:279); an admin edit config exposes it as a boolean (application-document-edit-config.ts:100). None of these creates a legal requirement.

## Refutation attempts and why each fails

1. **กทล.1 fill-in fields** — facts.md §1 ส่วนที่ ๒ lists the complete set ("ทั้งหมดที่ฟอร์มขอ ไม่มีมากกว่านี้"): objective, area type, site name/address, land document + holding status, area size, coordinates, plant quantity, varieties (facts.md:20-25). No access-control or any security question. ส่วนที่ ๑ and ๔ likewise carry none (facts.md:11-16, 27-28). → no กทล.1 field basis.
2. **Security IS required at application time — but as attachment A6, a document** — facts.md:41: "A6 | มาตรการรักษาความปลอดภัย + วิธีนำส่วนของกัญชาที่เหลือไปใช้ประโยชน์ | ทุกราย". The requirement is an uploaded มาตรการรักษาความปลอดภัย document (the platform's SECURITY_PLAN slot, kept elsewhere in the census), not a structured boolean. A boolean duplicating the document's content is a platform extra → cut by operator ruling 2 (facts.md:68), under ruling 1 (required set = กทล.1 ส่วนที่ ๓ exactly, facts.md:67).
3. **journey-config-matrix.js `access_control`** — apps/backend/data/journey-config-matrix.js:56,134,265 lists `access_control` in `securityRequirements`; SECURITY_DEFINITIONS:324 names it "ระบบควบคุมการเข้าออก". Read this session: the file carries **no named-law citation anywhere**, and its content (mantrap doors, biometric access, 24h guards, "research" journeys) is self-evidently platform-invented tiering, not DTAM text. Not a basis.
4. **Mobile app Group-A rule** — apps/mobile-app/lib/presentation/features/application/screens/wizard_steps/step_5_security.dart:32 hard-requires "รั้ว, CCTV, และการควบคุมการเข้าออก" for "Group A"; cannabis_strategy.dart:79-93 wires `hasAccessControl` into it. No named กฎกระทรวง/ประกาศ cited; this is the platform's own invention and itself exceeds the DTAM baseline. Not a basis (and itself a cut candidate on its own surface).
5. **ประกาศ สธ. เรื่อง สมุนไพรควบคุม (กัญชา) — ภท. licence procedure** — apps/backend/constants/document-slots.js:5-17 documents the ภท.09-16 licence forms under กฎกระทรวง พ.ศ. 2559. That is a different procedure from the GACP กทล.1 application; at กทล.1 time the officer checklist asks only for the resulting licence itself (facts.md:56), and even the licence procedure asks for a security-measures *document*, not form booleans. → no transfer of a boolean requirement into the wizard.
6. **04-WIZARD-VS-DTAM.md:167 proposed the opposite** — a 2026-08-21 design proposal to add a checklist (รั้ว / ประตูล็อก / CCTV / **ควบคุมการเข้าออก** / ป้ายเตือน / บันทึกผู้เข้าออก) mapped to "กทล 1 ส่วนที่ 3 (f)" — which *is* attachment A6, a document. The 2026-09-01 operator rulings supersede that proposal: turning a required document into required checkboxes is exactly the platform excess ruling 2 forbids.
7. **MOVE_TO_AUDIT?** — facts.md §3 (audit-day evidence) lists purchase/activity/sales/cleaning/pest/complaint records — no access-control attribute. A6 is application-day but as an upload already covered by the SECURITY_PLAN slot. → wrong verdict.
8. **GENERATE?** — nothing in facts.md instructs generating the A6 document from wizard data; GENERATE is for the filled กทล.1 itself. → wrong verdict.
9. **CONDITIONAL (Indoor/Greenhouse)?** — A6 is "ทุกราย" (facts.md:41) and is still a document; the Indoor/Greenhouse-conditional attachment is A4 (แบบแปลน+ภาพถ่าย, facts.md:38), unrelated to an access-control boolean. → wrong verdict.

## Verdict

**UPHELD — CUT is correct** for `hasAccessControl` (state default) at farm-info-step.tsx:81, dtamRef A6 as census'd. No named Thai-law or ministry-system basis requires a structured access-control boolean at GACP application time for cannabis; DTAM's security requirement is attachment A6, a document upload (มาตรการรักษาความปลอดภัย), satisfied by the SECURITY_PLAN slot kept elsewhere in the census. Citation: facts.md:41 (A6, ทุกราย) + facts.md:67-68 (rulings 1-2).

Consistent with verify-38 (sibling `hasFence`, same conclusion); this check re-verified the shared claims independently in this session.

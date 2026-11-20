# verify-8 — skeptic check: section "ผู้ประสานงาน (ถ้าต่างจากประธาน)" (COMMUNITY) — 2026-09-01

Item under challenge (from census/general.md row 83):
- kind: page-section · file: `apps/web-app/src/app/health/applications/new/_steps/steps/general-step-applicant-sections.tsx:224` (render branch `applicantType === 'COMMUNITY'`, lines 220-248)
- current Thai label: **"ผู้ประสานงาน (ถ้าต่างจากประธาน)"**
- proposed verdict: **CUT** — "ไม่มีใน กทล.1", note: ruling 2, ยกเว้นย้ายช่องอีเมลออกไปเป็นของ ๑.๑ ก่อน

## What the section actually contains (read in full this session)

| line | kind | UI label (Thai) | required? | census row |
|---|---|---|---|---|
| 224 | page-section header | ผู้ประสานงาน (ถ้าต่างจากประธาน) | — | 83 (this item) |
| 228 | field | ชื่อผู้ประสานงาน (`contactName`) | optional | 84 CUT |
| 235 | field | เบอร์โทร (`contactPhone`) | optional | 85 CUT |
| 241 | field | อีเมล (`contactEmail`) | optional | 86 REWORD → ๑.๑ "อีเมล (ถ้ามี)" |

No hidden conditional branches inside the section: it renders unconditionally within the COMMUNITY branch; a twin section exists in the JURISTIC branch at line 409 ("ถ้าต่างจากกรรมการ") — separately CUT by general.md rows 114-117, not this item.

## Refutation attempts (skeptic pass — every basis I could hunt)

1. **กทล.1 ส่วนที่ ๑.๑ (วิสาหกิจชุมชน)** — facts.md:14 lists the complete field set: ชื่อประธาน · ชื่อวิสาหกิจ · เลขบัตร ปชช. ประธาน · สัญชาติ · รหัสทะเบียน สวช.01 · เลขรหัสประจำบ้าน · ที่อยู่ตามทะเบียนบ้าน · โทรศัพท์มือถือ · อีเมล (ถ้ามี). **No coordinator/contact-person field.** The phone and email the form asks belong to the applicant (president/enterprise), not a third person.
2. **กทล.1 ส่วนที่ ๒ ข้อ ๑** (facts.md:23) — asks โทรศัพท์ + โทรสาร **ของสถานที่ปลูก/แปรรูป** (site phone), not a coordinator person. Maps to the farm section, not here. Not a basis.
3. **กทล.1 ส่วนที่ ๓ / ส่วน จนท.** (facts.md:30-57) — attachments and officer checklist; no coordinator anywhere. The closest object, "หนังสือแสดงว่าผู้ยื่นได้รับมอบหมายให้ดำเนินกิจการแทนวิสาหกิจ" (facts.md:48), is an *attachment* naming the delegated operator — already covered by the upload slot at line 268 (general.md row 89 REWORD), and operator ruling 3 (facts.md:69) explicitly forbids building a delegation *feature*. A contact-info section is not that document. Not a basis.
4. **[ข้อกำหนด] conditions** (facts.md:59-64) — audit-day records and process only; no coordinator. Not a basis.
5. **Repo-wide search for a named Thai-law basis** — grep for ผู้ประสานงาน across the repo (19 files) and for named instruments (กฎกระทรวง/ประกาศกระทรวง/ประกาศกรม) within 200 chars of ผู้ประสานงาน/ผู้ติดต่อ (multiline): **zero matches**. Every ผู้ประสานงาน hit is a *platform staff role* or letter boilerplate, not an applicant obligation: seed scheduler title (`apps/backend/prisma/seed-gacp.js:216`), officer scheduling role (`docs/manual/USER-MANUAL.md:21,214`), technical-coordinator line in the BORA credential letters (`docs/auth/CREDENTIAL-REQUEST-2026-08-19.md:45`), runbook operator (`docs/operations/runbooks/preview-stack.md:4`), provider coordinator pages (officer UI). Not a basis.
6. **Backend enforcement** — `apps/backend/validation/canonical-application-validator.js:127` uses `contactPhone` only as a *fallback* for the applicant phone; `contactName`/`contactEmail` are required nowhere. The only other backend uses are billing-contact projections (`apps/backend/services/entity-service.js:1478-1507`, `services/pdf/invoice-template-service.js`) — platform internals, not law. Not a basis.
7. **กรม e-service (cannabis-gacp-thaicam.dtam.moph.go.th)** — facts.md:75 marks it UNVERIFIED (domain unreachable during research). Per the census ground rules a guess is not a basis.
8. **Prior independent read** — `reports/design-cleanup-2026-08-21/04-WIZARD-VS-DTAM.md:61` reached the same conclusion from the real form: "ผู้ประสานงาน ชื่อ/โทร/อีเมล (วิสาหกิจ+นิติ) | ไม่ | **ตัด** … DTAM ขอเบอร์ผู้ยื่นเท่านั้น".

## Vocabulary check — why CUT and not OPTIONAL

The fields are already optional in the UI, so OPTIONAL ("labeled ไม่บังคับ, counts for nothing") is the nearest rival verdict. It fails on ruling 2 (facts.md:68): "หัวข้อ/ตัวเลือกใน wizard ที่เกินความต้องการ DTAM = **ตัด** (ความเร็วไม่ใช่ปัญหา ความเกินคือปัญหา)". A header + 3 fields with no DTAM basis is exactly the excess the ruling orders removed; keeping it as labeled-optional is what the wizard does today.

## Dependency check (the note's caveat is real and already handled)

`contactEmail` (line 241) is the **only** email field in the entire COMMUNITY branch, and กทล.1 ๑.๑ *does* ask "อีเมล (ถ้ามี)" (facts.md:14). Cutting the section before relocating that field would create a ของขาด. general.md row 86 already carries the REWORD (move to ๑.๑ main section as "อีเมล (ถ้ามี)"), and general.md:18 lists "อีเมลหลักของวิสาหกิจ (๑.๑)" under ของขาด. The CUT note's ordering condition ("ย้ายช่องอีเมลออกไปเป็นของ ๑.๑ ก่อน") is correct and internally consistent.

## Verdict

**UPHELD — CUT** (with the email-relocation precondition preserved: execute row 86's REWORD before or together with this cut). No named กทล.1 field, no ข้อกำหนด clause, and no other citable Thai-law or ministry-system basis requires a coordinator contact at application time for cannabis. Citation: facts.md §1 ส่วนที่ ๑.๑ (complete field list, no coordinator) + operator ruling 1 & 2 (facts.md:67-68).

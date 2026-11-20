# verify-15 — skeptic check: "ตำแหน่ง (กรรมการ)" @ general-step-applicant-sections.tsx:371

Date: 2026-09-01 · Role: SKEPTIC (try to refute CUT) · Read-only census

## Item under challenge

| file:line | UI shows | binding | census verdict |
|---|---|---|---|
| apps/web-app/src/app/health/applications/new/_steps/steps/general-step-applicant-sections.tsx:371 | Input label "ตำแหน่ง", placeholder "เช่น กรรมการผู้จัดการ", NOT marked required | `formData.directorPosition` | CUT — "ไม่มีใน ๑.๓" |

Context (read lines 289-430): field sits in the JURISTIC branch (`applicantType === 'JURISTIC'`), section "กรรมการผู้มีอำนาจลงนาม", between "ชื่อ-นามสกุล กรรมการ" (line 364, required) and "เลขบัตรประชาชนกรรมการ" (line 379).

## Baseline check (facts.md — the legal authority)

- §1 ส่วนที่ ๑.๓ นิติบุคคล asks exactly: ชื่อนิติบุคคล · ชื่อผู้มีอำนาจลงนาม · เลขทะเบียนนิติบุคคล/เลขผู้เสียภาษี · ที่อยู่ · โทรศัพท์มือถือ · อีเมล (ถ้ามี) · Line ID (facts.md:16). **No ตำแหน่ง field.** The form asks only the signatory's NAME.
- §2 นิติบุคคล qualification attachments (facts.md:50): สำเนาหนังสือรับรองจดทะเบียนนิติบุคคล (≤6 เดือน) + บัญชีรายชื่อกรรมการ/หุ้นส่วน/สมาชิก + หนังสือแสดงว่าผู้ยื่นเป็นผู้แทน/ผู้มีอำนาจทำการแทน — the director list and signing authority are proven by ATTACHMENTS; the position is already inside the DBD certificate. No typed position field anywhere.
- §4 (facts.md:28) self-certification block — no ตำแหน่ง line recorded.
- Operator rulings 1+2 (facts.md:67-68): required set = กทล.1 exactly; wizard items beyond DTAM = ตัด.

## Refutation attempts (repo-wide search for any other Thai-law basis)

1. `directorPosition` across repo → 7 files: the wizard file itself, its types (general-step-types.ts, domain-types.ts), provider print view (print-page-types.ts, client-view.tsx), entity-service.js:1477 (plain mapping `position: a.directorPosition || null`), and the census file. All plumbing, zero legal citation.
2. docs/ search for ตำแหน่ง + กรรมการ/ผู้มีอำนาจ → only docs/requirements/gacp-document-requirements-research.md:272 — a signature block ("ตำแหน่ง: [กรรมการผู้จัดการ/เจ้าของกิจการ]") in a COVER-LETTER TEMPLATE for แบบ ภ.ท.12 (ใบอนุญาตจำหน่าย/แปรรูปสมุนไพรควบคุม under กฎกระทรวง/ประกาศ สธ. สมุนไพรควบคุม (กัญชา) พ.ศ. 2565). That is (a) a different application (herb-control licence, not GACP กทล.1), (b) a letter signature line, not a data field the form asks — no basis for an application-time wizard field.
3. apps/backend/constants search for ตำแหน่ง → no matches.
4. prisma schema search → auth.prisma:94 `representativePosition` marked `@deprecated Wave D Phase 5a`; farm.prisma:181 `personRole` (farm staff, unrelated). No legal requirement encoded.
5. docs/requirements/official-gacp-requirements-dtam.md → no ตำแหน่ง/position mention at all.
6. docs/testing/health-wizard-manual-qa-addendum...applicant-types.md:110 names "รายชื่อกรรมการผู้มีอำนาจลงนาม" as a DOCUMENT (= the บัญชีรายชื่อกรรมการ attachment) — consistent with facts.md §2, not a typed field.

No named กฎกระทรวง/ประกาศ/พ.ร.บ. found in the repo that requires the director's position as application-time DATA for cannabis GACP.

## Why not OPTIONAL / REWORD

- OPTIONAL requires an articulable use; "reviewer might like it" is vibes — and the position is already visible in the mandatory DBD-certificate attachment (facts.md:50), so the field duplicates an attachment. Ruling 2 kills duplicative extras.
- REWORD does not apply: the label is not wrong semantics for a kept item; the item itself has no กทล.1 slot to map to.
- Prior independent check verify-6.md:63 reached the same CUT on this same field (then counted at line 370).

## Verdict

**UPHELD — CUT** stands. Citation: facts.md §1 ส่วนที่ ๑.๓ (closed field list, no ตำแหน่ง) + §2 นิติบุคคล attachment row (position lives in the DBD certificate attachment) + operator rulings 1-2.

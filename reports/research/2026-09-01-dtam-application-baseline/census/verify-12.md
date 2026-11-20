# verify-12 — skeptic check: เลขประจำตัวผู้เสียภาษี (JURISTIC), verdict CUT

Item under review (census proposal):
- Field: `taxId` — label "เลขประจำตัวผู้เสียภาษี" (required)
- File: `apps/web-app/src/app/health/applications/new/_steps/steps/general-step-applicant-sections.tsx:332`
- Proposed verdict: **CUT** — duplicate of เลขทะเบียนนิติบุคคล (same file line 324), dtamRef ๑.๓

## Verdict: **UPHELD — CUT** (with a merge caveat for the implementer, below)

## What the UI actually shows (both fields of the pair, JURISTIC branch)
| file:line | Thai label | required | validation |
|---|---|---|---|
| general-step-applicant-sections.tsx:324 | เลขทะเบียนนิติบุคคล (placeholder "13 หลัก") | yes | `v.require` only — **no check digit** (general-step.tsx:181) |
| general-step-applicant-sections.tsx:332 | เลขประจำตัวผู้เสียภาษี | yes | `v.require` + `v.healthId` check digit (general-step.tsx:182,191) |

## DTAM baseline (facts.md)
- §1 ส่วนที่ ๑ ข้อ ๑.๓ (facts.md:16): the กทล.1 form asks the juristic applicant for **one** slot — "เลขทะเบียนนิติบุคคล/เลขผู้เสียภาษี" (slash: one number, one field). There is no second number anywhere on the form.
- Operator ruling 2 (facts.md:68): anything the wizard asks beyond DTAM's need = cut.

## Refutation attempts (what I searched for, and why each fails)

### 1. ป.รัษฎากร ม.86/4 — the strongest candidate, and it still fails
The repo has a real, named-law consumer of the buyer's tax ID: the platform issues a full tax invoice (ใบกำกับภาษีเต็มรูป, ม.86/4 ป.รัษฎากร — `apps/backend/config/invoice-issuers.js:132,151,344-347`), and the billing pipeline reads `applicant.taxId` for WHT/VAT reporting (`apps/backend/services/wht-service.js:559-571`, `apps/backend/services/vat-report-service.js:220-232`, `invoice-step.tsx:234-237`).

This is a basis for **having the number** — not for asking it **twice**. For a Thai-registered juristic person the corporate tax ID IS the DBD registration number, which the repo itself asserts in three independent places:
- `general-step.tsx:187-190` — "in Thailand the juristic registration number and the corporate tax ID are one number ... only the name on the form differs"
- `apps/backend/config/invoice-issuers.js:327-330` — "Hence taxId === registrationNo"
- `docs/deployment/production-runbook.md:111` — "same as taxId in Thailand — DBD ↔ Revenue Department single-number policy"

And the billing resolver already falls back through the registration number: `apps/backend/utils/applicant-resolver.js:91` — `fd.applicantInfo?.taxId || applicant.taxId || applicant.companyRegistrationNumber || '-'`. The ม.86/4 need is fully satisfied by the single ๑.๓ slot.

### 2. A cannabis-licence กฎกระทรวง/ประกาศ naming tax ID at application time
Searched `docs/`, `apps/backend/constants`, `apps/backend/shared`, `prisma` for เลขประจำตัวผู้เสียภาษี / เลขผู้เสียภาษี / tax id tied to any named ministry rule. Every hit is Revenue-Code billing plumbing (ม.86/4 invoices, ภ.ง.ด.53 WHT, ภ.พ.30 VAT — `apps/backend/prisma/schema/billing.prisma:1155,1193`, `docs/api/error-codes.md:323-329`) or PDPA encryption of the stored column (`apps/backend/utils/field-encryption.js:8`). Nothing names a กฎกระทรวง/ประกาศ requiring a tax ID as a separate datum on a GACP (or cannabis-licence) application. The กทล.1 officer checklist (facts.md:56) asks for the juristic registration evidence, not a tax document.

### 3. Non-DBD juristic entities whose RD-issued TIN differs from a registration number
Theoretically possible (foreign entities, unregistered partnerships), but (a) the wizard's JURISTIC path is built around Thai DBD registration (COMPANY_TYPES, company registration certificate upload), (b) the กทล.1 form still shows one combined slot, and (c) no repo document names such a case. Not a citable basis.

## Conclusion
The field at line 332 asks the applicant to type the same 13-digit number a second time. The กทล.1 has one slot (๑.๓); the second field has no DTAM basis and no other named Thai-law basis that survives the single-number policy. **CUT is correct.**

## Caveat for the implementer (does not change the verdict)
Cut = **merge, not naive delete**:
1. The surviving single field should carry the form's own combined label "เลขทะเบียนนิติบุคคล/เลขผู้เสียภาษี" (that is the registrationNumber row's business — its census row should be REWORD/KEEP per ๑.๓).
2. The check-digit validation currently lives only on `taxId` (`general-step.tsx:191`); the surviving field has none (`general-step.tsx:181`). Move `v.healthId` to the survivor or the cut silently weakens validation.
3. Downstream readers of the `taxId` datum must be fed from the surviving field: `apps/backend/validation/wizard-step-prerequisites.js:127`, `apps/web-app/.../hooks/use-application-flow-store.ts:217`, `review-step-helpers.ts:55,299`, `invoice-step.tsx:234-237`, `apps/backend/validation/canonical-application-validator.js:137,267`, `wht-service.js:559-571`, `vat-report-service.js:228-232`. The ม.86/4 tax-invoice path must keep receiving the number.

— verify-12, 2026-09-01 (read-only census check; no source files touched)

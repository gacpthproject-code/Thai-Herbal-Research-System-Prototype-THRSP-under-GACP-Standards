# verify-23 — skeptic check: `subdistrict` (declared, unrendered) in general step — 2026-09-01

## Item under challenge
- File: `apps/web-app/src/app/health/applications/new/_steps/steps/general-step-types.ts:11` — `subdistrict?: string` in `LocalApplicantData`
- Census verdict proposed: **CUT** ("กทล.1 ขอที่อยู่เป็นช่องเดียว")
- Role: SKEPTIC — tried to refute the cut.

## What the code actually does (verified this session)
- The slot is **declared but never rendered** in the general (applicant) step:
  - `general-step-applicant-sections.tsx:85-87` renders exactly one address input bound to `formData.address` — no province/district/subdistrict/postalCode inputs exist in the applicant sections.
  - `general-step.tsx:155` requires only `address` (`v.require('address', formData.address)`); lines 79 and 121 prefill only `address` from the user profile.
- The dead slot still flows through submission as an always-empty string: `apps/backend/services/application-service/application-submission-methods.js:41` (`subdistrict: applicantData.subdistrict`) and `:120` (`String(applicantData?.subdistrict || '')`).
- Backend contract does not require it: `apps/backend/shared/zod-schemas.js:145` — `subdistrict: z.string().max(100).optional()`.
- Distinct item, not this one: the **farm-info step** renders its own subdistrict select (`farm-info-form-sections.tsx:202-221`, `farm-info-step.tsx:443` requires it) — that is the ส่วนที่ ๒ ที่ตั้งแปลง surface with its own census row, and its downstream uses (certificate snapshot, T&T public projection) all read the **farm** row, not this applicant slot.

## DTAM basis check (facts.md = authority)
- ส่วนที่ ๑ asks the applicant's address as **one field** for all three types: ๑.๑ วิสาหกิจชุมชน "ที่อยู่ตามทะเบียนบ้าน", ๑.๒ บุคคลธรรมดา "ที่อยู่", ๑.๓ นิติบุคคล "ที่อยู่" (facts.md:14-16). No decomposition into ตำบล/อำเภอ/จังหวัด appears anywhere in the กทล.1 extract for the applicant.
- Ruling 2 (facts.md:68): wizard items beyond DTAM's ask = cut.

## Refutation attempts (all failed)
1. **Named Thai-law basis elsewhere in the repo?** Searched `docs/`, `apps/backend/shared`, `apps/backend/services/application-service`, prisma schemas. Every ตำบล/subdistrict hit is either the farm's location (certificate-revision spec/plan, planting-T&T spec — farm surface), the user profile (`docs/contract/manual/01-identity-health-id.md:150` — optional profile fields), or DTAM's own office address (`docs/architecture/dtam-collection-agent-2026-05-16.md`). No named กฎกระทรวง/ประกาศ requiring the applicant's address structured at application time. Nothing citable.
2. **GENERATE angle** (structured input needed to produce the filled กทล.1)? Fails: the form has a single ที่อยู่ blank and the wizard already collects the full address as one required string — that string fills the blank; decomposition adds nothing the generator needs.
3. **OPTIONAL angle**? Fails: the slot is not even rendered, so it is not a useful-but-unlabeled input — it is dead type surface plus an always-empty passthrough. Nothing to label ไม่บังคับ.
4. **e-service ask?** facts.md:75 marks the DTAM e-service's own upload/field list UNVERIFIED — cannot serve as a basis per the census rules (a guess is not a basis).

## Verdict
**UPHELD — CUT.** Citation: facts.md ส่วนที่ ๑ (๑.๑–๑.๓: ที่อยู่ is a single field) + operator ruling 2 (facts.md:68). No other Thai-law or ministry-system basis found in the repo.

Cleanup note for the implementer (consequence, not basis): removing the slot should also drop the applicant-side passthroughs at `application-submission-methods.js:41,120`, the sibling declaration at `hooks/domain-types.ts:37`, and may leave `zod-schemas.js:145` untouched (it is optional and shared). The farm-info subdistrict is a separate census item and is NOT covered by this verdict.

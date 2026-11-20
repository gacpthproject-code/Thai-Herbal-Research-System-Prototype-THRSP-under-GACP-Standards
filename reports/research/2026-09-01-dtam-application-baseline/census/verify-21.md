# verify-21 — SKEPTIC check: `province` (declared, unrendered) in LocalApplicantData — 2026-09-01

Item under challenge (census proposal):
`province?: string` — apps/web-app/src/app/health/applications/new/_steps/steps/general-step-types.ts:9 — kind: slot — proposed verdict **CUT** ("ประกาศใน type แต่ไม่ได้ render ในสเต็ปนี้ · กทล.1 ขอที่อยู่เป็นช่องเดียว").

## Verdict: UPHELD — CUT

## What I checked (all read-only, this session)

### 1. Is it really unrendered? — YES, confirmed
- Grep over the whole wizard (`apps/web-app/src/app/health/applications/new/`, pattern `province`, case-insensitive): every render hit is **farmData** (farm-info-form-sections.tsx:162-189, farm-info-step.tsx) — a different slot, already KEEP'd in census/farm.md row 22 under ส่วนที่ ๒ ข้อ ๑.
- general-step.tsx and general-step-applicant-sections.tsx contain **zero** references to `province`.
- What the general step actually renders for address, per applicant-type branch (no branch skipped):
  - INDIVIDUAL: general-step-applicant-sections.tsx:83 — "ที่อยู่ตามทะเบียนบ้าน" → `formData.address` (single text field)
  - COMMUNITY: general-step-applicant-sections.tsx:150 — "ที่อยู่วิสาหกิจชุมชน" → `formData.communityAddress` (single text field)
  - JURISTIC: general-step-applicant-sections.tsx:316 — "ที่อยู่จดทะเบียน" → `formData.companyAddress` (single text field)
- Nothing writes `applicantData.province`: no input, no profile prefill, no hydration path found in use-auto-save.ts / use-application-flow-store.ts / wizard-context.

### 2. Do any consumers depend on it? — Only tolerant dead reads (implementation note, not a basis)
- invoice-step.tsx:239-247 — joins `[address, district, province, postalCode].filter(Boolean)`; province is always `undefined` from the wizard, silently dropped.
- apps/backend/services/application-service/application-submission-methods.js:39 (copied to `user.province`) and :118 (`String(applicantData?.province || '')` into strictFormData) — always-empty copy-through, **never validated as required**.
- apps/backend/utils/applicant-resolver.js:108 — same `.filter(Boolean)` join pattern; tolerant of absence.
- prisma: auth.prisma:126 `province String?` on User — optional/nullable. certification.prisma:41 and farm.prisma:30 are the **farm/certificate** province (separate KEEP'd item), not the applicant's.
- Consequence: cutting the slot breaks nothing; a clean cut would also remove the dead reads above (implementation detail for the executor, does not change the verdict).

### 3. DTAM basis for a structured applicant province? — NONE
- facts.md §1 ส่วนที่ ๑ (lines 14-16): every applicant type gets **ที่อยู่ as a single field** ("ที่อยู่ตามทะเบียนบ้าน" / "ที่อยู่") — no separate จังหวัด/อำเภอ/ตำบล boxes for the applicant.
- The only จังหวัด-shaped location the form structures at all is the farm's ที่ตั้ง (ส่วนที่ ๒ ข้อ ๑) — covered by farmData.province (census/farm.md row 22, KEEP).
- facts.md §4 ruling 1-2: required set = กทล.1 exactly; anything beyond DTAM's ask = cut.

### 4. Any OTHER named Thai-law/ministry basis in the repo? — NONE FOUND
- docs/ grep for applicant-province requirements (จังหวัด.*ผู้ขอ etc.): no matches.
- Tax-invoice angle considered (ใบกำกับภาษีต้องมีที่อยู่ผู้ซื้อ): satisfied by the single address line; no law in the repo cites a structured province requirement, and the invoice step already composes from `address` — with province contributing nothing today.
- No กฎกระทรวง/ประกาศ citation anywhere in docs/, shared/, apps/backend/constants tying a structured **applicant** province to application time for cannabis.

## Item row (census format)
| file:line | UI shows | verdict | citation |
|---|---|---|---|
| general-step-types.ts:9 `province?: string` (LocalApplicantData slot) | nothing — declared, never rendered in the general step; applicant address is one field per type (sections tsx:83/150/316) | **CUT** | No กทล.1 field: ส่วนที่ ๑ asks ที่อยู่ as a single line (facts.md:14-16); farm's จังหวัด is a different slot (ส่วนที่ ๒ ข้อ ๑, farm.md row 22). No other named Thai-law basis found in repo. |

Note for the executor: lines 10-12 of the same type (`district`, `subdistrict`, `postalCode`) share the identical dead-slot pattern and consumers; if they are separate census items, the same evidence applies.

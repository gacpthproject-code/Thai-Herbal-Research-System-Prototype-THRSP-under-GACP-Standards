# verify-24 — postalCode (applicant slot, declared unrendered) — SKEPTIC check

Item under challenge: `postalCode?: string` — `apps/web-app/src/app/health/applications/new/_steps/steps/general-step-types.ts:12` (`LocalApplicantData`), census verdict **CUT**. Checked 2026-09-01, read-only.

## Verdict: UPHELD — CUT stands

## 1. What the code actually does (refutation attempt: "maybe it IS rendered or load-bearing")

Producers — none:
- `general-step-applicant-sections.tsx:85-87` renders exactly ONE address input for the applicant, bound to `formData.address`. No input binds `postalCode` (grep over the applicant sections finds no `postalCode`/`province`/`district` at all).
- `general-step.tsx:79,121` hydrates only `address` from the user profile; `general-step.tsx:155` requires only `address`. Nothing ever writes `applicantData.postalCode` — repo-wide grep finds zero writers. The slot is always `undefined`.
- The wizard's only postalCode INPUT is `farmData.postalCode` (`farm-info-form-sections.tsx:226-232`, validated in `farm-info-step.tsx:429-451`) — a **different census item**, already KEEP (census/farm.md row 25, ส่วนที่ ๒ ข้อ ๑). This cut does not touch it.

Consumers — all tolerant of absence:
- `invoice-step.tsx:239-247` — `[address, district, province, postalCode].filter(Boolean).join(' ')`; the always-undefined postalCode is silently dropped, address composes from `address` alone.
- `app/provider/applications/[id]/print/client-view.tsx:170` — `renderField('รหัสไปรษณีย์', applicantData?.postalCode)`; renders the empty state today.
- Backend: `utils/applicant-resolver.js:106-110` (`filter(Boolean)` join), `services/application-service/application-submission-methods.js:42` (`zipCode: applicantData.postalCode`, undefined-tolerant) and `:121` (`String(applicantData?.postalCode || '')`).
- `apps/backend/validation/` (canonical-application-validator.js, application-submission-validator.js, wizard-step-prerequisites.js) — zero mentions of `postalCode`/`zipCode`. Submit does not require it.

So the census note is accurate: declared, unrendered, dead slot.

## 2. Legal-basis search (refutation attempt: "maybe some Thai law asks for it")

- facts.md §1 ส่วนที่ ๑ (lines 14-16): every applicant type gets **ที่อยู่ as a single field** — วิสาหกิจชุมชน "ที่อยู่ตามทะเบียนบ้าน", บุคคลธรรมดา "ที่อยู่", นิติบุคคล "ที่อยู่". No discrete รหัสไปรษณีย์ box exists anywhere in the coordinator's full-text extract of กทล.1. A postal code, when the applicant has one, belongs inside that single address line.
- facts.md §2 ส่วนสำหรับเจ้าหน้าที่ (line 56): the officer checklist asks for copies of บัตร ปชช./ทะเบียนบ้าน — attachments, not a structured postal-code field.
- Repo sweep for another named basis: docs/ hits are farm-postal QA checklists (docs/backlog/health-wizard-core-step-validation-manual-test-checklist.md — farmData), the platform's own finance config (`DTAM_ADDRESS_LINE2` in docs/deployment/production-runbook.md:123 — DTAM's address on receipts, not an applicant requirement), and a data-sovereignty audit listing Farm columns. No กฎกระทรวง/ประกาศ/ministry-system citation requiring an applicant postal code at application time for cannabis.
- Tax-invoice angle considered and rejected: the Revenue Code requires the buyer's address on a tax invoice, which the collected single `address` field satisfies; it names no discrete postal-code field, and it is a payment-side concern, not a กทล.1 application field. Operator ruling 1 (facts.md §4): required set = กทล.1 exactly.

## 3. Consistency with sibling rulings

Identical dead-slot pattern as `province` (verify-21, UPHELD CUT), `district` (verify-22) and `subdistrict` (verify-23) — same one-address-input renderer, same tolerant consumers, same absent legal basis. general.md row 134 already records this row as CUT with the same rationale.

## 4. Note for the executor

Removing the type slot should be paired with cleaning its tolerant readers or TS will flag them: `invoice-step.tsx:244`, `print/client-view.tsx:170` (and its `print-page-types.ts:25`), plus the mirror `postalCode?` in `hooks/domain-types.ts:38`; backend readers `applicant-resolver.js:109` and `application-submission-methods.js:42,121` are plain JS and degrade silently. `farmData.postalCode` (KEEP) must not be touched.

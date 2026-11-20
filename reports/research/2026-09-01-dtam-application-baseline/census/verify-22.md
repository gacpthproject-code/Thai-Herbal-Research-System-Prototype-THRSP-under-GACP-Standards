# verify-22 — SKEPTIC check: `district` (declared, unrendered) in LocalApplicantData — 2026-09-01

Item under challenge (census proposal):
`district?: string` — apps/web-app/src/app/health/applications/new/_steps/steps/general-step-types.ts:10 — kind: slot — proposed verdict **CUT** (dtamRef "กทล.1 ขอที่อยู่เป็นช่องเดียว", note "เดียวกัน" — same reasoning as the province sibling, general.md row 132).

## Verdict: UPHELD — CUT

## What I checked (all read-only, this session; independent re-verification, not a copy of verify-21)

### 1. Is it really unrendered on the applicant side? — YES, confirmed
- Grep over the whole wizard (`apps/web-app/src/app/health/applications/new/`, pattern `district`, case-insensitive): every render hit is the **farm** step — farm-info-form-sections.tsx:169-192 (อำเภอ/เขต select or text input bound to `formData.district`), farm-info-step.tsx:99-128 (district master-data load), :368-371 (handleDistrictChange), :442 (`requireField('district', ...)`). That is **farmData.district** — a different census item (farm area, DTAM basis = ส่วนที่ ๒ ข้อ ๑ ที่ตั้งของสถานที่), not this slot.
- The general (applicant) step renders **zero** district inputs: general-step-applicant-sections.tsx renders address as a single text field (`formData.address`, line 85); general-step.tsx initializes only `address` from the user profile (:79, :121) and validates only `address` (:155 `v.require('address', ...)`). No branch of any applicant type (INDIVIDUAL / COMMUNITY / JURISTIC) renders an applicant-side district field.
- Nothing writes `applicantData.district` anywhere in the wizard.

### 2. Do any consumers depend on it? — Only tolerant dead reads (implementation notes, not a legal basis)
- invoice-step.tsx:239-247 — `[address, district, province, postalCode].filter(Boolean).join(' ')` for the invoice's applicant address display; district is always `undefined` from the wizard and silently dropped. The composed address still works from `address` alone.
- apps/backend/services/application-service/application-submission-methods.js:40 — copy-through into `user.district` (auth.prisma:127 `district String?` — optional/nullable, accepts undefined); :119 — `String(applicantData?.district || '')` into strictFormData — always-empty tolerated, **never validated as required**.
- apps/backend/utils/applicant-resolver.js:107 — `fd.applicantInfo?.district || applicant.district` fallback read, tolerant of absence.
- prisma: certification.prisma:42 and farm.prisma:31 `district` are the **farm/certificate** location (the separately KEEP'd farm slot feeding `FARM_LOCATION` on the certificate, docs/pdf/certificate-sample-2026-05-16.md:101), not the applicant's address.
- Consequence: cutting the slot breaks nothing at runtime; the executor should also remove the dead reads above in the same pass (detail only — does not change the verdict).

### 3. DTAM basis for a structured applicant อำเภอ? — NONE
- facts.md §1 ส่วนที่ ๑ (lines 14-16): every applicant type gets **ที่อยู่ as a single field** — วิสาหกิจชุมชน: "ที่อยู่ตามทะเบียนบ้าน"; บุคคลธรรมดา: "ที่อยู่"; นิติบุคคล: "ที่อยู่". No separate จังหวัด/อำเภอ/ตำบล/รหัสไปรษณีย์ boxes for the applicant appear in the coordinator's full-text extract.
- The only structured location the form asks for is the farm's ที่ตั้ง (facts.md:23, ส่วนที่ ๒ ข้อ ๑) plus the A3 map attachment (facts.md:37) — both covered by farm-side slots, already rendered and censused separately.
- facts.md §4 rulings 1-2: required set = กทล.1 exactly; anything beyond DTAM's ask = cut.

### 4. Any OTHER named Thai-law/ministry basis in the repo? — NONE FOUND
- docs/ grep for `อำเภอ`: all hits are farm-location surfaces (certificate FARM_LOCATION template, planting T&T public QR spec 2026-08-20/21, farm form user manual :303, certificate-revision spec) or DTAM's own office address — none is a named กฎกระทรวง/ประกาศ requiring the **applicant's** structured district at application time for cannabis.
- apps/backend/constants: zero hits for `district`. No `shared/` directory exists.
- Tax-invoice angle (ใบกำกับภาษีต้องมีที่อยู่ผู้ซื้อ, ประมวลรัษฎากร ม.86/4): satisfied by the single address line; no repo document cites a structured-district requirement, and the invoice step composes from `address` — district contributes nothing today.

## Item row (census format)
| file:line | UI shows | verdict | citation |
|---|---|---|---|
| general-step-types.ts:10 `district?: string` (LocalApplicantData slot) | nothing — declared, never rendered in the general step; applicant address is one field per type (general-step-applicant-sections.tsx:85, validated at general-step.tsx:155) | **CUT** | No กทล.1 field: ส่วนที่ ๑ asks the applicant's ที่อยู่ as a single line (facts.md:14-16); the form's only structured อำเภอ is the farm's ที่ตั้ง (ส่วนที่ ๒ ข้อ ๑, facts.md:23 — separate farm-step slot). Rulings 1-2 (facts.md:67-68). No other named Thai-law basis found in docs/, apps/backend/constants, or prisma. |

Consistency note: identical dead-slot pattern as `province` (verify-21, UPHELD CUT) and as siblings `subdistrict`/`postalCode` (general.md rows 133-134) — same renderers, same tolerant consumers, same absent legal basis.

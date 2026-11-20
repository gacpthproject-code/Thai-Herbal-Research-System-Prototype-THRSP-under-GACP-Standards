# verify-9 — SKEPTIC check: "ชื่อผู้ประสานงาน" (COMMUNITY) @ general-step-applicant-sections.tsx:228 — 2026-09-01

Challenged item: `{name: "ชื่อผู้ประสานงาน (COMMUNITY)", kind: field, line: 228, verdict: CUT, dtamRef: "ไม่มีใน กทล.1"}`
Role: refute the CUT if any named Thai-law / ministry-form basis requires this at application time for cannabis.

## Verdict: CUT **UPHELD**

## What the UI shows (read this session)

File: `apps/web-app/src/app/health/applications/new/_steps/steps/general-step-applicant-sections.tsx`, rendered only when `formData.applicantType === 'COMMUNITY'`:

| line | kind | Thai label | required? | verdict (census) | my finding |
|---|---|---|---|---|---|
| 224 | page-section | "ผู้ประสานงาน (ถ้าต่างจากประธาน)" | — | CUT | consistent — no กทล.1 basis |
| **228** | **field** | **"ชื่อผู้ประสานงาน"** (`contactName`) | no | **CUT** | **UPHELD — see evidence** |
| 235 | field | "เบอร์โทร" (`contactPhone`) | no | CUT | consistent |
| 241 | field | "อีเมล" (`contactEmail`) | no | REWORD → อีเมล (ถ้ามี) ใน ๑.๑ | correctly does NOT rescue 228: ๑.๑ has an email slot but no second person-name slot |

## Refutation attempts and why each failed

1. **กทล.1 itself** — facts.md §1 ส่วนที่ ๑.๑ (วิสาหกิจชุมชน) is a closed list: ชื่อประธาน · ชื่อวิสาหกิจ · เลขบัตร ปชช. ประธาน · สัญชาติ · รหัสทะเบียน สวช.01 · เลขรหัสประจำบ้าน · ที่อยู่ตามทะเบียนบ้าน · โทรศัพท์มือถือ · อีเมล (ถ้ามี) (facts.md:14). No coordinator/contact-person field in ส่วนที่ ๑, ๒, ๔ (facts.md:11-28) nor in the ส่วนที่ ๓ attachment list (facts.md:30-53). The form's only person-name slot for ๑.๑ is ชื่อประธาน — already covered by line 191 (KEEP).
2. **หนังสือมอบหมายให้ดำเนินกิจการแทนวิสาหกิจ** — the nearest legal concept naming a second person, but facts.md:48 lists it as an *attachment* (กลุ่มคุณสมบัติ วิสาหกิจชุมชน) and operator ruling 3 (facts.md:69) explicitly keeps it as an attachment and forbids a delegation feature. An attachment slot cannot ground a typed "coordinator name" wizard field.
3. **Repo-wide search for another named basis** — `ผู้ประสานงาน` hits in `docs/requirements/gacp-master-brief-canonical.md:25` are the platform's own staff role (Coordinator = เจ้าหน้าที่ประสานงานและจัดคิวงาน, assigns auditors), not an applicant-form field. `docs/requirements/official-gacp-requirements-dtam.md` has zero mention (ประสานงาน/ผู้ติดต่อ/contact person: no matches). No กฎกระทรวง/ประกาศ citation for a coordinator field exists anywhere in docs/, apps/backend/constants, shared/, or prisma.
4. **Backend enforcement** — `apps/backend/validation/canonical-application-validator.js:127` uses `applicant.contactPhone` only as a *fallback* for the single required phone (whose กทล.1 basis is ๑.๑ โทรศัพท์มือถือ = presidentPhone); `contactName` is required nowhere (`application-schemas.js`: no match).
5. **OPTIONAL instead of CUT?** — the field is already non-required in the UI, but operator ruling 2 (facts.md:68) says items beyond DTAM's ask are cut, not kept as optional ("ความเกินคือปัญหา"). Prior independent analysis agrees: `reports/design-cleanup-2026-08-21/04-WIZARD-VS-DTAM.md:61` — "ผู้ประสานงาน ชื่อ/โทร/อีเมล (วิสาหกิจ+นิติ) → ตัด — DTAM ขอเบอร์ผู้ยื่นเท่านั้น" (suggested landing place: optional workspace profile, outside the application form).

## Cross-checks against sibling census rows (no contradiction found)

- `census/general.md:83-86` and `census/verify-6.md:45-47` both carry the same CUT for lines 224/228/235 and REWORD for 241 — consistent with the above.
- The JURISTIC twin of this section (lines 409-426) is CUT on the same ground (general.md:114-117) — the ๑.๓ email lives at อีเมลกรรมการ (397), so no rescue leaks from that branch either.

## Conclusion

No named Thai-law or DTAM-form basis requires a coordinator name at application time for cannabis. กทล.1 ๑.๑ collects the president's own mobile + optional email as the contact channel; a second contact person is a platform invention. CUT stands (citation: facts.md §1 ส่วนที่ ๑.๑ — closed field list, no ผู้ประสานงาน; ruling 2).

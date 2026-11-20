# verify-10 — skeptic check: เบอร์โทรผู้ประสานงาน (COMMUNITY)

Item under challenge (census proposal):
- Field: `contactPhone` — UI label **"เบอร์โทร"** under section "ผู้ประสานงาน (ถ้าต่างจากประธาน)"
- File: `apps/web-app/src/app/health/applications/new/_steps/steps/general-step-applicant-sections.tsx:235`
- Render branch: `formData.applicantType === 'COMMUNITY'` only (วิสาหกิจชุมชน)
- Census verdict: **CUT** — "ไม่มีใน กทล.1"

## Verdict: UPHELD — CUT

## What was checked (refutation attempts)

1. **facts.md §1 ส่วนที่ ๑.๑ (วิสาหกิจชุมชน)** — the กทล.1 asks: ชื่อประธาน · ชื่อวิสาหกิจ · เลขบัตร ปชช. ประธาน · สัญชาติ · รหัสทะเบียน สวช.01 · เลขรหัสประจำบ้าน · ที่อยู่ตามทะเบียนบ้าน · โทรศัพท์มือถือ · อีเมล (ถ้ามี). **No coordinator/ผู้ประสานงาน concept exists on the form.** The form's single โทรศัพท์มือถือ is the applicant's (president's) phone, and the UI already collects that separately as a required field "เบอร์โทรประธาน" (`presidentPhone`, same file line 208) — so this coordinator phone cannot be re-read as the form's phone slot.
2. **facts.md §1 ส่วนที่ ๒ ข้อ ๑** — the only other phone the form asks is the โทรศัพท์ of the สถานที่ (site phone), which belongs to the farm/site step, not an applicant-side coordinator. Not this field.
3. **facts.md §2 (ส่วนที่ ๓ attachments) + จนท. checklist** — no coordinator document or coordinator-contact requirement. The nearest concept, หนังสือมอบหมายให้ดำเนินกิจการแทนวิสาหกิจ, is an *attachment* proving the submitter's mandate, not a form field asking for a second contact's phone; operator ruling 3 explicitly rejects a delegation feature beyond that attachment.
4. **facts.md §3 (ข้อกำหนด)** — audit-day/record-keeping items only; no contact-person register. Not a MOVE_TO_AUDIT candidate.
5. **Repo-wide search for another Thai-law basis** (`ผู้ประสานงาน`, `coordinator`, `contact person`):
   - `apps/backend/constants/` — no match.
   - `apps/backend/prisma/seed-standards.js` — no contact-person requirement in any seeded standard (WHO/Thai GACP/ASEAN rows).
   - `apps/backend/prisma/seed-gacp.js:216` "ผู้ประสานงานนัดหมาย" — the platform's own *staff* scheduling-coordinator role, not an applicant obligation.
   - `docs/` hits (USER-MANUAL, VIDEO-STORYBOARD, gacp-master-brief-canonical, runbooks, CREDENTIAL-REQUEST drafts) — all refer to the platform's internal Coordinator/Scheduler role or to the platform's own ThaiD credential paperwork. None cites a กฎกระทรวง/ประกาศ requiring the applicant to name a coordinator at application time for cannabis.
6. **Backend never requires it** — `apps/backend/validation/canonical-application-validator.js:127` uses `contactPhone` only as a *fallback* inside `firstNonEmpty(applicant.phone, applicant.presidentPhone, applicant.contactPhone, ...)`; the canonical phone requirement is satisfied by `presidentPhone`. `apps/backend/services/entity-service.js:1481,1506` maps it null-tolerant (`|| null`). No validator makes it independently required.
7. **Prior independent analysis agrees** — `reports/design-cleanup-2026-08-21/04-WIZARD-VS-DTAM.md` row 61: "ผู้ประสานงาน ชื่อ/โทร/อีเมล (วิสาหกิจ+นิติ) → **ตัด** ... DTAM ขอเบอร์ผู้ยื่นเท่านั้น".

## Why not OPTIONAL

The field is already non-required in the UI, but operator ruling 2 (facts.md §4) says anything beyond the DTAM ask is to be cut from the wizard — "ความเกินคือปัญหา". With no DTAM row and no other citable Thai-law basis, keeping it even as ไม่บังคับ contradicts ruling 1 (required set = กทล.1 exactly) and ruling 2. The earlier analysis' suggestion of an optional *workspace-profile* home is outside the application wizard and outside this census's scope.

## Adjacent fields in the same section (context, same basis-status)

| file:line | UI label | note |
|---|---|---|
| general-step-applicant-sections.tsx:228 | ชื่อผู้ประสานงาน (`contactName`) | same no-basis section — not this item's row, but the same reasoning applies |
| general-step-applicant-sections.tsx:235 | **เบอร์โทร (`contactPhone`) — THIS ITEM** | CUT upheld |
| general-step-applicant-sections.tsx:241 | อีเมล (`contactEmail`) | same no-basis section |

## Conclusion

No named กทล.1 row, no ข้อกำหนด clause, and no other Thai-law/ministry basis anywhere in the repo requires a coordinator phone at application time for cannabis GACP. The president's phone (the form's actual โทรศัพท์มือถือ) is collected elsewhere. **CUT is correct.**

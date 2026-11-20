# verify-17 — SKEPTIC check: section ผู้ประสานงาน (JURISTIC) — 2026-09-01

Item under challenge (census proposal):
`apps/web-app/src/app/health/applications/new/_steps/steps/general-step-applicant-sections.tsx:409` — page-section หัวข้อ "ผู้ประสานงาน (ถ้าต่างจากกรรมการ)" ใน branch นิติบุคคล (JURISTIC) — proposed verdict **CUT**, dtamRef "ไม่มีใน กทล.1", note "ruling 2".

Role: defend the farmer's application from an over-eager cut — refute if any named DTAM/Thai-law basis exists.

## 1. What the UI actually renders (read in session)

| file:line | kind | Thai label ที่แสดงจริง | required? |
|---|---|---|---|
| general-step-applicant-sections.tsx:409 | page-section | ผู้ประสานงาน (ถ้าต่างจากกรรมการ) | — |
| general-step-applicant-sections.tsx:413 | field | ชื่อผู้ประสานงาน (`contactName`) | optional |
| general-step-applicant-sections.tsx:420 | field | เบอร์โทร (`contactPhone`) | optional |
| general-step-applicant-sections.tsx:426 | field | อีเมล (`contactEmail`) | optional |

Conditional-render context: block is inside the `JURISTIC` applicant-type branch only. The sibling COMMUNITY branch has its own coordinator section (line 224, separate census rows — not this item).

## 2. DTAM baseline check (facts.md re-read in full)

- facts.md §1 ส่วนที่ ๑ ข้อ ๑.๓ (นิติบุคคล) asks exactly: ชื่อนิติบุคคล · ชื่อผู้มีอำนาจลงนาม · เลขทะเบียนนิติบุคคล/เลขผู้เสียภาษี · ที่อยู่ · โทรศัพท์มือถือ · อีเมล (ถ้ามี) · Line ID. **ไม่มีช่องผู้ประสานงาน.**
- The one email slot of ๑.๓ is already mapped elsewhere in this branch: อีเมลกรรมการ (line 397, KEEP in general.md:113); the one mobile slot maps to เบอร์โทรกรรมการ (line 388, REWORD in general.md:112). So this section duplicates nothing the form still needs — unlike the COMMUNITY coordinator section, where the email field had to be REWORD-rescued (general.md:86).
- facts.md §1 ส่วนที่ ๒ ข้อ ๑ "โทรศัพท์" is the **site** phone (farm/processing location), asked in the site section of the form — not an applicant-side coordinator person. No mapping.
- facts.md §2 ส่วน จนท. 1.1 lists "หนังสือมอบอำนาจ+สำเนาบัตรผู้มอบ" — an *attachment* for the case where a non-director submits, and ruling 3 explicitly forbids building a submission-delegation feature. Typed name/phone/email fields for a coordinator are not that attachment and cannot ride on it (no CONDITIONAL basis).
- facts.md §3 (audit-day items) does not name a coordinator/contact person either — no MOVE_TO_AUDIT basis.

## 3. Hunt for any OTHER named Thai-law / ministry-system basis (repo-wide, read in session)

| Where searched | Result |
|---|---|
| `docs/requirements/official-gacp-requirements-dtam.md`, `gacp-document-requirements-research.md`, `plant-document-comparison-matrix.md` (grep ผู้ประสานงาน/ผู้ติดต่อ/contact person/coordinator) | **no match** — no requirement doc names a coordinator at application time |
| `apps/backend/validation/` (grep contactName/contact_person/ผู้ประสานงาน/coordinatorName) | **no match** — backend never validates or requires it |
| `apps/backend/prisma/` | only `seed-gacp.js:216` "ผู้ประสานงานนัดหมาย" — a **platform staff role title** (appointment coordinator), not an applicant field, no legal citation |
| `apps/backend` grep coordinator/contactName (29 files) | all hits are the provider-coordinator staff role, scheduling, or unrelated payment/trace code — none cites a กฎกระทรวง/ประกาศ requiring an applicant coordinator |
| `shared/` | directory does not exist in this repo |
| `apps/web-app/.../hooks/domain-types.ts:66-70` | declares `contactName/contactPhone/contactEmail` as optional with plain comments — no legal citation |
| Prior independent audit `reports/design-cleanup-2026-08-21/04-WIZARD-VS-DTAM.md:61` | row "ผู้ประสานงาน ชื่อ/โทร/อีเมล (วิสาหกิจ+นิติ)" → DTAM basis **ไม่** — "DTAM ขอเบอร์ผู้ยื่นเท่านั้น"; its own recommendation was ตัด (move to workspace profile = outside the application, consistent with CUT here) |
| DTAM e-service (cannabis-gacp-thaicam.dtam.moph.go.th) | facts.md:75 marks it UNVERIFIED/unreachable — a guess is not a basis per the census rules |

No named กฎกระทรวง, ประกาศ, พ.ร.บ., or ministry-system field anywhere in the repo requires a coordinator contact at application time for cannabis GACP.

## 4. Verdicts considered and rejected

- **KEEP** — no กทล.1 field to cite. Rejected.
- **OPTIONAL** — fields are already optional in the UI, but ruling 2 (facts.md:68) cuts wizard headers/options exceeding DTAM ("ความเกินคือปัญหา"); OPTIONAL requires a reason the platform may still offer it inside the application — none cited anywhere. Rejected.
- **CONDITIONAL** — the only candidate case (non-director submits → หนังสือมอบอำนาจ) is an attachment in the จนท. checklist plus ruling 3's explicit no-delegation-feature; it never asks to *type* a coordinator's contact. Rejected.
- **MOVE_TO_AUDIT / GENERATE / REWORD** — facts.md §3 doesn't name it; nothing to generate; unlike the COMMUNITY twin, no orphaned กทล.1 field (email/phone of ๑.๓ live at lines 397/388) needs rescuing from under this header. Rejected.

## 5. Verdict

**UPHELD — CUT** for the page-section at line 409 and its three child fields (413, 420, 426). Citation: facts.md §1 ส่วนที่ ๑ ข้อ ๑.๓ (closed field list, no coordinator) + ruling 2 (facts.md:68). No other Thai-law or ministry-system basis found in the repo.

Note for the implementer (not a verdict change): when this section is removed, `contactName/contactPhone/contactEmail` in `domain-types.ts:68-70` and any payload pass-through become dead for JURISTIC — coordinate with the COMMUNITY-branch rows (general.md:83-86) where the email field is REWORD-rescued, so the cut lands once for both branches without dropping ๑.๑'s email slot.

# verify-13 — ทุนจดทะเบียน (บาท) — skeptic check (2026-09-01)

Item under challenge:
`apps/web-app/src/app/health/applications/new/_steps/steps/general-step-applicant-sections.tsx:341` — Input label `ทุนจดทะเบียน (บาท)` (render branch: `formData.applicantType === 'JURISTIC'`, line 290; ไม่มี `required` prop — ช่องนี้ optional อยู่แล้วใน UI, lines 340-345)

Proposed verdict: **CUT** ("ไม่มีใน กทล.1")

## Verdict: **UPHELD — CUT**

## What I tried, to refute it

1. **facts.md §1 ส่วนที่ ๑.๓ (นิติบุคคล)** — the กทล.1 form asks a juristic applicant for exactly: ชื่อนิติบุคคล · ชื่อผู้มีอำนาจลงนาม · เลขทะเบียนนิติบุคคล/เลขผู้เสียภาษี · ที่อยู่ · โทรศัพท์มือถือ · อีเมล (ถ้ามี) · Line ID (facts.md:16). **ทุนจดทะเบียน is not among them.** Nothing in ส่วนที่ ๒, ส่วนที่ ๔, or the officer checklist (facts.md:55-57) asks for it either.
2. **facts.md §2 attachments (นิติบุคคล row, facts.md:50)** — DTAM requires สำเนาหนังสือรับรองการจดทะเบียนนิติบุคคล (ออกให้ไม่เกิน 6 เดือน). The DBD certificate itself states the registered capital, so the number already reaches the reviewer inside a mandatory attachment; typing it again is a duplicate ask, not a missing requirement. This is the strongest pro-keep angle and it argues *against* a typed field.
3. **Repo search for another named Thai-law basis** — grep `ทุนจดทะเบียน|registeredCapital|registered_capital` across the repo: hits are the wizard files themselves, the census files, the print view, entity-service passthrough, and accounting/chart-of-accounts material (the platform operator's own bookkeeping — irrelevant to the farmer's application). `docs/requirements/gacp-document-requirements-research.md`: zero mentions. grep `กฎกระทรวง|ประกาศกระทรวง|ภท.` under docs/: only billing/PDF/accounting docs — **no named กฎกระทรวง/ประกาศ/ภท. obligation citing registered capital at GACP application time was found anywhere in the repo.**
4. **Backend does not require it** — `apps/backend/services/entity-service.js:1464` maps `registeredCapital: a.registeredCapital || null` (nullable passthrough); no prisma column exists (grep of `apps/backend/prisma`: no match); the canonical submission validator has no rule for it; only tests touching it are PII-mask passthrough assertions (`apps/backend/__tests__/unit/entity-detail-pii-mask.test.js:95,117,126,193`). Cutting it breaks no gate.
5. **Prior independent analysis agrees** — `reports/design-cleanup-2026-08-21/04-WIZARD-VS-DTAM.md:65`: "นิติ: ทุนจดทะเบียน / เบอร์สำนักงาน | ไม่ | ไม่ | — | **ตัด**".

## Why not the other verdicts

- **KEEP** — no กทล.1 row to cite. ๑.๓ is exhaustive per facts.md:16 ("ทั้งหมดที่ฟอร์มขอ ไม่มีมากกว่านี้" per §1 header).
- **OPTIONAL** — ruling 2 (facts.md:68): excess over the DTAM ask = cut, and the value is already inside the mandatory DBD certificate attachment (facts.md:50); keeping a duplicate optional field is exactly the ความเกิน the ruling targets.
- **CONDITIONAL / MOVE_TO_AUDIT / GENERATE / REWORD** — no named case requires it; facts.md §3 does not list it as audit-day evidence; nothing to generate; the label is accurate for a field that should not exist.

## Cross-check of the surrounding JURISTIC branch (lines read 289-399, context only)

| line | label | census (general.md) verdict | my read |
|---|---|---|---|
| 300 | ชื่อนิติบุคคล (บังคับ) | KEEP (๑.๓) | consistent with facts.md:16 |
| 308 | ประเภทนิติบุคคล (select) | CUT | not in ๑.๓; readable from DBD cert |
| 316 | ที่อยู่จดทะเบียน (บังคับ) | KEEP (๑.๓ ที่อยู่) | consistent |
| 324 | เลขทะเบียนนิติบุคคล (บังคับ) | KEEP (๑.๓ ช่องรวม) | consistent |
| 332 | เลขประจำตัวผู้เสียภาษี (บังคับ) | CUT (ซ้ำช่อง 324) | consistent — กทล.1 has one combined slot |
| **341** | **ทุนจดทะเบียน (บาท)** | **CUT** | **upheld here** |
| 347 | เบอร์โทรสำนักงาน | CUT | not in ๑.๓ (มือถือช่องเดียว) |
| 364 | ชื่อ-นามสกุล กรรมการ (บังคับ) | KEEP (๑.๓ ผู้มีอำนาจลงนาม) | consistent |

Note for the coordinator: if the field is cut, also retire the dead passthrough at `entity-service.js:1464` and the print-view slot (`apps/web-app/src/app/provider/applications/[id]/print/*`) in the same batch, so the print form does not render an always-empty ทุนจดทะเบียน row. (Observation only — read-only census, nothing changed.)

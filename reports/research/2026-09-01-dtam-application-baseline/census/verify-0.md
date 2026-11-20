# verify-0 — skeptic check: companyType option LIMITED_COMPANY (บริษัทจำกัด)

Date: 2026-09-01 · Role: SKEPTIC (adversarial re-check of census verdict) · Read-only

## Item under challenge

| field | value |
|---|---|
| name | companyType option: LIMITED_COMPANY |
| file:line | apps/web-app/src/app/health/applications/new/_steps/steps/general-step.tsx:54 |
| current Thai | บริษัทจำกัด (th-wizard.ts:422) |
| proposed verdict | CUT — dtamRef "๑.๓ ไม่มีช่องประเภทนิติบุคคล", note "ตกไปพร้อม select (sections:308)" |

## What I tried to find (refutation attempts) — all evidence from this session

1. **กทล.1 itself (facts.md §1, ส่วนที่ ๑ ข้อ ๑.๓ นิติบุคคล — facts.md:16).** The form asks: ชื่อนิติบุคคล · ชื่อผู้มีอำนาจลงนาม · เลขทะเบียนนิติบุคคล/เลขผู้เสียภาษี · ที่อยู่ · โทรศัพท์มือถือ · อีเมล (ถ้ามี) · Line ID. **No ประเภทนิติบุคคล field exists.** The dtamRef in the census row is accurate.
2. **Attachment side as an indirect basis (facts.md:50, กลุ่มคุณสมบัติ นิติบุคคล).** The form does distinguish *which registration document* is attached (หนังสือรับรองการจดทะเบียนนิติบุคคล vs หนังสือจดทะเบียนวิสาหกิจ/วิสาหกิจเพื่อสังคม/สหกรณ์การเกษตร). Could the select be the discriminator that routes the required upload? **No** — in this codebase the discriminator is `applicantTypes`, never `companyType`: document-slots.js:150 (`COMPANY_REG` → `applicantTypes: ['JURISTIC','COMMUNITY_ENTERPRISE']`), :268 (`COMMUNITY_CERT` → `COMMUNITY_ENTERPRISE`), :276 (`COOP_CERT` → `AGRICULTURAL_COOP`). And even hypothetically, LIMITED_COMPANY / LIMITED_PARTNERSHIP / PUBLIC_LIMITED all map to the *same* attachment (หนังสือรับรองการจดทะเบียนนิติบุคคล), so this particular option distinguishes nothing DTAM asks about. The wizard's own doc gate (general-step.tsx:28, `JURISTIC: ['companyRegDoc','directorListDoc']`) is likewise fixed regardless of companyType.
3. **Prisma / backend persistence.** No `companyType` column anywhere in apps/backend/prisma (grep: no matches). entity-service.js:1462 merely passes `a.companyType || null` through into a profile JSON blob — no logic branches on it.
4. **Named Thai-law / ministry-system basis in the repo.** docs/requirements/official-gacp-requirements-dtam.md asks only for the นิติบุคคล *document* "หนังสือรับรองนิติบุคคล (อายุไม่เกิน 6 เดือน)" (line 112) and "Applicant Type Logic (นิติบุคคล)" (line 152) — applicant category, not sub-type. The only repo hits for "ประเภทนิติบุคคล" are the platform's own QA addendum (docs/testing/health-wizard-manual-qa-addendum-2026-02-22-step-2-variant-applicant-types.md:102) and user manual (docs/manual/USER-MANUAL.md:285) — self-referential descriptions of this very UI, not a law. No กฎกระทรวง/ประกาศ citation requiring a juristic sub-type at application time was found in docs/, apps/backend/constants, or prisma. The จนท. checklist row about "ใบอนุญาต…ตามกฎหมายที่เกี่ยวข้อง" (facts.md:56) concerns a licence *document*, and facts.md:75 marks the licence law's exact ฉบับ UNVERIFIED — a guess is not a basis.
5. **Operator rulings (facts.md §4).** Ruling 1: required set = กทล.1 ส่วนที่ ๓ exactly, no platform extras. Ruling 2: wizard fields/options beyond DTAM = cut. The company's legal form is already self-evident in its registered name ("บริษัท … จำกัด") and in the uploaded หนังสือรับรอง — the select adds no information the reviewer can't see.

## Sibling options in the same select (context — they fall with the same reasoning unless separately challenged)

| file:line (general-step.tsx) | value | Thai label (th-wizard.ts) | note |
|---|---|---|---|
| :54 | LIMITED_COMPANY | บริษัทจำกัด (:422) | this item — CUT upheld |
| :55 | LIMITED_PARTNERSHIP | ห้างหุ้นส่วนจำกัด (:423) | same reasoning: same attachment as :54 |
| :56 | PUBLIC_LIMITED | บริษัทมหาชนจำกัด (:424) | same reasoning: same attachment as :54 |
| :57 | COOPERATIVE | สหกรณ์การเกษตร (:425) | the only value tied to a real กทล.1 attachment distinction (facts.md:50), but the repo already carries that at applicant-type level (`AGRICULTURAL_COOP`, document-slots.js:276), not via companyType |
| :58 | OTHER | อื่น ๆ (:426) | no DTAM basis |

The parent select itself ("ประเภทนิติบุคคล", required — general-step-applicant-sections.tsx:307-314) and its validator (`v.require('companyType', …)`, general-step.tsx:180) are cut per the general census; the census note "ตกไปพร้อม select (sections:308)" matches the code as read.

## Verdict

**UPHELD — CUT.** กทล.1 ข้อ ๑.๓ has no juristic-type field (facts.md:16); no other named Thai-law or ministry-system basis exists in the repo; no code logic depends on the value; operator rulings 1-2 forbid platform extras. The census row is correct, including its citation.

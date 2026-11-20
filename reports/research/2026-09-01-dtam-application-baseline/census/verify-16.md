# verify-16 — skeptic check: เลขบัตรประชาชนกรรมการ (general-step-applicant-sections.tsx:379) — 2026-09-01

Status: DONE (read-only verification; evidence = file:line citations below, all read this session)

## Item under challenge
| file:line | UI shows | branch | proposed verdict |
|---|---|---|---|
| apps/web-app/src/app/health/applications/new/_steps/steps/general-step-applicant-sections.tsx:379 | `เลขบัตรประชาชนกรรมการ` — required, maxLength 13, numeric, check-digit enforced (general-step.tsx:192 `v.healthId('directorIdCard', …)`) | JURISTIC only (section "กรรมการผู้มีอำนาจลงนาม", lines 356-403) | CUT |

## Refutation attempts (each ran, each failed)
1. **กทล.1 itself** — facts.md:16 (ส่วนที่ ๑ ข้อ ๑.๓ นิติบุคคล) asks: ชื่อนิติบุคคล · ชื่อผู้มีอำนาจลงนาม · เลขทะเบียนนิติบุคคล/เลขผู้เสียภาษี · ที่อยู่ · โทรศัพท์มือถือ · อีเมล (ถ้ามี) · Line ID. No ID-number box for the signatory. The omission is deliberate, not an oversight: the same form DOES ask เลขบัตร ปชช. for ๑.๑ ประธานวิสาหกิจ (facts.md:14) and ๑.๒ บุคคลธรรมดา (facts.md:15). For a juristic person the form's identity number is the corporate registration number — already a separate KEEP field at line 324.
2. **Attachment coverage** — the signer's ID card reaches DTAM as a document copy: จนท. checklist 1.1 (facts.md:56) + upload surface at line 465 `สำเนาบัตรประชาชนกรรมการ` (KEEP per census general.md:122, verify-6.md:71) and documents-step-config.tsx:153 `JUR_DIRECTOR_ID`. A typed number adds nothing DTAM receives on paper.
3. **Other Thai-law basis in repo** — searched docs/, apps/backend, prisma for กฎกระทรวง/ประกาศ/ภท./พ.ร.บ. tied to a director ID at application time. Only hit: docs/requirements/gacp-document-requirements-research.md:291 "เลขที่บัตรประชาชน" — but that blank belongs to the **landlord** in a หนังสือยินยอมใช้สถานที่ template for a ภ.ท.12 sales/processing licence under ประกาศ สธ. สมุนไพรควบคุม (กัญชา) พ.ศ. 2565 (doc lines 246-261, 290-291). Different regime, different form, and per จนท. 1.1 (facts.md:56) the GACP application wants the *issued licence* as an attachment — never that licence application's data fields re-typed into the wizard.
4. **Platform's own backend** — canonical-application-validator.js:268 `director_id_card: optionalThaiId('เลขบัตรประชาชนผู้มีอำนาจลงนาม')`: optional; validated only if present (validator lines 229-237). JURISTIC required set there (lines 260-268: company_name, registration_number, director_name) mirrors ๑.๓ without the ID. entity-service.js:1474 stores it as `|| null`. The check-digit submit-door test (applicant-id-checksum-submit-door.test.js:131) rejects a *wrong* value, not an *absent* one — value-hygiene, not a legal requirement.
5. **ThaiD / e-service** — production auth (ThaiD) binds the account holder's identity at login, not a form field; DTAM e-service upload list is UNVERIFIED (facts.md:75) and a guess is not a basis per the census rules.

## Conditional-branch sweep (no skipped renders around the item)
The JURISTIC branch section read in full (lines 289-488): directorName:364 (KEEP — "ชื่อผู้มีอำนาจลงนาม" ๑.๓) · directorPosition:371 (not in ๑.๓) · **directorIdCard:379 (this item)** · directorPhone:388 / directorEmail:397 (โทรศัพท์/อีเมล per ๑.๓) · contact section 405-433 (already CUT in general.md:16) · uploads 445-479 (companyReg/directorList = นิติบุคคล qualification docs facts.md:50; director-id:465 = จนท. 1.1; powerOfAttorney per ruling 3 handled elsewhere). No other branch renders line 379.

## Verdict
**UPHELD — CUT.** No named กทล.1 field (๑.๓ omits it while sibling sections include it), no other citable Thai-law basis in the repo, attachment need already met by the required upload at line 465, and the platform's own canonical validator agrees the number is optional. Even OPTIONAL is not warranted: ruling 2 (facts.md:68) cuts wizard surface beyond DTAM's ask, and the value is PII the platform must then encrypt and mask for nothing (formdata-pii.js:184, prisma-pdpa-extension.js:44 — cost with no DTAM consumer).

Evidence: facts.md:14-16,50,56,68 · general-step-applicant-sections.tsx:356-403,463-471 · general-step.tsx:192 · canonical-application-validator.js:229-237,260-269 · docs/requirements/gacp-document-requirements-research.md:246-291 · census/general.md:111,122 · census/verify-6.md:64,71

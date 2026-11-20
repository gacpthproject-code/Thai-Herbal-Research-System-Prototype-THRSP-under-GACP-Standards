# verify-18 — SKEPTIC check: "ชื่อผู้ประสานงาน" (JURISTIC) @ general-step-applicant-sections.tsx:413

Item under challenge: `{"name":"ชื่อผู้ประสานงาน (JURISTIC)","kind":"field","line":413,"verdict":"CUT","dtamRef":"ไม่มีใน กทล.1"}`
Role: skeptic — tried to REFUTE the CUT. Baseline: `reports/research/2026-09-01-dtam-application-baseline/facts.md` (read in full this session).

## Verdict

**CUT — upheld.** Citation: facts.md §1 ตาราง ๑.๓ (นิติบุคคล) ระบุช่องทั้งหมด: ชื่อนิติบุคคล · ชื่อผู้มีอำนาจลงนาม · เลขทะเบียนนิติบุคคล/เลขผู้เสียภาษี · ที่อยู่ · โทรศัพท์มือถือ · อีเมล (ถ้ามี) · Line ID — **ไม่มีผู้ประสานงาน** + operator ruling 2 (หัวข้อเกินความต้องการ DTAM = ตัด)

## Refutation attempts (all failed — each checked in-session)

1. **กทล.1 ส่วนที่ ๑ ข้อ ๑.๓** — no coordinator field of any kind (facts.md:16). Every ๑.๓ field already has a home in the JURISTIC branch: ชื่อผู้มีอำนาจลงนาม → directorName (line 364, KEEP), โทรศัพท์มือถือ → directorPhone (line 388), อีเมล (ถ้ามี) → directorEmail (line 397). Unlike the COMMUNITY branch — where the only email surface sat under the coordinator section and earned that field a REWORD — the JURISTIC coordinator name at 413 inherits **no** orphaned DTAM data slot.
2. **Officer checklist (กทล.1 ส่วน จนท. 1.1, facts.md:56)** — lists หนังสือมอบอำนาจ+สำเนาบัตรผู้มอบ as a *document*, not a typed coordinator name; that document already has its own slot (`powerOfAttorneyDoc`, line 474 of the same file), and ruling 3 explicitly forbids a proxy-submission feature. A free-text coordinator name is not the มอบอำนาจ document.
3. **ข้อกำหนด (facts.md §3)** — audit-day/record-keeping items only; no coordinator anywhere → MOVE_TO_AUDIT is not available.
4. **Other named Thai-law basis in the repo** — searched all of `docs/`, `apps/backend/constants/`, `apps/backend/services/`, `prisma` seeds for ผู้ประสานงาน/contactName. Every hit is either (a) DTAM *internal staff* role "ผู้ประสานงานนัดหมาย" (`apps/backend/prisma/seed-gacp.js:216`, USER-MANUAL บทที่ 9), (b) a *technical* coordinator line in the department's own ThaiD RP credential-request letters to BORA (`docs/auth/CREDENTIAL-REQUEST-2026-08-19.md:45`) — a government-to-government letter, not an application-time farmer requirement, or (c) platform invoice/preview conveniences. **No กฎกระทรวง/ประกาศ/พ.ร.บ. cited anywhere in the repo requires an applicant-side coordinator at application time for cannabis.**
5. **Backend enforcement** — no validator requires `contactName` (grep over `apps/backend/services/*validator*.js`: zero hits; `apps/backend/constants/document-slots.js`: zero hits). Uses are nullable conveniences with working fallbacks: `invoice-template-service.js:1236` (`contactName || payer.name`), `entity-service.js:1480,1505` (`|| null`). Cutting the field strands no legal requirement.
6. **OPTIONAL instead of CUT?** Rejected. Ruling 2 is categorical (ความเกินคือปัญหา), and the pre-baseline analysis reached the same conclusion independently: `reports/design-cleanup-2026-08-21/04-WIZARD-VS-DTAM.md:61` — "ตัด (ย้ายเป็น optional ในโปรไฟล์ workspace)" i.e. out of the application entirely. Coordinator census rows (general.md:114-117) and verify-14:76-78 concur.

## Implementation caveat (not a refutation)

`entity-service.js:1481` builds the entity contact phone as `contactPhone || companyPhone` — both are CUT items. When this section and เบอร์โทรสำนักงาน (line 347) are removed, that projection should be rewired to the director mobile (the ๑.๓ โทรศัพท์มือถือ), same sequencing note verify-14 made for the canonical phone chain at `canonical-application-validator.js:127`.

## Full census of the file (every field/option/slot/upload surface — 489 lines, 3 conditional branches by applicantType)

### INDIVIDUAL branch (๑.๒)
| line | surface | UI label (Thai) | verdict | citation |
|---|---|---|---|---|
| 42 | field | ชื่อ (บังคับ) | KEEP | ๑.๒ ชื่อ-สกุลเจ้าของแปลง |
| 49 | field | นามสกุล (บังคับ) | KEEP | ๑.๒ ชื่อ-สกุลเจ้าของแปลง |
| 57 | field | เลขบัตรประชาชน 13 หลัก (บังคับ) | KEEP | ๑.๒ เลขบัตร ปชช. |
| 67 | field | เบอร์โทรศัพท์ (บังคับ) | KEEP | ๑.๒ โทรศัพท์มือถือ |
| 76 | field | อีเมล (ถ้ามี) | KEEP | ๑.๒ อีเมล (ถ้ามี) — label ตรงฟอร์มแล้ว |
| 83 | field | ที่อยู่ตามทะเบียนบ้าน (บังคับ) | KEEP | ๑.๒ ที่อยู่ |
| — | (missing) | Line ID | gap | ๑.๒ ขอ Line ID — ฝั่ง KEEP ขาด |
| 101 | upload | สำเนาบัตรประชาชน (บังคับ) | KEEP | จนท. 1.1 บัตร ปชช. ผู้ยื่น |
| 110 | upload | สำเนาทะเบียนบ้าน (ถ้ามี) | KEEP | จนท. 1.1 ทะเบียนบ้านผู้ยื่น |
| 119 | upload | ผลตรวจประวัติอาชญากรรม (ถ้ามี) | CUT | ไม่มีใน กทล.1 ทั้งฉบับ (04-WIZARD-VS-DTAM.md:57 concurs) |
| — | (missing) | หนังสือความร่วมมือกับผู้รับอนุญาตผลิตยา/ผลิตภัณฑ์สมุนไพร | gap | §2 กลุ่มคุณสมบัติ บุคคลธรรมดา (facts.md:49) — บังคับแต่ฟอร์มไม่มี |

### COMMUNITY branch (๑.๑)
| line | surface | UI label (Thai) | verdict | citation |
|---|---|---|---|---|
| 142 | field | ชื่อวิสาหกิจชุมชน (บังคับ) | KEEP | ๑.๑ ชื่อวิสาหกิจ |
| 150 | field | ที่อยู่วิสาหกิจชุมชน (บังคับ) | REWORD | ๑.๑ ขอ "ที่อยู่ตามทะเบียนบ้าน" |
| 158 | field | เลขทะเบียนวิสาหกิจ (สกท.) (บังคับ) | REWORD | ๑.๑ เรียก "รหัสทะเบียน สวช.01" |
| 166 | field | วันที่จดทะเบียน | CUT | ไม่มีใน ๑.๑ |
| 174 | field | จำนวนสมาชิก (คน) | CUT | ไม่มีใน ๑.๑ (บัญชีรายชื่อสมาชิกเป็นเอกสารแนบอยู่แล้ว facts.md:48) |
| 191 | field | ชื่อ-นามสกุล ประธาน (บังคับ) | KEEP | ๑.๑ ชื่อประธาน |
| 199 | field | เลขบัตรประชาชนประธาน (บังคับ) | KEEP | ๑.๑ เลขบัตร ปชช. ประธาน |
| 208 | field | เบอร์โทรประธาน (บังคับ) | KEEP | ๑.๑ โทรศัพท์มือถือ |
| — | (missing) | สัญชาติ · เลขรหัสประจำบ้าน | gap | ๑.๑ ขอ — ฝั่ง KEEP ขาด |
| 224 | section | ผู้ประสานงาน (ถ้าต่างจากประธาน) | CUT | ไม่มีใน กทล.1 + ruling 2 |
| 228 | field | ชื่อผู้ประสานงาน | CUT | ไม่มีใน ๑.๑ |
| 235 | field | เบอร์โทร (ผู้ประสานงาน) | CUT | ไม่มีใน ๑.๑ |
| 241 | field | อีเมล (ผู้ประสานงาน) | REWORD | ๑.๑ อีเมล (ถ้ามี) — ช่องอีเมลเดียวของประเภทนี้ ต้องย้ายไปส่วนหลัก |
| 259 | upload | หนังสือจดทะเบียนวิสาหกิจชุมชน (สกท.) (บังคับ) | REWORD | §2 คุณสมบัติวิสาหกิจ (facts.md:48) — แก้ "(สกท.)" → สวช. + เงื่อนไขสถานะ/วัตถุประสงค์/บัญชีสมาชิก |
| 268 | upload | รายงานการประชุมอนุมัติการยื่นขอ GACP (บังคับ) | REWORD | เอกสารตามกรมคือ "หนังสือแสดงว่าผู้ยื่นได้รับมอบหมายให้ดำเนินกิจการแทนวิสาหกิจ" (facts.md:48 + ruling 3) |
| 277 | upload | สำเนาบัตรประชาชนประธาน (บังคับ) | KEEP | จนท. 1.1 |

### JURISTIC branch (๑.๓)
| line | surface | UI label (Thai) | verdict | citation |
|---|---|---|---|---|
| 300 | field | ชื่อนิติบุคคล (บังคับ) | KEEP | ๑.๓ ชื่อนิติบุคคล |
| 308 | select | ประเภทนิติบุคคล (บังคับ, COMPANY_TYPES options) | CUT | ไม่มีใน ๑.๓ (อ่านได้จากหนังสือรับรอง) |
| 316 | field | ที่อยู่จดทะเบียน (บังคับ) | KEEP | ๑.๓ ที่อยู่ |
| 324 | field | เลขทะเบียนนิติบุคคล (บังคับ) | KEEP | ๑.๓ เลขทะเบียนนิติบุคคล/เลขผู้เสียภาษี |
| 332 | field | เลขประจำตัวผู้เสียภาษี (บังคับ) | CUT | ๑.๓ เป็นช่องเดียว "เลขทะเบียนนิติบุคคล **หรือ** เลขผู้เสียภาษี" — ช่องซ้ำ |
| 341 | field | ทุนจดทะเบียน (บาท) | CUT | ไม่มีใน ๑.๓ |
| 347 | field | เบอร์โทรสำนักงาน | CUT | ไม่มีใน ๑.๓ (มือถือช่องเดียว — verify-14 upheld) |
| 364 | field | ชื่อ-นามสกุล กรรมการ (บังคับ) | KEEP | ๑.๓ ชื่อผู้มีอำนาจลงนาม |
| 371 | field | ตำแหน่ง | CUT | ไม่มีใน ๑.๓ |
| 379 | field | เลขบัตรประชาชนกรรมการ (บังคับ) | CUT | ไม่มีใน ๑.๓ — สำเนาบัตรเป็นเอกสารแนบ จนท. 1.1 (slot 465) |
| 388 | field | เบอร์โทรกรรมการ | REWORD | ๑.๓ โทรศัพท์มือถือ — ควรบังคับ (ช่องมือถือช่องเดียวของฟอร์ม) |
| 397 | field | อีเมลกรรมการ | KEEP | ๑.๓ อีเมล (ถ้ามี) — เติมป้าย "(ถ้ามี)" |
| — | (missing) | Line ID | gap | ๑.๓ ขอ — ฝั่ง KEEP ขาด |
| 409 | section | ผู้ประสานงาน (ถ้าต่างจากกรรมการ) | CUT | ไม่มีใน กทล.1 + ruling 2 |
| **413** | **field** | **ชื่อผู้ประสานงาน** | **CUT — upheld (this check)** | **ไม่มีใน ๑.๓ · ไม่มีฐานกฎหมายอื่นใน repo (ตรวจ §Refutation ข้อ 4-5)** |
| 420 | field | เบอร์โทร (ผู้ประสานงาน) | CUT | ไม่มีใน ๑.๓ |
| 426 | field | อีเมล (ผู้ประสานงาน) | CUT | ไม่มีใน ๑.๓ (อีเมลของ ๑.๓ คือ 397) |
| 443 | alert | หนังสือรับรองบริษัทไม่เกิน 6 เดือน | KEEP | §2 คุณสมบัตินิติบุคคล "ออกให้ไม่เกิน 6 เดือน" (facts.md:50) |
| 447 | upload | หนังสือรับรองบริษัท (DBD) (บังคับ) | REWORD | §2 คุณสมบัตินิติบุคคล — กรมรับ วิสาหกิจ/วิสาหกิจเพื่อสังคม/สหกรณ์การเกษตร ด้วย ป้ายแคบไป |
| 456 | upload | รายชื่อกรรมการผู้มีอำนาจลงนาม (บังคับ) | KEEP | facts.md:50 บัญชีรายชื่อกรรมการ/หุ้นส่วน/สมาชิก |
| 465 | upload | สำเนาบัตรประชาชนกรรมการ (บังคับ) | KEEP | จนท. 1.1 |
| 474 | upload | หนังสือมอบอำนาจ (ถ้าไม่ใช่กรรมการเป็นผู้ยื่น) | CONDITIONAL | จนท. 1.1 หนังสือมอบอำนาจ+สำเนาบัตรผู้มอบ — เฉพาะกรณีผู้ยื่นไม่ใช่กรรมการ (คู่สำเนาบัตรผู้มอบยังขาด) |

Evidence read in-session: facts.md (full) · target file lines 1-489 (full) · census/general.md rows 76-136 · census/verify-14.md · 04-WIZARD-VS-DTAM.md §1/§4 · greps over apps/backend (validators, constants, services), prisma seed, docs/.

# verify-20 — skeptic check: อีเมลผู้ประสานงาน (JURISTIC) — 2026-09-01

Item under challenge (from general.md:117):

| file:line | kind | UI label ปัจจุบัน | proposed | citation |
|---|---|---|---|---|
| apps/web-app/src/app/health/applications/new/_steps/steps/general-step-applicant-sections.tsx:426 | field | "อีเมล" (ใต้หัวข้อ "ผู้ประสานงาน (ถ้าต่างจากกรรมการ)" บรรทัด 409, backing `contactEmail`) | CUT | ไม่มีใน กทล.1 |

## Refutation attempts (all failed)

1. **กทล.1 ตัวฟอร์มเอง** — facts.md:16 (ส่วนที่ ๑ ข้อ ๑.๓ นิติบุคคล) ขอ: ชื่อนิติบุคคล · ชื่อผู้มีอำนาจลงนาม · เลขทะเบียน/เลขผู้เสียภาษี · ที่อยู่ · โทรศัพท์มือถือ · **อีเมล (ถ้ามี) ช่องเดียว** · Line ID. ไม่มี section ผู้ประสานงานใดๆ ในฟอร์มทั้ง 5 หน้า (ส่วนที่ ๒ facts.md:20-25 ก็ไม่มี). ช่องอีเมลเดียวของ ๑.๓ ถูก map ไปแล้วที่บรรทัด 397 "อีเมลกรรมการ" ซึ่ง census ตัดสิน **KEEP** (general.md:113 — เติมป้าย "(ถ้ามี)") — การตัด 426 จึงไม่ทำให้ branch นิติบุคคลไร้ช่องอีเมล.
2. **ข้อกำหนด (gacp-2.pdf)** — facts.md §3: พูดถึงช่องทางยื่นทางไปรษณีย์/อีเมล (facts.md:64) = ช่องทางส่งเอกสาร ไม่ใช่ field ผู้ประสานงาน. ไม่มีข้อใดสั่งให้ระบุผู้ประสานงาน.
3. **กฎหมาย/ระบบกระทรวงอื่นใน repo** — ค้น "ผู้ประสานงาน" ทั้ง repo: ทุก hit ใน docs/ คือ (a) role เจ้าหน้าที่นัดตรวจของแพลตฟอร์มเอง (USER-MANUAL.md:467-524, USER-MANUAL-SKELETON.md:45, preview-stack.md) และ (b) หนังสือขอ credential ThaiD ที่ต้องระบุผู้ประสานงานด้านเทคนิคของ **ผู้ให้บริการระบบ** ถึง DGA (docs/auth/CREDENTIAL-REQUEST-2026-08-19.md:45) — เป็นภาระของแพลตฟอร์ม ไม่ใช่ของผู้ยื่นคำขอ GACP. `apps/backend/constants/document-slots.js` ไม่มี slot ผู้ประสานงาน. `contactEmail` ใน `apps/backend/prisma/schema/tenancy.prisma` คือข้อมูล Organization (tenancy ของแพลตฟอร์ม) ไม่ใช่ข้อบังคับตอนยื่น. ไม่พบ กฎกระทรวง/ประกาศ ฉบับใดใน repo ที่บังคับอีเมลผู้ประสานงานตอนยื่นสำหรับกัญชา.
4. **งานวิเคราะห์ก่อนหน้า** — reports/design-cleanup-2026-08-21/04-WIZARD-VS-DTAM.md:61 สรุปเองแล้วว่า "ผู้ประสานงาน ชื่อ/โทร/อีเมล (วิสาหกิจ+นิติ) — ไม่อยู่ใน DTAM → ตัด (ย้ายเป็น optional ในโปรไฟล์ workspace) · DTAM ขอเบอร์ผู้ยื่นเท่านั้น".
5. **OPTIONAL แทน CUT?** — ไม่มีฐาน: ruling 2 (facts.md:68) สั่งตัดของเกิน และ census ตัดทั้ง section ผู้ประสานงานของทั้งสองประเภทอย่างสม่ำเสมอ (general.md:16, 83-85, 114-116). กรณี COMMUNITY ที่ช่องเดียวกันได้ REWORD (general.md:86) เพราะ branch นั้น**ไม่มี**ช่องอีเมลอื่น — เงื่อนไขนั้นไม่เกิดกับ JURISTIC ซึ่งมี 397 KEEP อยู่แล้ว.

## Consistency check (sibling rows, same section — no skipped branch)

| line | field | census verdict | สอดคล้อง? |
|---|---|---|---|
| 409 | หัวข้อ "ผู้ประสานงาน (ถ้าต่างจากกรรมการ)" | CUT | ใช่ |
| 413 | ชื่อผู้ประสานงาน (`contactName`) | CUT | ใช่ |
| 420 | เบอร์โทร (`contactPhone`) | CUT | ใช่ |
| 426 | อีเมล (`contactEmail`) | CUT | ใช่ — ช่องอีเมล ๑.๓ อยู่ที่ 397 (KEEP) |

## Verdict

**upheld = true — CUT ยืน.** ไม่มีช่องผู้ประสานงานใน กทล.1 ๑.๓ (facts.md:16); ช่องอีเมลเดียวของประเภทนิติบุคคลถูกเก็บไว้แล้วที่บรรทัด 397; ไม่พบฐานกฎหมายไทย/ระบบกระทรวงอื่นใดใน repo ที่บังคับอีเมลผู้ประสานงานตอนยื่นคำขอกัญชา.

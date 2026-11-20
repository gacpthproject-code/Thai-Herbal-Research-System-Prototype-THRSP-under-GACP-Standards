# verify-4 — skeptic check: companyType option OTHER (อื่น ๆ)

วันที่: 2026-09-01 · บทบาท: SKEPTIC (พยายามหักล้าง verdict CUT) · ขอบเขต: read-only

## Item under challenge

| field | value |
|---|---|
| name | companyType option: OTHER |
| file:line | apps/web-app/src/app/health/applications/new/_steps/steps/general-step.tsx:58 |
| UI แสดงจริง | **"อื่น ๆ"** (th-wizard.ts:426) — ตรงกับ census row |
| proposed verdict | CUT — dtamRef "๑.๓", note "เดียวกัน" (ตกตาม select แม่) |

## เส้นทางหักล้างที่ลองแล้ว (ทั้งหมดรันจริงใน session นี้ — ทุกทางล้มเหลว)

1. **กทล.1 เองขอประเภทนิติบุคคลหรือไม่** — facts.md:16 (ส่วนที่ ๑ ข้อ ๑.๓ นิติบุคคล): ช่องที่ฟอร์มขอคือ ชื่อนิติบุคคล · ชื่อผู้มีอำนาจลงนาม · เลขทะเบียนนิติบุคคล/เลขผู้เสียภาษี · ที่อยู่ · โทรศัพท์มือถือ · อีเมล (ถ้ามี) · Line ID — **ไม่มีช่อง/checkbox ประเภทนิติบุคคล** และไม่มีช่อง "อื่น ๆ ระบุ" ใด ๆ ในส่วนที่ ๑ (ช่อง "อื่น ๆ ระบุ" ของ กทล.1 มีที่เดียวคือ*ลักษณะพื้นที่* ส่วนที่ ๒ — facts.md:22 — คนละเรื่อง) → dtamRef ของ census ถูกต้อง
2. **มุมเฉพาะของ OTHER — escape hatch สำหรับนิติบุคคลรูปแบบอื่นที่กฎหมายรับ** (มุมแข็งสุดของ option นี้: กทล.1 §2 รับ "หนังสือรับรองการจดทะเบียนนิติบุคคล **หรือ**หนังสือจดทะเบียนวิสาหกิจ/วิสาหกิจเพื่อสังคม/สหกรณ์การเกษตร" — facts.md:50 — แปลว่ารูปแบบนิติบุคคลนอกเหนือ 4 ตัวเลือกแรกยื่นได้จริง เช่น วิสาหกิจเพื่อสังคม; ถ้า select แม่*มี*ฐาน DTAM การตัด OTHER ทิ้งจะไปกีดกันผู้ยื่นเหล่านั้น): ล้มเหลว เพราะความครอบคลุมนั้นถูกรักษาโดย*การไม่ประกาศประเภทเลย* — ฟอร์มกรมพิสูจน์รูปแบบนิติบุคคลด้วย**เอกสารแนบ**ช่องเดียวที่รับได้หลายชนิด ("หรือ") ไม่ใช่ด้วยช่องกรอก และ census จัดการฝั่งแนบไว้แล้ว (general.md:120 — REWORD ป้าย "หนังสือรับรองบริษัท (DBD)" ให้กว้างเท่าทางเลือกของกรม) → escape hatch ตกไปพร้อม select แม่โดยไม่ทิ้งใครไว้ข้างนอก
3. **ระบบมีอะไร*ต้องการ*ค่า OTHER หรือแตกแขนงตาม companyType หรือไม่** — ไม่: (ก) backend เก็บเป็น passthrough nullable `companyType: a.companyType || null` เข้า profile blob (entity-service.js:1462) ไม่มี logic อ่านค่า (ข) server-side `validateJuristic` ไม่บังคับ companyType เลย — บังคับแค่ taxId + companyName (applicant-validation.js:52-59) (ค) ไม่มี `companyType` ใน prisma schema ใด (grep apps/backend/prisma: no matches) — ไม่มี enum DB ที่ต้องมีค่า OTHER รองรับ (ง) document-slot engine เทียบด้วย `applicantType` เท่านั้น (verify-3.md:18) → ตัดทั้ง select แล้วไม่มีอะไรพัง นอกจาก `v.require('companyType', …)` ฝั่ง client (general-step.tsx:180) ซึ่ง census ตี REWORD ไว้แล้ว (general.md แถว 146-200)
4. **กฎหมายไทยฉบับอื่นใน repo** — verify-3.md:19 grep ทั้ง repo แล้วสำหรับ select ก้อนเดียวกันนี้: ไม่พบ พ.ร.บ./กฎกระทรวง/ประกาศ ที่บังคับ*ประกาศชนิดนิติบุคคล* ณ วันยื่น · docs ที่แตะ "ประเภทนิติบุคคล" มีแต่ QA checklist/manual ของแพลตฟอร์มเอง (docs/testing/health-wizard-manual-qa-addendum-2026-02-22…:102, docs/backlog/health-wizard-core-step-validation-manual-test-checklist.md:86, docs/manual/USER-MANUAL.md:285) — เอกสารบรรยายโค้ดตัวเอง ไม่ใช่ฐานกฎหมาย
5. **ระบบ e-service ของกรม** — facts.md:75 ระบุ UNVERIFIED (เข้าโดเมนไม่ได้ขณะวิจัย) — เดาไม่ได้ ไม่นับเป็น basis
6. **Ruling operator** — facts.md §4 ข้อ 1 (ชุดบังคับ = กทล.1 เป๊ะ ไม่มีเกณฑ์เพิ่มของแพลตฟอร์ม) + ข้อ 2 (ตัวเลือกเกิน DTAM = ตัด) ปิดทาง "คงไว้เผื่อมีประโยชน์ตอนรีวิว"

## ความสอดคล้องกับแถวพี่น้อง

- select แม่ "ประเภทนิติบุคคล" (general-step-applicant-sections.tsx:308) = CUT (general.md:103) · :54 LIMITED_COMPANY (verify-0 upheld) · :55 LIMITED_PARTNERSHIP (verify-1 upheld) · :56 PUBLIC_LIMITED (verify-2) · :57 COOPERATIVE (verify-3 upheld) — OTHER คือใบสุดท้ายของก้อนเดียวกัน ตกทั้งก้อน
- implementation-sequencing: ตัด option นี้พร้อม select + `v.require('companyType', …)` (general-step.tsx:180) + ปลายทาง `buildJuristicPayload` (entity-service.js:1462) ในชุดเดียว — ไม่ใช่เหตุคง option

## VERDICT: **CUT — upheld**

อ้างอิง: facts.md:16 (กทล.1 ส่วนที่ ๑ ข้อ ๑.๓ — ไม่มีช่องประเภทนิติบุคคล ให้ประกาศ ไม่ว่าค่าไหนรวมทั้ง "อื่น ๆ") · facts.md:50 (รูปแบบนิติบุคคลนอกเหนือบริษัท/หจก./บมจ./สหกรณ์ ถูกดูแลด้วย*ทางเลือกเอกสารแนบ*คุณสมบัติช่องเดียว — general.md:120 REWORD ป้ายให้กว้างพอแล้ว) · ruling operator ข้อ 1-2 · ไม่พบกฎหมายไทย/ระบบกระทรวงที่อ้างชื่อได้ใน repo ที่บังคับช่องนี้ ณ วันยื่น · backend ไม่มีอะไรต้องการค่านี้ (entity-service.js:1462 nullable passthrough, applicant-validation.js ไม่บังคับ, ไม่มีใน prisma)

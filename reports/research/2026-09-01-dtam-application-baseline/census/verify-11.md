# verify-11 — skeptic check: ประเภทนิติบุคคล (select ตัวแม่ทั้งช่อง)

Census row under test:

| file:line | kind | UI แสดงจริง | proposed verdict |
|---|---|---|---|
| apps/web-app/src/app/health/applications/new/_steps/steps/general-step-applicant-sections.tsx:308 | field | `<Select label="ประเภทนิติบุคคล" required data={COMPANY_TYPES} …>` (render เฉพาะ branch `applicantType === 'JURISTIC'`, :290) | CUT — dtamRef "ไม่มีใน ๑.๓" |

## ความพยายามหักล้าง (ทุกทางที่หาได้)

1. **กทล.1 เองขอประเภทนิติบุคคลหรือไม่** — facts.md:16 (ส่วนที่ ๑ ข้อ ๑.๓ นิติบุคคล) ระบุช่องที่ฟอร์มขอครบถ้วน: ชื่อนิติบุคคล · ชื่อผู้มีอำนาจลงนาม · เลขทะเบียนนิติบุคคล/เลขผู้เสียภาษี · ที่อยู่ · โทรศัพท์มือถือ · อีเมล (ถ้ามี) · Line ID — **ไม่มีช่องประเภท/ชนิดนิติบุคคล** และไม่มี checkbox บจก./หจก./บมจ./สหกรณ์ ที่ใดในฟอร์ม → หักล้างไม่ได้
2. **ข้อโต้แย้งแข็งที่สุด: ระบบต้องรู้ชนิดเพื่อเลือกเอกสารคุณสมบัติ** — facts.md:50 แถวนิติบุคคลรับ "สำเนาหนังสือรับรองการจดทะเบียนนิติบุคคล (≤6 เดือน) **หรือ** หนังสือจดทะเบียนวิสาหกิจ/วิสาหกิจเพื่อสังคม/สหกรณ์การเกษตร" — เป็น*ทางเลือกภายในช่องแนบช่องเดียว* ฟอร์มกรมไม่ branch ตามชนิดที่ประกาศ ผู้ตรวจดูจากตัวเอกสาร · เส้นทางนี้ถูกดูแลแล้วโดย REWORD ป้าย upload slot ให้กว้างพอ (general.md:120, verify-6.md:69) และ COOP_CERT = CONDITIONAL ระดับ applicant-type ไม่ใช่ผ่าน companyType (backend-slots.md:103) → อย่างดีที่สุดได้แค่ OPTIONAL แต่ ruling ข้อ 2 สั่งตัดสิ่งเกิน และช่องนี้ปัจจุบัน `required` — ไม่รอด
3. **backend ต้องการค่านี้หรือไม่** — grep ทั้ง apps/backend (นอก tests): จุดเดียวคือ entity-service.js:1462 `companyType: a.companyType || null` — nullable whitelist passthrough · ไม่บังคับใน applicant validation ฝั่ง server · **ไม่มีใน prisma schema เลย** (grep companyType/ประเภทนิติบุคคล ใน apps/backend/prisma = 0 แถว) → ตัดแล้วไม่มีอะไรพัง
4. **downstream ที่แสดงค่า** — provider print client-view.tsx:208 render "ประเภทนิติบุคคล" จาก applicantData — เป็น artifact ของแพลตฟอร์มไม่ใช่แบบ กทล.1 และรับ null ได้ (follow-up เล็ก: ลบแถว render นี้ตอนตัดจริง) · การ GENERATE กทล.1 จาก wizard data ไม่ต้องใช้ค่านี้เพราะฟอร์ม ๑.๓ ไม่มีช่องนี้ (facts.md:16)
5. **กฎหมายไทย/ระบบกระทรวงฉบับอื่นใน repo** — docs/requirements/official-gacp-requirements-dtam.md:108-112 ขอเพียง*เอกสารแนบ* หนังสือรับรองนิติบุคคล ≤6 เดือน ไม่ขอช่องประกาศชนิด · :152 "Applicant Type Logic (นิติบุคคล)" คือการ branch ๑.๑/๑.๒/๑.๓ ระดับบน (KEEP อยู่แล้ว) ไม่ใช่ sub-type · USER-MANUAL.md:285 "เลือกประเภทนิติบุคคลหรือวิสาหกิจชุมชน" = เลือก entity type JURISTIC vs COMMUNITY ตอนสร้าง workspace คนละช่องกัน · ไม่พบ กฎกระทรวง/ประกาศ ที่อ้างชื่อได้บังคับการประกาศชนิดนิติบุคคล ณ วันยื่น (สอดคล้อง grep ของ verify-3.md:19) · หมายเหตุ e-service กรม (facts.md:75) เป็น UNVERIFIED — อ้างเป็นฐานไม่ได้
6. **ความสอดคล้องกับ verdict พี่น้อง** — ทั้ง 5 options ของ select นี้ถูกตรวจซ้ำแบบ skeptic แล้วและ CUT ยืนทุกตัว (verify-0..4) — select ที่ไม่เหลือ option ยืนต่อไม่ได้โดยนิยาม

## Census ของ surface ที่ผูกกับ item นี้

| file:line | kind | UI แสดงจริง (ไทย) | verdict | citation |
|---|---|---|---|---|
| general-step-applicant-sections.tsx:307-314 | field (select, required, branch JURISTIC เท่านั้น) | ประเภทนิติบุคคล | **CUT** | facts.md:16 — กทล.1 ๑.๓ ไม่มีช่องนี้ · ruling 1-2 |
| general-step.tsx:54 | option | บริษัทจำกัด (th-wizard.ts:422) | CUT (ยืนแล้ว verify-0/-4) | ๑.๓ |
| general-step.tsx:55 | option | ห้างหุ้นส่วนจำกัด (th-wizard.ts:423) | CUT (ยืนแล้ว verify-1) | ๑.๓ |
| general-step.tsx:56 | option | บริษัทมหาชนจำกัด (th-wizard.ts:424) | CUT (ยืนแล้ว verify-2) | ๑.๓ |
| general-step.tsx:57 | option | สหกรณ์การเกษตร (th-wizard.ts:425) | CUT (ยืนแล้ว verify-3 — เส้นทางเอกสารไป COOP_CERT/CONDITIONAL) | ๑.๓ + facts.md:50 |
| general-step.tsx:58 | option | อื่น ๆ (th-wizard.ts:426) | CUT (ยืนแล้ว verify-4) | ๑.๓ |
| general-step.tsx:180 | validation | `v.require('companyType', …)` | ต้องลบพร้อมกัน — ไม่งั้น wizard block การส่งด้วยช่องที่ไม่มีอยู่ (note ของ census ถูกต้อง) | ตาม CUT ข้างบน |
| entity-service.js:1462 | backend passthrough | `companyType: a.companyType \|\| null` | ตัดตามได้ (nullable, ไม่มีผู้ใช้ downstream บังคับ) | — |
| client-view.tsx:208 (provider print) | display | renderField('ประเภทนิติบุคคล', …) | ลบแถว render ตอนตัดจริง (แพลตฟอร์ม artifact ไม่ใช่ กทล.1) | — |

## Verdict

**upheld = true — CUT ยืน** ช่อง select ประเภทนิติบุคคลไม่มีใน กทล.1 ส่วนที่ ๑ ข้อ ๑.๓ (facts.md:16) ไม่มีฐานกฎหมายไทย/ระบบกระทรวงที่อ้างชื่อได้ใน repo ที่บังคับ ณ วันยื่น ความแตกต่างชนิดนิติบุคคลที่กรมสนใจอยู่ที่*ทางเลือกเอกสารแนบ*คุณสมบัติ (facts.md:50) ซึ่งดูแลด้วย REWORD ป้าย slot + COOP_CERT/CONDITIONAL แล้ว · backend ไม่ต้องการค่า (nullable passthrough, ไม่มีใน prisma) · note ของ census เรื่องต้องแก้ validate general-step.tsx:180 พร้อมกันถูกต้องและจำเป็น

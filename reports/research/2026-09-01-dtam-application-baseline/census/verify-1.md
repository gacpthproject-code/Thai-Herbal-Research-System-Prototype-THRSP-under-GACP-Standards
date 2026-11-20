# verify-1 — skeptic check: companyType option LIMITED_PARTNERSHIP (ห้างหุ้นส่วนจำกัด)

วันที่: 2026-09-01 · บทบาท: SKEPTIC (พยายามหักล้าง verdict CUT) · ขอบเขต: read-only

## Item under challenge

| file:line | ชนิด | UI แสดง | verdict ที่เสนอ | อ้างอิงที่เสนอ |
|---|---|---|---|---|
| apps/web-app/src/app/health/applications/new/_steps/steps/general-step.tsx:55 | option | ห้างหุ้นส่วนจำกัด (LIMITED_PARTNERSHIP ใน select ประเภทนิติบุคคล) | CUT | ๑.๓ ("เดียวกัน" กับแถว 54) |

## เส้นทางหักล้างที่ลองแล้ว (ทุกทางล้มเหลว)

1. **กทล.1 เองขอประเภทนิติบุคคลหรือไม่** — facts.md บรรทัด 16 (ส่วนที่ ๑ ข้อ ๑.๓ นิติบุคคล): ช่องที่ฟอร์มขอคือ ชื่อนิติบุคคล · ชื่อผู้มีอำนาจลงนาม · เลขทะเบียนนิติบุคคล/เลขผู้เสียภาษี · ที่อยู่ · โทรศัพท์มือถือ · อีเมล (ถ้ามี) · Line ID — **ไม่มีช่องประเภทนิติบุคคล** ไม่มี checkbox บริษัท/ห้างหุ้นส่วน/บมจ./สหกรณ์
2. **เอกสารแนบคุณสมบัติแยกตาม subtype หรือไม่** — facts.md บรรทัด 50 (§2 กลุ่มคุณสมบัติ นิติบุคคล) เอ่ยคำว่า "หุ้นส่วน" จริง ("บัญชีรายชื่อกรรมการ/หุ้นส่วน/สมาชิก") แต่เป็น*แถวเอกสารแนบเดียวที่รับทางเลือกหลายแบบ* ไม่ใช่ช่องกรอกให้ผู้ยื่นประกาศ subtype · checklist จนท. (facts.md บรรทัด 56) ตรวจแค่ "หลักฐานจดทะเบียนนิติบุคคล (กรณีนิติบุคคล)" ไม่แยกประเภท · และโค้ดจริงก็ไม่ได้ใช้ companyType เลือกเอกสาร: `REQUIRED_DOCS_BY_APPLICANT.JURISTIC = ['companyRegDoc','directorListDoc']` คงที่ (general-step.tsx:25-29) — ข้อโต้แย้ง "มีไว้ route เอกสาร" จึงเป็น vibes ไม่ใช่ basis
3. **กฎหมายไทยฉบับอื่นใน repo** — ค้นทั้ง repo: `LIMITED_PARTNERSHIP` มีแค่ 3 ที่ (general-step.tsx:55 · th-wizard.ts:423 · en-wizard.ts:424) — ไม่อยู่ใน prisma schema, ไม่อยู่ใน apps/backend/constants · คำว่า "หุ้นส่วน" ไม่ปรากฏใน apps/backend เลย · document-slots.js:8 อ้าง "กฎกระทรวง พ.ศ. 2559" แต่เนื้อหาคือแบบ ภท.9-16 (ใบอนุญาตสมุนไพรควบคุม) ซึ่ง facts.md บรรทัด 56 ระบุชัดว่าสิ่งที่ กทล.1 ต้องการคือ*ตัวใบอนุญาต*เป็นเอกสารแนบ ไม่ใช่ข้อมูลในแบบคำขอ ภท. · slot `company_reg` (document-slots.js:145-147 "หนังสือรับรองบริษัท กรณีนิติบุคคล") ตรงกับเอกสารแนบ §2 อยู่แล้วโดยไม่ต้องรู้ subtype
4. **ปลายน้ำต้องใช้หรือไม่** — entity-service.js:1462 ส่ง `companyType` เข้า payload สำหรับ PDF/certificate/audit — เป็น plumbing ของแพลตฟอร์มที่รับ null ได้ (`a.companyType || null`) ไม่ใช่ฐานกฎหมาย และ ruling 1 ของ operator (facts.md §4) ห้ามเกณฑ์เพิ่มของแพลตฟอร์ม
5. **ระบบ e-service ของกรม** — facts.md บรรทัด 75 ระบุว่า UNVERIFIED (เข้าโดเมนไม่ได้ขณะวิจัย) — เดาไม่ได้ ไม่นับเป็น basis

## ข้อสังเกตความสอดคล้อง (ไม่เปลี่ยน verdict)

- validate() บังคับ `companyType` (general-step.tsx:180) — census แถว 146-200 ตี REWORD ไว้แล้วว่าบังคับช่องที่ไม่มีใน กทล.1 · การตัด option ทั้ง select (แถว 54-58 + select ใน general-step-applicant-sections) ต้องตัดคู่กับ require นี้ ไม่งั้นฟอร์ม submit ไม่ผ่าน — เป็นเรื่อง implementation-sequencing ของ batch เดียวกัน ไม่ใช่เหตุคง option
- verdict นี้สอดคล้องกับแถวพี่น้องทั้ง select (54 LIMITED_COMPANY, 56 PUBLIC_LIMITED, 57 COOPERATIVE, 58 OTHER — CUT ทั้งหมดใน general.md:33-37) — ไม่มีแถวใดมี basis ต่างกัน

## VERDICT: **CUT — ยืนตามเดิม (upheld)**

อ้างอิง: facts.md บรรทัด 16 (กทล.1 ส่วนที่ ๑ ข้อ ๑.๓ — ไม่มีช่องประเภทนิติบุคคล) + ruling operator ข้อ 1-2 (ชุดบังคับ = กทล.1 เป๊ะ · ตัวเลือกเกิน = ตัด) · ไม่พบกฎหมายไทย/ระบบกระทรวงที่อ้างชื่อได้ใน repo ที่บังคับประกาศ subtype นิติบุคคล ณ วันยื่นขอ GACP กัญชา

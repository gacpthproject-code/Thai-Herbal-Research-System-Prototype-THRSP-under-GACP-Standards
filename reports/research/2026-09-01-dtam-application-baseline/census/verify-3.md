# verify-3 — skeptic check: companyType option COOPERATIVE (สหกรณ์การเกษตร)

วันที่: 2026-09-01 · บทบาท: SKEPTIC (พยายามหักล้าง verdict CUT) · ขอบเขต: read-only

## Item under challenge

| field | value |
|---|---|
| name | companyType option: COOPERATIVE |
| file:line | apps/web-app/src/app/health/applications/new/_steps/steps/general-step.tsx:57 |
| UI แสดงจริง | **"สหกรณ์การเกษตร"** (th-wizard.ts:425) — census row เขียน "สหกรณ์" ไม่ตรงตัวอักษร (แก้ note ได้ ไม่กระทบ verdict) |
| proposed verdict | CUT — dtamRef "๑.๓", note "สหกรณ์การเกษตรปรากฏเฉพาะเป็นทางเลือกเอกสารแนบคุณสมบัติ (§2) ไม่ใช่ช่องกรอก" |

## เส้นทางหักล้างที่ลองแล้ว (ทั้งหมดจาก session นี้ — ทุกทางล้มเหลว)

1. **กทล.1 เองขอประเภทนิติบุคคลหรือไม่** — facts.md:16 (ส่วนที่ ๑ ข้อ ๑.๓ นิติบุคคล): ช่องที่ฟอร์มขอคือ ชื่อนิติบุคคล · ชื่อผู้มีอำนาจลงนาม · เลขทะเบียนนิติบุคคล/เลขผู้เสียภาษี · ที่อยู่ · โทรศัพท์มือถือ · อีเมล (ถ้ามี) · Line ID — **ไม่มีช่อง/checkbox ประเภทนิติบุคคล** dtamRef ของ census ถูกต้อง
2. **มุมแข็งที่สุดของ COOPERATIVE — เอกสารแนบคุณสมบัติแยกชนิด** (มุมที่ verify-0.md:29 ชี้ไว้ว่าเป็น option เดียวที่ผูกกับ distinction จริงใน กทล.1): facts.md:50 (กลุ่มคุณสมบัติ นิติบุคคล) ระบุ "สำเนาหนังสือรับรองการจดทะเบียนนิติบุคคล (ออกให้ไม่เกิน 6 เดือน) **หรือ**หนังสือจดทะเบียนวิสาหกิจ/วิสาหกิจเพื่อสังคม/**สหกรณ์การเกษตร**" — เป็น**ทางเลือกเอกสารในช่องแนบเดียวกัน** ("หรือ") ฟอร์มไม่บังคับให้ผู้ยื่น*ประกาศ*ว่าตนเป็นสหกรณ์ ช่องแนบเดียวที่รับเอกสารชนิดใดชนิดหนึ่งก็ตรงตาม กทล.1 เป๊ะแล้ว → ไม่เป็นฐานให้คงช่องกรอก
3. **ระบบต้องใช้ค่านี้ route เอกสารสหกรณ์หรือไม่** — ไม่: (ก) slot สำหรับสหกรณ์มีอยู่แล้วที่ระดับ applicantType ไม่ใช่ companyType — `COOP_CERT` requiredFor `AGRICULTURAL_COOP` (apps/backend/constants/document-slots.js:270-277) และ engine เทียบด้วย `applicantType` เท่านั้น (document-slots.js:379-380) ไม่มีบรรทัดใดอ่าน `companyType` (ข) census backend-slots.md:103 ตัดสิน COOP_CERT = **CONDITIONAL** ไปแล้วพร้อมพบว่า wiring ตาย (`AGRICULTURAL_COOP` ไม่ใช่ entities.type) และให้ fold เข้าทางเลือกคุณสมบัติของ JURISTIC — เส้นทางสหกรณ์ถูกดูแลที่ slot แล้วโดยไม่พึ่ง option นี้ (ค) verify-0.md:18: `companyType` ไหลเข้า profile blob แบบ `a.companyType || null` (entity-service.js:1462) ไม่มี logic แตกแขนง
4. **กฎหมายไทยฉบับอื่นใน repo** — grep พ.ร.บ.สหกรณ์ / พระราชบัญญัติสหกรณ์ / กฎกระทรวง…สหกรณ์ ทั้ง repo: **ไม่พบ** · docs/requirements/official-gacp-requirements-dtam.md:114 กล่าวถึง "สำเนาหนังสือสำคัญสหกรณ์การเกษตร" ในตาราง**เอกสาร**เท่านั้น · `COOPERATIVE` ใน tenancy.prisma:37 คือ classification ของ Organization (tenant/certifier) คนละเรื่องกับ wizard ผู้ยื่น
5. **ระบบ e-service ของกรม** — facts.md:75 ระบุ UNVERIFIED (เข้าโดเมนไม่ได้ขณะวิจัย) — เดาไม่ได้ ไม่นับเป็น basis
6. **Ruling operator** — facts.md §4 ข้อ 1 (ชุดบังคับ = กทล.1 เป๊ะ ไม่มีเกณฑ์เพิ่มของแพลตฟอร์ม) + ข้อ 2 (ตัวเลือกเกิน DTAM = ตัด) ปิดทาง "เก็บไว้เผื่อมีประโยชน์"

## ความสอดคล้องกับแถวพี่น้อง

- :54 LIMITED_COMPANY (verify-0 upheld CUT) · :55 LIMITED_PARTNERSHIP (verify-1 upheld CUT) · :56 PUBLIC_LIMITED · :58 OTHER — CUT ทั้ง select (general.md:33-37) และ parent select "ประเภทนิติบุคคล" (general-step-applicant-sections.tsx:307-314) ตกทั้งก้อน
- ต้องตัดคู่กับ `v.require('companyType', …)` (general-step.tsx:180 — census แถว 146-200 ตี REWORD ไว้แล้ว) — implementation-sequencing ของ batch เดียวกัน ไม่ใช่เหตุคง option

## VERDICT: **CUT — upheld**

อ้างอิง: facts.md:16 (กทล.1 ส่วนที่ ๑ ข้อ ๑.๓ — ไม่มีช่องประเภทนิติบุคคล) · facts.md:50 (สหกรณ์การเกษตร = ทางเลือก*เอกสารแนบ*คุณสมบัติ ไม่ใช่ช่องกรอก — เส้นทางเอกสารนี้ถูกดูแลแล้วที่ COOP_CERT/CONDITIONAL, backend-slots.md:103) · ruling operator ข้อ 1-2 · ไม่พบกฎหมายไทย/ระบบกระทรวงที่อ้างชื่อได้ใน repo ที่บังคับประกาศชนิดนิติบุคคล ณ วันยื่น
แก้เล็กใน census row: currentTh ควรเป็น "สหกรณ์การเกษตร" (th-wizard.ts:425)

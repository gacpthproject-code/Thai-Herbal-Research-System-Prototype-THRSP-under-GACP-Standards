# verify-2 — skeptic check: companyType option PUBLIC_LIMITED (บริษัทมหาชนจำกัด)

วันที่: 2026-09-01 · บทบาท: SKEPTIC (พยายามหักล้าง verdict CUT) · ขอบเขต: read-only

## Item under review

| file:line | ชนิด | UI แสดง | verdict ที่เสนอ | อ้างอิงที่เสนอ |
|---|---|---|---|---|
| apps/web-app/src/app/health/applications/new/_steps/steps/general-step.tsx:56 | option | บริษัทมหาชนจำกัด (PUBLIC_LIMITED ใน select ประเภทนิติบุคคล) | CUT | ๑.๓ ("เดียวกัน" กับแถว 54) |

หมายเหตุ label: census เขียน currentTh ว่า "บริษัทมหาชน" แต่ label จริงคือ **"บริษัทมหาชนจำกัด"** (th-wizard.ts:424) — คลาดเคลื่อนเล็กน้อย ไม่กระทบ verdict

## เส้นทางหักล้างที่ลองแล้ว (ทุกทางล้มเหลว)

1. **กทล.1 เองขอประเภทนิติบุคคลหรือไม่** — facts.md:16 (ส่วนที่ ๑ ข้อ ๑.๓ นิติบุคคล): ช่องที่ฟอร์มขอคือ ชื่อนิติบุคคล · ชื่อผู้มีอำนาจลงนาม · เลขทะเบียนนิติบุคคล/เลขผู้เสียภาษี · ที่อยู่ · โทรศัพท์มือถือ · อีเมล (ถ้ามี) · Line ID — **ไม่มีช่องประเภทนิติบุคคล** และไม่มี checkbox บมจ./บจก./หจก./สหกรณ์ที่ใดในฟอร์ม
2. **บมจ. สร้างความต่างในเอกสารแนบหรือไม่** — facts.md:50 (§2 กลุ่มคุณสมบัติ, นิติบุคคล): บริษัทมหาชนจำกัดตกใต้ "สำเนาหนังสือรับรองการจดทะเบียนนิติบุคคล (ออกให้ไม่เกิน 6 เดือน)" **ใบเดียวกันกับบริษัทจำกัดและห้างหุ้นส่วน** — ต่างจากแถว COOPERATIVE (สหกรณ์การเกษตรมีทางเลือกเอกสารแนบของตัวเองใน facts.md:50 และ repo จัดการที่ระดับ applicantType อยู่แล้ว: `AGRICULTURAL_COOP` ใน document-slots.js:276) — PUBLIC_LIMITED ไม่สร้างแม้แต่ความต่างเชิง routing เอกสาร ประเภทนิติบุคคลเห็นได้เองจากชื่อจดทะเบียน ("บริษัท … จำกัด (มหาชน)") และจากหนังสือรับรองที่อัพโหลด
3. **ฐานกฎหมายอื่นใน repo** — grep `มหาชน` ทั้ง docs/: **ไม่พบ** · grep `companyType` ใน apps/backend/prisma: **ไม่มี column** · apps/backend/constants: ไม่มีอะไร branch บน companyType — document-slots.js อ้าง **กฎกระทรวง พ.ศ. 2559 + แบบ ภท.09-16** (document-slots.js:5-15,23) แต่นั่นคือภาระใบอนุญาตสมุนไพรควบคุม ซึ่งเข้าคำขอ กทล.1 ในรูป *ตัวใบอนุญาตที่ออกแล้ว* (facts.md:56 ส่วน จนท. 1.1) ไม่ใช่ช่องประกาศประเภทนิติบุคคลในวันยื่น — ไม่มีที่ใดใน repo อ้างกฎหมายที่บังคับให้แจ้ง "บริษัทมหาชน" ตอนยื่น GACP
4. **ปลายน้ำต้องใช้หรือไม่** — entity-service.js:1462 (`buildJuristicPayload`): `companyType: a.companyType || null` — plumbing รับ null ได้ ไม่มี logic ใด branch บนค่า PUBLIC_LIMITED (ยืนยันจาก entity-service.test.js:55-73 — แค่ pass-through เข้า payload JSON) · ruling 1 ของ operator (facts.md §4) ห้ามเกณฑ์เพิ่มของแพลตฟอร์ม
5. **มุม GENERATE** — ระบบต้องผลิต กทล.1 ที่กรอกแล้วจาก wizard data แต่ ๑.๓ ไม่มีช่องประเภทนิติบุคคลให้เติม — การ generate ฟอร์มจึงไม่ต้องการค่านี้
6. **ระบบ e-service ของกรม** — facts.md:75 ระบุ UNVERIFIED (เข้าโดเมนไม่ได้ขณะวิจัย) — เดาไม่ได้ ไม่นับเป็น basis

## ข้อสังเกตความสอดคล้อง (ไม่เปลี่ยน verdict)

- verdict สอดคล้องกับแถวพี่น้องทั้ง select (54 LIMITED_COMPANY, 55 LIMITED_PARTNERSHIP, 57 COOPERATIVE, 58 OTHER — CUT ทั้งหมด general.md:33-37; verify-0 และ verify-1 ยืนแล้วสองแถว)
- validate() บังคับ `companyType` (general-step.tsx:180) — census แถว 146-200 ตี REWORD ไว้แล้ว · ตัด option ต้องตัดคู่กับ require + select แม่ (sections:307-314) ในชุดเดียวกัน ไม่งั้นฟอร์ม submit ไม่ผ่าน — เป็นลำดับ implementation ไม่ใช่เหตุคง option

## VERDICT: **CUT — ยืนตามเดิม (upheld)**

Citation: facts.md:16 (กทล.1 ส่วนที่ ๑ ข้อ ๑.๓ — ไม่มีช่องประเภทนิติบุคคล) + facts.md:50 (บมจ. ใช้เอกสารแนบใบเดียวกับ บจก. — ไม่มีความต่างแม้เชิง routing) + facts.md §4 ruling 1-2 (ชุดบังคับ = กทล.1 เป๊ะ ส่วนเกิน = ตัด)

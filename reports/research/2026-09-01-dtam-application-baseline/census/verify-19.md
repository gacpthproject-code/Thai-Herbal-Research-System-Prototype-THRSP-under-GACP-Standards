# verify-19 — เบอร์โทรผู้ประสานงาน (JURISTIC) — skeptic check 2026-09-01

Item under challenge:
| file:line | UI แสดง | census verdict | dtamRef |
|---|---|---|---|
| apps/web-app/src/app/health/applications/new/_steps/steps/general-step-applicant-sections.tsx:420 | Input label "เบอร์โทร" (`formData.contactPhone`) ใต้ section "ผู้ประสานงาน (ถ้าต่างจากกรรมการ)" (header :409) — render เฉพาะสาขา JURISTIC | CUT | ไม่มีใน กทล.1 |

## Verdict: UPHELD — CUT

## เส้นทางหักล้างที่ลองแล้ว (ทุกทางตัน)

1. **กทล.1 เอง** — facts.md:16 (ส่วนที่ ๑.๓ นิติบุคคล) ขอเพียง: ชื่อนิติบุคคล · ชื่อผู้มีอำนาจลงนาม · เลขทะเบียนนิติบุคคล/เลขผู้เสียภาษี · ที่อยู่ · โทรศัพท์มือถือ · อีเมล (ถ้ามี) · Line ID. ไม่มีบุคคล "ผู้ประสานงาน" ที่ไหนในฟอร์ม ทั้ง 5 หน้า (ส่วนที่ ๒ ข้อ ๑ มีโทรศัพท์ของ*สถานที่* ซึ่งเป็นคนละช่องและ census ตัดสินแยกแล้ว). Header ของ section เองสารภาพว่าเป็นคนเพิ่ม: "ถ้าต่างจากกรรมการ".
2. **ฐานกฎหมายไทยอื่นใน repo** — grep "ผู้ประสานงาน" ทั้ง repo: hit นอก wizard คือ (a) seed-gacp.js:216 title พนักงาน "ผู้ประสานงานนัดหมาย" (scheduler role — คนละเรื่อง), (b) docs/auth/CREDENTIAL-REQUEST-*.md (ผู้ประสานงานฝั่งเราเวลาขอ credential จากหน่วยงาน — operational), (c) USER-MANUAL*.md (บรรยาย wizard ตัวนี้เอง), (d) หน้า provider/coordinator (role จนท.แพลตฟอร์ม). ไม่มีสักแห่งอ้าง กฎกระทรวง/ประกาศ ที่บังคับผู้ประสานงานตอนยื่น.
3. **backend ถือเป็นของบังคับหรือไม่** — ไม่: canonical-application-validator.js:260-269 (สาขา JURISTIC) ไม่ require phone ใดๆ เลยตอน submit; `contactPhone` โผล่แค่เป็น fallback ใน mapping (บรรทัด 127) และเป็น contact profile ของ workspace ใน entity-service.js:1481 — plumbing ของแพลตฟอร์ม ไม่ใช่ฐานกฎหมาย.
4. **ตัดแล้วช่องที่ DTAM ขอจริงหายไหม** — ไม่หาย: โทรศัพท์มือถือของ ๑.๓ ถูก census ผูกไว้กับ "เบอร์โทรกรรมการ" (general.md:112 → REWORD ที่ :388 ให้เป็นช่องมือถือ ๑.๓ และบังคับ). การตัด contactPhone จึงไม่ orphan ข้อกำหนด DTAM.
5. **งานวิเคราะห์ก่อนหน้า** — reports/design-cleanup-2026-08-21/04-WIZARD-VS-DTAM.md:61 สรุปเหมือนกันตั้งแต่ ส.ค.: "ผู้ประสานงาน ชื่อ/โทร/อีเมล (วิสาหกิจ+นิติ) → ตัด — DTAM ขอเบอร์ผู้ยื่นเท่านั้น".
6. **e-service ของกรม** — facts.md:75 ระบุ UNVERIFIED (โดเมนเข้าไม่ได้) — ตามกติกา การเดาไม่ใช่ฐาน.

## หมายเหตุ implementation (ไม่ใช่ข้อหักล้าง)
canonical-application-validator.js:127 map canonical `phone` จาก `firstNonEmpty(phone, presidentPhone, contactPhone, companyPhone)` — **ไม่มี directorPhone ใน chain**. เมื่อ contactPhone และ companyPhone ถูกตัดทั้งคู่ (general.md:116, :113) mapping ต้องเพิ่ม `directorPhone` ให้ช่องมือถือ ๑.๓ ไหลลง canonical ได้ ไม่งั้นนิติบุคคลจะไม่มีเบอร์ใน projection. entity-service.js:1481 ก็ fallback แบบเดียวกัน — ต้องตามแก้พร้อมกัน.

## ความสอดคล้องกับแถวพี่น้อง (ตรวจแล้วไม่ขัดกัน)
- :409 header + :413 ชื่อผู้ประสานงาน + :426 อีเมลผู้ประสานงาน (JURISTIC) = CUT ทั้ง section (general.md:114-117) — สอดคล้อง เพราะอีเมล ๑.๓ มีช่องกรรมการ (:397) รับอยู่แล้ว.
- ฝั่ง COMMUNITY (:224-241) section เดียวกันถูกตัดเหมือนกัน ยกเว้นอีเมลที่ REWORD ย้ายขึ้นส่วนหลัก (general.md:83-86) — ตรรกะเดียวกัน.

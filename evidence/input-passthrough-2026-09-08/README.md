# ด่านรับเลิกแก้ไขข้อความ — escape ย้ายไปอยู่ที่จอ

Operator ruling 2026-09-08: **"ปล่อยผ่านแล้ว escape ตอนแสดงผล แก้เลย"**

## สิ่งที่วัดได้ก่อนแก้

`middleware/sanitize-input.js` ลบ pattern ที่แมตช์ออกจากทุก string ใน `req.body`,
`req.query`, `req.params` โดยไม่แจ้งใครเลย — ผู้ใช้เห็นคำว่าบันทึกสำเร็จ

| ผู้ใช้พิมพ์ | ระบบเก็บจริง |
|---|---|
| `สวนพงษ์ภูวนาท -- แปลงที่ 1` | `สวนพงษ์ภูวนาท แปลงที่ 1` |
| `onsite=ตรวจแล้ว` | `ตรวจแล้ว` |
| `ปุ๋ยสูตร 15-15-15 /* ใช้ตามฉลาก */` | `ปุ๋ยสูตร 15-15-15 ` |

สาเหตุ: `/on\w+\s*=/` มีไว้จับ `onclick=` แต่แมตช์คำอังกฤษใดก็ตามที่ขึ้นต้นด้วย on
แล้วตามด้วย `=` · ส่วน pattern SQL comment ไม่มีความหมายกับ Prisma ที่ parameterise
ทุก query อยู่แล้ว แต่กินวงเล็บอธิบายของจริงไปด้วย

## สิ่งที่เปลี่ยน

1. `middleware/sanitize-input.js` — **บันทึก ไม่แก้ไข** · detection + log warn ยังอยู่ครบ
2. `services/pdf/katorlor1-template-service.js` — export `escapeHtml` เพื่อให้เทสเฝ้าได้
   (ตอนนี้มันคือด่านจริงของสองจุดที่ใช้ `dangerouslySetInnerHTML`)
3. `services/notification-fanout-service.js` — **ช่องที่เปิดอยู่จริง**: `auditorName`
   (ชื่อคน) ถูกใส่ดิบลง body อีเมลหาผู้สมัคร · ตอนนี้ทุกค่าที่ interpolate ลง HTML
   ผ่าน `_escHtml` ยกเว้น `findingsHtml` ที่ตั้งใจให้เป็น markup และ escape ข้างในตัวเอง
4. `apps/web-app/src/utils/validation.ts` — `sanitizeInput` → `escapeHtml`
   (ฟังก์ชันนี้ escape อยู่แล้ว ชื่อเดิมชวนให้เอาไปใช้ผิดด้าน = รากของบั๊กที่เพิ่งแก้)
   ไม่มีผู้เรียกในโค้ด · `tsc --noEmit` ผ่าน

## สองอย่างที่เจอระหว่างรัน suite เต็ม (ไม่ได้เกิดจากงานนี้)

5. `shared/error-codes.js` — `METHOD_NOT_ALLOWED` ที่ผมเพิ่มใน `fe289fea` ไม่ได้ลงทะเบียน
   ทำให้ `error-codes-catalog.test.js` แดง · ลงทะเบียนแล้ว (11/11 เขียว)
6. `__tests__/unit/auth-idp-providers-endpoint.test.js` — เทสชื่อ "thaid **without env**"
   ใช้ `delete process.env.AUTH_THAID_CLIENT_ID` ซึ่งไม่รอด `require` บรรทัดถัดไป:
   dotenv ข้ามคีย์ที่มีอยู่แล้ว แต่เติมคีย์ที่ถูกลบกลับมา · เครื่องนี้มี ThaiD sandbox
   credentials จริงใน `apps/backend/.env` ตัวแปรจึงกลับมา แล้วเทสยืนยันสิ่งตรงข้ามกับชื่อตัวเอง
   เปลี่ยนเป็น `= ''` (ค่าว่างคือ "มีอยู่" dotenv ไม่แตะ และ `Boolean()` อ่านว่าไม่มี)
   พิสูจน์ด้วยการกลายพันธุ์: ปิด fail-closed ที่ `config/auth-providers.js:117` → เทสแดง

## ด่านแสดงผลที่ตรวจครบแล้ว

| จุดแสดงผล | สถานะ |
|---|---|
| React ทั่วไป | escape by default |
| `dangerouslySetInnerHTML` 5 จุด | 3 จุดเป็นค่าคงที่ (style/theme script) · 2 จุดรับ `katorlor1Html` จาก service ที่ escape |
| `pdf-generator.replaceTemplateVariables` | escape `[&<>"']` · คีย์ลงท้าย `_URL/_ROWS/_SECTION/_LIST/_HTML/_BG/_COLOR/_DISPLAY` ใส่ดิบ — ไล่ครบทุกคีย์แล้ว เป็น data URI / เลขที่ระบบออก / fragment ที่ escape ข้างในเอง |
| `routes/api/auth/public.js` (หน้า verify สาธารณะ) | escape ทุกฟิลด์ของผู้สมัคร |
| อีเมล (`notification-fanout-service.js`) | escape แล้วในรอบนี้ |
| CSV export | `neutralizeCsvFormula` (C5-04) มีอยู่แล้ว |
| raw SQL | `$executeRawUnsafe` 2 จุด ใช้ `$1` placeholder — parameterise ครบ |

## ผลรัน

ดู `test-output.txt`

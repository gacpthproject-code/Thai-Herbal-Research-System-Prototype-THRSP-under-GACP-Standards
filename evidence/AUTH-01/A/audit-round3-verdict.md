# AUTH-01-A grep-pin — audit รอบ 3 (สุดท้ายตาม circuit breaker) — **REJECT**

branch `fix/auth-01-a-pin-round2` @ `2a22cb69` · PR #746 · CI เขียวครบ 24 checks
auditor: fresh context รอบที่สาม · orchestrator ยืนยันข้อชี้ขาดเองด้วยการรัน ไม่ได้เชื่อรายงาน

## คำตัดสิน: หยุดที่รอบ 3 ไม่เปิดรอบ 4 (CLAUDE.md §7 + มติ operator 2026-08-04)

operator ตัดสินไว้ว่า *"ถ้ารอบ 3 ผ่านด้วย allowlist ให้ merge ได้ ส่วน AST ให้เข้า BACKLOG"*
รอบ 3 **ไม่ผ่าน** ⇒ เข้าเงื่อนไขหยุด · **ห้าม merge #746 ตามสภาพปัจจุบัน**

## สิ่งที่รอบนี้ทำได้จริง (auditor รันพิสูจน์ ไม่ได้อ่านจาก evidence)

| ข้อ | ผล |
|---|---|
| ช่องลอด 8 จาก 9 ของสองรอบก่อน | ปิดจริง — bracket-write · field-map · `scripts/` · raw SQL · `.mjs` · `.cjs` · `??=`/`\|\|=`/`+=` · backtick สองฝั่ง |
| ช่องที่ 9 (cross-file dataflow) | ยังลอด — **แต่ประกาศไว้ตรง ๆ** ที่หัวไฟล์ `:39-43` |
| floor + ทะเบียน sanity สามชั้น | จับได้ 5/5 การลบ `SCAN_DIRS` แบบเงียบ (ลบ `cron` · `middleware` · `controllers`+`utils` · ลบจากสองทะเบียนพร้อมกัน · พิมพ์ผิด `scriptz`) |
| allowlist ว่าง = คำพูดตรงกับของจริง | จริง — `IDENTITY_LINK_MODEL_REF` และ `IDENTITY_LINKS_TABLE` match **0 บรรทัดใน 594 ไฟล์** |
| `UNSCANNED_DIRS` เป็นคำสารภาพไม่ใช่ที่ซ่อน | จริง — `prisma/` มี `providerId` แต่เป็นค่า CID 13 หลัก และมี `provider_id` **0 จุด** |
| MINOR-2 ของรอบ 2 (15 บรรทัด false positive) | หายจริง — `SNAKE_TO_CID_MAP_PAIR` match 0 บรรทัด |
| full suite / ratchet / ขอบเขตดิฟ | `7147 passed / 1 failed` (pre-existing L-005) · `43/59/169/4` · ดิฟมีแค่ไฟล์เทสต์ + evidence |

## เหตุผลที่ยังไม่ผ่าน — สองข้อที่ orchestrator รันยืนยันเองในคำสั่งเดียว

วางไฟล์สองไฟล์ใน `apps/backend/services/` แล้วรัน pin suite:

```
✓ ไม่มีไฟล์ไหนอ่าน provider_id จาก IdP แล้วเขียนลง providerId / providerIdHash / providerIdHmac
✕ ไม่มีโค้ดใน SCAN_DIRS เขียน identity_links ผ่าน Prisma client เลย ไม่ว่า provider จะเป็นค่าอะไร
Tests: 1 failed, 4 passed, 5 total
```

**(1) การละเมิดจริงลอดผ่าน (เทสต์ 2 เขียว ทั้งที่ควรแดง)** — ไฟล์ที่ทำสิ่งที่ห้ามตรง ๆ:
```js
const { provider_id: providerId, email } = profile;
return prisma.user.update({ where: { id: userId }, data: { providerId, email } });
```
destructure-rename + shorthand · สองบรรทัดติดกัน · ไฟล์เดียว · อยู่ใน `SCAN_DIRS` · ชื่อคอลัมน์เป็น literal
**ไม่เข้าข้อยกเว้นที่ประกาศไว้สักข้อ** และเป็นรูปที่คนเขียนพลาดโดยไม่ตั้งใจได้ง่ายที่สุด
สาเหตุ: `CID_WRITE` (`:243-245`) บังคับให้ชื่อคอลัมน์ตามด้วย `=` หลัง normalize —
รูป shorthand ไม่มี `=` และรูป destructure วางชื่อ camel ไว้ผิดฝั่ง

**(2) โค้ดที่ถูกต้องถูกจับผิด (เทสต์ 4 แดง ทั้งที่ควรเขียว)** — ไฟล์ที่ **อ่านอย่างเดียว**:
```js
const link = await prisma.identityLink.findUnique({ where: { provider_subject: { provider, subject } }, ... });
await prisma.user.update({ where: { id: link.userId }, data: { lastLoginAt: new Date() } });
```
คำว่า `update` ของ Prisma ไปเข้าเงื่อนไข `SQL_WRITE_VERB` และ `findIndex` ค้นทั้งไฟล์
⇒ **การ resolve login ด้วยการอ่าน `identity_links` — ซึ่งเป็นเหตุผลทั้งหมดที่สร้างตารางนี้
และเป็นขั้นถัดไปของ AUTH-01 — จะทำให้ CI แดงและถูกรายงานว่าเป็นการเขียน**
ซ้ำร้าย หัวไฟล์ `:299-301` เขียนไว้ว่า *"การ **อ่าน** identity_links ด้วย raw SQL ไม่ใช่ข้อห้าม"*
ซึ่งขัดกับพฤติกรรมจริง = ปัญหา Law 3.9 ในตัวเอง

**(3) รูป SQL ของการเขียนคอลัมน์ CID มองไม่เห็นโดยโครงสร้าง — และเกิดจากการแก้รอบนี้เอง**
`normalize()` ยุบ quote สามชนิดเป็น `"` แล้ว `CID_WRITE` มี lookbehind `(?<!["\w$])` ที่เพิ่มมารอบนี้
เพื่อฆ่า false positive ของ ternary ⇒ ชื่อคอลัมน์ที่เขียนแบบที่ SQL บังคับ (double quote) match ไม่ได้เลย
```sql
UPDATE "users" SET "providerIdHmac" = $1, "providerIdHash" = $2 WHERE "id" = $3
```
และเหตุผลที่เพิ่ม `scripts/` เข้า `SCAN_DIRS` (`:109-113`) คือ *"backfill script UPDATE คอลัมน์ตระกูล *Hmac ตรง ๆ"*
— เพิ่มไดเรกทอรีเข้ามาเพื่อดักรูปที่ pattern มองไม่เห็น · `scripts/rekey-canonicalid.js:112,125,139`
ใช้ `$queryRawUnsafe` แบบนี้อยู่จริงในรีโปแล้ว

**(4) ทิศทางของ false positive กลับด้าน** — census บนทรีจริง 594 ไฟล์:
`CID_WRITE` match **88 บรรทัดใน 24 ไฟล์** โดยอย่างน้อย 32 บรรทัดไม่ใช่การเขียนคอลัมน์เลย
(`providerId: true` ใน select projection · `where` filter · การประกาศตัวแปร)
⇒ pattern นับ `select` เป็นการเขียน แต่ไม่นับ `data: { providerId }` เป็นการเขียน
suite เขียวอยู่ได้เพราะทั้ง 594 ไฟล์มี snake-read **บรรทัดเดียว** (`mock-idp-adapter.js:69`)
ซึ่งเป็นความบังเอิญเดียวกับที่ auditor รอบสองเตือนไว้ · auditor รอบสามใส่ `provider_id`
ที่ไม่เกี่ยวข้องหนึ่งบรรทัดใน `services/provider-user-service.js:160` แล้ว **suite แดงใส่โค้ดเดิมที่ถูกต้อง**

## MINOR ที่บันทึกไว้ (ไม่ใช่เหตุผลหลักของ REJECT)
- assignment ที่ตัวดำเนินการขึ้นบรรทัดใหม่ · Prisma model alias ที่ `@@map("identity_links")` ·
  `__tests__` ถูกข้ามทุกระดับความลึก (มี `services/email/__tests__` อยู่จริง) · symlinked **directory** ถูกข้าม ·
  `.jsx`/`.tsx`/ไฟล์ไม่มีนามสกุล ไม่ถูกสแกน และ `hasCodeFile()` ใช้รายการเดียวกัน ⇒ dir ใหม่ที่มีแต่ `.jsx`
  ผ่าน sanity ชั้น 3 · `stripComments` ตัดจาก `//` ทำให้ string literal ที่มี `//` ลบท้ายบรรทัดออกจากสายตา ·
  `SUBJECT_INTO_PROVIDER_ID` เป็น same-line และหยุดที่ comma แรก
- **SSOT drift สามทาง**: `prisma/migrations/20260804013000_add_identity_links/migration.sql:53-58`
  และ `evidence/AUTH-01/A/contract-cid-demotion.md:49-53` ยังบรรยาย pin แบบรอบ 2
  ("ค่า provider จริง" + "ระยะ 15 บรรทัด") ซึ่งรอบนี้ถอดออกแล้ว ⇒ สามที่พูดไม่ตรงกัน

## ข้อเสนอต่อ operator (ไม่ตัดสินเอง)
1. **ห้าม merge #746 ตามสภาพนี้** — BLOCKER-3 ทำให้ขั้นถัดไปของ AUTH-01 (resolve login ผ่าน
   `identity_links`) CI แดงทันทีที่เขียน และ BLOCKER-1 ทำให้ pin ไม่ได้กันสิ่งที่ตั้งใจกัน
2. ทางเลือกที่เห็น — **operator เลือก ไม่ใช่ agent**:
   - **(ก) revert เทสต์ 4/5 ออก เก็บเฉพาะส่วนที่พิสูจน์แล้วว่าดีขึ้น** (นามสกุลครบ · `UNSCANNED_DIRS` ·
     floor ต่อ dir · compound assignment) แล้ว merge ส่วนนั้น — ได้กำไรที่พิสูจน์แล้วโดยไม่ติดหนี้ใหม่
   - **(ข) ปิด #746 ทั้งใบ** แล้วทำใหม่ด้วยเครื่องมือที่ตอบคำถาม "อะไรคือการเขียน" ได้เชิงโครงสร้าง
     (AST หรืออ่านจาก Prisma schema) ซึ่ง auditor ทั้งสามรอบชี้ตรงกันว่าเป็นทางเดียวที่จบ
   - **(ค) merge แล้วยอมรับหนี้** พร้อมบันทึกว่า pin นี้ยังไม่กันของจริงและจะแดงใส่ขั้นถัดไป
     — **ไม่แนะนำ** เพราะ CI เขียวจะกลายเป็นคำรับรองที่ผิด
3. AST-based check เข้า BACKLOG ตามที่ operator ตัดสินไว้แล้ว — แต่ถ้าเลือก (ข) มันจะกลายเป็นงานหลัก
   ไม่ใช่ทางเลือกระยะยาว

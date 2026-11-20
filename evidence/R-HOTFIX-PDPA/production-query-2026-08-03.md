# R-HOTFIX-PDPA — หลักฐาน production ที่ทำให้ "ไม่ใช่ emergency"

## ผล query ที่ operator รันบน production เอง (3 ส.ค. 2569)

> `legalHold = 0 แถว` ทั้ง **6 ตาราง** — `users`, `applications`, `certificates`, `invoices`,
> `organizations`, `payment_slips` · **`at_risk = 0`**

⇒ **ยังไม่เคยมีความเสียหายเกิดขึ้นจริง** · ไม่ต้องหยุด cron · ไม่ต้อง merge ทันคืน 3→4 ส.ค.

**ที่มา**: operator รันเอง — orchestrator **ไม่ได้และรันไม่ได้** เพราะคอนเทนเนอร์นี้ไม่มี Postgres
(พอร์ต 5432 ปิด ไม่มีไฟล์ `.env`) บันทึกไว้ตาม Law 3.9 ว่าตัวเลขนี้มาจากไหน

## ทำไมยังต้องแก้ (ไม่ใช่ปิดเรื่อง)

**D-5 ของ R2 คือสิ่งที่จะสร้างแถว `legalHold = true` แถวแรกของระบบ** ⇒ ช่องโหว่นี้ยังไม่เคยถูก
ทดสอบด้วยข้อมูลจริงเพราะ**ยังไม่มีข้อมูลให้ทำลาย** วันที่ D-5 ลง production คือวันที่มันเริ่มมีผล

**เงื่อนไขเวลา: ต้อง merge ก่อน R2 แตะ production** (operator กำหนด)

## ภาพความเสี่ยงจริง ณ วันนี้ (orchestrator ตรวจโค้ดเอง)

| ตาราง | มี `legalHold`/`retainUntil` | มี sweep มาลบไหม |
|---|---|---|
| `users` (auth) | `auth.prisma:161-162` | **มี** — `jobs/pdpa-retention-job.js` (cron ทุกวัน 02:30 ICT, `scheduler.js:186`) |
| `applications` | `application.prisma:162-163` | **ไม่มี** |
| `certificates` | `certification.prisma:116` | **ไม่มี** |
| `invoices` (×2 model) | `billing.prisma:112-113, 511-512` | **ไม่มี** |
| `organizations` | `tenancy.prisma` | **ไม่มี** |
| `payment_slips` | — | **ไม่มี** |

คำสั่งที่ใช้ยืนยันว่ามี sweep เดียว:
```
$ grep -rln "retainUntil\|retention\|anonymiz\|anonymis" apps/backend/jobs/ apps/backend/services/scheduler/ \
    | grep -v __tests__
apps/backend/jobs/pdpa-retention-job.js
apps/backend/jobs/scheduler.js

$ grep -n "prisma\.\|tx\." apps/backend/jobs/pdpa-retention-job.js | grep -v "^\s*//"
66:  prisma.user.findMany   89:  prisma.user.findMany   111:  prisma.user.update   168:  prisma.user.update
```

⇒ อีก 5 ตารางปลอดภัย **โดยบังเอิญ ไม่ใช่โดยการออกแบบ** — ไม่มีใครมาลบเพราะยังไม่มีใครเขียน sweep
ให้มัน ถ้าวันหน้ามีคนเขียน sweep ตัวที่สองโดยไม่รู้กฎนี้ ช่องโหว่เดิมจะกลับมาทันที
**นี่คือเหตุผลที่ guard ต้องเขียนแบบนำกลับมาใช้ซ้ำได้ ไม่ใช่ฝังตายใน user เท่านั้น**

## ช่องโหว่ที่ยังเปิดอยู่ในโค้ด (ยังไม่แก้ ณ เวลาเขียน)

1. `jobs/pdpa-retention-job.js:66-70` เลือกแถวด้วย `retainUntil <= now` อย่างเดียว —
   `grep -n "legalHold" jobs/pdpa-retention-job.js` = **exit 1 ไม่มีสักบรรทัด**
2. `:113-157` anonymize โดย null ทิ้งทั้ง plaintext **และ hash ทุกตัว** (`healthIdHash`,
   `providerIdHash`, `idCardHash`) — คอมเมนต์ `:120` เขียนเองว่า "so even pseudonymous
   correlation is defeated" ⇒ **ย้อนกลับไม่ได้เลย**
3. `:86-97` fallback ที่ยอม re-query แบบ `retainUntil`-only เมื่อเจอ error เกี่ยวกับ
   `isAnonymized` ⇒ ทิ้งตัวกรองทั้งหมดรวมถึง `legalHold` ที่จะเพิ่มเข้าไป
4. เส้นที่ผู้ใช้ร้องขอลบ **เคารพ hold ถูกต้องอยู่แล้ว** (`services/pdpa-service.js:291`,
   `services/pdpa-erasure-service.js:260,533` → `PDPA_LEGAL_HOLD`) ⇒ นโยบายขัดกันเอง
   ระหว่างเส้นร้องขอกับเส้นอัตโนมัติ บนข้อมูลชุดเดียวกัน

# R-HOTFIX-PDPA — ประเมินผลกระทบย้อนหลังของ PDPA retention sweep

**ข้อสรุป: ไม่มีความเสียหายย้อนหลัง ไม่มี recovery action** — sweep เป็น **no-op สมบูรณ์**
ตั้งแต่ลงทะเบียน cron เมื่อ 2026-06-04 (`jobs/scheduler.js:180-197`) จนถึงวันที่ตรวจ

---

## หลักฐานจาก production (operator รันเอง 2026-08-03)

```sql
SELECT
  count(*) FILTER (WHERE "retainUntil" <= now())                                     AS expired_now,
  count(*) FILTER (WHERE "retainUntil" <= now() AND "password" = 'PDPA_ANONYMIZED')  AS already_anonymized,
  count(*) FILTER (WHERE "password" = 'PDPA_ANONYMIZED')                             AS anonymized_total,
  min("retainUntil") FILTER (WHERE "retainUntil" <= now())                           AS oldest_expired,
  count(*) FILTER (WHERE "password" = 'PDPA_ANONYMIZED'
                     AND "sessionsRevokedAt" > now() - interval '7 days')            AS churned_last_week
FROM users;
```

| ตัวชี้วัด | ผล |
|---|---|
| `expired_now` | **0** |
| `already_anonymized` | **0** |
| `anonymized_total` | **0** |
| `oldest_expired` | **null** |
| `churned_last_week` | **0** |

**orchestrator รัน query นี้เองไม่ได้** (คอนเทนเนอร์ไม่มี Postgres) — ตัวเลขทั้งหมดมาจาก operator
บันทึกที่มาไว้ตาม Law 3.9

## ทำไมถึงเป็น no-op — อธิบายจากโค้ด

`User.retainUntil` มี default `now() + 5 years` (`prisma/schema/auth.prisma:161`) ⇒ แถวที่ไม่ได้ตั้งค่า
เองจะยังไม่หมดอายุจนถึงราวปี 2031 · เมื่อ `expired_now = 0` ลูปที่ `jobs/pdpa-retention-job.js:65`
เจอ batch ว่างตั้งแต่รอบแรกแล้ว `break` ทันที ⇒ **ไม่เคยไปถึงขั้น update เลย**

นี่คือเหตุผลที่บั๊กทั้งสามชั้นไม่เคยแสดงอาการใน production

## บั๊กสามชั้นที่ถูกพบ **ก่อน**เงื่อนไขทำงานจริง

| ชั้น | บั๊ก | ถ้าเงื่อนไขมาถึงจะเกิดอะไร |
|---|---|---|
| 1 | **ไม่เช็ค `legalHold`** — `grep -n "legalHold" jobs/pdpa-retention-job.js` ก่อนแก้ = exit 1 | แถวที่ถูกสั่งเก็บตามกฎหมายถูก anonymize ทิ้ง **ย้อนไม่ได้** (null ทั้ง plaintext และ hash) |
| 2 | **คอลัมน์ marker ไม่มีจริง** — `isAnonymized` / `anonymizedAt` ไม่อยู่ในสคีมาและ migration ใดเลย | ไม่มีตัวแยกแถวที่ทำแล้ว ⇒ กวาดซ้ำทุกคืน `sessionsRevokedAt` + `updatedAt` เด้งทุกคืน และ log อ่านเหมือน anonymize คนเดิมซ้ำ ๆ |
| 3 | **`.catch()` กลบ error 2 จุด** — จุด query (ลบไปแล้วในขั้น 1) และจุด update (`:195-198`, ลบในขั้น 2) | error ที่ควรดังกลายเป็น warn แล้วเดินต่อ ⇒ ชั้น 1 และ 2 ไม่มีวันถูกใครเห็น |

**ทั้งสามชั้นเสริมกัน**: ชั้น 3 ปิดปากชั้น 1 และ 2 · ชั้น 2 ทำให้ชั้น 1 ทำงานซ้ำทุกคืนแทนที่จะครั้งเดียว
⇒ ถ้า D-5 ของ R2 ลง production ก่อนที่จะเจอ ความเสียหายจะเป็นแบบย้อนไม่ได้และเงียบ

## ผลกระทบย้อนหลังที่ประเมินไว้ (ก่อนได้ตัวเลข) — และผลจริง

ประเมินจากโค้ดว่า **ต่อให้กวาดซ้ำก็ไม่เสียหายเพิ่ม** เพราะ payload เขียนค่าเดิมทับ
(null → null, `'PDPA_ANONYMIZED'` → ค่าเดิม) การทำลายเกิดครั้งแรกครั้งเดียวซึ่งเป็นพฤติกรรมที่ตั้งใจ
สำหรับแถวที่พ้นกำหนดเก็บ · ผลข้างเคียงที่ประเมินไว้คือ `sessionsRevokedAt` และ `updatedAt`
เด้งทุกคืน ทำให้ `updatedAt` ใช้เป็นสัญญาณ "แถวนี้เปลี่ยนจริงเมื่อไหร่" ไม่ได้

**ผลจริงจาก production: ไม่เกิดแม้แต่ข้อเดียว** เพราะไม่มีแถวเข้าเงื่อนไขตั้งแต่ต้น
(`churned_last_week = 0` ยืนยันว่าไม่มี churn จริง)

## สิ่งที่ต้องทำต่อ

- **ไม่มี recovery action** — ไม่มีข้อมูลให้กู้
- EXPAND migration (`isAnonymized` + `anonymizedAt` บน `users` เท่านั้น) เดินต่อตาม scope เดิม
  ที่ operator กำหนด — ดู `notes.md` ส่วนขั้น 2
- **บทเรียนสำคัญ**: บั๊กทั้งสามถูกพบเพราะ integration test ถูกบังคับให้รันบน **Postgres จริง**
  (กฎ R-R2-1 + PR #735) · unit test แบบ mock ผ่านหมดทั้งสามชั้น เพราะ mock ไม่มีสคีมา ไม่มี
  constraint และรับ field ชื่ออะไรก็ได้ — ดู `BACKLOG-FOUND.md` หมวด "กลไกป้องกันที่มีอยู่แต่ไม่ได้ป้องกัน"

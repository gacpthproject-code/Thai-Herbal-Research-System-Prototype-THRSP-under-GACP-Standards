# G1 ข้อ 5 — probe เงินรันบน Postgres จริง

- วันที่: 2026-09-05T13:43:46+07:00
- ฐานข้อมูล: aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres  (Supabase ที่ demo/prod ใช้ร่วมกัน)
- คำสั่ง: `DATABASE_URL=<redacted> bash scripts/probes/<probe>.sh`
- ทั้งสอง probe เป็น SELECT อย่างเดียว ไม่มีการเขียนใด ๆ

```
$ money-equation
PASS: 0 rows violate the money equation
exit=0

$ drain-complete
FAIL: 4 non-terminal legacy slip transactions remain
exit=1
```

## drain-complete FAIL — 4 แถวนั้นคืออะไร

```
phase | amount(สตางค์) | createdAt | มี expiredAt | สถานะคำขอ
PHASE_1|588500|2026-08-25|t|CERTIFIED
PHASE_1|588500|2026-08-26|t|CERTIFIED
PHASE_1|1765500|2026-08-27|t|CERTIFIED
PHASE_1|588500|2026-08-27|t|CERTIFIED

แถวพี่น้องของคำขอเดียวกัน (SUCCESS / ทั้งหมด):
8|8
```

**อ่านผล**: ทั้ง 4 เป็น BANK_TRANSFER งวดที่ 1 ที่ผู้ยื่นเริ่มไว้แล้วไปจ่ายทางอื่นสำเร็จ
(แถวพี่น้อง 8/8 = SUCCESS) คำขอทั้งหมด CERTIFIED แล้ว และทุกแถวมี expiredAt
⇒ **ไม่มีเงินค้างจ่าย ไม่มีสมการเงินผิด** เป็นแถวที่ไม่เคยถูกปิดสถานะเท่านั้น

ยอด 588,500 สตางค์ = 5,885 บาท ตรงกับ PHASE_1_TOTAL พอดี · 1,765,500 = 3 เท่า

## สิ่งที่ต้องทำ — operator เท่านั้น (L3: agent ห้ามแก้ข้อมูลเงิน)

ปิดทั้ง 4 แถวเป็น CANCELLED พร้อมเหตุผล ไม่ใช่ลบ — เพราะประวัติว่าผู้ยื่นเคยเริ่มโอนแล้วเปลี่ยนใจ
เป็นข้อเท็จจริงที่ผู้ตรวจสอบบัญชีต้องเห็นได้ · เสนอให้ทำผ่านสคริปต์ที่มี --dry-run และ --expect=4
ตามแบบ close-quotations ที่เคยใช้ ไม่ใช่ UPDATE ตรงในฐานข้อมูล

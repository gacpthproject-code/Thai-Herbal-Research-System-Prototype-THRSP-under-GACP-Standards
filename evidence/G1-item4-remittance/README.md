# G1 ข้อ 4 — remittance pipeline (หลักฐาน)

## สิ่งที่วัดได้ก่อนแก้ (Supabase จริง read-only)

```
checkout_orders GROUP BY dtam_remittance_status → PENDING | 8 ใบ | 180,000.00 บาท
SELECT count(*) FROM dtam_remittance_batches    → 0
grep -rn recordRemittanceToDtam (นอก test)      → 0 ผู้เรียก
```

เงินของกรมฯ 180,000 บาทถูกลงเป็นหนี้ 2151-001 ไว้ และไม่มีโค้ดเส้นใดล้างได้

## เทสและการพิสูจน์ว่าเทสมีฟัน

10 suite · 116 เทส เขียวพร้อมกัน (รวม 4 suite ที่มีอยู่เดิมและถูกกระทบ)

กลายพันธุ์ที่รันจริงกับ `dtam-remittance-service.js` — ทุกแบบต้องทำให้เทสแดง:

| กลายพันธุ์ | ผล |
|---|---|
| M1 ถอด `tx` ออกจาก `recordRemittanceToDtam` (journal หลุดนอก transaction) | 1 แดง |
| M2 ยอมให้ไม่มี `bankReference` | 2 แดง |
| M3 ถอดการตรวจยอดสมาชิกเทียบยอดที่บันทึกไว้ | 1 แดง |
| M4 ยอมให้ remit ซ้ำ (ไม่เช็คสถานะ OPEN) | 2 แดง |
| M5 ยอมเปิด batch เปล่า | 1 แดง |

`frontend-fee-mirror-cannot-drift.test.js` พิสูจน์ด้วยการขยับ `PHASE1_PER_SCOPE`
ฝั่ง backend ค่าเดียว → เทสแดงทันที (ก่อนหน้านี้ไม่มีอะไรจับ)

## gate

- `ratchet` PASS — hardcode 33 todo 56 env-direct 122 dup-source 0 (ไม่มีตัวไหนขยับ)
- probe FAIL 5 ตัว = ชุดเดียวกับ baseline เป๊ะ (deploy-drift, gate-attestation,
  main-attestation-audit, no-secret, schema-arg-resolves) ไม่มีตัวใหม่
- suite เต็มรอบที่รันระหว่างทาง: 741 passed / 5 failed — ในนั้น 4 ตัวเป็น baseline
  และ 1 ตัว (`payment-reminder-job`) แดงเพราะ cron เพิ่มจาก 12 เป็น 13 ซึ่งแก้แล้ว
  พร้อม `error-codes-catalog` ที่ **baseline แดงอยู่และตอนนี้เขียว**
- กุญแจเซ็นเอกสารไม่ถูกหมุน: `keys/*.pem` mtime ยังเป็น 2026-09-04

## สิ่งที่เครื่องยังทำแทนคนไม่ได้ (ตั้งใจ)

job เปิด batch อย่างเดียว ไม่เคยประทับ `REMITTED` — เพราะ REMITTED แปลว่าเงินออกจาก
บัญชีธนาคารจริง ซึ่งไม่มีกระบวนการใดในโค้ดนี้มองเห็นได้ · `bankReference` จึงเป็นค่าบังคับ
และไม่มีเส้นทางใดที่ระบบกรอกให้ตัวเอง

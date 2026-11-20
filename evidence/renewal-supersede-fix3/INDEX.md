# fix/renewal-supersede รอบแก้ 3 (HIGH-1 · คำสั่ง 126 · LOW-A · LOW-B)

ผลรันทั้งหมดผ่าน `~/work/state/heavy.sh` บน postgres:17 ชั่วคราว · สรุปผลอยู่ใน `runs/summary.txt` (log ดิบเก็บนอก repo)

| ข้อ | RED | GREEN |
|---|---|---|
| 1 certificateValidOn | โมดูลไม่มี (i1-red) | 14/14 (i1-green) |
| 2 HIGH-1 ประตูเก็บเกี่ยวสามบาน | 201 201 201 403 (i2-red) | 400 HARVEST_DATE_OUTSIDE_CERTIFICATE ทั้งสี่ (i2-green) |
| 3 ประตูล็อต รุ่น QR ทั่วไป | isValid true ของล็อตช่วงว่าง (i3-red) | isValid false, producedInForce false (i3-green) |
| 4 คำสั่ง 126 ตัวชี้ + ถ้อยคำเว็บ | 6 แดง backend, 10 แดง web (i4-red, i4-web-red) | ผ่าน (i4-green, final-web-jest) |
| 5 LOW-A / LOW-B | NOT_IN_FORCE แทน RENEWED · โล่ผ่านบนใบต่ออายุ | HARVEST_CERTIFICATE_RENEWED · ไม่มีโล่ผ่าน |

ภาพ `screens/` 390x844 และ 1440x900: verify-old / lot / generic ของกรณีต่อก่อนหมดอายุ (nogap), หมดก่อนแล้วต่อ (gap), และล็อตที่เก็บในช่วงว่าง (outside) · scrollWidth เท่าความกว้างทุกภาพ (`screens/shots-report.json`)

ชุด DB ทั้งหมดบน a68242a15: 8 ล้มใน 4 ชุด ซึ่งล้มเหมือนกันทั้ง 8 บนฐาน 6c91e6141 (base-4) = ไม่มีความล้มเหลวใหม่

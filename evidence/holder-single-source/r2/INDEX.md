# feat/holder-single-source · รอบแก้ 2 (review F1-F6 + gate 88bd3479d + คำสั่ง 145)

- `test-runs.txt`: RED คำสั่ง 145 (backend 15 ล้ม/5 ผ่าน · web 3 ล้ม/11 ผ่าน บน 57e327931) · GREEN 57 ชุด backend บน Postgres 17 ชั่วคราว (:5436, migrate deploy ครบ) + 10 ชุด web + tsc + eslint · รอบซ้ำหลังแก้ป้ายผู้ลงนาม
- `phone-check.json`: F6 วัดบน viewport 390x844 จริง (ไม่ใช่ full-page): ช่องสุดท้าย (อีเมล) ล่างสุด 670.5 < ขอบบนแถบล่าง 780 · ปุ่มบันทึก 747.5 < 780 · main padding-bottom 96px · ไม่ทับ → ภาพรอบแรกเป็น artefact ของ full-page capture กับ position:fixed
- `PARTNERSHIP-phone-last-input.png`, `PARTNERSHIP-phone-bottom.png`: ภาพ viewport ตอนโฟกัสช่องสุดท้ายและเลื่อนสุด
- บันทึกเต็ม: `~/work/state/reviews/holder-r2-runs/` (red-145-*.log, green-*.log, green2-*, green3-*, stack/) · รายงาน `~/work/state/reviews/holder-single-source-r2-report.md`

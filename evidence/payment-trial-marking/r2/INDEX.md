# payment-trial-marking รอบ 2 (ผลตรวจ 2026-10-21 ข้อ 1 และ 2) · 2026-10-29

ภาพจอเป็นหน้า Next dev ที่ API ถูกจำลองด้วย Playwright route (ไม่ใช่ staging) · PDF เรนเดอร์จาก template จริงด้วยแถวสมมุติ · ไม่มีเงินจริงและไม่มีคีย์ live จริง (`sk_live_stub`)

| artifact | operator ควรเห็น |
|---|---|
| `papers/receipt-settled-test-reprinted-on-live-keys-1.png` | ใบเสร็จที่ settle ในโหมดทดสอบ พิมพ์ซ้ำบนคีย์ live ยังมีตรา "เอกสารทดลอง" (ข้อ 1) |
| `papers/receipt-paid-before-the-record-reprinted-on-live-keys-1.png` | ใบเสร็จที่จ่ายก่อนมีบันทึกโหมด บนคีย์ live มีตรา |
| `papers/receipt-settled-live-printed-on-test-keys-1.png` | ใบเสร็จของเงินจริง พิมพ์บนคีย์ทดสอบ ไม่มีตรา |
| `papers/credit-note-of-test-money-on-live-keys-1.png` | ใบลดหนี้ของเงินโหมดทดสอบ บนคีย์ live มีตรา |
| `papers/credit-note-of-live-money-on-test-keys-1.png` | ใบลดหนี้ของเงินจริง บนคีย์ทดสอบ ไม่มีตรา |
| `papers/unpaid-invoice-on-{live,test}-keys-1.png` | ใบแจ้งหนี้ที่ยังไม่มีเงินเข้า ตามคีย์ของวันนี้ |
| `papers.log` | แต่ละใบ: โหมดของคีย์ โหมดที่บันทึก และมีตราใน HTML ที่พิมพ์หรือไม่ |
| `screens/key-live-row-settled-trial-receipt-390x844.png` | จอใบเสร็จของผู้ยื่นบนคีย์ live แถวที่ settle ในโหมดทดสอบ: ไม่มีประกาศหน้า แต่ใบเสร็จมีตรา |
| `screens/key-{live,trial}-row-settled-{live,trial}-receipt-{390x844,1440x900}.png` | ครบสี่คู่ คีย์ × โหมดที่บันทึก สองขนาดจอ |
| `screens.log` | ประกาศหน้าและตราที่เจอในแต่ละภาพ และ scrollWidth (ไม่มีเลื่อนแนวนอน) |
| `refund-notices.txt` | แจ้งเตือนคืนเงินสี่ฉบับ (ข้อ 2): เงินโหมดทดสอบต่อท้ายประโยคช่วงทดลอง และไม่บอกให้รอโอนหรือส่งเลขบัญชี · เงินจริงคงข้อความเดิม |
| `../runs/r2-backend-red.log` → `r2-backend-green.log` | 6 ชุดเทสต์ backend: ล้ม 43 ที่ 99a522e05 (ก่อนแก้) → ผ่าน 75/75 |
| `../runs/r2-web-red.log` → `r2-web-green.log` | 4 ชุดเทสต์เว็บ: ล้ม 4 → ผ่าน 33/33 |
| `../runs/r2-refund-integration-{red,green}.log` | refund-kinds บน Postgres จริง (scratch): ล้ม 2 → ผ่าน 67/67 |
| `../runs/r2-backend-affected-{red,green}.log`, `r2-backend-affected-green-2.log` | ชุดที่เกี่ยวข้อง 143 ชุด (มี DB) และ 146 ชุดหลังแก้ตัวชี้ error-codes: ผ่านหมด |
| `../runs/r2-web-affected-green.log`, `r2-web-tsc.log`, `r2-*-eslint.log` | เว็บ 96 ชุดผ่าน · tsc ผ่าน · eslint ผ่าน |
| `../runs/r3-i2-{red,green}.log` | ผลตรวจรอบ 2 ข้อ I-2: settle เขียน metadata ทับค่าที่ถูกเขียนหลังอ่านคำสั่งชำระ · ล้ม 2 ที่ 79a0f4b11 (เทสต์หน่วย และ Postgres จริงที่เขียนแถวจริงระหว่างอ่านกับ settle) → ผ่าน 10/10 ที่ 334ea94c5 |
| `../runs/r3-i2-affected.log`, `r3-i2-eslint.log` | ชุดเงินที่เกี่ยวข้อง 150 ชุดบน Postgres scratch ผ่าน 1721/1721 · eslint ผ่าน · สคริปต์ `../r3/run-i2.sh` |
| `run-r2.sh`, `rerun-affected.sh`, `render-reprints.js`, `notices.js`, `viewpack-r2.js` | สคริปต์ที่สร้างทุกชิ้นข้างบน รันซ้ำได้ผ่าน heavy.sh |

ยังไม่มีภาพ: หน้าต่างใบแจ้งหนี้ของฝ่ายการเงิน (`/provider/accounting`) พิสูจน์ด้วยเทสต์ `trial-document-marks` เท่านั้น

ต้องทำก่อนตั้งคีย์ live ครั้งแรก (ผลตรวจรอบ 2 ข้อ I-1): แถวที่จ่ายแล้วแต่ไม่มีบันทึกโหมดอ่านเป็นทดลอง (ตั้งใจ ยังไม่เปลี่ยน) ดังนั้นต้อง backfill `metadata.livemode=false` ให้ใบแจ้งหนี้ที่จ่ายแล้วทุกแถวขณะที่ยังพิสูจน์ได้ว่าเป็นเงินทดสอบ และเพิ่ม probe "ใบแจ้งหนี้ที่จ่ายแล้วแต่ไม่มี `metadata.livemode` = 0" เป็นด่านก่อนคีย์ live

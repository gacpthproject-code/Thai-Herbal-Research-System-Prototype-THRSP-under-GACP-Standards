# `fix/uploads-fail-closed` รอบ 3 — หลักฐาน

งานชั้น C (tier-check: C) · operator เป็นผู้ merge · ฐานรอบนี้ 3035a629c · ที่มา: ผลตรวจอิสระรอบ 2 ข้อ L-1 (การลงทะเบียนสาธารณะตั้งคอลัมน์ที่ไม่อยู่ในฟอร์มได้)

## สรุปสั้น

1. การลงทะเบียนสาธารณะเคยเก็บทุกช่องที่ส่งมาเกินฟอร์ม วัดบน Postgres จริงได้ 48 คอลัมน์ของ User เช่น legalHold (กันผู้ใช้ลบข้อมูลตัวเองตาม PDPA) isEmailVerified ช่องล็อกบัญชี ช่อง 2FA และ createdAt · ฟิลด์ความสัมพันธ์ใน body สร้างแถวที่เกี่ยวข้องได้ทั้ง 6 แบบที่ลอง เช่น คำขอสถานะ CERTIFIED และสมาชิก OWNER ของบริษัทอื่น
2. แก้เป็นรายการอนุญาตทั้งสองจุดที่สร้างข้อมูล: `registerHealthUser` ส่งให้ `register()` เฉพาะช่องในฟอร์ม และ `register()` เขียนคอลัมน์ตามชื่อ · ลบ `_sanitizeInput` และรายการห้ามของประตู · คนที่ลงทะเบียนเป็น INDIVIDUAL เสมอ (Wave B Phase 67)
3. เทสต์บทบาทเดิมที่ใช้ `'ADMIN'` ไม่ได้ตรวจอะไรตั้งแต่เปลี่ยนคำบทบาท 2026-09-10 ตอนนี้ลองคำบทบาทเจ้าหน้าที่ปัจจุบันทั้ง 9 คำ
4. ส่วนลงทะเบียนนี้ถึง main แล้วทาง hotfix/registration-allowlist (main 1d628fcb6 · gate attestation 5f8dde8dd) · merge main 5f8dde8dd เข้ากิ่งนี้ที่ 81b962511 ไฟล์ลงทะเบียนทั้ง 6 ไฟล์เท่ากับ main ส่วนต่างที่เหลือของกิ่งเป็นงาน uploads ยกเว้นเลขบัตรตัวอย่างในเทสต์ 1 ไฟล์ (52de83cd2 คำสั่ง 10)
5. merge main 73cda2d9e เข้ากิ่งนี้อีกครั้งที่ d1545b0be ไม่มีข้อขัดแย้ง · ชุดเทสต์ที่ 0c7d42b6d ไม่มีความล้มเหลวใหม่เทียบ main: ดู `merge-main-73cda2d9e.txt`

## แดงก่อนแก้ แล้วเขียว

| commit | อะไร | ผล |
|---|---|---|
| 7010a1823 | เทสต์ก่อนแก้ บนฐาน 3035a629c | หน่วย 2 ล้ม 5 ผ่าน · Postgres จริงล้ม 7/7: 48 คอลัมน์เก็บค่าจาก body และ nested write 6 แบบได้ 201 พร้อมแถวใหม่ |
| de7fa4d3a | แก้ | หน่วย 7/7 · Postgres จริง 7/7 |
| a0b835fa8 | เทสต์บทบาท 9 คำ | โค้ดจริง 15/15 · mutant ที่ประตูส่ง `body.role` ต่อ แดง 9/9 |

## probe

- ผู้เขียน: DONE(probe:registration-sets-no-protected-column-real-postgres) · mutant ที่ de7fa4d3a สามแบบ (ถอดรายการอนุญาตของประตู · คืนการกระจาย input ใน `register()` · ให้ accountType ตามผู้เรียก) แดงตามคาดทุกแบบ คืนไฟล์ตรงทุกไบต์
- ผู้ตรวจอิสระที่ a0b835fa8 ไม่ veto และรายงานผลรันใน session ของตัวเอง (`~/work/state/reviews/uploads-r3-check-a0b835fa8.md`): DONE(probe:exposure-1ecce0fb) · DONE(probe:battery-a0b835fa8) · DONE(probe:grep-user-write-doors) · DONE(probe:detection-sql-proven) · DONE(probe:no-weakening) · DONE(probe:jev-uploads-r3) ผล Jev "NO HIGH OR CRITICAL FINDINGS"
- รอบเตรียม merge (2026-10-14): mutant ที่ประตูส่งต่อและ `register()` เขียน privacySettings กับ notificationSettings ทำให้เทสต์กวาดคอลัมน์ของ main แดงทั้งสองข้อ โดยชี้สองคีย์นั้นพอดี (`merge-main.txt`)

## ไฟล์ในชุดนี้

| ไฟล์ | พิสูจน์อะไร |
|---|---|
| `red-green.txt` | ผลรายข้อของเทสต์หน่วยและ Postgres จริง ก่อนแก้ (7010a1823) และหลังแก้ (de7fa4d3a) พร้อมผลต่างของข้อที่ล้ม |
| `merge-main.txt` | การแก้ข้อขัดแย้ง 8 ไฟล์ตอน merge main 5f8dde8dd · ตัวชี้รหัสข้อผิดพลาด · mutant privacySettings · เลขบัตรตัวอย่าง · ชุดเทสต์ที่ head หลัง merge |
| `merge-main-73cda2d9e.txt` | merge main 73cda2d9e (d1545b0be): ตรวจ 3 ไฟล์ที่สองฝั่งแตะ · grep ชนิด slip ที่ปลดระวาง · mutant ของ slips/ · ชุดเทสต์ที่ 0c7d42b6d เทียบชื่อข้อที่ล้มกับ main |

## ภาพหน้าจอ

ไม่มีหน้าจอไหนเปลี่ยน รอบนี้ไม่แก้ไฟล์ใต้ `apps/web-app` · สิ่งที่เปลี่ยนคือคอลัมน์ที่การลงทะเบียนเขียน ซึ่งพิสูจน์ด้วย service จริงบน Postgres จริง และผู้ตรวจอิสระยิงผ่าน HTTP จริง

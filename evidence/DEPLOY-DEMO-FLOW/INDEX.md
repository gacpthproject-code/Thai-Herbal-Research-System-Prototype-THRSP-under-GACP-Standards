# DEPLOY-DEMO-FLOW — evidence pack (ชั้น C)

คำตัดสิน operator 2026-11-08 "ใช่เครื่อง demo เป็นเครื่องทดสอบแทน" และ "ตามคุณตัดสินใจ" · branch `ops/deploy-demo-flow-v2` (PR #875)
head โค้ด efd2e1733 = commit เดียวบน main 12630eb52 · ยังไม่ deploy · ยังไม่มีสคริปต์ใดรันกับเครื่อง demo จริง

## squash จาก #874
- efd2e1733 คือ squash ของ branch เดิม `ops/deploy-demo-flow` (PR #874, ปลาย 93b3abceb) · `git diff 93b3abceb efd2e1733` ว่าง ต้นไม้ตรงกันทุกไฟล์
- เหตุผล: commit 41834ed2d ของ branch เดิมเขียนค่ารหัสผ่านปลอมของ selftest เป็นสตริงเดียวในซอร์ส gitleaks โหมด git ของ full gate จับเป็น `generic-api-key`
  และสแกนทุก ref ในคลัง WSL จึงทำให้ `secret-scan-deep` ล้มทุก branch บนเครื่องนี้ รวม main · 93b3abceb แก้ fixture แล้ว (ประกอบค่าตอนรัน ค่าเดิมทุกตัวอักษร) แต่ 41834ed2d ยังอยู่ในประวัติ
- operator เลือก 2026-11-08 "squash แล้วลบ branch เก่า" · ปิด #874 · ลบ branch เดิมทั้ง origin, WSL และ Windows checkout · ไม่มี ref ใดไปถึง 41834ed2d
- `gitleaks-before-after.txt` gitleaks โหมด gate ก่อนลบ ref: leaks found 1 (exit 1) · หลังลบ: no leaks found (exit 0) · ใน full gate ของ efd2e1733: `secret-scan-deep` pass

## full gate ของ efd2e1733
- `evidence/gate/efd2e1733169f2e45a2def544ab3bb557b96792d.json` และ `evidence/gate/fails/efd2e1733169f2e45a2def544ab3bb557b96792d.txt` · dirty=false
- gate-compare เทียบ base af94cff9a: ล้มใหม่ 0 check, 0 เทสต์ · verdict UNPROVEN จากสองแถวที่แดงทั้งสองฝั่งด้วยเหตุผลเดียวกัน
  - `deploy-drift`: demo-backend และ demo-frontend รัน b8d27a690 ไม่ใช่ origin/main 12630eb52 (ช้ากว่า 196 commit) · เป็นสถานะเครื่อง demo ไม่ใช่โค้ดของ branch และจะเขียวเมื่อ deploy
  - `integration-no-skip`: integration 13 เทสต์ข้ามตัวเองทั้ง base และ head (numPendingTests=13 เท่ากัน) · log ไม่มีชื่อเทสต์
- ผลด้านล่างที่อ้าง head af4799949 เป็นของ branch เดิมก่อน squash (โค้ดเดียวกับ efd2e1733 ยกเว้น fixture ใน 93b3abceb และชุดหลักฐานนี้)

- `test-output.txt` LOCAL_GATE_FULL=1 ของ head af4799949 เทียบ base 12630eb52 (รันบนเครื่องเดียวกันผ่าน heavy.sh) · ไม่มีความล้มเหลวใหม่
  ระดับขั้น, probe, ชื่อเทสต์ jest และบรรทัด green-mask · jest 16 failed / 13891 passed / 16314 total เท่ากันทั้งสองฝั่ง · ขั้นใหม่สามขั้นผ่าน
- `probe-results.json` ผล probe-gate ของ head
- `ratchet-before-after.txt` ตัวนับ ratchet สามจุด · baseline ไม่ขยับ
- `red-green.txt` เทสต์ที่ล้มก่อนเขียนโค้ด และ mutation ทีละจุด
- `reviews.md` ผลตรวจอิสระห้ารอบ (รอบสุดท้าย APPROVE)
- `gitleaks-before-after.txt` gitleaks โหมด git ก่อนและหลังลบ ref ที่ไปถึง 41834ed2d

ไม่มี view-pack (trace/video/screenshots): งานนี้ไม่มี UI

## ข้อที่ต้องรู้
- ระหว่างเขียนเทสต์ config ผิดรูปแบบของตัวเดินตรวจ (ตอนยังแดง) เทสต์ได้เดินแถว identity จริงหนึ่งครั้ง แถวนี้อ่าน `/api/health`
  และ `/api/webapp-version` ของ demo.gacpth.com แบบอ่านอย่างเดียวผ่าน `deploy-drift.sh` (คาดจากโค้ด ไม่ได้เก็บ log ของรอบนั้น)
  เทสต์ถูกแก้ให้แทน fetch และแถวด้วยตัวปลอมแล้ว · ไม่มีการเขียนหรือ ssh ไปเครื่อง demo
- main วันนี้ (12630eb52) ไม่มี attestation ของตัวเอง และระหว่าง attestation ล่าสุด af94cff9a กับ main มีไฟล์นอก evidence/
  ⇒ `demo-precheck.sh` จะปฏิเสธ main จนกว่าจะมี full-gate attestation ของ sha ที่จะ deploy (อนุมานจาก git diff · ยังไม่ได้รัน precheck กับ main เพราะสคริปต์ยังไม่อยู่บน main)
- งานต่อ (low จากผู้ตรวจรอบ 5): ให้ scrub รันด้วย `LC_ALL=C` · URL ที่ถูกตัดข้ามบรรทัดไม่ถูกปิด · `.env.demo` แบบ CRLF ล้มแบบปิดด้วยข้อความว่าไม่ได้ชี้ project
- ไฟล์ทุกไฟล์ในโฟลเดอร์นี้ผ่าน `gitleaks detect --no-git --no-banner --redact --source <file>`

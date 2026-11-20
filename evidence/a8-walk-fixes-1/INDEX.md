# หลักฐาน fix/a8-walk-findings-1

เดินจริงบน stack scratch ของเครื่องนี้ผ่าน heavy.sh วันที่ 2026-10-21 16:12-16:36 (PG17 + Redis + backend NODE_ENV=production + next dev + Chromium ตัวเดียว) · ไม่แตะ staging หรือ demo · รอบ main รันโค้ด 88bd8f820 รอบ branch รันโค้ด a0ef01e75 · ฐานข้อมูลใหม่ทุกรอบ ข้อมูลทดสอบสร้างด้วย `runs/fixtures.js` แล้วเดินผ่านประตู HTTP และหน้าเว็บจริงด้วย `runs/walk.js`

| ข้อ | main (แดง) | branch (เขียว) |
|---|---|---|
| F-A8-01 | `main/F01-desk-2-after-click.png`, `main/F01-phone-2-after-click.png`: ปุ่มพาไป `/health/applications/new/step/1` | `branch/F01-{desk,phone}-1..3-*.png`: อัปโหลดในหน้าเดิม 200 ส่งกลับ 200 สถานะ ASSIGNED_FOR_REVIEW |
| F-A8-04 | `main/doors.jsonl` บนจอ 24 ข้อ เซิร์ฟเวอร์เก็บ 0 · ส่งผล 422 ข้อความอังกฤษ `main/F04-desk-3-decision-refusal.png` | `branch/doors.jsonl` บนจอ 24 เก็บ 24 · 422 ข้อความไทยจากแคตตาล็อก `branch/F04-desk-3-decision-refusal.png` |
| F-A8-05 | `main/F05-1-jobsheet-with-evidence.png` ไม่มีไฟล์หลักฐาน · ปุ่มผ่านกดได้ | `branch/F05-1..4-*.png` แสดง car_evidence.pdf เปิดดูได้ (backend ส่งไฟล์ 200) · ไม่มีหลักฐานแล้วปุ่มผ่านปิด และประตูตอบ 422 CAR_EVIDENCE_MISSING |
| F-A8-08 | `main/doors.jsonl` ผู้ยื่นเห็น 22 ต.ค. ระบบบังคับ 29 ต.ค. 23:59 · ฟอร์มเจ้าหน้าที่มีช่องวันที่ `main/F08-reviewer-2-request-form.png` | ผู้ยื่นเห็นวันเดียวกับที่ระบบบังคับ · ฟอร์มไม่มีช่องวันที่ `branch/F08-reviewer-2-request-form.png` |
| F-A8-10 | `main/F04-F10-{desk,phone}-2-review.png` แสดง YES | `branch/F04-F10-{desk,phone}-2-review.png` แสดง ใช่ |
| F-A8-13 | `main/doors.jsonl` round 1 และแถวรอบ 1 ถูกเขียนทับเป็น ACCEPTED | `branch/doors.jsonl` round 2 แถวรอบ 1 ยังเป็น MORE_REQUESTED พร้อมเหตุผล · `branch/F13-reviewer-1-second-round.png` |

ผลรันเทสต์ใน `runs/`: `red-backend.txt` (b87b0a956 แดง 7 ข้อตามเจตนา) · `red2-backend.txt` (499bfd505 แดง 2 ข้อ B1 B2) · `green-final.txt` (a0ef01e75 108 ไฟล์ 2071/2071) · `web-red.txt` · `web-final.txt` (1 ข้อแดงเดิมบน main: resubmit-button-renders) · `web-tsc*.txt` 0 error ทั้งสองต้น

ภาพทุกภาพปิดเลข 13 หลักก่อนถ่าย · gitleaks ทั้งโฟลเดอร์ไม่พบ · เลข 13 หลักใน log เป็น timestamp มิลลิวินาทีเท่านั้น

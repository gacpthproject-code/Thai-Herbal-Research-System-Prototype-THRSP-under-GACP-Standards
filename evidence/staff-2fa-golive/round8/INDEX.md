# chore/staff-2fa-golive รอบ 8 — คำสั่ง 105 ข้อ 4 (M1) · L1 · Info 5 ของการตรวจอิสระ 4b61bf6a9

worker Fable 5.1 · 2026-10-21 · brief `~/work/state/reviews/brief-staff-2fa-golive-round8.md` · worktree `/home/ubuntu/work/wt-2fa`

## เทสต์ที่รันตรง (ไม่ใช้ฐานข้อมูล · bash จริงบน PATH ที่มี docker/ssh/sudo/hostname/curl ปลอม ซึ่งจดทุกคำสั่งที่ได้รับ)

| ไฟล์ | เนื้อหา |
|---|---|
| `runs/red-4b61bf6a9-unit.txt` | RED: ชุดใหม่ 3 ชุดบนต้นไม้ 4b61bf6a9 (scratch worktree + คัดลอกเทสต์เข้า) 22/23 ล้ม · ตาราง hosts ไม่มี (ENOENT) · wrapper เก่ารับ `nowhere` เป็นชื่อคอนเทนเนอร์แล้วรันต่อ (exit 0 ไม่ใช่ 2) · `--event` เป็นตัวเลือกที่ไม่รู้จัก · followsEmergencyReset ไม่ได้ export |
| `runs/green-unit-worktree.txt` | GREEN บนหัวรอบ 8: staff-2fa-ops-scripts-host-bound 13/13 · staff-sessions-revoke-approved-events 7/7 · follows-emergency-reset 3/3 · ชุดข้างเคียง staff-2fa-emergency-reset-refuses, privacy-notice-audit-log-ip, pdpa-final-sweep ผ่าน รวม 49/49 |
| `runs/mutant-A-no-revoke.txt` | สคริปต์เปิดธง staging ไม่เรียกขั้นตัด session → 2 ข้อล้ม (จับได้) |
| `runs/mutant-B-no-host-check.txt` | lib ไม่ตรวจ hostname → 5 ข้อล้ม (จับได้) |
| `runs/mutant-C-no-log.txt` | lib ไม่ติด exit trap ที่เขียน runs.log → 11 ข้อล้ม (จับได้) |
| `runs/gitleaks-files.txt` | gitleaks ทีละไฟล์ 13 ไฟล์ (สคริปต์ ตาราง เทสต์ harness) no leaks ทุกไฟล์ |

## ชุด Postgres จริง (ผ่าน heavy.sh ตามคำสั่ง 97 · `harness/job-round8.sh <tree> <label> [full]`)

- RED: `job-round8.sh <scratch tree 4b61bf6a9 + เทสต์ใหม่> red` → `/tmp/staff-2fa-golive/round8-red/logs/` (ข้อที่ต้องล้ม: การรันรอบสองถูกปฏิเสธ · L1 บัญชีที่สร้างก่อนวันเริ่มนับ · `--event` ไม่รู้จัก)
- GREEN: `job-round8.sh /home/ubuntu/work/wt-2fa green full` → `/tmp/staff-2fa-golive/round8-green/logs/` (sessions-revoked db + redis · emergency-reset · staff-doors · ชุด unit 6 ชุด)
- ผลคัดลอกเข้า `runs/heavy-*.txt` เมื่อคิว heavy.sh ปล่อย (ดู `runs/` ถ้าไม่มีไฟล์ heavy-* แปลว่ายังไม่ได้รันตอน push)

## ผล heavy.sh ที่คัดลอกในรอบ 9

- `runs/heavy-red-job.txt`: tree 4b61bf6a9 + เทสต์รอบ 8 · db 3/13 ล้ม (ข้อที่ต้องล้ม) · unit ทั้ง 3 ชุดล้มตามคาด
- `runs/heavy-green-job.txt` และ `runs/heavy-green-db-sessions-revoked.txt`: job นี้รันบน `/home/ubuntu/work/wt-2fa` ตอน 12:23 ซึ่งตอนนั้น HEAD คือ 1743ca1e7 (รอบ 9) ไม่ใช่ a15f08a59 ผลจึงเป็นของหัวรอบ 9 · db 2/16 ล้ม (รายงานเข้าระบบครั้งแรก 2 ข้อ ซึ่งขัดกับกติกา L1 ของรอบ 8 แก้ใน e9b6a8e28) · ชุดอื่น 8 ชุดผ่าน

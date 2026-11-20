# chore/staff-2fa-golive รอบ 9 — คำสั่ง 108 ข้อ 1

worker Claude Opus 5.5 · 2026-10-21 · brief `~/work/state/reviews/brief-staff-2fa-golive-round9.md` · worktree `/home/ubuntu/work/wt-2fa`

กติกา: ทุกการเปิดธงตัด session รวมการเปิดซ้ำหลัง rollback · สถานะของเครื่อง off → on → rolled-back → on อ่านจากแถว audit ล่าสุด (`STAFF_SESSIONS_REVOKED_AT_FLAG_ON` = on · `STAFF_MFA_FLAG_ROLLED_BACK` = rolled-back · ไม่มี = off)

## เทสต์ที่รันตรง (ไม่ใช้ฐานข้อมูล · bash จริง · docker/ssh/sudo/hostname/curl ปลอม · ssh ปลอมรันสคริปต์ฝั่ง demo จริงในโฟลเดอร์ชั่วคราว)

| ไฟล์ | เนื้อหา |
|---|---|
| `runs/red-a15f08a59-unit.txt` | RED บนโค้ด a15f08a59 + เทสต์รอบ 9: 7/29 ล้ม ((a) และ (c) ของทั้งสอง wrapper · rollback ที่บันทึกไม่สำเร็จ ทั้งสอง wrapper · flag-off ใน js) · (b) ผ่านอยู่แล้วทั้งสอง wrapper |
| `runs/green-unit-worktree.txt` | GREEN: 6 ชุด 58/58 (host-bound 21 · approved-events 8 · follows-emergency-reset · emergency-reset-refuses · privacy-notice-audit-log-ip · pdpa-final-sweep) |
| `runs/mutant-A-staging-no-flag-off.txt` | staging rollback ไม่บันทึก flag-off → 3 ข้อล้ม |
| `runs/mutant-B-demo-no-flag-off.txt` | demo rollback ไม่บันทึก flag-off → 3 ข้อล้ม |
| `runs/mutant-C-marker-removed-before-record.txt` | staging ลบ marker ก่อนบันทึก → 1 ข้อล้ม |
| `runs/mutant-D-js-flag-off-accepted-with-flag-on.txt` | js รับ flag-off ทั้งที่ธงเปิด → 1 ข้อล้ม |

## ชุด Postgres จริง (heavy.sh · `harness/job-round9.sh <tree> <label> [full]`)

- RED: tree a15f08a59 + เทสต์รอบ 9 → `runs/heavy-red-job.txt` และ `runs/heavy-red-db-failures.txt` · db 4/16 ล้ม: (a) และ (c) ล้มที่ขั้น rollback เพราะ js เดิมตอบ "เหตุการณ์ flag-off ไม่อยู่ในรายการที่อนุมัติ" (ไม่มีทางบันทึกการย้อน การเปิดครั้งถัดไปจึงถูกปฏิเสธเหมือนข้อ 105 ข้อ 4 เดิม) · (b) ผ่านอยู่แล้ว · อีก 2 ข้อคือรายงานเข้าระบบครั้งแรก ล้มบน a15f08a59 เองก่อนรอบ 9 (ขัดกับกติกา L1 ของรอบ 8 · แก้ที่เทสต์ใน e9b6a8e28) · unit 6/21 + 1/8 ล้มเหมือนรันตรง
- GREEN: tree e9b6a8e28 full → `runs/heavy-green-job.txt` และ `runs/heavy-green-db-sessions-revoked-tests.txt` · 10 ชุด 0 ล้ม (db 16/16 · redis 16/16 · emergency-reset 11/11 · staff-doors 25/25 · unit 6 ชุด 58/58)

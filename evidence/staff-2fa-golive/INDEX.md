# หลักฐาน chore/staff-2fa-golive (ชั้น C · คำสั่ง 86 · privacy review F-3)

ฐานที่แตกกิ่ง: origin/main 4b549f17c · หัวกิ่งตอนเขียนชุดนี้: 929b8a8d4

รอบ 2 (คำสั่ง 89: ทาง ก รหัสสำรองย้ายเครื่อง · ทาง ข สคริปต์ฉุกเฉิน) อยู่ที่ `round2/INDEX.md` · งานหนักที่รอบนี้เข้าคิวไว้ (ด้านล่าง) รันแล้ว 18:48-18:49 บน 9a6bd8727 แต่ผล QA ธงปิดใช้ไม่ได้: harness ฆ่า subshell ไม่ใช่ node, server ธงปิดตายด้วย EADDRINUSE จึงวัดบน server ธงเปิด และ node ที่ค้างถือ fd 9 ของ heavy.sh ล็อกเลนไว้ (relay ของ coordinator 19:05) · ผลรอบ 1 ไม่ถูก commit · งานรอบ 2 (`harness/job-round2.sh`) รันทุกข้อใหม่: ประตูบน main · M1-M3 · หัวกิ่ง · ทะเบียนรายชื่อ · QA ธงเปิด/ปิด → `round2/runs/`

## สิ่งที่วัดแล้วใน session นี้ (ผลรันจริง)

| ไฟล์ | ว่าอะไร | ผล |
|---|---|---|
| `probes/unit-touched.txt` | ชุดหน่วยที่แตะ 3 ไฟล์ (role-filters-canonical-only · customer-statement-service · a-locked-out-officer-can-still-enrol) รันนอก heavy.sh เพราะ mock prisma ไม่แตะฐานข้อมูล | 3/3 ชุด 44/44 เทสต์ ผ่าน |
| `probes/parse-only.txt` | เทสต์ใหม่โหลดโดยไม่มีฐานข้อมูล (describeIfTestDatabase ข้าม) พิสูจน์ว่า require และ syntax ถูก | 1 ชุด ข้าม 25 เทสต์ ไม่มี error |
| `probes/error-codes-validate.txt` | `extract-error-codes.js --validate` | 463/463 ไม่มีรหัสใหม่ จึงไม่ต้อง --markdown |
| `probes/ratchet-before-after.txt` | ratchet.sh บน main และบนกิ่ง | เท่ากัน hardcode 26 · todo 33 · env-direct 93 · dup-source 0 PASS |
| `probes/tier-check.txt` | tier-check.sh diff origin/main...HEAD | TIER=C (auth-identity · compose · secret-material) |
| `probes/gitleaks-new-files.txt` | gitleaks ทีละไฟล์ใหม่ทั้งหมดรวมสคริปต์ infra นอก repo | no leaks ทุกไฟล์ |
| `probes/overlay-sed-dry-run.txt` | sed ของ mfa-flag-on.sh ทดลองบนสำเนา overlay ที่ติดตั้งอยู่ใน /opt (อ่านอย่างเดียว) | บรรทัดตายตัว 1 → 0 บรรทัดส่งต่อ 1 |
| `comment-review.md` | สรุปผลผู้ตรวจความเห็น (comment-sicko) และสิ่งที่รับ | รับ 8/8 ลบ 49 บรรทัด |

## สิ่งที่ยังรอผลรัน (งานหนักเข้าคิว heavy.sh อยู่ · คิวมีงานเต็มชุดนำหน้า 4 งานตอนส่งมอบ)

งานเดียว `/tmp/staff-2fa-golive/job.sh` (สำเนาใน `harness/job.sh`) ต่อ Postgres และ Redis ชั่วคราวบน loopback ค่าลับอยู่ในไฟล์ 0600 ใต้ /tmp/staff-2fa-golive ไม่อยู่ใน argv:
1. `base-main-4b549f17c` เทสต์ใหม่บน origin/main (คาด: เขียว เพราะประตูปิดอยู่แล้ว กิ่งที่ลบเป็นโค้ดตาย)
2. `mutant-M1-provider-door-ignores-flag` (ประตูเจ้าหน้าที่ไม่สนธง) · `mutant-M2-health-door-no-portal-check` (ประตูผู้ยื่นถอด expectedPortal = ช่องโหว่ที่ F-3 กลัว) · `mutant-M3-thaid-links-staff` (ThaID รับบทบาทเจ้าหน้าที่) คาด: แดงทีละประตู
3. `green-head-314291528` เทสต์ใหม่บนหัวกิ่ง (ต้นไม้ทำงานตอนรันคือ 929b8a8d4 ต่างจาก 314291528 เฉพาะความเห็นและตัวกรองซ้ำในทะเบียน)
4. `roster.txt` ทะเบียนรายชื่อบนฐานที่ seed เจ้าหน้าที่ทุกสถานะ (ลงทะเบียน TOTP · ยังไม่ลง · วิธี EMAIL ที่ปลด · ปิดใช้งาน · ไม่เคยเข้าระบบ · สองหน่วยงาน · ผู้ยื่นต้องไม่ติดมา)
5. `qa-script-flag-on.txt` / `qa-script-flag-off.txt` สคริปต์ QA ยิง harness HTTP จริงบน 127.0.0.1:8471 คาด: ธงเปิด "ผ่าน" exit 0 · ธงปิด "ไม่ผ่าน" exit 1

ผลจะอยู่ที่ `/tmp/staff-2fa-golive/logs/` (job.txt สรุปทีละขั้น) · coordinator คัดลอกเข้า `runs/` หลังสแกน gitleaks แล้ว commit เป็นหลักฐานรอบถัดไป · ถ้าคิวไม่ขยับ รันซ้ำได้ด้วย `~/work/state/heavy.sh bash /tmp/staff-2fa-golive/job.sh`

## สิ่งที่ไม่ได้รันโดยตั้งใจ
- ไม่แตะ staging หรือ demo: ไม่รันทะเบียนรายชื่อ สคริปต์ QA หรือสคริปต์เปิดธงที่นั่น (รอคำว่า "deploy" และกฎ allow ชื่อสคริปต์จาก operator ตามคำสั่ง 76)
- full gate (`LOCAL_GATE_FULL=1`) ยังไม่รันบนกิ่งนี้ เป็นของ coordinator ตามแนวทางเดิมของ HARNESS_LOG

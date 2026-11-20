# Runbook: deploy ขึ้นเครื่อง demo (เครื่องทดสอบ)

**สถานะ:** เขียน 2026-11-08 · ยังไม่มีสคริปต์ใดรันกับเครื่องจริง · selftest ผ่านกับ ssh/scp/docker ปลอมเท่านั้น
**ที่มา:** operator 2026-11-08 "ใช่เครื่อง demo เป็นเครื่องทดสอบแทน" และ "ตามคุณตัดสินใจ" · ไม่มี staging แล้ว
(`staging-on-demo-host.md` ยกเลิก) · เครื่อง demo 119.59.105.140 คือเครื่องทดสอบ · คำสั่ง 164 แก้ 2026-11-08
**ทำเมื่อ:** ได้คำว่า "deploy" จาก operator เท่านั้น · สิทธิ์ของ Claude Code ระบุชื่อสคริปต์ทีละตัว (ด้านล่าง) · ระบบสิทธิ์ปฏิเสธ = หยุดแล้วรายงาน
**ห้าม:** build ภายใน 24 ชั่วโมงก่อนวันนำเสนอนักลงทุน (คำสั่ง 164(6)) · `up` เปล่า · `--remove-orphans` · แก้สคริปต์ระหว่างรอบ

## ภาพรวม

ทุกสคริปต์รับ sha เต็ม 40 ตัวเป็นอาร์กิวเมนต์เดียว · หยุดพร้อมข้อความภาษาไทยเมื่อเงื่อนไขไม่ครบ (exit 1) · ไม่พิมพ์ค่าลับ ·
URL ของฐานข้อมูลไม่อยู่ใน argv (อ่านจาก `.env.demo` บนเครื่องเข้า env ของ process) · ขั้นบนเครื่องทำผ่าน `ssh gacp-demo`
โดยส่ง `scripts/deploy/demo-remote.sh` ทาง stdin · สถานะของรอบอยู่ที่ `~deploy/gacp-build/<sha12>/` บนเครื่อง
ขั้นหลังตรวจว่าขั้นก่อนจบแล้ว (build → backup → migrate → up) จึงข้ามขั้นไม่ได้ · รันซ้ำขั้นเดิมได้
ทุกสคริปต์หยุดถ้า `scripts/deploy` ใน checkout ที่สคริปต์อยู่ไม่ตรงกับ sha (แก้ค้างหรือมีไฟล์ใหม่) และสคริปต์ฝั่งเครื่องอ่านจาก commit ของ sha
ข้อนี้กันความคลาดเคลื่อนโดยไม่ตั้งใจเท่านั้น คนที่แก้ตัวตรวจเองข้ามได้ · ตัวคุมจริงคือสิทธิ์รายสคริปต์ของ operator

รันจาก checkout บน WSL ที่ `git fetch` แล้วและอยู่ที่ origin/main (`~/work/GACP-Certification-Application`):

```
wsl.exe -d Ubuntu-24.04 --cd /home/jonmaxmore/work/GACP-Certification-Application --exec bash -l scripts/deploy/<สคริปต์> <sha>
```

- `--exec` จำเป็น: ถ้าไม่มี wsl.exe ส่งอาร์กิวเมนต์ให้ shell ของ Linux แยกใหม่ อักขระอย่าง `;` หรือ `|` ในอาร์กิวเมนต์จะกลายเป็นคำสั่ง
  ทั้งที่ Claude Code เห็นว่าตรงกับบรรทัดสิทธิ์ (ผู้ตรวจความปลอดภัยทดลองแล้ว 2026-11-08) · มี `--exec` อาร์กิวเมนต์ถูกส่งตรงตัว
- `bash -l` จำเป็น เพราะ node อยู่ใน PATH ของ login shell เท่านั้น

| ขั้น | ทำอะไร | สคริปต์ |
|---|---|---|
| 0 | sha = origin/main · มี attestation · gate-compare ไม่มีล้มใหม่ | `scripts/deploy/demo-precheck.sh` |
| 1 | เดินตรวจ baseline บน demo เฉพาะแถวที่ไม่เขียน | `scripts/walk/demo-walk.sh baseline` |
| 2 | precheck ซ้ำ · ส่ง source ด้วย git archive + scp · เครื่องเทียบ sha256 | `scripts/deploy/demo-ship-source.sh` |
| 3 | build บนเครื่อง ตรวจ GIT_SHA รัน image-smoke | `scripts/deploy/demo-build.sh` |
| 4 | backup ฐาน ตรวจ gunzip -t และขนาด | `scripts/deploy/demo-db-backup.sh` |
| 5 | ตรวจ project ref · migrate status · migrate deploy | `scripts/deploy/demo-migrate.sh` |
| 6 | บันทึก previous-tag · up --no-deps · healthy + revision ใน 3 นาที | `scripts/deploy/demo-up.sh` |
| 7 | เดินตรวจหลัง deploy แถวเดิม · เทียบกับ baseline | `scripts/walk/demo-walk.sh post` แล้ว `scripts/walk/demo-walk.sh compare` |
| ย้อน | ขึ้น previous-tag ด้วย --no-deps · ตรวจ revision เดิม | `scripts/deploy/demo-rollback.sh` |

## ขั้น 0: precheck (เครื่องพัฒนา ไม่แตะเครื่อง demo)

```
bash -l scripts/deploy/demo-precheck.sh <sha>
```

- `git fetch origin main` แล้ว sha ต้องเท่ากับ `origin/main`
- หา attestation `evidence/gate/<x>.json` ใน tree ของ sha: ของ sha เอง หรือของบรรพบุรุษที่ใกล้ที่สุดตามสาย first-parent (ไม่เกิน 50 commit)
  ใช้ของบรรพบุรุษได้เมื่อทุกไฟล์ระหว่างกันอยู่ใต้ `evidence/` เท่านั้น (commit ที่เพิ่มแค่ attestation หรือ evidence pack)
- เทียบรายชื่อไฟล์ด้วย `git diff --no-renames` เพื่อให้การย้ายไฟล์โค้ดเข้า `evidence/` เห็นทั้งชื่อเดิมและชื่อใหม่
- รัน `scripts/ops/gate-compare.js` ของ sha นั้นเอง เทียบ attestation นั้นกับ attestation ก่อนหน้าบนสายเดียวกัน
  `NO-NEW-FAILURES` ผ่าน · `UNPROVEN` ผ่านแต่พิมพ์ทุกแถวที่ต้องอ่าน log (เหตุ: deploy-drift แดงเสมอจนกว่า demo จะถูก deploy
  ถ้าบังคับ NO-NEW-FAILURES จะ deploy ไม่ได้ตลอดไป) · `NEW-FAILURES` หรือเทียบไม่ได้ = หยุด

## ขั้น 1: baseline walk (ก่อนแตะเครื่อง)

```
bash -l scripts/walk/demo-walk.sh baseline <sha>
```

- สคริปต์ล็อก `https://demo.gacpth.com --target demo --rows identity,accounts,verify,pdpa,subsystems,jobs,finance`
  และที่เก็บผล `~/work/state/walk/demo-<sha12>-baseline` ไว้ในตัว
- ใช้เฉพาะแถวที่ไม่เขียนข้อมูล · **แถว cert-path และ tnt ปิดบน demo** (`deploy-walk.js` ปฏิเสธ exit 2 ถ้ามีสองแถวนี้กับ demo
  รวมถึงตอนไม่ใส่ `--rows` · ตัวเลือกซ้ำก็ถูกปฏิเสธ) จนกว่าจะมีบัญชีเดินตรวจของ demo และ operator
  ตัดสินเรื่องใบรับรองทดสอบที่จะขึ้นในหน้าตรวจสอบสาธารณะ (ตัดสินแทน operator 2026-11-08 ภายใต้ "ตามคุณตัดสินใจ")
- **baseline แรกจะเป็น NOT-YET เกือบทุกแถวที่ต้องล็อกอิน** (accounts, pdpa, subsystems, finance) เพราะยังไม่มีบัญชีเดินตรวจของ demo
  ตัวเดินรายงาน NOT-YET พร้อมชื่อบทบาทที่ขาด ไม่ใช่ FAIL · บัญชีต้องสร้างผ่าน UI หรือ API ของ demo โดย operator
  (คำสั่ง 164: ไม่ seed ข้อมูลธุรกิจ) แล้วเติมไฟล์ใน `~/work/state/walk/accounts/demo/<role>.env`
- แถว identity ใน baseline จะ FAIL เพราะ demo ยังรัน revision เก่ากว่า origin/main · หลัง deploy ต้องเป็น PASS

## ขั้น 2: ส่ง source

```
bash -l scripts/deploy/demo-ship-source.sh <sha>
```

รัน `demo-precheck.sh` ซ้ำ (sha ที่ไม่ใช่ origin/main หรือไม่มี attestation ไปไม่ถึงเครื่อง) → `git archive` ของ sha →
scp ไป `~deploy/gacp-build/<sha12>/src.tar.gz` → เครื่องเทียบ sha256 กับที่ส่งแล้วบันทึกไว้ · build ตรวจ sha256 ซ้ำก่อนแตกไฟล์

## ขั้น 3: build

```
bash -l scripts/deploy/demo-build.sh <sha>
```

- backend และ frontend tag เดียวกัน `local-<sha12>` เพราะ `docker-compose.demo.yml` ใช้ `DEMO_IMAGE_TAG` ตัวเดียวกับทั้งสอง (บรรทัด 72, 140)
- frontend build ด้วย `NEXT_PUBLIC_API_URL=https://demo.gacpth.com` (ส่งผ่าน env ไม่อยู่ใน argv) · ค่านี้ฝังตอน build
- หยุดเมื่อ build ล้ม, docker เตือน `build-args were not consumed`, `GIT_SHA` ใน image ไม่ตรง sha, หรือ `scripts/ops/image-smoke.sh` ไม่ผ่าน
- log อยู่ที่ `~deploy/gacp-build/<sha12>/build-*.log`, `image-smoke.log`

## ขั้น 4: backup ฐาน

```
bash -l scripts/deploy/demo-db-backup.sh <sha>
```

- รัน `/usr/local/bin/gacp-demo-pg-backup.sh` ที่มีอยู่แล้วบนเครื่อง (`staging-on-demo-host.md` §7.2) dump Supabase project `spbdkellhyndyexljuar` ผ่าน `DIRECT_URL`
- ไฟล์ใหม่ใน `/var/backups/gacp/demo/scheduled/daily/` ต้องผ่าน `gunzip -t` และไม่เล็กกว่า dump ก่อนหน้า (ปกติคือ dump คืนก่อน) · ไม่มี dump ก่อนหน้า = หยุด
- dump ที่ใช้เทียบถูกตรึงครั้งแรกของรอบ (`backup.baseline`) · ไฟล์ที่ไม่ผ่านถูกเปลี่ยนชื่อเป็น `*.rejected` · รันซ้ำจึงไม่เทียบกับ dump เล็กที่เพิ่งล้ม
- path ของไฟล์บันทึกที่ `~deploy/gacp-build/<sha12>/backup.path` · migrate จะไม่เริ่มถ้าไม่มีไฟล์นี้

## ขั้น 5: migrate

```
bash -l scripts/deploy/demo-migrate.sh <sha>
```

- ทั้ง `DIRECT_URL` และ `DATABASE_URL` ใน `.env.demo` ต้องชี้ project `spbdkellhyndyexljuar`: host `db.spbdkellhyndyexljuar.supabase.co`
  หรือ host `*.pooler.supabase.com` ที่ผู้ใช้เป็น `postgres.spbdkellhyndyexljuar` ไม่งั้นหยุดก่อนแตะฐาน · ข้อความไม่พิมพ์ host
- ตรวจด้วย allowlist ของรูป URL ทั้งเส้น: `postgres(ql)://<ผู้ใช้>:<รหัสผ่าน>@<host>[:<port>]/<ชื่อฐาน>[?<คีย์>=<ค่า>...]`
  รหัสผ่านห้ามมี `@ / ? # ,` หรือช่องว่างที่ไม่ได้ percent-encode · query ได้เฉพาะ pgbouncer, sslmode, connection_limit,
  connect_timeout, pool_timeout, statement_cache_size · รูปอื่น (host หลายตัว, parameter host ที่ encode, fragment) = หยุด
- URL จริงของ demo ยังไม่เคยผ่านตัวตรวจนี้ · รอบแรกถ้าหยุดที่ข้อนี้ ให้ operator ดูรูป URL (ไม่ต้องแสดงรหัสผ่าน) แล้วตัดสิน
- `prisma migrate status` → หยุดถ้ามี migration ที่ล้มค้าง · `prisma migrate deploy` ด้วย image ใหม่ · `migrate status` อีกครั้งต้อง up to date
- รอบ main 08730b4bf เทียบ demo b8d27a690 มี migration เพิ่มอย่างเดียว 2 ตัว: `20261105120000_user_consent_events` และ `20261107120000_database_session_timezone_utc`
- migrate deploy ล้มกลางทาง = ห้าม up · restore เป็นของ operator เท่านั้น ไม่มีสคริปต์ (ไฟล์อยู่ที่ `backup.path`)

## ขั้น 6: up

```
bash -l scripts/deploy/demo-up.sh <sha>
```

- บันทึก tag ที่รันอยู่เป็น `previous-tag` พร้อม revision และ image ID ของ backend/frontend ก่อนเปลี่ยนอะไร · หยุดก่อนเปลี่ยนเมื่อ:
  backend กับ frontend ใช้ tag ต่างกัน, image ของ tag ก่อนหน้าไม่อยู่บนเครื่อง, หรืออ่าน revision ก่อนหน้าไม่ได้ (rollback จะตรวจไม่ได้)
- `cd /opt/gacp-platform && DEMO_IMAGE_TAG=local-<sha12> docker compose --env-file .env.demo -f docker-compose.production.yml -f docker-compose.demo.yml up -d --no-deps backend-demo frontend-demo`
- ภายใน 3 นาที ทั้งสอง container ต้อง healthy และ revision จาก `/api/health` กับ `/api/webapp-version` (อ่านใน container) ต้องเท่ากับ sha ไม่งั้นหยุดและบอกให้ rollback
- รันซ้ำได้: ไม่เขียน previous-tag ทับ · แต่ถ้า demo รัน tag อื่นที่ไม่ใช่ previous-tag หรือ tag ของรอบนี้ (มีรอบใหม่กว่าขึ้นไปแล้ว) = หยุด
- ใช้ไฟล์ compose ที่อยู่บนเครื่องใน `/opt/gacp-platform` ไม่ใช่ของ sha ใหม่ (ถ้า sha เปลี่ยนไฟล์ compose ต้องให้ operator วางไฟล์ก่อน)

## ขั้น 7: post walk และเทียบ

```
bash -l scripts/walk/demo-walk.sh post <sha>
bash -l scripts/walk/demo-walk.sh compare <sha>
```

กติกาเทียบ (คำสั่ง 105(7) และ 158(5) แก้ 2026-11-08):
- **FAIL ใหม่ = แถวที่ baseline เป็น PASS แล้วหลัง deploy เป็น FAIL หรือหายไป** → exit 1 → rollback ทันที
- แถวที่ baseline เป็น NOT-YET หรือไม่มีใน baseline คือ "ไม่มีฐานให้เทียบ" · NOT-YET → FAIL จึงไม่นับเป็น FAIL ใหม่ แต่ถูกพิมพ์ให้เห็นและต้องรายงาน
- PASS → NOT-YET คือ "ครอบคลุมหาย" (มักเป็นไฟล์บัญชีเดินตรวจหายหลัง baseline) ไม่ใช่ FAIL ใหม่ (exit 0) แต่พิมพ์เป็นบรรทัดแยก
  และต้องรายงานพร้อมผล · ห้ามสรุปว่า "ผ่าน" โดยไม่บอกแถวที่ครอบคลุมหาย
- แถว `stable-build` ที่ FAIL ในรอบหลัง แปลว่า revision เปลี่ยนระหว่างเดิน ผลรอบนั้นใช้ไม่ได้ ให้เดินใหม่
- เทียบคนละเครื่อง หรือไฟล์อ่านไม่ได้ = exit 2 (ไม่ใช่ผ่าน)
- กติกา "ไม่มี FAIL เลย" แบบเข้มของ 158(5) ใช้เมื่อมีบัญชีเดินตรวจของ demo แล้ว

## rollback

```
bash -l scripts/deploy/demo-rollback.sh <sha ที่ deploy แล้วล้ม>
```

- อ่าน `previous-tag` ของรอบนั้น → `up -d --no-deps backend-demo frontend-demo` ด้วย tag นั้น → healthy, revision และ image ID เท่ากับที่บันทึกไว้ก่อน up
- หยุดก่อนเปลี่ยนถ้า demo ไม่ได้รัน tag ของรอบนี้หรือ previous-tag อยู่ (กันการย้อนข้ามรอบที่ขึ้นทีหลัง)
- ไม่แตะฐานข้อมูล · migration ของรอบนี้เพิ่มอย่างเดียว image เก่าจึงรันบน schema ใหม่ได้ · รอบที่มี migration แบบทำลายต้องเขียนแผนใหม่ก่อน
- restore ฐานเป็นของ operator เท่านั้น ไม่มีสคริปต์

## สิ่งที่ห้ามบน demo จนกว่า operator สั่ง

- สคริปต์ปิดคำขอของ scheduler (คำสั่ง 118(3)) ห้ามรันบน demo
- แถว cert-path และ tnt ของตัวเดินตรวจ (ด้านบน)
- การซ้อมบน WSL ในเครื่อง (local rehearsal) ไม่อยู่ในเส้นนี้

## สิทธิ์ที่ operator เพิ่มใน `.claude/settings.local.json`

เพิ่มใน `permissions.allow` ทีละบรรทัดตามที่อนุมัติ (Claude ไม่แก้ไฟล์นี้เอง):

```json
"Bash(wsl.exe -d Ubuntu-24.04 --cd /home/jonmaxmore/work/GACP-Certification-Application --exec bash -l scripts/deploy/demo-precheck.sh:*)",
"Bash(wsl.exe -d Ubuntu-24.04 --cd /home/jonmaxmore/work/GACP-Certification-Application --exec bash -l scripts/deploy/demo-ship-source.sh:*)",
"Bash(wsl.exe -d Ubuntu-24.04 --cd /home/jonmaxmore/work/GACP-Certification-Application --exec bash -l scripts/deploy/demo-build.sh:*)",
"Bash(wsl.exe -d Ubuntu-24.04 --cd /home/jonmaxmore/work/GACP-Certification-Application --exec bash -l scripts/deploy/demo-db-backup.sh:*)",
"Bash(wsl.exe -d Ubuntu-24.04 --cd /home/jonmaxmore/work/GACP-Certification-Application --exec bash -l scripts/deploy/demo-migrate.sh:*)",
"Bash(wsl.exe -d Ubuntu-24.04 --cd /home/jonmaxmore/work/GACP-Certification-Application --exec bash -l scripts/deploy/demo-up.sh:*)",
"Bash(wsl.exe -d Ubuntu-24.04 --cd /home/jonmaxmore/work/GACP-Certification-Application --exec bash -l scripts/deploy/demo-rollback.sh:*)",
"Bash(wsl.exe -d Ubuntu-24.04 --cd /home/jonmaxmore/work/GACP-Certification-Application --exec bash -l scripts/walk/demo-walk.sh:*)"
```


แต่ละสคริปต์รับแค่ sha (demo-walk.sh รับขั้นกับ sha) และปฏิเสธอาร์กิวเมนต์อื่น · เครื่อง แถว และที่เก็บผลของการเดินตรวจล็อกไว้ใน `demo-walk.sh`
ส่วน `deploy-walk.js` ปฏิเสธแถว cert-path และ tnt บน demo เองอีกชั้น

## ยังไม่ได้พิสูจน์

- ยังไม่มีสคริปต์ใดรันกับเครื่อง demo จริง · รอบแรกต้องดู output ทุกขั้นและจับเวลา build
- ไฟล์ compose และ `.env.demo` บนเครื่องอาจต่างจาก repo · ผู้ใช้ deploy ต้องอ่าน `.env.demo` ได้ (cron ของ backup อ่านได้อยู่แล้ว)
- `docker exec ... wget` ใน container backend/frontend อ่าน revision ได้หรือไม่ ยังไม่ได้ลองบนเครื่อง (healthcheck ใช้ wget อยู่แล้ว)

# evidence — backup ครอบ volume ที่ห้ามหาย · สิทธิ์ · ตรวจดัมป์ · retention

Status: `PENDING` — RED/GREEN ครบบนเครื่องนี้ แต่ **1 ข้อยัง SKIP** และ gate ยังไม่ได้รัน
tier ที่เครื่องตัดสิน: **`TIER=B`**

เหตุผลเต็ม: `reports/risk-assessment/2026-08-13.md` §4 R3 และ R5
⚠️ ไฟล์นั้นอยู่บน branch `reports/ops-review-2026-08-13` **ยังไม่ merge** — ถ้าอ่านจาก branch นี้จะไม่เจอ
ข้อเท็จจริงที่ใบนี้พึ่งพาถูกเขียนซ้ำไว้ในคอมเมนต์ของสคริปต์แล้ว จึงไม่ต้องอ่านรายงานก็รีวิวได้

## ไฟล์

| ไฟล์ | คือ |
|---|---|
| `red.txt` | RED — selftest ชุดปัจจุบันรัน **กับสคริปต์เวอร์ชันบน `main`** → PASS=4 FAIL=6 SKIP=1 |
| `green.txt` | GREEN — ชุดเดียวกันกับสคริปต์หลังแก้ → PASS=9 FAIL=0 SKIP=1 + `bash -n` |

## ลำดับที่ทำ

1. เขียน selftest **ก่อน** แตะสคริปต์จริง → FAIL 3
2. แก้สคริปต์ → PASS
3. **ให้ agent ที่ไม่เคยเห็นงานนี้รีวิวแบบ adversarial** → ตัดสิน `PROBLEMS_FOUND` พร้อมของที่**พิสูจน์ด้วยการรันจริง** 3 ข้อที่หลุด selftest รอบแรก
4. เขียน assertion เพิ่มให้จับของพวกนั้น → FAIL อีก 3
5. แก้สคริปต์อีกรอบ → PASS=9

## สิ่งที่รีวิวจับได้ และแก้แล้ว

| ปัญหาที่รีวิวพิสูจน์ | แก้อย่างไร |
|---|---|
| selftest ผ่านทั้งที่ชื่อ volume **พิมพ์ผิดทั้งคู่** — glob หลวม + fake docker เขียนไฟล์ให้ทุก `run` · ของจริง docker **สร้าง volume เปล่าให้เอง** แล้วได้ tarball ว่าง | สคริปต์เช็ค `docker volume inspect` ก่อนทุกตัว ไม่มี = ล้มทันที · selftest มีเคสชื่อผิดโดยเฉพาะ |
| ลืม `gacp-signing-keys` — กุญแจที่เซ็นใบรับรองทุกใบ หายแล้ว**ใบรับรองที่ออกไปแล้วทั้งหมดตรวจสอบไม่ได้** และสร้างใหม่ไม่ได้ · และลืม `gacp-storage-data` | เพิ่มทั้งสองตัว · selftest ถือ `REQUIRED_VOLUMES` **ของตัวเอง** ไม่ derive จากสคริปต์ ⇒ ลบตัวไหนออกก็แดง |
| retention prune อยู่ท้ายสุดใต้ `set -e` ⇒ คืนไหน tar ล้ม **จะไม่ลบอะไรเลย และสะสมทุกคืน** | ย้าย prune มาไว้หลังดัมป์ผ่าน ก่อนวน volume · selftest มีเคส tar ล้มแล้วตรวจว่าไฟล์ 40 วันถูกลบ |
| assertion "ดัมป์เสีย" เช็คแค่ exit ไม่ใช่ 0 ⇒ ล้มด้วยเหตุอื่นก็ผ่าน | เช็คข้อความ `not a readable archive` ด้วย |
| ไม่ได้ตรวจว่าดัมป์ครบทั้งสองฐาน | เพิ่ม assertion ต่อฐาน |
| `GACP_BACKUP_DIR` แบบ relative → docker ตีความเป็น **named volume** ⇒ tarball หายเข้าไปข้างใน แต่ exit 0 | ตรวจว่าเป็น absolute path ก่อน |
| `alpine` เป็น tag ลอย ไม่ pin | เปลี่ยนเป็น `alpine:3.20` + `docker image inspect` ก่อนใช้ |
| คอมเมนต์อ้างเกินจริงว่า `pg_restore --list` พิสูจน์ว่าดัมป์สมบูรณ์ | แก้ให้ตรง — มันพิสูจน์แค่ header/TOC อ่านได้ · ระบุว่ามันจับกรณี 0 ไบต์ได้ แต่จับ truncate กลาง data ไม่ได้ |

## สิ่งที่ยังไม่ถูกพิสูจน์

**1. สิทธิ์ไฟล์ดัมป์ (mode 600) — SKIP ไม่ใช่ PASS**

เครื่องที่เขียนโค้ดเป็น Windows + git-bash mount NTFS แบบ `noacl`:
```
$ chmod 600 f ; stat -c '%a' f   → 644
$ ( umask 077; echo y > g ) ; stat -c '%a' g   → 644
```
`chmod`/`umask` ไม่มีผลเลย ⇒ assertion นี้จะผ่านหรือไม่ผ่านก็ไม่มีความหมายบนเครื่องนี้
selftest ตรวจความสามารถของ filesystem ก่อนแล้วรายงาน SKIP พร้อมเตือนท้ายผล
**assertion เดิมยังอยู่ทุกตัวอักษร** — บน Linux มันจะรันจริง

**2. สิทธิ์ของไฟล์ `.tgz`** — สร้างโดย container จึงเป็นของ root · `chmod` จาก cron user (`ubuntu`)
อาจไม่ผ่าน สคริปต์จึงใช้ `|| true` และพึ่ง `chmod 700 "$OUT"` แทน
**ยังไม่ได้ยืนยันบนเครื่องจริงว่าไดเรกทอรีเป็นของ `ubuntu` จริงหรือไม่**

**3. ~~ชื่อ volume ของ staging~~ — ปิดแล้ว 2026-08-13**

operator รัน `docker volume ls` บนเครื่องจริงและได้ชื่อครบ ⇒ เติมเข้ารายการแล้ว ครอบ 7 ตัว

```
gacp-uploads-data                          63.51 MB
gacp-storage-data                          0 B
gacp-signing-keys                          2.325 kB
gacp-minio-data                            (ไม่ได้วัดในรอบนั้น)
gacp-platform_gacp_staging_uploads         1.337 MB
gacp-platform_gacp_staging_storage         0 B
gacp-platform_gacp_staging_signing_keys    2.325 kB
```

**ข้อ 5 (ขนาดดิสก์) ปิดไปด้วย**: ~65 MB ต่อคืน × 30 วัน ≈ 2 GB จากดิสก์ว่าง 65 GB
ตัวเดียวที่โตได้จริงคือ `gacp-uploads-data` — วัดซ้ำด้วย `docker system df -v` ถ้ามันเริ่มโต
· `gacp-minio-data` ยังไม่ได้วัด (grep รอบนั้นไม่ครอบ) ควรวัดก่อนเปิดใช้จริง

**4. `pg_restore --list` ไม่พิสูจน์ความสมบูรณ์** — เหตุผลใน §5 ของรายงาน
วิธีทดสอบบนเครื่อง: `head -c 50% <dump> > /tmp/half.dump; docker exec -i gacp-postgres pg_restore --list < /tmp/half.dump; echo $?`
คาดว่าได้ 0 ซึ่งจะยืนยันว่ามันจับ truncate กลางไฟล์ไม่ได้

**5. ขนาดดิสก์** — volume อัปโหลดอาจใหญ่กว่าดัมป์มาก และ retention 30 วันใช้กับทั้งคู่
`docker system df -v` ก่อนเปิดใช้จริง ไม่งั้นอาจกินดิสก์เกินคาด

## คำสั่งที่ต้องรันบนเซิร์ฟเวอร์

```bash
cd ~/gate-workspace 2>/dev/null || git clone https://github.com/jonmaxmore/GACP-Certification-Application.git ~/gate-workspace
cd ~/gate-workspace && git fetch origin && git checkout fix/backup-covers-uploads-and-permissions

# 1) ชื่อ volume จริง — ตัดสินว่าจะเพิ่มของ staging ตัวไหน (ข้อ 3 ข้างบน)
docker volume ls | grep -iE "upload|storage|signing|minio"

# 2) ขนาด ก่อนเปิดใช้ (ข้อ 5)
docker system df -v | grep -iE "upload|storage|signing|minio"

# 3) selftest ต้องได้ SKIP=0 บน Linux
bash scripts/ops/gacp-backup.selftest.sh

# 4) gate 4 ตัว
bash scripts/ci/local-gate.sh
```

**ยังไม่ต้องติดตั้งทับ `/usr/local/bin/gacp-backup.sh`** — ทำหลัง merge ตาม
`docs/operations/runbooks/backup-and-restore.md:36-41`

## ที่ยังไม่ได้ทำในใบนี้ โดยตั้งใจ

- **เข้ารหัสดัมป์** — ต้องตัดสินใจเรื่องกุญแจก่อน (รายงาน §7 ข้อ 5) · `chmod` ลดความเสี่ยงบนเครื่อง แต่ไม่ช่วยถ้าดิสก์หลุดออกไป
- **ขั้นตอนกู้ tarball ยังไม่เคยซ้อม** — เขียนคำสั่งไว้ใน runbook แล้ว (§"สิ่งที่ยังไม่ได้ทำ")
  แต่ยังไม่มีใครรันจริง ⇒ อย่านับว่าใช้ได้จนกว่าจะซ้อมแบบเดียวกับที่ทำกับฐานข้อมูล 2026-08-08

*(runbook `backup-and-restore.md` แก้ให้ตรงกับโค้ดแล้วในใบนี้ — ตารางครอบคลุม เหตุผล retention และรายการสิ่งที่ยังไม่ได้ทำ)*

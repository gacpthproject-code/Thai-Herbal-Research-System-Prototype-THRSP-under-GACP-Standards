# สำรวจเซิร์ฟเวอร์ demo (read-only) — 2026-11-07 11:08 (เวลาไทย)
> คำสั่ง 164(2) · สคริปต์ `scripts/ops/demo-survey.sh` รันโดย operator จาก PC ผ่าน `ssh -i gacp_deploy deploy@119.59.105.140` (key ใหม่ `gacp-deploy@operator-pc`) · ผลดิบอยู่ที่ PC ของ operator (`demo-survey.txt`) · main ตอนสำรวจ = `aaa6b80f6`
> ไม่มีการเขียนใดบนเครื่อง · ไม่มีค่าลับในเอกสารนี้

## เกณฑ์ไปต่อ — **ผ่าน**
| เกณฑ์ (คำสั่ง 164(2)) | วัดได้ | ผล |
|---|---|---|
| RAM ว่าง (available) ≥ 8 GB | 18 GB จาก 21 GB (ใช้จริง 2 GB · swap 3 GB ว่าง) | ผ่าน |
| disk ว่าง ≥ 40 GB | 179 GB จาก 235 GB (`/dev/mapper/almalinux-root`, ใช้ 25%) | ผ่าน |

เครื่อง: AlmaLinux 8.10 · 10 vCPU · uptime 31 วัน · load 0.09

## สิ่งที่รันอยู่
| container | image | สถานะ | port (loopback) | RAM ใช้ / เพดาน |
|---|---|---|---|---|
| gacp-backend-demo | backend `local-b8d27a690647` | healthy 7 วัน | 8003 | 224 MiB / 1 GiB |
| gacp-frontend-demo | frontend `local-b8d27a690647` | healthy 7 วัน | 3003 | 145 MiB / 512 MiB |
| gacp-nginx | nginx:alpine | healthy 4 สัปดาห์ | 8080 | 19 MiB / 256 MiB |
| gacp-minio | minio:latest | healthy 4 สัปดาห์ | 9000-9001 | 154 MiB / 256 MiB |
| gacp-redis | redis:7-alpine | 4 สัปดาห์ | — | 13 MiB / 128 MiB |
| gacp-grafana / gacp-loki / gacp-promtail | ชุด logging | healthy | 3200 / 3100 / — | 143 / 91 / 97 MiB |
- รวมใช้จริง ~890 MiB · เพดานรวม ~3.0 GiB · **ไม่มี Postgres บนเครื่อง** — ฐานของ demo อยู่ที่ Supabase (`DIRECT_URL` ใน `.env.demo`)
- host nginx ฟัง 80/443 · vhost: `00-gacp-platform.conf`, `demo.gacpth.com.conf`

## commit และ migration
- demo รัน **`b8d27a69`** (v3.9.0, build 2026-10-30) · main = `aaa6b80f6` → **ตามหลัง 97 commit (merge 20 ครั้ง)**
- migration ใหม่ใน main ที่ demo ยังไม่มี (ตามไฟล์ใน repo): **`20261105120000_user_consent_events`** (จากงาน 2026-11-05)
- ตารางที่ apply แล้วบน Supabase **ยังไม่ได้ตรวจ** — สคริปต์หา Postgres ใน container ไม่เจอ ต้องตรวจผ่าน `DIRECT_URL` ก่อน deploy demo (`prisma migrate status` ในขั้น deploy) → PENDING

## ชนกับชุด staging ที่ออกแบบไว้ (`docker-compose.staging-on-demo-host.yml`) หรือไม่
| ประเภท | demo มีอยู่ | staging จะใช้ | ผล |
|---|---|---|---|
| port | 8003, 3003, 8080, 9000-9001, 3100, 3200, 80, 443, 22 | 8001, 3001, 8081 | ไม่ชน |
| volume | `gacp-{minio,redis,signing-keys,storage,uploads}-data`, `gacp-logging-*` | `gacp-staging-*` ทั้งหมด | ไม่ชน |
| network | `gacp-network`, `gacp-demo-network`, `gacp-logging-network`, `bridge` | `gacp-staging-internal` (172.29.18.0/24), `gacp-staging-network` (172.29.19.0/24) | ชื่อไม่ชน · **subnet ยังไม่ได้ตรวจ** — runbook §4.0 ตรวจด้วย `ip route` ก่อนสร้าง |
| container | `gacp-*-demo`, `gacp-nginx`, `gacp-minio`, `gacp-redis`, `gacp-grafana`, `gacp-loki`, `gacp-promtail` | `gacp-staging-*`, `gacp-backend-staging`, `gacp-frontend-staging` | ไม่ชน |
| RAM | ใช้ ~0.9 GiB | เพดาน 3.2 GiB | รวม ≤ ~6.2 GiB จาก 21 GiB |

## ข้อค้นพบที่ต้องตัดสิน
1. **ฐาน Supabase ของ demo ไม่มี backup ที่ทำงานอยู่** — cron บนเครื่องมีแค่ backup volume (`17 3 * * *` `gacp-backup.sh` ของ uploads/storage/signing-keys/minio) · `/var/backups/gacp/supabase` แก้ล่าสุด 6 ต.ค. · cron dump Supabase เดิมอยู่บนเครื่อง staging ที่ปิดแล้ว ⇒ **ข้อมูล demo ไม่มี dump ตั้งแต่ประมาณ 6 ต.ค.** · ทางแก้อยู่ใน `docs/operations/runbooks/staging-on-demo-host.md` §7.2 (ติดตั้ง `pg-backup.sh` ผ่าน `DIRECT_URL`) — งานบนเครื่อง ต้องได้คำว่า "deploy"
2. **มี `/opt/gacp-platform/deploy.sh` บนเครื่อง** — ไม่อยู่ใน repo · น่าจะเป็นสคริปต์ deploy demo ที่ตั้งตอนย้ายเครื่อง (runbook ย้ายเครื่อง §9) · ต้องอ่าน (`cat` ไม่มีค่าลับ) แล้วนำเข้า repo เป็นแหล่งเดียว ก่อนเขียนสคริปต์ deploy ใหม่ ⇒ ส่งให้ session ถัดไป
3. **image เก่าใช้ disk 15.35 GB ที่คืนได้** (49 image, ใช้จริง 8) · มี `gacp-tts:f5`, `gacp-tts:f5cpu` (2 GB ต่อตัว, ไม่อยู่ใน repo) และ image `localhost:5000/*` จาก registry ชั่วคราวที่ไม่ได้รันแล้ว · disk ยังเหลือ 179 GB ไม่เร่งด่วน · ห้าม `docker image prune -a` (ลบ tag ที่ rollback ต้องใช้) — ลบรายตัวเมื่อ operator สั่ง
4. **firewalld zone `public` เปิดแค่ `ssh`** แต่ nginx ฟัง 80/443 บน 0.0.0.0 และเว็บใช้งานได้ ⇒ 80/443 น่าจะอนุญาตผ่าน zone แยก (Cloudflare ตาม runbook ย้ายเครื่อง §2.4) · สคริปต์ดูแค่ zone ที่ active · ต้องตรวจ `firewall-cmd --get-active-zones` เพื่อยืนยันว่า 80/443 เปิดเฉพาะ Cloudflare
5. **sshd:** `passwordauthentication no` · `pubkeyauthentication yes` · `permitrootlogin without-password` (root เข้าด้วย key ได้) · key ของเครื่อง staging เดิม `gacp-ops@43.134.175.51-to-119.59.105.140` ลบแล้ว (operator 2026-11-07, สำรองไฟล์ `.bak-20261107`) · `deploy` มี key `gacp-deploy@operator-pc` และ `ooo@DESKTOP-R53T303` · root มี `ooo@DESKTOP-R53T303`, `operator-pc-2026-10-08` ⇒ คำสั่ง 164(5) ให้ปิด root login — เสนอ `PermitRootLogin no` หลังยืนยันว่า deploy + sudo ใช้งานได้ (operator ตัดสิน)
   - **ปิดแล้ว 2026-11-07** (operator สั่ง "ปิด root login" · ทำผ่าน deploy+sudo จาก PC · ส่งต่อจาก session ก่อน ยังไม่ได้ตรวจจาก cloud): สำรอง `/etc/ssh/sshd_config.bak-20261107-rootlogin` · เพิ่ม `permitrootlogin no` บรรทัด 1 · `sshd -t` ผ่าน · reload · ทดสอบ deploy เข้าได้ + `sudo -n` ผ่าน · root ได้ Permission denied
   - ค้าง: บรรทัด 45 `PermitRootLogin prohibit-password` ยังอยู่ (ไม่มีผลเพราะ sshd ใช้ค่าแรกที่เจอ) ส่งคำสั่งลบให้ operator แล้ว รอผล
   - PC ของ operator มี ssh alias `gacp-demo` (host 119.59.105.140, user deploy, key gacp_deploy) · คำสั่งที่ส่งให้ operator รันควรเป็นตัวพิมพ์เล็กล้วนและใช้ `ssh gacp-demo` เพราะการคัดลอกไป PC ทำตัวพิมพ์ใหญ่หาย
6. ไฟล์ `.env.demo.bak-*` 3 ไฟล์ (สิทธิ์ 600) ค้างใน `/opt/gacp-platform` · มีค่าลับชุดเก่า · ควรย้ายไป `backups/` ที่สิทธิ์ 700 หรือลบเมื่อพ้นช่วง rollback (operator ตัดสิน)

## สถานะ
- คำสั่ง 164(2) สำรวจ: เสร็จ (ผลอ่านอย่างเดียว) · เกณฑ์ไปต่อผ่าน ⇒ ติดตั้งชุด staging ได้ตาม runbook หลังได้ "merge" ของงานชุด staging (Tier C) และคำว่า "deploy"
- ยังไม่ได้ตรวจ: migration ที่ apply บน Supabase, subnet ของ network ที่มีอยู่, zone ของ firewalld ที่อนุญาต 80/443, เนื้อ `deploy.sh`

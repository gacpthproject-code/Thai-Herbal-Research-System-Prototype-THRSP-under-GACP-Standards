# Runbook — staging slot บนเครื่อง demo (119.59.105.140)

**สถานะ:** ยกเลิก 2026-11-08 (operator 2026-11-08 "ใช่เครื่อง demo เป็นเครื่องทดสอบแทน" · "ตามคุณตัดสินใจ") · ไม่เคยติดตั้ง · เก็บไว้เป็นประวัติ · §7.2 (backup ฐาน Supabase ของ demo) ยังใช้งานอยู่ · deploy ใช้ `deploy-demo.md` · เขียนเดิม 2026-11-07 ตามคำสั่ง 164(3)
**ที่มา:** เครื่อง staging เดิม (`staging.gacpth.com` ที่ 43.134.175.51) ใช้ไม่ได้แล้ว staging จึงย้ายมาอยู่บนเครื่อง demo
เป็น slot ที่สอง แยกจาก demo ทุกอย่าง ยกเว้น host nginx และระบบเก็บ log ของเครื่อง
**อ่านคู่กับ:** `server-migration-demo-to-new-host.md` (วิธีที่ demo ถูกติดตั้งบนเครื่องนี้) · `deploy-walk.md` · `../../runbooks/stripe-webhook-staging-demo.md`

ไฟล์ใน repo ที่รันบุ๊คนี้ใช้:

| ไฟล์ | ใช้ทำอะไร |
|---|---|
| `docker-compose.staging-on-demo-host.yml` | overlay ชั้นที่สาม ทับ `docker-compose.production.yml` + `docker-compose.staging.yml` แก้ทุกจุดที่ชนกับ demo |
| `deploy/nginx/demo-host/etc/nginx/conf.d/staging.gacpth.com.conf` | vhost ของ host nginx สำหรับ `staging.gacpth.com` ส่งต่อไป `127.0.0.1:8081` |
| `deploy/nginx/demo-host/etc/nginx/conf.d/00-gacp-platform.conf` | map ของประตูก่อนเปิดตัว ใช้ร่วมกับ demo ต้องติดตั้งก่อน vhost staging (§4.8) |
| `deploy/env/staging-on-demo.env.example` | รายชื่อตัวแปรของ `/opt/gacp-staging/.env.staging` ชื่ออย่างเดียว ไม่มีค่า |
| `nginx/gacp.production.conf`, `nginx/50x.html` | config ของ Docker nginx (ไฟล์เดียวกับที่ staging ใช้มาตลอด) |

## ป้ายของแต่ละขั้น

- `[OPERATOR-ONLY]` operator รันเอง
- `[หลังได้คำว่า deploy]` agent รันได้เฉพาะเมื่อ operator พิมพ์คำว่า deploy แล้ว และด้วยสคริปต์ที่ operator อนุมัติตามชื่อใน `.claude/settings.local.json` ระบบสิทธิ์ปฏิเสธ = หยุดแล้วรายงาน
- ไม่มีป้าย = อ่านอย่างเดียว ไม่เปลี่ยนอะไร

ทุกบล็อกคำสั่งบอกเครื่องที่รันในบรรทัดแรก: `# PC` คือเครื่องทำงานที่มี checkout ของ repo · `# เครื่อง demo (deploy)` คือ ssh เข้า `deploy@119.59.105.140` · `# เครื่อง demo (root)` คือ `sudo -i` บนเครื่อง demo ห้ามวางบล็อกของเครื่องหนึ่งในอีกเครื่อง

## กติกาที่ห้ามข้าม

1. **วันนำเสนอนักลงทุน:** ตั้งแต่ 24 ชั่วโมงก่อนเริ่มนำเสนอจนนำเสนอจบ ห้าม deploy ทุกชนิด (staging และ demo) และห้ามงานหนักบน staging ได้แก่ ส่ง image, migrate, restore drill (§7.4), deploy-walk, pg_dump ด้วยมือ และ `docker compose ... up/down` ใด ๆ ของ slot staging งาน cron สำรองประจำคืน (§7.2-7.3) รันต่อได้เพราะเล็กและกำหนดเวลาไว้แล้ว ถ้า operator ต้องการให้ demo มีเครื่องเต็ม ให้หยุดทั้ง slot ด้วย `$DC stop` (§8) ก่อนเข้าช่วง 24 ชั่วโมง ไม่ใช่ระหว่าง
2. **ห้ามรัน `scripts/deploy/deploy-staging.sh` บนเครื่องนี้** สคริปต์นั้นเขียนไว้สำหรับเครื่องเก่า: ค่าปริยาย `PROJECT_DIR=/opt/gacp-platform` (โฟลเดอร์ของ demo), ไม่มี `-p`, ไม่มี overlay ชั้นที่สาม และ migrate ด้วย `--network gacp-network` ซึ่งบนเครื่องนี้คือ network ของ demo
3. ทุกคำสั่ง compose ของ staging รันใน `/opt/gacp-staging` ผ่านตัวแปร `$DC` ของ preamble เท่านั้น ห้ามรัน compose ของ staging ใน `/opt/gacp-platform` และห้ามใช้ `$DC` ของ demo กับไฟล์ staging
4. ห้าม `down -v` และห้าม `docker volume rm` / `docker volume prune` บนเครื่องนี้ ห้าม `docker image prune -a` (rollback ของทั้งสอง slot ต้องใช้ image tag ก่อนหน้า)
5. staging เริ่มจากฐานว่าง + migration ห้ามคัดลอกข้อมูล ห้ามคัดลอก volume และห้ามคัดลอกค่าลับจาก demo (ยกเว้นที่ §4.3 ระบุตรง ๆ)
   **ค่าที่ไหลจาก demo มา staging มีเท่านี้:** Stripe test key (`STRIPE_SECRET_KEY` `STRIPE_PUBLISHABLE_KEY` `PAYMENT_ADAPTER` `STRIPE_CHECKOUT_ENABLED`) และบัญชีรับเงิน (`PLATFORM_BANK_NAME` `PLATFORM_BANK_ACCOUNT_NO` `PLATFORM_PROMPTPAY_ID`) ที่คัดลอกใน §4.3 ตามข้อยกเว้นของ operator 2026-09-07 และการอ่าน `DIRECT_URL` ของ demo แบบอ่านอย่างเดียวเพื่อ dump ฐาน demo ใน §7.2 ไม่มีค่าอื่นใด
   **Stripe webhook (operator 2026-11-07):** staging ได้ webhook endpoint **ใหม่** ใน test mode สำหรับ `staging.gacpth.com` (§4.6) secret ของ demo ไม่ถูกแตะ: ไม่มีขั้นใดในรันบุ๊คนี้ roll, คัดลอก หรืออ่าน `STRIPE_WEBHOOK_SECRET` ของ demo
6. ค่าลับไม่ออกจากเครื่อง demo: ไม่พิมพ์ ไม่ใส่ argv ไม่ส่งผ่านแชต ทุกคำสั่งในรันบุ๊คนี้พิมพ์แค่ OK, จำนวน หรือ hash
7. งานหนักบนเครื่องนี้ทีละงาน: ไม่ deploy staging พร้อม deploy demo และไม่ทำ restore drill ระหว่าง deploy ใด ๆ

---

## 1. ภาพรวม

```text
Cloudflare (proxied, SSL Full)
  demo.gacpth.com    ┐                          ┌─ 127.0.0.1:8080 gacp-nginx ──(gacp-network 172.18.0.0/16)── backend-demo · frontend-demo · gacp-redis · gacp-minio
  staging.gacpth.com ┴─ 119.59.105.140 :443 ─ host nginx ─┤                                                  (DB = Supabase demo)
                                                           └─ 127.0.0.1:8081 gacp-staging-nginx ──(gacp-staging-internal 172.29.18.0/24)── backend-staging · frontend-staging
                                                                                                                gacp-staging-postgres · gacp-staging-redis · gacp-staging-minio
```

| | demo (มีอยู่แล้ว) | staging (ใหม่) |
|---|---|---|
| โฟลเดอร์ | `/opt/gacp-platform` | `/opt/gacp-staging` |
| compose project | `gacp-platform` | `gacp-staging` (`-p` และ `name:` ใน overlay) |
| env file | `.env.demo` | `.env.staging` |
| ฐานข้อมูล | Supabase `spbdkellhyndyexljuar` | container `gacp-staging-postgres` (postgres 17) ฐาน `gacp_staging` |
| redis / minio | `gacp-redis` / `gacp-minio` | `gacp-staging-redis` / `gacp-staging-minio` |
| Docker nginx | `gacp-nginx` 127.0.0.1:8080 | `gacp-staging-nginx` 127.0.0.1:8081 |
| แอป | 127.0.0.1:8003 / 3003 | 127.0.0.1:8001 / 3001 |
| signing key | `gacp-signing-keys` (คู่เดิม fingerprint `f9f3197c…5796`) | `gacp-staging-signing-keys` คู่ใหม่ |
| uploads | `gacp-uploads-data` | `gacp-staging-uploads-data` |
| Stripe webhook | endpoint ของ demo | endpoint ของ staging คนละ secret (test mode ทั้งคู่) |
| ใช้ร่วม | host nginx, `00-gacp-platform.conf`, ใบรับรอง origin, firewalld, ระบบ log `gacp-logging` (Loki/Promtail/Grafana) | |

ระบบ log ของเครื่อง (`deploy/logging/demo-host/`) เก็บทุก container ที่ชื่อขึ้นต้น `gacp-` อยู่แล้ว container ของ staging จึงเข้า Loki เองโดยไม่ต้องติดตั้งเพิ่ม กรองด้วย `{compose_project="gacp-staging"}` (ป้าย `host` เป็น `demo` สำหรับทุก container เพราะตั้งค่าคงที่ไว้) ไม่มี prometheus/grafana ของแอปบนเครื่องนี้ และ overlay ปิดของ production ไว้

## 2. จุดที่ชนกับ demo และวิธีแก้

ตรวจด้วย `docker compose config --format json` ของสามชุด (staging ทุก profile, demo ทุก profile, `gacp-logging`) แล้วเทียบชื่อ 2026-11-07 บนเครื่องทำงาน: ถ้ารวมแค่ `production.yml + staging.yml` แบบที่เครื่องเก่าใช้ ชน 13 ชื่อ container, 5 port, 10 volume, 1 network · ใส่ overlay แล้วชน **0** ทั้งสี่หมวด

| # | ชน | ถ้าไม่แก้จะเกิดอะไร | overlay แก้อย่างไร |
|---|---|---|---|
| 1 | network `gacp-network` (ชื่อตายตัวใน production.yml) | backend-staging เข้า network ของ demo แล้วชื่อ `redis` `minio` resolve ไปที่ container ของ demo คิว BullMQ และไฟล์ปนกัน | key `gacp-network` คงไว้ แต่ชื่อ Docker เปลี่ยนเป็น `gacp-staging-internal` subnet `172.29.18.0/24` gateway `172.29.18.1` · network `gacp-staging-network` ของคู่แอปก็ปัก subnet `172.29.19.0/24` gateway `172.29.19.1` ไม่ปล่อยให้ Docker เลือกเอง |
| 2 | container `gacp-redis` `gacp-minio` `gacp-nginx` `gacp-postgres` | `up` ล้มเพราะชื่อซ้ำ หรือแย่กว่านั้นคือคนแก้ด้วยการลบ container ของ demo | ตั้งชื่อใหม่ `gacp-staging-redis` `gacp-staging-minio` `gacp-staging-nginx` `gacp-staging-postgres` |
| 3 | container ของ service ที่ staging ไม่ใช้ (`gacp-backend` `gacp-frontend` `gacp-grafana` `gacp-loki` `gacp-promtail` ฯลฯ) สามตัวหลังเป็นของ `gacp-logging` บนเครื่องนี้ | `up -d` เปล่าจะพยายามสร้าง | ใส่ profile `not-on-staging-slot` ที่ไม่มีใครเปิด + เปลี่ยนชื่อเป็น `gacp-staging-off-*` + ถอด port ต่อให้มีคนเปิด profile ก็ไม่ชน |
| 4 | port `127.0.0.1:8080` (Docker nginx) | ชน gacp-nginx ของ demo | `ports: !override` เป็น `127.0.0.1:8081` |
| 5 | port `127.0.0.1:9000` `9001` (minio) | ชน minio ของ demo | `ports: !reset []` staging ใช้ `STORAGE_PROVIDER=local` ไม่มีใครต้องเข้า minio จาก host |
| 6 | port `127.0.0.1:3200` `9090` (grafana, prometheus ที่ปิดไว้) | 3200 ชน grafana ของ `gacp-logging` | `ports: !reset []` |
| 7 | volume `gacp-redis-data` `gacp-minio-data` `gacp-postgres-data` และ `gacp-uploads-data` `gacp-storage-data` `gacp-signing-keys` (ชื่อตายตัวใน production.yml) | staging เขียนลง volume ของ demo · `down -v` ที่พลาดลบของ demo | ทุก volume ได้ชื่อขึ้นต้น `gacp-staging-` รวมตัวที่ใช้เฉพาะ service ที่ปิด (`gacp-staging-unused-*`) |
| 8 | volume ของ `docker-compose.staging.yml` ไม่มี `name:` (ชื่อขึ้นกับ project) | ชื่อเดาไม่ได้ สคริปต์ backup ต้องเดา (`gacp-platform_gacp_staging_*` บนเครื่องเก่า) | ปักชื่อ `gacp-staging-uploads-data` `gacp-staging-storage-data` `gacp-staging-signing-keys` |
| 9 | compose project | ไม่มี `-p` แล้วรันใน `/opt/gacp-platform` = project `gacp-platform` เดียวกับ demo | `name: gacp-staging` ใน overlay + `-p gacp-staging` + โฟลเดอร์ `/opt/gacp-staging` ของตัวเอง (path สัมพัทธ์ `./nginx` `./logs` ชี้ของ staging เอง) |
| 10 | real-IP ของ Docker nginx: `nginx/gacp.production.conf` เชื่อ `set_real_ip_from 172.18.0.1` (gateway ของ network demo) | ทุกคำขอของ staging ได้ IP เดียวกัน (gateway) rate limit ทั้งอินเทอร์เน็ตรวมเป็นถังเดียว | ตอน deploy สร้าง `nginx/gacp.staging-on-demo-host.conf` จากไฟล์ใน repo โดยแก้บรรทัดเดียวเป็น `172.29.18.1` ตรวจว่าแก้ครบหนึ่งบรรทัด และพิสูจน์ด้วย `/__docker-nginx-real-ip-check` (§5.6) |
| 11 | `DATABASE_URL` ของ staging.yml มาจาก env file | env ที่ใส่ผิดชี้ staging ไป Supabase ของ demo | overlay ประกอบ `DATABASE_URL` ของ backend-staging เองจาก `DB_USER` `DB_PASSWORD` `STAGING_DB_NAME` ไปที่ `postgres:5432` ของ slot นี้เท่านั้น |
| 12 | tag `main-latest` เป็นค่าปริยายของ staging.yml | เครื่องนี้ไม่มี registry ลืม export = compose พยายาม pull | overlay ใช้ `${STAGING_IMAGE_TAG:?}` ลืมแล้วคำสั่งหยุด |
| 13 | รหัสผ่านปริยายในไฟล์ production (`gacp_redis_2026`, `legacy-retired-db`) และ `PARTNER_TRACE_API_KEY` ปริยายใน staging.yml (`staging-only-no-prod-secrets`) | redis/postgres ของ staging ได้รหัสที่อยู่ใน git · ใครอ่าน repo ก็เรียก partner trace API ของ host สาธารณะได้ | overlay บังคับ `REDIS_PASSWORD` `DB_PASSWORD` และ `STAGING_PARTNER_TRACE_API_KEY` ด้วย `:?` (ค่าสร้างใน §4.3) |
| 14 | ชื่อ `ssl_session_cache` ของ host nginx | zone ชื่อซ้ำขนาดต่างกันทำให้ `nginx -t` ล้ม | vhost ใช้ `SSL_STAGING` (`SSL` และ `SSL_DEMO` มีแล้ว) |

ไม่ชนตั้งแต่ต้น: `gacp-backend-staging` `gacp-frontend-staging` (ชื่อจาก staging.yml คงไว้เพราะ deploy-walk และ ops scripts อ้างชื่อนี้), port 8001/3001, network `gacp-staging-network` (ชื่อไม่ชน แต่ overlay ปัก subnet ให้ตามข้อ 1)

ทุกข้อในตารางนี้ที่เป็นโครงสร้างของไฟล์ compose ถูกปักด้วยเทสต์ `apps/backend/__tests__/unit/staging-on-demo-host-overlay.test.js` (merge สามไฟล์แบบ compose แล้วเทียบกับ production.yml + demo.yml)

## 3. งบหน่วยความจำ

limit มาจาก `deploy.resources.limits` ที่ compose ส่งเป็น `HostConfig.Memory` (วัดจริงบน demo ตอนย้ายเครื่อง: `mem=1073741824`)

| container | limit | reservation | มาจาก |
|---|---:|---:|---|
| gacp-backend-staging | 1024 MiB | 128 MiB | staging.yml |
| gacp-frontend-staging | 512 MiB | 128 MiB | staging.yml |
| gacp-staging-postgres | 1024 MiB | – | production.yml (`shared_buffers=256MB`, `max_connections=50`) |
| gacp-staging-nginx | 256 MiB | 64 MiB | production.yml |
| gacp-staging-minio | 256 MiB | – | production.yml |
| gacp-staging-redis | 128 MiB | – | production.yml (`--maxmemory 96mb`) |
| **รวมขณะรันปกติ** | **3200 MiB** | | ≤ 4096 MiB ตามคำสั่ง 164(3) |
| migrate (`compose run backend-staging`) | 1024 MiB | | รันหลัง stop backend-staging (§5.4) จุดสูงสุดจึงยัง 3200 |
| สร้าง signing key (ครั้งเดียว) | 256 MiB | | `--memory 256m` ตอนที่ slot ยังไม่รัน |
| pg_dump / restore drill | อยู่ใน 1024 ของ postgres | | `docker exec` เข้า container เดิม |

ทั้งเครื่อง (21 GiB):

| ชุด | รวม limit |
|---|---:|
| demo: backend-demo 1024 · frontend-demo 512 · gacp-nginx 256 · gacp-minio 256 · gacp-redis 128 | 2176 MiB |
| gacp-logging: loki 256 · promtail 128 · grafana 512 | 896 MiB |
| staging | 3200 MiB |
| **รวม** | **6272 MiB** เหลือ ~15 GiB ให้ OS, dockerd, page cache |

ตรวจหลังขึ้นระบบ (เครื่อง demo):

```bash
# เครื่อง demo (deploy)
docker inspect -f '{{.Name}} {{.HostConfig.Memory}}' $(docker ps -q --filter label=com.docker.compose.project=gacp-staging) \
  | awk '{printf "%s %d MiB\n",$1,$2/1048576; s+=$2} END {printf "TOTAL %d MiB %s\n", s/1048576, (s<=4294967296 ? "OK" : "OVER")}'
#   ต้องได้ 6 แถว (ไม่มีแถวไหนเป็น 0 MiB = ไม่มี limit) และ TOTAL 3200 MiB OK
docker stats --no-stream $(docker ps --format '{{.Names}}' --filter label=com.docker.compose.project=gacp-staging)
```

---

## 4. ติดตั้งครั้งเดียว `[OPERATOR-ONLY]`

### 4.0 ตรวจก่อนเริ่ม (อ่านอย่างเดียว)

```bash
# เครื่อง demo (deploy)
docker compose version                    # ต้อง ≥ 2.24.4 (overlay ใช้ !reset / !override)
free -m | awk '/Mem/{print "available_MiB="$7}'   # ต้อง ≥ 6000 ก่อนเพิ่ม staging
df -h / | tail -1
sudo ss -tlnp | grep -E '127\.0\.0\.1:(8001|3001|8081)\b' && echo "STOP: port ถูกใช้แล้ว" || echo PORTS-FREE
docker ps -a --format '{{.Names}}' | grep -E '^gacp-(staging-|backend-staging$|frontend-staging$)' && echo "STOP: มี container staging อยู่แล้ว" || echo NAMES-FREE
docker volume ls -q | grep '^gacp-staging-' && echo "STOP: มี volume staging อยู่แล้ว" || echo VOLUMES-FREE
for n in $(docker network ls -q); do docker network inspect -f '{{.Name}} {{range .IPAM.Config}}{{.Subnet}}{{end}}' "$n"; done
# overlay ปักสอง subnet: 172.29.18.0/24 (gacp-staging-internal) และ 172.29.19.0/24 (gacp-staging-network)
ip -4 route | grep -qE '172\.29\.(18|19)\.' && echo "STOP: 172.29.18.0/24 หรือ 172.29.19.0/24 ถูกใช้" || echo SUBNET-FREE
for a in 172.29.18.1 172.29.19.1; do ip -4 route get "$a" | grep -qE 'dev (br-|docker)' && echo "STOP: $a อยู่ใน network ที่มีอยู่แล้ว" || echo "SUBNET-FREE $a"; done   # จับ subnet ใหญ่ที่ครอบ เช่น 172.29.0.0/16
getsebool httpd_can_network_connect       # ต้อง on (ตั้งไว้ตอนติดตั้ง demo)
sudo sha256sum /var/lib/docker/volumes/gacp-signing-keys/_data/public.pem   # จดไว้ ต้องเป็น f9f3197c…5796 และต้องไม่เปลี่ยนหลังจบรันบุ๊ค
```

เก็บสภาพของ demo ไว้เทียบตอนจบ (ใช้ซ้ำทุกครั้งที่ deploy staging):

```bash
# เครื่อง demo (deploy)
sudo install -d -o deploy -g deploy -m 750 /opt/gacp-staging /opt/gacp-staging/state
demo_snap() { docker inspect -f '{{.Name}} {{.Image}} {{.State.StartedAt}} {{.RestartCount}}' gacp-nginx gacp-redis gacp-minio gacp-backend-demo gacp-frontend-demo; }
demo_snap > /opt/gacp-staging/state/demo-before.txt && wc -l < /opt/gacp-staging/state/demo-before.txt   # 5
```

### 4.1 โฟลเดอร์

firewalld ไม่ต้องแก้: 80/443 เปิดเฉพาะ Cloudflare อยู่แล้ว และทุก port ของ staging bind `127.0.0.1` เท่านั้น (ตรวจใน §5.6)

```bash
# เครื่อง demo (root)
install -d -o deploy -g deploy -m 750 /opt/gacp-staging /opt/gacp-staging/nginx /opt/gacp-staging/logs /opt/gacp-staging/logs/nginx /opt/gacp-staging/state
install -d -o deploy -g deploy -m 700 /opt/gacp-staging/nginx/ssl /opt/gacp-staging/backups /opt/gacp-staging/backups/db /opt/gacp-staging/backups/volumes
install -d -o deploy -g deploy -m 755 /var/log/gacp
```

`nginx/ssl` ว่างไว้: Docker nginx ฟังแค่ :80 ไม่ใช้ใบรับรอง แต่ production.yml mount โฟลเดอร์นี้ จึงต้องมี

### 4.2 ไฟล์จาก repo

ใช้ commit เดียวกับ image ที่จะ deploy (§5.1) และทำซ้ำทุกครั้งที่ deploy เพราะ compose และ nginx เปลี่ยนตาม commit ไฟล์เหล่านี้เป็นสำเนาของ staging เอง การแก้ไม่กระทบสำเนาของ demo ใน `/opt/gacp-platform`

```bash
# PC (ใน checkout ของ repo)
DEMO=deploy@119.59.105.140
SHA=<sha 40 ตัวของ commit ที่ merge แล้ว>
git cat-file -e "$SHA^{commit}" && echo SHA-OK
FILES="docker-compose.production.yml docker-compose.staging.yml docker-compose.staging-on-demo-host.yml nginx/gacp.production.conf nginx/50x.html"
# cat > (ไม่ใช่ mv) เพื่อคง inode ของไฟล์ที่ container mount อยู่
for f in $FILES; do git show "$SHA:$f" | ssh "$DEMO" "cat > /opt/gacp-staging/$f"; done
diff <(for f in $FILES; do echo "$(git show "$SHA:$f" | sha256sum | cut -c1-12) $f"; done) \
     <(ssh "$DEMO" "cd /opt/gacp-staging && for f in $FILES; do echo \"\$(sha256sum < \$f | cut -c1-12) \$f\"; done") && echo FILES-MATCH
git show "$SHA:deploy/env/staging-on-demo.env.example" | ssh "$DEMO" 'cat > /opt/gacp-staging/state/env.template'
```

### 4.3 env file (ชื่อจาก template ค่าสร้างบนเครื่อง)

ค่าไม่ผ่าน PC ไม่ผ่านแชต และไม่อยู่ใน argv (`awk` อ่านค่าจาก `ENVIRON`)

```bash
# เครื่อง demo (deploy)
cd /opt/gacp-staging && umask 077
[ -e .env.staging ] && echo "STOP: .env.staging มีอยู่แล้ว" || cp state/env.template .env.staging
setv() {  # $1 ชื่อ · ค่าอยู่ใน env V · แทนเฉพาะบรรทัด "<ชื่อ>=" ที่ยังว่าง
  K="$1" awk 'BEGIN{FS=OFS="="} $0==ENVIRON["K"]"=" {$0=ENVIRON["K"]"="ENVIRON["V"]} {print}' .env.staging > .env.staging.new \
    && mv .env.staging.new .env.staging && chmod 600 .env.staging
}
for k in DB_PASSWORD REDIS_PASSWORD S3_SECRET_KEY HEALTH_JWT_SECRET PROVIDER_JWT_SECRET ENCRYPTION_KEY \
         MASTER_ENCRYPTION_KEY HMAC_KEY SESSION_SECRET QR_SIGNATURE_FALLBACK_SECRET PAYMENT_WEBHOOK_SECRET \
         RSA_PRIVATE_KEY_PASSPHRASE DATASET_PSEUDONYM_KEY SURVEY_RESPONDENT_KEY STAGING_PARTNER_TRACE_API_KEY; do
  V="$(openssl rand -hex 32)" setv "$k"
done
V="staging$(openssl rand -hex 6)" setv S3_ACCESS_KEY
for k in DATABASE_URL PUBLIC_API_URL PUBLIC_WEB_URL GRAFANA_PASSWORD PGADMIN_PASSWORD; do V=unused-on-staging-slot setv "$k"; done
# ค่าที่ไหลจาก demo มาได้มีแค่ชุดนี้ (ข้อยกเว้นของ operator 2026-09-07 "demo ใช้ key เดียวกันกับ staging": Stripe test key ชุดเดียว)
# และบัญชีรับเงินของแพลตฟอร์ม คัดลอกบนเครื่อง ไม่พิมพ์ค่า · STRIPE_WEBHOOK_SECRET ไม่อยู่ในรายการนี้และห้ามเพิ่ม (§4.6)
for k in STRIPE_SECRET_KEY STRIPE_PUBLISHABLE_KEY PAYMENT_ADAPTER STRIPE_CHECKOUT_ENABLED PLATFORM_BANK_NAME PLATFORM_BANK_ACCOUNT_NO PLATFORM_PROMPTPAY_ID; do
  V="$(grep -E "^$k=" /opt/gacp-platform/.env.demo | head -1 | cut -d= -f2-)" setv "$k"
done
ls -l .env.staging                                    # -rw------- deploy deploy
grep -cE '^STRIPE_SECRET_KEY=sk_test_' .env.staging   # ต้องได้ 1 (ไม่ใช่ live)
grep -cE '^STRIPE_PUBLISHABLE_KEY=pk_test_' .env.staging   # ต้องได้ 1
grep -c '^STAGING_IMAGE_TAG=' .env.staging            # ต้องได้ 0
for k in DB_PASSWORD REDIS_PASSWORD S3_ACCESS_KEY S3_SECRET_KEY HEALTH_JWT_SECRET PROVIDER_JWT_SECRET ENCRYPTION_KEY MASTER_ENCRYPTION_KEY HMAC_KEY SESSION_SECRET QR_SIGNATURE_FALLBACK_SECRET PAYMENT_WEBHOOK_SECRET RSA_PRIVATE_KEY_PASSPHRASE STAGING_PARTNER_TRACE_API_KEY PLATFORM_BANK_NAME PLATFORM_BANK_ACCOUNT_NO DATABASE_URL PUBLIC_API_URL PUBLIC_WEB_URL GRAFANA_PASSWORD PGADMIN_PASSWORD; do
  grep -qE "^$k=.+" .env.staging || echo "MISSING $k"
done; echo CHECK-DONE                                 # ต้องไม่มีบรรทัด MISSING
```

`STRIPE_WEBHOOK_SECRET` ยังว่าง ใส่ใน §4.6 · `SIGNING_KEY_FINGERPRINT` ใส่ใน §4.5 · `SENTRY_DSN` ว่าง = ปิด (operator ตัดสินใน Q6)

**เก็บสำเนา `.env.staging` นอกเครื่อง** (password manager ของ operator) ไม่งั้น backup ของ signing key (§7.3) ถอดไม่ได้เพราะ private key เข้ารหัสด้วย `RSA_PRIVATE_KEY_PASSPHRASE` ในไฟล์นี้

### 4.4 Image ครั้งแรก

ทำตาม §5.1-5.2 (build บน PC แล้ว `docker save | ssh | docker load`) และส่ง `postgres:17-alpine` `alpine:3.20` `redis:7-alpine` `minio/minio:latest` `nginx:alpine` เฉพาะตัวที่ยังไม่มีบนเครื่อง (สี่ตัวหลังมีแล้วจากการติดตั้ง demo §5 ใช้ image เดียวกันได้ ไม่ต้อง pull ใหม่)

```bash
# เครื่อง demo (deploy)
for i in postgres:17-alpine alpine:3.20 redis:7-alpine minio/minio:latest nginx:alpine; do docker image inspect "$i" >/dev/null 2>&1 && echo "have $i" || echo "NEED $i"; done
```

### 4.5 Signing key ของ staging (คู่ใหม่)

staging ไม่ใช้ key ของ demo backend รันโหมด production จึงไม่ยอมสร้าง key เองเมื่อ volume ว่าง (`ensureLocalKeys` → `isSigningKeyRequired`) ต้องสร้างคู่ใหม่ครั้งเดียวที่นี่ ในรูปแบบเดียวกับ `generateKeyPair()` ของ `apps/backend/services/crypto/signature-service.js` (RSA 2048, public `spki` PEM, private `pkcs8` PEM เข้ารหัส `aes-256-cbc` ด้วย `RSA_PRIVATE_KEY_PASSPHRASE`) โดยใช้ node ใน image ของ backend เอง ไม่ต้องลงอะไรเพิ่ม

```bash
# เครื่อง demo (deploy) — STAGING_IMAGE_TAG = tag ที่โหลดใน §4.4
cd /opt/gacp-staging
export STAGING_IMAGE_TAG=local-<sha12>
docker volume create --label com.docker.compose.project=gacp-staging --label com.docker.compose.volume=gacp_staging_signing_keys gacp-staging-signing-keys
RSA_PRIVATE_KEY_PASSPHRASE="$(grep -E '^RSA_PRIVATE_KEY_PASSPHRASE=' .env.staging | head -1 | cut -d= -f2-)" \
docker run --rm -u 0 --network none --memory 256m -e RSA_PRIVATE_KEY_PASSPHRASE \
  -v gacp-staging-signing-keys:/keys --entrypoint node "${BACKEND_IMAGE:-ghcr.io/jonmaxmore/gacp-backend}:$STAGING_IMAGE_TAG" -e '
const c = require("crypto"), fs = require("fs");
if (fs.existsSync("/keys/private.pem") || fs.existsSync("/keys/public.pem")) { console.error("REFUSE: key already present"); process.exit(3); }
const p = process.env.RSA_PRIVATE_KEY_PASSPHRASE || "";
if (p.length < 32) { console.error("REFUSE: passphrase missing or short"); process.exit(4); }
const k = c.generateKeyPairSync("rsa", { modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase: p } });
fs.writeFileSync("/keys/public.pem", k.publicKey, { mode: 0o644 });
fs.writeFileSync("/keys/private.pem", k.privateKey, { mode: 0o600 });
for (const f of ["/keys/public.pem", "/keys/private.pem"]) fs.chownSync(f, 1001, 1001);
console.log("fingerprint=" + c.createHash("sha256").update(k.publicKey).digest("hex"));'
docker run --rm -v gacp-staging-signing-keys:/v:ro alpine:3.20 sh -c 'cd /v && stat -c "%u %a %n" *.pem && sha256sum public.pem | cut -c1-64'
#   1001 644 public.pem · 1001 600 private.pem · บรรทัดสุดท้าย = fingerprint ที่พิมพ์ด้านบน และต้องไม่ใช่ f9f3197c…5796 ของ demo
```

ใส่ fingerprint (ไม่ลับ) ลง env เพื่อให้ backend ไม่ยอม boot ถ้าวันหลังเผลอ mount key อื่น:

```bash
# เครื่อง demo (deploy)
cd /opt/gacp-staging
V="$(docker run --rm -v gacp-staging-signing-keys:/v:ro alpine:3.20 sh -c 'sha256sum /v/public.pem' | cut -c1-64)" \
  K=SIGNING_KEY_FINGERPRINT awk 'BEGIN{FS=OFS="="} $0==ENVIRON["K"]"=" {$0=ENVIRON["K"]"="ENVIRON["V"]} {print}' .env.staging > .env.staging.new \
  && mv .env.staging.new .env.staging && chmod 600 .env.staging && grep -cE '^SIGNING_KEY_FINGERPRINT=[0-9a-f]{64}$' .env.staging   # 1
```

overlay mount key แบบ read-only เหมือน demo: backend ที่รันอยู่หมุน key เองไม่ได้

### 4.6 Stripe webhook ของ staging (โหมดทดสอบ)

secret ของ endpoint staging เดิมอยู่ใน `.env.staging` ของเครื่องเก่าที่ใช้ไม่ได้แล้ว operator ตัดสิน 2026-11-07 (Q10): **สร้าง webhook endpoint ใหม่** ใน test mode ไม่ roll secret ของ endpoint ใด และไม่แตะ secret ของ demo

```text
Stripe Dashboard (Test mode) → Developers → Webhooks
  "Add endpoint" → URL https://staging.gacpth.com/api/webhooks/stripe · event ชุดเดียวกับ endpoint ของ demo (ดูรายการ event ได้ ไม่ต้องเปิด secret)
  → เปิด "Signing secret" ของ endpoint ใหม่นี้เท่านั้น
  endpoint staging เก่า (we_1UK9euQ4HsQ2Gmd565gwUAJn) ถ้ายังอยู่: **operator ตัดสิน 2026-11-07: Disable** หลังขั้นตรวจ §4.10 ข้อ 2 ผ่าน (operator กดเองใน Stripe dashboard โหมด test)
    (secret ของมันไม่มีใครถือแล้ว event ที่ส่งไปจะได้ 400 จาก staging) · ไม่ roll
  ห้ามแตะ endpoint ของ demo (we_1UK9evQ4HsQ2Gmd5ac9Wsq5W): ไม่ roll ไม่เปิดดู secret ไม่แก้ event
```

operator วาง `whsec_…` ของ endpoint ใหม่ลงบรรทัด `STRIPE_WEBHOOK_SECRET=` ด้วย editor บนเครื่อง (`vi /opt/gacp-staging/.env.staging`) ไม่ส่งผ่านแชต แล้วตรวจ (อ่านเฉพาะไฟล์ของ staging ไม่อ่าน `.env.demo`):

```bash
# เครื่อง demo (deploy)
cd /opt/gacp-staging
grep -cE '^STRIPE_WEBHOOK_SECRET=whsec_.+' .env.staging       # 1
```

secret ของ endpoint ใหม่ Stripe สร้างให้ต่อ endpoint จึงต่างจากของ demo โดยโครงสร้าง ไม่ต้องเทียบกับไฟล์ของ demo และหลักฐานว่าใช้ได้คือ test event ที่ staging ตอบ 200 (§4.10 ข้อ 2: ลายเซ็นตรวจผ่านด้วย secret ในไฟล์นี้)

ข้อเท็จจริงที่ต้องรู้: staging และ demo ใช้ Stripe test account เดียวกัน Stripe ส่งทุก event ของ account ไปทุก endpoint ที่สมัครไว้ event ของการชำระบน demo จึงไปถึง staging ด้วย (และกลับกัน) staging หาคำสั่งซื้อนั้นในฐานตัวเองไม่เจอ เหมือนที่เป็นมาตั้งแต่ 2026-09-27

### 4.7 ขึ้นระบบครั้งแรก

ทำ §5.3-5.7 โดยข้าม §5.4 ขั้น pg_dump (ฐานยังไม่มี) ฐานเริ่มว่างและได้ schema จาก `prisma migrate deploy` เท่านั้น ข้อมูลอ้างอิงและบัญชีทดสอบรอคำตอบ Q3

### 4.8 host nginx: map ของประตูก่อน แล้วจึง vhost staging

ห้ามสลับลำดับ vhost staging ตัดสินด้วย `$gacp_prelaunch_deny` จาก `00-gacp-platform.conf` และไฟล์นั้นบนเครื่องยังเป็นรุ่นก่อนแก้ ถ้าขึ้น vhost ก่อน ผู้ถูกบล็อกส่ง `/__gate/../login` แล้วถึง staging ทันที ไฟล์นี้ใช้ร่วมกับ demo การ reload จึงมีผลกับ demo ด้วย ทำทุกขั้นบนเครื่อง demo ใน root shell เดียวกัน เพราะ `$SRC`, `$L`, `$S` และ `nginx_view` ใช้ต่อกันถึงขั้น 5

**ขั้น 1 เตรียมไฟล์**

```bash
# PC
F=deploy/nginx/demo-host/etc/nginx/conf.d/00-gacp-platform.conf
OLD=c0bea6c3e   # commit สุดท้ายที่ repo บันทึกไฟล์นี้ตรงกับเครื่อง demo (deploy/nginx/demo-host/README.md)
git diff --stat "$OLD" "$SHA" -- "$F"   # 1 file changed, 10 insertions(+), 12 deletions(-) ถ้าต่างจากนี้ อ่าน diff ก่อนไปต่อ ต้องแตะแค่ map $gacp_prelaunch_exempt
git show "$OLD:$F" | ssh "$DEMO" 'cat > /opt/gacp-staging/state/00-platform.old'
git show "$SHA:$F" | ssh "$DEMO" 'cat > /opt/gacp-staging/state/00-platform.new'
```

`$SRC` ด้านล่างคือที่อยู่ของเครื่องเอง curl จากเครื่องไปยังที่อยู่นี้ทำให้ nginx เห็น `remote_addr` เป็นที่อยู่ที่ไม่อยู่ใน allowlist จึงเป็นผู้ถูกบล็อกจริงโดยไม่ผ่าน Cloudflare ส่วน `127.0.0.1` อยู่ใน allowlist และ nginx ไม่อ่าน `CF-Connecting-IP` จาก loopback จึงตรวจประตูไม่ได้

```bash
# เครื่อง demo (root)
L=/etc/nginx/conf.d/00-gacp-platform.conf; S=/opt/gacp-staging/state
SRC=$(ip -4 route get 1.1.1.1 | grep -oP 'src \K\S+'); echo "SRC=$SRC"
curl -sk --connect-to "::$SRC:" https://demo.gacpth.com/__access-check | grep -x 'blocked=1'   # ต้องเห็นบรรทัดนี้ ถ้าไม่เห็น $SRC ไม่ใช่ผู้ถูกบล็อก หยุดแล้วรายงาน
nginx_view() {
  for a in 127.0.0.1 "$SRC"; do
    for u in https://demo.gacpth.com/api/health https://demo.gacpth.com/login 'https://demo.gacpth.com/__gate?t=x' \
             https://gacpth.com/login https://gacpth.com/verify/abc http://demo.gacpth.com/.well-known/acme-challenge/not-a-token; do
      curl -sk -o /dev/null --connect-to "::$a:" -w "$a %{http_code} $u\n" "$u"
    done
    curl -sk -o /dev/null --connect-to "::$a:" -X POST -w "$a %{http_code} POST stripe\n" https://demo.gacpth.com/api/webhooks/stripe
  done
}
nginx_view | tee "$S/nginx-view-before.txt"   # demo /api/health และ /login ต้อง 200 ทั้งสองที่อยู่ ถ้าไม่ใช่ หยุด demo มีปัญหาก่อนเริ่ม
```

**ขั้น 2 ติดตั้ง `00-gacp-platform.conf`** ไฟล์บนเครื่องต้องตรงกับ `$OLD` ไบต์ต่อไบต์ ถ้าต่าง คือมีคนแก้บนเครื่องโดยไม่อยู่ใน repo ขั้นนี้จะหยุดและไม่แตะไฟล์

```bash
# เครื่อง demo (root)
if cmp -s "$L" "$S/00-platform.new"; then
  echo PLATFORM-ALREADY-INSTALLED
elif ! cmp -s "$L" "$S/00-platform.old"; then
  diff -u "$S/00-platform.old" "$L"; echo 'STOP: ไฟล์บนเครื่องไม่ตรงกับ repo ไม่ได้แก้อะไร รายงาน operator'
else
  B=/etc/nginx/backup/00-gacp-platform.conf.$(date +%Y%m%d-%H%M%S)
  install -d -m 700 /etc/nginx/backup && cp -p "$L" "$B" && cmp "$L" "$B" && echo "$B" > "$S/00-platform.backup-path" \
    && install -m 644 -o root -g root "$S/00-platform.new" "$L" && restorecon -v "$L"
  if nginx -t; then systemctl reload nginx && echo PLATFORM-RELOADED
  else cp -p "$B" "$L"; restorecon -v "$L"; nginx -t; echo 'STOP: nginx -t ล้ม คืนไฟล์เดิมแล้ว ไม่ได้ reload'; fi
fi
```

**ขั้น 3 ตรวจ demo ทันทีหลัง reload** ทุกบรรทัดต้องเหมือนก่อน reload เพราะ `$gacp_demo_deny` ไม่มีแถวบล็อก และหน้าแจ้งของ `gacpth.com` ตอบก่อนประตู สิ่งที่เปลี่ยนจริงคือ default server ซึ่งไม่อยู่ในรายการนี้ ผู้ถูกบล็อกที่ใช้ Host อื่นและ path อย่าง `/__gatefoo` จะได้ 403 แทนที่จะถึง demo

```bash
# เครื่อง demo (root)
nginx_view | diff "$S/nginx-view-before.txt" - && echo DEMO-SAME-AFTER-RELOAD
```

rollback ถ้าไม่เห็น `DEMO-SAME-AFTER-RELOAD` หรือ demo ผิดปกติในขั้นใดของ §4.8 ไฟล์เดิมมีรู จึงต้องเอา vhost staging ออกด้วยเสมอ ห้ามขึ้น vhost staging จนกว่าจะแก้ต้นเหตุแล้วทำขั้น 2 ใหม่

```bash
# เครื่อง demo (root)
L=/etc/nginx/conf.d/00-gacp-platform.conf; S=/opt/gacp-staging/state; B=$(cat "$S/00-platform.backup-path")
rm -f /etc/nginx/conf.d/staging.gacpth.com.conf
cp -p "$B" "$L" && restorecon -v "$L" && nginx -t && systemctl reload nginx && echo PLATFORM-ROLLED-BACK
nginx_view | diff "$S/nginx-view-before.txt" - && echo DEMO-BACK-TO-BEFORE
```

ก่อนขั้น 4 ต้องเห็น `PLATFORM-NEW-ACTIVE` คำว่า `DEMO-SAME-AFTER-RELOAD` พิสูจน์แค่ว่า demo ไม่เปลี่ยน ไม่พิสูจน์ว่าไฟล์ใหม่ลงแล้ว

```bash
cmp "$L" "$S/00-platform.new" && echo PLATFORM-NEW-ACTIVE   # ไม่เห็น = หยุด ห้ามติดตั้ง vhost staging
```

**ขั้น 4 ติดตั้ง vhost staging**

```bash
# PC
git show "$SHA:deploy/nginx/demo-host/etc/nginx/conf.d/staging.gacpth.com.conf" \
  | ssh "$DEMO" 'sudo install -m 644 -o root -g root /dev/stdin /etc/nginx/conf.d/staging.gacpth.com.conf'
```

```bash
# เครื่อง demo (root)
ls /etc/nginx/conf.d/                          # 00-gacp-platform.conf demo.gacpth.com.conf staging.gacpth.com.conf ไม่มีไฟล์ .bak ในนี้
restorecon -v /etc/nginx/conf.d/staging.gacpth.com.conf
grep -c 'proxy_pass http://127.0.0.1:8081;' /etc/nginx/conf.d/staging.gacpth.com.conf   # 3
nginx -t && systemctl reload nginx && echo NGINX-RELOADED
curl -sk -o /dev/null -w 'demo /api/health -> %{http_code}\n' --resolve demo.gacpth.com:443:127.0.0.1 https://demo.gacpth.com/api/health   # 200 เหมือนก่อน reload
curl -sk -o /dev/null -w 'staging /api/health -> %{http_code}\n' --resolve staging.gacpth.com:443:127.0.0.1 https://staging.gacpth.com/api/health   # 200 จาก 127.0.0.1 พิสูจน์เส้นทาง ไม่พิสูจน์ประตู
curl -sk --resolve staging.gacpth.com:443:127.0.0.1 https://staging.gacpth.com/__access-check   # blocked=0 เพราะ 127.0.0.1 อยู่ใน allowlist
```

ถ้า `nginx -t` ล้ม ห้าม reload ลบไฟล์ใหม่ออก (`rm /etc/nginx/conf.d/staging.gacpth.com.conf && nginx -t`) แล้วรายงาน ไฟล์สำรองห้ามวางใน `conf.d/` (nginx โหลดทุก `*.conf`) ใช้ `/etc/nginx/backup/`

**ขั้น 5 พิสูจน์ว่าผู้ถูกบล็อกไม่ถึง upstream** ต้องมี `--path-as-is` ถ้าไม่มี curl ยุบ `..` เอง คำขอที่ส่งจริงคือ `/login` ซึ่งได้ 403 แม้ map ยังมีรู ผลนั้นไม่พิสูจน์อะไร

```bash
# เครื่อง demo (root)
curl -sk --connect-to "::$SRC:" https://staging.gacpth.com/__access-check | grep -x 'blocked=1'   # ต้องเห็นบรรทัดนี้
for p in /login /__gate/../login; do
  printf '%s -> ' "$p"; curl -sk --path-as-is -o /dev/null -w '%{http_code}\n' --connect-to "::$SRC:" "https://staging.gacpth.com$p"   # 403 ทั้งสองบรรทัด
done
curl -sk -o /dev/null -w '/__gate?t=x -> %{http_code}\n' --connect-to "::$SRC:" 'https://staging.gacpth.com/__gate?t=x'   # 302 ประตูคุกกี้ยังเปิดอยู่
```

ถ้า `/__gate/../login` ไม่ได้ 403 ให้ลบ vhost staging ออกทันที (`rm /etc/nginx/conf.d/staging.gacpth.com.conf && nginx -t && systemctl reload nginx`) แล้วรายงาน

```bash
# PC
for f in 00-gacp-platform.conf staging.gacpth.com.conf; do
  a=$(git show "$SHA:deploy/nginx/demo-host/etc/nginx/conf.d/$f" | sha256sum | cut -d' ' -f1)
  b=$(ssh "$DEMO" "sha256sum < /etc/nginx/conf.d/$f" | cut -d' ' -f1)
  [ "$a" = "$b" ] && echo "SHA-MATCH $f" || echo "SHA-DIFF $f"   # SHA-MATCH ทั้งสองไฟล์ ถ้า SHA-DIFF หยุดแล้วรายงาน
done
```

### 4.9 Cloudflare DNS `[OPERATOR-ONLY]`

```text
Cloudflare → gacpth.com → DNS → Records
  record "staging" (A): ถ้ามีอยู่ (ชี้ 43.134.175.51 เครื่องเก่า) → Edit · ถ้าไม่มี → Add record
    Type A · Name staging · IPv4 119.59.105.140 · Proxy status = Proxied (เมฆส้ม) · Save
  record อื่น (demo, gacpth.com, www) ไม่แตะ
Cloudflare → SSL/TLS → Overview: โหมด Full (เหมือน demo · ค่านี้ทั้ง zone)
  ถ้ามี Configuration Rule / Page Rule เฉพาะ staging.gacpth.com ที่ตั้ง SSL อื่น ให้ลบหรือแก้เป็น Full
```

proxied จึงไม่ต้องรอ TTL firewalld เปิด 443 ให้ Cloudflare อยู่แล้ว

### 4.10 ตรวจหลัง DNS

```bash
# PC
curl -s -o /dev/null -w 'public staging /api/health -> %{http_code}\n' https://staging.gacpth.com/api/health   # 403 = gate ทำงาน (ไม่มีคุกกี้) · 200 = มีคุกกี้หรือ IP ใน allowlist
curl -s https://staging.gacpth.com/api/health | grep -o '"revision":"[0-9a-f]*"'                            # ต้องเท่ากับ $SHA (เมื่อผ่าน gate)
```

บรรทัดแรกจาก PC ไม่พิสูจน์ประตู เพราะ PC ของ operator มักอยู่ใน allowlist ตรวจผู้ถูกบล็อกผ่านเส้นทางจริงจากเครื่อง demo ซึ่งออกผ่าน Cloudflare แล้วกลับมาด้วยที่อยู่สาธารณะของตัวเอง

```bash
# เครื่อง demo (root) DNS จริง ผ่าน Cloudflare
curl -s https://staging.gacpth.com/__access-check | grep -x 'blocked=1'   # ถ้าไม่เห็น ที่อยู่ของเครื่องอยู่ใน allowlist ให้ใช้มือถือที่ไม่มีคุกกี้แทน
curl -s --path-as-is -o /dev/null -w '/__gate/../login -> %{http_code}\n' 'https://staging.gacpth.com/__gate/../login'   # 403
```

Cloudflare อาจจัดรูป path ก่อนส่งถึง origin ผลนี้จึงยืนยันเส้นทางจริงเท่านั้น หลักฐานว่า map ปิดรูแล้วคือ §4.8 ขั้น 5

1. เปิด `https://staging.gacpth.com/__gate?t=<token ของเรา>` ครั้งเดียวบนเครื่อง operator แล้ว `https://staging.gacpth.com/__access-check` ต้องเห็น `remote_addr` = IP ของ operator
2. Stripe (Test mode) → endpoint staging → Send test event → ได้ 200 และบนเครื่อง demo `sudo grep 'webhooks/stripe' /var/log/nginx/access.log | tail -3` เห็นคำขอนั้นที่ host `staging.gacpth.com`
3. ติดตั้ง backup ตาม §7.2-7.3 แล้วทำ restore drill ครั้งแรก §7.4 ก่อนนับว่าติดตั้งเสร็จ
4. ตั้งค่า deploy-walk และเดินตรวจตาม §5.8
5. เทียบสภาพ demo: `demo_snap | diff /opt/gacp-staging/state/demo-before.txt - && echo DEMO-UNTOUCHED` และ fingerprint key ของ demo ยังเป็น `f9f3197c…5796` · `demo_snap` ดูเฉพาะ container ส่วน host nginx ที่ใช้ร่วมเปลี่ยนโดยตั้งใจ ผลของมันต่อ demo ตรวจแล้วที่ `DEMO-SAME-AFTER-RELOAD` ใน §4.8

---

## 5. Deploy `[หลังได้คำว่า deploy]`

ครั้งแรกเป็น `[OPERATOR-ONLY]` (ส่วนหนึ่งของ §4) ครั้งต่อไปทำตามป้ายของแต่ละขั้น

**Preamble เครื่อง demo** วางทุกครั้งที่เปิด shell ใหม่:

```bash
# เครื่อง demo (deploy)
cd /opt/gacp-staging
export STAGING_IMAGE_TAG=local-<sha12 ของ build ที่จะ deploy>
DC="docker compose -p gacp-staging --env-file .env.staging -f docker-compose.production.yml -f docker-compose.staging.yml -f docker-compose.staging-on-demo-host.yml"
$DC config --quiet && echo CONFIG-OK
$DC config --services | sort | tr '\n' ' '; echo     # backend-staging frontend-staging minio nginx postgres redis
demo_snap() { docker inspect -f '{{.Name}} {{.Image}} {{.State.StartedAt}} {{.RestartCount}}' gacp-nginx gacp-redis gacp-minio gacp-backend-demo gacp-frontend-demo; }
```

ถ้า `config --services` ได้ชุดอื่นจากหกตัวนี้ หยุด: แปลว่าไฟล์ไม่ครบหรือ overlay ไม่ถูกอ่าน

### 5.1 Build บน PC

ไม่มี registry และไม่มี build บนเครื่อง demo build บน PC ผ่าน `scripts/ops/heavy.sh` (งานหนักทีละงาน) ตาม `build-images-on-the-box.md` ได้ tag `local-<sha12>` tag เดียวใช้ได้ทั้ง staging และ demo (frontend เรียก `/api` บน host ที่เปิดอยู่)

```bash
# PC
git checkout --detach "$SHA" && git status --short | wc -l      # 0
TAG=local-${SHA:0:12}
scripts/ops/heavy.sh docker build -f apps/backend/Dockerfile --build-arg GIT_SHA=$SHA --build-arg BUILT_AT=$(date -u +%FT%TZ) -t ghcr.io/jonmaxmore/gacp-backend:$TAG .
scripts/ops/heavy.sh docker build -f apps/web-app/Dockerfile --build-arg GIT_SHA=$SHA --build-arg BUILT_AT=$(date -u +%FT%TZ) \
  --build-arg NEXT_PUBLIC_API_URL=https://staging.gacpth.com --build-arg NEXT_PUBLIC_PWA_ENABLED=false --build-arg NEXT_PUBLIC_CHECKOUT_UI_ENABLED=true \
  -t ghcr.io/jonmaxmore/gacp-frontend:$TAG .
docker run --rm --entrypoint sh ghcr.io/jonmaxmore/gacp-backend:$TAG -c 'echo $GIT_SHA'   # ต้องเท่ากับ $SHA
```

ดูท้าย log ของ build ว่าไม่มี `build-args were not consumed`

### 5.2 ส่ง image

```bash
# PC
IMGS="ghcr.io/jonmaxmore/gacp-backend:$TAG ghcr.io/jonmaxmore/gacp-frontend:$TAG"
docker save $IMGS | gzip -1 | ssh "$DEMO" 'gunzip | docker load'
diff <(for i in $IMGS; do echo "$i $(docker image inspect "$i" --format '{{.Id}}')"; done) \
     <(ssh "$DEMO" "for i in $IMGS; do echo \"\$i \$(docker image inspect \$i --format '{{.Id}}')\"; done") && echo IMAGE-IDS-MATCH
```

ราว 2 GB ต่อครั้ง ไม่มี dedupe ห้ามทำในช่วงห้ามของวันนำเสนอนักลงทุน

### 5.3 ไฟล์ และ config ของ Docker nginx

ทำ §4.2 (ส่งไฟล์ของ `$SHA` และเทียบ hash) แล้วบนเครื่อง:

```bash
# เครื่อง demo (deploy, preamble แล้ว)
demo_snap > state/demo-before.txt
n=$(grep -c '^[[:space:]]*set_real_ip_from 172\.18\.0\.1;$' nginx/gacp.production.conf); echo "realip-lines=$n"   # ต้องได้ 1 ไม่ใช่ 1 = หยุด
sed 's/^\([[:space:]]*\)set_real_ip_from 172\.18\.0\.1;$/\1set_real_ip_from 172.29.18.1;/' nginx/gacp.production.conf > nginx/gacp.staging-on-demo-host.conf
grep -c '^[[:space:]]*set_real_ip_from 172\.29\.18\.1;$' nginx/gacp.staging-on-demo-host.conf     # 1
diff nginx/gacp.production.conf nginx/gacp.staging-on-demo-host.conf | grep -c '^[<>]'          # 2 (หนึ่งบรรทัดออก หนึ่งบรรทัดเข้า)
```

ไฟล์ที่สร้างไม่อยู่ใน repo และสร้างใหม่ทุก deploy จาก `nginx/gacp.production.conf` ของ commit นั้น จึงไม่ drift จาก repo ถ้า gateway ของ network ไม่ใช่ `172.29.18.1` (เช่นมีคนสร้าง network ใหม่ด้วยมือ) real-IP จะเงียบหาย §5.6 ตรวจทุกครั้ง

### 5.4 สำรองฐานก่อน migrate แล้ว migrate

```bash
# เครื่อง demo (deploy, preamble แล้ว)
# tag ที่รันอยู่ก่อน deploy นี้ (ว่าง = ยังไม่มี container)
RUNNING=$(docker inspect gacp-backend-staging --format '{{.Config.Image}}' 2>/dev/null | sed 's/^.*://')
echo "running=${RUNNING:-none} deploying=$STAGING_IMAGE_TAG"
# state/previous-tag = tag known-good ล่าสุดสำหรับ rollback เขียนเฉพาะเมื่อยังไม่มีไฟล์ หรือเมื่อ tag ที่รันอยู่ต่างจาก tag ที่จะ deploy
# deploy tag เดิมซ้ำ (retry หลังพัง) ต้องไม่ทับ known-good ด้วย tag ที่กำลังพัง
if [ -n "$RUNNING" ] && [ "$RUNNING" != "$STAGING_IMAGE_TAG" ]; then
  printf '%s\n' "$RUNNING" > state/previous-tag
elif [ ! -e state/previous-tag ]; then
  : > state/previous-tag                                     # ติดตั้งครั้งแรก: ยังไม่มีจุดย้อน
fi
cp state/previous-tag "state/previous-tag.$STAGING_IMAGE_TAG"  # เก็บต่อ deploy: จุดย้อนของ deploy tag นี้
echo "previous-tag=$(cat state/previous-tag)"; ls state/previous-tag.*
$DC up -d --no-deps postgres redis minio
for i in $(seq 30); do [ "$(docker inspect -f '{{.State.Health.Status}}' gacp-staging-postgres)" = healthy ] && { echo PG-HEALTHY; break; }; sleep 2; done
# ข้ามบล็อกนี้ในการติดตั้งครั้งแรก · ชื่อ dump = <tag known-good>_to_<tag ที่จะ deploy>
# รัน deploy เดิมซ้ำหลังล้ม (คู่ tag เดิม) = ใช้ dump แรกต่อ ไม่ dump ใหม่ เพราะ dump ที่ทำหลังรอบที่ล้มอาจมี migration ค้างครึ่งทาง
P=$(cat state/previous-tag); P=${P:-none}
EXIST=$(ls -1 backups/db/pre-deploy_*_"$P"_to_"$STAGING_IMAGE_TAG".dump 2>/dev/null | sort | head -1)
if [ -n "$EXIST" ]; then echo "RETRY: ใช้ dump แรกของ deploy นี้ $EXIST"; else
  F=backups/db/pre-deploy_$(date -u +%Y%m%d_%H%M%S)_"$P"_to_"$STAGING_IMAGE_TAG".dump
  docker exec gacp-staging-postgres sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "$F" \
    && docker exec -i gacp-staging-postgres pg_restore --list < "$F" > /dev/null && echo "DUMP-OK $F $(du -h "$F" | cut -f1)"
fi
# หยุด backend เดิมก่อน migrate: งบหน่วยความจำ (§3) และไม่ให้ cron ของโค้ดเก่าเขียนระหว่าง schema เปลี่ยน
$DC stop backend-staging 2>/dev/null; true
$DC run --rm --no-deps backend-staging sh -c 'cd /app/apps/backend && npx prisma migrate deploy' 2>&1 | grep -v 'npm notice' | tail -15
#   ต้องจบด้วย "All migrations have been successfully applied." หรือ "No pending migrations to apply."
```

`compose run` ใช้ env, network และ image เดียวกับ backend-staging ทุกตัว (รวม `DATABASE_URL` ที่ overlay ประกอบ) จึงไม่มีทาง migrate ฐานอื่น ไม่เปิด port และไม่เริ่ม cron ของแอป

ถ้า migrate ล้ม: อย่า `up` backend ใหม่ ไป §6.2

### 5.5 เปิด container

```bash
# เครื่อง demo (deploy, preamble แล้ว)
$DC up -d --no-deps backend-staging frontend-staging
$DC up -d --no-deps nginx
docker exec gacp-staging-nginx nginx -t && docker exec gacp-staging-nginx nginx -s reload   # รับ config ที่สร้างใน §5.3 ถ้า container ไม่ได้ถูกสร้างใหม่
for _ in 1 2 3 4 5; do docker exec -u 0 gacp-backend-staging chown -R 1001:1001 /app/apps/backend/public/uploads 2>/dev/null && { echo UPLOADS-OWNED; break; }; sleep 2; done
```

### 5.6 ตรวจสุขภาพ

```bash
# เครื่อง demo (deploy, preamble แล้ว)
for i in $(seq 60); do curl -fsS -o /dev/null http://127.0.0.1:8001/api/health && { echo "health 200 after $((i*5))s"; break; }; sleep 5; done
curl -fsS http://127.0.0.1:8001/api/health | grep -o '"revision":"[0-9a-f]*"'                         # = $SHA
curl -fsS http://127.0.0.1:8001/api/health/ready | head -c 200; echo
curl -fsS -o /dev/null -w 'via docker nginx -> %{http_code}\n' -H 'Host: staging.gacpth.com' http://127.0.0.1:8081/api/health
curl -fsS -o /dev/null -w 'frontend via docker nginx -> %{http_code}\n' -H 'Host: staging.gacpth.com' http://127.0.0.1:8081/
# real-IP: Docker nginx ต้องเชื่อ gateway 172.29.18.1 แล้วหยิบ IP จาก X-Forwarded-For
curl -s -H 'Host: staging.gacpth.com' -H 'X-Forwarded-For: 203.0.113.7' http://127.0.0.1:8081/__docker-nginx-real-ip-check | head -1
#   ต้องได้ remote_addr=203.0.113.7 · ได้ 172.29.18.1 = config ไม่ได้ถูกแทน หรือ gateway ไม่ใช่ค่านี้ → หยุด
# Host อื่นต้องไม่ไปไหน: ใน slot นี้ไม่มี backend/backend-demo
curl -s -o /dev/null -w 'demo host via staging nginx -> %{http_code} (ต้อง 502)\n' -H 'Host: demo.gacpth.com' http://127.0.0.1:8081/api/health
curl -sk -o /dev/null -w 'host nginx -> %{http_code}\n' --resolve staging.gacpth.com:443:127.0.0.1 https://staging.gacpth.com/api/health
docker logs --since 10m gacp-backend-staging 2>&1 | grep -E 'Loaded existing signing keys|Boot refused|KEY_UNREADABLE|OPERATOR_INTERVENTION|fingerprint|ECONNREFUSED|P1001' | head
#   ต้องเห็น "Loaded existing signing keys" และไม่เห็นบรรทัดอื่น
docker ps --filter label=com.docker.compose.project=gacp-staging --format '{{.Names}} {{.Status}} {{.Ports}}'
sudo ss -tlnp | grep docker-proxy | grep -v ' 127\.0\.0\.1:' && echo "STOP: มี port ที่ไม่ใช่ loopback" || echo LOOPBACK-ONLY
docker exec gacp-backend-staging sh -c 'getent hosts redis postgres minio' | awk '{print $1, $2}'   # ทุก IP อยู่ใน 172.29.18.0/24
demo_snap | diff state/demo-before.txt - && echo DEMO-UNTOUCHED
curl -sk -o /dev/null -w 'demo /api/health -> %{http_code}\n' --resolve demo.gacpth.com:443:127.0.0.1 https://demo.gacpth.com/api/health
```

แล้วตรวจงบหน่วยความจำตาม §3

### 5.7 จุดตัดสิน rollback

ทำ §6 ถ้า: health ไม่ 200 ใน 5 นาที · revision ไม่ตรง `$SHA` · เจอ `Boot refused` `KEY_UNREADABLE` `OPERATOR_INTERVENTION` · real-IP check ไม่ได้ `203.0.113.7` · `DEMO-UNTOUCHED` ไม่ขึ้น (กรณีนี้หยุดทุกอย่างแล้วรายงาน operator ก่อน)

### 5.8 เดินตรวจหลัง deploy

ไฟล์ตั้งค่า `~/work/state/walk/deploy-walk.config.json` บน PC ส่วน `staging` ต้องเปลี่ยนจาก `"ssh": null` (เครื่องเก่ารันในตัว) เป็น `"ssh": "deploy@119.59.105.140"` และ `"backendContainer": "gacp-backend-staging"` บัญชีในส่วน `accounts` ต้องมีอยู่ในฐาน staging ใหม่ก่อน (Q3) ไม่งั้นแถว accounts และ cert-path จะ FAIL

```bash
# PC
until curl -fsS https://staging.gacpth.com/api/health | grep -q "\"revision\":\"$SHA"; do sleep 5; done
scripts/walk/deploy-walk.sh https://staging.gacpth.com
bash scripts/probes/deploy-drift.sh      # แถว staging-backend/staging-frontend ต้องผ่านถ้า $SHA = origin/main
```

ผลต้องไม่มี FAIL ก่อนถามเรื่อง deploy demo (คำสั่ง 105(7)) · deploy-walk เป็นงานหนัก ห้ามในช่วงห้ามของวันนำเสนอนักลงทุน

---

## 6. Rollback `[หลังได้คำว่า deploy]`

### 6.1 ย้อน image (migration ไม่ได้เปลี่ยน หรือเปลี่ยนแบบเพิ่มอย่างเดียว)

```bash
# เครื่อง demo (deploy)
cd /opt/gacp-staging
PREV=$(cat state/previous-tag); echo "PREV=${PREV:-none}"   # ว่าง = ไม่มีจุดย้อน (ติดตั้งครั้งแรก) หยุดแล้วรายงาน
# ย้อน deploy ที่ระบุ tag ได้ด้วย: PREV=$(cat state/previous-tag.<tag ที่ deploy>)
[ -n "$PREV" ] && docker image inspect "${BACKEND_IMAGE:-ghcr.io/jonmaxmore/gacp-backend}:$PREV" "${FRONTEND_IMAGE:-ghcr.io/jonmaxmore/gacp-frontend}:$PREV" >/dev/null && echo PREV-EXISTS
export STAGING_IMAGE_TAG=$PREV
DC="docker compose -p gacp-staging --env-file .env.staging -f docker-compose.production.yml -f docker-compose.staging.yml -f docker-compose.staging-on-demo-host.yml"
$DC up -d --no-deps backend-staging frontend-staging
```

แล้วตรวจตาม §5.6 (revision = commit ของ `$PREV`) compose และ nginx config ของ commit ใหม่ยังอยู่ ถ้าต้องการย้อนไฟล์ด้วย ทำ §4.2 + §5.3 ด้วย SHA เดิม

image เก่าต้องยังอยู่บนเครื่อง จึงห้าม `docker image prune -a` และห้ามลบ tag ที่ `state/previous-tag` หรือ `state/previous-tag.*` ชี้ ทั้งของ staging และของ demo

`state/previous-tag` ไม่ถูกแก้ตอน rollback: deploy ครั้งถัดไปเห็น tag ที่รันอยู่ (`$PREV`) ต่างจาก tag ใหม่ จึงเขียนใหม่เป็น `$PREV` เอง

### 6.2 migration ทำให้ฐานใช้กับ image เก่าไม่ได้

prisma migration เดินหน้าอย่างเดียว ย้อนด้วย dump ก่อน deploy (§5.4) ของ tag known-good (`$PREV`) ข้อมูลที่เขียนหลัง dump หาย ซึ่งยอมรับได้บน staging ถ้าบรรทัดใดพิมพ์ `STOP` ห้ามรันต่อ

```bash
# เครื่อง demo (deploy, preamble ของ §6.1 แล้ว)
# dump แรก (เก่าสุด) ของคู่ <tag known-good>_to_<tag ที่ล้ม> จาก §5.4 = ฐานก่อน migration ใด ๆ ของ deploy นี้
# STAGING_IMAGE_TAG = tag ที่ deploy แล้วล้ม (ตัวที่กำลังย้อนออก)
[ -n "$PREV" ] || echo "STOP: ไม่มี tag known-good"
F=$(ls -1 backups/db/pre-deploy_*_"$PREV"_to_"${STAGING_IMAGE_TAG:?ตั้ง tag ที่ล้มก่อน}".dump 2>/dev/null | sort | head -1)
[ -n "$F" ] && echo "restore $F (tag $PREV)" || echo "STOP: ไม่มี dump ของ $PREV"
$DC stop backend-staging
docker exec gacp-staging-postgres sh -c 'dropdb -U "$POSTGRES_USER" --force "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker exec -i gacp-staging-postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --exit-on-error' < "$F" && echo RESTORE-OK
$DC up -d --no-deps backend-staging frontend-staging
```

แล้ว §5.6

---

## 7. Backup และ restore `[OPERATOR-ONLY]`

### 7.1 สถานะวันนี้ที่ต้องรู้

dump ฐาน Supabase ของ demo เคยรันจาก root crontab ของ **เครื่องเก่า** (`supabase-backup.sh` · server-migration §1.1 ข้อ 20) เครื่องนั้นใช้ไม่ได้แล้ว จึงน่าจะไม่มี dump ฐาน demo ตั้งแต่เครื่องเก่าดับ ตรวจก่อน (Q4) แล้วติดตั้ง §7.2

```bash
# เครื่อง demo (deploy)
crontab -l; sudo crontab -l; ls /etc/cron.d/
ls -lt /var/backups/gacp/supabase/demo/ 2>/dev/null | head -3      # dump ก่อน deploy ของ demo (deploy.sh)
ls -lt /opt/gacp-platform/backups/ 2>/dev/null | head -3           # volume ของ demo (server-migration §8.2)
```

### 7.2 dump ฐานของทั้งสอง slot

**demo (Supabase)** ด้วย `scripts/backup/pg-backup.sh` ตามที่ขอ แต่ชี้ `DIRECT_URL` (session mode 5432) ไม่ใช่ `DATABASE_URL` เพราะ URL แบบ pooler อาจมี `?pgbouncer=true` ที่ libpq ปฏิเสธ (เหตุผลเดียวกับ `deploy-staging.sh` ขั้น 2) ค่าอ่านจาก `.env.demo` ตอนรัน ไม่อยู่ใน crontab

```bash
# PC
git show "$SHA:scripts/backup/pg-backup.sh" | ssh "$DEMO" 'sudo install -m 755 -o root -g root /dev/stdin /usr/local/bin/gacp-pg-backup.sh'
```

```bash
# เครื่อง demo (root)
install -d -m 700 -o deploy -g deploy /var/backups/gacp/demo
cat > /usr/local/bin/gacp-demo-pg-backup.sh <<'EOF'
#!/usr/bin/env bash
# dump ฐาน Supabase ของ demo ผ่าน DIRECT_URL (runbook staging-on-demo-host.md §7.2)
# ค่าอยู่ใน env ของ process เท่านั้น ไม่อยู่ใน argv หรือ crontab
set -euo pipefail
DATABASE_URL="$(grep -E '^DIRECT_URL=' /opt/gacp-platform/.env.demo | head -1 | cut -d= -f2- | tr -d "\"'")"
[ -n "$DATABASE_URL" ] || { echo "DIRECT_URL missing in .env.demo" >&2; exit 1; }
export DATABASE_URL BACKUP_DIR=/var/backups/gacp/demo/scheduled
exec /usr/local/bin/gacp-pg-backup.sh
EOF
chmod 755 /usr/local/bin/gacp-demo-pg-backup.sh
( crontab -u deploy -l 2>/dev/null; echo '23 2 * * * /usr/local/bin/gacp-demo-pg-backup.sh >> /var/log/gacp/pg-backup-demo.log 2>&1' ) | crontab -u deploy -
cd /tmp && sudo -u deploy /usr/local/bin/gacp-demo-pg-backup.sh       # รันมือหนึ่งครั้ง ต้องจบด้วย "Backup process complete" · cd ก่อน: รันจาก cwd /root ทำให้ find ในขั้น retention ล้ม (deploy อ่าน /root ไม่ได้)
crontab -u deploy -l
```

**สถานะ demo (2026-11-07, operator รันเองตามคำสั่ง "ติดตั้ง backup ฐาน Supabase ของ demo ให้เลย" · ส่งต่อจาก session ก่อน ยังไม่ได้ตรวจจาก cloud):**
- [x] `/usr/local/bin/gacp-pg-backup.sh` = `scripts/backup/pg-backup.sh` ของ main (sha256 `24daad8b…46fa5` ตรงกัน)
- [x] `/usr/local/bin/gacp-demo-pg-backup.sh` + cron ของ deploy `23 2 * * *` → `/var/log/gacp/pg-backup-demo.log`
- [x] รันมือ 11:23 และ 11:24 (+07): dump 204K ต่อไฟล์ · retention daily 7d / weekly 28d / monthly 180d · "Backup process complete" exit=0
- [x] `gunzip -t` ผ่านทั้งสองไฟล์ `gacp_20261107_112309.sql.gz` และ `gacp_20261107_112358.sql.gz` (GZIP-OK, operator รัน)
- [ ] ผล cron คืนแรก 2026-11-08 02:23 ใน log
- [ ] restore drill (ทำบน staging ตาม §7.4 / คำสั่ง 164(6))

`gacp-pg-backup.sh` ใช้ `postgres:17-alpine` เป็น client (มีบนเครื่องแล้ว) และ log บอกแค่ host/ชื่อฐาน ไม่พิมพ์รหัสผ่าน

**staging (postgres ใน slot)** `pg-backup.sh` ใช้กับ slot นี้ไม่ได้: มัน `docker run` ตัว client บน network ปริยาย ซึ่ง resolve `postgres` ของ `gacp-staging-internal` ไม่ได้ และ slot นี้ไม่เปิด port ของ postgres ให้ host (ตั้งใจ) จึง dump ผ่าน `docker exec` เข้า container ของ slot เอง:

```bash
# เครื่อง demo (root)
cat > /usr/local/bin/gacp-staging-pg-dump.sh <<'EOF'
#!/usr/bin/env bash
# dump ฐาน staging slot (runbook staging-on-demo-host.md §7.2) · -Fc · เก็บ 14 วัน
set -euo pipefail
umask 077
OUT=/opt/gacp-staging/backups/db
F="$OUT/gacp_staging_$(date -u +%Y%m%d_%H%M%S).dump"
docker exec gacp-staging-postgres sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "$F"
docker exec -i gacp-staging-postgres pg_restore --list < "$F" > /dev/null
[ "$(stat -c %s "$F")" -ge 1024 ] || { echo "dump too small: $F" >&2; exit 1; }
find "$OUT" -name 'gacp_staging_*.dump' -mtime +14 -delete
echo "ok $F $(stat -c %s "$F")"
EOF
chmod 755 /usr/local/bin/gacp-staging-pg-dump.sh
( crontab -u deploy -l 2>/dev/null; echo '41 2 * * * /usr/local/bin/gacp-staging-pg-dump.sh >> /var/log/gacp/pg-dump-staging.log 2>&1' ) | crontab -u deploy -
sudo -u deploy /usr/local/bin/gacp-staging-pg-dump.sh       # รันมือหนึ่งครั้ง ต้องได้ ok
```

`pre-deploy_*.dump` จาก §5.4 ไม่ถูกลบโดยอัตโนมัติ ลบเองเมื่อพ้นช่วง rollback

### 7.3 volume ของทั้งสอง slot

ใช้ `/usr/local/bin/gacp-backup.sh` ตัวเดียวกับที่ติดตั้งให้ demo (server-migration §8.2 · ต้นฉบับ `scripts/ops/gacp-backup.sh`) แยกโฟลเดอร์ปลายทางและรายการ volume ต่อ slot `GACP_PG_CONTAINER=none` ทำให้ข้ามการ dump ฐานในสคริปต์นั้น (ของ staging ทำใน §7.2) ไม่ tar `gacp-staging-postgres-data` เพราะ tar ของ data dir ที่กำลังรันไม่ใช่ backup ที่เชื่อได้ และไม่รวม `gacp-staging-minio-data` (staging ไม่ใช้ minio · Q2)

```bash
# เครื่อง demo (root)
test -x /usr/local/bin/gacp-backup.sh && echo HAVE-GACP-BACKUP || echo "ติดตั้งตาม server-migration §8.2 ก่อน"
( crontab -u deploy -l 2>/dev/null; echo '53 3 * * * GACP_PG_CONTAINER=none GACP_BACKUP_DIR=/opt/gacp-staging/backups/volumes GACP_BACKUP_VOLUMES="gacp-staging-uploads-data gacp-staging-storage-data gacp-staging-signing-keys" /usr/local/bin/gacp-backup.sh >> /var/log/gacp/backup-volumes-staging.log 2>&1' ) | crontab -u deploy -
sudo -u deploy env GACP_PG_CONTAINER=none GACP_BACKUP_DIR=/opt/gacp-staging/backups/volumes GACP_BACKUP_VOLUMES="gacp-staging-uploads-data gacp-staging-storage-data gacp-staging-signing-keys" /usr/local/bin/gacp-backup.sh
ls -l /opt/gacp-staging/backups/volumes | tail -3            # 3 ไฟล์ .tgz mode 600
crontab -u deploy -l                                          # ของ demo (17 3 ...) อยู่ครบ ไม่ถูกแทน
```

เวลาของ cron ทั้งหมดเหลื่อมกัน (02:23 demo dump · 02:41 staging dump · 03:17 demo volumes · 03:53 staging volumes) งานหนักจึงไม่ซ้อน

### 7.4 Restore drill แบบจับเวลา (staging)

restore ลงฐานชั่วคราว `gacp_restore_drill` ใน container เดียวกัน ฐาน `gacp_staging` ที่ใช้งานไม่ถูกแตะ ทำอย่างน้อยเดือนละครั้งและหลังติดตั้ง ห้ามทำระหว่าง deploy และในช่วงห้ามของวันนำเสนอนักลงทุน

```bash
# เครื่อง demo (deploy)
cd /opt/gacp-staging
D=$(ls -1t backups/db/gacp_staging_*.dump | head -1); echo "dump=$D size=$(stat -c %s "$D")"
T0=$(date +%s)
docker exec gacp-staging-postgres sh -c 'dropdb -U "$POSTGRES_USER" --if-exists gacp_restore_drill && createdb -U "$POSTGRES_USER" gacp_restore_drill'
docker exec -i gacp-staging-postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d gacp_restore_drill --no-owner --exit-on-error' < "$D" && echo RESTORE-OK
T1=$(date +%s)
Q="select (select count(*) from _prisma_migrations where finished_at is not null), (select count(*) from information_schema.tables where table_schema='public')"
src=$(docker exec gacp-staging-postgres sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Atc \"$Q\"")
dst=$(docker exec gacp-staging-postgres sh -c "psql -U \"\$POSTGRES_USER\" -d gacp_restore_drill -Atc \"$Q\"")
echo "live[$src] restored[$dst] $([ "$src" = "$dst" ] && echo MATCH || echo DIFF)"
docker exec gacp-staging-postgres sh -c 'dropdb -U "$POSTGRES_USER" gacp_restore_drill' && echo DRILL-DB-DROPPED
echo "$(date -u +%FT%TZ) dump=$(basename "$D") bytes=$(stat -c %s "$D") restore_seconds=$((T1-T0)) live=[$src] restored=[$dst]" | tee -a state/restore-drill.log
```

ผ่านเมื่อ `RESTORE-OK`, `MATCH` (migration ที่จบแล้วและจำนวนตารางเท่ากัน โดย dump อาจเก่ากว่าฐานจริงไม่เกินหนึ่งวัน ถ้ามี deploy ระหว่างนั้นค่าต่างได้ ให้ใช้ dump ล่าสุดหลัง deploy) และบรรทัดใน `state/restore-drill.log` มี `restore_seconds` เป็นตัวเลขที่วัดได้ ใช้ตัวเลขนี้เป็น RTO ของฐาน staging

restore ฐานจริงของ staging ใช้ขั้นตอน §6.2 กับไฟล์ dump ที่ต้องการ · restore ของ demo (Supabase) ใช้ `gacp-pg-backup.sh --restore` ซึ่งบังคับพิมพ์ชื่อฐานยืนยัน (`RESTORE_TARGET`) และเป็นงานของ operator เท่านั้น ไม่อยู่ในรันบุ๊คนี้

---

## 8. หยุดหรือถอด slot staging `[OPERATOR-ONLY]`

```bash
# เครื่อง demo (deploy, preamble แล้ว)
$DC stop                       # หยุดทั้ง slot เก็บทุกอย่าง · กลับมาด้วย $DC up -d --no-deps postgres redis minio แล้ว backend-staging frontend-staging nginx
demo_snap | diff state/demo-before.txt - && echo DEMO-UNTOUCHED
```

ถอดถาวร: `$DC down` (ไม่มี `-v`) ลบ `/etc/nginx/conf.d/staging.gacpth.com.conf` แล้ว `nginx -t && systemctl reload nginx` ลบ record DNS volume `gacp-staging-*` เก็บไว้จน operator สั่งลบทีละชื่อ

---

## 9. คำถามที่ operator ต้องตอบ

| # | คำถาม | ค่าที่รันบุ๊คสมมติ |
|---|---|---|
| Q1 | staging ใช้ postgres ใน container บนเครื่อง demo (คำสั่ง 164(3) "own postgres") แทน Supabase project ของ staging เดิมใช่ไหม Supabase project เดิมของ staging จะเก็บหรือปิด | **ตอบแล้ว 2026-11-07:** ใช้ Postgres ใน container · Supabase project ของ staging เดิมพักไว้ ยังไม่ลบ |
| Q2 | minio ของ staging รันแยกตามคำสั่ง แต่ `docker-compose.staging.yml` ตั้ง `STORAGE_PROVIDER=local` ไว้ minio จึงไม่ถูกใช้และกิน 256 MiB จะคงไว้ ปิดทิ้ง หรือเปลี่ยน staging ไปใช้ minio ให้เหมือน demo (ต้องแก้ staging.yml ซึ่งมีเทสต์ปักอยู่ · Tier C) | คงไว้ ไม่ใช้งาน |
| Q3 | ฐาน staging เริ่มว่าง: ต้อง seed ข้อมูลอ้างอิงตัวไหน (`apps/backend/prisma/seed-*.js` · ค่า `prisma.seed` ใน `apps/backend/package.json` อ้าง `prisma/seed-bank-accounts.js` ที่ไม่มีอยู่ จึงใช้ `prisma db seed` ตรง ๆ ไม่ได้ · `seed-gacp.js` สร้างชุดข้อมูลสาธิต) และสร้างบัญชีเดินตรวจหกบทบาทด้วยอะไร (`scripts/ops/uat-account-seed.js`, `admin-bootstrap.md`) ก่อนนั้นแถว accounts/cert-path ของ deploy-walk จะ FAIL | **ตอบแล้ว 2026-11-07:** ไม่ seed ข้อมูลธุรกิจ (GOALS.md G4.0) · ข้อมูลอ้างอิงใช้สคริปต์ seed ที่มี · บัญชีเดินตรวจสร้างผ่าน UI/API · ค่าลับไม่อยู่ในแชตหรือ repo |
| Q4 | dump ฐาน Supabase ของ demo ไม่มีใครรันตั้งแต่เครื่องเก่าดับใช่ไหม ติดตั้ง §7.2 ฝั่ง demo เลยไหม | ติดตั้ง |
| Q5 | ใบรับรองที่ `/etc/ssl/cloudflare/origin.pem` ครอบ `staging.gacpth.com` ไหม (โหมด Full ไม่ตรวจ ไม่กระทบวันนี้ แต่ต้องครอบก่อนเปลี่ยนเป็น Full (strict)) | โหมด Full ต่อ |
| Q6 | staging ส่ง error ไป Sentry ไหม ถ้าส่ง ใช้ DSN เดียวกับ demo (แยกด้วย `SENTRY_ENVIRONMENT=staging`) | ว่าง = ปิด |
| Q7 | ไฟล์ใน repo ที่ยังบอกว่า staging อยู่เครื่องเก่า ต้องตามแก้ในงานแยก: `scripts/ops/staff-2fa-hosts.tsv` และ `closing-jobs-hosts.tsv` (แถว staging เป็น `local`), `scripts/deploy/deploy-staging.sh` (ห้ามใช้บนเครื่องนี้ ควรใส่ตัวกัน), `deploy/nginx/demo-host/README.md` (เพิ่มแถว vhost staging หลังติดตั้งจริง), logrotate ของ `/opt/gacp-staging/logs/nginx/*.log` (`deploy/logrotate/gacp-platform.conf` ครอบแค่ `/opt/gacp-platform`) | ทำหลังติดตั้งสำเร็จ |
| Q8 | `postgres:17-alpine` แทน `15-alpine` ของ production.yml ได้ไหม (เป็น image ที่เครื่องมีอยู่แล้วและตรงกับ Supabase 17 · ฐานใหม่ ไม่มีปัญหา upgrade) | 17 |
| Q9 | วันนำเสนอนักลงทุนครั้งถัดไปวันไหน (เพื่อกำหนดช่วงห้าม 24 ชั่วโมงและเลื่อน restore drill) และต้องการหยุด slot staging ทั้งหมดในช่วงนั้นไหม (§8) | **ตอบแล้ว 2026-11-07:** ยังไม่กำหนด · operator แจ้งล่วงหน้าอย่างน้อย 3 วัน |
| Q10 | Stripe: roll secret ของ endpoint staging เดิม หรือสร้าง endpoint ใหม่ | **ตอบแล้ว 2026-11-07:** สร้าง webhook endpoint ใหม่ (test mode) สำหรับ staging.gacpth.com · ไม่แตะ secret ของ demo |

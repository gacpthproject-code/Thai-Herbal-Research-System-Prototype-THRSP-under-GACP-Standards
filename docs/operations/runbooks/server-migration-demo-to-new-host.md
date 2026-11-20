# Runbook — ย้าย demo ไปเครื่องใหม่ 119.59.105.140 (staging อยู่ที่เดิม)

**สถานะ:** PENDING ยังไม่มีขั้นใดถูกรัน
**แผนที่ operator อนุมัติ 2026-10-06:**

| เครื่อง | บทบาทหลังย้าย |
|---|---|
| เก่า `43.134.175.51` (Tencent, Ubuntu 22.04) | งานของเรา (dev, gate, agent) + **staging** เหมือนเดิม ไม่ย้ายอะไรของ staging |
| ใหม่ `119.59.105.140` (metrabyte, AlmaLinux 8.10) | **demo** (`demo.gacpth.com` ที่ลูกค้าเห็น) ภายหลังเป็น production |

เครื่องใหม่เป็นที่ deploy อย่างเดียว ย้ายไปเฉพาะสิ่งที่ demo ต้องใช้รัน ไม่ย้าย worktree, backup เก่า, evidence, เครื่องมือ AI, monitoring หรือ checkout ทั้งก้อน

**ใครทำ:** ขั้นที่มีป้าย `[OPERATOR-ONLY]` operator รันเอง ขั้นที่มีป้าย `[AGENT หลัง operator สั่ง deploy]` agent รันได้เมื่อ operator พิมพ์สั่งแล้วเท่านั้น ขั้นที่ไม่มีป้ายเป็นการอ่านอย่างเดียว
**ที่มาของข้อเท็จจริง:** inventory แบบอ่านอย่างเดียวบนเครื่องเก่า 2026-10-06 (§1) และข้อมูลเครื่องใหม่ที่ coordinator อ่านแบบอ่านอย่างเดียววันเดียวกัน ถ้ารันหลังจากนี้หลายวัน ให้รัน §1.3 ซ้ำก่อน เพราะ tag และขนาดเปลี่ยนได้

ลำดับ: §2 hardening → §3 ติดตั้ง → §4 config และความลับ → §5 image → §6 เปิดแบบมืด → §7 cutover → §8 หลังย้าย · §9 deploy หลังย้าย · §10 rollback · §11 คำถาม

**Preamble เครื่องเก่า** วางทั้งบล็อกทุกครั้งที่เปิด shell ใหม่บนเครื่องเก่า รวมวัน cutover:

```bash
OLD=43.134.175.51
NEW=119.59.105.140
K=/home/ubuntu/.ssh/id_ed25519_newhost   # pubkey SHA256:N/wtsqgepoEVWYDH7+pQosnj1kPs6PDb5zKVQkJk0sQ
SSHR="ssh -i $K -o IdentitiesOnly=yes root@$NEW"
SSHD="ssh -i $K -o IdentitiesOnly=yes deploy@$NEW"
# TAG: ก่อน §7 อ่านจาก container ที่รันอยู่ได้ (วันนี้ local-8a2f801a1839)
#      หลัง §7 ห้ามใช้บรรทัดนี้ เพราะ container เก่าหยุดค้างที่ tag วันย้าย ให้ตั้ง TAG=local-<sha12> ของ build ใหม่เอง (§9)
TAG=$(docker inspect gacp-backend-demo --format '{{.Config.Image}}' | cut -d: -f2); echo "TAG=$TAG"

put() {  # ส่งไฟล์ลับผ่าน stdin · $1 ต้นทาง $2 ปลายทาง $3 owner · พิมพ์แค่ OK/MISMATCH
  sudo cat "$1" | $SSHR "umask 077; cat > '$2' && chown $3 '$2' && chmod 600 '$2'"
  a=$(sudo sha256sum "$1" | cut -c1-16); b=$($SSHR "sha256sum '$2'" | cut -c1-16)
  echo "$2 $([ -n "$a" ] && [ "$a" = "$b" ] && echo OK || echo MISMATCH)"
}
copy_vol() {  # สำเนาตรงของ volume เก่า → ใหม่ (ปลายทางถูกล้างก่อนแตก) owner/mode ของรากตามไปด้วย
  own=$(docker run --rm -v "$1":/src:ro alpine:3.20 stat -c '%u:%g %a' /src)
  docker run --rm -v "$1":/src:ro alpine:3.20 tar czf - -C /src . \
  | $SSHD "docker run --rm -i -v $1:/dst alpine:3.20 sh -c 'find /dst -mindepth 1 -delete && tar xzf - -C /dst && chown ${own% *} /dst && chmod ${own#* } /dst'"
}
VD='cd /v && echo files=$(find . -type f | wc -l) content=$(find . -type f -exec sha256sum {} + | sort -k2 | sha256sum | cut -c1-16) meta=$(find . -exec stat -c "%u:%g %a %n" {} + | sort | sha256sum | cut -c1-16)'
verify_vol() {  # จำนวนไฟล์ + hash เนื้อหา + hash owner/mode สองฝั่ง · ไม่พิมพ์เนื้อหา
  a=$(docker run --rm -v "$1":/v:ro alpine:3.20 sh -c "$VD")
  b=$($SSHD "docker run --rm -v $1:/v:ro alpine:3.20 sh -c '$VD'")
  echo "$1 old[$a] new[$b] $([ "$a" = "$b" ] && echo OK || echo MISMATCH)"
}
VK='cd /v && sha256sum public.pem | cut -c1-64; sha256sum private.pem | cut -c1-16; stat -c "%u %a %n" *.pem | tr "\n" " "'
```

**Preamble เครื่องใหม่** (ในฐานะ `deploy`) วางทุกครั้งที่เปิด shell ใหม่ตั้งแต่ §6 เป็นต้นไป:

```bash
cd /opt/gacp-platform
export DEMO_IMAGE_TAG=local-8a2f801a1839     # = $TAG จากเครื่องเก่า · หลัง §9 ใช้ tag ล่าสุดที่ deploy
DC="docker compose --env-file .env.demo -f docker-compose.production.yml -f docker-compose.demo.yml"
$DC config --quiet && echo CONFIG-OK
```

---

## 1. Inventory

### 1.1 สิ่งที่ demo ใช้อยู่บนเครื่องเก่า (วัด 2026-10-06)

| # | ของ | อยู่ที่ไหนบนเครื่องเก่า | ย้ายอย่างไร |
|---|---|---|---|
| 1 | Container | `gacp-backend-demo`, `gacp-frontend-demo` image `local-8a2f801a1839` (backend 1.67GB, frontend 286MB) ไม่เคย push ขึ้น registry | `docker save \| ssh \| docker load` (§5) |
| 2 | ของร่วมที่ demo พึ่ง | `gacp-redis` (`REDIS_URL` host `redis:6379`), `gacp-minio` (`STORAGE_PROVIDER=minio`, `S3_ENDPOINT` host `minio:9000`), `gacp-nginx` (Docker nginx ที่ `127.0.0.1:8080` เลือก upstream ตาม Host) ทั้งสามมาจาก `docker-compose.production.yml` | รันชุดใหม่บนเครื่องใหม่ด้วย compose ไฟล์เดียวกัน (§6) |
| 3 | Compose | `/opt/gacp-platform/docker-compose.production.yml` + `docker-compose.demo.yml` sha256 ตรงกับ `main` ทุกไบต์ (`a31c15f34a23`, `5485de74dc54`) | copy 2 ไฟล์ (§4.2) |
| 4 | Docker nginx config | `nginx/gacp.production.conf` (`4596190dba42`) + `nginx/50x.html` (`4919d55c5017`) ตรงกับ `main` · hardcode `set_real_ip_from 172.18.0.1` | copy 2 ไฟล์ · network `gacp-network` ต้องได้ gateway `172.18.0.1` (§6.1) |
| 5 | Env demo | `/opt/gacp-platform/.env.demo` 0600 ubuntu (sha `5e4df1f9a33d`) มี `DATABASE_URL` `DIRECT_URL` `STRIPE_SECRET_KEY` (sk_test) `STRIPE_WEBHOOK_SECRET` `SENTRY_DSN` `KEY_PASSPHRASE` `RSA_PRIVATE_KEY_PASSPHRASE` `REDIS_PASSWORD` `S3_*` ฯลฯ และมีบรรทัด `DEMO_IMAGE_TAG=` ค่าเก่าค้างอยู่ | ส่งผ่าน SSH pipe (§4.1) แล้วลบบรรทัด `DEMO_IMAGE_TAG=` บนเครื่องใหม่ · ไม่ต้องย้าย `.env.production`: ค่า REDIS/MINIO/S3/GRAFANA ใน `.env.demo` เท่ากับ `.env.production` ทุกตัว (เทียบ hash ไม่พิมพ์ค่า) จึงใช้ `.env.demo` เป็น env file เดียวได้ และ `deploy-20260930.sh` ก็ใช้ชุดนี้อยู่แล้ว |
| 6 | **Signing key demo** | volume `gacp-signing-keys` mount **read-only** ที่ `/app/apps/backend/keys` · `private.pem` 1874B (sha `043ee50c1a46…`) · `public.pem` 451B · uid 1001 mode 644 · private key เข้ารหัสด้วย passphrase ที่อยู่ใน `.env.demo` | ส่งผ่าน SSH pipe + เทียบ fingerprint (§4.5) · **ต้องเป็นคู่เดิม** ไม่งั้นใบรับรองที่ออกไปแล้ว verify ไม่ผ่านทั้งหมด |
| 7 | Uploads demo | volume `gacp-uploads-data` 96M / 117 ไฟล์ เขียนล่าสุด 2026-09-12 | copy ล่วงหน้า แล้ว copy ซ้ำชุดสุดท้ายตอน cutover (§7) |
| 8 | MinIO data | volume `gacp-minio-data` 152K / 15 ไฟล์ มีแค่ `.minio.sys` ไม่มี bucket · container ที่ mount มีแค่ `gacp-minio` และ staging ใช้ `STORAGE_PROVIDER=local` | copy ตอน cutover |
| 9 | Storage | volume `gacp-storage-data` ว่าง | สร้าง volume เปล่า (demo ประกาศ external ต้องมีก่อน up) |
| 10 | Redis | volume `gacp-redis-data` 15M **ใช้ร่วมกับ staging** (คิว BullMQ ของทั้งสอง env) | ค่าเริ่มต้น: เริ่ม redis ใหม่ว่างบนเครื่องใหม่ (Q4) |
| 11 | Memory limit | backend-demo 1G (`HostConfig.Memory=1073741824`), frontend 512M | มากับ `docker-compose.demo.yml` ไม่ต้องทำเพิ่ม |
| 12 | PDF/Chromium, OCR | อยู่ใน image ทั้งหมด: `/usr/bin/chromium-browser` ที่ `PUPPETEER_EXECUTABLE_PATH` ชี้, tessdata `tha` `eng` | ไม่ต้องติดตั้งอะไรบน host |
| 13 | Host nginx | `/etc/nginx/sites-available/demo.gacpth.com.conf` (symlink ใน sites-enabled) proxy ทุก path ไป `127.0.0.1:8080` · ใช้ตัวแปร `$gacp_demo_deny` `$gacp_prelaunch_blocked_ip` และ real-IP ของ Cloudflare ที่ประกาศใน `/etc/nginx/sites-enabled/gacp-platform.conf` (ไฟล์จริง ไม่ใช่ symlink) | copy ทั้งสองไฟล์ไป `conf.d/` (§4.3) · `$gacp_demo_deny` = 0 เสมอ (demo เปิดสาธารณะ) |
| 14 | Gate cookie | `/etc/nginx/gacp-gate-token.conf` และ `/etc/nginx/gacp-demo-token.conf` (root 600, 38B) · cookie `gacp_demo_gate` ผ่านด้วย token ในไฟล์ใดก็ได้ | ส่งผ่าน SSH pipe (§4.1) |
| 15 | TLS | `/opt/gacp-platform/nginx/ssl/gacp.crt` + `gacp.key` **self-signed** CN=gacpth.com ไม่มี SAN หมดอายุ 2027-06-03 · ไม่มี certbot · Cloudflare จึงต้องอยู่ในโหมด Full (ไม่ strict) | ส่งผ่าน SSH pipe · ใช้คู่เดิม (Q2 ถ้าจะเปลี่ยนเป็น Cloudflare Origin CA) |
| 16 | Stripe webhook | URL `https://demo.gacpth.com/api/webhooks/stripe` (operator ยืนยันใน dashboard Q3) · secret อยู่ใน `.env.demo` ไม่อยู่ใน compose (compose ตั้งใจไม่ list `STRIPE_*`) · path นี้ยกเว้นจาก gate ด้วย map ใน `gacp-platform.conf` | ไปกับ `.env.demo` · Stripe ไม่ต้องแก้เพราะ URL เป็นโดเมน |
| 17 | Database | Supabase demo `spbdkellhyndyexljuar` ผ่าน `aws-0-ap-southeast-1.pooler.supabase.com` port 6543 (`DATABASE_URL`) และ 5432 (`DIRECT_URL`) | ไม่ย้าย · Network Restrictions ตรวจจากเครื่องนี้ไม่ได้ (Q1) จึงพิสูจน์ด้วยการต่อจริงใน §6.4 |
| 18 | Sentry | `SENTRY_DSN` อยู่ใน `.env.demo` (backend) · DSN ของ frontend ฝังใน image ตอน build | ไปกับ env และ image ไม่ผูกกับ IP |
| 19 | Cron ในแอป | backend รัน node-cron 11 งาน (ทุก 5 นาที, settlement reconcile ทุก 10 นาทีซึ่งแตะเส้นทางเงิน, รายชั่วโมง, รายวัน) **ไม่มี flag ปิดและไม่มี lock ข้ามเครื่อง** (`apps/backend/jobs/scheduler.js`) | **ห้ามมี backend-demo รันสองเครื่องพร้อมกัน** · cutover จึงหยุดตัวเก่าก่อนเปิดตัวใหม่ (§7) |
| 20 | Cron บน host | ubuntu `17 3 * * * /usr/local/bin/gacp-backup.sh` (tgz ของ volume รวม `gacp-uploads-data` `gacp-signing-keys` `gacp-minio-data`) · root `47 3 * * * scripts/backup/supabase-backup.sh` (dump ฐาน staging+demo จาก Supabase) · systemd timer มีแต่ของ OS | backup volume ของ demo ต้องตามข้อมูลไป (§8.2, Q6) · dump Supabase รันที่เครื่องเก่าต่อได้เพราะฐานอยู่ข้างนอก |
| 21 | Deploy | `~/work/state/deploy-20260930.sh <staging\|demo> <tag>`: pg_dump ผ่าน `DIRECT_URL` → `migrate status` → `migrate deploy` → `up -d --no-deps` | เปลี่ยนวิธี deploy demo (§9) |
| 22 | Docker | Docker 29.6.2 storage driver `overlay2` (ไม่ใช่ containerd image store) | ตั้งเครื่องใหม่ให้เหมือนกัน (§3.1) เพื่อให้ image id สองฝั่งเทียบกันได้ |

### 1.2 ไม่ย้าย

checkout `/opt/gacp-platform` ทั้งก้อน · `.env.production` `.env.staging` และไฟล์ `.bak` · prometheus, grafana, loki, promtail, cadvisor, node-exporter, pgadmin · volume ของ staging และ preview · `/opt/gacp-platform/backups` และ `/var/backups/gacp` · `/home/ubuntu/work` ทั้งหมด · GitHub runner · agent ของ Tencent · container ค้าง `fee-walk-db` `gacp-restore-drill`

### 1.3 Baseline ก่อนเริ่ม (เครื่องเก่า อ่านอย่างเดียว)

```bash
docker ps --format '{{.Names}} {{.Image}}' | grep -- '-demo'
#   gacp-backend-demo  ghcr.io/jonmaxmore/gacp-backend:local-8a2f801a1839
#   gacp-frontend-demo ghcr.io/jonmaxmore/gacp-frontend:local-8a2f801a1839
cd /opt/gacp-platform && sha256sum docker-compose.production.yml docker-compose.demo.yml nginx/gacp.production.conf nginx/50x.html | cut -c1-12,65-
sudo sha256sum /var/lib/docker/volumes/gacp-signing-keys/_data/public.pem
#   f9f3197cf689565b48014a74080e45114c9d62b418b776f978ef5c0546b95796
```

### 1.4 เครื่องใหม่ (coordinator อ่าน 2026-10-06)

AlmaLinux 8.10 · 10 vCPU · 21 GiB RAM · disk 235 GB (ใช้ 5 GB) · ยังไม่มี docker และ nginx · เปิดแค่ port 22 · sshd ยัง `PermitRootLogin yes` + `PasswordAuthentication yes` ผ่านเกณฑ์ขั้นต่ำ (≥4 GB RAM) แล้ว ตรวจซ้ำใน §2.0

---

## 2. Hardening เครื่องใหม่ก่อนอย่างอื่น `[OPERATOR-ONLY]`

เปิด console ของ metrabyte ค้างไว้ตลอดหมวดนี้ เผื่อ SSH ล็อกตัวเอง ทุกบล็อกรันบนเครื่องใหม่ในฐานะ root ยกเว้นที่เขียนว่าเครื่องเก่า

### 2.0 ตรวจ spec

```bash
cat /etc/redhat-release; uname -r; nproc; df -h / | tail -1
getenforce                                   # คาดว่า Enforcing คงไว้ ไม่ปิด
free -g | awk '/Mem/{print "RAM_GB="$2; exit !($2>=4)}' && echo SPEC-OK || echo "STOP: RAM < 4GB"
```

### 2.1 สร้าง user `deploy` และใส่ key ของเรา

public key คือ `~/.ssh/id_ed25519_newhost.pub` บนเครื่องเก่า (fingerprint `SHA256:N/wtsqgepoEVWYDH7+pQosnj1kPs6PDb5zKVQkJk0sQ`, comment `gacp-ops@43.134.175.51-to-119.59.105.140`) ซึ่ง root ใช้ได้อยู่แล้ว

```bash
dnf -y update && timedatectl set-timezone Asia/Bangkok
useradd -m -s /bin/bash deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
install -m 600 -o deploy -g deploy /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
grep -c 'gacp-ops@43.134.175.51-to-119.59.105.140' /home/deploy/.ssh/authorized_keys   # ต้องได้ 1
restorecon -Rv /home/deploy/.ssh
echo 'deploy ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/90-deploy && chmod 440 /etc/sudoers.d/90-deploy && visudo -c
```

### 2.2 ทดสอบ session ที่สองก่อนปิดรหัสผ่าน

ห้ามปิด session root ที่เปิดอยู่ จากเครื่องเก่าเปิด session ใหม่:

```bash
# เครื่องเก่า
$SSHD 'id; sudo -n true && echo SUDO-OK'     # ต้องเห็น uid ของ deploy และ SUDO-OK
```

ถ้าไม่ผ่าน หยุดตรงนี้และแก้ก่อน ขั้นต่อไปจะปิดรหัสผ่าน

### 2.3 ปิดรหัสผ่าน เหลือ key อย่างเดียว

OpenSSH ของ EL8 ไม่อ่าน `sshd_config.d/` จึงแก้ไฟล์หลักตรง ๆ

```bash
cp -a /etc/ssh/sshd_config /etc/ssh/sshd_config.bak-$(date +%Y%m%d)
sed -i -E \
  -e 's/^#?PasswordAuthentication .*/PasswordAuthentication no/' \
  -e 's/^#?ChallengeResponseAuthentication .*/ChallengeResponseAuthentication no/' \
  -e 's/^#?PermitRootLogin .*/PermitRootLogin prohibit-password/' \
  /etc/ssh/sshd_config
sshd -t && systemctl reload sshd
sshd -T | grep -Ei '^(passwordauthentication|challengeresponseauthentication|permitrootlogin|pubkeyauthentication) '
#   passwordauthentication no · challengeresponseauthentication no · permitrootlogin without-password · pubkeyauthentication yes
```

ทดสอบจากเครื่องเก่าอีกครั้ง โดย session root เดิมยังเปิดอยู่:

```bash
$SSHD true && echo KEY-OK
ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password deploy@$NEW true   # ต้องได้ Permission denied (publickey...)
```

### 2.4 firewalld: 22 เปิด · 80/443 จาก Cloudflare เท่านั้น

firewalld เลือก zone ตาม source ก่อน จึงสร้าง zone `cloudflare` ที่มีแต่ range ของ Cloudflare กับ http/https ส่วน zone `public` เหลือ ssh อย่างเดียว

```bash
systemctl enable --now firewalld
firewall-cmd --permanent --new-zone=cloudflare
for c in $(curl -fsS https://www.cloudflare.com/ips-v4) $(curl -fsS https://www.cloudflare.com/ips-v6); do
  firewall-cmd --permanent --zone=cloudflare --add-source="$c"
done
firewall-cmd --permanent --zone=cloudflare --add-service=http --add-service=https
firewall-cmd --permanent --zone=public --add-service=ssh
for s in http https cockpit dhcpv6-client; do firewall-cmd --permanent --zone=public --remove-service=$s 2>/dev/null; done
systemctl disable --now cockpit.socket 2>/dev/null
firewall-cmd --reload
firewall-cmd --zone=public --list-services        # ssh
firewall-cmd --zone=cloudflare --list-all | head  # sources = Cloudflare ranges, services http https
```

รายการ Cloudflare ที่ดึงมาต้องตรงกับ `set_real_ip_from` ใน `gacp-platform.conf` (§4.3) ถ้า Cloudflare เพิ่ม range ต้องเติมทั้งสองที่ ผลข้างเคียงที่ตั้งใจไว้: เครื่องอื่นยิง 443 ตรง IP ไม่ได้ smoke จึงทำบนตัวเครื่องใหม่เอง (§6.4)

### 2.5 fail2ban (EPEL)

ติดตั้งแยกแพ็กเกจ เพราะ `backend = systemd` ต้องใช้ `fail2ban-systemd` ซึ่ง metapackage `fail2ban` ไม่ดึงมาให้ (และ metapackage ดึง sendmail มาด้วย) ใส่ IP เครื่องเก่าใน `ignoreip` เพราะ §4-§7 เปิด ssh จากเครื่องเก่าหลายสิบครั้ง

```bash
dnf -y install epel-release && dnf -y install fail2ban-server fail2ban-firewalld fail2ban-systemd
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5
ignoreip = 127.0.0.1/8 ::1 43.134.175.51
[sshd]
enabled = true
backend = systemd
EOF
systemctl enable --now fail2ban && fail2ban-client status sshd
```

---

## 3. ติดตั้ง Docker, nginx, SELinux `[OPERATOR-ONLY]`

### 3.1 Docker CE + compose plugin

ใช้ repo ของ RHEL (Docker เลิกรองรับ CentOS 8 แต่ยังรองรับ RHEL 8 ซึ่ง AlmaLinux 8 เข้ากันได้)

```bash
dnf -y remove podman buildah runc 2>/dev/null   # แพ็กเกจจาก AppStream ชนกับ containerd.io
dnf -y install dnf-plugins-core
dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo
dnf list docker-ce --showduplicates | tail -2   # ต้องเห็น build .el8
dnf -y install docker-ce docker-ce-cli containerd.io docker-compose-plugin
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "20m", "max-file": "5" },
  "features": { "containerd-snapshotter": false }
}
EOF
systemctl enable --now docker
docker version --format '{{.Server.Version}}' && docker compose version
docker info -f '{{.Driver}}'  # ต้องได้ overlay2 เหมือนเครื่องเก่า ไม่งั้น image id ใน §5 เทียบกันไม่ได้
usermod -aG docker deploy     # group docker มีสิทธิ์เทียบ root บนเครื่องนี้ ตั้งใจให้ deploy ใช้
```

firewalld กับ Docker: Docker สร้าง zone `docker` เอง ถ้า `firewall-cmd --reload` ภายหลังแล้ว container ออกเน็ตไม่ได้ ให้ `systemctl restart docker`

SELinux กับ Docker: Docker CE ตั้งต้น `selinux-enabled=false` container จึงไม่ถูก confine และ bind mount ใช้ได้โดยไม่ต้อง label คงค่านี้ไว้ให้เหมือนเครื่องเก่า named volume ไม่ต้อง label ไม่ว่าจะตั้งแบบไหน ทางเลือกเปิด confine อยู่ใน §4.4 (ทำเฉพาะเมื่อ Q7 = เปิด)

### 3.2 nginx จาก AppStream

ใช้ stream 1.24 (เครื่องเก่าเป็น 1.18 config ใช้ได้กับทั้งสอง) layout ของ EL ไม่มี `sites-available` ใช้ `conf.d/*.conf`

```bash
dnf -y module reset nginx && dnf -y module enable nginx:1.24 && dnf -y install nginx policycoreutils-python-utils
```

`nginx.conf` ของ AlmaLinux มี `server { listen 80 default_server; … }` ที่จะแย่ง default ของ port 80 จาก server `_` ของเรา จึงแทนด้วยฉบับสั้นที่มีแค่ http block:

```bash
cp -a /etc/nginx/nginx.conf /etc/nginx/nginx.conf.dist
cat > /etc/nginx/nginx.conf <<'EOF'
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log;
pid /run/nginx.pid;
include /usr/share/nginx/modules/*.conf;
events { worker_connections 1024; }
http {
    log_format main '$remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent "$http_referer" "$http_user_agent" "$http_x_forwarded_for"';
    access_log /var/log/nginx/access.log main;
    sendfile on;
    tcp_nopush on;
    keepalive_timeout 65;
    types_hash_max_size 4096;
    server_tokens off;
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    include /etc/nginx/conf.d/*.conf;
}
EOF
```

SELinux สำหรับ host nginx:

```bash
setsebool -P httpd_can_network_connect 1                  # ให้ nginx ต่อ 127.0.0.1:8080 (Docker nginx)
semanage fcontext -a -t cert_t '/opt/gacp-platform/nginx/ssl(/.*)?'   # ให้ nginx อ่าน cert ใต้ /opt
mkdir -p /var/www/certbot
```

ยังไม่ start nginx จนกว่าไฟล์ใน §4 จะครบ

---

## 4. Config และความลับ

### ช่องทางย้ายความลับ

ใช้ช่องทางเดียว: **SSH pipe จากเครื่องเก่าตรงไปเครื่องใหม่** ด้วย key `id_ed25519_newhost` ข้อมูลผ่าน stdin ไม่เข้า argv ไม่ลงดิสก์ที่อื่น ไม่พิมพ์ค่า แล้วเทียบ sha256 สองฝั่ง (`put` ใน preamble)

ห้ามส่งผ่านแชต, git, อีเมล, scp ไปเครื่องที่สาม หรือ bundle ที่ส่ง passphrase ในแชต (bundle ของ 2026-10-02 ถือว่ารั่วแล้ว Q8)

### 4.1 env, gate token, TLS `[OPERATOR-ONLY]`

```bash
# เครื่องเก่า (preamble แล้ว)
$SSHR 'install -d -m 755 -o deploy -g deploy /opt/gacp-platform /opt/gacp-platform/nginx /opt/gacp-platform/logs /opt/gacp-platform/logs/nginx && install -d -m 700 /opt/gacp-platform/nginx/ssl'
put /opt/gacp-platform/.env.demo          /opt/gacp-platform/.env.demo           deploy:deploy
put /opt/gacp-platform/nginx/ssl/gacp.crt /opt/gacp-platform/nginx/ssl/gacp.crt  root:root
put /opt/gacp-platform/nginx/ssl/gacp.key /opt/gacp-platform/nginx/ssl/gacp.key  root:root
put /etc/nginx/gacp-gate-token.conf       /etc/nginx/gacp-gate-token.conf        root:root
put /etc/nginx/gacp-demo-token.conf       /etc/nginx/gacp-demo-token.conf        root:root
```

ทุกบรรทัดต้องเป็น OK หลังเทียบ hash แล้ว ลบบรรทัด `DEMO_IMAGE_TAG=` ค่าเก่าที่ค้างใน `.env.demo` บนเครื่องใหม่ (ค่านี้ไม่ลับ ถ้าคงไว้ แล้วลืม `export DEMO_IMAGE_TAG` compose จะใช้ tag เก่าแบบเงียบ ๆ และตัวกัน `:?` ไม่ทำงาน):

```bash
$SSHR "sed -i '/^DEMO_IMAGE_TAG=/d' /opt/gacp-platform/.env.demo && grep -c '^DEMO_IMAGE_TAG=' /opt/gacp-platform/.env.demo"   # ต้องได้ 0
```

### 4.2 Compose และ Docker nginx config `[OPERATOR-ONLY]`

```bash
# เครื่องเก่า: 4 ไฟล์ ไม่มีความลับ
cd /opt/gacp-platform
for f in docker-compose.production.yml docker-compose.demo.yml nginx/gacp.production.conf nginx/50x.html; do
  cat "$f" | $SSHR "cat > /opt/gacp-platform/$f && chown deploy:deploy /opt/gacp-platform/$f"
done
$SSHR 'cd /opt/gacp-platform && sha256sum docker-compose.production.yml docker-compose.demo.yml nginx/gacp.production.conf nginx/50x.html | cut -c1-12,65-'
# ต้องได้ a31c15f34a23 5485de74dc54 4596190dba42 4919d55c5017
```

### 4.3 Host nginx vhost `[OPERATOR-ONLY]`

```bash
# เครื่องเก่า: copy ไฟล์ที่รันจริง (gacp-platform.conf ใน sites-enabled เป็นไฟล์จริง ห้ามใช้ตัวใน sites-available ที่เก่ากว่า)
sudo cat /etc/nginx/sites-enabled/gacp-platform.conf     | $SSHR 'cat > /etc/nginx/conf.d/00-gacp-platform.conf'
sudo cat /etc/nginx/sites-available/demo.gacpth.com.conf | $SSHR 'cat > /etc/nginx/conf.d/demo.gacpth.com.conf'
a=$(sudo sha256sum /etc/nginx/sites-enabled/gacp-platform.conf | cut -c1-12);     b=$($SSHR 'sha256sum /etc/nginx/conf.d/00-gacp-platform.conf' | cut -c1-12);   echo "00-gacp-platform $([ $a = $b ] && echo OK || echo MISMATCH)"
a=$(sudo sha256sum /etc/nginx/sites-available/demo.gacpth.com.conf | cut -c1-12); b=$($SSHR 'sha256sum /etc/nginx/conf.d/demo.gacpth.com.conf' | cut -c1-12); echo "demo $([ $a = $b ] && echo OK || echo MISMATCH)"
```

`00-gacp-platform.conf` ให้สามอย่างที่ vhost demo ต้องใช้: real-IP จาก Cloudflare, map ของ gate (`$gacp_demo_deny` และข้อยกเว้น path Stripe) และ server `gacpth.com localhost _` ที่ปฏิเสธทุกคนนอก allowlist ซึ่งบนเครื่องนี้เป็น catch-all ให้คนที่ยิงตรง IP ไฟล์นี้ไม่ต้องแก้ บรรทัด `43.134.175.51/32 0;` ใน geo ที่ติดมาไม่มีผลกับ demo

```bash
# เครื่องใหม่ (root)
restorecon -Rv /opt/gacp-platform/nginx/ssl /etc/nginx
nginx -t && systemctl enable --now nginx
```

ถ้า `nginx -t` บ่น `[::]:80` แปลว่าเครื่องปิด IPv6 (Q9)

### 4.4 (ทำเฉพาะเมื่อ Q7 = เปิด confine container) label bind mount

ถ้า operator เลือกเปิด `"selinux-enabled": true` ใน `daemon.json` ให้ label ต้นทางของ bind mount แบบถาวรด้วย `semanage` แทนการแก้ compose เป็น `:Z` (`:Z` เป็น label private ต่อ container และต้องแก้ compose ซึ่งเป็น Tier C) ส่วน `nginx/ssl` ที่ host nginx อ่านด้วย ห้ามเปลี่ยน label

```bash
semanage fcontext -a -t container_file_t '/opt/gacp-platform/nginx/gacp\.production\.conf'
semanage fcontext -a -t container_file_t '/opt/gacp-platform/nginx/50x\.html'
semanage fcontext -a -t container_file_t '/opt/gacp-platform/logs/nginx(/.*)?'
restorecon -Rv /opt/gacp-platform/nginx /opt/gacp-platform/logs/nginx
```

### 4.5 Signing key `[OPERATOR-ONLY]`

ต้องเป็น key คู่เดิมไบต์ต่อไบต์ backend คำนวณ fingerprint เป็น `sha256(public.pem)` (`fingerprintPublicKey` ใน `apps/backend/services/crypto/signature-service.js`) ค่าของ demo วันนี้คือ `f9f3197cf689565b48014a74080e45114c9d62b418b776f978ef5c0546b95796`

```bash
# เครื่องใหม่ (root): volume ต้องมีก่อน และ alpine:3.20 ต้องมี (ถ้ายังไม่ได้ทำ §5: docker pull alpine:3.20 เป็น image สาธารณะ)
docker volume create --label com.docker.compose.project=gacp-platform --label com.docker.compose.volume=gacp_signing_keys gacp-signing-keys
```

```bash
# เครื่องเก่า (preamble แล้ว): tar ผ่าน pipe เก็บ uid/mode เดิม (1001, 644) ไม่ลงดิสก์กลางทาง
docker run --rm -v gacp-signing-keys:/src:ro alpine:3.20 tar cf - -C /src . \
  | $SSHR "docker run --rm -i -v gacp-signing-keys:/dst alpine:3.20 sh -c 'find /dst -mindepth 1 -delete && tar xf - -C /dst'"
# เทียบ fingerprint ของ public key + hash ของ private key + owner/mode (พิมพ์แค่ hash)
a=$(docker run --rm -v gacp-signing-keys:/v:ro alpine:3.20 sh -c "$VK")
b=$($SSHR "docker run --rm -v gacp-signing-keys:/v:ro alpine:3.20 sh -c '$VK'")
echo "old: $a"; echo "new: $b"; [ "$a" = "$b" ] && echo SIGNING-KEY-MATCH || echo "STOP: MISMATCH"
```

บรรทัดแรกทั้งสองฝั่งต้องเป็น `f9f3197c…5796` ถ้า MISMATCH ห้ามทำต่อทั้งรันบุ๊ค หลัง boot จะพิสูจน์ซ้ำด้วยการ verify ใบรับรองเดิม (§7)

ทางเลือกที่แนะนำ (Q5): ใส่ตัวแปร `SIGNING_KEY_FINGERPRINT` ใน `.env.demo` บนเครื่องใหม่ โดยค่าคือ fingerprint 64 ตัวด้านบน แล้ว backend จะไม่ยอม boot ถ้าเผลอ mount key อื่น (`_assertKeyFingerprint`) วันนี้ demo ยังไม่ได้ pin ค่านี้

---

## 5. Images

เลือก **`docker save | ssh | docker load`** ไม่ใช้ registry เหตุผล:
- image เป็น `local-<sha>` ที่ build บนเครื่องเก่าและไม่เคย push (ไม่มี CI ตามมติ operator) การใช้ GHCR ต้องเพิ่มขั้น push และวาง token อ่าน registry ไว้บนเครื่อง demo เป็นความลับอีกชิ้นบนเครื่องที่ลูกค้าเห็น
- pipe ใช้ key ที่มีอยู่แล้ว และเทียบ image id สองฝั่งได้ทันที (ทั้งสองเครื่องใช้ `overlay2` ตาม §3.1)
- ต้นทุน: ส่งทุก layer ใหม่ทุกครั้งเพราะไม่มี dedupe ราว 2 GB ดิบต่อ deploy ยอมรับได้ที่ความถี่ deploy ตอนนี้ ถ้า deploy ถี่ขึ้นหรือเป็น production ค่อยย้ายไป registry (Q10)

ครั้งแรก `[OPERATOR-ONLY]` ครั้งต่อไป `[AGENT หลัง operator สั่ง deploy]`

```bash
# เครื่องเก่า (preamble แล้ว)
IMGS="ghcr.io/jonmaxmore/gacp-backend:$TAG ghcr.io/jonmaxmore/gacp-frontend:$TAG redis:7-alpine minio/minio:latest nginx:alpine alpine:3.20 postgres:17-alpine"
docker save $IMGS | gzip -1 | $SSHD 'gunzip | docker load'
diff <(for i in $IMGS; do echo "$i $(docker image inspect $i --format '{{.Id}}')"; done) \
     <($SSHD "for i in $IMGS; do echo \"\$i \$(docker image inspect \$i --format '{{.Id}}')\"; done") && echo IMAGE-IDS-MATCH
```

`minio/minio:latest` และ `nginx:alpine` ส่งตัวที่รันอยู่จริง ไม่ pull ใหม่ เพราะ `latest` วันนี้อาจเป็นคนละเวอร์ชัน `postgres:17-alpine` ใช้ตอน pg_dump ก่อน deploy (§9)

---

## 6. เปิด demo บนเครื่องใหม่แบบมืด ขณะ demo เก่ายังเปิด `[OPERATOR-ONLY]`

ทุกบล็อกบนเครื่องใหม่ในหมวดนี้รันในฐานะ `deploy` หลังวาง preamble เครื่องใหม่ ห้าม `up -d` เปล่า และห้าม `--remove-orphans` (กฎเดียวกับเครื่องเก่า) ระบุ service ทีละตัวพร้อม `--no-deps`

### 6.1 Network

```bash
ip -4 route | grep -q '172\.18\.' && echo "STOP: 172.18/16 ชนกับ network ของผู้ให้บริการ (Q9)"
docker network create --driver bridge --subnet 172.18.0.0/16 --gateway 172.18.0.1 \
  --label com.docker.compose.network=gacp-network --label com.docker.compose.project=gacp-platform gacp-network
docker network inspect gacp-network --format '{{range .IPAM.Config}}{{.Subnet}} gw={{.Gateway}}{{end}}'   # 172.18.0.0/16 gw=172.18.0.1
```

### 6.2 Volumes ที่เหลือ และ uploads รอบแรก

```bash
mkvol() { docker volume create --label com.docker.compose.project=gacp-platform --label com.docker.compose.volume="$2" "$1" >/dev/null && echo "created $1"; }
mkvol gacp-uploads-data gacp_uploads
mkvol gacp-storage-data gacp_storage
mkvol gacp-minio-data   gacp_minio_data
mkvol gacp-redis-data   redis_data
```

uploads รอบแรกจากเครื่องเก่า (ข้อมูลยังเปลี่ยนได้ รอบสุดท้ายทำใน §7):

```bash
# เครื่องเก่า (preamble แล้ว)
copy_vol gacp-uploads-data && verify_vol gacp-uploads-data    # files=117 วันนี้
```

### 6.3 Service ที่ไม่ใช่ backend

redis ว่าง (Q4), minio, Docker nginx และ frontend เปิดได้ขณะที่ demo เก่ายังรัน เพราะไม่มี cron และไม่แตะฐาน **backend-demo ยังไม่เปิดในขั้นนี้** (§1.1 ข้อ 19)

```bash
$DC up -d --no-deps redis minio
$DC up -d --no-deps nginx              # depends_on backend/frontend ของ production ที่ไม่มีแล้ว จึงต้อง --no-deps
$DC up -d --no-deps frontend-demo
docker ps --format '{{.Names}} {{.Image}} {{.Status}} {{.Ports}}'
sudo ss -tlnp | grep docker-proxy      # ทุกบรรทัดต้องเป็น 127.0.0.1
```

### 6.4 Smoke ก่อน cutover

```bash
curl -sk -o /dev/null -w 'demo / -> %{http_code}\n' --resolve demo.gacpth.com:443:127.0.0.1 https://demo.gacpth.com/
curl -sk --resolve demo.gacpth.com:443:127.0.0.1 https://demo.gacpth.com/__access-check
```

สิ่งที่พิสูจน์ตรงนี้คือ TLS, vhost, Docker nginx และ frontend ตอบ ส่วนที่เรียก API จะได้ 5xx เพราะ backend ยังไม่รัน ทดสอบใน browser ด้วย hosts-file ไม่ได้ เพราะ cert เป็น self-signed และ HSTS `includeSubDomains; preload` ไม่ให้ข้ามคำเตือน อีกทั้ง firewalld ไม่ให้ IP ที่ไม่ใช่ Cloudflare เข้า 443 การตรวจแบบมืดจึงเป็น `curl --resolve` บนเครื่องใหม่เท่านั้น

พิสูจน์ว่า container บนเครื่องใหม่ต่อฐาน demo ได้ **ก่อน** หยุดของเก่า (ตอบ Q1 ด้วยผลวัด) คำสั่งนี้ไม่เปิด cron และไม่เขียนฐาน วิธีเดียวกับ `deploy-20260930.sh` ขั้น 2:

```bash
URL=$(grep -E '^DIRECT_URL=' .env.demo | head -1 | cut -d= -f2- | tr -d "\"'")
DATABASE_URL="$URL" DIRECT_URL="$URL" docker run --rm --network gacp-network -e DATABASE_URL -e DIRECT_URL \
  ghcr.io/jonmaxmore/gacp-backend:$DEMO_IMAGE_TAG sh -c 'cd /app/apps/backend && npx prisma migrate status' 2>&1 \
  | grep -v 'npm notice' | sed -E 's#(postgres(ql)?://[^:]+:)[^@]+@#\1***@#g' | tail -4
unset URL
#   ต้องเห็น "Database schema is up to date!" · P1001 / timeout = Supabase Network Restrictions หรือ firewalld ขวาง (Q1) ห้ามไป §7
```

---

## 7. Cutover `[OPERATOR-ONLY]`

ก่อนเริ่ม: §6.4 ผ่านทั้งสองบล็อก · Q3 (Stripe URL) Q4 (redis) มีคำตอบแล้ว · แจ้งลูกค้าเรื่อง window แล้ว · ไม่มี deploy อื่นค้าง · วาง preamble ทั้งสองเครื่องใน shell ที่จะใช้

เลือกใบรับรองที่ใช้พิสูจน์ key ก่อน T0 บนเครื่องเก่า ต้องเป็นใบที่มีลายเซ็นจริง เพราะใบแบบ hash-only ตอบ `signatureValid: null` (`apps/backend/routes/api/auth/public.js:213`):

```bash
# เครื่องเก่า
CERT='<เลขใบรับรองบน demo>'
curl -sk --resolve demo.gacpth.com:443:127.0.0.1 "https://demo.gacpth.com/api/v1/public/verify/$CERT" \
  | grep -oE '"(sealed|signatureValid)":[a-z]*|"publicKeyFingerprint":"[0-9a-f]*"'
#   ต้องได้ "sealed":true "signatureValid":true "publicKeyFingerprint":"f9f3197c…5796" ถ้าไม่ได้ เลือกเลขอื่น
```

API ของ demo หยุดราว 10 นาที (ประมาณ ไม่ใช่ค่าวัด) เพราะต้องหยุด backend เก่าก่อนเปิดตัวใหม่ หน้าเว็บของ demo เก่ายังตอบอยู่ แต่ทุกอย่างที่เรียก API จะ error ในช่วงนั้น

```bash
# [T0] เครื่องเก่า: หยุด backend demo — stop ไม่ rm · ปิด restart กันกลับมารันคู่ (cron ซ้อน)
docker stop gacp-backend-demo && docker update --restart=no gacp-backend-demo

# [T0+1m] เครื่องเก่า: uploads + minio ชุดสุดท้าย (ไม่มีใครเขียนแล้ว)
copy_vol gacp-uploads-data && verify_vol gacp-uploads-data
# minio: หยุดทั้งสองฝั่งช่วงสั้น ๆ กัน .minio.sys เปลี่ยนระหว่างคัดลอก (staging ใช้ STORAGE_PROVIDER=local จึงไม่กระทบ)
docker stop gacp-minio && $SSHD 'docker stop gacp-minio' \
  && copy_vol gacp-minio-data && verify_vol gacp-minio-data
$SSHD 'docker start gacp-minio'; docker start gacp-minio
verify_vol gacp-storage-data
```

```bash
# [T0+3m] เครื่องใหม่ (deploy, preamble แล้ว): เปิด backend · ไม่ migrate (ฐานเดิม image เดิม)
$DC up -d --no-deps backend-demo
for i in $(seq 60); do curl -fsS -o /dev/null http://127.0.0.1:8003/api/health && { echo "health 200 after $((i*5))s"; break; }; sleep 5; done
docker inspect gacp-backend-demo --format '{{.Config.Image}} mem={{.HostConfig.Memory}} {{.State.Health.Status}}'   # mem=1073741824
curl -fsS http://127.0.0.1:8003/api/health/ready | head -c 200; echo
docker logs --since 10m gacp-backend-demo 2>&1 | grep -E 'Cron jobs started|KEY_UNREADABLE|OPERATOR_INTERVENTION|Boot refused|fingerprint|P1001' | head
CERT='<เลขเดียวกับที่เลือกด้านบน>'
curl -sk --resolve demo.gacpth.com:443:127.0.0.1 "https://demo.gacpth.com/api/v1/public/verify/$CERT" \
  | grep -oE '"(sealed|signatureValid)":[a-z]*|"publicKeyFingerprint":"[0-9a-f]*"'
#   ต้องได้ผลเดียวกับเครื่องเก่าทุกตัว = signing key คู่เดิมจริง
```

จุดตัดสิน rollback ก่อนแตะ DNS: health ไม่ 200 ใน 5 นาที, เจอ `Boot refused` / `KEY_UNREADABLE` / `P1001` หรือผล verify ไม่ตรงกับเครื่องเก่า ถ้าเจอ ทำ §10 ข้อ 1 และ 3 (DNS ยังไม่เปลี่ยน ไม่ต้องย้อน uploads)

```text
[T0+8m] Cloudflare → DNS → record "demo" (A) → 43.134.175.51 เปลี่ยนเป็น 119.59.105.140
        Proxy status = Proxied (เมฆส้ม) คงไว้ · Save
        record อื่น (gacpth.com, www, api, staging) ไม่แตะ
```

record เป็น proxied จึงไม่ต้องลด TTL ล่วงหน้า origin เปลี่ยนภายในไม่กี่วินาที

```bash
# [T0+10m] เครื่องใหม่: traffic มาถึงจริงไหม
curl -s -o /dev/null -w 'public demo /api/health -> %{http_code}\n' https://demo.gacpth.com/api/health
sudo tail -5 /var/log/nginx/access.log
# เครื่องเก่า: ปิด frontend demo เก่า (ไม่มี traffic แล้ว) — stop ไม่ rm
docker stop gacp-frontend-demo && docker update --restart=no gacp-frontend-demo
```

ตรวจด้วยมือ (operator ใน browser):
1. `https://demo.gacpth.com/__access-check` ตอบ และ `remote_addr` เป็น IP ของ operator (real-IP จาก Cloudflare ทำงาน)
2. login ด้วยบัญชี demo แล้วเข้า dashboard ได้
3. เปิด PDF ใบรับรองเดิม และสแกน QR ของใบรับรองเดิม ผลต้อง valid
4. อัปโหลดเอกสารทดสอบ 1 ไฟล์ แล้วเปิดดูได้
5. Stripe (test mode) → Webhooks → endpoint demo → Resend event ล่าสุดที่เคยสำเร็จ → ได้ 200 และ `sudo grep 'webhooks/stripe' /var/log/nginx/access.log | tail -3` บนเครื่องใหม่เห็นคำขอนั้น
6. Sentry: ถ้ามี error หลัง cutover ต้องเห็น event ของ `environment=demo`

### 7.1 เฝ้าดู

ชั่วโมงแรกทุก 15 นาที แล้ววันละครั้งจนครบช่วง rollback

```bash
docker ps --filter name=demo --format '{{.Names}} {{.Status}}'
docker stats --no-stream gacp-backend-demo gacp-frontend-demo
docker logs --since 30m gacp-backend-demo 2>&1 | grep -ciE 'error|fatal'
docker logs --since 30m gacp-backend-demo 2>&1 | grep -iE 'settlement|reconcile' | tail -3
```

---

## 8. หลังย้าย

### 8.1 เครื่องเก่าคงไว้สำหรับ rollback `[OPERATOR-ONLY]`

`gacp-backend-demo` และ `gacp-frontend-demo` บนเครื่องเก่าอยู่ในสภาพ stopped + `restart=no` พร้อม volume เดิม **7 วัน** (ค่าเสนอ Q11) ห้าม `docker start` ยกเว้นตอน rollback

`deploy-20260930.sh demo …` บนเครื่องเก่าจะสร้าง container demo ใหม่และเปิด cron ซ้อนกับเครื่องใหม่ทันที จึงปิดทางนั้น (script อยู่นอก repo):

```bash
# เครื่องเก่า
cp -a ~/work/state/deploy-20260930.sh ~/work/state/deploy-20260930.sh.orig
sed -i 's/^  demo)    ENVFILE=.env.demo;/  demo)    echo "demo ย้ายไป 119.59.105.140 แล้ว ให้ deploy ที่นั่น (runbook §9)"; exit 2; ENVFILE=.env.demo;/' ~/work/state/deploy-20260930.sh
bash ~/work/state/deploy-20260930.sh demo x; echo "exit=$?"     # ต้องได้ข้อความนั้นและ exit=2
```

### 8.2 Backup ของ volume demo บนเครื่องใหม่ `[OPERATOR-ONLY]`

uploads และ signing key ของ demo อยู่บนเครื่องใหม่แล้ว cron บนเครื่องเก่าจะ backup แต่ของที่ไม่มีใครใช้ ข้อเสนอ (Q6) คือติดตั้ง script เดิมบนเครื่องใหม่โดยจำกัดรายการ volume:

```bash
# เครื่องเก่า → เครื่องใหม่ (script ไม่มีความลับ)
$SSHR 'rpm -q cronie || dnf -y install cronie; systemctl enable --now crond && systemctl is-active crond'
cat /usr/local/bin/gacp-backup.sh | $SSHR 'install -m 755 /dev/stdin /usr/local/bin/gacp-backup.sh'
$SSHR 'install -d -o deploy -g deploy /var/log/gacp && install -d -m 700 -o deploy -g deploy /opt/gacp-platform/backups
( crontab -u deploy -l 2>/dev/null; echo "17 3 * * * GACP_BACKUP_VOLUMES=\"gacp-uploads-data gacp-storage-data gacp-signing-keys gacp-minio-data\" /usr/local/bin/gacp-backup.sh >> /var/log/gacp/backup-volumes.log 2>&1" ) | crontab -u deploy -
crontab -u deploy -l'
```

รันมือหนึ่งครั้ง แล้วดูว่ามี tgz ของทั้ง 4 volume ก่อนนับว่าเสร็จ dump ฐาน demo (`supabase-backup.sh`) รันที่เครื่องเก่าต่อไปได้ เพราะฐานไม่ได้อยู่บนเครื่องไหน

### 8.3 ถอด demo ออกจากเครื่องเก่า (หลังครบช่วง rollback และ operator สั่งเท่านั้น) `[OPERATOR-ONLY]`

```bash
# เครื่องเก่า
docker rm gacp-backend-demo gacp-frontend-demo
sudo rm /etc/nginx/sites-enabled/demo.gacpth.com.conf && sudo nginx -t && sudo systemctl reload nginx
# backup volume บนเครื่องเก่า: เอา volume ของ demo ออก เหลือ staging
sudo sed -i 's/^VOLUMES="${GACP_BACKUP_VOLUMES:-gacp-uploads-data gacp-storage-data gacp-signing-keys gacp-minio-data /VOLUMES="${GACP_BACKUP_VOLUMES:-/' /usr/local/bin/gacp-backup.sh
grep -n '^VOLUMES=' /usr/local/bin/gacp-backup.sh
```

การแก้ `/usr/local/bin/gacp-backup.sh` ทำให้ไฟล์บนเครื่องเก่าต่างจาก `scripts/ops/gacp-backup.sh` ใน repo ซึ่งเป็นต้นฉบับ ให้แก้ค่า default ใน repo ตามในงานแยก หรือเปลี่ยนเป็นตั้ง `GACP_BACKUP_VOLUMES` ใน crontab แทนการแก้ไฟล์

volume `gacp-signing-keys` `gacp-uploads-data` `gacp-minio-data` บนเครื่องเก่า **อย่าลบ** จนกว่า operator ตัดสินว่าเก็บเป็น archive หรือทิ้ง (Q12) เพราะเป็นสำเนาเดียวของ signing key นอกเครื่องใหม่ (นอกจาก tgz ใน backup) ไฟล์ compose ใน `/opt/gacp-platform` บนเครื่องเก่าไม่ต้องแก้ เพราะ `docker-compose.demo.yml` อยู่ใน repo และบนเครื่องเก่าไม่มีอะไรเรียกมันอีก

ที่ต้องตามแก้เพราะยังบอกว่า demo อยู่ที่ `43.134.175.51`: memory `staging-server-access-and-gate`, `deploy-2026-10-05-aa82f753`, `three-domain-split-demo-staging-dark` และ runbook ที่ deploy demo บนเครื่องเก่า

---

## 9. Deploy demo หลังย้าย

วันนี้ `deploy-20260930.sh` deploy ทั้งสอง env บนเครื่องเก่า หลังย้าย staging ยังเหมือนเดิม ส่วน demo แยกเป็น build ที่เครื่องเก่าแล้ว deploy ที่เครื่องใหม่

1. **Build** บนเครื่องเก่าเหมือนเดิม (`build-images-on-the-box.md`) ได้ `local-<sha12>` tag เดียวใช้ได้ทั้ง staging และ demo
2. **ติดตั้ง script บนเครื่องใหม่** ครั้งเดียว `[OPERATOR-ONLY]` (script ไม่มีความลับ อ่านค่าจาก `.env.demo` ข้างเครื่อง)
   ```bash
   cat ~/work/state/deploy-20260930.sh.orig | $SSHD 'install -m 755 /dev/stdin /opt/gacp-platform/deploy.sh'
   $SSHR 'install -d -m 700 -o deploy -g deploy /var/backups/gacp /var/backups/gacp/supabase'
   ```
3. **ตั้ง TAG เอง** ห้ามใช้บรรทัด `TAG=$(docker inspect …)` ใน preamble หลัง §7
   ```bash
   TAG=local-<sha12 ของ build ใหม่>
   docker image inspect ghcr.io/jonmaxmore/gacp-backend:$TAG ghcr.io/jonmaxmore/gacp-frontend:$TAG >/dev/null && echo TAG-EXISTS
   ```
4. **ส่ง image** `[AGENT หลัง operator สั่ง deploy]`
   ```bash
   docker save ghcr.io/jonmaxmore/gacp-backend:$TAG ghcr.io/jonmaxmore/gacp-frontend:$TAG | gzip -1 | $SSHD 'gunzip | docker load'
   ```
   แล้วเทียบ image id สองฝั่งแบบ §5
5. **Deploy** `[AGENT หลัง operator สั่ง deploy]`
   ```bash
   $SSHD "cd /opt/gacp-platform && bash deploy.sh demo $TAG"
   ```
   ลำดับข้างในเหมือนเดิม: ตรวจว่า `DIRECT_URL` เป็นโปรเจกต์ `spbdkellhyndyexljuar` → pg_dump ฐาน demo ไป `/var/backups/gacp/supabase/demo/` บนเครื่องใหม่ → `migrate status` → `migrate deploy` → `up -d --no-deps backend-demo frontend-demo`
6. **Smoke** หลัง deploy แบบ §7 บล็อก T0+3m (วาง preamble เครื่องใหม่ด้วย `DEMO_IMAGE_TAG=$TAG` ใหม่)

ขั้น 4-5 เป็น deploy ตามกฎ CLAUDE.md จึงต้องมีคำสั่ง deploy จาก operator ทุกครั้ง งานต่อยอดที่แนะนำแต่ไม่อยู่ในรันบุ๊คนี้: ย้าย script เข้า repo เป็น `scripts/deploy/` ที่รับปลายทางเป็นพารามิเตอร์ (Q10)

---

## 10. Rollback `[OPERATOR-ONLY]`

ทำได้ตลอดช่วงที่เครื่องเก่ายังเก็บ demo ไว้ ฐานอยู่ที่ Supabase ทั้งสองฝั่ง จึงไม่มีฐานให้ย้อน สิ่งเดียวที่แยกกันคือไฟล์ที่เขียนบนเครื่องใหม่หลัง cutover

1. เครื่องใหม่: หยุด backend และปิด restart ก่อนเสมอ (ห้ามสองตัวพร้อมกัน)
   ```bash
   docker stop gacp-backend-demo && docker update --restart=no gacp-backend-demo
   ```
2. ย้อน uploads ที่เขียนบนเครื่องใหม่กลับเครื่องเก่า (ข้ามได้ถ้ายังไม่เปลี่ยน DNS) **ไม่ลบของเดิมบนเครื่องเก่าก่อน** เพราะถ้า ssh ขาดกลางทางจะเหลือ volume ครึ่งเดียว ให้ tar เขียนทับ ไฟล์ที่ถูกลบบนเครื่องใหม่จะค้างบนเครื่องเก่า ซึ่งรับได้
   ```bash
   # เครื่องเก่า (preamble แล้ว)
   $SSHD "docker run --rm -v gacp-uploads-data:/src:ro alpine:3.20 tar czf - -C /src ." \
     | docker run --rm -i -v gacp-uploads-data:/dst alpine:3.20 tar xzf - -C /dst
   verify_vol gacp-uploads-data   # files ฝั่งเก่าต้อง ≥ ฝั่งใหม่ · content ต่างได้ถ้ามีไฟล์ที่ถูกลบบนเครื่องใหม่
   ```
3. เครื่องเก่า: คืน restart policy แล้ว start
   ```bash
   docker update --restart=unless-stopped gacp-backend-demo gacp-frontend-demo && docker start gacp-backend-demo gacp-frontend-demo
   for i in $(seq 60); do curl -fsS -o /dev/null http://127.0.0.1:8003/api/health && { echo OK; break; }; sleep 5; done
   ```
4. Cloudflare: record `demo` กลับเป็น `43.134.175.51` (Proxied)
5. ตรวจ `https://demo.gacpth.com/api/health` = 200 และ `__access-check` ตอบจากเครื่องเก่า
6. คืน `~/work/state/deploy-20260930.sh.orig` เป็น `deploy-20260930.sh` บนเครื่องเก่า

เวลาย้อนประมาณ 5-10 นาที (ประมาณ ไม่ใช่ค่าวัด)

---

## 11. คำถามที่ operator ต้องตอบ

| # | คำถาม | ค่าที่รันบุ๊คสมมติ |
|---|---|---|
| Q1 | Supabase demo `spbdkellhyndyexljuar` เปิด Network Restrictions ไหม (Dashboard → Project Settings → Database → Network Restrictions) ตรวจจากเครื่องนี้ไม่ได้เพราะไม่มี Supabase access token ถ้าเปิด ต้องเพิ่ม `119.59.105.140/32` **ก่อน** §6.4 และคง `43.134.175.51/32` ไว้ เพราะ staging กับ dump ฐาน demo ยังรันจากเครื่องเก่า §6.4 จะพิสูจน์ด้วยการต่อจริงอยู่แล้ว | ไม่เปิด |
| Q2 | Cloudflare SSL/TLS mode เป็น Full ใช่ไหม จะออก Cloudflare Origin CA (`*.gacpth.com`) แล้วใช้ Full (strict) ในการย้ายนี้ หรือทีหลัง | ใช้ self-signed คู่เดิม · Full |
| Q3 | Stripe test mode: endpoint ของ demo เป็น `https://demo.gacpth.com/api/webhooks/stripe` (โดเมน) ใช่ไหม | ใช่ |
| Q4 | Redis บนเครื่องใหม่เริ่มว่างได้ไหม redis เก่าใช้ร่วมกับ staging ถ้ามีงาน BullMQ ของ demo ค้าง (SLA, webhook DLQ) จะหายไป ก่อน §7 ให้ดูว่าคิวของ demo ว่าง | เริ่มว่าง |
| Q5 | pin `SIGNING_KEY_FINGERPRINT` ใน `.env.demo` บนเครื่องใหม่ไหม (backend ไม่ยอม boot ถ้า key ผิด) | แนะนำให้ pin · ยังไม่ทำจนกว่าสั่ง |
| Q6 | ติดตั้ง backup volume ของ demo บนเครื่องใหม่ (§8.2) ไหม brief บอกไม่ย้าย backup เก่า แต่ถ้าไม่ทำ uploads และ signing key บนเครื่องใหม่จะไม่มีสำเนาใหม่เลย | ทำ · ไม่ย้าย backup เก่า |
| Q7 | Docker บนเครื่องใหม่: คง `selinux-enabled=false` เหมือนเครื่องเก่า หรือเปิด confine container (ทำ §4.4 เพิ่ม) | คง false · SELinux ของ host คง Enforcing |
| Q8 | rotate ความลับทั้งชุดหลังย้าย (bundle 2026-10-02 ส่ง passphrase ในแชต) ทำเมื่อไร | หลังย้ายเสร็จ เป็นงานแยก |
| Q9 | ถ้าเครื่องใหม่ปิด IPv6 หรือ 172.18/16 ชนกับ network ของ metrabyte ต้องแก้ไฟล์ nginx หรือ compose (Tier C) | ไม่ชน |
| Q10 | ใช้ `docker save` ไปก่อน แล้วค่อยย้ายไป registry และย้าย deploy script เข้า repo ตอนเป็น production ใช่ไหม | ใช่ |
| Q11 | เก็บ demo บนเครื่องเก่าไว้ rollback กี่วัน | 7 วัน |
| Q12 | หลังถอด demo จากเครื่องเก่า volume `gacp-signing-keys` `gacp-uploads-data` เก็บเป็น archive หรือทิ้ง | เก็บ |
| Q13 | `PUBLIC_WEB_URL` ใน env ของ demo ชี้ `https://gacpth.com` (โดเมนเปล่าที่ปิดอยู่) ตั้งใจหรือไม่ ไม่เกี่ยวกับการย้าย แต่เจอระหว่าง inventory | ไม่แก้ในงานนี้ |
| Q14 | window ของ cutover และข้อความแจ้งลูกค้า | – |

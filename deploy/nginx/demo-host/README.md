# nginx ของเครื่อง demo (119.59.105.140)

โฟลเดอร์นี้เก็บไฟล์ nginx ที่เครื่อง demo ใช้อยู่จริง ไบต์ต่อไบต์ อ่านจากเครื่องหลังการแก้ครั้งล่าสุด 2026-10-30 09:36 (เวลาไทย)
path ในโฟลเดอร์นี้ตรงกับ path บนเครื่อง: `deploy/nginx/demo-host/<path>` คือไฟล์ `/<path>` บนเครื่อง demo

| ไฟล์ในรีโป | ใครใช้ |
|---|---|
| `etc/nginx/nginx.conf` | host nginx 1.24 (AlmaLinux 8) โหลด `conf.d/*.conf` |
| `etc/nginx/conf.d/00-gacp-platform.conf` | server แรกของพอร์ต 80/443 ตอบ `gacpth.com`, `www.gacpth.com` และชื่อที่ไม่มี vhost ของตัวเอง |
| `usr/share/nginx/gacpth-notice/index.html` | หน้าแจ้งยังไม่เปิดให้บริการของ `gacpth.com` (`location = /__gacp_notice` อ่านไฟล์นี้) |
| `etc/nginx/conf.d/demo.gacpth.com.conf` | vhost ของ `demo.gacpth.com` ส่งต่อไป container ที่ `127.0.0.1:8080` |
| `opt/gacp-platform/nginx/gacp.production.conf` | container `gacp-nginx` mount เป็น `/etc/nginx/conf.d/default.conf` |
| `opt/gacp-platform/nginx/50x.html` | container `gacp-nginx` mount เป็น `/etc/nginx/error-pages/50x.html` |

ไม่อยู่ใน git: ใบรับรองและกุญแจ (`/etc/ssl/cloudflare/`, `/opt/gacp-platform/nginx/ssl/`)
และไฟล์ token ที่อ่านได้เฉพาะ root (`/etc/nginx/gacp-gate-token.conf`, `/etc/nginx/gacp-demo-token.conf`)

ไฟล์ของ staging อยู่ที่ `deploy/nginx/*.conf` และ `nginx/gacp.production.conf` ส่วนไฟล์ที่นี่เป็นของเครื่อง demo เท่านั้น
ไฟล์สองชุดนี้ต่างกันจริง เช่น container ของ demo ยังใช้ upload limit ก่อนคำสั่ง 120 (5r/m, burst 10)
และคอมเมนต์บางส่วนใน `00-gacp-platform.conf` เป็นของเก่าที่ยังอยู่บนเครื่อง

ตรวจว่าเครื่องยังตรงกับไฟล์ที่ commit: `~/work/state/infra/check-nginx-drift-demo.sh <commit>` (อ่านอย่างเดียว)
`/opt/gacp-platform/deploy.sh` ของเครื่อง demo ไม่แตะ nginx การแก้ที่เครื่องต้องแก้ไฟล์ที่นี่ใน commit เดียวกัน

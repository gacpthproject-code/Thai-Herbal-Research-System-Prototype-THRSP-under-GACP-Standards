# Log กลางของเครื่อง demo: เปิดดูและค้น

เครื่อง demo (119.59.105.140) ส่ง log ของทุก container `gacp-*` เข้า Loki บนเครื่องเดียวกัน
log จึงไม่หายตอน deploy สร้าง `gacp-backend-demo` ใหม่ เก็บ 30 วันแล้วลบเอง
ไฟล์ทั้งหมดอยู่ที่ `deploy/logging/demo-host/` ติดตั้งด้วย `deploy/logging/demo-host/demo-logging-install.sh`

## เปิด Grafana ผ่าน SSH tunnel

Grafana และ Loki ฟังเฉพาะ `127.0.0.1` ของเครื่อง demo ไม่มีพอร์ตเปิดสู่อินเทอร์เน็ต และ firewalld ไม่ได้เปลี่ยน

1. เปิด tunnel จากเครื่องของคุณ แล้วเปิดหน้าต่างนี้ค้างไว้

   ```bash
   ssh -N -L 3200:127.0.0.1:3200 -L 3100:127.0.0.1:3100 root@119.59.105.140
   ```

   จากเครื่องทำงาน ใช้ `ssh -i ~/.ssh/id_ed25519_newhost -o IdentitiesOnly=yes -N -L 3200:127.0.0.1:3200 -L 3100:127.0.0.1:3100 deploy@119.59.105.140`

2. เปิด `http://localhost:3200` ในเบราว์เซอร์ ผู้ใช้ `admin`
3. รหัสผ่านอ่านบนเครื่อง demo เท่านั้น: `sudo cat /opt/gacp-logging/secrets/grafana-admin-password`
4. เมนู Dashboards → GACP → **GACP demo logs** หรือเมนู Explore → datasource **Loki**

## ป้ายที่ใช้ค้น

| ป้าย | ค่า |
|---|---|
| `host` | `demo` เสมอ |
| `container` | ชื่อ container เช่น `gacp-backend-demo`, `gacp-frontend-demo`, `gacp-nginx`, `gacp-minio`, `gacp-redis` |
| `service` | ชื่อ service ใน compose เช่น `backend-demo` |
| `level` | ระดับของ winston (`info`, `warn`, `error`) มีเฉพาะบรรทัดของ backend |
| `stream` | `stdout` หรือ `stderr` |

## ตัวอย่าง LogQL

การอัปโหลดไฟล์ในช่วงเวลาที่เลือก (ตั้งช่วงเวลาที่มุมขวาบน):

```logql
{host="demo", container="gacp-backend-demo"} |~ "\"(POST|PUT) /api/[^ \"]*(draft-documents|/car/files|/photo|/upload|/evidence|/avatar)"
```

จำนวนการอัปโหลดต่อชั่วโมง:

```logql
sum(count_over_time({host="demo", container="gacp-backend-demo"} |~ "\"(POST|PUT) /api/[^ \"]*(draft-documents|/car/files|/photo|/upload|/evidence|/avatar)" [1h]))
```

warn และ error แยกตาม container:

```logql
sum by (container, level) (count_over_time({host="demo", level=~"warn|error"} [5m]))
```

บรรทัดที่มีคำว่า error จากทุก container (รวม container ที่ไม่มีป้าย `level`):

```logql
sum by (container) (count_over_time({host="demo"} |~ "(?i)error" [5m]))
```

ค้นเลขคำขอหนึ่งเลขใน backend:

```logql
{host="demo", container="gacp-backend-demo"} |= "<เลขคำขอ>"
```

ใช้ `logcli` ผ่าน tunnel เดียวกันได้ที่ `LOKI_ADDR=http://localhost:3100`

## ข้อมูลส่วนบุคคล

บรรทัด access log ของ backend มี IP ของผู้ใช้ และบรรทัดอัปโหลดมีชื่อไฟล์
ระบบนี้ไม่ได้เพิ่มเนื้อหาใหม่ลงใน log มันเก็บสิ่งที่ container พิมพ์อยู่แล้วให้อยู่นานขึ้น
ตัวควบคุมตาม PDPA คือระยะเก็บ: `retention_period` ใน `loki/loki.yml` (ตอนนี้ 720h = 30 วัน)
ลดระยะเก็บ: แก้ค่านั้นใน commit แล้วรัน `demo-logging-install.sh --apply` ใหม่
ล้างทั้งหมดทันที: `demo-logging-install.sh --rollback --purge`

## ข้อจำกัดที่ยอมรับ

- Promtail ต่อ `/var/run/docker.sock` แบบ `:ro` ซึ่งไม่จำกัด Docker API จึงมีสิทธิ์เท่า root บนเครื่อง เป็นทางเดียวที่ได้ชื่อ container ติดมากับ log อิมเมจตรึงรุ่นและไม่มีพอร์ตเปิด
- Loki บน 127.0.0.1:3100 ไม่มี auth ใครที่เข้าเครื่อง demo ได้อ่าน log 30 วันได้ container ของแอปเข้า loopback ของเครื่องไม่ได้
- network ใหม่ `gacp-logging-network` ทำให้ dockerd เพิ่ม interface `br-…` เข้า zone `docker` ของ firewalld ตอนรัน (ตัวติดตั้งไม่ได้แก้ firewalld เอง)

## ติดตั้ง ถอด และตรวจ

```bash
~/work/state/infra/demo-logging-install.sh                      # dry run อ่านอย่างเดียว
~/work/state/infra/demo-logging-install.sh --apply              # ติดตั้งหรือปรับให้ตรง commit
~/work/state/infra/demo-logging-install.sh --rollback           # ถอด 3 container เก็บข้อมูลไว้
~/work/state/infra/demo-logging-install.sh --rollback --purge   # ถอดและลบข้อมูล log กับรหัสผ่าน
```

ตัวติดตั้งปฏิเสธเมื่อไม่ใช่เครื่อง demo (ตรวจ machine-id และ IP) และปฏิเสธเมื่อแอปไม่ healthy ก่อนเริ่ม
ถ้าแอปไม่ healthy หลังเริ่ม stack log มันถอด stack log ออกเองและจบด้วย exit 1

# เก็บ log กลางของเครื่อง demo (119.59.105.140)

path ในโฟลเดอร์นี้ตรงกับ path บนเครื่อง: `deploy/logging/demo-host/opt/gacp-logging/<path>` คือ `/opt/gacp-logging/<path>` บนเครื่อง demo

| ไฟล์ในรีโป | ใช้ทำอะไร |
|---|---|
| `opt/gacp-logging/docker-compose.yml` | compose project `gacp-logging` แยกจาก `gacp-platform` ของแอป: `gacp-loki`, `gacp-promtail`, `gacp-grafana` |
| `opt/gacp-logging/loki/loki.yml` | Loki 2.9.6 เก็บ 30 วัน (`retention_period: 720h`) แล้วลบเอง |
| `opt/gacp-logging/promtail/promtail.yml` | อ่าน stdout/stderr ของทุก container ที่ชื่อขึ้นต้น `gacp-` ผ่าน Docker API ติดป้าย `container`, `service`, `level` |
| `opt/gacp-logging/grafana/provisioning/` | datasource Loki (uid `gacp-demo-loki`) และ dashboard `GACP demo logs` |
| `demo-logging-install.sh` | ตัวติดตั้ง รันจากเครื่องทำงาน: dry run (ค่าเริ่มต้น), `--apply`, `--rollback`, `--rollback --purge` |

ไม่อยู่ใน git: รหัสผ่าน admin ของ Grafana ที่ `/opt/gacp-logging/secrets/grafana-admin-password`
ตัวติดตั้งสร้างบนเครื่อง demo เอง (root:root 0640) และไม่พิมพ์ออกมา

ตัวติดตั้งเอาไฟล์จาก git ref (`REF`, ค่าเริ่มต้น `origin/chore/demo-central-logging`; หลัง merge ใช้ `REF=origin/main`)
ไม่ใช่จาก working tree ไฟล์บนเครื่องจึงตรงกับ commit ที่พิมพ์ในบรรทัด `files:` เสมอ

วิธีเปิดดูและตัวอย่าง LogQL: `docs/operations/demo-central-logging.md`

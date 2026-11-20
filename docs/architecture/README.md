# สถาปัตยกรรมระบบ GACP

ตรวจกับโค้ดที่ commit: `99544573c`

เอกสารนี้อธิบายเฉพาะสิ่งที่ระบบทำอยู่จริง ณ commit ข้างบน ของที่ยังไม่มีเขียนว่ายังไม่มี ไม่เขียนเป็นแผน
ตารางและแผนภาพทุกชิ้นตรวจซ้ำได้ด้วยคำสั่งเดียวที่ราก repo

```
node scripts/docs/check-architecture.js
```

สคริปต์นี้อ่านโค้ดแล้วเทียบกับเอกสาร ถ้าโค้ดเปลี่ยนแต่เอกสารไม่ตาม สคริปต์จะบอกว่าขาดหรือเกินตรงไหน และ `scripts/ci/local-gate.sh` กับ `scripts/ci/full-gate.sh` จะแดง
`scripts/ci/full-gate.sh` รันด้วย `--scope repo` จึงตรวจเฉพาะส่วนที่ตัดสินได้จาก repo อย่างเดียว ส่วนการเทียบกับบันทึกจากเครื่องจริง (K1a และ K8a) ขึ้นบรรทัด SKIP-SCOPE แล้วไปตรวจตอนรัน `scripts/ci/local-gate.sh` โหมดปกติและใน deploy walk เพราะบันทึกเปลี่ยนได้หลัง deploy เท่านั้น และ deploy ต้องผ่าน gate ก่อน ตัวอย่างเช่น ถ้าบันทึกบอกว่า ThaID เปิดอยู่เครื่องเดียว gate จะผ่าน แล้วไปแดงที่ local-gate และ walk
แผนภาพ Mermaid (ภาษาวาดแผนภาพที่ GitHub แสดงผลได้) อยู่ใน `docs/architecture/diagrams/` สร้างจากโค้ดด้วย `node scripts/docs/generate-architecture-diagrams.js` ห้ามแก้ด้วยมือ

ขอบเขตของตัวตรวจ
- K6 (data dictionary ตรงกับโค้ด) ต้องมี `@prisma/client` ที่ generate แล้ว เครื่องที่ยังไม่ได้ `pnpm install` และ `prisma generate` จะเห็น K6 เป็น SKIP และไม่ทำให้ผลรวมแดง ตั้ง `ARCH_REQUIRE_K6=1` เพื่อบังคับให้ K6 ต้องรันได้ `scripts/ci/local-gate.sh` ตั้งค่านี้เองเมื่อรันด้วย `LOCAL_GATE_FULL=1` และ `--write-evidence` บังคับเสมอ ผลรันที่บันทึกเป็นหลักฐานจึงผ่าน K6 จริงทุกครั้ง
- K5 อ่านทุก `.use(...)` ที่มีสองอาร์กิวเมนต์ขึ้นไปใน `apps/backend/routes/api/index.js` ถ้า path ไม่ใช่ข้อความตายตัว หรือไม่รู้ว่าแขวน route group ใด K5 แดงพร้อมเลขบรรทัด ไม่ข้ามเงียบ
- K8a ตรวจสถานะได้เฉพาะแถว `auth:` จากคำตอบของประตูสาธารณะที่บันทึกไว้ ถ้าเครื่องเปลี่ยนค่าหลังวันบันทึก ต้องรัน `scripts/docs/snapshot-idp.sh` ใหม่ ตัวตรวจไม่เรียกเครือข่ายเอง สถานะแถว `payment:` ยังเป็นบันทึกของทีม
- K1 ใน `--scope repo` ตรวจแค่ว่ามีตาราง container และแผนภาพการติดตั้งตรงกับบันทึกที่ commit ไว้ ยังไม่มีส่วนไหนตรวจว่า service ใหม่ใน compose มีแถวในเอกสาร
- K1a ตรวจตาราง container กับผล `docker ps` ที่บันทึกไว้ และตรวจว่า service ใน `docker-compose.staging.yml` หรือ `docker-compose.demo.yml` อยู่ในบันทึก ไม่ได้อ่าน `docker-compose.production.yml` และไม่ได้ต่อเครื่องจริงตอนรัน

ศัพท์ที่ใช้บ่อย
- backend คือโปรแกรมฝั่งเซิร์ฟเวอร์ที่รับคำขอผ่าน API (ช่องทางให้โปรแกรมอื่นเรียกใช้) และเขียนฐานข้อมูล
- web-app คือหน้าเว็บที่ผู้ใช้เปิดในเบราว์เซอร์
- container คือกล่องที่บรรจุโปรแกรมหนึ่งตัวพร้อมของที่มันต้องใช้ รันบนเครื่องด้วย Docker
- compose คือไฟล์ที่บอกว่าเครื่องหนึ่งรัน container อะไรบ้าง
- migration คือสคริปต์เปลี่ยนโครงสร้างฐานข้อมูลที่รันตามลำดับ

## 1. บริบทและผู้เกี่ยวข้อง

ระบบรับคำขอรับรองมาตรฐาน GACP (การปฏิบัติทางการเกษตรและการเก็บเกี่ยวที่ดีสำหรับพืชสมุนไพร) ของพืช 6 ชนิดที่ประกาศใน `apps/backend/config/plant-species-slugs.js` คือ กัญชา กระท่อม ขมิ้นชัน ขิง ไพล และกระชายดำ ทั้งที่เป็นสมุนไพรควบคุมและไม่เป็น ผู้ยื่นยื่นคำขอและชำระค่าบริการผ่านระบบ เจ้าหน้าที่ฝั่งกรมตรวจเอกสาร นัดและตรวจพื้นที่ปลูก แล้วตัดสินออกใบรับรอง ผลผลิตจากแปลงที่ได้รับรองสืบย้อนต้นทางได้ด้วย QR

ผู้เกี่ยวข้อง
- ผู้ยื่นคำขอ (บทบาท `health`) ยืนยันตัวตนเองแล้วยื่นในนามผู้ถือใบรับรองจากทะเบียนผู้ถือ ผู้ถือมี 4 ประเภทตามคำสั่ง 134 คือ บุคคลธรรมดา บริษัท ห้างหุ้นส่วน และวิสาหกิจชุมชน (`apps/backend/shared/holder-registry.js`) บุคคลธรรมดาลงนามเอง ส่วนอีกสามประเภทมีผู้มีอำนาจลงนามแยกต่างหาก
- เจ้าหน้าที่ฝั่งกรม 6 บทบาท ได้แก่ ผู้ตรวจเอกสาร ผู้จัดคิว ผู้ตรวจพื้นที่ ผู้อนุมัติใบรับรอง การเงินฝั่งกรม และผู้ดูแลระบบฝั่งกรม
- ฝั่งบริษัทผู้ให้บริการแพลตฟอร์ม 2 บทบาท ได้แก่ การเงินฝั่งบริษัท และผู้ดูแลแพลตฟอร์ม
- ระบบอัตโนมัติ (บทบาท `system`) คืองานตั้งเวลาและ webhook (ช่องทางที่ระบบภายนอกเรียกกลับมาแจ้งผล) ไม่ใช่คน
- ผู้ซื้อหรือประชาชนที่สแกน QR หรือกรอกเลขใบรับรองในหน้าตรวจสอบสาธารณะ ไม่ต้องเข้าสู่ระบบ
- ระบบภายนอก ได้แก่ ผู้ให้บริการรับชำระ PromptPay, ThaiD และหมอพร้อม (สถานะในส่วนที่ 8), บริการติดตามข้อผิดพลาด (ส่วนที่ 9) และระบบคู่ค้าที่เรียกเข้ามาด้วย partner API key ผ่าน `/api/interoperability` (`apps/backend/middleware/partner-api-key.js`)

แผนภาพบริบท (C4 ชั้นที่ 1 คือภาพระบบทั้งก้อนกับคนและระบบรอบตัว): [diagrams/context.md](diagrams/context.md)

## 2. ส่วนประกอบและการติดตั้ง

### 2.1 สภาพแวดล้อม

ระบบมีสองสภาพแวดล้อม แยกเครื่องกัน
- staging ใช้ภายในทีม โดเมน `staging.gacpth.com`
- demo ใช้สาธิตกับลูกค้า โดเมน `demo.gacpth.com`
- โดเมนหลัก `gacpth.com` ไม่เปิดให้สาธารณะเข้า

ยังไม่มี production ระบบยังไม่เปิดให้บริการจริง ไม่มีเครื่องหรือฐานข้อมูลของ production ที่ใดเลย ผู้ให้บริการรับชำระทำงานในโหมดทดสอบ ไฟล์ `docker-compose.production.yml` ในชื่อมีคำว่า production แต่ที่จริงเป็นไฟล์ฐานที่ทั้งสองเครื่องใช้ร่วมกับไฟล์ของสภาพแวดล้อมตัวเอง

ทางเข้าของทั้งสองโดเมนผ่าน CDN และไฟร์วอลล์หน้าบ้าน ที่เข้ารหัสต่อถึงเครื่องด้วยใบรับรองต้นทาง (origin certificate) ในโหมดตรวจใบรับรองเต็ม จากนั้น nginx บนตัวเครื่อง (ไม่ใช่ใน container) รับพอร์ต 80/443 แล้วส่งต่อตามโดเมนไปยัง container ที่ผูกไว้กับพอร์ตภายในเครื่องเท่านั้น ไฟล์ตั้งค่าของ nginx บนเครื่องอยู่ที่ `deploy/nginx/`

ฐานข้อมูลเป็น Postgres แบบบริการ (ผู้ให้บริการดูแลเครื่องฐานข้อมูลให้) แยกโปรเจกต์ระหว่าง staging กับ demo ไม่มีฐานข้อมูลรันใน container บนเครื่องใดเลย เลขเวอร์ชันของ Postgres แบบบริการไม่ได้อยู่ในโค้ด เอกสารนี้จึงไม่ระบุ

### 2.2 container ที่รันจริง

ตารางนี้ตรงกับผล `docker ps` ที่บันทึกไว้ใน `evidence/architecture/hosts/staging.txt` และ `evidence/architecture/hosts/demo.txt` (บันทึกใหม่ด้วย `scripts/docs/snapshot-hosts.sh` อ่านแค่ชื่อและ image ไม่อ่านค่า env) ทั้งสองเครื่องใช้ `docker-compose.production.yml` คู่กับ `docker-compose.staging.yml` หรือ `docker-compose.demo.yml`

<!-- arch:containers -->
| เครื่อง | service ใน compose | หน้าที่ |
|---|---|---|
| staging | `backend-staging` | backend ของ staging |
| staging | `frontend-staging` | web-app ของ staging |
| staging | `nginx` | nginx ใน container ส่งต่อคำขอภายในเครือข่าย container |
| staging | `redis` | Redis เก็บคิวงานเบื้องหลัง แคช และตัวนับ rate limit |
| staging | `minio` | MinIO ที่เก็บไฟล์แบบ S3 (staging ตั้ง `STORAGE_PROVIDER=local` จึงเก็บไฟล์ใน volume ของเครื่องแทน) |
| staging | `prometheus` | เก็บตัวเลขการทำงาน (metrics) |
| staging | `grafana` | หน้าจอดูกราฟ metrics และ log |
| staging | `loki` | เก็บ log |
| staging | `promtail` | ส่ง log ของ container เข้า loki |
| staging | `cadvisor` | วัดการใช้ทรัพยากรของแต่ละ container |
| staging | `node-exporter` | วัดทรัพยากรของตัวเครื่อง |
| staging | `pgadmin` | หน้าจอจัดการฐานข้อมูล ประกาศไว้ใต้ profile `legacy-db` แต่ยังรันอยู่บนเครื่อง staging |
| demo | `backend-demo` | backend ของ demo |
| demo | `frontend-demo` | web-app ของ demo |
| demo | `nginx` | nginx ใน container |
| demo | `redis` | Redis ของ demo |
| demo | `minio` | MinIO ของ demo |
<!-- /arch:containers -->

บันทึก `docker ps` ของ staging มาจากเครื่องเดิมเมื่อ 2026-10-08 ก่อนย้ายเป็น slot บนเครื่อง demo ตาม `docs/operations/runbooks/staging-on-demo-host.md` ซึ่งสถานะในไฟล์ยังเป็น PENDING
บันทึกของ demo อ่านเฉพาะ project `gacp-platform` จึงไม่เห็น grafana loki และ promtail ที่รันใน project `gacp-logging` ตามผลสำรวจใน `docs/operations/demo-host-survey-2026-11.md`
บนเครื่อง staging ยังมี container ที่ไม่ใช่ส่วนของระบบ คือ registry ชั่วคราวสำหรับส่ง image ไปเครื่อง demo และฐานข้อมูลทดลองของงานทดสอบ จึงไม่อยู่ในตาราง

แผนภาพการติดตั้ง: [diagrams/deployment.md](diagrams/deployment.md)

### 2.3 ขั้นตอน deploy ในปัจจุบัน

ไม่มี CI แบบโฮสต์ภายนอก (operator ตัดสินไม่ใช้) การ deploy ทำด้วยคนตามคำสั่ง operator เท่านั้น
1. build image ของ backend และ web-app จาก commit ที่จะส่ง บนเครื่อง staging ติดป้าย `local-<sha>` (`docs/operations/runbooks/build-images-on-the-box.md`)
2. รัน `prisma migrate deploy` กับฐานข้อมูลของสภาพแวดล้อมนั้นก่อนสลับ container (`scripts/deploy/deploy-staging.sh` ขั้นที่ 4)
3. สร้าง container ของ backend และ web-app ใหม่ด้วย image ใหม่ สำหรับ demo ส่ง image ข้ามเครื่องผ่าน registry ชั่วคราว
4. ถ้ารอบนั้นมีข้อมูลตั้งต้นใหม่ เช่น กฎเอกสารของสมุนไพร 6 ชนิด รันสคริปต์ seed เป็นขั้นตอนหนึ่งของการ deploy (`apps/backend/scripts/seed-herb-requirement-rules.js` ค่าเริ่มต้นเป็น dry run ต้องใส่ `--apply`)
5. ฐานข้อมูลสมุนไพร 6 ชนิด (ต้นแบบที่ 5) มี seed ของตัวเอง แยกจากกฎเอกสาร รัน `docker exec -w /app/apps/backend <backend-container> node prisma/seed-herbs.js` ดูจำนวนก่อน แล้วรันซ้ำด้วย `--apply` รันซ้ำได้ไม่ซ้ำแถว ตรวจหลังรันด้วย `curl -s https://<host>/api/herbs/coverage` ต้องได้ `totalHerbs: 6` และ `totalCited` เท่ากับจำนวนรายการใน `apps/backend/scripts/herb-content/cited/entries.json`

## 3. โครงสร้างโค้ด

repo เป็น monorepo (หลายแอปใน repo เดียว) จัดการด้วย pnpm

### 3.1 backend (`apps/backend`)

Express บน Node.js ชั้นของโค้ด
- `apps/backend/server.js` ตั้ง middleware กลาง (helmet, rate limit, cookie, CSRF) แล้วแขวน API ทั้งหมดไว้ที่ `/api` และ `/api/v1` (ชื่อเดียวกัน ชี้ชุดเดียวกัน)
- `apps/backend/routes/api/index.js` รวม route group ทั้งหมด ตารางข้างล่าง
- `apps/backend/modules/` รวมบริการตามโดเมน 7 ชุด (application, audit, billing, certificate, document, identity, public)
- `apps/backend/services/` ตรรกะธุรกิจ เช่น วงจรสถานะคำขอ การเงิน ใบรับรอง
- `apps/backend/jobs/` งานตั้งเวลา (`apps/backend/jobs/scheduler.js` ใช้ node-cron) และงานในคิว (`apps/backend/services/queue-service.js` ใช้ bull บน Redis) เช่น ปิดคำขอที่เลยกำหนดแก้ไข เตือนและปิดคำขอที่ไม่ชำระ ตรวจเอกสารล่วงหน้า และงานเก็บรักษาข้อมูลตาม PDPA
- `apps/backend/shared/` ไฟล์คำศัพท์กลางที่ทุกส่วนต้องอ้าง เช่น `apps/backend/shared/canonical-rbac.js` (บทบาทและสิทธิ์), `apps/backend/shared/checkout-status.js` (สถานะคำสั่งชำระ), `apps/backend/shared/refund-kinds.js`, `apps/backend/shared/certification-decision-reasons.js`, `apps/backend/shared/application-closure-reasons.js`, `apps/backend/shared/certification-purposes.js`
- `apps/backend/prisma/schema/` โครงสร้างฐานข้อมูล ส่วนที่ 4

route group คือโฟลเดอร์ใต้ `apps/backend/routes/api` แต่ละแถวบอก path ที่แขวนจริงใน `index.js`

<!-- arch:route-groups -->
| โฟลเดอร์ | path ที่แขวน | หน้าที่ |
|---|---|---|
| `admin` | `/api/admin` | หน้าจอผู้ดูแล ผู้ใช้ สิทธิ์รายคน วันหยุดพิเศษ กฎเอกสาร |
| `applications` | `/api/applications` `/api/applications/config` `/api/applications/calculations` `/api/applications/journey` `/api/applications/renewals` `/api/applications/:applicationId/quotations` `/api/calculations` `/api/criteria` `/api/cultivation-config` | คำขอ ร่าง ยื่น ถอน ต่ออายุ ใบเสนอราคา และ path เดิมสามตัวที่ยังแขวนไว้ |
| `audit` | `/api/audits` `/api/audits/reassign` `/api/audits/post` `/api/audits/fraud` `/api/audits/site-analysis` `/api/audit` `/api/audit/scheduling` `/api/audit/onsite` `/api/post-audit` `/api/fraud-detection` `/api/site-analyses` `/api/image-assessment` | นัดตรวจ ตรวจพื้นที่ บันทึกผล ข้อบกพร่อง และต้นแบบประเมินภาพ |
| `auth` | `/api/auth/health` `/api/auth/provider` `/api/auth/idp` `/api/public` | เข้าสู่ระบบของผู้ยื่นและเจ้าหน้าที่ ทางเข้าผ่านผู้ให้บริการตัวตน และหน้าตรวจสอบสาธารณะ |
| `certificates` | `/api/certificates` `/api/standards` `/api/certificate-validity` | ใบรับรอง มาตรฐาน และอายุใบรับรองแบบมีวันที่กำกับ |
| `cultivation` | `/api/plants` `/api/harvest-batches` `/api/planting-cycles` `/api/cultivation-logs` `/api/farms` `/api/water-sources` `/api/seed-sources` `/api/fertilizer-records` `/api/controlled-environments` `/api/plots` | ฟาร์ม แปลง รอบปลูก บันทึกการปลูก และการเก็บเกี่ยว |
| `datasets` | `/api/datasets` | ส่งออกชุดข้อมูลดิบแบบรหัสแฝงเข้าคลังข้อมูลวิจัยของโครงการ |
| `documents` | `/api/documents` `/api/templates` `/api/report-submissions` `/api/reports` `/api/training-records` `/api/sop-documents` | เอกสารแนบ แม่แบบ รายงาน และ SOP |
| `entities` | `/api/entities` | ผู้ถือใบรับรอง (4 ประเภท) และสมาชิก |
| `files` | `/api/files` | ลิงก์ดาวน์โหลดไฟล์ส่วนตัวแบบลงลายมือชื่อ |
| `finance` | `/api/invoices` `/api/pricing` `/api/payments` `/api/finance` `/api/finance/tax-reports` `/api/finance/wht` `/api/finance/reports` `/api/finance/credit-notes` `/api/finance/debit-notes` `/api/finance/refunds` | ใบแจ้งหนี้ การชำระ ราคา ใบลดหนี้ ใบเพิ่มหนี้ การบันทึกคืนเงิน ภาษี และรายงานการเงิน |
| `helpers` | ไม่มี path ของตัวเอง | โมดูลช่วยที่ route group อื่นเรียกใช้ |
| `herbs` | `/api/herbs` | ฐานข้อมูลสมุนไพร |
| `identity` | `/api/mfa` `/api/consent` | ปัจจัยที่สอง (TOTP) และความยินยอม |
| `integration` | `/api/interoperability` `/api/consumer-feedback` | การเชื่อมกับระบบคู่ค้าและความเห็นผู้บริโภค |
| `interoperability` | ไม่มี path ของตัวเอง | โมดูลช่วยของ `apps/backend/routes/api/integration/interoperability.js` |
| `pdpa` | `/api/pdpa/erasure` | คำขอลบข้อมูลตาม PDPA |
| `platform-admin` | `/api/platform-admin/organizations` | จัดการองค์กรข้ามองค์กร ของผู้ดูแลแพลตฟอร์ม |
| `preview` | `/api/preview` | หน้าทบทวนคำขอทั้งฉบับก่อนชำระ |
| `provider` | `/api/provider` | งานของเจ้าหน้าที่ เช่น คิวตรวจเอกสาร คิวนัดตรวจ การตัดสินใบรับรอง |
| `surveys` | `/api/surveys` | แบบสำรวจวิจัย |
| `system` | `/api/notifications` `/api/tickets` `/api/config` `/api/system-config` `/api/dashboard` `/api/system` `/api/cron` `/api/sync` `/api/e2e` `/api/master-data` `/api/analytics` `/api/provider/directory` `/api/provider-cms` | แจ้งเตือนในระบบ ค่าตั้งระบบ แดชบอร์ด และงานระบบ (`/api/e2e` แขวนเฉพาะเมื่อไม่ใช่ `NODE_ENV=production` และ `/api/provider-cms` แขวนเฉพาะเมื่อตั้ง `ENABLE_PROVIDER_LEGACY_ALIAS=true`) |
| `trace` | `/api/trace` `/api/lots` | ล็อตผลผลิต QR และหน้าสแกนสาธารณะ |
| `webhooks` | `/api/webhooks` | รับ webhook ของผู้ให้บริการรับชำระ ตรวจลายเซ็นบนข้อมูลดิบก่อนเชื่อ |
<!-- /arch:route-groups -->

นอกจากโฟลเดอร์ ยังมี `/api/health` (`apps/backend/routes/api/health.js` และตัวตอบใน `apps/backend/routes/api/index.js`) สำหรับตรวจว่าระบบยังทำงาน `/api/metrics` (เฉพาะผู้ดูแล) `/api/version` และ `/api/dispatch-due` (`apps/backend/routes/api/dispatch-due.js`) ซึ่งเปิดสาธารณะ ตอบจำนวนวันทำการที่ผู้จัดคิวต้องมอบงานผู้ตรวจเอกสารหลังชำระงวดแรก ตามกฎที่มีวันที่กำกับซึ่งมีผลอยู่ (`apps/backend/services/dispatcher-rules.js`) หน้ายื่นคำขอสำเร็จแสดงตัวเลขจากคำตอบนี้

### 3.2 web-app (`apps/web-app`)

Next.js แบบ App Router (โฟลเดอร์คือ path ของหน้าเว็บ) แยกพอร์ทัลตามผู้ใช้
- `apps/web-app/src/app/health/` หน้าของผู้ยื่นคำขอ
- `apps/web-app/src/app/provider/` หน้าของเจ้าหน้าที่ทุกบทบาท แต่ละบทบาทเห็นเมนูของตัวเอง
- `apps/web-app/src/app/admin/` หน้าของผู้ดูแล
- `apps/web-app/src/app/verify/` หน้าตรวจสอบใบรับรองสาธารณะ
- `apps/web-app/src/app/trace/` หน้าสแกน QR ของล็อตผลผลิต
- `apps/web-app/src/app/(marketing)/`, `apps/web-app/src/app/(public)/` และ `apps/web-app/src/app/(auth)/` หน้าแนะนำ หน้าสาธารณะ และหน้าเข้าสู่ระบบ

### 3.3 mobile (`apps/mobile-app`)

แอป Flutter แช่แข็งไว้จนหลัง pilot ไม่มีการพัฒนาต่อ ผู้ใช้มือถือใช้ web-app ผ่านเบราว์เซอร์

### 3.4 เวอร์ชันซอฟต์แวร์หลัก

<!-- arch:versions -->
| ซอฟต์แวร์ | เวอร์ชันที่ประกาศในโค้ด | ที่มา |
|---|---|---|
| `node (backend Dockerfile)` | `24` | `apps/backend/Dockerfile` |
| `node (web-app Dockerfile)` | `24` | `apps/web-app/Dockerfile` |
| `node (engines)` | `24.x` | `apps/backend/package.json` |
| `next` | `^15.5.28` | `apps/web-app/package.json` |
| `react` | `^18.3.1` | `apps/web-app/package.json` |
| `express` | `^4.22.1` | `apps/backend/package.json` |
| `prisma` | `^5.22.0` | `apps/backend/package.json` |
| `@prisma/client` | `^5.22.0` | `apps/backend/package.json` |
| `redis image` | `7-alpine` | `docker-compose.production.yml` |
| `datasource provider` | `postgresql` | `apps/backend/prisma/schema/_base.prisma` |
<!-- /arch:versions -->

## 4. ภาพรวมข้อมูล

ฐานข้อมูลใช้ Prisma (ตัวกลางระหว่างโค้ดกับฐานข้อมูล) โครงสร้างแยกไฟล์ไว้ใน `apps/backend/prisma/schema/` แต่ละ model คือตารางหนึ่งตาราง ตารางนี้จัดทุก model ลงกลุ่มโดเมนครั้งเดียว

<!-- arch:model-groups -->
| กลุ่ม | model |
|---|---|
| ผู้ใช้และตัวตน | `User` `UserConsent` `UserConsentEvent` `IdentityLink` `RoleGroup` `UserGroupMembership` `UserPermissionGrant` |
| องค์กรและผู้ถือใบรับรอง | `Organization` `Entity` `EntityMembership` `EntityMemberPermissionGrant` `EntityMembershipEvent` `EntityContextSwitch` |
| คำขอและเอกสาร | `Application` `ApplicationComment` `ApplicationDraft` `ApplicationBundle` `ApplicationDocument` `ApplicationDocumentReview` `Attachment` `CorrectionRound` `CorrectionSubmissionVersion` `DocumentPrecheck` `DocumentPrecheckFlag` `RequirementRule` `RevisionDeadline` `WaiverReopenRequest` |
| การตรวจและคิวงาน | `FarmAuditChecklistItem` `FarmAuditPhoto` `GpsVerificationLog` `AuditScopeResult` `PostAuditTask` `AuditChecklist` `SiteAnalysis` `WorkActivity` `StageActivityConfig` `SlaPolicy` `AssignmentLedgerEntry` |
| ใบรับรองและมาตรฐาน | `Certificate` `CertificateScope` `CertificateRevision` `CertificationStandard` `StandardRequirement` `SupplementaryCriterion` `CertificateValidityRule` `BlockedCertificateNumber` |
| การเงินและบัญชี | `Invoice` `InvoiceLineItem` `PaymentTransaction` `BankAccount` `JournalEntry` `JournalLine` `ReceiptSequence` `Quotation` `CreditNote` `DebitNote` `ManualJournalEntryDraft` `PeriodClose` `PurchaseInvoice` `CheckoutOrder` `StripeWebhookEvent` `PaymentReminderLog` `CheckoutDocument` |
| ฟาร์ม การปลูก และการสืบย้อน | `Farm` `Plot` `TrainingRecord` `WaterSource` `GrowingMedium` `SeedSource` `FertilizerRecord` `ControlledEnvironment` `PlantingCycle` `PlantingCyclePlot` `CareLog` `CultivationLog` `HarvestBatch` `DryingTemperature` `DryingHumidity` `DryingDarkRoom` `CuringProcess` `PackagingDetail` `DryingProcess` `BatchLabResult` `Lot` `TraceQrSecurity` `TraceQrScan` `ConsumerFeedback` `PlantSpecies` `PartnerAccessLog` `HerbSpecies` `HerbKnowledgeEntry` |
| แบบสำรวจและวิจัย | `SurveyTemplate` `SurveyQuestion` `SurveyResponse` `SurveyAnswer` `ExpertInterview` |
| ระบบ | `AuditLog` `Notification` `SystemConfig` `WizardStepConfig` `DocumentTemplate` `ReportSubmission` `SOPDocument` `ScopeOfWork` `MeetingRoom` `SpecialHoliday` `Ticket` `TicketMessage` |
<!-- /arch:model-groups -->

`EntityContextSwitch` ยังอยู่ใน schema หลังถอดโหมดสลับบริษัทออกจากหน้าจอแล้ว เอกสารนี้ไม่ได้ยืนยันว่าเก็บไว้เป็นประวัติโดยเจตนาหรือเป็นของค้าง

แผนภาพความสัมพันธ์ต่อกลุ่ม: [diagrams/data-model.md](diagrams/data-model.md)

ความหมายของแต่ละช่องในชุดข้อมูลที่ส่งออกเพื่อการวิจัยอยู่ใน `docs/data/data-dictionary.md` ซึ่งสร้างจากโค้ดด้วย `apps/backend/scripts/generate-data-dictionary.js` ไฟล์นั้นครอบเฉพาะชุดข้อมูลที่ส่งออก ไม่ใช่ทุกตาราง

## 5. วงจรคำขอ

สถานะของคำขอมี 19 ค่า ประกาศใน `WORKFLOW_STATES` เส้นที่เดินได้อยู่ใน `ALLOWED_TRANSITIONS` และบทบาทที่เดินแต่ละเส้นได้อยู่ใน `ROLE_TRANSITIONS` ทั้งสามอยู่ใน `apps/backend/services/workflow-transition-service.js` ป้ายบนจออยู่ใน `apps/web-app/src/lib/constants/workflow-states.ts`

<!-- arch:states -->
| สถานะ | ป้ายบนจอ | ความหมาย |
|---|---|---|
| `DRAFT` | ร่าง | ผู้ยื่นกำลังกรอก |
| `SUBMITTED` | ยื่นแล้ว | ยื่นแล้ว ระบบเลื่อนต่อเองทันที |
| `PENDING_DOC_FEE` | รอชำระงวดที่ 1 | ออกคำสั่งชำระงวดที่ 1 แล้ว |
| `DOC_FEE_PAID` | รอตรวจเอกสาร | ชำระงวดที่ 1 แล้ว หรือเป็นคำขอต่ออายุที่ไม่มีงวดนี้ รอผู้จัดคิวมอบงาน |
| `ASSIGNED_FOR_REVIEW` | อยู่ระหว่างตรวจสอบ | ผู้ตรวจเอกสารได้รับงานแล้ว |
| `REVISION_REQUESTED` | ขอแก้ไข | ผู้ตรวจเอกสารสั่งแก้ ผู้ยื่นมี 5 วันทำการต่อรอบ แก้ได้ไม่จำกัดรอบ |
| `DOC_APPROVED` | เอกสารอนุมัติ | เอกสารผ่าน ระบบออกคำสั่งชำระงวดที่ 2 ต่อเอง |
| `PENDING_AUDIT_FEE` | รอชำระค่าบริการ | รอชำระงวดที่ 2 |
| `AUDIT_FEE_PAID` | รอนัดวันตรวจแปลง | ชำระงวดที่ 2 แล้ว เข้าคิวผู้จัดคิวทันที |
| `AUDIT_CONFIRMED` | นัดตรวจแล้ว | ผู้จัดคิวนัดวันและผู้ตรวจพื้นที่แล้ว |
| `CAR_PENDING` | รอผู้สมัครแก้ไขข้อบกพร่อง | ผู้ตรวจพื้นที่พบข้อบกพร่อง (CAR คือคำขอให้แก้ไขข้อบกพร่อง) |
| `CAR_REVIEWING` | ตรวจการแก้ไขข้อบกพร่อง | ผู้ยื่นส่งหลักฐานแก้ไขแล้ว ผู้ตรวจพื้นที่คนเดิมพิจารณา |
| `AUDIT_PASSED` | ตรวจผ่าน | ผลตรวจพื้นที่ผ่าน รอผู้อนุมัติใบรับรอง |
| `AUDIT_NOT_PASSED` | ไม่ผ่านตรวจ รอตัดสิน | ผู้ตรวจพื้นที่บันทึกไม่ผ่านพร้อมข้อบกพร่อง ไม่ปิดคำขอ ผู้อนุมัติใบรับรองตัดสินว่าจะไม่ให้การรับรอง หรือให้แก้ไขข้อบกพร่อง |
| `APPROVED` | อนุมัติ | ผู้อนุมัติใบรับรองอนุมัติแล้ว |
| `CERTIFIED` | ออกใบรับรองแล้ว | ออกใบรับรองแล้ว สิ้นสุดวงจร |
| `REJECTED` | ไม่ได้รับการรับรอง | ผู้อนุมัติใบรับรองไม่ให้การรับรองพร้อมเหตุผล สิ้นสุดวงจร |
| `EXPIRED` | ยกเลิก (เลยกำหนด) | ปิดเพราะเลยกำหนดแก้ไขหรือไม่ชำระ เปิดต่อได้ทางอนุโลมทางเดียว |
| `CANCELLED` | ยกเลิก | ผู้ยื่นถอนก่อนเริ่มตรวจเอกสาร หรือบริษัท/กรมยกเลิกบริการ ปิดถาวร |
<!-- /arch:states -->

แผนภาพสถานะพร้อมบทบาทบนทุกเส้น: [diagrams/application-states.md](diagrams/application-states.md) ตารางรายเส้น สถานะที่ต้องมีเหตุผลประกอบ และสถานะที่ผู้ยื่นแก้ฟอร์มได้ อยู่ใน [workflow-state-machine.md](workflow-state-machine.md) ซึ่งสร้างจากโค้ดเช่นกัน

ข้อเท็จจริงสำคัญของวงจรนี้
- สถานะชำระเงิน (`PENDING_DOC_FEE` ไป `DOC_FEE_PAID` และ `PENDING_AUDIT_FEE` ไป `AUDIT_FEE_PAID`) เดินได้เฉพาะ `system` เมื่อ webhook ของผู้ให้บริการรับชำระผ่านการตรวจลายเซ็นแล้ว ไม่มีเจ้าหน้าที่คนใดอนุมัติการชำระ บทบาทการเงินทั้งสองฝั่งไม่ถือเส้นใดเลย
- ผู้ตรวจเอกสารมีแค่สองทาง คือให้ผ่านหรือสั่งแก้ ไม่มีปุ่มปฏิเสธ
- ผู้ตรวจพื้นที่ไม่ปิดคำขอ ผลไม่ผ่านต้องมีข้อบกพร่องและไปรอที่ `AUDIT_NOT_PASSED` เส้นเข้า `REJECTED` เป็นของผู้อนุมัติใบรับรองคนเดียว (คำสั่ง 56(2))
- ผู้อนุมัติใบรับรองต้องไม่ใช่ผู้ตรวจพื้นที่ของคำขอเดียวกัน เส้น `AUDIT_PASSED` ไป `APPROVED` และ `APPROVED` ไป `CERTIFIED` เป็นของผู้อนุมัติเท่านั้น
- `EXPIRED` และ `CANCELLED` แสดงบนจอว่า "ยกเลิก (เลยกำหนด)" และ "ยกเลิก" คำว่า "หมดอายุ" สงวนไว้ใช้กับใบรับรอง
- ป้ายไทยของสถานะชุดที่ API `GET /api/system/status-machine` ส่งออก (`apps/backend/shared/status-machine-contract.js`) ยังไม่ตรงกับป้ายบนจอในตารางนี้หลายสถานะ

วงจรใบรับรองแยกจากวงจรคำขอ ใบรับรองเก็บสถานะใน `Certificate.status` ค่าที่ใช้คือ `active` (ใช้ได้) `suspended` (พักใช้) `revoked` (เพิกถอน) `expired` (หมดอายุ) และ `renewed` (ต่ออายุแล้ว) การพักใช้และเพิกถอนเป็นของผู้อนุมัติใบรับรอง ต้องเลือกเหตุจากรายการตายตัวใน `apps/backend/shared/certification-decision-reasons.js`

## 6. บทบาทและสิทธิ์

บทบาทประกาศใน `CANONICAL_ROLES` และสังกัดใน `ROLE_AFFILIATION_BY_ROLE` ทั้งคู่อยู่ใน `apps/backend/shared/canonical-rbac.js` ป้ายบนจอปัจจุบันมาจาก `ROLE_LABELS_TH` ใน `apps/web-app/src/lib/role-utils.ts`

<!-- arch:roles -->
| บทบาท | ชื่อไทยตามมติ | ป้ายบนจอปัจจุบัน | สังกัด |
|---|---|---|---|
| `health` | ผู้ยื่นคำขอ | ผู้ยื่นคำขอ | `public` ผู้ขอรับรอง พิสูจน์ตัวตนเอง ไม่มีใครแต่งตั้ง |
| `document_reviewer` | ผู้ตรวจเอกสาร | ผู้ตรวจเอกสาร | `certification_body` กรม |
| `dispatcher` | ผู้จัดคิว | ผู้จัดคิว | `certification_body` กรม |
| `field_inspector` | ผู้ตรวจพื้นที่ | ผู้ตรวจพื้นที่ | `certification_body` กรม |
| `certificate_approver` | ผู้อนุมัติใบรับรอง | ผู้อนุมัติใบรับรอง | `certification_body` กรม |
| `finance_officer_dtam` | การเงินฝั่งกรม | บัญชี DTAM | `certification_body` กรม |
| `system_admin_dtam` | ผู้ดูแลระบบฝั่งกรม | ผู้ดูแลระบบ | `certification_body` กรม |
| `finance_officer_platform` | การเงินฝั่งบริษัท | บัญชี Platform | `platform_operator` บริษัทผู้ให้บริการ |
| `system_admin_platform` | ผู้ดูแลแพลตฟอร์ม | ผู้ดูแลแพลตฟอร์ม | `platform_operator` บริษัทผู้ให้บริการ |
| `system` | ระบบอัตโนมัติ | ไม่มีป้าย | `system` ไม่ใช่คน |
<!-- /arch:roles -->

ป้ายบนจอของ 3 บทบาทยังไม่ตรงกับชื่อไทยตามมติ ตารางนี้แสดงทั้งสองค่าเพื่อให้เห็นช่องว่างนั้น ได้แก่ `finance_officer_dtam` บนจอเป็น "บัญชี DTAM" มติคือ "การเงินฝั่งกรม" · `system_admin_dtam` บนจอเป็น "ผู้ดูแลระบบ" มติคือ "ผู้ดูแลระบบฝั่งกรม" · `finance_officer_platform` บนจอเป็น "บัญชี Platform" มติคือ "การเงินฝั่งบริษัท" ส่วน `system` ไม่มีป้ายบนจอเพราะไม่ใช่คน

ขอบเขต
- เจ้าหน้าที่ทุกบทบาทอ่านและทำงานได้เฉพาะในองค์กรของตัวเอง มีเพียง `system_admin_platform` ที่ข้ามองค์กรได้ ผ่านประตู `/api/platform-admin/organizations` ซึ่งเรียกฐานข้อมูลนอกขอบเขตองค์กรด้วย `withoutTenantScope()` (`apps/backend/services/tenant-context.js`)
- สมุดบัญชีของบริษัทเขียนได้เฉพาะการเงินฝั่งบริษัท อ่านได้โดยการเงินสองบทบาทและผู้ดูแลระบบฝั่งกรมในองค์กรของตัวเอง (`apps/backend/services/finance/company-books-access.js`) ไม่มีประตู API สำหรับบันทึกรายการปรับปรุงด้วยมือ ใบกำกับภาษีซื้อ หรือการปิดและเปิดงวด (ส่วนที่ 11.2) ผู้ดูแลแพลตฟอร์มไม่อ่านข้อมูลการเงิน (`apps/backend/shared/canonical-rbac.js`)
- ผู้ตรวจพื้นที่รับงานตรวจเอกสารไม่ได้ (`field_inspector` ไม่มีสิทธิ์ `APPLICATION_DOC_REVIEW`)
- การเงินทั้งสองฝั่งเห็นข้อมูลชุดเดียวกัน คือเฉพาะข้อมูลการเงินของคำขอ ไม่เห็นข้อมูลฟอร์ม อีเมล หรือเบอร์โทรของผู้ยื่น
- ผู้ตั้งบทบาทแยกสองฝั่งตามมติ ผู้ดูแลระบบฝั่งกรมตั้งได้เฉพาะบทบาทฝั่งกรม บทบาทฝั่งบริษัทตั้งโดยผู้ดูแลแพลตฟอร์มเท่านั้น สิ่งที่งานนี้ยืนยันในโค้ดได้คือประตูผู้ดูแล (`apps/backend/routes/api/admin/users.js`) ปฏิเสธการตั้ง `system_admin_platform` ส่วนด่านแยกฝั่งของบทบาทอื่นไม่ได้ตรวจในงานนี้

## 7. ความปลอดภัยและ PDPA

- การยืนยันตัวตนและ session ผู้ยื่นและเจ้าหน้าที่ใช้ JWT (ตั๋วลงลายมือชื่อที่บอกว่าเป็นใคร) คนละกุญแจ เก็บใน cookie แบบ httpOnly (สคริปต์ในหน้าเว็บอ่านไม่ได้) ตรวจที่ `apps/backend/middleware/auth-middleware.js` การเข้าสู่ระบบด้วยรหัสผ่านเป็นของชั่วคราว จะปิดเมื่อเปิดให้บริการจริง ปัจจัยที่สองมีอย่างเดียวคือ TOTP (`apps/backend/shared/second-factor.js`)
- CSRF (การหลอกให้เบราว์เซอร์ส่งคำขอแทนผู้ใช้) กันด้วย cookie คู่กับ header ที่ต้องตรงกัน (`apps/backend/middleware/csrf-middleware.js`)
- rate limit (จำกัดจำนวนคำขอต่อช่วงเวลา) ตั้งใน `apps/backend/server.js` แยกชุดสำหรับทั้งระบบ การเข้าสู่ระบบ การสมัคร การชำระ และ webhook
- สิทธิ์ตรวจฝั่งเซิร์ฟเวอร์ทุกประตู หน้าจอซ่อนปุ่มได้แต่ไม่ใช่ด่านจริง
- เลขบัตรประชาชนออกจากเซิร์ฟเวอร์ได้เฉพาะแบบปิดบางส่วน (ตัวแรกและ 4 ตัวท้าย) ผ่าน `maskThaiId()` ใน `apps/backend/utils/field-encryption.js` เลขหลังบัตร (laserCode) ไม่ออกจากเซิร์ฟเวอร์
- ข้อมูลอ่อนไหวเข้ารหัสระดับช่องด้วย AES-256-GCM (`apps/backend/shared/encryption.js`) และค้นหาด้วยค่า HMAC แทนค่าจริง กุญแจทั้งสองอยู่ใน env ไม่อยู่ในโค้ด
- ความยินยอมล่าสุดเก็บใน `UserConsent` ทุกการให้และถอนถูก trigger ในฐานข้อมูลคัดลอกเข้า `UserConsentEvent` ซึ่งฐานข้อมูลปฏิเสธการแก้และลบแถว คำขอลบข้อมูลตาม PDPA ผ่าน `/api/pdpa/erasure` ลบข้อมูลส่วนตัวแต่คงเอกสารภาษีและบัญชีไว้ตามระยะที่กฎหมายกำหนด และงานตั้งเวลา `apps/backend/jobs/pdpa-retention-job.js` จัดการข้อมูลที่ครบกำหนดเก็บ
- audit log (บันทึกว่าใครทำอะไรเมื่อไร) เขียนผ่านตัวเขียนเดียวที่ `apps/backend/middleware/audit-logger.js` แต่ไม่ใช่ middleware ที่ทำงานเอง แต่ละจุดต้องเรียกเอง แต่ละแถวผูก hash กับแถวก่อนหน้าเป็นสาย ช่วยให้ตรวจพบการแก้ย้อนหลังได้บางส่วน ฐานข้อมูลไม่มีด่านห้ามแก้หรือลบแถว (รายละเอียดใน `AUDIT_LEDGER.md` ข้อ L-011 และ L-039)
- ใบรับรองลงลายมือชื่อดิจิทัลด้วย RSA-SHA256 (`apps/backend/services/crypto/signature-service.js`) กุญแจอยู่ใน volume ของแต่ละเครื่อง ลายนิ้วมือกุญแจที่ใช้และที่ปลดแล้วกำหนดใน `apps/backend/config/signing-key-policy.js` หน้าตรวจสอบสาธารณะ (`apps/web-app/src/app/verify/`) รับเลขใบรับรองหรือสแกน QR แล้วแสดงผลภาษาชาวบ้าน
- ข้อมูลแบบสำรวจวิจัย คำตอบดิบเห็นได้เฉพาะ `system_admin_dtam` บทบาทอื่นเห็นสถิติรวม ผู้ตอบต้องยินยอมเพื่อการวิจัยก่อนตอบ (`apps/backend/shared/research-consent-notice.js`) การส่งออกเข้าคลังข้อมูลวิจัยของโครงการตัดรหัสผู้ตอบออกและแปลงรหัสฟาร์มและรอบปลูกเป็นรหัสแฝง

## 8. การเชื่อมต่อภายนอก

ทุกผู้ให้บริการตัวตนใน `apps/backend/config/auth-providers.js` และทุก adapter ใน `apps/backend/services/payment/` มีแถวในตารางนี้ สถานะมีสามคำ ใช้งาน คือเปิดใช้กับผู้ใช้บน staging และ demo · sandbox คือเชื่อมกับระบบทดสอบของผู้ให้บริการ · ยังไม่เปิด คือมีโค้ดแต่ไม่ได้เปิดใช้

<!-- arch:integrations -->
| ตัวเชื่อม | หน้าที่ | สถานะ | หมายเหตุ |
|---|---|---|---|
| `auth:local` | เข้าสู่ระบบด้วยรหัสผ่าน | ใช้งาน | ชั่วคราว ปิดเมื่อเปิดให้บริการจริง |
| `auth:thaid` | เข้าสู่ระบบด้วย ThaiD | ยังไม่เปิด | โค้ดพร้อม แต่ยังไม่ได้ตั้งค่าบนเครื่อง |
| `auth:healthid` | เข้าสู่ระบบด้วยหมอพร้อม (Health ID) ของผู้ยื่น | ยังไม่เปิด | ยิงระบบทดสอบของหมอพร้อมแล้วตอบตรงคู่มือ รอหนังสือราชการขอ credential |
| `auth:providerid` | เข้าสู่ระบบด้วยหมอพร้อม (Provider ID) ของเจ้าหน้าที่ | ยังไม่เปิด | รอ credential ชุดเดียวกับข้างบน |
| `payment:stripe-adapter.js` | รับชำระ PromptPay ผ่านผู้ให้บริการรับชำระ | sandbox | โหมดทดสอบ เป็นไฟล์เดียวที่เรียก SDK ของผู้ให้บริการ ไม่รับบัตร webhook ที่ตรวจลายเซ็นแล้วเป็นผู้ปิดยอด ผู้ให้บริการรายนี้เป็นของชั่วคราว สลับได้ด้วยการเปลี่ยน adapter |
| `payment:mock-payment-adapter.js` | ตัวรับชำระจำลองที่ไม่ออกเครือข่าย | ยังไม่เปิด | ใช้ในเทสต์และเครื่องนักพัฒนา เลือกด้วย `PAYMENT_ADAPTER=mock` |
<!-- /arch:integrations -->

สถานะของแถว `auth:` ตรวจกับคำตอบของประตูสาธารณะ `/api/auth/idp/providers` บน staging และ demo ที่บันทึกไว้ใน `evidence/architecture/idp/staging.txt` และ `evidence/architecture/idp/demo.txt` (บันทึกใหม่ด้วย `scripts/docs/snapshot-idp.sh`) เปิดทั้งสองเครื่องต้องเขียน ใช้งาน หรือ sandbox ปิดทั้งสองเครื่องต้องเขียน ยังไม่เปิด สถานะของแถว `payment:` มาจากบันทึกของทีม ไม่ได้อ่านค่า env บนเครื่องในงานนี้ (ห้ามพิมพ์ค่า env) ยกเว้นที่ระบุในส่วนที่ 9

ตัวเชื่อมอื่นที่ไม่ใช่ผู้ให้บริการภายนอก
- ตรวจเอกสารล่วงหน้าด้วย OCR (อ่านตัวอักษรจากภาพ) ทำในเครื่องด้วย tesseract.js ไม่ส่งไฟล์ออกนอกระบบ ผลเป็นคำเตือนให้เจ้าหน้าที่เท่านั้น ไม่กั้นวงจรคำขอ (`apps/backend/services/document-precheck/service.js`)
- แจ้งเตือนเป็นแบบในระบบเท่านั้น (`apps/backend/services/notification-fanout-service.js`) ไม่มีอีเมล SMS หรือ push จากระบบนี้
- ไฟล์แนบเก็บใน volume ของเครื่องหรือ MinIO ตาม `STORAGE_PROVIDER` (`apps/backend/services/storage-service.js`) staging ตั้งเป็น `local` ส่วน demo ไม่ได้ตั้งค่านี้ในไฟล์ `docker-compose.demo.yml` งานนี้ไม่ได้ยืนยันว่า demo ใช้แบบใด

ต้นแบบตามสัญญาที่มีในโค้ด แต่ละชิ้นมีเกณฑ์ส่งมอบของตัวเอง
- ตัววิเคราะห์มาตรฐาน GACP มีข้อกำหนดมาตรฐานใน `CertificationStandard` และ `StandardRequirement` เปิดผ่าน `/api/standards`
- ฐานข้อมูลสมุนไพร เปิดผ่าน `/api/herbs` ข้อมูลอยู่ใน `HerbSpecies` และ `HerbKnowledgeEntry`
- ระบบสำรวจความต้องการ เปิดผ่าน `/api/surveys`
- ตรวจและประเมินภาพ เปิดผ่าน `/api/image-assessment` เป็นคำแนะนำ ไม่ใช่ผลตัดสิน

## 9. การเฝ้าระวัง

- log ของ backend เขียนด้วย logger กลาง (`apps/backend/shared/logger.js`) ตัดข้อมูลส่วนตัวด้วย `apps/backend/shared/log-redact.js` log ของ container มีเพดานขนาดตาม `docs/operations/runbooks/docker-log-caps.md`
- บริการติดตามข้อผิดพลาดเปิดเมื่อตั้ง `SENTRY_DSN` ตรวจแล้วว่าทั้ง backend ของ staging และ demo ตั้งค่านี้ไว้ (ตรวจแค่ว่ามีหรือไม่มี ไม่พิมพ์ค่า)
- Prometheus, Grafana, Loki, Promtail, cAdvisor และ node-exporter รันเฉพาะบนเครื่อง staging ค่าตั้งอยู่ใน `monitoring/`
- ยังไม่มีการเก็บ metrics ของ backend ได้จริง เป้า `gacp-backend` ใน Prometheus ของ staging มีสถานะ down ขณะตรวจ
- ยังไม่มีกฎแจ้งเตือนที่โหลดใน Prometheus (รายการกฎว่าง) จึงยังไม่มีการแจ้งเตือนเมื่อ backend ล่มหรือ error 5xx สูง
- เครื่อง demo ไม่มีชุด Prometheus/Grafana/Loki มีเพียงบริการติดตามข้อผิดพลาดข้างบน

## 10. การสำรองข้อมูลและกู้คืน

- ฐานข้อมูลแบบบริการของทั้ง staging และ demo ถูก dump ทุกคืนเวลา 03:47 จากเครื่อง staging ผลล่าสุดสำเร็จทั้งสองฐาน ไฟล์เก็บบนเครื่อง staging สคริปต์ที่รันอยู่ (`supabase-backup.sh` ใต้ `/opt/gacp-platform/scripts/backup/`) มีอยู่บนเครื่องเท่านั้น ยังไม่อยู่ใน repo
- volume ของเครื่อง staging (ไฟล์แนบ ที่เก็บไฟล์ และกุญแจลงนามใบรับรอง) ถูกเก็บสำรองทุกคืนเวลา 03:17 ด้วย `scripts/ops/gacp-backup.sh` (สำเนาบนเครื่องตรงกับ repo)
- เครื่อง demo สำรอง volume ของตัวเอง (ไฟล์แนบ ที่เก็บไฟล์ MinIO และกุญแจลงนามใบรับรอง) ทุกคืนด้วยสคริปต์เดียวกัน จากตารางงานของผู้ใช้ deploy บนเครื่องนั้น ไฟล์เก็บใน `/opt/gacp-platform/backups/` ของเครื่อง demo และก่อน deploy บางรอบมีการ dump ฐานข้อมูลของ demo เก็บไว้บนเครื่อง demo ด้วย
- ยังไม่มีการคัดลอกไฟล์สำรองข้ามไปอีกเครื่อง ไฟล์สำรองของแต่ละเครื่องอยู่บนเครื่องนั้นเอง (ยังไม่มีงานคัดลอกข้ามเครื่องในตารางงานของทั้งสองเครื่อง)
- สคริปต์ใน `scripts/backup/` (`pg-backup.sh`, `backup-system.sh`, `install-cron.sh`) เป็นชุดเดิมสำหรับฐานข้อมูลใน container ซึ่งไม่ได้รันแล้ว
- การซ้อมกู้คืนที่มีหลักฐานล่าสุดคือ `evidence/restore-drill/2026-08-13.md` เป็นการกู้ฐานข้อมูลใน container ชุดเดิม ยังไม่เคยซ้อมกู้ไฟล์ dump ของฐานข้อมูลแบบบริการ
- ยังไม่มีขั้นตอนกู้คืนที่ใช้กับระบบปัจจุบัน `docs/operations/runbooks/backup-and-restore.md` ยังเขียนสำหรับฐานข้อมูลใน container ชุดเดิม (`gacp-postgres`) ไม่มีขั้นตอนกู้ dump ของฐานข้อมูลแบบบริการ

## 11. ภาคผนวก

### 11.1 ทะเบียน ADR

ADR (Architecture Decision Record) คือบันทึกการตัดสินใจเชิงสถาปัตยกรรม สถานะมีสามคำ ใช้อยู่ · ถูกแทน · ถอดแล้ว

<!-- arch:adrs -->
| ไฟล์ | เรื่อง | สถานะ | หมายเหตุ |
|---|---|---|---|
| `docs/adr/ADR-001-four-pillar-staff-structure.md` | โครงสร้างเจ้าหน้าที่สี่ฝ่าย | ถูกแทน | แทนด้วยบทบาทใน `apps/backend/shared/canonical-rbac.js` |
| `docs/adr/ADR-002-decouple-legacy-ui-branding-retain-identity-core.md` | แยกหน้าตาเดิม คงแกนตัวตน healthId/providerId | ใช้อยู่ | |
| `docs/adr/ADR-003-offline-first-indexeddb.md` | เก็บร่างคำขอในเบราว์เซอร์ | ใช้อยู่ | `apps/web-app/src/lib/indexeddb-storage.ts` |
| `docs/adr/ADR-004-optimistic-locking-offline-sync.md` | กันเขียนทับด้วยเลขเวอร์ชัน | ใช้อยู่ | ช่อง `version` ใน `Application` |
| `docs/adr/ADR-005-async-heavy-workloads-bullmq.md` | งานหนักทำในคิวเบื้องหลัง | ใช้อยู่ | bull บน Redis ใน `apps/backend/services/queue-service.js` |
| `docs/adr/ADR-006-geofenced-audit-anti-spoofing.md` | ตรวจพิกัดภาพถ่ายตรวจพื้นที่ | ใช้อยู่ | `GpsVerificationLog` |
| `docs/adr/ADR-007-auth-and-request-security-hardening.md` | เสริมความปลอดภัยการยืนยันตัวตนและคำขอ | ใช้อยู่ | |
| `docs/adr/ADR-008-preview-gate-enforcement-before-deploy.md` | ด่านตรวจของสภาพแวดล้อมก่อน deploy ชุดเดิม | ถอดแล้ว | สภาพแวดล้อมนั้นปลดแล้ว |
| `docs/adr/ADR-009-executable-security-conventions.md` | กฎความปลอดภัยที่ตรวจด้วยสคริปต์ | ใช้อยู่ | `scripts/ci/check-security-conventions.js` |
| `docs/adr/ADR-010-commit-scoped-quality-gates-for-schema-and-lint.md` | ด่าน schema และ lint ต่อ commit | ใช้อยู่ | `scripts/ci/check-prisma-migration-consistency.js` |
| `docs/adr/ADR-011-executable-legal-brand-banned-terms-guard.md` | ด่านคำต้องห้ามทางกฎหมายและแบรนด์ | ใช้อยู่ | ขั้นหนึ่งของ `scripts/ci/local-gate.sh` |
| `docs/adr/ADR-012-audit-log-canonical-write-path-and-phased-chain-verification.md` | ทางเขียน audit log ทางเดียว | ใช้อยู่ | `apps/backend/middleware/audit-logger.js` |
| `docs/adr/ADR-013-platform-neutral-production-strategy.md` | กลยุทธ์ production ที่ไม่ผูกผู้ให้บริการเครื่อง | ถูกแทน | ฐานเครื่องเดียวในนั้นไม่ใช่ความจริงแล้ว ปัจจุบันเป็นสองเครื่องตามส่วนที่ 2 |
| `docs/adr/ADR-014-multi-tenancy-foundation.md` | หลายองค์กรในฐานข้อมูลเดียวด้วย `organizationId` | ใช้อยู่ | |
| `docs/adr/ADR-014-phase-3-handoff.md` | บันทึกส่งต่อระยะที่ 3 ของ ADR-014 | ใช้อยู่ | บันทึกระหว่างทาง |
| `docs/adr/ADR-014-phase-e2-rls-decision.md` | คำถามเรื่องเปิดบังคับ RLS | ใช้อยู่ | RLS (การกั้นแถวในฐานข้อมูล) ยังเป็นโหมดเฝ้าดู การเปิดบังคับยังรอตัดสิน |
| `docs/adr/ADR-015-mobile-app-shelving.md` | พักแอปมือถือ | ใช้อยู่ | แช่แข็งจนหลัง pilot |
| `docs/adr/ADR-016-work-activity-tracking.md` | ติดตามงานแต่ละขั้น | ใช้อยู่ | `WorkActivity` |
| `docs/adr/ADR-017-deploy-pipeline-manual-gated.md` | deploy ด้วยคน ผ่าน workflow บนโฮสต์ภายนอก | ถูกแทน | ไม่ใช้ CI แบบโฮสต์ภายนอกแล้ว build image บนเครื่อง staging ตามส่วนที่ 2.3 |
<!-- /arch:adrs -->

### 11.2 ของที่ถอดออกแล้ว

ส่วนนี้บอกแค่ว่าถอดอะไร ไม่อธิบายการทำงานเดิม

- สภาพแวดล้อม preview ปลดแล้ว ไฟล์ `docker-compose.preview.yml` และ `deploy/nginx/preview.gacpth.com.conf` ยังค้างใน repo
- การตรวจสลิปโดยเจ้าหน้าที่ ถอดแล้ว การชำระปิดยอดด้วย webhook อย่างเดียว
- ช่องทางชำระผ่าน Ksher และ Omise ไม่มีแล้ว และไม่รับบัตรเครดิต
- การรับส่งเงินให้กรม (DTAM remittance) ในระบบ ถอดแล้ว กรมรับเงินนอกระบบ
- โหมดสลับ workspace ของบริษัท ถอดแล้ว
- การติดตามรายต้น (PlantUnit) ถอดแล้ว การสืบย้อนจบที่รอบปลูก แปลง และล็อต
- วัตถุประสงค์ MEDICAL ถอดแล้ว เหลือเฉพาะที่มีใบอนุญาต ภท.
- ปัจจัยที่สองทางอีเมล (email OTP) และการรีเซ็ตรหัสผ่านทางอีเมล ถอดแล้ว
- แพ็กเกจสมาชิกและด่าน PREMIUM ถอดแล้ว
- MongoDB ไม่มีในระบบแล้ว
- เครื่องเดียวบน DigitalOcean ไม่ใช่ที่ตั้งระบบแล้ว
- สถานะ `CANCEL_EXPIRED` เปลี่ยนชื่อเป็น `CANCELLED`
- Next.js 14 อัปเกรดเป็น 15 แล้ว
- Postgres ใน container ไม่ใช้แล้ว แต่ยังประกาศอยู่ใน `docker-compose.yml`, `docker-compose.local-prod.yml`, `docker-compose.qa.yml` และใน `docker-compose.production.yml` ใต้ profile `legacy-db`
- ประตู `/api/finance/manual-journal-entries` `/api/finance/purchase-invoices` และ `/api/finance/period-close` ถอดแล้ว ตาราง `ManualJournalEntryDraft` `PurchaseInvoice` และ `PeriodClose` ยังอยู่ใน schema
- `docker-compose.bluegreen.yml` ใช้ไม่ได้ (`docker compose config` ปฏิเสธไฟล์)

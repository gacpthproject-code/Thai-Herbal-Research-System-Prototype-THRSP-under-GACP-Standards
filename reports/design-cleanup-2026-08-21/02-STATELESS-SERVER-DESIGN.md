# 02 — Stateless Server Design: เซิร์ฟเวอร์ไม่ถือ state, ทุกอย่างที่ควรอยู่ Supabase ไป Supabase

วันที่: 2026-08-22 · สถานะ: **ร่างออกแบบ (design) — ยังไม่มีโค้ดเปลี่ยน** · branch: `fix/design-reproducibility`
ขอบเขต: backend `apps/backend` (Express + Prisma), `apps/web-app` (Next.js), compose ทุกไฟล์ที่ root
วิธีอ่าน: ทุกข้ออ้างเกี่ยวกับ repo นี้มี `file:line` ที่เปิดดูจริงในรอบนี้ (หรือระบุว่ามาจาก verifier lane) · ข้ออ้างเกี่ยวกับ Supabase/ผลิตภัณฑ์ภายนอกมีป้าย **verified-by-search** (พร้อมแหล่ง) หรือ **UNVERIFIED** เสมอ · ไม่มีหลักฐาน = เขียนว่าไม่ได้ตรวจ

---

## 1. สรุปสำหรับผู้ตัดสินใจ

- **ฐานข้อมูล (Postgres) ย้ายได้เลย และในทางปฏิบัติ "ย้ายไปแล้ว" บนเครื่อง dev**: แอปคุยกับ Postgres ธรรมดาผ่าน `DATABASE_URL` ตัวเดียว (`apps/backend/prisma/schema/_base.prisma:10-13`); `.env` ของเครื่อง dev ชี้ Supabase pooler `aws-1-ap-southeast-2` อยู่แล้ว (`apps/backend/.env:12`) แต่ compose ทุกไฟล์ยังชี้ container `@postgres:5432` (`docker-compose.production.yml:89`, `docker-compose.yml:49`, `docker-compose.staging.yml:73`, `docker-compose.local-prod.yml:54`) ⇒ **มี source of truth สองชุด** นี่คือ "wrong lookup" ที่ท่านพูดถึง
- **ไฟล์อัปโหลด (เอกสารเกษตรกร, สลิปโอนเงิน) ยังลง disk เครื่องเราเสมอ** ไม่ว่า `STORAGE_PROVIDER` จะตั้งอะไร (`apps/backend/services/storage-service.js:202-225` ใช้ `multer.diskStorage` ไม่มีสาขา cloud) · MinIO ได้รับเฉพาะ PDF ที่ระบบสร้างเอง ⇒ ย้ายไฟล์ = **แก้โค้ดทางเข้า** ไม่ใช่แค่เปลี่ยน env
- **Redis ไม่ใช่แค่ cache**: blocklist / MFA challenge / email OTP อยู่ใน Redis และ Supabase **ไม่มี managed Redis** (verified-by-search — verifier fetch `supabase.com/docs/guides/database/extensions/wrappers/redis`: wrapper เป็น read-only FDW) ⇒ ต้องย้ายส่วน auth ไป **ตาราง Postgres** (ซึ่งดีกว่าเดิม เพราะวันนี้มัน fail "open" โดยไม่ตั้งใจ — §4)
- **กุญแจเซ็นใบรับรอง (`apps/backend/keys/private.pem`) เป็นของชิ้นเดียวที่ย้ายด้วย bucket ไม่ได้**: ถ้า dir ว่าง ระบบสร้างคู่กุญแจใหม่แล้วไปต่อ (`apps/backend/services/crypto/signature-service.js:345-358` — `logger.warn` แล้ว `generateKeyPair()`) และใบรับรองเก่าทุกใบจะตรวจไม่ผ่าน · นี่คือ **การตัดสินใจข้อ 1** (§7)
- **ย้ายได้โดยใช้ของเดิมเป็นส่วนใหญ่**: `DATABASE_URL` เดิม, interface `uploadBuffer/getSignedDownloadUrl` เดิม, pattern `User.sessionsRevokedAt` เดิมเป็นแม่แบบตาราง auth — ของใหม่จริงคือ S3 client (MinIO SDK รับ endpoint ที่มี path ไม่ได้; `storage-service.js:52-65` ทิ้ง path), ตาราง auth 4-5 ตาราง, และ probe บังคับ
- **ต้องตัดสินใจ 3 ข้อ**: (1) กุญแจเซ็น: secret mount + เก็บ public key ลงแถวใบรับรอง, หรือ KMS จริง — อย่างน้อยต้องทำ public-key-on-row · (2) ไฟล์ระบุตัวตน (บัตรประชาชน, สลิป) ไป Supabase Storage **หรือ** object store ที่เราเลือก region เอง — กฎ residency ถูกยกเลิกถาวรแล้ว (`HARNESS_LOG.md:268-271`) แต่ยังเหลือ PDPA-processor hygiene · (3) region: Sydney (ปัจจุบัน) หรือ Singapore
- **เงื่อนไขบังคับก่อนย้าย production**: `ENABLE_PDPA_FIELD_ENCRYPTION` ต้องเป็น `true` (compose default `false` — `docker-compose.production.yml:157`, `docker-compose.staging.yml:122`; ถ้าไม่ใช่สตริง `true` จะเป็น no-op — `apps/backend/services/prisma-pdpa-extension.js:868-870`) และ `.dockerignore` ต้องกัน `**/.env`, `**/*.pem` (วันนี้กันแค่ `.env` ที่ root — `.dockerignore:10`, ไม่มี pattern `*.pem` ทั้งไฟล์ `:1-32`)
- **เงิน (L3) ไม่ถูกกระทบ**: idempotency ของ Stripe อยู่ที่ `idempotencyKey` + uniqueness ใน Postgres ไม่ใช่ Redis (verifier: `stripe-checkout-service.js:230,267`) — เขียนไว้ให้ reviewer Tier C ไม่ต้องพิสูจน์ซ้ำ
- **สิ่งที่ design นี้ไม่แก้**: PKI signing-key follow-up (bad-decrypt → hash-only) · รูปหลักฐาน onsite ถูกทิ้งหลัง hash (verifier: `audit-onsite-service.js:660-670`) — แต่เสนอให้ปิดช่องระหว่างย้าย · latency Sydney↔กรุงเทพ ที่ดัน tx timeout เป็น 30s อยู่แล้ว (verifier: `prisma-database.js:82-91`)

---

## 2. สภาพปัจจุบัน — inventory ของ state บนเซิร์ฟเวอร์

| # | state | อยู่ที่ (หลักฐาน) | ชนิด | กู้คืนได้? | สิ่งที่น่าตกใจ |
|---|---|---|---|---|---|
| 1 | Postgres container + volume `gacp-postgres-data` | `docker-compose.production.yml:290-325, 549-550` (verifier); dev `docker-compose.yml:9-27` | durable, authoritative เมื่อรันผ่าน compose | ได้จาก pg_dump (`scripts/ops/gacp-backup.sh:72-74`, verifier) | **compose ชี้ container, เครื่อง dev ชี้ Supabase** (`apps/backend/.env:12` vs `production.yml:89`) — dotenv ไม่ override ตัวแปรที่ตั้งแล้ว (verified-by-search: dotenv README "never modify any environment variables that have already been set") ⇒ ใน container ค่า compose ชนะ แต่ `.env` ที่ถูก COPY เข้า image ชนะสำหรับตัวแปรที่ compose **ไม่ได้** ตั้ง — ผิดเงียบ ๆ |
| 2 | Redis + volume `gacp-redis-data` (AOF, 96MB, `allkeys-lru`) | `docker-compose.production.yml:375` (เปิดรอบนี้); staging ใช้ container เดียวกัน db 1 (`docker-compose.staging.yml:75`) | durable-on-disk แต่ evict ได้ | auth keys กู้ไม่ได้ (ผู้ใช้ login ใหม่) | `allkeys-lru` evict key auth ได้ระหว่างใช้งาน · ไม่อยู่ใน backup list (verifier: `gacp-backup.sh:47`) |
| 3 | auth state ใน Redis: refresh allowlist, access/RT/family blocklist, MFA challenge, email OTP | `apps/backend/services/token-revocation-service.js:321-330` (เปิดรอบนี้), `:21-35` (verifier); `email-otp-service.js:65-73, 112-117` (verifier) | **authoritative, ไม่มีตาราง Postgres สำรอง** (verifier: ไม่มี model Session/RefreshToken/OTP ใน `prisma/schema/`) | ไม่ได้ | ดู §4 — "fail closed" ในโค้ดเป็น fail **open** จริง เพราะ `redis-service.js:80-93` ไม่เคย throw |
| 4 | Bull queue บน Redis | `apps/backend/services/queue-service.js:36-46` | infra | — | มีแค่ `sla-monitor` ที่ทำงานจริง: `jobs/pdf-processor.js` และ `webhook-dlq-processor.js` **ไม่มีไฟล์** (`ls apps/backend/jobs/` รอบนี้: 10 ไฟล์ ไม่มีทั้งสอง) ⇒ `pdfQueue=null` เสมอ (`queue-service.js:88-93`) PDF สร้าง inline อยู่แล้ว |
| 5 | uploads volume `gacp-uploads-data` → `/app/apps/backend/public/uploads` | `docker-compose.production.yml:196-206`; served ที่ `apps/backend/server.js:352` หลัง gate `gateSensitiveUploads, gateSlipObjectAccess` | durable, **กู้ไม่ได้** (เอกสารเกษตรกร, สลิป) | ไม่ได้ | **dev + local-prod ไม่มี volume เลย** (verifier: `docker-compose.yml:40-70`, `local-prod.yml:45-85` ไม่มี key `volumes:`) ⇒ หายทุกครั้งที่ recreate · `fileUrl` ถูกเก็บเป็น path ใน DB ไม่ได้ derive |
| 6 | upload path ที่เลี่ยง `createUploader`: post-audit, CAR | `apps/backend/routes/api/audit/post-audit.js:42-48` → `apps/backend/routes/storage/post-audit` (ไม่มี volume ใน compose ใด), `routes/api/applications/applications-car.js:44-47` → `public/uploads/car` | durable-ish | ไม่ได้ | post-audit ไม่มี static mount ที่ `/storage` (`server.js:352` mount แค่ `/uploads`) ⇒ URL dangling |
| 7 | signing keys volume `gacp-signing-keys` → `/app/apps/backend/keys` | `docker-compose.production.yml:206, 558`; โค้ด `signature-service.js:345-358` | **durable, irreplaceable** | ไม่ได้ — DB เก็บ `signature`+`signatureKeyId` แต่ไม่เก็บ public key (verifier: `certification.prisma:94-107`) | dir ว่าง = สร้างกุญแจใหม่แล้วไปต่อ · **bluegreen ไม่ mount กุญแจ** (`docker-compose.bluegreen.yml:82-84` มีแค่ uploads/storage) · `.dockerignore` ไม่กัน `*.pem` ⇒ image ที่ build จากเครื่อง dev ฝังกุญแจ dev (verifier: `Dockerfile:28, 96`) |
| 8 | `gacp_storage:/app/storage` | `docker-compose.production.yml:202`, `bluegreen.yml:84` | dead mount (น่าจะ) | — | ไม่มีโค้ดเขียน `/app/storage` (verifier ripgrep; backup script บันทึก 0 B) — **หลักฐานเป็น grep เดียว + ตัวเลขเก่า** จึงเป็นข้อสังเกต ไม่ใช่คำสั่งลบ (§5 ขั้น 11 ต้องวัดบนเครื่องจริงก่อน) |
| 9 | MinIO + volume `gacp-minio-data` | verifier: `production.yml:227-254, 560-561`; `STORAGE_PROVIDER=${STORAGE_PROVIDER:-minio}` (`:189` เปิดรอบนี้) | durable, regenerable (PDF render จาก DB) | ส่วนใหญ่ได้ | backend `depends_on: minio healthy` ต้องถอดพร้อมกัน |
| 10 | pgAdmin volume | verifier: `production.yml:333-365` | admin convenience | ได้ | admin surface บน public route + credential store |
| 11 | Prometheus/Grafana/Loki volumes, promtail positions ใน `/tmp` | verifier: `production.yml:403-431, 499-500` | disposable | ได้ | — |
| 12 | container logs json-file 20m×5, `./logs/nginx` bind | verifier: `production.yml:14-27, 52` | stream | — | ~1.2GB worst case ตามเลขในไฟล์เอง |
| 13 | TLS ที่ host nginx (`nginx/ssl`, gitignore `*.pem`) | verifier: `production.yml:47-51` | host state นอก repo | — | ไม่ไป Supabase ทุกกรณี |
| 14 | in-process: rate-limit Map fallback, `auditLogs[]` ที่ `GET /api/audit` อ่าน, keyCache | verifier: `rate-limiter.js:13-38`; `audit.js:24-25, 279` | ephemeral | — | `GET /api/audit` ไม่ได้อ่านตาราง audit จริง |
| 15 | `apps/backend/.env` ถูก COPY เข้า image | `.dockerignore:10` กันเฉพาะ root (เปิดรอบนี้); verifier: `Dockerfile:28, 96` COPY ทั้ง `apps/backend` | secret-leak vector | — | credential Supabase ของ dev อยู่ใน image ที่ build local |

---

## 3. สถาปัตยกรรมเป้าหมาย

### 3.1 เส้นแบ่ง

```
┌──────────────── เซิร์ฟเวอร์ (stateless เท่านั้น) ───────────────┐
│ nginx (config ro + TLS ของ host)                                 │
│ backend  (Node — ไม่มี volume ข้อมูล, เขียนได้เฉพาะ tmpfs)         │
│ web-app  (Next.js)                                               │
│ [process ไม่ใช่ data] Puppeteer render PDF, node-cron scheduler   │
│ ── mounted SECRET read-only (ไม่ใช่ data): ENCRYPTION_KEY,        │
│    signing key* + passphrase                                     │
└──────────────────────────────────────────────────────────────────┘
          │ DATABASE_URL (เดิม)        │ S3-compatible (client ใหม่)
          ▼                            ▼
┌─────────── Supabase ───────────┐  ┌──── Supabase Storage ────┐
│ Postgres: ทุกตารางเดิม          │  │ bucket private: uploads,  │
│ + ตาราง auth ใหม่แทน Redis      │  │   slips, certificates,    │
│ + pg_cron (ถ้าเปิดได้ — UNVERIFIED) │   pdfs, evidence          │
└────────────────────────────────┘  │ bucket public: lab-report │
                                    └───────────────────────────┘
   * signing key = การตัดสินใจข้อ 1 — ไม่มีบ้านใน Supabase
```

"ไม่มี state" ที่ทำได้จริง = **ไม่มี named volume ที่ถือข้อมูลธุรกิจ** · สิ่งที่ยังอยู่บนเครื่องคือ (ก) config/secret ที่ mount read-only (ข) log stream (ค) process ชั่วคราว

### 3.2 รายการย้าย — เชื่อมต่ออย่างไร (ใช้ทางเดิมก่อน)

| ย้าย | ไป | เชื่อมผ่าน (โค้ดเดิม) | ต้องแก้ |
|---|---|---|---|
| Postgres | Supabase Postgres | `DATABASE_URL` — `_base.prisma:10-13`; `prisma-database.js:74-77` ต่อ `connection_limit/pool_timeout` ให้เอง (verifier) | compose: `DATABASE_URL=${DATABASE_URL:?required}` (ไม่ default เป็น container) · ลบ `depends_on: postgres` · ถ้าจะใช้ transaction mode (6543) ต้องเพิ่ม `pgbouncer=true` + `directUrl` (verified-by-search: `supabase.com/docs/guides/database/prisma`) — **แนะนำคง session mode 5432** ที่ใช้อยู่เพื่อไม่แตะ schema |
| admin scripts | role `postgres` ของ Supabase | `scripts/lib/admin-db-url.js:4-8` `ADMIN_DATABASE_URL` (verifier) | ตั้ง env เพิ่ม 1 ตัว |
| PDF ที่ระบบสร้าง (cert/invoice/label) | Supabase Storage (S3 protocol) | interface `uploadBuffer/getSignedDownloadUrl/deleteObject` ใน `storage-service.js`; call site 4 แห่งใน `services/pdf/*` (verifier) | **client เปลี่ยน**: MinIO SDK ตรวจ endpoint เป็น domain/IP เท่านั้น (verifier: `node_modules/minio/.../helper.js:131-133`) และ `parseEndpoint()` คืนเฉพาะ `hostname/port` ทิ้ง path (`storage-service.js:52-65`) ขณะที่ Supabase S3 endpoint คือ `https://<ref>.storage.supabase.co/storage/v1/s3` (verified-by-search: `supabase.com/docs/guides/storage/s3/authentication`) ⇒ สลับเป็น `@aws-sdk/client-s3` (`forcePathStyle:true`) หลัง interface เดิม · bucket `gacp-certificates`/`gacp-pdfs` hardcode (verifier `:32-35`) ⇒ สร้างล่วงหน้า (CreateBucket รองรับ — verified-by-search verifier: `storage/s3/compatibility`) |
| เอกสารเกษตรกร/สลิป/avatar/farm photo | Supabase Storage bucket **private** | `createUploader()` (`storage-service.js:219-225`) ผู้ใช้ 6 route file (verifier: upload-middleware, applications, wizard, payment-slips, auth-health, farms, documents) | เปลี่ยน `getStorage()` จาก `diskStorage` → `memoryStorage` แล้วเรียก `uploadBuffer` เดิม (server-proxied; แก้จุดเดียว) · hash buffer ในหน่วยความจำก่อนอัปโหลดแทน `sha256OfFile(absolutePath)` (`application-document-sync.js:27-36` อ่านจาก disk คืน null เงียบ ๆ เมื่อไม่มีไฟล์ — ถ้าไม่แก้ `fileHash` จะ null ทุกเอกสารใหม่) |
| การอ่านไฟล์ `/uploads/*` | signed URL อายุสั้น mint **หลัง** gate เดิม | gate `gateSensitiveUploads` + `gateSlipObjectAccess` (`server.js:350-352`) | route `/uploads/*` เปลี่ยนจาก `express.static` เป็น authorize → redirect/proxy signed URL · **lab-report ต้องเป็น public tier** เพราะหน้า `/trace` ผู้บริโภคอ่าน (verifier: `uploads-access.js:87-111`) — "private ทุก bucket" จะพัง /trace |
| post-audit / CAR uploader | เดินผ่าน `createUploader` เดียวกัน | `post-audit.js:42-48`, `applications-car.js:44-47` | รวมเข้าทางเดียว (ปิดช่อง dangling URL ด้วย) |
| รูปหลักฐาน onsite (ทิ้ง bytes วันนี้) | bucket private เดียวกัน | verifier: `audit-onsite-service.js:660-670` มี buffer อยู่แล้ว | เพิ่ม `uploadBuffer` 1 จุด — ทำตอนนี้เพราะไม่มี legacy data ให้ย้าย |
| Redis: auth/OTP/MFA/dedupe/rate-limit | **ตาราง Postgres** (§4) | แม่แบบ `User.sessionsRevokedAt` (verifier: `auth.prisma:149`, `auth-session-security-handlers.js:343-395` คืน 503 เมื่อ query throw) | migration Tier C |
| Redis: cache (`cache-service`, `reports.js`) | ถอด cache หรือ in-process LRU | — | config: ไม่ตั้ง `REDIS_URL` — แต่ `apps/backend/config/env-validator.js:12-16` บังคับ `REDIS_URL` ใน production ⇒ ต้องถอดออกจาก `PRODUCTION_REQUIRED` ในขั้นเดียวกับที่ auth ย้ายเสร็จ |
| Bull `sla-monitor` (cron รายวัน) | node-cron ในโปรเซสเดิม (`jobs/scheduler.js` มี 13 job อยู่แล้ว — verifier) | — | ทางสั้นสุด: ย้าย job เดียวไป `scheduler.js` ไม่ต้องใช้ pgmq |

### 3.3 ไม่มีบ้านใน Supabase — ต้องตอบชัด

| สิ่ง | ทำไมไม่มีบ้าน | คำตอบที่เสนอ |
|---|---|---|
| RSA signing key + passphrase (verifier: `signature-service.js:19, 250` ใช้ `RSA_PRIVATE_KEY_PASSPHRASE`) | Supabase Vault เก็บ secret ไม่ใช่ KMS ที่เซ็น RSA-SHA256 ให้ (verified-by-search verifier: `supabase.com/docs/guides/database/vault`) · `USE_AWS_KMS` branch มีแต่ `aws-sdk` **ไม่อยู่ใน dependency** (verifier) | (ก) **ทำทันที**: เก็บ public key/fingerprint ลงแถว Certificate — `verifyWithLocalKey` รับ `publicKey` argument อยู่แล้วแต่ caller ไม่ส่ง (verifier: `certificate-service.js:1081`) · (ข) mount private key เป็น Docker secret read-only จาก secret store ของ ops (ไม่ใช่ volume ข้อมูล) + fingerprint guard · (ค) ระยะยาว: KMS จริง = เพิ่ม dependency + พิสูจน์ใหม่ |
| Redis-as-Redis | ไม่มี managed Redis | ไม่เพิ่ม vendor ที่ 3 — ย้ายลง Postgres (§4) |
| Puppeteer PDF render, node-cron | เป็น process ไม่ใช่ data | อยู่บนเซิร์ฟเวอร์ได้ ไม่ผิดหลัก |
| TLS material, nginx config | host state | อยู่กับ host nginx ตามเดิม |
| Prometheus/Grafana/Loki | observability | ถอดออกจากเครื่อง หรือคงไว้ด้วย retention สั้น — ไม่ใช่ข้อมูลธุรกิจ จึงไม่บังคับ |

---

## 4. Redis — ส่วนที่ต้องพูดตรง ๆ

**ข้อเท็จจริงหลัก (เปิดรอบนี้)**: `redis-service.get()` คืน `null` ทั้งตอน disconnected (`apps/backend/services/redis-service.js:80`) และตอน error (`:90-93`); `set()` คืน `false` (`:103, 110-113`) — **ไม่เคย throw** ดังนั้น `catch { return true; // Fail CLOSED }` ที่ `token-revocation-service.js:326-329` **ไม่มีทางถูกเรียก** เมื่อ Redis ล่มจริง: ค่าที่ได้คือ `Boolean(null) === false` (`:324-325`) = ไม่ถูก block

| consumer | key / TTL | วันนี้เมื่อ Redis หาย | ระดับ | ไปไหน | ทำไม |
|---|---|---|---|---|---|
| refresh-token **blocklist** | `auth:rt-blocklist:<jti>` 7d | **SECURITY**: RT ที่หมุนไปแล้วใช้ซ้ำได้ตลอด 7 วัน (fail open ทั้งที่ docstring และเทสบอก fail closed — เทส mock ทั้ง module ให้ throw ได้: verifier `refresh-token-blocklist.test.js:30-34`) | authoritative | ตาราง `auth_token_blocklist(jti PK, kind, expires_at)` — Prisma query throw จริง ⇒ fail closed ได้จริง | ต้องอยู่ที่ durable ที่ throw เมื่อล่ม |
| session-family blocklist | `auth:family-blocklist:<familyId>` 7d | **SECURITY**: read gate คืน false ⇒ สาขาตรวจจับ reuse ไม่ถูกเข้าเลย (verifier: ล้มที่ read `handlers:240-246` ไม่ใช่ write) | authoritative | ตารางเดียวกัน `kind='family'` | เดียวกัน |
| access-token blocklist | `auth:blocklist:<jti>` 24h (token อายุ 15 นาที) | fail open **โดยนโยบายที่ review แล้ว** แต่ alert `ACCESS_TOKEN_BLOCKLIST_REDIS_OUTAGE` ที่นโยบายพึ่ง **ไม่เคยยิง** เพราะไม่มี throw (verifier: `:266-271`) | authoritative-lite | ตารางเดียวกัน `kind='access'`; อ่านทุก request ⇒ index + ยอมรับ 1 read/req หรือ cache in-process ≤15s | ความเสี่ยงถูก bound ด้วย TTL 15 นาที แต่ alert ต้องมีโอกาสยิงจริง |
| refresh-token **allowlist** | `auth:refresh:<userId>:<tokenId>` 7d | ไม่มีผล — `isRefreshTokenValid` **ไม่มี caller** นอกเทส (verifier grep); `revokeAllUserTokens` ลบ key ที่ไม่มีใครอ่าน (เรียกจาก `password-management.js:61,173`, `auth-session-security-handlers.js:269, 712` — verifier) | dead (ตาม grep) | **ไม่ port** — revoke ทั้งผู้ใช้ทำโดย `User.sessionsRevokedAt` อยู่แล้ว · แต่หลักฐาน "ไม่ใช้" คือ grep เดียว ⇒ ก่อนลบโค้ดต้องมี RED test ว่า logout/force-logout/legacy-reuse ยัง revoke ได้ผ่าน session epoch | กฎ: grep เดียวไม่พอให้ลบ |
| MFA challenge | `auth:mfa-challenge:<hex>` 300s | fail **safe** (ล็อกผู้ใช้ออก ไม่ใช่ปล่อย) | authoritative | ตาราง `mfa_challenge(token PK, user_id, issued_at, expires_at)`; consume = `DELETE ... RETURNING` (atomic) | ต้อง durable; Postgres พอ |
| email OTP + attempts | `auth:mfa-email-otp:<userId>` 300s | fail safe: `STORE_FAILED`/`EXPIRED` (verifier: `email-otp-service.js:65-73, 112-117`) | authoritative | ตาราง `mfa_email_otp(user_id PK, code_hash, attempts, issued_at, expires_at)` — **ต้องพก `attempts`** ไม่งั้น brute-force cap 5 หาย; throttle 30s = เทียบ `issued_at` | เดียวกัน |
| MFA jti replay guard | `mfa-jti:<jti>` | fail open โดยตั้งใจ+เอกสาร (verifier: `mfa.js:511-543`) | authoritative-lite | `INSERT ... ON CONFLICT` unique — แยก "ซ้ำ" กับ "ล่ม" ได้ | ดีกว่า setNX |
| rate limiter | `ratelimit:<ip>:<path>` window | Map fallback ต่อโปรเซส (verifier: `rate-limiter.js:13-38`) — ถูกต้องถ้า 1 instance; N instance = limit ×N | cache | ตาราง `rate_limit_bucket` UPSERT + `expires_at` index + cron DELETE **หรือ** คง in-memory ถ้ายืนยัน 1 instance | ปริมาณ (5/15min auth, 100/min api) Postgres รับได้ |
| notification dedupe | `notify:dedupe:<sha256>` 60min | Map fallback; หาย = แจ้งเตือนซ้ำข้ามโปรเซส (Notification rows อยู่ Postgres) | lite | unique index บน hash + `expires_at` | ง่ายกว่าเดิม |
| `cache-service`, `reports.js` | `cert:/trace:/master:/farm:/app:/analytics:`, `reports:*` | แค่ช้าลง · ใช้ `KEYS` blocking (verifier: `cache-service.js:93, 361`) | pure cache | ถอด / LRU in-process; **คง orgId ใน key** (tenancy bug เดิม `reports.js:25-28`) | — |
| Bull `sla-monitor` | — | cron รายวันหยุด | infra | node-cron ใน `scheduler.js` | queue เดียวที่มีอยู่จริง |

**ข้อสรุปที่ต้องเขียนให้ชัด**: (1) blocklist ทั้งสามต้อง "อยู่ที่ใดที่หนึ่งที่ durable และล่มแล้ว throw" — ไม่ใช่หายไปเฉย ๆ (2) การย้ายไป Postgres ทำให้ auth **ปลอดภัยขึ้นกว่าเดิม** เพราะแก้ fail-open โดยอัตโนมัติ (3) fail-open นี้เป็นประเด็น **L1 / §8 escalation** แยกต่างหาก — ควรรายงาน operator แม้ไม่ย้าย (4) เงินไม่แตะ Redis เลย (§1)

---

## 5. แผนย้าย — expand → run both → verify → contract

ป้าย: **[C]** Tier C = operator merge · **[AUTH]** / **[MONEY]** ต้อง RED-first + evidence pack เต็ม · tier สุดท้ายตัดสินโดย `scripts/probes/tier-check.sh` เท่านั้น (ป้ายในตารางเป็นการคาดการณ์)

| ขั้น | ทำ | พิสูจน์ก่อนไปต่อ | ป้าย |
|---|---|---|---|
| 0 | **สำรวจเครื่องจริง**: `docker inspect gacp-backend` ดู `DATABASE_URL`, `STORAGE_PROVIDER`, `ENABLE_PDPA_FIELD_ENCRYPTION` บน 43.134.175.51 · `pg_dump` + tar volumes ด้วย `gacp-backup.sh` · `docker system df -v` วัด volume ทุกตัว | ไฟล์ backup + checksum + ขนาด ใน `evidence/stateless-2026-08/00-baseline/` | — |
| 1 | **ปิดช่องรั่ว build**: `.dockerignore` เพิ่ม `**/.env`, `**/*.pem`, `apps/backend/keys/`, `apps/backend/public/uploads/` | build image แล้ว `docker run --rm <img> ls apps/backend/keys apps/backend/.env` ต้อง "No such file" | [C] secret |
| 2 | **เก็บ public key ลงแถวใบรับรอง** (expand): เพิ่มคอลัมน์ `signaturePublicKey` (หรือ fingerprint + key table); ส่ง `publicKey` เข้า `verifyWithLocalKey` จากแถวถ้ามี; backfill ใบเก่าจาก `public.pem` ปัจจุบัน | RED: ลบ `keys/` ใน test env → verify ใบเก่า fail; GREEN: verify ผ่านจากคอลัมน์ · หน้า `/verify` กดจริง (view-pack) | [C] identity/schema |
| 3 | **กุญแจเซ็น → secret mount** (การตัดสินใจข้อ 1): compose ใช้ `secrets:` read-only แทน volume; `ensureLocalKeys()` ใน production ต้อง **throw** แทน generate เมื่อไม่พบ (`SIGNING_KEY_REQUIRED=true`) | RED: boot โดยไม่มี secret → exit non-zero; GREEN: boot ด้วย secret → `Loaded existing keys` + fingerprint ตรง baseline | [C] identity |
| 4 | **เปิด PDPA encryption + backfill** บน DB เป้าหมาย ก่อนย้ายข้อมูลจริง | query `healthId` เห็น ciphertext; login ผ่าน; grep `\d{13}` ใน dump = 0 นอกคอลัมน์ที่ยกเว้น | [C] schema/secret |
| 5 | **Postgres → Supabase (expand)**: compose `DATABASE_URL=${DATABASE_URL:?}`; `ADMIN_DATABASE_URL`; `prisma migrate deploy` บน Supabase; ย้ายข้อมูล `pg_dump → pg_restore`; ยังรัน container postgres ไว้แต่ไม่มีใครชี้ | row-count ทุกตารางเท่ากันสองฝั่ง (script เดียว ผล 2 ชุด) · full suite เขียวบน runner ชี้ Supabase · Phase-0 walk C01→C15 บน Supabase | [C] migration |
| 6 | **ตาราง auth แทน Redis (expand)**: migration 4-5 ตาราง + cron DELETE expired (pg_cron **UNVERIFIED** ว่าเปิดบน plan นี้ — ถ้าไม่ได้ ใช้ node-cron ใน `scheduler.js`) · dual-write: Postgres เป็น authority, Redis ยังเขียน | RED-first ต่อ consumer: เทสที่ใช้ `redis-service` **ของจริง** (ไม่ mock) ปิด Redis แล้วคาด blocked/503 ⇒ fail ก่อน / ผ่านหลัง · login/refresh/MFA/OTP กดจริง (view-pack) | [C][AUTH] |
| 7 | **อ่านจาก Postgres เท่านั้น** สำหรับ blocklist/MFA/OTP; ลบสาขา Redis ใน consumer เหล่านี้; ถอด `REDIS_URL` จาก `PRODUCTION_REQUIRED` (`env-validator.js:12-16`) เมื่อไม่เหลือ consumer authoritative | boot production โดยไม่มี `REDIS_URL` สำเร็จ · suite auth เขียว · เทสว่า alert ยิงจริงเมื่อ DB throw | [C][AUTH] |
| 8 | **Storage client**: เพิ่ม `@aws-sdk/client-s3` หลัง interface เดิม; `S3_ENDPOINT` รับ URL มี path; สร้าง bucket ล่วงหน้า; `initializeStorage` = verify-only | RED: `parseEndpoint` กับ `https://x/storage/v1/s3` ทิ้ง path; GREEN: PUT/GET/signed-GET จริงกับ Supabase บันทึก response | B (C ถ้าแตะ secret) |
| 9 | **Uploads → memory + uploadBuffer (expand)**: `getStorage()` สลับตาม `UPLOAD_STORAGE=cloud`; hash buffer ก่อนอัปโหลด; post-audit/CAR/onsite ใช้ทางเดียวกัน; `/uploads/*` mint signed URL หลัง gate; lab-report public tier | RED: `fileHash` null เมื่อไม่มี path; GREEN: hash ตรง sha256 ต้นฉบับ · สลิป: ผู้ใช้คนละฝั่งโหลด URL กัน = 403 (IDOR test เดิม) · view-pack: อัปโหลด→ดู→ดาวน์โหลดกดจริง | [C] (สลิป = เงิน/PDPA) |
| 10 | **ย้ายไฟล์เก่า**: copy `gacp-uploads-data` (63.51 MB ตาม `gacp-backup.sh:43-46` วันที่ 2026-08-13 — วัดซ้ำในขั้น 0) → bucket; rewrite `fileUrl` แบบ expand (คอลัมน์ใหม่ `objectKey`, เก่าคงไว้) | count object = count ไฟล์; sha256 ทุกไฟล์ตรง; สุ่มเปิด 20 ไฟล์ผ่าน UI | [C] migration |
| 11 | **Contract**: ลบ service `postgres`, `redis`, `minio`, `pgadmin` + volume ข้อมูลทั้งหมด (`postgres_data/redis_data/gacp_minio_data/pgadmin_data/gacp_uploads/gacp_storage/gacp_signing_keys`) ออกจาก compose; ลบ `depends_on`; ลบ initdb mount ใน local-prod (verifier: `local-prod.yml:135`) · `gacp_storage` ลบได้ต่อเมื่อขั้น 0 วัดได้ 0 B บนเครื่องจริง · **bluegreen**: ตัดสินว่าลบไฟล์หรือซ่อม (ไม่ทำทั้งคู่) | `docker compose config` ไม่มี named volume ข้อมูล · probe §6.1 เขียว · backup script ปรับเหลือเฉพาะ secret | [C] compose |
| 12 | **Cache/cron ที่เหลือ**: `cache-service`/`reports.js` → LRU in-process หรือถอด; Bull `sla-monitor` → `scheduler.js` | suite เขียว; SLA job รันตามเวลา (log จริง 1 รอบ) | B |
| 13 | **ตัดสินใจ region** (Sydney → Singapore) ถ้าเลือก: project ใหม่ + ทำขั้น 5 ซ้ำ (วิธีย้าย region: **UNVERIFIED**) | latency p50 `/api/health` + tx ยาวสุด ก่อน/หลัง | [C] |
| 14 | **ปรับ docs**: amend addendum ใน audit 2026-07-25 ให้ชี้ `HARNESS_LOG.md:268-271`; runbook restore-from-Supabase ที่ทดลองจริง 1 ครั้ง | restore ลง Postgres เปล่า แล้ว suite เขียว | A |

ลำดับ: ขั้น 1-4 ทำได้เลยและมีค่าแม้ไม่ย้าย · ขั้น 6-7 (auth) ต้องเสร็จก่อน 11 · ขั้น 9 ต้องเสร็จก่อน 10 · การตัดสินใจข้อ 2 เลื่อนได้ถึงขั้น 9 เพราะ client เดียวกันทั้งสองทาง

---

## 6. เครื่องบังคับ — กฎที่ไม่มีเครื่อง = กฎร่าง

ทุกตัวสร้างผ่าน PR ที่มี `--selftest` (L6) · เริ่มที่ `[MANUAL]` ใน local-gate แล้วขยับ `[ACTIVE]` เมื่อ operator เสียบ CI

| # | probe | ตรวจอะไร | fail เมื่อ |
|---|---|---|---|
| 6.1 | `scripts/probes/no-stateful-compose.sh` | `docker compose -f <ทุก docker-compose*.yml> config --format json` (ไม่ parse YAML เอง) | (ก) มี service ที่ `image` match `^(postgres|redis|minio|pgadmin)` · (ข) มี top-level `volumes:` ที่ไม่อยู่ใน allowlist · (ค) service volume ใดที่ไม่ `:ro` และไม่ใช่ `tmpfs` · (ง) มี `depends_on` ชื่อ service ในข้อ ก · allowlist อยู่ใน `probe-registry.txt` เซ็นโดย operator · selftest: compose ปลอมที่มี `image: postgres:16` ต้อง fail |
| 6.2 | `scripts/probes/no-local-durable-write.sh` | ripgrep ใน `apps/backend` (ยกเว้น `__tests__`, `scripts/`) หา `multer.diskStorage`, `fs\.(writeFile|appendFile|createWriteStream|mkdirSync)` ที่ path ไม่ขึ้นต้น `os.tmpdir()`/`/tmp` | counter > baseline (ratchet ลงทางเดียวตาม L4; baseline ตั้งครั้งแรกจากค่าจริง + log) · selftest: ไฟล์ปลอมที่มี `multer.diskStorage` ต้องทำให้ fail |
| 6.3 | boot guard ใน `storage-service.js` + `env-validator.js` | `NODE_ENV=production`: `STORAGE_PROVIDER` ต้องเป็น cloud, `UPLOAD_STORAGE=cloud`, `STORAGE_ALLOW_LOCAL_FALLBACK` ต้องไม่ตั้ง, `S3_ENDPOINT` ต้องเป็น https | process **exit non-zero ก่อน listen** · ต่างจาก guard เดิมที่อยู่ใน `uploadBuffer` (verifier: `storage-service.js:106-111`) และถูก PDF layer กลืน (verifier: `application-template-service.js:239-245`) ⇒ ต้องตรวจตอน boot ไม่ใช่ตอนใช้ |
| 6.4 | `signing-key-required` (ใน `ensureLocalKeys`) | production: load key ล้มเหลว | **throw** ไม่ generate; fingerprint ของ public key ต้องตรงกับ `SIGNING_KEY_FINGERPRINT` env (กัน key ผิดชุดเงียบ ๆ) |
| 6.5 | `runtime-fs-probe` (CI หลัง e2e) | รัน container backend ด้วย `--read-only --tmpfs /tmp` แล้วเดิน smoke (upload, PDF, login, MFA) | request ใดคืน 5xx เพราะ `EROFS` ⇒ fail — เครื่องพิสูจน์ "ไม่เขียน disk" ที่เชื่อถือได้กว่า grep |
| 6.6 | ขยาย `no-secret` | pattern `-----BEGIN (RSA )?PRIVATE KEY-----` + ไฟล์ `.env`/`*.pem` ใน image (`docker run --rm <img> find / -name '*.pem' -o -name '.env'`) | พบไฟล์ |
| 6.7 | `redis-authoritative-zero` | grep `redisService\.(get|set|setNX)` ใน `token-revocation-service.js`, `email-otp-service.js`, `routes/api/identity/mfa.js` | > 0 หลังขั้น 7 (กันใครเอา auth กลับไป Redis) |
| 6.8 | `env-single-source` | เทียบคีย์ใน `apps/backend/.env.example` กับ `environment:` ทุก compose | คีย์ที่ compose **ไม่ตั้ง** แต่ `.env` มี ⇒ fail (ปิดช่อง dotenv ชนะเงียบ ๆ ตาม §2 #1) |

---

## 7. ความเสี่ยงและสิ่งที่ต้องตัดสิน

**การตัดสินใจ 1 — กุญแจเซ็นใบรับรอง** (บังคับ)
- ก. secret mount + fingerprint guard + public key ลงแถว: งานน้อยสุด, ยังมี secret 2 ชิ้น (key + passphrase) อยู่กับเครื่อง — ขัดหลัก "ไม่ถือข้อมูล" ตามตัวอักษร แต่ไม่ใช่ข้อมูลธุรกิจ
- ข. KMS ภายนอก: ไม่มีอะไรบนเครื่อง แต่เพิ่ม dependency, vendor ที่ 3, และต้องพิสูจน์ใหม่ทั้งสาย
- ขั้นต่ำไม่ว่าเลือกอะไร: public key ลงแถว (§5 ขั้น 2) — ไม่ทำ = key หาย 1 ครั้ง ใบรับรองทุกใบตรวจไม่ได้

**การตัดสินใจ 2 — เอกสารระบุตัวตนไป Supabase Storage หรือไม่**
- กฎ residency **ยกเลิกถาวร** โดย operator (`HARNESS_LOG.md:268-271`: "ลบระเบียบนี้ออกไปเลยถาวร ... ได้เครื่อง production มาก็เป็นเครื่องจากทางกระทรวง") ⇒ ไม่ใช่การละเมิดกฎ แต่มีข้อเท็จจริงต้องรับรู้:
  - PDPA: ทางที่ใช้ได้สำหรับประเทศที่ไม่มี adequacy = safeguards (SCC/BCR) ตาม ม.29 (verified-by-search โดย verifier จากสรุปสำนักกฎหมาย — **secondary source ไม่ได้อ่านตัวบท**) · Supabase มี DPA + EU SCC (verified-by-search verifier: `supabase.com/legal/dpa`) ⇒ เป็นงานเอกสาร ไม่ใช่กำแพง
  - เมื่อ flag encryption เปิด provider ยังอ่านได้: ชื่อ-นามสกุล, เบอร์, จังหวัด, อีเมล, GPS ฟาร์ม (Float เข้ารหัสไม่ได้ — verifier `farm.prisma:36-37`) · เลขบัตรประชาชน/laserCode/taxId **เข้ารหัส** (`prisma-pdpa-extension.js:141-147` เปิดรอบนี้)
  - ทางเลือก: (ก) ทุกอย่างไป Supabase — เครื่องว่างจริง, ง่ายสุด (ข) DB ไป Supabase แต่ bucket เอกสารระบุตัวตนอยู่ S3-compatible store ที่เราเลือก region ได้ — ซับซ้อนขึ้นแต่สลับกลับง่ายเมื่อกระทรวงกำหนดเงื่อนไขตอนส่งมอบ (`HARNESS_LOG.md:270`) · **ทั้งสองทางใช้ S3 client ใหม่เหมือนกัน** จึงเลื่อนการตัดสินใจได้ถึงขั้น 9
- ภาระก่อนทั้งสองทาง: encryption flag `true` + backfill; `ENCRYPTION_KEY` อยู่นอก Supabase; เซ็น DPA; SOC2 report ต้อง Team/Enterprise (verified-by-search verifier: `supabase.com/docs/guides/security/soc-2-compliance`)

**การตัดสินใจ 3 — region**: ปัจจุบัน `ap-southeast-2` = Sydney; Singapore `ap-southeast-1` ใกล้กว่า; ไม่มี region ไทย (verified-by-search verifier: `supabase.com/docs/guides/platform/regions`) · เปลี่ยน region = project ใหม่? **UNVERIFIED** · ไม่มีใครวัด latency จริง — วัดก่อนตัดสิน

**ความเสี่ยงอื่น**
- Supabase ล่ม = ระบบล่มทั้งหมด — ไม่มี exit path จนกว่า runbook restore ทดลองจริง (ขั้น 14)
- latency: tx default ถูกดันเป็น 30s เพราะ Supabase แล้ว (verifier: `prisma-database.js:82-91`) — auth blocklist อ่านทุก request จะเพิ่ม round-trip
- plan Free จำกัดไฟล์ 50MB (verified-by-search verifier: `storage/uploads/file-limits`); app จำกัด 20MB (`storage-service.js:222`) พอ แต่ต้องระบุ plan
- ลบ Redis เปลี่ยน fail-open → fail-closed: ผู้ใช้จะเห็น 503 ตอน DB สะดุด แทน "ผ่านเงียบ" — ถูกต้องกว่าแต่ต้องบอกล่วงหน้า
- ขั้น 9 แตะสลิป (เงิน + PDPA) และขั้น 6-7 แตะ auth — ต้องแยก PR และ reviewer Tier C แยก

**สิ่งที่ design นี้ไม่แก้**: PKI bad-decrypt → hash-only follow-up · `GET /api/audit` อ่านจาก array ในหน่วยความจำ · retention sweep ขาด 5 model ที่มี legalHold (verifier: BACKLOG-FOUND) · นโยบาย cloud หน่วยงานรัฐ/จัดซื้อ (UNVERIFIED) · fail-open ใน auth ควร escalate แยกทันที ไม่รอการย้าย

---

## 8. สิ่งที่ยังไม่ได้ตรวจ

- **เครื่อง production/staging จริง (43.134.175.51)**: ไม่ได้ inspect — ไม่ทราบว่า backend ที่รันอยู่ชี้ container postgres หรือ Supabase, `ENABLE_PDPA_FIELD_ENCRYPTION` เป็นอะไร, volume ขนาดเท่าไรวันนี้ (63.51 MB / 0 B คือบันทึกใน `gacp-backup.sh:43-46` วันที่ 2026-08-13)
- root `.env` ของ Phase 0 (laptop-node + Supabase) ไม่ได้เปิด — encryption flag ที่ใช้กับ DB Supabase จริงไม่ทราบ
- **ไม่ได้รัน** stack bluegreen — "แต่ละสีสร้างกุญแจเอง" มาจากอ่านไฟล์ (`bluegreen.yml:82-84`) เท่านั้น
- Bull constructor throw หรือไม่เมื่อ Redis ไม่ถึง — ไม่ได้ทดลอง (ความสำคัญลดลงเพราะ `pdfQueue` เป็น null เสมอ)
- pg_cron / pgmq / UNLOGGED table เปิดบน plan+region นี้หรือไม่ — **UNVERIFIED**
- วิธีย้าย region (in-place หรือ project ใหม่) — **UNVERIFIED**
- Supabase encryption-at-rest / ที่ตั้ง backup / read replica ออกนอก region — **UNVERIFIED**
- latency Sydney vs Singapore จากกรุงเทพ — ไม่มีใครวัด
- PDPA: อ่านจากสรุปสำนักกฎหมายเท่านั้น ไม่ได้อ่านตัวบท/ประกาศ PDPC; ภาระเฉพาะหน่วยงานรัฐ/จัดซื้อ ไม่ได้ค้น
- `apps/backend/storage/breaches`, `storage/certificates` บนเครื่องนี้ — verifier พบ dir แต่ไม่มีใครเปิดดู
- ผล web-search ทั้งหมดในเอกสารนี้เป็นสิ่งที่ verifier lane fetch ในรอบก่อน ผู้เขียนไม่ได้ fetch ซ้ำ — ป้าย verified-by-search อ้างถึง fetch นั้น
- "ไม่มีโค้ดใช้" ทุกข้อ (allowlist, `gacp_storage`, cache) เป็น grep เดียว — เอกสารนี้จึงไม่สั่งลบสิ่งใดจากหลักฐานนั้นเพียงอย่างเดียว

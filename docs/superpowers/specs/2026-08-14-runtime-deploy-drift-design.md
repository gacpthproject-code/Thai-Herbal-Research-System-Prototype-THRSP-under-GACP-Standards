# ทำให้ "ของที่รันอยู่" พิสูจน์ตัวเองได้ — ปิดช่องว่างระหว่างซอร์สกับรันไทม์

**วันที่:** 2026-08-14 · **ชั้น:** B (โค้ด + probe) · **สถานะ:** PENDING — ยังไม่ได้ implement

---

## 1. ปัญหา — พร้อมหลักฐาน

`gacp-frontend-staging` รัน image ที่ build วันที่ **2026-07-23**
data-sovereignty audit ที่พบ outbound flow ผิดข้อกำหนด **29 เส้นจาก 96** ลงวันที่ **2026-07-25**

⇒ หน้าเว็บ staging ที่เปิดอยู่ตอนนี้คือ bundle **ยุคก่อน audit** — ยุคที่ Firebase Auth
ยังรับ login จริงและแผนที่ยังส่งพิกัดฟาร์มออกนอกประเทศ

**ซอร์สสะอาดตั้งแต่ปลายกรกฎาคม แต่ของที่วิ่งอยู่ไม่ใช่ซอร์ส**

### ทำไมไม่มีใครเห็น

| ชั้น | มีเครื่องตรวจไหม |
|---|---|
| ซอร์สในรีโป | **มี** — `scripts/ci/check-data-sovereignty.js` เดิน 6 ราก, ห้าม 6 บริการ, มีเทสต์ 380 บรรทัด |
| image ที่ build | **มีลายเซ็นแต่ไม่มีคนอ่าน** — `build-images.yml:88,148` ฝัง `org.opencontainers.image.revision` ทุกใบ |
| container ที่รันอยู่ | **ไม่มีเลย** |
| bundle ที่เบราว์เซอร์โหลด | **ไม่มีเลย** |

gate ทุกตัวในระบบอ่านไฟล์ในรีโป ไม่มีตัวไหนถามว่า *"แล้วที่รันอยู่จริงคืออะไร"*

### เอกสารพยายามแก้แล้วและไม่ได้ผล

`docs/operations/runbooks/deploy-staging-manual.md` (2026-08-05) เขียนไว้ในย่อหน้าแรกว่า
*"staging currently runs a ~22 July image; `main` is ~150 commits ahead"*

**เก้าวันต่อมาสถานะเดิมทุกประการ** — runbook ที่ระบุความเสี่ยงเป็นตาราง ระบุ migration ทุกใบ
ระบุ watch-item หกข้อ ไม่ได้ทำให้ใคร deploy · นี่คือหลักฐานว่าชั้นนี้ต้องเป็นเครื่อง ไม่ใช่เอกสาร

### จุดที่ระบบควรประกาศตัวเอง กลับประกาศค่าคงที่

`apps/backend/routes/api/index.js:386` — `/api/health` ตอบ `version: '3.0.0'` เป็นสตริงตายตัว
deploy หรือไม่ deploy มันตอบเหมือนกัน ⇒ endpoint เดียวที่ระบบบอกว่าตัวเองเป็นใคร บอกไม่ได้

---

## 2. สิ่งที่ใบนี้ทำ / ไม่ทำ

**ทำ:** ทำให้ทุกบริการที่รันอยู่ประกาศ commit ที่ตัวเอง build มา และให้ gate ปฏิเสธการ merge
เมื่อสิ่งที่รันอยู่ห่างจาก `origin/main`

**ไม่ทำ:**
- ไม่ deploy ให้ — การ deploy เป็นสิทธิ์ operator ตาม L5 ใบนี้แค่ทำให้การไม่ deploy ซ่อนไม่ได้
- ไม่แก้ `version: '3.0.0'` — `production-smoke.test.js:192` ยืนยันค่านี้อยู่ การเปลี่ยนคือ
  งานคนละใบ **บันทึกไว้ว่ายังเป็น hardcode ที่ยังไม่ได้แก้**
- ไม่ตรวจว่าเบราว์เซอร์ยิงไปที่ไหนจริง (egress observation) — ต้องใช้ headless browser คนละใบ
- ไม่แตะ Stripe หรือรายการ `FORBIDDEN` — การเพิ่ม/ลดบริการต้องห้ามคือการตัดสินใจของ operator

---

## 3. สถาปัตยกรรม — ห้าชิ้น

```
Dockerfile (ARG GIT_SHA → ENV)
        │
        ├─→ backend  : GET /api/health      → { revision, builtAt, ... }
        └─→ frontend : GET /api/version     → { revision, builtAt }
                                    │
                     scripts/probes/deploy-drift.sh
                                    │
                     เทียบกับ `git rev-parse origin/main`
                                    │
                     full-gate.sh + local-gate.sh → FAIL เมื่อห่าง
```

### 3.1 `GIT_SHA` เดินทางจาก build เข้าไปถึงรันไทม์

image มี `org.opencontainers.image.revision` อยู่แล้ว แต่**โปรเซสในคอนเทนเนอร์อ่าน label
ของ image ตัวเองไม่ได้** จึงต้องส่งค่าเข้าไปอีกทางเป็น build-arg แล้วตรึงเป็น `ENV`

- `apps/backend/Dockerfile` และ `apps/web-app/Dockerfile` รับ `ARG GIT_SHA` และ `ARG BUILT_AT`
  แล้วตรึงเป็น `ENV GIT_SHA=$GIT_SHA` / `ENV BUILT_AT=$BUILT_AT`
- `build-images.yml` ส่งทั้งคู่: `GIT_SHA=${{ github.sha }}` และ `BUILT_AT` จาก timestamp ของ job
- **วาง `ARG` ทั้งสองไว้ท้ายสุดของ Dockerfile ที่เป็นไปได้** เพราะค่ามันเปลี่ยนทุก commit
  ถ้าวางไว้ต้น ๆ layer cache จะพังทั้งไฟล์และ build บนเครื่องจะช้าจนคนเลี่ยงไม่ใช้
- ถ้าไม่ได้ส่งค่ามา ค่าเป็นสตริงว่าง ⇒ endpoint ต้องตอบ `revision: null`
  **ห้ามใส่ค่าปลอมอย่าง `"unknown"` หรือ `"dev"`** เพราะ probe ต้องแยก "ไม่รู้" ออกจาก "รู้ว่าเป็นอะไร" ได้

### 3.2 backend ประกาศตัวเอง

`/api/health` เพิ่มสองฟิลด์ **โดยไม่แตะของเดิม**

```json
{ "success": true, "version": "3.0.0", "revision": "93aeb959...", "builtAt": "2026-08-14T…Z", "…": "…" }
```

`revision` = `process.env.GIT_SHA || null` · `builtAt` = `process.env.BUILT_AT || null`
ฟิลด์เดิมทุกตัวคงรูปเดิม เพราะ smoke test และ docker healthcheck ใช้อยู่

### 3.3 frontend ประกาศตัวเอง

`apps/web-app/src/app/api/version/route.ts` — route handler ฝั่งเซิร์ฟเวอร์ อ่าน `process.env.GIT_SHA`
ตอนรัน (ไม่ใช่ `NEXT_PUBLIC_*` เพราะไม่ต้องให้เบราว์เซอร์เห็น และไม่อยากให้ค่าถูก inline เข้า bundle)

ตอบ `{ "revision": "...", "builtAt": "..." }` · ไม่ต้องยืนยันตัวตน เพราะ probe ต้องเรียกได้จากทุกที่

### 3.4 `scripts/probes/deploy-drift.sh`

อ่านรายการปลายทางจาก **`scripts/probes/deploy-targets.txt`** ไม่ hardcode URL ในสคริปต์

```
# <ชื่อ> | <url> | <ref ที่ควรตรงกับ>
staging-backend  | https://staging.gacpth.com/api/health   | origin/main
staging-frontend | https://staging.gacpth.com/api/version  | origin/main
prod-backend     | https://gacpth.com/api/health           | origin/deploy/production
prod-frontend    | https://gacpth.com/api/version          | origin/deploy/production
```

ต่อแถว: ยิง HTTP → อ่าน `revision` → เทียบกับ `git rev-parse <ref>`

| ผลที่เจอ | probe ทำอะไร |
|---|---|
| `revision` ตรงกับ ref | PASS |
| `revision` ไม่ตรง | **FAIL** พร้อมบอก sha ทั้งสองฝั่งและจำนวน commit ที่ห่าง (`git rev-list --count`) |
| `revision` เป็น `null` | **FAIL** — image ที่ไม่บอกว่าตัวเองคือใคร ตรวจไม่ได้ = ตรวจไม่ผ่าน |
| ยิงไม่ถึง / timeout | **FAIL พร้อมบอกว่าเป็นปัญหาเครือข่าย** — ห้ามคืน PASS เงียบ ตามสัญญาเดียวกับ `no-secret.sh` ที่ FAIL เมื่อไม่มี gitleaks |
| `curl` ไม่มีในเครื่อง | **exit 2 (NOT-RUN)** ไม่ใช่ FAIL — แยก "เครื่องมือไม่มี" ออกจาก "ระบบผิด" ตามที่ `full-gate.sh` แก้ไว้ 2026-08-08 |
| ไฟล์ `deploy-targets.txt` หาย/ว่าง | **FAIL** — probe ที่ไม่มีอะไรให้ตรวจแล้วบอกว่าผ่าน คือ phantom guardrail |

`git rev-parse origin/main` ต้อง `git fetch` ก่อน มิฉะนั้นเทียบกับ ref ที่ค้าง — probe ต้อง fetch เอง
และถ้า fetch ไม่ได้ = FAIL เหตุผลเครือข่าย เช่นเดียวกัน

### 3.5 เสียบเข้า gate

- แถวใน `scripts/probes/probe-registry.txt` (operator เซ็น — L6)
- เพิ่มใน `full-gate.sh` ชุดเดียวกับ probe อื่น (บริเวณ `bash "scripts/probes/$p.sh"`)
- เพิ่ม `step deploy-drift bash scripts/probes/deploy-drift.sh` ใน `local-gate.sh`
  เพราะ local-gate คือ gate ที่มีผลจริงระหว่างที่ Actions ใช้ไม่ได้

---

## 4. ทางตัน และทางออก — ต้องตัดสินก่อนเปิดใช้

**ถ้า merge ไม่ผ่านเพราะ staging ค้าง และการทำให้ staging ไม่ค้างต้อง build image ใหม่
ซึ่ง build ด้วย GitHub Actions ที่นาทีหมด — รีโปจะล็อกตัวเองทั้งใบ**

ทางออกที่เลือก: **build บนเครื่อง**

`docker build` บนเซิฟเวอร์ไม่ต้องพึ่ง Actions เลย ⇒ ต้อง**พิสูจน์ว่า build ผ่านจริงก่อน**
แล้วจึงเปิด probe ให้บล็อก · ลำดับบังคับ:

1. build image ทั้งสองตัวบนเครื่องด้วย `docker build --build-arg GIT_SHA=$(git rev-parse HEAD)` **สำเร็จ**
2. deploy แล้วยิง endpoint ได้ `revision` ตรงกับ `origin/main` **จริง**
3. **จึงค่อย** merge แถว registry ที่ทำให้ probe บล็อก

ระหว่างข้อ 1-2 แถวในทะเบียนใช้ **`manual-until:2026-08-28`** (สองสัปดาห์) — `probe-gate.js`
บังคับให้ค่านี้มีวันหมดอายุ และ FAIL เองเมื่อเลยกำหนด ⇒ **ไม่กลายเป็น phantom guardrail**
ตามที่ทะเบียนเตือนไว้เอง · เลือก 28 ส.ค. เพราะงานจริงคือ build สองใบและ deploy หนึ่งครั้ง
ถ้าสองสัปดาห์ยังทำไม่ได้ แปลว่าติดอะไรที่ต้องคุยกัน ไม่ใช่แค่ยังไม่ว่าง — และ gate จะบังคับให้คุยพอดี

### เคสทดสอบแรกมีอยู่แล้วในของจริง

`origin/deploy/production` หัวคือ `78f26732` ลงวันที่ **2026-08-03** ซึ่งตรงกับวันที่ build ของ
`gacp-frontend` พอดี ส่วน `gacp-frontend-staging` build 2026-07-23 ขณะที่ `main` เดินไปไกลแล้ว

⇒ **ครั้งแรกที่ probe ทำงาน มันต้อง PASS ฝั่ง production และ FAIL ฝั่ง staging**
ถ้าได้ผลอื่น แปลว่า probe ผิด ไม่ใช่ระบบผิด — ใช้เป็นเกณฑ์ยอมรับข้อแรก

ตาข่ายรอง: waiver ที่ operator เซ็น ตามกลไกเดิม — agent เซ็นให้ตัวเองไม่ได้ (L6)

---

## 5. การทดสอบ

**RED-first บังคับ** (§5 ชั้น B — เปลี่ยน executable behavior)

| # | เทสต์ | RED ที่ต้องเห็นก่อน |
|---|---|---|
| 1 | `/api/health` มีฟิลด์ `revision` จาก `GIT_SHA` | ฟิลด์ไม่มี |
| 2 | `GIT_SHA` ว่าง ⇒ `revision: null` **ไม่ใช่** `"unknown"` | ยังไม่มีโค้ด |
| 3 | ฟิลด์เดิมทั้งหมดของ `/api/health` ไม่เปลี่ยนรูป | — (regression guard, `production-smoke.test.js` ต้องยังเขียว) |
| 4 | `/api/version` ของ frontend ตอบ `revision` | route ไม่มี |
| 5 | probe: revision ต่างจาก ref ⇒ exit 1 พร้อมบอก sha สองฝั่ง | สคริปต์ไม่มี |
| 6 | probe: endpoint ยิงไม่ถึง ⇒ exit 1 และข้อความบอกว่าเป็นเครือข่าย **ไม่ใช่ PASS** | สคริปต์ไม่มี |
| 7 | probe: `revision` เป็น null ⇒ exit 1 | สคริปต์ไม่มี |
| 8 | probe: `deploy-targets.txt` ว่าง ⇒ exit 1 ไม่ใช่ exit 0 | สคริปต์ไม่มี |
| 9 | probe: ไม่มี `curl` ⇒ exit 2 (NOT-RUN) ไม่ใช่ exit 1 | สคริปต์ไม่มี |

probe ทดสอบด้วย selftest แบบเดียวกับ `gacp-backup.selftest.sh` — HTTP ปลอมผ่านสคริปต์ `curl` ใน `PATH`
**บทเรียนจาก `gacp-backup.selftest.sh` 2026-08-14: stub ที่ปลอดภัยกว่าของจริงทำให้เทสต์โกหก**
⇒ ทุกเคสต้องพิสูจน์ว่ามันแดงกับโค้ดก่อนแก้ ไม่ใช่แค่เขียวกับโค้ดหลังแก้

---

## 6. สิ่งที่ใบนี้ **ไม่** ปิด — บันทึกให้ตรง

- **ไม่ได้พิสูจน์ว่าเบราว์เซอร์ไม่ยิงออกนอกประเทศ** — probe อ่านแค่ว่า "รันจาก commit ไหน"
  ถ้า commit นั้นสะอาดตาม `check-data-sovereignty.js` ก็อนุมานได้ว่า bundle สะอาด
  **แต่เป็นการอนุมาน ไม่ใช่การสังเกต** · การวัดจริงต้อง headless browser — ใบถัดไป
- **ไม่ครอบคอนเทนเนอร์ที่ไม่มี HTTP endpoint** — postgres, redis, minio, nginx, ชุด monitoring
  ตรวจไม่ได้ด้วยวิธีนี้ ต้องดูจาก image label ผ่าน docker ซึ่งต้องรันบนเครื่อง
- **`version: '3.0.0'` ยังเป็น hardcode** ตามข้อ 2
- **SHA เปิดสาธารณะ** — รีโปเป็น private คนนอกเอา SHA ไปเปิดอะไรไม่ได้ แต่บอกได้ว่าเราตามหลังแค่ไหน
  ยอมรับความเสี่ยงนี้เพื่อแลกกับการที่ทุกเครื่องตรวจซ้ำได้โดยไม่ต้องถือกุญแจเซิฟเวอร์
- **image tag เป็น mutable** (`main-latest`, `deploy-production-latest`) — `latest` ชี้ที่ไหนเปลี่ยนได้
  ตลอด ใบนี้ตรวจ "รันจาก commit ไหน" ซึ่งแก้อาการได้ แต่ไม่ได้แก้เหตุ · การ pin เป็น digest คือคนละใบ
- **ชุด monitoring ใช้ tag `:latest` ทั้งหมด** (prometheus, grafana, loki, cadvisor, minio, pgadmin)
  และ `gacp-restore-drill` จากการซ้อมเมื่อวานยังค้างอยู่ — **บันทึกไว้เป็นข้อสังเกต** ไม่ใช่ scope ใบนี้

# Deep QA audit — Apple standard · 2026-09-07

ตรวจ build `09dde784` บน `demo.gacpth.com` ด้วยเบราว์เซอร์จริง (Chromium + axe-core 4.11.4)
กด พิมพ์ และสมัครบัญชีใหม่ผ่านหน้าจอจริง ไม่ได้เขียนฐานข้อมูลตรง

รายงานฉบับเต็ม: `REPORT.html` · artifact: https://claude.ai/code/artifact/7ae75a2d-1abd-4bed-a856-7a8268d11ff2

## ผล
- **9 Critical** · 14 Lack of Polish · 4 Polish Opportunity · 9 จุดที่ทำได้ดีจริง
- ต้นเหตุร่วม 5 ข้อ — แก้ที่ต้นเหตุ อาการหายเป็นพวง

## ข้อจำกัดที่ต้องอ่านก่อนใช้
Workflow ตรวจ 7 มิติชน session limit — เสร็จ 3 มิติ และ **ชั้นหักล้าง adversarial ล้มทั้งหมด**
ทุกข้อใน `REPORT.html` ผมวัดซ้ำเองด้วยเบราว์เซอร์จริง และตัดข้อที่เกินจริงออก 1 ข้อ
(ผู้ตรวจรายงานว่าหัวเรื่องหน้าสแกน "ถูกตัดครึ่ง" — วัดจริงได้ 16px)
ข้อค้นพบที่ยังไม่ได้พิสูจน์อีก 20 ข้ออยู่ใน `findings-unverified.json` — **ยังไม่ควรใช้ตัดสินใจ**

## ไฟล์
| ไฟล์ | คืออะไร |
|---|---|
| `REPORT.html` | รายงานฉบับเต็ม |
| `report-public__w1440__light.json` · `__w390__light` · `__w1440__dark` | ผลกวาด 24 เส้นทางสาธารณะ: status, loadMs, CLS, axe, console error, ฟอนต์ที่ resolve จริง |
| `report-auth__w1440__light.json` · `__w390__light` | ผลกวาด 31 เส้นทางหลังล็อกอิน (บัญชีใหม่ = empty state) |
| `findings-unverified.json` | 35 ข้อจาก workflow ที่ยังไม่ผ่านการหักล้าง |
| `shots/` | ภาพหลักฐาน 27 ภาพที่ผูกกับข้อค้นพบ |
| `harness/` | สคริปต์ทุกตัวที่ใช้วัด — รันซ้ำได้ |

## รันซ้ำ
```bash
cd apps/web-app   # เพื่อให้ createRequire หา @playwright/test เจอ
node harness/capture.mjs <outdir> w1440 1440 900 light harness/routes-public.json
AUTH_STATE=<auth.json> node harness/capture-auth.mjs <outdir> w390 390 844 light harness/routes-auth.json
```
`auth.json` ไม่ได้เก็บไว้ที่นี่เพราะมี session token — สร้างใหม่ด้วย `harness/save-auth.mjs`

## ข้อที่ต้องแก้ก่อนพาใครมาดู
1. โหมดมืด: ช่องกรอกเลขบัตร contrast 1.12 — พิมพ์แล้วมองไม่เห็น (C-01)
2. เกษตรกรที่ยื่นครั้งแรกถูกบล็อกที่ขั้น 2 ทุกราย (C-03)
3. คำเตือนฉุกเฉินบนหน้าสแกน QR สาธารณะ ตัวขาวบนพื้นชมพู 1.09 (C-05)

## บัญชีทดสอบที่สร้างบน demo (ลบได้)
- `3999000000005` — ทดสอบคุณภาพ ระบบจีเอซีพี · มี draft คำขอ 1 ใบ
- `3998000000012` — ทดสอบกดซ้ำ ระบบจีเอซีพี · ใช้พิสูจน์ C-03
ทั้งคู่สมัครผ่านหน้าจอจริง status = PENDING_VERIFICATION


## 2026-09-07 ภาคสอง — แก้แล้ว วัดซ้ำบนเครื่องจริง

operator อนุมัติให้แก้ทั้งสามข้อ · แก้และพิสูจน์บน `staging.gacpth.com` ครบแล้ว (4 รอบ build/deploy/วัด)

| รายการ | ก่อน | หลัง |
|---|---|---|
| เลขบัตรที่พิมพ์ โหมดมืด | 1.12:1 | **14.76:1** |
| รายการสิทธิ์ /auth โหมดมืด | 1.02:1 | **12.70:1** |
| ปุ่มรอง 404 โหมดมืด | 1.02:1 | **12.91:1** |
| ปุ่ม EN หน้า /accessibility | 1.05:1 | ผ่าน |
| คำเตือนฉุกเฉิน หน้าสแกน QR | 1.09 / 1.11 | **7.60 / 5.91** |
| ป้าย "รอการเชื่อมต่อ" | 1.71:1 | ผ่าน |
| ผู้ยื่นครั้งแรกเห็นรายการเอกสาร | 0 ใบ + error เท็จ | ขึ้นครบ |

รวม contrast failure: โหมดมืด **17 → 13** (แย่สุด 1.02 → 2.17) · โหมดสว่าง **16 → 4** (แย่สุด 1.03 → 3.81)
ที่เหลือทั้งหมดเป็นของเดิมที่รายงานไว้แล้ว (forgot-password 3.21 · FAQ 4.0 · verify labels · auth CTA 3.81)

**แก้ข้อสรุปเดิม:** รายงานรอบแรกเขียนว่าผู้ยื่นครั้งแรก "ถูกบล็อก" — ไม่ถูก ปุ่มปิดเพราะช่องยังว่าง
ซึ่งถูกต้อง สิ่งที่เป็นข้อบกพร่องคือข้อความ error เท็จ + รายการเอกสารไม่ขึ้นเลย (slot card = 0)

เครื่องที่กันไม่ให้กลับมา:
- `scripts/probes/themed-surface-tokens.sh` — run:ci, selftest 6 เคส (รวมเคส F = ความพลาดของผมเองที่ชี้ probe ไปไฟล์เดียว)
- `apps/web-app/src/styles/__tests__/themed-surfaces-have-dark-values.test.ts` — 21 เทส คำนวณ contrast จาก token จริง
- `apps/web-app/.../__tests__/first-filing-sees-its-documents.test.tsx` — 6 เทส

Gate เทียบ baseline: probe FAIL 5 ชื่อเดิมเป๊ะ ไม่มีความล้มเหลวใหม่ · web-app suite 368/368 · 2956/2956

หลักฐานหลังแก้: `after-fix/` (report JSON สองธีม + ภาพ)

## บัญชีทดสอบเพิ่ม (ลบได้ทั้งหมด)
`3997000000011`, `3996000000011`, `3995000000010` — ใช้พิสูจน์ C-03 ว่าเกิดกับผู้ยื่นครั้งแรกทุกราย

## หน้าสแกน QR สาธารณะ — A/B วันเดียวกัน โปรไฟล์ 4G ช้าเหมือนกัน

| | demo (client fetch, ของเดิม) | staging (server fetch, ของใหม่) |
|---|---|---|
| DOM ready | 728 ms | 4162 ms |
| **คำตอบปรากฏบนจอ** | **10,319 ms** | **4,209 ms** |
| **CLS** | **0.1915** | **0.0005** |
| หัวเรื่อง | ถูกการ์ดบัง 16px | ครบสองบรรทัด |

TTFB ช้าลงจริงเพราะ server รอ API ก่อนส่ง HTML — แลกกับการที่ผู้ซื้อเห็นคำตอบเร็วขึ้นเท่าตัว
และไม่มีช่วงจอว่าง/สปินเนอร์ · ที่เหลือ 4.2 วินาทีคือ API `/api/trace/<qr>` เองซึ่งวัดได้ 2.7 วินาที
เป็นงานฝั่ง backend ไม่ใช่ frontend

ภาพ: `after-fix/scan-before-demo.png` และ `after-fix/scan-after.png`


## ประตูสแกนสาธารณะ ทั้งสองบาน — วัดบน staging เมื่อเครื่องว่าง (4G ช้า, 390px)

| | ก่อน | หลัง |
|---|---|---|
| `/trace/<qr>` คำตอบปรากฏ | 10,319 ms | **3,582 ms** |
| `/trace/<qr>` CLS | 0.1915 | **0.0008** |
| `/trace/lot/<id>` คำตอบปรากฏ | (client fetch) | **4,358 ms** |
| `/trace/lot/<id>` CLS | — | 0.0909 |
| ระยะห่าง DOM → คำตอบ | ~7,500 ms | **~40 ms** |

ตัวเลขสำคัญคือบรรทัดสุดท้าย: คำตอบอยู่ใน HTML ชุดแรกแล้ว ไม่ต้องรอ bundle + round trip
เวลาที่เหลือคือ API เอง ซึ่งเป็นงานฝั่ง backend

**หมายเหตุการวัด:** รอบแรกได้ 6.8s เพราะเครื่องกำลัง build อยู่ (load average 2.5)
วัดซ้ำตอน load 1.2 ได้ตัวเลขข้างบน — บันทึกไว้เพื่อไม่ให้ใครอ่านตัวเลขผิดรอบ

## axe หลังแก้ครบ (staging, 11 เส้นทาง)
- โหมดสว่าง 1440: **CLEAN** · โหมดมืด 1440: **CLEAN** · โหมดสว่าง 390: **CLEAN**
- เริ่มต้นที่ 17 dark / 16 light


## รอบที่สอง — operator สั่ง "deploy ก่อน แล้วทำทั้งหมด" (2026-09-07/08)

deploy `5bb095c0` ขึ้น demo + production แล้วไล่งานที่เหลือทั้งหมด · วัดซ้ำบน staging ทุกครั้ง

### ผลรวมที่วัดได้
| ตัวชี้วัด | เริ่มต้น | ตอนนี้ |
|---|---|---|
| axe contrast โหมดมืด (11 เส้นทาง) | 17 | **0** |
| axe contrast โหมดสว่าง | 16 | **0** |
| axe contrast มือถือ 390 | — | **0** |
| `/trace/<qr>` คำตอบปรากฏ | 10,319 ms | **3,582 ms** |
| `/trace/<qr>` CLS | 0.1915 | **0.0008** |
| `/trace/lot/<id>` คำตอบปรากฏ | client fetch | **4,358 ms** |
| login: จำนวน hop | 4 | **3** |
| login: เวลา | 6,124 ms | **4,247 ms** |

### สิ่งที่ workflow ตรวจเจอว่าเป็นบั๊กที่ **ผมเพิ่งเขียนเอง**
1. theme transition ไม่เคารพ `prefers-reduced-motion` — `.theme-transition` (0,1,0) ชนะ `*` (0,0,0) ทั้งที่ทั้งคู่ `!important`
2. provider ลบคลาสธีมตอน commit แรก ทำให้ผู้ใช้โหมดมืดเห็น มืด→สว่างแวบ→fade กลับมืด ทุกครั้งที่โหลด
3. probe ที่ผมเขียนอ่านไฟล์เดียวจาก 5 ไฟล์ จึงรายงาน PASS ให้บั๊กที่ยัง ship อยู่
4. auto-select พืชเขียน store ตั้งแต่ mount (เทส `indexedDB is not defined` จับได้)
5. demote ประตู IdP ครั้งแรกใช้ `status !== 'coming_soon'` — ประตูเจ้าหน้าที่ status เป็น `unknown` จึงยังเขียว
6. รอบต่อมายังไม่หมด เพราะ officer ระบายสีผ่าน `primaryClassName` คนละทางกับ `variant`

### เครื่องที่เพิ่มเข้าไป
- `scripts/probes/themed-surface-tokens.sh` — run:ci, selftest 6 เคส (กวาดทั้ง `src/styles/`)
- `themed-surfaces-have-dark-values.test.ts` — 24 เทส
- `thai-text-keeps-its-marks.test.ts` — 3 เทส ผูกกับหมึกจริง 72px ที่วัดได้
- `colour-classes-must-exist.test.ts` — 14 เทส · จับคลาสสีที่คอมไพล์ไม่ออก (พบของจริง 10 จุด)
- `first-filing-sees-its-documents.test.tsx` — 6 เทส
- payments-states: 2 เทสใหม่

### บัญชีทดสอบเพิ่ม
demo: `3999000000005` `3998000000012` `3997000000011` `3996000000011` `3995000000010`
staging: `3994000000019` — ลบได้ทั้งหมด


## Deploy ปิดรอบ — 2026-09-08

`b57e5963` ขึ้นครบทั้งสามเครื่อง (frontend อย่างเดียว · backend ไม่ถูกแตะ · migration 0 ไฟล์)

```
gacp-frontend          demo-b57e5963   (production)
gacp-frontend-demo     demo-b57e5963
gacp-frontend-staging  staging-9aa43489   (เนื้อเดียวกัน ต่างแค่คอมมิต evidence)
```

**ตรวจหลัง deploy**
- demo 11 เส้นทาง × 3 ชุด (มืด/สว่าง/มือถือ): **axe CLEAN ทุกชุด** · ไม่มีหน้าไหนตอบไม่ใช่ 200
- production: เข้าตรงคอนเทนเนอร์ที่ `172.18.0.7:3000` (ภายนอกมีม่านปิด public) — `/auth` ตอบ 200
  ทั้งสองธีม **axe violations = 0** · `ชำระค่าธรรมเนียม` เป็น `white-space: nowrap` · รายการสิทธิ์ในการ์ด
  มีสีจริง `rgba(242,242,242,.9)` บนพื้นเข้ม (ตอนเริ่ม audit บล็อกนี้มองไม่เห็นทั้งหมด)
- ภาพ: `after-fix/prod-auth-dark.png`, `after-fix/prod-auth-light.png`
- รายงาน demo: `after-fix/report__*-demo.json`

`gacpth.com` ตอบ 403 จากภายนอกตามมติม่านปิด public 2026-09-05 — ไม่ใช่ความผิดพลาด

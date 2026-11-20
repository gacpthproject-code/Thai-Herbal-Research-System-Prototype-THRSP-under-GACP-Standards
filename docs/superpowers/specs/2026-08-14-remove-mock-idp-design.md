# Remove mock IdP — ถอนระบบยืนยันตัวตนจำลองชั้นผู้ใช้เห็นทั้งหมด (2026-08-14)

## 1. คำสั่งและเหตุผล

Operator สั่ง 2026-08-14: **"เอางาน mock ออกทั้งหมด เราจะใช้งานจริง เวลาเทสใช้ไอดีจริง ๆ
หรือแอดจาก database สำหรับเทส แล้วคลีนให้สะอาด"** และเลือกขอบเขต **A — รื้อชั้นผู้ใช้เห็นทั้งหมด**
(ตัวจำลองภายใน jest ที่ไม่เคยถูก deploy คงไว้ได้ตามมาตรฐานวิศวกรรม)

Spec นี้ **supersede เฉพาะส่วน mock IdP** ของ `2026-08-14-login-front-door-design.md`
(ส่วน ThaID/หมอพร้อม/ประตูรหัสผ่านของ spec นั้นคงเดิม) และ**ยกเลิก** branch
`fix/seed-mock-demo-officer` ที่ยังไม่ merge (ลบ branch ทิ้ง — งานนั้นมีไว้ให้ mock login
ทำงาน จึงตายพร้อมกัน)

หลักที่คุมทั้งใบ: ห้ามมีคำว่า "ทดลอง/จำลอง/DEMO" บนหน้าใด ๆ ที่ผู้ใช้เห็น และห้ามมี
endpoint จำลองบนเซิร์ฟเวอร์ ไม่ว่า environment ใด

## 2. สิ่งที่ลบ (ทั้งไฟล์)

| ไฟล์ | คืออะไร |
|---|---|
| `apps/web-app/src/app/auth/mock-idp/authorize/page.tsx` | หน้ายินยอมจำลอง |
| `apps/web-app/src/app/auth/mock-idp/callback/page.tsx` | หน้ารับ redirect จำลอง |
| `apps/web-app/src/app/auth/mock-idp/__tests__/mock-idp-pages.test.tsx` | เทสของสองหน้านั้น |
| `apps/web-app/src/lib/navigation.ts` | seam `hardNavigate` — consumer เดียวคือ mock callback · บทเรียน jsdom ที่บันทึกในคอมเมนต์กู้คืนได้จาก commit `c3fd6ff3` เมื่อหน้า ThaID callback จริงถูกสร้าง (งานอนาคต รอ key) |
| `apps/backend/services/auth/idp/mock-idp-adapter.js` | mock adapter + fixtures ทั้งชุด |

## 3. สิ่งที่แก้ (บางส่วนของไฟล์)

| ไฟล์ | แก้อะไร |
|---|---|
| `apps/backend/routes/api/auth/auth-idp.js` | ลบ route `mock/authorize-url` + `mock/callback` + `resolveMockSession` + ทุก reference ถึง mock adapter |
| `apps/backend/config/auth-providers.js` | เอา `mock` ออกจาก `PROVIDER_KEYS` · ลบ `MOCK_DEFAULTS` และ branch พิเศษของ mock ทั้งหมด |
| `apps/backend/.env.example` | ลบบรรทัด `AUTH_MOCK_STATE` |
| `apps/web-app/src/app/auth/_components/login-chooser.tsx` | ลบแถบ DEMO + `showDemo` + ทุก copy ที่พูดถึงบัญชีทดลอง |
| `apps/web-app/src/app/auth/_components/__tests__/login-chooser.test.tsx` | ลบ pin ของแถบ DEMO · เพิ่ม pin กลับด้าน: **ห้าม**มีข้อความ "ทดลอง/จำลอง/DEMO" render ในทุกสถานะ feed |
| `apps/backend/__tests__/unit/auth-idp-providers-endpoint.test.js` | เคส mock → ใช้เกณฑ์ข้างล่างตาราง |
| `apps/backend/__tests__/unit/auth-providers-config.test.js` | เคส mock → ใช้เกณฑ์ข้างล่างตาราง |
| `apps/backend/__tests__/unit/idp-rate-limit.test.js` | path ตัวอย่าง `/mock/*` ในเทส → เปลี่ยนเป็น `/thaid/*` (ตัว middleware generic อยู่แล้ว ไม่แก้) |
| `apps/backend/__tests__/unit/auth-idp-routes.test.js` | ดูข้อ 4 — ใหญ่สุดของใบนี้ |

เกณฑ์ตัดสินเทสเดิมที่พูดถึง mock (ใช้กับทุก suite ในตาราง):
- เทสพิสูจน์พฤติกรรม **เฉพาะของ mock** (เช่น mock มี REQUIRED_ENV ว่าง, fixture code แต่ละตัว) → **ลบ**
- เทสพิสูจน์พฤติกรรม **กลางของระบบ** โดยแค่ใช้ mock เป็นพาหนะ (state machinery, การ resolve
  `enabled`, fail-closed) → **แปลงพาหนะเป็น thaid** โดยพฤติกรรมที่ assert ต้องคงเดิม

## 4. Coverage ที่ต้องย้าย ไม่ใช่ลบ (เกราะต้องไม่หลุดเทสแม้วันเดียว)

เกราะ OAuth ต่อไปนี้เป็นของ**เส้นจริงทุกเส้น** แต่ปัจจุบันถูกพิสูจน์ผ่าน endpoint mock
ใน `auth-idp-routes.test.js` — ต้องเขียนใหม่ให้พิสูจน์ผ่าน **endpoint thaid** โดย jest-mock
ตัว thaid adapter (ตัวจำลองภายในเทส — ชั้นที่ operator อนุมัติให้คงอยู่):

1. state บังคับทุก authorize URL · ปฏิเสธ callback ที่ไม่มี state
2. state cookie: httpOnly + HMAC-signed + อายุ ≤10 นาที + **ใช้ครั้งเดียว** (replay = ปฏิเสธ)
3. callback ที่ state ไม่ตรง cookie = ปฏิเสธ + audit FAILURE
4. no auto-provision: บัญชีที่ไม่อยู่ในทะเบียน = 403 + ห้าม `create/upsert` (auditor check #4)
5. บัญชีไม่ ACTIVE = ปฏิเสธ ACCOUNT_INACTIVE ก่อน mint session
6. session สำเร็จ = httpOnly cookie เท่านั้น ห้ามมี token ใน response body (E-4)
7. audit log ครบทั้ง SUCCESS/FAILURE พร้อม reason

เงื่อนไขผ่าน: จำนวน assertion เชิงพฤติกรรมของเกราะเหล่านี้ใน suite ใหม่ ≥ ของเดิม
(นับแล้วแนบใน evidence) และทุกข้อ RED ก่อน GREEN ตามปกติ

## 5. ทะเบียน provider หลังรื้อ

- `PROVIDER_KEYS = [local, healthid, providerid, thaid]` — ไม่มี `mock`
- `/api/auth/idp/providers` ไม่ส่ง entry mock อีก · หน้า `/auth` เหลือ 3 ทาง:
  **ThaID · หมอพร้อม (Health ID) · เข้าด้วยรหัสผ่าน**
- ปุ่ม ThaID/หมอพร้อม **คงอยู่ตามข้อบังคับกระทรวง** สถานะ "รอเปิดใช้งาน" จนกว่าได้ key
  (พฤติกรรมเดิม ไม่แตะ)

## 6. ของจริงที่ใช้แทน (ไม่มีงานโค้ดในใบนี้ — ระบุไว้กัน scope งอก)

- เดโม/เทสบน staging: แอดมิน → `/provider/management` → **เพิ่มพนักงาน**
  (เลข 13 หลัก + รหัสผ่าน, มี privilege-escalation guard อยู่แล้ว) → เจ้าหน้าที่คนนั้น
  ล็อกอินผ่านประตูรหัสผ่านจริงบน `/auth`
- เมื่อได้ key sandbox จาก DOPA (หนังสือ DTAM — งานฝั่ง operator): เทส ThaID ด้วย
  บัตรประชาชนจริงของผู้ทดสอบที่ลงทะเบียน — จุดนั้นค่อยสร้างหน้า callback จริง (spec แยก)

## 7. Acceptance criteria (พิสูจน์บน staging หลัง redeploy)

1. `/auth` render โดยไม่มีสตริง "ทดลอง", "จำลอง", "DEMO" ที่ใดเลย
2. `/auth/mock-idp/authorize` และ `/callback` ตอบ 404
3. `POST /api/auth/idp/mock/callback` และ `mock/authorize-url` ตอบ 404
4. `/api/auth/idp/providers` ไม่มี key `mock` ใน payload
5. `grep -r "mock-idp" apps/` (นอก `__tests__`/jest doubles) = 0 แถว
6. ทุก suite backend + web เขียว · ratchet ทุกตัวนับ ≤ baseline (คาดว่าลด)
7. เดินจริงโดย operator: เพิ่มพนักงานผ่าน `/provider/management` → ล็อกอินบัญชีนั้นผ่าน
   ประตูรหัสผ่าน → ถึง dashboard — ภาพหน้าจอเข้า view-pack

## 8. นอกขอบเขต

- E2 (admin แก้ copy หน้า login) — spec แยกที่รอรีวิวอยู่ ไม่พันกัน
- หน้า callback ThaID จริง + การต่อ sandbox — ต้องมี key ก่อน (spec แยกเมื่อถึงเวลา)
- เอกสาร/evidence เก่าที่เล่าเรื่อง mock — เป็นบันทึกประวัติศาสตร์ ไม่แก้ย้อน
- seed อื่น ๆ ใน `apps/backend/scripts/seed-*` ที่ไม่เกี่ยวกับ mock IdP — อยู่นอกใบนี้

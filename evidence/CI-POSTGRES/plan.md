# R-CI-1 — Postgres จริงใน CI: สิ่งที่พบจริง vs สิ่งที่สั่ง

คำสั่ง operator 2026-08-03 ข้อ 1:
> เพิ่ม Postgres service container ใน `.github/workflows/ci.yml` + set `DATABASE_URL` +
> `prisma migrate deploy` + `generate` ในขั้น setup → เป้าหมาย: 2 integration test ที่ skip อยู่ต้องรันจริงบน CI

## ข้อเท็จจริงที่ต้องแก้ก่อน: **ของพวกนั้นมีอยู่แล้วครบทุกตัว**

`.github/workflows/ci.yml` job `test` (`:398`) มีมาก่อนหน้านี้แล้ว:

| สิ่งที่สั่งให้เพิ่ม | สถานะจริงก่อนแก้ | ที่ |
|---|---|---|
| Postgres service container | **มีอยู่แล้ว** — `postgres:15` + `POSTGRES_DB: gacp_test` + health-check | `ci.yml:403-416` |
| `DATABASE_URL` | **มีอยู่แล้ว** — `postgresql://test:test@localhost:5432/gacp_test` ทั้ง step migrate และ step test | `ci.yml:439`, `:466` |
| `prisma generate` | **มีอยู่แล้ว** | `ci.yml:433-435` |
| `prisma migrate deploy` | **มีอยู่แล้ว** | `ci.yml:437-441` |

⇒ **ไม่ต้องเพิ่ม service container และไม่ต้องตั้ง secret ใด ๆ**

## สาเหตุจริงที่ 2 test ไม่เคยรัน

step ที่รัน jest ใช้ **allowlist แบบ curated** ผ่าน `--testPathPattern` (`ci.yml:463-473`)
และ **ทั้งสองไฟล์ไม่อยู่ในรายการนั้น**:

```
$ grep -q 'cert-issuance-atomicity' .github/workflows/ci.yml   → NOT in pattern
$ grep -q 'optimistic-lock'         .github/workflows/ci.yml   → NOT in pattern
```

ผลรวมสองชั้นที่ทำให้ไม่มีใครเห็น:
1. **บน CI** — ไม่ถูก select เลย (ไม่อยู่ใน pattern) จึงไม่ปรากฏใน report ว่ามีอยู่ด้วยซ้ำ
2. **ในเครื่อง/sandbox** — ถูก select แต่ `describe.skip` ตัวเอง เพราะ
   `const HAS_DB = Boolean(process.env.DATABASE_URL)` เป็น false ⇒ รายงานว่า "skipped" ไม่ใช่ "failed"

⇒ test ทั้งสองตัว **ไม่เคยรันจริงเลยตั้งแต่เขียนมา** ทั้งที่โครงสร้าง CI พร้อมมาตลอด

## การแก้ที่ทำจริง (เล็กกว่าที่สั่ง เพราะโครงสร้างมีแล้ว)

1. เพิ่มสองไฟล์เข้า `--testPathPattern` — `integration/cert-issuance-atomicity-be-t1|integration/optimistic-lock-wf-f7`
2. เพิ่ม step ใหม่ **"Assert real-Postgres suites actually ran (not skipped)"** — เพราะ
   **jest exit 0 เมื่อ suite skip ตัวเอง** ⇒ "เขียว" อย่างเดียวไม่พิสูจน์ว่ารันจริง step นี้อ่าน
   `--json` output แล้ว fail เมื่อ: suite ≠ 2 · มี pending/todo > 0 · passed = 0
3. คอมเมนต์อธิบายเหตุผลไว้เหนือ pattern (ทำไมเคยหาย + ทำไมไม่ต้อง seed)

### ทำไมไม่ต้อง seed script
ทั้งสองไฟล์ **self-seeding**: สร้าง `organization` → `user` → `application` เองใน `beforeAll`/`beforeEach`
โดยใช้ suffix `${Date.now()}-${random}` และลบของตัวเองใน `afterEach`/`afterAll` ด้วย `deleteMany`
ที่ scope ด้วย id ของตัวเอง ⇒ DB ที่ migrate แล้วแต่ว่างเปล่าก็พอ และชนกันเองไม่ได้
(`cert-issuance-atomicity-be-t1.test.js:25-60`, `optimistic-lock-wf-f7.test.js:28-68`)

### env ที่สองไฟล์ต้องใช้
`DATABASE_URL` **ตัวเดียว** — `grep process.env` ในทั้งสองไฟล์เจอแค่บรรทัด `HAS_DB` เท่านั้น
step ที่รันอยู่ให้ `JWT_SECRET`/`ENCRYPTION_KEY`/`NODE_ENV` มาด้วยอยู่แล้ว

## สิ่งที่ operator ต้องตั้งเอง

**ไม่มี** — ไม่ต้องใช้ secret ใหม่, ไม่ต้องแก้ setting ของ repo, ไม่ต้องเปิดสิทธิ์อะไรเพิ่ม
credentials ของ Postgres ใน CI เป็นค่า throwaway ที่ hardcode อยู่ใน workflow อยู่แล้ว
(`test:test@localhost:5432/gacp_test`) ซึ่งถูกต้องสำหรับ service container ที่มีอายุเท่ากับ job
และไม่ใช่ secret จริง

## ข้อจำกัดของรายงานนี้ (Law 3.9)

**orchestrator รันสองไฟล์นี้เองไม่ได้** — container นี้ไม่มี Postgres (พอร์ต 5432 ปิด, ไม่มี `.env`)
และ `prisma generate` ก็รันไม่ได้เพราะ proxy บล็อกการโหลด engine (403 จาก `binaries.prisma.sh`)
⇒ **หลักฐานว่า test รันจริงต้องมาจากผล CI ของ PR นี้เท่านั้น** ตามที่ operator กำหนด
("พิสูจน์ด้วยผล run ที่ไม่ใช่ skipped")

**ความเสี่ยงที่ประเมินไว้**: ถ้าสอง suite นี้ fail บน CI จริง จะเป็นครั้งแรกที่มันรัน — ผลอาจเป็น
bug จริงที่ซ่อนมานาน ไม่ใช่ความผิดของ PR นี้ ถ้าเกิดกรณีนั้นให้รายงานตามจริง **ห้ามถอด test ออก
เพื่อให้เขียว** (Law 3.7)

## ข้อ 2 ของคำสั่ง — `dataset-export-service.test.js:81`

หลังข้อ 1 เขียว ให้ตรวจว่าหลุดจาก fail list ไหม · **คาดว่าใช่** เพราะสาเหตุคือ codegen:
`Prisma.dmmf` เป็น `undefined` เมื่อ client ยังไม่ generate — และ job `test` รัน `npx prisma generate`
อยู่แล้ว (`ci.yml:433-435`) · **แต่ต้องดูผลจริง**: ไฟล์นี้ก็ไม่อยู่ใน curated pattern เหมือนกัน
(`grep 'dataset-export' ci.yml` = ไม่มี) ⇒ ถ้าอยากพิสูจน์ต้องเพิ่มเข้า pattern ด้วยเป็น PR ถัดไป
— **ไม่รวมใน PR นี้** เพราะ operator สั่งให้ PR นี้เล็กและโฟกัสข้อ 1

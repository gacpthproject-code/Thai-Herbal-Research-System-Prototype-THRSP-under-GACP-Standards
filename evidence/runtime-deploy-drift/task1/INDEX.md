# Task 1 — backend รายงาน commit ที่ตัวเอง build มา · 2026-08-14

**Status:** `BLOCKED(operator:merge-tier-c)` — โค้ดเสร็จ RED/GREEN ครบ รอ operator merge

| | |
|---|---|
| branch | `feat/runtime-deploy-drift` @ `20fcfc5d` |
| tier | **C** (`scripts/probes/tier-check.sh`) — `.github/workflows/build-images.yml` และ `apps/backend/Dockerfile` = `infra` |
| แผน | `docs/superpowers/plans/2026-08-14-runtime-deploy-drift.md` Task 1 |
| spec | `docs/superpowers/specs/2026-08-14-runtime-deploy-drift-design.md` |
| เครื่องที่รัน | Windows dev · node v24.19.0 · jest 29.7.0 |

## ทำไม tier เป็น C ทั้งที่แผนเขียนว่า B

```
  C  .github/workflows/build-images.yml  (infra)
  C  apps/backend/Dockerfile             (infra)
  A  apps/backend/__tests__/unit/build-info.test.js  (test)
  B  apps/backend/routes/api/index.js    (business-logic-or-ui)
  B  apps/backend/shared/build-info.js   (business-logic-or-ui)
TIER=C
```

แผนประเมิน tier เองแทนที่จะรัน `tier-check.sh` ซึ่ง CLAUDE.md L5 ห้ามไว้ตรง ๆ
(*"tier ตัดสินโดย `scripts/probes/tier-check.sh` เท่านั้น ห้ามประเมินเอง"*) — บันทึกไว้เป็นข้อผิดพลาด
ของแผน ไม่ใช่ของ tier-check · **Task 2 จะเป็น C ด้วยเหตุผลเดียวกัน** เพราะแตะ
`apps/web-app/Dockerfile` และ workflow เดียวกัน

## RED — ก่อนเขียนโมดูล

```
Test Suites: 1 failed, 1 total
Tests:       0 total
  at Object.require (__tests__/unit/build-info.test.js:16:23)
  Cannot find module '../../shared/build-info'
RED exit=1
```

ล้มเพราะโมดูลไม่มี ซึ่งเป็นเหตุผลที่ถูกต้อง — ไม่ใช่พิมพ์ผิดที่อื่น และไม่ใช่ 0 test ที่ผ่านเงียบ

## GREEN — หลังเขียนโมดูล

```
PASS __tests__/unit/build-info.test.js
  buildInfo
    √ reports the commit from GIT_SHA
    √ reports the build time from BUILT_AT
    √ reports null when GIT_SHA was never set
    √ reports null when GIT_SHA is empty — an ARG with no value expands to ""
    √ reports null when GIT_SHA is only whitespace
    √ trims a trailing newline — shell substitution in a build arg leaves one
    √ never invents a placeholder for an absent value
Tests:       7 passed, 7 total
GREEN exit=0
```

## Regression — สัญญาเดิมของ `/api/health` ไม่ขยับ

```
Test Suites: 1 passed, 1 total
Tests:       16 passed, 16 total
smoke exit=0
```

`production-smoke.test.js:192` ยืนยัน `version === '3.0.0'` — ฟิลด์นั้นไม่ถูกแตะ เพิ่ม `revision`
กับ `builtAt` เข้าไปข้าง ๆ เท่านั้น

## pre-commit hook

`51 passed, 0 failed, 0 warnings` + trust-domain lint ผ่าน (รันจริงตอน commit `20fcfc5d`)

## สิ่งที่ **ยังไม่** ได้พิสูจน์ — สำคัญกว่าที่พิสูจน์แล้ว

| ข้อ | ทำไมยังไม่พิสูจน์ | จะพิสูจน์ที่ไหน |
|---|---|---|
| `/api/health` ส่ง `revision` ออกมาจริง | `production-smoke.test.js:116` สร้าง express app จำลองของตัวเอง ไม่ใช่ router จริง · การบูต router จริงต้องมี Postgres ซึ่งเครื่องนี้ไม่มี | Task 5 — `curl` ใส่ image ที่ deploy แล้ว |
| build arg เดินทางเข้า image จริง | เครื่องนี้ไม่มี Docker | Task 5 ขั้นที่ 3 — `docker run --entrypoint sh ... echo $GIT_SHA` |
| `build-images.yml` ที่แก้ทำงานได้ | Actions นาทีหมดถาวรตามคำสั่ง operator 2026-08-14 ⇒ **workflow นี้จะไม่รันจนกว่าจะมีคำสั่งใหม่** — การแก้ถูกต้องเมื่อ CI กลับมา แต่วันนี้ยังไม่มีใครยืนยันได้ | ต้องรอ CI หรือกด Runner Dispatch Probe |

⇒ **ห้ามอ่านใบนี้ว่า "endpoint ใช้งานได้แล้ว"** ใบนี้พิสูจน์แค่ว่าโมดูลที่แปลง env → `{revision, builtAt}`
ทำงานถูกต้องตามสัญญา และการต่อสายเข้า route ไม่ทำให้เทสต์เดิมพัง

## สิ่งที่ operator ต้องทำ

merge branch `feat/runtime-deploy-drift` — Tier C เป็นสิทธิ์ operator ตาม L5 ตลอดไป

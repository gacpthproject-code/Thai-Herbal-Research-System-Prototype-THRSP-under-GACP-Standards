# Task 2 — frontend รายงาน commit ที่ตัวเอง build มา · 2026-08-14

**Status:** `BLOCKED(operator:merge-tier-c)` — โค้ดเสร็จ RED/GREEN ครบ รอ operator merge

| | |
|---|---|
| branch | `feat/runtime-deploy-drift` |
| tier | **C** (`tier-check.sh`) — `apps/web-app/Dockerfile` + `.github/workflows/build-images.yml` = `infra` |
| แผน | `docs/superpowers/plans/2026-08-14-runtime-deploy-drift.md` Task 2 |
| เครื่องที่รัน | Windows dev · node v24.19.0 · jest 30.2.0 (web-app) |

## RED

```
Test Suites: 1 failed, 1 total
Tests:       0 total
  at Object.<anonymous> (src/lib/__tests__/build-info.test.ts:20:1)
  Cannot find module '../build-info'
RED exit=1
```

## GREEN

```
PASS src/lib/__tests__/build-info.test.ts
  buildInfo
    √ reports the commit from GIT_SHA
    √ reports the build time from BUILT_AT
    √ reports null when GIT_SHA was never set
    √ reports null when GIT_SHA is empty — an ARG with no value expands to ""
    √ reports null when GIT_SHA is only whitespace
    √ trims a trailing newline — shell substitution in a build arg leaves one
    √ never invents a placeholder for an absent value
    √ reads GIT_SHA, not NEXT_PUBLIC_GIT_SHA — this value must not reach the browser
Tests:       8 passed, 8 total
GREEN exit=0
```

เคสสุดท้ายมีเพราะ `NEXT_PUBLIC_*` ถูก inline เข้า client bundle ตอน build — ถ้าอ่านตัวนั้น
ค่าจะไปถึงเบราว์เซอร์ของผู้ใช้ทุกคน และถูกแช่ไว้ในไฟล์ static แทนที่จะอ่านตอนรัน

## Type check — route ไม่มีเทสต์ จึงตรวจทางนี้

```
npx tsc --noEmit -p tsconfig.json
exit=0
```

`src/app/api/version/route.ts` ไม่มี unit test เพราะการเรียก `NextResponse` ใน jsdom ต้อง
polyfill `Response` ซึ่งจะกลายเป็นการทดสอบ polyfill ไม่ใช่ทดสอบ handler · ตรรกะทั้งหมดอยู่ใน
`buildInfo()` ที่มีเทสต์ 8 ข้อ ส่วน route เป็นเปลือกบาง ๆ ⇒ ตรวจชนิดข้อมูลด้วย `tsc` และ
พิสูจน์ว่ามันตอบจริงด้วย `curl` ใน Task 5

## Full suite — และรอบแรกที่ล้ม ซึ่งต้องบันทึก

| รอบ | ผล | เวลา |
|---|---|---|
| branch · cache เย็น (รันเต็มครั้งแรก) | **1 suite ล้ม 2 test** — timeout ทั้งคู่ใน `split-finance-auto-route.test.tsx` | 176.63 s |
| suite นั้นรันเดี่ยว · ไม่มีการแก้ | 5/5 ผ่าน | 9.4 s |
| suite นั้นรันเดี่ยว · branch | 5/5 ผ่าน | 3.0 s |
| **ทั้งสวีท · ไม่มีการแก้ (stash)** | **234 suite / 1897 test ผ่านหมด** | 21.65 s |
| **ทั้งสวีท · branch · cache อุ่น** | **235 suite / 1905 test ผ่านหมด** | 21.20 s |

**ข้อสรุป:** สองเทสต์ที่ล้มเป็น timeout 5000 ms ที่เกิดตอน ts-jest คอมไพล์ทั้งโปรเจกต์ใหม่พร้อมกัน
(176 วินาที เทียบกับ 21 วินาทีเมื่อ cache อุ่น = ต่างกัน 8 เท่า) **ไม่ใช่ regression จากใบนี้** —
พิสูจน์โดยการรันทั้งสวีทบนโค้ดที่ไม่มีการแก้ แล้วรันซ้ำบน branch ในเงื่อนไขเดียวกัน

ตัวเลขยืนยันซ้ำอีกชั้น: `1905 − 1897 = 8` = จำนวนเทสต์ที่ใบนี้เพิ่มพอดี · `235 − 234 = 1` = ไฟล์เทสต์ที่เพิ่ม

**ข้อสังเกตที่ต้องบันทึกแยก ไม่ใช่ scope ใบนี้:** `split-finance-auto-route.test.tsx` ล้มได้ภายใต้
โหลด แปลว่ามันพึ่งพา wall-clock ที่ 5000 ms · เทสต์ที่ผ่านหรือไม่ผ่านขึ้นกับความเร็วเครื่อง
คือเทสต์ที่จะแดงแบบสุ่มใน CI และสอนให้คนเมินผลแดง — ควรมีใบแยกไปแก้ให้รอ condition แทนรอเวลา

## สิ่งที่ **ยังไม่** ได้พิสูจน์

| ข้อ | จะพิสูจน์ที่ไหน |
|---|---|
| `/api/version` ตอบ `revision` จริง | Task 5 — `curl` ใส่ image ที่ deploy แล้ว |
| `force-dynamic` กัน Next ไม่ให้แช่ค่าตอน build ได้จริง | Task 5 — ถ้า revision เป็น null ทั้งที่ส่ง build arg แล้ว แปลว่าบรรทัดนี้ไม่ได้ผล |
| build arg เดินทางเข้า image | Task 5 ขั้นที่ 3 — `docker run --entrypoint sh` |
| `build-images.yml` ที่แก้ทำงาน | Actions นาทีหมดถาวร (คำสั่ง operator 2026-08-14) ⇒ ยังไม่มีใครยืนยันได้ |

## สิ่งที่ operator ต้องทำ

merge branch `feat/runtime-deploy-drift` — Tier C เป็นสิทธิ์ operator ตาม L5

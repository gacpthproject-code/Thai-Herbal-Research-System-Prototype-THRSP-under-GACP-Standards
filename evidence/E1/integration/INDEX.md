# E1 integration — รวมงานทีม 4 implementer + 4 auditor · 2026-08-14

**Status:** `BLOCKED(operator:merge-tier-c)` — รวมและแก้ตาม audit ครบ รอ operator merge
**Branch:** `feat/login-front-door` (merge e1/task1..4 + integration commit)
**Workflow:** `wf_2a15b245-f82` — 8 agents · 0 error · 943k subagent tokens · 77 นาที
**ผล audit ดิบทั้งหมด:** journal ของ workflow (path ใน meta ของ run) · verdict: T1 CRITICAL ·
T2 CRITICAL · T3 PASS · T4 CRITICAL

## การกระทำต่อทุก finding — ไม่มีข้อไหนถูกเงียบ

| Audit finding | ระดับ | ผู้รวมทำอะไร |
|---|---|---|
| T1: แผนคาด tier ผิด — งานเป็น C ตั้งแต่ Task 1 ไม่ใช่ Task 5 | CRITICAL | จริง — แก้หมายเหตุในแผน (Task 5) · ทั้ง branch นี้ = operator merge ตาม L5 · **นับเป็นบั๊กของแผน (ผมเขียน) ไม่ใช่ของ implementer** |
| T2: `GACP_DEPLOY_SLOT` ไม่อยู่ใน `.env.example` ⇒ pin `env-example-documents-config` แดง | CRITICAL | เพิ่ม block เอกสารใน `.env.example` (พร้อมคำเตือนห้ามตั้งบน production) · pin กลับเขียว — รันแล้ว 67/67 |
| T2: evidence ไม่พอสำหรับ DoD ชั้น C | CRITICAL | ใบนี้ + ผลรันรวมทั้งหมดคือ pack ระดับ integration · fallback ชั้น C ระหว่าง CI ตาย = local-gate + review 2 ชั้น (auditor + ผู้รวม) ตามกติกา 2026-08-06 |
| T4: a11y Stage 1 ถูกเปลี่ยนความหมายเงียบ ๆ (scan chooser ใต้ป้าย marketing-landing) | CRITICAL | เปลี่ยนชื่อ stage + artifact เป็น `root-login-chooser` พร้อมคอมเมนต์เล่าเหตุ · landing ไม่มี route เหลือ จึงไม่มี gate ที่ต้องรักษา |
| T4: ไม่มีหลักฐาน tsc | CRITICAL | ผู้รวมรัน `tsc --noEmit` เอง = **exit 0** (หลังแก้ dead comparison ที่ TS จับได้) |
| T1: endpoint โดน rate limiter ของ login | MINOR* | *ทั้ง implementer และ auditor อ้าง limiter ผิดตัว (middleware 5/15m) — ของจริงคือของ server.js: 50/15m นับเฉพาะ fail แต่ **bucket ต่อ IP ใช้ร่วมกับ login** ⇒ NAT office ที่ login พลาดรวม 50 ครั้งลาก providers ล้มด้วย · แก้: carve-out GET /providers ออกจาก authLimiter (ยังอยู่ใต้ globalLimiter 1000/15m) + แก้ wiring pin ให้ล็อกทั้งสองครึ่งของ wiring ใหม่ |
| T1: เทสต์ no-auth หลวม (404 ก็ผ่าน) | MINOR | pin `expect(200)` ตรง ๆ พร้อมคอมเมนต์ว่าทำไม |
| T1: ไม่มี positive-state pin — handler ที่ตอบ coming_soon ทุกตัวผ่านได้ | MINOR | เพิ่มเทสต์ pin `local.state==='enabled' && local.enabled===true` |
| T3: `statusOf` เดา `staging_only → usable` เองฝั่ง browser | MINOR** | **รากจริงอยู่ API: state string ตีความไม่ได้ถ้าไม่รู้ isProduction/slot ⇒ endpoint ส่ง `enabled` (ผล `isProviderEnabled()`) เพิ่ม · chooser เลิกเดา ใช้ verdict ตรง · เทสต์สองฝั่งอัปเดต + DEMO strip ใช้ verdict เดียวกัน (แก้บั๊กที่สองที่ type ใหม่เผยให้เห็น: guard เดิมเทียบ string กับ object) |
| T3: fetch ล้มยังโชว์ปุ่ม (ขัด spec §3.2 ตามตัวอักษร) | MINOR | คงพฤติกรรมตามแผน Task 3 (ป้าย "ตรวจสถานะไม่ได้" + ไม่ยิง OAuth) — แผนกับ spec ขัดกันเอง แผนละเอียดกว่าและ fail-closed จริง · บันทึกไว้แทนแก้ |
| T4: sitemap ยังโฆษณา `/` เป็นหน้า marketing priority 1.0 | MINOR | ตัด `/` ออก ยก `/about` เป็นหัวแถว marketing |
| T4: docstring สองแห่งพูดตรงข้ามพฤติกรรมจริง | MINOR | แก้ให้พูดความจริงทั้งคู่ (page.tsx: ลบจริง กู้ได้จาก git history · chooser header: / ชี้มาที่นี่แล้ว) |
| T2: compose pin regex กว้าง (marker ย้าย service ก็เขียว) | MINOR | scope เข้า block `backend-staging` เท่านั้น |
| T4: logout ชี้หน้า login ตรงตาม role (ไม่ผ่าน /auth) | MINOR | คงไว้ — UX ถูกต้อง (implementer บันทึกเหตุผลไว้แล้ว ไม่ใช่ข้ามเงียบ) |

## ผลรันของผู้รวม (ไม่เชื่อรายงานใคร)

| ชุด | ผล |
|---|---|
| 5 backend suites ที่แตะ (endpoint/routes/config/pin/env-pin) | **67/67** |
| chooser suite | **19/19** |
| `tsc --noEmit` web-app | **exit 0** |
| web-app **full suite** | **236 suites / 1920 tests ผ่านหมด** (129s) |
| backend full suite | รัน background — ถ้าจบไม่ทันการ merge จะรายงานผลตามจริงใน thread (baseline หมายเหตุ: main เองไม่เคยเขียวเต็มบนเครื่องนี้ — เกณฑ์คือไม่แย่กว่า baseline) |

## สิ่งที่ต้องพิสูจน์บน staging (Task 5 — กล่อง operator)

curl `/api/auth/idp/providers` เห็น `enabled` ทุกแถว + mock enabled บน staging ·
โหลด /auth 6 ครั้งติดต้องไม่ 429 · เดิน DEMO ครบวงจร · view-pack สามสถานะ

## ภาคผนวกหลังรัน backend เต็มชุด (เติม 2026-08-14 ท้ายวัน)

**backend full suite บน branch:** 547 ผ่าน / 5 suite ล้ม (7 tests) / 1 flaky (`pdf-ssrf-interception` — รันซ้ำผ่าน)
**ชุดเดียวกันบน main:** **5 suite เดิม ล้ม 7 tests เท่ากันเป๊ะ** (`status-writer-canonical-vocabulary`,
`legacy-status-translation-purge`, `role-filters-canonical-only`, `working-days-service`,
`dataset-export-service`) — ทั้งหมดไม่ถูกแตะโดย diff ของ E1 (0 hit)
⇒ **ไม่แย่กว่า baseline** ตามเกณฑ์ [[gate-cannot-pass-use-baseline]] · 5 suite นี้เป็นหนี้ค้างของ
main ที่ควรมีใบแยก (ดูชื่อ — น่าจะเกี่ยว canonical role migration ที่เพิ่งลงบน staging DB)

**ข้อเท็จจริงที่พบช้า — บันทึกตรง ๆ:** `docker-compose.staging.yml:63,172` ตั้ง
`NODE_ENV=staging` ไม่ใช่ `production` อย่างที่ spec/แผนสันนิษฐาน (สันนิษฐานจากคอมเมนต์ใน
Dockerfile/compose ฐาน) ⇒ บน staging จริง `isProduction()` เป็น false อยู่แล้ว และ mock
จะ enable ได้แม้ไม่มี slot marker · **Task 2 จึงเป็น defense-in-depth ไม่ใช่เงื่อนไขจำเป็น**:
มันยังมีค่า — ถ้าวันหน้าใครเปลี่ยน staging เป็น NODE_ENV=production (ซึ่งเป็นทิศที่หลาย
ระบบทำ) mock จะไม่หายเงียบ และ pin กัน marker หลุดเข้า production ยังทำงานทุกกรณี ·
แต่ความจำเป็นที่อ้างใน spec §3.4 อ่อนกว่าที่เขียน — แก้ความเข้าใจไว้ที่นี่แทนการแก้ spec
ย้อนหลัง · auditor T2 ก็ไม่จับจุดนี้ = ข้อจำกัดของการ audit จาก diff โดยไม่เห็น runtime

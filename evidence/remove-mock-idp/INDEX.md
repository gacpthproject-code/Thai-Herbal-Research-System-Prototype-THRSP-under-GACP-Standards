# Evidence — remove-mock-idp (2026-08-14)

Spec: `docs/superpowers/specs/2026-08-14-remove-mock-idp-design.md` · Plan: `docs/superpowers/plans/2026-08-14-remove-mock-idp.md`
Branch: `feat/remove-mock-idp` · ทีม: implementer→auditor ต่อรอบ, ซ่อมตามผลตรวจ 3 ครั้ง (T2, T3T4, T5-pin)

## Acceptance criteria (spec §7) → หลักฐาน

| AC | สถานะ | หลักฐาน |
|---|---|---|
| 1. `/auth` ไม่มี "ทดลอง/จำลอง/DEMO" ทุกสถานะ feed | ผ่านในเทส | reverse pin ใน `login-chooser.test.tsx` (สโคป `document.body` — คลุม dialog ที่ portal ตาม T5 audit) · RED: `red-chooser.txt` · GREEN: `green-chooser.txt` |
| 2. `/auth/mock-idp/*` = 404 | โค้ดลบแล้ว — รอพิสูจน์สดบน staging | commit `e8a5985a` ลบทั้ง directory · curl หลัง deploy = ช่องว่างเดียวที่เหลือ |
| 3. endpoint `mock/*` ปฏิเสธ | ผ่านในเทส (503 AUTH_PROVIDER_DISABLED — provider หายจากทะเบียน) | tombstone ใน `auth-idp-routes.test.js` · RED: `red-backend.txt` |
| 4. providers feed ไม่มี `mock` | ผ่านในเทส | `auth-idp-providers-endpoint.test.js` keys = healthid/local/providerid/thaid |
| 5. grep สะอาด | ผ่าน โดยมีข้อยกเว้นเปิดเผย 1 แถว | `grep-clean.txt` · แถวเดียวนอก `__tests__`: `config/auth-providers.js:14` — comment อ้าง**ชื่อไฟล์ spec ฉบับถอน mock เอง** ไม่ใช่ artifact · ถ้าจะแปลงประตูนี้เป็น probe ต้องเขียน exclusion ให้ citation ก่อน (บันทึกใน BACKLOG-FOUND.md) |
| 6. ทุก suite เขียว + ratchet ≤ baseline | ผ่านแบบมีรายละเอียด — อ่านหมวดล่าง | `task6-battery.txt` + `full-unit-after-audit.txt` + `local-gate-full.txt` |

### รายละเอียด AC6 — full gate บนเครื่อง dev (2026-08-14, HEAD bde0c5fe)

- **unit-suite: 459 suite PASS** แล้ว process ตายด้วย JS heap OOM (ขีดจำกัดเครื่อง Windows ไม่ใช่โค้ด — `local-gate-full.txt:9756`) · jest FAIL เดียวก่อน crash คือ `pdf-ssrf-interception` ซึ่ง**รันเดี่ยวแล้วผ่าน 3/3** (flaky ใต้โหลด — พฤติกรรมเดิมที่บันทึกไว้ตั้งแต่รอบ baseline ของ main ไม่เกี่ยว branch นี้ที่แตะเฉพาะ auth/web)
- **banned-terms FAIL: ไม่ใช่ของ branch นี้** — กฎห้ามคำ "หมอพร้อม/MorProm" ชนกับคำสั่งกระทรวง (ให้หน้า login เรียกชื่อหมอพร้อม) ตั้งแต่ชุด E1 ที่ merge เข้า main แล้ว: main มีไฟล์ชน 5 ไฟล์อยู่ก่อน · branch เพิ่มเฉพาะ prose ใน spec ใหม่ + ไฟล์ evidence เก่า **ไม่มี hit ในโค้ดเพิ่ม** — รอ operator ตัดสินแก้ขอบเขตกฎ (L6)
- **probe-gate FAIL 3 ตัว = สภาพเดิมของ main ทุกตัว**: deploy-drift แถว prod (Cloudflare — งานค้าง dashboard) · gate-attestation (ต้องรัน full-gate บนเครื่อง staging ตาม runbook `full-gate-on-staging.md`) · main-attestation-audit (หนี้ attestation ของ main เอง 8 commit) · no-secret BLOCKED โดยสุจริต (เครื่องนี้ไม่มี gitleaks)
- **สรุปแบบ no-new-failures**: ความแดงทุกใบมีบน main อยู่แล้วหรือเป็นข้อจำกัดเครื่อง — งาน branch นี้ไม่เพิ่มความแดงใหม่แม้แต่รายการเดียว
| 7. operator เดินของจริง: เพิ่มพนักงาน → ล็อกอิน → ภาพ | **รอหลัง merge+deploy** | — |

## ตัวเลขที่นับจริง

- assertion ใน `auth-idp-routes.test.js`: main = 114 → branch = 134 (`assertion-count.txt` + orchestrator นับซ้ำอิสระ)
- เกราะ OAuth ทั้ง 7 หมวด (state บังคับ/ลายเซ็น/หมดอายุ/ใช้ครั้งเดียว · no auto-provision · inactive ปฏิเสธ · token ไม่ออก body · audit ครบ) — อยู่บนพาหนะ thaid ทั้งหมด **ก่อน** commit ที่ลบ mock (ลำดับ commit: `5a3aba80`,`261cd10d` มาก่อน `b11e7f49`)

## สิ่งที่รู้แล้วเลือกไม่ทำในใบนี้ (เปิดเผย)

- `setFullThaidEnv` มีสองนิยามในไฟล์เทส (module-level กับ local ใน describe เดิมที่ห้ามแตะ) — BACKLOG-FOUND.md
- เอกสาร/evidence เก่าที่เล่าเรื่อง mock = ประวัติศาสตร์ ไม่แก้ย้อน (spec §8)

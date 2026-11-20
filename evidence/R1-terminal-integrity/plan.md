# R1 — TERMINAL-INTEGRITY HOTFIX — PLAN
> orchestrator PLAN ตาม operator instruction 2026-08-03 (WAVE PLAN A1)
> Spec ฐาน: `evidence/Q3-reopen-audit/findings.md` (b)2b + (b)4 — audited 3 รอบแล้ว, ใช้เป็น spec โดยตรง (ไม่ re-run spec-reader เพราะ 2 จุดนี้ผ่านการ verify file:line มาแล้ว)
> Base: `origin/main` (376b36b) — **PR ใหม่ ไม่ stack #721/#722** (operator merge เป็น priority แรก)

## Scope (2 จุดเท่านั้น — Q3 พบ resurrection paths อื่นอีกหลายจุด แต่ operator สั่งชัดว่า R1 = 2 จุดนี้)

### R1a — bundle submit/link block terminal
- **บั๊ก** (main): `routes/api/applications/application-bundles.js:307-317` submit loop เรียก `writeApplicationStatus` ต่อ linked app → `SUBMITTED`, `actorRole:'HEALTH'`, ไม่ส่ง assertTransition/onAudit; link paths ไร้ status filter (`:180-184` create-link, `:92-100` getOwnedApplication ใช้ที่ `:223-231`) → ผู้สมัคร resurrect เคส REJECTED/CERTIFIED/CANCEL_EXPIRED ของตัวเองได้
- **แก้**: block ทั้ง 2 จุด (defense in depth) — (i) link-time: reject เมื่อพยายามผูกเคส terminal เข้า bundle (ii) submit-time: guard ก่อน loop เขียน status — เคสไหน terminal → reject ทั้ง request
- **Terminal source**: `TERMINAL_STATUSES` จาก `application-status-writer.js` (export :838, มี REJECTED/EXPIRED/CANCEL_EXPIRED/CERTIFIED — EXPIRED นับ terminal ตรงที่ operator ยืนยัน) — **reuse SSOT ห้ามสร้าง list ใหม่** (Law 3.6)
- **Error code**: ลงทะเบียนใหม่ใน `shared/error-codes.js` (idiom เดิม catalog: code/httpStatus/messageEn/messageTh/source/remediation) — เช่น `BUNDLE_TERMINAL_APPLICATION` (409), messageTh ตาม `thai-ui-copy` (บอกสาเหตุ+ทางไป, "คุณ")

### R1b — ปิดรู ESLint guard + แก้ seed
- **บั๊ก**: `eslint-rules/no-direct-application-status-write.js:65` match แค่ `update`/`updateMany` → `upsert` (และ `create` ที่ set status ตรง) ลอด; `prisma/seed-gacp.js:321-323` เขียน status ผ่าน upsert ลอด guard (CI รันไฟล์นี้ `ci.yml:643`)
- **แก้ rule**: ขยาย matcher ให้ครอบ `upsert` (ตรวจ `update` key ใน args) + `create` ที่มี `status` ใน `data` — **rule นี้ไม่ใช่ gate script ที่ CODEOWNERS ปกป้อง** (check-done.sh/probes/CI config เท่านั้น) และ operator สั่งแก้โดยตรง → แก้ได้
- **แก้ seed แบบถูกวิธี**: investigate convention เดิม — `scripts/update-health1-certified.js:65` ใช้ `eslint-disable-next-line` + justification (convention ที่มีอยู่สำหรับ script/seed ที่ต้อง set status จริง) — seed legitimately ต้อง seed เคส terminal (CERTIFIED/REJECTED) เป็น test data; ทางเลือก: (i) `eslint-disable-next-line` + justification comment ตาม convention เดิม (ทำให้ bypass **มองเห็นได้/grep ได้/review ได้** — ต่างจาก upsert ที่ tool มองไม่เห็นเลย = ปิดความกังวลหลักของ (b)4) หรือ (ii) narrow path-allowlist สำหรับ seed/script ใน rule — implementer เลือกตาม least-surprise + รายงานเหตุผล **ห้ามใช้ blanket `/* eslint-disable */`**

## RED บังคับ (พิสูจน์บั๊กมีจริงก่อนแก้)
1. **R1a RED**: test ยิง path จริง (supertest/handler) — link เคส REJECTED/CERTIFIED เข้า bundle แล้ว submit → **ปัจจุบันเขียน SUBMITTED สำเร็จ** (resurrect) → assertion ว่าเคสไม่ควรถูก resurrect = แดง; หลังแก้ = reject ด้วย error code ใหม่ + เคสคง terminal
2. **R1b RED**: รัน `eslint` กับ pattern `application.upsert({... update:{ status }})` → **ปัจจุบัน 0 violations** (พิสูจน์รู); หลังแก้ rule = จับได้ (fixture pattern แดง); + rule unit test ถ้ามี test harness ของ custom rules

## ไฟล์ที่จะแตะ
- `apps/backend/routes/api/applications/application-bundles.js` (R1a — link + submit guard)
- `apps/backend/shared/error-codes.js` (R1a — error code ใหม่)
- `apps/backend/eslint-rules/no-direct-application-status-write.js` (R1b — matcher)
- `apps/backend/prisma/seed-gacp.js` (R1b — sanctioned pass)
- tests: `apps/backend/__tests__/**` (R1a handler/route test), rule fixture/test (R1b)

## Out of scope (ห้ามแตะ — Q3 พบแต่ operator กันไว้)
- reopenedFrom / กลไก reopen ทั้งหมด (= R2, รอนิติกรกรมฯ)
- resurrection paths อื่นจาก Q3: checkout settle terminal gate (b)1, admin override 6 ทาง (b)2, fence เชื่อ actorRole string (b)3 — **ไม่แตะใน R1** (backlog/future)
- reminder retry (decided แต่เป็นงาน Q2 payment-reminder-job แยก)

## Acceptance
1. RED จริงทั้ง 2 จุด (bundle resurrect + eslint hole) แนบ output
2. GREEN: full backend suite ผ่าน baseline (fail ได้เฉพาะ dataset-export เดิม) + eslint สะอาด (รวม seed ที่แก้แล้ว) + rule จับ upsert ได้
3. **CI เขียวจริงบน base main** (R1 base main → workflow trigger จริง ต่างจาก #722)
4. auditor เต็มรูป PASS
5. ratchet: hardcode ไม่เพิ่ม (error message อยู่ใน catalog, ไม่ hardcode ในโค้ด logic)

## Dispatch: PLAN(นี้) → implementer → auditor(fresh) → gates → เสนอ merge (operator กด)

# Evidence — RLS Phase 1 (role decouple) — 2026-08-17/18

Merged: `6eb10d9a` (main) · Runbook: `docs/operations/rls-phase1-gacp-app-cutover.md` · Probe: `apps/backend/scripts/rls/gacp-app-coverage-probe.js`

## สิ่งที่พิสูจน์แล้วใน session นี้ (รันจริง)

| ไฟล์ | คืออะไร | ผล |
|---|---|---|
| `probe-against-real-catalog-no-role.txt` | รัน coverage probe กับ **Postgres จริง** (Supabase ของ dev stack) ที่ **ยังไม่มี role `gacp_app`** — `set -a; . ./.env; cd apps/backend; node scripts/rls/gacp-app-coverage-probe.js` | **exit=1** · `FAIL: 104 public tables lack full DML for gacp_app` |

**สิ่งที่ผลนี้พิสูจน์ (และไม่พิสูจน์):**
- ✅ probe **ต่อ catalog จริงได้และไม่ vacuous** — enumerate เจอ **104 public base tables** จริง (ไม่ใช่ 0 แถวแล้ว PASS ลอยๆ)
- ✅ probe **fail-closed** — ไม่มี role/ไม่มี grant = FAIL พร้อมรายชื่อตารางครบ ไม่ใช่ PASS เงียบ (นี่คือคุณสมบัติที่ guard ต้องมีตาม L6 — probe ที่ PASS ตอนยังไม่ได้ provision คือ guard ปลอม)
- ❌ **ไม่ได้พิสูจน์** ว่า grant ที่ `scripts/rls/gacp-app-provision.sql` เขียนไว้ครอบครบ — ต้องรัน provisioning ก่อนแล้ว probe ต้องกลับเป็น PASS (ข้อ 2-3 ของ runbook)
- ❌ **ไม่ได้พิสูจน์** ว่าแอปทำงานได้ภายใต้ `gacp_app` — ต้องทำ cutover (ข้อ 4) + smoke + เฝ้า log

## ที่ยังไม่ได้ทำ — และทำไมต้องเป็น operator

ขั้นตอนที่เหลือทั้งหมดของ runbook (provision role → probe PASS → ตั้ง `APP_DB_USER=gacp_app` → recreate container → smoke → เฝ้า log ≥1 วันทำการ) ต้องรันบน **เครื่อง staging** ซึ่งเป็นเครื่องเดียวกับที่โฮสต์ container ของ production (`docs/operations/staging-box-topology.md`) — กติกาโครงการ (CLAUDE.md L5 + `.claude/agents/infra-devops.md`) กำหนดว่า agent เสนอคำสั่งได้ แต่ห้ามรันบน server จริงเอง · ชุดคำสั่งพร้อมวางอยู่ที่ `evidence/rls-phase1/OPERATOR-STEPS.md`

**สถานะที่ถูกต้องของ RLS Phase 1 ตอนนี้: `PENDING(staging)`** — โค้ด merge แล้ว, probe พิสูจน์ว่าไม่ vacuous แล้ว, แต่ยังไม่มี catalog ไหนที่ผ่าน provisioning จริง

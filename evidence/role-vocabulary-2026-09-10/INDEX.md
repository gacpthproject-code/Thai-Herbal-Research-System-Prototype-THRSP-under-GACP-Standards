# คำศัพท์บทบาท + ผู้อนุมัติใบรับรอง — หลักฐาน 2026-09-10

Baseline: `ff3d8ced` (HEAD ตอนเริ่ม) · Tier: **C** (auth-identity — `apps/backend/shared/canonical-rbac.js`)

## ผลรัน

| ไฟล์ | ผล |
|---|---|
| `backend-unit-suite.txt` | 751/751 suites · 9644/9644 tests · exit 0 |
| `web-app-suite.txt` | 377/377 suites · 3073/3073 tests · exit 0 · `tsc --noEmit` exit 0 |
| `local-gate-baseline-ff3d8ced.txt` | รันบน worktree สะอาดของ HEAD |
| `local-gate-working-tree.txt` | รันบนต้นไม้ที่แก้แล้ว |

## local-gate เทียบ baseline

main แดงอยู่แล้วด้วยตัวมันเอง เกณฑ์จึงเป็น "ไม่มี probe ใดแย่ลง" ไม่ใช่ "เขียวหมด"

ผลเทียบ 13 probe: **เหมือนกันทุกตัว** — ไม่มีอันไหนเปลี่ยนจาก PASS เป็น FAIL

แดงทั้งห้าเป็นของเดิม ไม่เกี่ยวกับ diff นี้:
`deploy-drift` (เข้า gacpth.com ไม่ได้) · `gate-attestation` + `main-attestation-audit`
(ไม่มี attestation — ตรงกับมติ "ไม่ทำ CI") · `no-secret` (gitleaks เดิม) ·
`schema-arg-resolves` (`scripts/deploy/remote-install.sh` ไม่ถูกแตะ)

`ratchet` PASS ทั้งสองฝั่ง ตัวเลขเท่ากันเป๊ะ: hardcode=25 todo=55 env-direct=114 dup-source=0

## RED ก่อน GREEN

`apps/backend/__tests__/unit/role-rename-leftovers-2026-09-10.test.js` รันครั้งแรกได้ 23 จุดค้าง
\+ 2 ประตูปิดตาย (ผลเต็มอยู่ใน transcript ของ session) · หลังแก้ครบ ผ่านทั้งหมด

## ที่ยังทำไม่ได้ใน session นี้

Postgres เข้าไม่ถึง (`127.0.0.1:5432` ไม่ตอบ) ⇒ **migration
`20260910120000_rename_role_vocabulary` ยังไม่เคยรันจริง** — สถานะ PENDING ไม่ใช่ DONE

---

**อัปเดต 2026-09-10 (เย็น)**: ข้อ "ที่ยังทำไม่ได้" ข้างบนถูกปิดแล้ว — ใบ `20260910120000`
ถูกซ้อมบนฐานที่ถือคำเก่าจริง (โคลนจากฐาน dev ทั้งใบ) ด้วยคำสั่ง `prisma migrate deploy` ตัวเดียว
กับที่ operator จะรัน · ผลและสองข้อค้นพบที่ต้องรู้ก่อน deploy อยู่ที่
`evidence/role-vocabulary-rehearsal-2026-09-10/INDEX.md`

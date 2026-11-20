# ซ้อมอัปเกรดใบ 20260910120000 บนฐานที่ถือ "คำเก่า" จริง — 2026-09-10

ก่อนหน้านี้ใบนี้เคยรันแล้วครั้งเดียว แต่รันบนฐานที่**ล้างใหม่** (`evidence/role-vocabulary-2026-09-10/walk-local/`)
ซึ่งแปลว่าคำสั่ง `UPDATE` ทั้งห้าคอลัมน์ไม่เคยแปลงอะไรเลยสักแถว — seed สร้างผู้ใช้ด้วยคำใหม่อยู่แล้ว
สิ่งที่ staging/demo จะเจอคือคนละอย่าง: ฐานที่มีข้อมูลเดิมเต็มและถือคำเก่าทุกคอลัมน์

รอบนี้จึงจำลองของจริง: โคลนฐาน `gacp` ทั้งใบเป็น `gacp_rolemig` → ย้อนคำศัพท์กลับเป็นคำเก่า
(`rewind.sql` — รวมค่าดิบที่สกปรกจริง เช่น `'  Auditor  '`, `head_auditor`, `final_approver`)
→ รัน `npx prisma migrate deploy` ตัวเดียวกับที่ operator จะรัน

## ผล

| ข้อพิสูจน์ | ไฟล์ | ผล |
|---|---|---|
| ใบนี้ apply ผ่านด้วยคำสั่งจริง | `migrate-deploy.txt` | `All migrations have been successfully applied` |
| ห้าคอลัมน์แปลงครบ ไม่มีคำเก่าเหลือ | `before.txt` → `after.txt` | ผ่าน (ตารางข้างล่าง) |
| `entity_memberships.role` ไม่ถูกแตะ | `after.txt` | `OWNER` 2 แถวเท่าเดิม |
| รันซ้ำได้ ไม่มีผลข้างเคียง | `idempotent-rerun.txt` | `UPDATE 0` ทุกบรรทัด · ด่านตรวจผ่าน |
| ค่าที่แปลไม่ออก = ยกเลิกทั้งใบ ไม่เดา | `abort-guard.txt` | `ABORTED: 1 row(s) hold an unmappable role: 'wizard'` · ข้อมูลไม่ขยับ |
| สมาชิกกลุ่มตามคำใหม่ไปด้วย | `membership-rehearsal.txt` | 4 คนเท่าเดิม (`id` ยังเป็น `rg_auditor` — เปลี่ยนแค่ `code`) |

คำเก่า → คำใหม่ ที่วัดได้จริงบนแถวจริง:

    '  Auditor  ' · auditor · head_auditor · inspector   →  field_inspector  (4)
    approver · final_approver                            →  certificate_approver (2)
    reviewer_auditor                                     →  document_reviewer (2)
    scheduler                                            →  dispatcher (1)
    farmer                                               →  health (3)

## สองเรื่องที่เจอเพราะซ้อม และ operator ต้องรู้ก่อนกด

### 1. หน้าต่างระหว่าง "โค้ดขึ้นแล้ว แต่ migration ยังไม่รัน" — คิวงานจะว่างเปล่าแบบเงียบ ๆ

`window-probe.txt` — ยิงผ่านฟังก์ชันจริงของ service ไม่ใช่การอ่านโค้ดแล้วสรุป:

| | ก่อน migration (ในหน้าต่าง) | หลัง migration |
|---|---|---|
| `listForGroup('field_inspector')` | **0 งาน** | 2 งาน |

เหตุผล: `work-activity-service.js:599` ค้นด้วย `candidateGroup = normalizeRole(role)` = `'field_inspector'`
แต่แถวในคิวยังเขียนว่า `'auditor'` ⇒ ไม่ตรง ไม่มี error หน้าจอขึ้นว่า "คิวว่าง"

**การล็อกอินไม่พังในหน้าต่างนี้** — โค้ดใหม่ยังอ่านคำเก่าออกทุกคำ
(`normalizeRole('auditor') → field_inspector`) ลำดับ "โค้ดก่อน migration" จึงถูกต้อง
แต่หน้าต่างต้องสั้น เพราะระหว่างนั้นเจ้าหน้าที่หยิบงานในคิวไม่ได้

### 2. backend ที่รันข้าม migration ต้องรีสตาร์ต — ไม่งั้นรายชื่อสมาชิกกลุ่มสั้นกว่าความจริง

`cache-probe.txt` — process เดียว สามช็อต warm cache ตอนฐานยังเป็นคำเก่า แล้วรัน migration คั่น:

    2. process เดิมที่ไม่ได้รีสตาร์ต:  4 คน   ← ขาด reviewer@gacp.go.th
    3. process ที่รีสตาร์ตใหม่:       5 คน

คนที่หายคือคนที่อยู่ในกลุ่มผู้ตรวจแปลง**ด้วยการเป็นสมาชิก** แต่บทบาทหลักเป็นผู้ตรวจเอกสาร
⇒ ทางที่สอง (fallback ด้วย `users.role`) หาไม่เจอ · ไม่มี exception ไม่มี log — แค่หายไปจาก
รายชื่อผู้รับแจ้งเตือนและจากคิว

ต้นเหตุคือคอมเมนต์ของ cache เองที่เขียนว่าทะเบียน `role_groups` *"never edited at runtime"*
ซึ่งเลิกจริงตั้งแต่ใบนี้เปลี่ยนคำในแถวเดิม (โดยตั้งใจ เพื่อให้สมาชิกตามไปด้วย)

**แก้แล้วในรอบนี้** (`shared/user-groups.js`): cache ที่ไม่มี code นั้น ไม่ถือเป็นคำตอบสุดท้าย
อีกต่อไป — ถามทะเบียนตรง ๆ หนึ่งครั้งแล้วจำไว้ · `cache-probe-after-fix.txt` วัดซ้ำบน Postgres จริง:
ช็อต 2 กับ 3 เท่ากันแล้ว · เทส RED ก่อนแก้อยู่ที่ `__tests__/unit/user-groups.test.js`

## ลำดับที่แนะนำสำหรับ deploy (ต่อหนึ่งเครื่อง — staging และ demo คนละฐาน ต้องทำสองรอบ)

1. ยกอิมเมจโค้ดใหม่ขึ้น (ล็อกอินยังทำงานปกติ คำเก่ายังอ่านออก)
2. รัน `prisma migrate deploy` ทันที — อย่าทิ้งช่วง คิวงานว่างตลอดหน้าต่างนี้
   (วิธีที่ใช้ได้จริงบน Supabase pooler: `docker exec` เข้าคอนเทนเนอร์ที่รันอยู่
   ตาม `docs/deployment/migration-instructions.md` — `docker compose run` เคยค้าง 10 นาที)
3. **รีสตาร์ต backend อีกครั้งหลัง migration** (เหตุผลข้อ 2 ข้างบน — แม้แก้แล้วก็ยังควรทำ
   เพราะเป็นการยืนยันว่า cache ทุกใบในทุก process เริ่มจากทะเบียนชุดใหม่)
4. แต่งตั้งผู้อนุมัติใบรับรองอย่างน้อยหนึ่งคนผ่านหน้าจัดการผู้ใช้ — **ใบนี้จงใจไม่แต่งตั้งให้ใคร**
   ระหว่างที่ยังไม่มีใครถือบทบาทนี้ คำขอจะเดินถึง `AUDIT_PASSED` แล้วหยุด (ตามที่ ISO/IEC 17065 §7.6 ต้องการ)
   migration จะขึ้น `WARNING` เตือนข้อนี้ตอนรัน ถ้าฐานนั้นยังไม่มีใคร

## ที่ยังไม่ได้ทำ

ฐานของ staging และ demo อยู่บน Supabase คนละโปรเจกต์ — ไม่ได้แตะในรอบนี้ (L5: deploy = operator)
ตัวเลขทั้งหมดข้างบนมาจากฐานจำลอง `gacp_rolemig` บนเครื่องนี้ ซึ่งโคลนจากฐาน dev ไม่ใช่ของ staging

## เพิ่มเติม: สวีตเต็มชุดแดง 2 ใบบน main อยู่ก่อนแล้ว (แก้ในรอบนี้)

รอบที่ merge รันแค่ project `unit` (751 suites) · `npx jest` เต็มชุดคือ 850 suites และแดง 2 ใบ
บน `52388976` เอง — ยืนยันบน worktree สะอาดของ main ก่อนแตะอะไร (`baseline-two-suites.txt`)

    __tests__/application-visibility.test.js         ROLE_TRANSITIONS['scheduler'] is not iterable
    __tests__/integration/admin-work-config.test.js  คาดว่า candidateGroups มี 'auditor'

ทั้งสองคือเศษของการรีเนม · เทสยาม `role-rename-leftovers-2026-09-10.test.js` มองไม่เห็น
เพราะมันข้ามโฟลเดอร์ `__tests__` และไฟล์ `.test.` โดยตั้งใจ — ถามว่า "probe ตัวใหม่ไม่ได้อ่านอะไร"
ได้คำตอบตรงนี้พอดี

## ผลรันของ diff รอบนี้

| ไฟล์ | ผล |
|---|---|
| `baseline-two-suites.txt` | RED บน worktree สะอาดของ `52388976` — 2 suites แดงอยู่ก่อนแล้ว |
| `backend-suite-full.txt` | `npx jest` เต็มชุดหลังแก้ — 819/819 suites · 10,367 tests · 0 failed (31 skipped) |
| `local-gate-baseline.txt` / `local-gate-working.txt` | 13 probe **เหมือนกันทุกตัว** ไม่มีอันไหนเปลี่ยนจาก PASS เป็น FAIL |

แดง 4 ตัวเป็นของเดิมทั้งคู่ฝั่ง (`deploy-drift` · `main-attestation-audit` · `no-secret` ·
`schema-arg-resolves`) และ `no-skip` อยู่ใต้ waiver ของ operator ถึง 2026-09-15
`ratchet` PASS ทั้งสองฝั่ง ตัวเลขเท่ากัน: `hardcode=25 todo=55 env-direct=114 dup-source=0`

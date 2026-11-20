---
name: gacp-debug
description: Playbook ไล่ปัญหาเฉพาะ repo นี้ — ลำดับตรวจ (probe → test → log) + กับดักที่รู้แล้วของ environment/test/gate. Use when a test fails, a suite dies on load, the gate shows a new failure, or a bug needs root-cause work.
---

# GACP Debug Playbook

repo นี้ไม่มี CI ตามมติ operator (memory `no-ci-by-operator-decision`) อย่าไล่หรือเสนอซ่อม GitHub Actions

## ลำดับไล่ปัญหา (ทำตามลำดับ ห้ามข้ามไป "แก้เลย")

1. **Probe ก่อน**: `bash scripts/check-done.sh ratchet` + probe ที่เกี่ยว (`scripts/probes/`) — probe คือ ground truth เหนือ report ทุกฉบับ (HARNESS.md §2 trust chain)
2. **Test แคบ → กว้าง**: jest ไฟล์เดียวรันตรงได้ · ชุดเต็ม, tsc, playwright และ gate รันผ่าน `scripts/ops/heavy.sh` เท่านั้น
   (เช่น `scripts/ops/heavy.sh npx jest --maxWorkers=2 --detectOpenHandles=false`, heap 3 GB ตาม memory `local-full-suite-needs-3gb-heap`) ·
   ตัดสินผลด้วย `scripts/ops/heavy.sh timeout 7200 bash scripts/ci/full-gate.sh <sha>` แล้ว `node scripts/ops/gate-compare.js --base <main sha ที่ gate แล้ว> --head <sha>` (env จาก `bash scripts/ops/cloud-setup.sh --gate-env`)
   ต้องไม่มีความล้มเหลวใหม่ (CLAUDE.md หัวข้อ "แบบไหนเรียกว่าเสร็จ") · ห้ามเขียนว่า "ชุดเต็มผ่าน" เพราะ main เองก็แดงอยู่
3. **อ่าน log/evidence จริง** — ห้ามเดา root cause โดยไม่มี log (HARNESS.md §2: ผลรันจริงชนะคำอธิบาย)
4. **Infra fail = รายงานตามจริง** (HARNESS.md §2, ห้าม route-around) · เจอ secret = หยุดแล้วรายงาน (CLAUDE.md หัวข้อ "ขอบเขตที่ห้ามข้าม") ห้ามแก้เงียบ

## กับดักที่รู้แล้ว (จ่ายค่าเรียนไปแล้ว — อย่าจ่ายซ้ำ)

| อาการ | ความจริง |
|---|---|
| `Could not locate module uuid` ตาย ~35 suites | jest mapper เคย hard-code path ภายในของ uuid — แก้แล้ว (#742: pin `uuid >=11.1.1 <12` + ถอด mapper) ห้ามแก้ด้วยการ hard-code path ใหม่ |
| เทสต์ล้มแล้วไม่แน่ใจว่าเป็นของ diff เราไหม | รายการเทสต์ที่ล้มอยู่แล้วบน main ดูที่ `evidence/gate/fails/<main sha>.txt` (สร้างด้วย `gate-compare.js --write-fails`) อย่าจำจากสกิล |
| เทสต์ใน worktree เห็นคอลัมน์ขาดหรือเกิน หรือแก้ `packages/*` แล้วเทสต์ไม่เห็น | `node_modules` ของ worktree เป็น symlink ไป checkout หลัก จึงโหลด `@gacp/*` และ Prisma client ของ main · กิ่งที่แก้ schema หรือ `packages/*` ต้องทำ link รายตัว ให้ `@gacp/*` ชี้เข้า worktree และมี `@prisma/client` + `.prisma` ของตัวเอง ก่อน generate · ห้าม generate ลง client ที่ใช้ร่วมกัน (memory `prisma-generate-in-worktree-overwrites-shared-client`, `worktree-node-modules-symlink-loads-main-packages`) |
| integration test "ผ่าน" บนเครื่อง | ตรวจก่อนว่าไม่ใช่ self-skip เพราะไม่มี `DATABASE_URL` (HAS_DB guard) · ผลที่นับคือด่าน `integration-pg` ของ full gate (`gate-locked.sh`, Postgres ชั่วคราว, `scripts/ci/full-gate-checks.txt`) · `integration-no-skip` เป็นด่านแจ้งเตือนเท่านั้น · ห้ามเสนอให้กลับไปใช้ CI |
| `git log` ย้อนไม่ถึง / tier-check BLOCKED | shallow clone — ต้องการ `origin/main` ref จริง (fetch-depth) |
| `pnpm audit` แดงโดย tree ไม่เปลี่ยน | advisory drift (BACKLOG-FOUND.md 2026-08-03) — พิสูจน์ว่าไม่ใช่ diff เรา แล้วแยกกิ่ง pin ต่างหาก ห้าม pin ข้ามเมเจอร์โดยไม่ verify · secret scan ของ gate คือด่าน `secret-scan-deep` (gitleaks) |
| SQL ดิบหา `idCardHash` ไม่เจอ / นับได้ 0 | คอลัมน์จริงชื่อ `idCardHash_deprecated` (field `idCardHash` ใน `auth.prisma` มี `@map("idCardHash_deprecated")`) — ระวังรายงาน PDPA นับผิดแบบดูสมเหตุสมผล |
| ตั้งค่า Stripe แล้วเงินไม่เดิน | Stripe อ่าน `STRIPE_SECRET_KEY` และ `STRIPE_WEBHOOK_SECRET` เท่านั้น (`config/stripe.js`) · `PAYMENT_SECRET_KEY` ไม่มีผู้อ่านแล้ว · การตั้งค่า key เป็นงาน deploy ของ operator ห้ามพิมพ์ค่าออกมา |
| เทสต์ผ่านใน clone ใหม่แต่ล้มใน worktree หรือ checkout หลัก (เช่น Q3 checkout ของ holder-scope ได้ adapter stripe) · สคริปต์ใน worktree ต่อฐานข้อมูลที่ผู้รันไม่ได้เลือก · สคริปต์หยุดด้วย `DATABASE_URL came from … another checkout's env file` | `@prisma/client` ที่ generate ใน node_modules ที่ใช้ร่วมกันโหลด `apps/backend/.env` ของ checkout หลักเข้า `process.env` ตอน require และทุกครั้งที่ `new PrismaClient()` เติมเฉพาะตัวที่ยังไม่มี การลบตัวแปรจึงไม่ช่วย · jest ซ่อนไฟล์นี้จาก Prisma ทุกโปรเซส (`test-support/prisma-env-isolation.js`) รวมโปรเซส node ที่เทสต์ spawn ด้วย environment ของการรัน (globalSetup ต่อ `--require` เข้า `NODE_OPTIONS`) ลูกที่เทสต์ตั้ง env เองทั้งชุดไม่ได้รับ ต้องส่ง `NODE_OPTIONS` ต่อเองถ้าต้องการแบบเดียวกัน · client กลาง (`services/prisma-database.js`) ไม่ยอมเริ่มเมื่อ DATABASE_URL ไม่ได้อยู่ก่อน Prisma อ่านไฟล์ env และไฟล์ของ checkout อื่นเขียนค่านี้ (ดูที่มา ไม่เทียบค่า) แก้โดย export DATABASE_URL · สคริปต์ที่โหลด `@prisma/client` เองก่อน client กลาง ด่านดู environment ตอนโปรเซสเริ่ม (`/proc/self/environ`) ค่าที่สคริปต์แบบนี้ตั้งเองในโปรเซสจึงไม่นับ และเครื่องที่ไม่มี `/proc` ไม่มีด่านสำหรับสคริปต์แบบนี้ · ห้ามครอบ require client กลางด้วย try/catch แล้วสร้าง client เอง เพราะกลืนคำปฏิเสธ (`reset-for-handoff.js` เคยเป็นแบบนี้) · สคริปต์ที่สร้าง `new PrismaClient()` เองโดยไม่โหลด client กลางไม่มีด่าน ต้อง export DATABASE_URL เองทุกครั้ง |
| ใส่ `--maxWorkers=2` แล้วยังรันทีละไฟล์ในโปรเซสเดียว | `jest.config.cjs` ตั้ง `detectOpenHandles: true` ซึ่งบังคับ jest รันในโปรเซสหลักเสมอ (วัด 2026-10-13: 24 ไฟล์ก็ยังไม่มี worker) · อยากได้ worker จริงต้องใส่ `--detectOpenHandles=false` ด้วย |
| `Argument \`application\` is missing` (หรือ organization) ทั้งที่ส่ง `applicationId` แล้ว | Prisma ปัดรูปแบบ unchecked ตกเพราะคอลัมน์บังคับอื่นขาดหรือเป็น null แล้วรายงานความสัมพันธ์ตัวแรกของรูปแบบ checked แทน · เทียบ `data` กับคอลัมน์ที่ไม่มี `?` และไม่มี `@default` ใน model · seed ใบรับรองใช้ `__tests__/integration/fixtures/certificate-row.js` |
| โหลดหน้าแบบคำขอใหม่แล้วกลายเป็นคำขออื่น / หน้ายื่นสำเร็จบอก "ยังไม่ได้ยื่นคำขอ" ทั้งที่ IndexedDB ถือคำขอที่ยื่นแล้ว | ตอน React hydrate ร้าน zustand ถูกอ่านผ่านค่าฝั่งเซิร์ฟเวอร์ (สถานะว่าง) ค่าที่อ่านคู่กันต้องมาจากชุดเดียวกัน ธงระดับโมดูลให้อ่านผ่าน `useSyncExternalStore` ที่ค่าฝั่งเซิร์ฟเวอร์เป็นค่าปลอดภัย (`useWizardPersistSettled`, รอบ 5 ผู้จัดคิว 2026-10-09) · เทสต์ต้อง render ฝั่งเซิร์ฟเวอร์แล้ว `hydrateRoot` เพราะ `createRoot` อย่างเดียวไม่เห็นอาการนี้ |
| `git stash pop` ได้งานของ agent อื่น | stash ใช้ร่วมกันทุก worktree ห้ามใช้ · รัน baseline ใน `git worktree add --detach` แยก (memory `git-stash-is-shared-across-worktrees`) |
| เทสต์ใบรับรองล้ม `bad decrypt` ทั้งไฟล์ | กุญแจเซ็นของ jest ชนข้าม checkout (แยกตาม repo path แล้วใน `jest.setup.js`) ถ้ายังเกิด ให้เทียบ mtime ของ `/tmp/gacp-jest-signing-key-*/private.pem` กับ `apps/backend/keys/private.pem` และเทียบ passphrase ด้วย `sha256sum` ห้ามพิมพ์ค่า (memory `jest-signing-key-collides-across-worktrees`) |
| jest ฝั่งเว็บผ่านแต่ `next build` ล้ม | ts-jest ไม่ตรวจ type · รัน `tsc --noEmit` ผ่าน heavy.sh แล้วอ่านผลทั้งหมด ห้ามกรองด้วย grep (memory `measure-after-deploy-not-after-edit`) |

## เมื่อ root cause ชี้ไปที่เงิน/authz

หยุดตาม CLAUDE.md หัวข้อ "ขอบเขตที่ห้ามข้าม" (เงิน/auth = ชั้น C) — flag + รายงาน ห้ามแก้ตัวเลขหรือ mutation ใดๆ

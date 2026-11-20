# ปรับเวอร์ชัน · packages · tools ให้เป็นปัจจุบัน — design

วันที่: 2026-09-26 · ผู้สั่ง: operator (ลำดับ ก · Node 24 ก · deploy แพตช์แยก ก · แนวทาง ก · "ดำเนินการตามคุณแนะนำ")

## ปัญหา — วัดได้ ไม่ใช่ความเห็น

| สิ่งที่วัด | ค่า ณ 2026-09-26 | ที่มา |
|---|---|---|
| Node ที่ production รัน | 20 — **EOL ตั้งแต่ 2026-04-30** | Dockerfile ทุกตัว `node:20-alpine` · nodejs/Release schedule.json |
| ช่องโหว่ | critical 2 (Next.js RCE) → แพตช์แล้วในเครื่อง ยังไม่คอมมิต · high 14 · moderate 11 | `pnpm audit` |
| jest | สองเมเจอร์ในโปรเจกต์เดียว: backend `^29` คู่ `babel-jest ^30` · web-app `^30` | package.json ทั้งสามไฟล์ |
| ตามหลังเมเจอร์ | 31 แพ็กเกจ | `pnpm -r outdated` |
| superpowers ที่ vendor ไว้ | `44c9b2d6` (2026-08-07) · upstream คือ v6.4.1 (2026-09-19) + skill ใหม่ `diagnosing-superpowers` | SUPERPOWERS-ATTRIBUTION.md · GitHub releases |
| skill/agent/command ของโปรเจกต์ | แก้ล่าสุด 23 ก.ค. – 19 ส.ค. · ไม่มีตัวไหนรู้มติ ก.ย. | `git log` ต่อไฟล์ |
| คำที่ถูกยกเลิกแล้วแต่ tools ยังสอน | slip 6 ไฟล์ · สองฝั่งเงิน 6 (รวม CLAUDE.md) · คำบทบาทเก่า 3 · อ้าง CI 14 | grep บน `.claude/` + CLAUDE.md + HARNESS.md |
| CLAUDE.md | waiver `no-skip` L-006 "ถึง 2026-09-15" — หมดอายุ 11 วัน ยังเขียนอยู่ใน L4 | CLAUDE.md:41 |

เหตุร่วม: **ไม่มีเครื่องเฝ้า** — Node หมดอายุห้าเดือนโดยไม่มีใครรู้ · ตัวตรวจคำเก่าที่มี (`no-legacy-status-vocabulary`) อ่านแค่ `apps/` ไม่เคยอ่าน `.claude/`

## หลักที่ใช้ทั้งแบบ

- ทีละเฟส หนึ่งสาขาต่อเฟส gate ของตัวเอง deploy แยก — พังแล้วต้องชี้ได้ว่าพังเพราะอะไร
- ทุกเฟสจบด้วยเครื่องที่ถือเส้นไว้ (probe) ไม่ใช่เอกสาร
- deploy ทุกชนิด · merge Tier C · waiver = operator (L5, L6)
- ไม่เลือก Renovate/Dependabot ตอนนี้: มันพึ่ง CI รันเทสทุก PR และเราไม่มี CI ตามมติ operator — ถ้า CI กลับมา นี่คือทางที่ควรไป

## เฟส 1 · ปิด Next.js RCE

ของที่เปลี่ยน (ทำแล้ว ยังไม่คอมมิต): `next` 15.5.21→15.5.26 · `sharp` 0.35.3→0.35.4 · `@playwright/test` ยกเป็น ^1.63.0 ทั้งสอง workspace ให้คู่กับ `playwright-core` 1.63.0 ที่ `pnpm update next` ลากเข้ามา (ไม่งั้น `Page` สองชนิด tsc แดง)

พิสูจน์แล้วในเซสชัน: `pnpm audit` critical=0 · web-app `tsc --noEmit` exit 0 · backend 837 suites / 10,575 tests ผ่าน 0 ล้ม · `keys/private.pem` mtime เท่าเดิม

เหลือ: local-gate เทียบ baseline → คอมมิต → operator merge → operator deploy **แยกเดี่ยว** (staging → demo → gacpth.com)

## เฟส 2 · tools เป็นความจริงเดียวกับ main

ลำดับบังคับ:

- **2a** merge `feat/one-service-fee-no-split` (Tier C · operator) — ต้องมาก่อน ไม่งั้น skill เงินที่แก้แล้วจะขัดกับ main
- **2b** superpowers `44c9b2d6` → v6.4.1 + `diagnosing-superpowers` · รวมแบบสามทาง (upstream@44c9b2d6 = ฐาน · ไฟล์ของเรา · upstream@v6.4.1) — เก็บสิ่งที่เราแก้เอง รับของใหม่ · อัปเดต SUPERPOWERS-ATTRIBUTION.md เป็น commit ใหม่
- **2c** skill ของโปรเจกต์: `gacp-payment-invariants` `gacp-workflow-rules` `thai-ui-copy` `gacp-debug` `thai-business-days` `gacp-standards-requirements` `gacp-view-in-the-loop` — แก้ตามมติ ก.ย. ทุกข้ออ้างมติต้นทาง (memory / HARNESS_LOG / commit)
- **2d** agent/command ที่ยังสอนโมเดลเก่า: `accounting-reconciler` `payment-policy` `qa-e2e` `role-workflow-auditor` · `recon-daily` `audit-role` `sweep-legacy` — ตัวที่งานหายไปทั้งตัว (เช่น reconciler ที่กระทบยอดกับ `dtam_remittance_batches`) **ถาม operator ว่าเปลี่ยนหน้าที่หรือลบ ไม่ตัดสินเอง**
- **2e** CLAUDE.md / HARNESS.md: ลบ waiver L-006 ที่หมดอายุ · L3/L5/§5 ให้ตรงกับ no-CI และเงินขาเดียว · บันทึก HARNESS_LOG · merge = operator (L6)
- **2f** probe `retired-words` — คำที่ถูกยกเลิกอยู่ในไฟล์ข้อมูลไฟล์เดียว (คำ · มติที่ยกเลิก · วันที่) · สแกน CLAUDE.md HARNESS.md `.claude/skills` `.claude/agents` `.claude/commands` (v1) — `apps/` มี eslint ของตัวเอง · `docs/` ต้องใช้กติกาป้ายเลิกใช้ แยกเป็นงานถัดไป · คำที่อยู่ในคอมเมนต์ที่บรรยายว่า "เคยเป็นอะไร" ผ่าน (หลักเดียวกับ `no-skip` รุ่นแก้แล้ว) · มี `--selftest` ทั้งเคส fail/pass (L6)

## เฟส 3 · Node 20 → 24 (Active LTS)

เหตุผลเลือก 24: เป็น Active LTS วันนี้ (maintenance 2026-10-20 · หมด 2028-04-30) · 22 เข้า maintenance แล้วตั้งแต่ 2025-10-21 · 26 เป็น LTS 2026-10-28 ยังเร็วเกินสำหรับ native modules · รุ่นล่าสุดของ Prisma/puppeteer/Claude Code ต้องการ ≥22 อยู่แล้ว

1. **พิสูจน์ก่อนเปลี่ยน** — ติดตั้ง Node 24 ผ่าน nvm ใน worktree แยก · รัน backend full suite + web-app `tsc` + `next build` บน 24 · เทียบกับ baseline บน 20 · ความเสี่ยงหลักคือ Prisma 5.22 ออกก่อน Node 24 (`engines >=16.13` ไม่ห้ามแต่ไม่รับรอง) · **ถ้าพัง หยุดและรายงาน ถอยไป 22 ด้วยมติ operator**
2. เปลี่ยน: Dockerfile ทุกตัว `node:24-alpine` — **ปักเมเจอร์ ห้ามใช้ `node:lts-alpine`** (tag `lts` จะกระโดดไป 26 เองวันที่ 28 ต.ค.) · `engines.node: "24.x"` ทั้งสาม package.json · `.nvmrc` = 24 · ค่า node ใน `.github/workflows/*.yml` ให้ต้นไม้ไม่ขัดกันเอง
3. native modules (sharp, prisma engine, puppeteer chromium บน alpine) ต้อง rebuild ในอิมเมจ — พิสูจน์ด้วยการ build อิมเมจจริงและบูต backend ในคอนเทนเนอร์
4. Tier C (compose/Docker) · deploy = operator: staging → demo → gacpth.com

## เฟส 4 · jest เมเจอร์เดียว (30)

backend `jest ^29` → `^30` ให้ตรงกับ `babel-jest ^30` และ web-app · ตรวจ `ts-jest` รองรับ 30 · ไล่ breaking ของ jest 30 ในโค้ดเทสและในสคริปต์ probe ที่เรียก jest CLI (เช่นชื่อ flag ที่เปลี่ยน) · หลักฐาน: จำนวน suites/tests/skipped เท่าเดิมก่อน-หลัง ไม่ใช่แค่ "เขียว"

## probe `deps-health` (สร้างในเฟส 3 เปิดใช้ครบในเฟส 4)

FAIL เมื่อ:
- เมเจอร์ Node ใน Dockerfile / `engines` / `.nvmrc` ไม่ตรงกัน
- เมเจอร์นั้นเลยวัน end-of-life — อ่านจากไฟล์ข้อมูลในรีโป (`node-release-schedule.txt` มีวันที่ ไม่ใช่ literal ในสคริปต์ — หลัก operator "ไม่ hardcode") · เตือนล่วงหน้า 60 วัน
- `pnpm audit` มี critical — ออฟไลน์ = BLOCKED ไม่ใช่ PASS (L1)
- jest มีมากกว่าหนึ่งเมเจอร์ข้าม workspace

`--selftest` ทั้งสองทิศ · ลงทะเบียนใน probe-registry (การเซ็น cover = operator)

## เฟส 5 · เมเจอร์ — แต่ละตัวมี spec ของตัวเอง (ไม่ทำในแบบนี้)

ลำดับ: เครื่องมือ → ชั้นข้อมูล → เซิร์ฟเวอร์ → UI

1. ESLint 9→10 + `eslint-config-next` ให้ตรงกับ Next (ตอนนี้ 15.1.0 คู่กับ Next 15.5)
2. Prisma 5→7 — ย้าย Node ขึ้นคู่กันถ้าจำเป็น
3. Express 4→5 — path syntax · async error handling
4. React 19 + Next 16 พร้อมกัน (ผูกกันอยู่ · แก้ peer warning ของ react-leaflet ไปด้วย)
5. Tailwind 3→4 — กระทบ skill `gacp-design-tokens`
6. TypeScript 7 — รอ ts-jest / eslint รองรับก่อน
7. ตัวเล็กที่ตามหลังเมเจอร์ (uuid, ioredis, puppeteer, pm2, chalk, dotenv, lucide-react, framer-motion) — เก็บเป็นรอบเดียว

## สิ่งที่แบบนี้ไม่ทำ

- ไม่เปิดบอทอัปเดตอัตโนมัติ (ไม่มี CI)
- ไม่อัปเมเจอร์ใดในเฟส 1-4
- ไม่ลบหรือเปลี่ยนหน้าที่ agent โดยไม่ถาม operator
- ไม่แตะโค้ดเงิน นอกจากการ merge สาขาที่ operator อนุมัติแล้ว (2a)

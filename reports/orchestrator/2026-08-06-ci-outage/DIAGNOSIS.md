# CI OUTAGE — วินิจฉัย 2026-08-06

Status: `BLOCKED(operator:github-actions-billing-or-settings)`

## อาการ (ตรวจสดจาก GitHub API ใน session นี้)

1. Run สำเร็จครั้งสุดท้าย: #3255 เวลา 08:51 UTC (branch `docs/operator-proposals-2026-08-06`)
2. ช่วง 09:06–10:25 UTC: **ทุก run = `startup_failure`** (34/34 ตาม `reports/orchestrator/2026-08-06-law-enforcement/PROPOSED-CLAUDE-MD-DIFF.md:30` · ตรวจซ้ำรอบนี้: 8 run ล่าสุดเป็น startup_failure ทั้งหมด รวม `CI/CD Pipeline` run 31093116620 และ `Cleanup GHCR images` run 31093173973 บน main head `0727f4cf` เวลา 10:24-10:25 UTC)
3. หลัง 10:25 UTC: **push ใหม่ไม่สร้าง run เลยแม้แต่ startup_failure** — branch `claude/pending-work-summary-iwj5kw` (push ~19:25 UTC, PR #818) มี check runs = 0 (`pull_request_read get_check_runs` คืน `total_count: 0`)

## สิ่งที่ตัดออกได้ (หลักฐานฝั่ง repo)

- `.github/` ไม่มีการเปลี่ยนแปลงคร่อมช่วงที่พัง (law-enforcement report:30-31)
- Workflow ทั้ง 13 ไฟล์ parse ผ่าน (PyYAML + duplicate-key check — รันจริงโดย reviewer ใน session นี้) · `ci.yml` 19 jobs, `needs` อ้าง job ที่มีจริงครบ
- GitHub Actions status page = Operational ณ เวลาตรวจก่อนหน้า

⇒ สาเหตุแบบที่ agent commit แก้ได้ (YAML พัง / needs เพี้ยน) **ไม่มีในหลักฐาน**

## การอ่านอาการ

`startup_failure` = run ตายก่อนถึง job ใดๆ (ไม่มี log ให้อ่าน) — คลาสสาเหตุ: billing/spending limit ของ Actions บน private repo, payment method มีปัญหา, หรือ Actions ถูก disable ระดับ repo/account · ลำดับ "startup_failure → แล้วหยุดสร้าง run เลย" สอดคล้องกับการชนเพดาน spending limit แล้วระบบตัด (repo นี้เป็น private บนแพลนฟรี — บริบทเดียวกับที่ตั้ง branch protection ไม่ได้, CLAUDE.md §3 แถว 3.1)

## ปุ่มที่ operator ต้องกด (เรียงตามน่าจะเจอก่อน)

1. `github.com` → รูปโปรไฟล์ → **Settings → Billing and plans → Plans and usage** — ดู Actions minutes used / spending limit / สถานะ payment method (แพลนฟรี private repo มีโควตา 2,000 นาที/เดือน — ถ้าหมด run จะไม่ start)
2. Repo → **Settings → Actions → General** — ตรวจว่า "Allow all actions" ยังเปิด และไม่มี disable ระดับ repo
3. https://www.githubstatus.com — เผื่อ incident ฝั่ง GitHub
4. หลังแก้: Actions tab → **Re-run** run ล่าสุดบน main (`0727f4cf`) หรือ push commit ใดๆ — **ต้องเห็น run เขียว 1 ครั้งบน main** = พิสูจน์ probe-gate (#813) ครั้งแรกบน runner → จากนั้น agent จะเสนอ diff ปลดป้าย Law 3.5 `[ACTIVE — ยังไม่ยืนยันบน runner]`

## ผลกระทบระหว่างที่ยังไม่แก้

- Guardrail ทุกตัวที่ merge 2 วันนี้ (probe-gate #813, green-mask #808) ยังไม่เคยคุ้มครองจริง
- Gate ของ R2 กลไก 2 (R-R2-1: integration test ต้องรันจริงบน CI ไม่ skip — QUEUE.md:71-72) ปิดไม่ได้ ⇒ ห้ามเคลม DONE งานกลไก 2 จนกว่า CI ฟื้น
- PR ทุกใบ (รวม #818) merge ได้โดยไม่มี CI ตรวจเลย — ช่วงนี้ควรชะลอ merge ทุกใบที่ไม่ใช่ docs

---
name: gacp-view-in-the-loop
description: มาตรฐาน visual evidence ของ repo นี้ — operator ต้องตรวจงานด้วยตาได้โดยไม่อ่านโค้ด. Use when testing any UI/flow change, building an evidence pack, or preparing a QA round.
---

# View-in-the-Loop Evidence Standard

> หลัก (HARNESS.md §5): "รายงาน = index ชี้ artifact; operator เปิด trace/ภาพดูเอง = view-in-the-loop จริง"
> บทเรียน 2026-08-06: batch M4-M7 + ThaID merge โดย evidence pack หายทั้ง 5 ชุด — สกิลนี้มีไว้กันซ้ำ

## ทุก work item ที่แตะ UI/flow ต้องมีก่อนเคลม DONE

```
evidence/<work-item>/
  screenshots/     # ทุก step ของ flow เรียงลำดับ ตั้งชื่อ 01-.. 02-..
  trace/           # playwright trace ถ้ามี E2E
  INDEX.md         # ตาราง artifact → claim ที่มันพิสูจน์
  test-output.txt  # สรุปที่ evidence-pack.py สร้าง ห้ามวาง log ดิบของชุดเต็ม
  probe-results.json + ratchet-before-after.txt
```

- `test-output.txt`, `probe-results.json` และ `ratchet-before-after.txt` สร้างด้วยคำสั่งเดียว
  `node scripts/ops/evidence-pack.js <head_sha> <main_gate_sha> <evidence_dir>` (HARNESS.md §5)
- log ดิบอยู่ที่ `evidence/gate/logs/<sha>/` (gitignored) ไม่ commit เพราะมีสตริงคล้ายคีย์ที่ทำให้ secret scan ทั้งประวัติแดงถาวร

ตรวจด้วย: `WORK_ITEM=<id> UI_ITEM=1 bash scripts/check-done.sh evidence-complete` (งาน UI/flow ต้องมี `UI_ITEM=1` เสมอ
ไม่งั้น probe ไม่ตรวจ trace/video/screenshots/crawler)

## วิธีถ่าย

- ใช้สกิล `/run` เปิดแอปจริง + Playwright (Chromium อยู่ที่ `/opt/pw-browsers` ของเครื่อง cloud · ห้าม `playwright install` · เดสก์ท็อปและอัดวิดีโอด้วย `cu-desktop` / MCP `computer`)
- dev server และ stack ชั่วคราวเปิดผ่าน `scripts/ops/heavy.sh` เท่านั้น · ภาพยืนยันว่าระบบที่ขึ้นแล้ว
  ทำงานถ่ายจากชุด staging บนเซิร์ฟเวอร์ demo (staging.gacpth.com) หลัง deploy และระบุ revision จาก `GET /api/health` (memory `deploy-word-means-staging-only`)
- **หน้าของผู้ยื่น (`health`) ถ่าย viewport มือถือ 390×844 เป็นหลัก** หน้าเจ้าหน้าที่ถ่าย 1440×900 · `health` = บุคคลทั่วไป
  รวมนิติบุคคล ไม่ใช่แค่เกษตรกร (memory `role-words-health-and-provider`)
- ทุกภาพต้องตอบได้ว่า "operator ควรเห็นอะไรในภาพนี้" — เขียนคำบรรยายใน INDEX.md
- ทุกภาพกำกับ build SHA และวันที่ (ในชื่อไฟล์หรือ INDEX.md, HARNESS.md §4.4) · งานที่แตะสีหรือพื้นผิวมีภาพทั้งธีมสว่างและมืด
- วิดีโอ trace/playwright ของ evidence pack ทำบนเครื่องนี้ได้ · วิดีโอบรรยายสำหรับส่งมอบทำบน demo ที่ `/home/deploy/video-work`
  เท่านั้น ห้ามแตะ env หรือฐานข้อมูลของแอป demo (memory `video-work-lives-on-demo`)
- ข้อความไทยบนจอ: ตรวจกับสกิล `thai-ui-copy` · สี/spacing: `gacp-design-tokens`

## ปิดรอบ QA

- รวมภาพเป็น **หน้า walkthrough เดียว** เรียงตาม flow (HTML ใน evidence/ หรือ artifact) — operator ไล่ดูจากบนลงล่างแล้วรู้ว่าระบบทำอะไรได้จริง
- flow ที่ยังเปิดไม่ได้ (flag ปิด / mock / รอ credentials) ต้องเขียนกำกับว่า "ยังไม่เปิด" — ห้ามให้ภาพสร้างความเข้าใจผิด

## ข้อห้าม

- ห้าม fabricate ภาพ/ผลรัน (CLAUDE.md: ผลรันจริงชนะคำอธิบายเสมอ) — pack ไม่ครบให้เขียน MISSING รายชิ้น
- ทุกไฟล์ใน `evidence/` ผ่าน `gitleaks detect --no-git --no-banner --redact --source <file>` ก่อน commit (HARNESS.md §5)
- INDEX.md และหน้า walkthrough เขียนเป็นภาษาไทย ไม่มีอีโมจิ
- ห้ามบรรยายเกินกว่าที่ภาพแสดง (คำสั่ง 154) ข้อมูลตัวอย่างหรือ flag ที่ปิดอยู่ต้องติดป้ายบอกในภาพหรือคำบรรยาย
- jsdom string-match **ไม่ใช่** visual evidence (บทเรียน ThaID login: test ผ่านแต่ไม่มีอะไรให้ operator เปิดดู)

# CLAUDE.md — GACP-Certification-Application (v4 ฉบับเบา — ablation 2026-10-05)
> ทดลองตามคำสั่ง operator 2026-10-05: เก็บแค่ เราเป็นใคร · เป้าหมาย · แบบไหนเรียกว่าเสร็จ · ขอบเขตที่ห้ามข้าม
> ฉบับเต็มและสมุดพลาดซ้ำ: `docs/governance/claude-md-ablation-2026-10-05.md` — พลาดเรื่องเดิมซ้ำ = เติมข้อนั้นกลับ
> แก้ไฟล์นี้ได้เมื่อ operator สั่งเป็นลายลักษณ์อักษร + บันทึก HARNESS_LOG.md · merge = operator

## เราเป็นใคร
- ระบบยื่นขอและออกใบรับรอง GACP ของสมุนไพร (กัญชาและสมุนไพรควบคุม) ผู้ยื่นยื่นคำขอและชำระค่าบริการ
  เจ้าหน้าที่ตรวจเอกสาร ตรวจแปลง และออกใบรับรอง สืบย้อนผลผลิตได้ถึงต้นทาง
- ยังไม่เปิดให้บริการจริง (pre-production): มีแค่ demo ซึ่งเป็นเครื่องทดสอบด้วย, Stripe โหมดทดสอบ · รันโหมด production (NODE_ENV=production) และไม่มี waiver ค่าลับ (2026-10-14) · staging ยกเลิก 2026-11-08 (operator 2026-11-08 "ใช่เครื่อง demo เป็นเครื่องทดสอบแทน" · "ตามคุณตัดสินใจ")
- เครื่องพัฒนาและ gate หลัก = Ubuntu WSL บน PC ของ operator (dev + gate + walk + สั่ง deploy ผ่าน ssh · ตั้งเครื่องด้วย `scripts/ops/wsl-setup.sh` · Postgres ของ gate เป็น UTC และไม่ตั้ง `PAYMENT_ADAPTER`) · session cloud ใช้ได้เมื่อ push ผลขึ้น origin · เซิร์ฟเวอร์ demo 119.59.105.140 คือเครื่องทดสอบ ไม่มีชุด staging · build image บนเซิร์ฟเวอร์ demo · deploy ตาม `docs/operations/runbooks/deploy-demo.md` ด้วยสคริปต์ที่ operator อนุมัติทีละตัว (คำสั่ง 164 แก้ 2026-11-08 · operator อนุมัติ gate บน WSL 2026-11-07) · งานหนักทีละงานผ่าน `scripts/ops/heavy.sh`, dev server รันผ่าน heavy.sh เท่านั้น, จำนวน agent พร้อมกันไม่จำกัดตราบที่เครื่องไหว (operator 2026-11-07)
- ทีม: operator 1 คน + Claude กับ agent ทำงานเป็นทีมเดียว
- คุยกับ operator เป็นภาษาไทย ศัพท์เทคนิค ชื่อไฟล์ และคำสั่งคงเป็นภาษาอังกฤษ ข้อความบน UI เป็นภาษาไทยตาม `.claude/skills/thai-ui-copy`

## เป้าหมาย
- ดาวเหนือ (GOALS.md): พร้อมรับ pilot เกษตรกรจริง โดยที่ทุกคำกล่าวอ้างของระบบมีเครื่องพิสูจน์
- งานตอนนี้: ทำเส้นขอใบรับรองให้จบครบและถูกต้องตามกฎหมาย แล้วจึงทำขอบเขตข้อมูล T&T/QR

## แบบไหนเรียกว่าเสร็จ
ชั้นของงานตัดสินโดย `scripts/probes/tier-check.sh` เท่านั้น
| ชั้น | เสร็จเมื่อ |
|---|---|
| A — docs/reports/evidence/tests/skills | `scripts/ci/local-gate.sh` ไม่มีความล้มเหลวใหม่เทียบ `evidence/gate/<sha>.json` ล่าสุดของ main + review 1 ชั้น |
| B — โค้ดทั่วไป | `LOCAL_GATE_FULL=1` ไม่มีความล้มเหลวใหม่ + เทสต์ที่ fail ก่อนแก้ (เมื่อเปลี่ยนพฤติกรรม) + code review + security review · งาน UI/flow ต้องเปิดดูของจริงแล้วมีภาพ/วิดีโอ |
| C — เงิน/auth/identity/schema/migration/compose/secret/governance | ทุกข้อของ B + evidence pack เต็ม (HARNESS.md §5) + operator merge |
- สถานะที่รายงานมีสามค่าเท่านั้น: `DONE(probe:<name>)` ต้องมีผลรันจริงใน session นี้ · `PENDING` · `BLOCKED(operator:<need>)`
- ผลรันจริงชนะคำอธิบายเสมอ ไม่มีผลรัน = ยังไม่เสร็จ

## ขอบเขตที่ห้ามข้าม (operator เท่านั้น)
- merge Tier C, push main (ต้องมีคำว่า "merge"), และ deploy ทุกชนิด (ต้องมีคำว่า "deploy") · หลังได้คำนั้น coordinator ลงมือตาม runbook ด้วยสคริปต์ที่ operator อนุมัติทีละตัว (สิทธิ์ระบุชื่อสคริปต์ใน .claude/settings.local.json) · ระบบสิทธิ์ปฏิเสธ = หยุดแล้วรายงาน
- แก้เงินจริง, refund, หรือตั้ง live payment key
- secret ห้ามอยู่ในโค้ด log report หรือแชต · เจอ secret ใน git history ให้รายงานก่อน
- waiver, manual cover, การขยับ baseline ของ ratchet ขึ้น, และการปิด guardrail
- probe ขัดกับรายงานของ agent ให้เชื่อ probe แล้วรายงานความขัดแย้ง

# คู่มือดูแลและส่งต่อระบบ GACP — 2026-09-06

> ฉบับอ่านสวย: `docs/operations/maintenance-and-handover-2026-09-06.html`
> เขียนจาก Deep QA + code audit 2026-09-06 · ทุกตัวเลขมาจากการรันจริง

แพลตฟอร์มนี้สร้างเร็วด้วย AI เป็นส่วนใหญ่ ความเสี่ยงจริงไม่ใช่ "โค้ดเละ" (การวัดพบว่าอยู่ในเกณฑ์
มาตรฐาน) แต่คือ **"พังแล้วไม่มีใครรู้"** และ **"คนรับงานต่อไม่รู้จะเริ่มตรงไหน"**

## 1. สิบนาทีแรกของทุก session
1. เปิดงานด้วย `cc` เท่านั้น (พาเข้า tmux) · เช็คผีด้วย `cc-doctor` — ห้ามรัน claude เปล่า ๆ นอก tmux
2. `bash scripts/session-check.sh` — เครื่องพิมพ์ branch / diff / probe ให้เอง
3. อ่าน `~/work/START-HERE.txt` · `~/work/state/STATE.md` · `memory/MEMORY.md` ก่อนเชื่ออะไร
4. `git log --oneline origin/main..HEAD` — งานที่ยังไม่ merge = ของที่รอคำว่า "merge" จาก operator

## 2. แผนที่ (139 services · 190 routes · 832 backend tests · 361 web tests)
- `CLAUDE.md` — กฎถาวร L1–L6 + Definition of Done (รัฐธรรมนูญของ repo)
- `HARNESS.md` / `HARNESS_LOG.md` — สถาปัตยกรรม harness + บันทึก append-only
- `BACKLOG-FOUND.md` — หนี้ที่เจอแล้วยังไม่แก้ พร้อมเหตุผล (เริ่มงานถัดไปจากที่นี่)
- `apps/backend/services/` — ตรรกะธุรกิจ · เงินอยู่ `modules/billing/` + `services/billing/` + `services/checkout/`
- `apps/backend/routes/api/` — ประตู HTTP แยกตาม role (applications=เกษตรกร, provider=เจ้าหน้าที่, admin, finance)
- `scripts/probes/` + `scripts/ci/` — เครื่องบังคับกฎ
- หลักคิด: "กฎที่ไม่มีเครื่องบังคับ = กฎร่าง" · "หลักฐาน > คำอธิบาย"

## 3. เมื่อระบบมีปัญหา วินิจฉัยตามลำดับ
1. `bash scripts/ci/local-gate.sh` — ตัวที่แดงบอกชื่อ probe ตรง ๆ
2. เทียบ baseline เสมอ (`evidence/appv2-B1-gate/compare-gate-vs-baseline.sh`) — เกณฑ์คือ "ไม่มีความล้มเหลวใหม่" ไม่ใช่ "เขียวหมด"
3. เรื่อง flow/UI — อย่าเชื่อ unit test อย่างเดียว มันเขียวได้ทั้งที่ feature พัง ต้องกดจริงบนเบราว์เซอร์
4. ดู log backend — endpoint ที่ตอบ 200 พร้อมข้อมูลว่างอาจกำลังปกปิดความล้มเหลว (ดูข้อ 8)
- กับดัก: probe บางตัว match "รูปแบบ" ไม่ใช่ "ค่า" — เมื่อ counter แดง ดูก่อนว่าเป็นคอมเมนต์/ตัวเลขจัดรูปแบบไหม

## 4. แก้ให้ปลอดภัย
- tier ตัดสินโดย `scripts/probes/tier-check.sh` เท่านั้น (A=docs/test · B=โค้ด+review 2 ชั้น · C=เงิน/auth/schema=operator merge)
- RED ก่อน GREEN เสมอ · เทสวัดพฤติกรรมไม่ใช่รูปร่าง · แก้เทสที่ผิดอย่าผ่อนเทส · ratchet ลงทางเดียว

## 5. เส้นห้ามข้ามถ้าไม่มี operator (L2/L3/L5)
- **เงิน**: อ่าน/flag/เสนอ diff เท่านั้น · live key ห้ามตั้งจน G1 เขียว
- **secret/กุญแจเซ็น**: ห้ามพิมพ์ secret · ห้ามแตะ `apps/backend/keys/*.pem` · เช็ค mtime ก่อน (jest เคยหมุนกุญแจจนใบรับรองเสีย)
- **deploy + merge Tier C**: operator เท่านั้น · agent push main ได้เฉพาะเมื่อ operator พิมพ์ "merge"
- **Supabase**: prod+preview ใช้ตัวเดียวกัน อ่านได้เขียนไม่ได้ · migration ไม่ apply จนถึง gate

## 6. คลาสบั๊กที่เจอซ้ำ (ทุกตัวเคยเขียวในเทสขณะ feature พัง)
- ประตูถามสิ่งที่จอไม่เคยเขียน (v1-hard-lock) · select gap · guard match รูปแบบไม่ใช่การประกาศ ·
  สองฝั่งอ่านคนละคำประกาศ (ยื่น vs คิดเงิน) · คำปฏิเสธไปไม่ถึงผู้ใช้ (envelope ตัด message)
- บทเรียนร่วม: เทสทดสอบสองปลาย ไม่เคยทดสอบทางเชื่อมตรงกลาง → เพิ่ม pure-function test ของ seam + กดจริงซ้ำ

## 7. Deploy ลำดับห้ามสลับ
1. `cd apps/backend && npx prisma migrate deploy` **ก่อน** ปล่อย image เสมอ
2. ห้ามลืม `STAGING_IMAGE_TAG=` · ห้าม `docker compose up -d` เปล่า ๆ · ห้าม `--remove-orphans`
3. verify build ใหม่จริงก่อนเปิดม่าน nginx
- ค้างตอนนี้: ฐานที่ใช้ร่วมตามหลัง migration — ต้อง migrate deploy ก่อน deploy ครั้งถัดไป

## 8. หนี้ที่รู้แล้ว (รายละเอียดเต็ม BACKLOG-FOUND.md)
- **F-QA-ERRLOG** (HIGH) — 4 ประตูตอบ 200 พร้อมข้อมูลว่างเมื่อ query ล้ม, 2 ตัวไม่มี log
- **F-GATE1** (HIGH) — staging deploy ไม่ติดตั้ง backup cron
- **F-QA-GATES** (MED) — 11/29 gate ไม่ต่อเข้า CI, 4 แดง
- **F-QA-DUP** (MED) — ตรรกะซ้ำบน path เงิน+auth · **F-G4-71** — ทางเลือก ค ยังไม่ทำ · **F-SLIP-01** (LOW)

## 9. วันแรกอ่านอะไร
`CLAUDE.md` → `HARNESS.md` + รัน local-gate หนึ่งครั้ง → `BACKLOG-FOUND.md` → `memory/` → ลองงานชั้น A ให้ผ่าน gate ก่อนแตะโค้ดธุรกิจ
- ถ้าใช้ AI ทำต่อ: สั่ง "กดจริง เห็นจริง" เสมอ · RED ก่อน GREEN · ห้ามรับ "น่าจะได้" · เอกสารยาวกว่า diff = สัญญาณเสีย

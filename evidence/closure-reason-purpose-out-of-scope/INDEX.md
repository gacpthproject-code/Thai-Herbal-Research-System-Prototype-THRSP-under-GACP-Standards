# เหตุปิดคำขอ PURPOSE_NOT_IN_SCOPE

คำสั่ง operator 2026-10-30 (ข้อ ก): เพิ่มเหตุปิดคำขอที่ตรงความจริง สำหรับคำขอที่ยื่นด้วยวัตถุประสงค์ที่ถอดออกจากขอบข่ายแล้ว (MEDICAL ถอดเมื่อ 2026-10-05) ที่มา: `~/work/state/reviews/cert-1-2569-revoke-2026-10-30.md` หัวข้อ APP-2569-MUJZRHP3

## สิ่งที่เปลี่ยน

- `apps/backend/shared/application-closure-reasons.js` เพิ่มรหัส `PURPOSE_NOT_IN_SCOPE` ป้าย "วัตถุประสงค์ที่ระบุในคำขอไม่อยู่ในขอบข่ายการรับรองแล้ว" และตาราง `APPLICATION_CLOSURE_NEXT_STEPS` ที่มีขั้นต่อไปของรหัสนี้รหัสเดียว
- `apps/web-app/src/constants/application-closure-reasons.ts` ป้ายเดียวกัน (เทสต์ mirror ตรึงไว้)
- `apps/backend/services/application-closure-notify.js` แจ้งเตือนถึงผู้ยื่นต่อท้ายด้วยขั้นต่อไป เฉพาะรหัสที่มีในตาราง ข้อความที่ผู้ยื่นได้รับ:
  "เจ้าหน้าที่ยกเลิกคำขอเลขที่ … ของคุณแล้ว เนื่องจากวัตถุประสงค์ที่ระบุในคำขอไม่อยู่ในขอบข่ายการรับรองแล้ว หากยังต้องการขอใบรับรอง ผู้ที่มีสิทธิ์ยื่นคำขอในนามผู้ขอรับรองยื่นคำขอใหม่ได้ โดยเลือกวัตถุประสงค์ที่ยังอยู่ในขอบข่ายการรับรอง และแนบใบอนุญาตที่วัตถุประสงค์นั้นกำหนด"
- `.claude/skills/gacp-workflow-rules/SKILL.md` บันทึกกติกาขั้นต่อไป

ไม่มี enum หรือ check constraint ในฐานข้อมูล รหัสเก็บใน `formData.adminClosure` (JSON) จึงไม่มี migration

## ทำไมประโยคขั้นต่อไปจริง

- `CANCELLED` อยู่ใน `TERMINAL_STATUSES` (`services/application-status-writer.js`) และด่านยื่นซ้ำตัวเดียว (`findInFlightSuccession`, `services/application-submit-guard.js`) ไม่นับคำขอที่จบแล้ว คำขอที่ยกเลิกจึงไม่บล็อกการยื่นใหม่
- คำขอใหม่เลือกได้เฉพาะ RESEARCH / EXPORT / PROCESSING (`shared/certification-purposes.js`) และกัญชาต้องแนบใบอนุญาต ภ.ท. ของวัตถุประสงค์นั้น จึงเขียนเงื่อนไขการแนบไว้ในประโยค
- ผู้รับแจ้งเตือนรวมผู้ยื่นที่อาจถูกลดสิทธิ์แล้ว (`services/notification/application-parties.js`) ประโยคจึงพูดถึง "ผู้ที่มีสิทธิ์ยื่นคำขอในนามผู้ขอรับรอง" ไม่ใช่ "คุณ"
- ประโยคไม่พูดเรื่องเงินหรือการคืนเงิน

## หลักฐาน

| ไฟล์ | สิ่งที่พิสูจน์ |
|---|---|
| `red-backend.txt` | main 93982350f บน Postgres ทิ้งได้: ปิดด้วย `PURPOSE_NOT_IN_SCOPE` ได้ 400 (2 เทสต์แดง) · เทสต์รหัสที่ไม่อยู่ในรายการและเทสต์ "เหตุอื่นไม่สัญญาการยื่นใหม่" เขียวตั้งแต่ก่อนแก้ เพราะเป็นราวกั้น ชื่อเทสต์และข้อความที่ตรวจในไฟล์นี้เป็นรุ่นแรก |
| `red-web.txt` | main: ฟอร์มปิดคำขอไม่มีตัวเลือก `PURPOSE_NOT_IN_SCOPE` |
| `red-mirror.txt` | เพิ่มรหัสฝั่ง backend อย่างเดียว เทสต์ mirror จับได้ว่าฝั่งเว็บขาด |
| `green-backend.txt` | 0fe354dc6: `staff-access-2-real-postgres` + `admin-doors-around-the-certification-decision-real-postgres` 142/142 |
| `green-unit.txt` | mirror + `workflow-transitions-cert-integrity` 13/13 |
| `green-web.txt` | `force-status-closure.test.tsx` 5/5 (รันที่ df2accd1c ไฟล์เว็บไม่เปลี่ยนหลังจากนั้น) |
| `mutation.txt` | 5/5 mutant ถูกฆ่า: ตัดขั้นต่อไป, ให้ขั้นต่อไปกับทุกเหตุ, ต่อท้ายเสมอ (ได้ " undefined"), รับรหัสรูปตัวพิมพ์ใหญ่อะไรก็ได้, ลบรหัสออก |
| `walk/after-run.txt`, `screenshots/` | next dev + backend จาก 0fe354dc6 บน Postgres ทิ้งได้: ผู้ดูแล system_admin_dtam เห็นตัวเลือกใหม่ในหน้าต่างเปลี่ยนสถานะ (`01`) ปิดคำขอขิงที่ยื่นด้วย MEDICAL ได้ 200 · DB `CANCELLED closedReason=CANCELLED_BY_ADMIN adminClosure=PURPOSE_NOT_IN_SCOPE` · ผู้ยื่นล็อกอินเห็นแจ้งเตือนข้อความเต็ม (`03`) |

ไม่แตะ staging, demo, หรือ `apps/backend/keys` · key ลงนามของ walk อยู่ใน /tmp

## รันซ้ำ

- เทสต์: `closure-reason-suite.sh <worktree> <ไฟล์ jest>` (Postgres ทิ้งได้ที่ 127.0.0.1:5434)
- mutation: `closure-reason-mutations.sh <worktree>` (ต้อง commit ก่อน สคริปต์คืนไฟล์ด้วย git checkout)
- walk: `~/work/state/heavy.sh timeout 3600 evidence/closure-reason-purpose-out-of-scope/walk/run.sh`

## Gate

`~/work/state/heavy.sh timeout 7200 ~/work/state/gate/gate-locked.sh 0fe354dc6d65d1f25e4d297e341868bb2882f4da` แล้ว `compare.sh` (`gate-compare.txt`, attestation `gate-0fe354dc6.json`)

- ชุดเทสต์: 1204 ผ่าน 4 ไม่ผ่าน · ความล้มเหลวใหม่เทียบ main gate 110d5ed96 มีไฟล์เดียว `__tests__/unit/finance-paper-text-inside-print-margin.test.js` สาเหตุ `TimeoutError: Navigation timeout of 30000 ms exceeded` ของ puppeteer ระหว่าง gate (PDF under load) ไม่เกี่ยวกับงานนี้ · รันเดี่ยวบน 0fe354dc6 ผ่าน 12/12 (`gate-flake-solo.txt`) · ไฟล์นี้ล้มใน gate ก่อนหน้ามาแล้ว 12 ครั้ง (`~/work/state/gate/fails-*`)
- gitleaks: ไม่มีแถวไหนชี้ commit ของ branch นี้ (df2accd1c, f4e7a9134, 0fe354dc6) ทุกแถวเป็นไฟล์ evidence ของ commit อื่นที่อยู่บน main แล้ว
- ขั้น workspace-clean, suite-green, integration-pg, secret-scan-deep, probe-ci, integration-no-skip ล้มบน main 110d5ed96 เหมือนกัน
- ขั้น deploy-drift ผ่านบน gate ของ main 110d5ed96 แต่ล้มที่นี่ ขั้นนี้เทียบของที่รันอยู่บนเครื่องกับ origin/main ไม่ได้อ่านโค้ดของ branch: demo รัน f37535af3 ตามหลัง origin/main 93982350f อยู่ 60 commit (`logs/.../deploy-drift.log`) เป็นสถานะเครื่อง ไม่ใช่ผลของงานนี้
- สรุป: ไม่มีความล้มเหลวใหม่ที่มาจากงานนี้

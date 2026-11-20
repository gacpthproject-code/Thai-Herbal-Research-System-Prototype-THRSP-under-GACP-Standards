# precheck-scope-honest · หลักฐาน

สาขา `fix/precheck-scope-honest` · โค้ดที่ตรวจ = `f5e6cbad8` · ชั้นงาน C (`scripts/probes/tier-check.sh`: `apps/backend/services/storage-service.js` เป็น auth-exact-path) · operator merge

## ปัญหาที่ operator เจอบน demo (2026-10-31)

อัปโหลดใบแจ้งหนี้เข้าช่อง "หนังสือแสดงการดำเนินการภายใต้ความร่วมมือและการกำกับดูแลของผู้รับอนุญาตผลิตยาหรือผลิตภัณฑ์สมุนไพร"
แล้วหน้าจอไม่พูดอะไรเลย จึงดูเหมือนผ่าน ส่วนใบเดียวกันในช่องบัตรประชาชนถูกตั้งข้อสังเกต · การตรวจไม่เขียน log · log อัปโหลดพิมพ์ชื่อไฟล์ไทยเพี้ยน

## สิ่งที่เปลี่ยน

1. ไฟล์ที่แนบแล้วแต่ไม่มีผลตรวจเบื้องต้น ขึ้น "ช่องนี้ระบบไม่ได้ตรวจเบื้องต้น เจ้าหน้าที่จะตรวจเอง" ทั้งการ์ดผู้ยื่นและหน้าตรวจเอกสารของเจ้าหน้าที่
   ยกเว้นตอน server อ่านผลตรวจไม่ได้ (`precheckUnavailable: true`) เพราะตอนนั้นไม่รู้ว่าตรวจแล้วหรือยัง
2. ช่อง `producer_supervision_letter` เข้าขอบเขตการตรวจ (ช่องที่ 8) ตรวจชนิดเอกสารด้วยวลีเดียว "กำกับดูแลของผู้รับอนุญาตผลิต"
   ที่คัดตรงจาก `reports/research/2026-09-01-dtam-application-baseline/facts.md:49` · ไม่เทียบชื่อ เพราะไม่มีที่มาบอกว่าเทียบช่องไหน
3. log หนึ่งบรรทัดต่อการตรวจ `precheck run` และ `precheck skipped: slot out of scope` · log อัปโหลดแสดงชื่อไฟล์ไทยถูก (ข้อมูลที่เก็บไม่เปลี่ยน)

## ภาพก่อนและหลัง (scratch Postgres + Redis + backend และ next dev จาก tree เดียวกัน ไม่แตะ staging/demo)

ใบแจ้งหนี้ไฟล์เดียวกัน (`apps/backend/__tests__/fixtures/document-precheck/corpus/producer_supervision_letter--invoice.pdf`)
อัปโหลดผ่าน `POST /api/applications/draft-documents` เข้า 3 ช่อง แล้วเปิดดูหน้าจอจริง

| ช่อง | ก่อน (main `53976fc5e`) | หลัง (`f5e6cbad8`) |
|---|---|---|
| หนังสือกำกับดูแล · การ์ดผู้ยื่น ขั้น 2 | `shots/before-applicant-step2-documents.png` ไม่มีข้อความใด | `shots/after-applicant-step2-documents.png` ข้อสังเกต "ไม่พบข้อความที่ตรงกับชนิดเอกสารที่คาด กรุณาตรวจว่าอัปโหลดถูกช่อง" |
| หนังสือกำกับดูแล · แถวเจ้าหน้าที่ | `shots/before-reviewer-producer-row.png` ไม่มีข้อความใด | `shots/after-reviewer-producer-row.png` บล็อกผลตรวจ มีข้อสังเกตชนิดเอกสาร |
| SOP (นอกขอบเขต) · การ์ดผู้ยื่น ขั้น 5 | `shots/before-applicant-step5-sop-card.png` ไม่มีข้อความใด | `shots/after-applicant-step5-sop-card.png` "ช่องนี้ระบบไม่ได้ตรวจเบื้องต้น เจ้าหน้าที่จะตรวจเอง" |
| SOP (นอกขอบเขต) · แถวเจ้าหน้าที่ | `shots/before-reviewer-sop-row.png` ไม่มีข้อความใด | `shots/after-reviewer-sop-row.png` ข้อความเดียวกัน |
| บัตรประชาชน (คุมผล) | `shots/before-reviewer-id-row.png` | `shots/after-reviewer-id-row.png` เหมือนเดิม |

ข้อความที่อ่านได้จากหน้าจอแต่ละภาพอยู่ใน `text/` · ลำดับงานและผลอัปโหลดอยู่ใน `logs/after-job.txt` และ `logs/before-job.txt`

## log จาก backend จริง

`logs/after-backend-precheck-lines.txt` (หลัง) เทียบ `logs/before-backend-precheck-lines.txt` (ก่อน)

- ก่อน: `[Upload] Accepted: à¹à¸à¹...pdf` และไม่มีบรรทัดของการตรวจ
- หลัง: `[Upload] Accepted: ใบแจ้งหนี้.pdf` · `precheck skipped: slot out of scope {"slot":"sop_manual",...}` ·
  `precheck run {"slot":"producer_supervision_letter","status":"DONE","durationMs":252,"flags":[{"check":"DOC_TYPE","result":"NOT_FOUND"},...]}`
  ไม่มีข้อความในเอกสาร ไม่มีชื่อ ไม่มีเลขบัตร

## เทสต์

เทสต์เขียนก่อนแก้และล้มบน main ทุกตัวที่เปลี่ยนพฤติกรรม (backend 13 ตัว web 3 ตัว รอบแรก · รอบแก้ตามผลตรวจอิสระ backend 4+3 ตัว web 3 ตัว)

- `apps/backend/__tests__/unit/document-precheck/rules.test.js` วลีทุกตัวต้องอยู่บนบรรทัด facts.md ที่อ้าง · ใบแจ้งหนี้ ใบอนุญาตผลิต หนังสือรับรองบริษัทที่มีคำว่ากำกับดูแลกิจการ และสัญญาเช่า ได้ NOT_FOUND
- `apps/backend/__tests__/unit/document-precheck/service.test.js` บรรทัด log ต่อสถานะ DONE/FAILED/RETRY/SUPERSEDED และไม่มีข้อความเอกสาร
- `apps/backend/__tests__/unit/document-precheck/routes.test.js` อ่านผลตรวจไม่ได้ = `precheckUnavailable: true` ทุกช่อง
- `apps/backend/__tests__/unit/storage-upload-log-decodes-filename.test.js` ชื่อไฟล์ไทยใน log
- `apps/backend/__tests__/integration/document-precheck-accuracy.test.js` ทุกช่องใน CATALOG ต้องมีเอกสารในชุดทดสอบ
- `apps/web-app/src/app/health/applications/new/_steps/steps/__tests__/requirement-slot-card-precheck.test.tsx`
- `apps/web-app/src/app/provider/reviewer/[id]/document-check/__tests__/document-check-precheck.test.tsx`

web jest โฟลเดอร์ที่แตะ 649/649 · web `tsc --noEmit` rc 0 · eslint ไฟล์ที่แตะ 0 error

## ความแม่นของการตรวจ (`node scripts/document-precheck/accuracy-report.js`, 71 ไฟล์)

ช่องใหม่มี 10 ไฟล์ ทั้งหมดได้ผลตรงกับ label · DOC_TYPE 81.8% / 90.0% · overall 83.3% / 92.1% · อ่านไม่ออก 22.5% · ผ่านพื้นเดิมทุกตัว
ไม่ขยับพื้นใน `thresholds.json` เพราะตัวอย่างบวกของช่องใหม่เป็นข้อความสังเคราะห์ที่เขียนให้มีวลีอยู่แล้ว ตัวเลขที่ดีขึ้นจึงไม่ได้แปลว่าตรวจเก่งขึ้น

## gate

`~/work/state/heavy.sh timeout 7200 ~/work/state/gate/gate-locked.sh f5e6cbad88683c3f544bc98733879cf589cac159` rc 0 · `logs/gate-compare-f5e6cbad8.txt`
ไม่มี suite ล้มใหม่เทียบ main gate `110d5ed96` (ล้ม 3 suite เท่ากับ main) · gitleaks ที่ไม่อยู่ใน baseline มาจาก commit ของ main ทั้งหมด ไม่มีจาก commit ของสาขานี้

## ผลตรวจอิสระและสิ่งที่แก้ตาม

ผู้ตรวจอิสระ (opus) ขอแก้ 3 ข้อสำคัญ แก้แล้วทั้งหมดใน `6597d5482` และ `f5e6cbad8`
1. วลี "ผู้รับอนุญาตผลิต" หรือ "กำกับดูแล" ลำพัง ทำให้ใบอนุญาตผลิตและเอกสารอื่นได้ MATCH แล้วการ์ดขึ้น "ไม่พบข้อสังเกต" · เหลือวลีเดียวที่ยาวกว่า
2. พื้นความแม่นที่ยกขึ้นมาจากตัวอย่างบวกที่เขียนให้ผ่าน · คืนเป็นค่าของ main
3. อ่านผลตรวจไม่ได้แล้วทุกช่องจะขึ้นว่า "ไม่ได้ตรวจ" ซึ่งเป็นเท็จ · เพิ่ม `precheckUnavailable`

## ข้อจำกัดที่ยังอยู่

- หนังสือกำกับดูแลจริงที่ไม่ได้เขียนคำว่า "กำกับดูแลของผู้รับอนุญาตผลิต" ติดกัน จะได้ข้อสังเกต NOT_FOUND (เจ้าหน้าที่ตัดสิน) · เลือกทางนี้เพราะผิดทางนี้ไม่ทำให้ดูเหมือนผ่าน
- ช่องอื่นนอก 8 ช่องยังไม่ได้ตรวจ เพียงบอกตรง ๆ ว่าไม่ได้ตรวจ

## ทำซ้ำ

`~/work/state/heavy.sh timeout 3600 evidence/precheck-scope-honest/bin/job.sh <tree> <label>` (สคริปต์ใน `bin/` สร้าง scratch stack ลบทิ้งเองเมื่อจบ)

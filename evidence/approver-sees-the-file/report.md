## Batch A fix/approver-sees-the-file — 2026-10-05
Status: PENDING (ต้อง LOCAL_GATE_FULL attestation + review ก่อน merge · Tier B ตาม tier-check)
Branch: fix/approver-sees-the-file จาก f8daa816 · commits 11abc05a (backend) · f020c5d7 (web: แฟ้ม+ถอดแท็บ) · 826b1256 (web: ปุ่ม/ข้อความ) + commit ปิดท้าย (แก้ mock 2 เทส + report + BACKLOG)

Items
1 DONE  GET /api/provider/auditor/applications/:id/decision-file (auditor.js, อ่านอย่างเดียว, CERT_DECIDERS, เฉพาะ AUDIT_PASSED+org เดียวกัน) · service certification-decision-file-service.js ใช้ reviewPhotoProvenance/verifyGpsAgainstFarm/requirements engine ซ้ำ · หน้า /provider/certification-decisions/[id] · ปุ่มรายละเอียดชี้มาที่นี่ · onsite write ยัง 403 (เทส pin)
   เลือกทำ endpoint รวมแทนเปิด onsite router ให้ approver: router นั้นคุม AUDIT_STAFF ระดับไฟล์ การเพิ่มบทบาทเปิด disclosure PATCH และ context ด้วย
2 DONE  assertOnsiteEvidenceForPass รันก่อนเขียน AUDIT_PASSED ใน 3 ประตู (audit-decisions, audits/:id/result, workflow-transitions ไม่ force) · submitDecision เดิมมีด่านอยู่แล้ว · 422 + ข้อความไทยจาก shared/error-codes.js (6 รหัส, httpStatus ปรับเป็น 422 ตามที่ตอบจริง) · final-approvals ตอบ 422 ไม่ใช่ 500 · docs/api/error-codes.md สร้างใหม่ (diff ใหญ่เพราะ stale บน main)
3 DONE  ถอดแท็บ อนุมัติ + การเรียก /final-approval-queue + คีย์พจนานุกรมที่ไม่เหลือผู้ใช้
4 DONE  ตาราง ROLE_TRANSITIONS: FIELD_INSPECTOR มี CAR_REVIEWING->CAR_PENDING จึงต่อสาย MINOR/MAJOR ใน handler · REJECT ไม่ใช่ขา -> handler ปฏิเสธ (CAR_REVIEWING_CANNOT_REJECT) และซ่อนปุ่ม
5 DONE  ผู้ยื่นหลัง PASS ได้ข้อความไทยบอกรอผู้อนุมัติ · เลิกส่ง APPLICATION_APPROVED จาก audits.js · ข้อความส่งแก้ไขไม่มี emoji/CAR · hint Coordinator แก้ · ผู้อนุมัติได้ in-app notification ที่ writer เมื่อถึง AUDIT_PASSED (certification-decision-notify.js)
6 DONE  คอมเมนต์ stale ใน auditor.js และ auditor-audit-decision-handler.js แก้ (ใบออกที่ APPROVED)

Tests
RED  evidence/approver-sees-the-file/red.txt (บน source main): backend 18 fail/10 pass, web 6 fail + suite หาโมดูลไม่เจอ
GREEN evidence/approver-sees-the-file/green.txt: backend 28/28, web 17/17
pin ไม่ใช่ fix (เขียวแต่กำเนิด): job-sheet PASS มีหลักฐานครบ · approver เขียน onsite ไม่ได้ (2 เทส) · error-response 5 รหัสเดิม · web "Minor/Major ยังอยู่"
backend unit: 11749 tests, ล้ม 0 หลังแก้ mock (ก่อนแก้ล้ม 2: terminal-decision-letter, workflow-transitions-cert-integrity เพราะ mock writer ไม่มีด่าน — อัปเดต mock รวมแก้เก่า 4 ไฟล์) · main: 11749/0
web jest เต็ม: 3763 tests ล้ม 0 (main 3746/0) · web tsc: 0 error
ratchet 26/53/101/0 = main
probe-gate: ล้มเพิ่มจาก main 1 ตัวคือ gate-attestation (ต้อง full-gate attestation ของ sha ใหม่) · main-attestation-audit, nginx-config-drift ล้มบน main เหมือนกัน
keys/*.pem mtime ไม่เปลี่ยน (2026-09-05) · ไม่มี Postgres ในเครื่อง: integration real-DB ไม่ได้รัน = PENDING

Concerns (รายละเอียด BACKLOG-FOUND.md)
- ผู้ยื่นได้แจ้งผ่านตรวจ 2 ใบ (handler + writer) · admin force ข้ามด่านหลักฐานที่ workflow-transitions (ตั้งใจ) · คิวไม่กรององค์กรแต่แฟ้มกรอง · GET /provider/applications/:id ไม่มี role gate · ปุ่มใบงานยังมี emoji/ศัพท์ CAR

## fix round 1
1 MAJOR: test ใหม่ใน approver-sees-the-file-pass-doors.test.js ขับ POST /audits/:id/result ด้วย gate จริง (422 ไทย + 200) · ถอดบรรทัด gate ใน audits.js ชั่วคราว -> RED (fix-round-1-gate-mutation-red.txt) · คืนแล้ว -> GREEN
2 MEDIUM: decision-file และ final-approval-queue ปฏิเสธ 403 เมื่อไม่มีองค์กร (fail closed) · คิวกรองตามองค์กร (listFinalApprovalQueue({organizationId})) · test: ข้ามองค์กร 404, ไม่มีองค์กร 403 (fix-round-1-org-wall-red.txt)
3 MINOR: handler ไม่ส่งแจ้งเตือน PASS ซ้ำแล้ว · test "ผู้ยื่นได้ 1 ใบต่อ PASS" RED=2 ใบ (fix-round-1-duplicate-notice-red.txt) · เทส item5 เดิมปรับให้ตรงข้อความของ writer · test ที่อ่าน fanout ใช้ application id แยก เพราะ dedupe 60 นาที
GREEN: fix-round-1-green.txt 27/27
unit folder after pointer fix: 11749 tests, 1 failed (error-codes pointer line shift, fixed; targeted rerun 5/5) — fix-round-1-unit-full.log

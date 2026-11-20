# ออกใบรับรองต้องผ่านกติกาความครบของผู้ถือ (มติ operator 2026-10-30)

สาขา `fix/issuance-holder-complete` จาก main ee5be3508 · Tier B (`scripts/probes/tier-check.sh`) · fix commit 0f138453c

## ต้นเหตุ
ทุกทางที่ออกใบรับรองผ่าน `certificate-service.generateCertificate` ประตูเดียว: ผู้อนุมัติ (`POST /api/provider/auditor/applications/:id/final-approvals` → `certification-decision-service.approveCertification`), ตัวเขียนสถานะตอน APPROVED (`application-status-writer`), การต่ออายุ (`formData.renewalOf` ในฟังก์ชันเดียวกัน) และ `prisma/seed-gacp.js` · ฟังก์ชันนี้ตรวจหลักฐานตรวจแปลง ชนิดพืช และที่ตั้งฟาร์ม แต่ไม่ถามความครบของผู้ถือ คำขอที่ยื่นก่อนมีทะเบียนผู้ถือจึงได้ใบรับรองทั้งที่ผู้ถือไม่มีเลขทะเบียน ผู้ลงนาม ที่อยู่ หรือโทรศัพท์

หน้าผู้อนุมัติมีปัญหาที่สอง: `api-client.ts` ถือว่าข้อความยาวเกิน 300 ตัวอักษรเป็นข้อผิดพลาดภายใน รายการช่องที่ขาดของบริษัทยาวกว่านั้น จอจึงจะขึ้น "เกิดข้อผิดพลาดภายในระบบ (HTTP 422)" แทนรายการ

## แก้
- `generateCertificate` เรียก `missingHolderFields(readHolder(app.entity))` (กติกาเดียวกับประตูยื่นและประตู CAR ใน `shared/holder-registry.js`) ก่อนเขียนฟาร์ม แปลง หรือใบรับรอง ไม่ครบ = 422 `CERTIFICATE_HOLDER_INCOMPLETE` ข้อความไทยระบุทุกช่องที่ขาด และ `missingFields` · คำขอที่ไม่มีผู้ถือถูกปฏิเสธเป็น `holder`
- `api-client.ts` ไม่ตัดข้อความยาวที่เป็นภาษาไทย (ข้อความยาวที่ไม่มีภาษาไทยยังถูกซ่อนเหมือนเดิม)
- `seed-gacp.js` ผูก APP-68-002 กับผู้ถือส่วนบุคคลของผู้ยื่นและกรอกผ่าน `writeHolder` ก่อนขอใบ
- fixture ของเทสต์ที่ออกใบใช้ `test-support/complete-holder.js`

## หลักฐาน
| ไฟล์ | อะไร |
|---|---|
| `red-before-fix.txt` | 2e0c4f11b (ยังไม่แก้): เทสต์ real-Postgres ใหม่ 3 ข้อล้ม · ผู้อนุมัติได้ 200 แทน 422 และออกใบได้ทั้งที่ผู้ถือไม่ครบ |
| `red-web-long-thai-refusal.txt` | ก่อนแก้ api-client: ข้อความ 422 ภาษาไทยยาวกลายเป็น "เกิดข้อผิดพลาดภายในระบบ (HTTP 422)" |
| `green-after-fix.txt` | 0f138453c: backend 78 ชุดที่รัน (ข้าม 1) 1824 ผ่าน 3 ล้ม · 3 ข้อที่ล้มล้มบน main ee5be3508 ด้วย (`DECISION_STATE_NOT_FORCEABLE` ใน onsite-decision-mint-e2e 2 ข้อ, status-writer-audit-default-invariant F3 1 ข้อ) |
| `green-web.txt` | web: api-client ทั้งโฟลเดอร์และหน้าตัดสินของผู้อนุมัติ 149 ผ่าน · tsc ผ่าน · eslint ไม่มี error |
| `mutation-check-removed.txt` | ลบการเรียก `assertHolderComplete(app)` แล้วเทสต์ใหม่ล้มครบ 3 ข้อ และเทสต์ wiring ข้อปฏิเสธล้ม |
| `seed-after-fix.txt` | seed-plants + seed-gacp บนฐานข้อมูลเปล่า: seed exit 0 ใบของ APP-68-002 ผู้ถือ `INDIVIDUAL` |
| `walk/before-run.txt`, `screenshots/before-0*.png` | main ee5be3508 ในเบราว์เซอร์: ผู้อนุมัติกดอนุมัติ ได้ 200 ใบเลขที่ 1/2569 · DB `CERTIFIED certificates=1` ผู้ถือ JURISTIC ที่ไม่มีเลขทะเบียนและผู้ลงนาม |
| `walk/after-run.txt`, `screenshots/after-0*.png` | 0f138453c: ได้ 422 หน้าต่างยืนยันแสดงรายการ 8 ช่องที่ขาด · DB `AUDIT_PASSED certificates=0 farms=0` |
| gate | `gate-locked.sh 0f138453c` แล้ว `compare.sh`: 1208 ชุด 15859 ผ่าน 7 ล้ม ใน 3 ชุด (a0-pr2-per-hop-invariant, onsite-decision-mint-e2e, status-writer-audit-default-invariant) · ไม่มีความล้มเหลวใหม่เทียบ gate ของ main 110d5ed96 · gitleaks ใหม่ 56 รายการอยู่ใน evidence ของสาขาอื่น (launch-guards-1, payment-trial-marking, renewal-keeps-farm) ไม่มีจากสาขานี้ |

walk ทั้งสองขาใช้ next dev + backend จากต้นไม้ที่ระบุ บน Postgres ทิ้งได้ `issueholder-db` และ key ลงนามชั่วคราวใน /tmp ไม่แตะ staging, demo หรือ `apps/backend/keys`

## รันซ้ำ (ใต้ `~/work/state/heavy.sh`)
- เทสต์: `evidence/issuance-holder-complete/run-suites.sh <log> <test paths...>`
- seed: `evidence/issuance-holder-complete/seed-run.sh <log>`
- walk: `LABEL=after evidence/issuance-holder-complete/walk/run.sh` · ขา before เพิ่ม `TREE=<checkout ของ main>`

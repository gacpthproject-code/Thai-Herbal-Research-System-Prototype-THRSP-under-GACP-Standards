# ผลของการเพิกถอน/ระงับ/หมดอายุใบรับรองต่อ planting cycles, ล็อต, QR และ trace สาธารณะ — design

- ledger: F-G4-56 · วันที่ 2026-08-28 · operator ยืนยันตามคำแนะนำ 2026-08-28
- ฐานหลักฐาน: `reports/research/2026-08-28-f-g4-56/facts.md` (อ่านโค้ด + ทะเบียนจริง + sweep ISO 17065 ทั้ง repo)
- spec แม่ที่ผูกพัน: `docs/superpowers/specs/2026-08-20-planting-tnt-design.md` — R2 `:17`, R3 `:18`, กฎ revocation `:52`, หน้า trace `:76`, วันตัดเก็บเกี่ยว `:144` · งานนี้คือ **ทำให้ตรง spec** ไม่ใช่นโยบายใหม่ ยกเว้นข้อ 3.6 (notification) ซึ่ง operator รับรองเพิ่ม
- Tier: **C** (T&T + certificate lifecycle)

## 1. หลักการ

**สถานะ "อยู่ภายใต้การรับรอง" คำนวณสดจากใบรับรอง ณ เวลาที่ถาม ทุกจุด** — ไม่มี flag บน cycle/lot/QR ที่ต้องไปตั้งตอน revoke และไม่มีทางเลือกรายใบสำหรับ admin · การ revoke/suspend/expire จึงมีผลทันทีและย้อนกลับได้ (reinstate จาก suspended = กลับมาเอง) · ใบ `renewed` = ใบเก่าไม่ active; cycle ที่ผูกใบเก่าต้องถูกผูกไปใบใหม่ (ดู 3.5)

นิยามเดียว: `certificateCoverage(certificate)` → `{ covered: boolean, reason: null|'revoked'|'suspended'|'expired'|'renewed'|'missing', certificateNumber, successorCertificateNumber? }` ใน `services/trace-service/common.js` (ขยาย `evaluateCertGate` ที่มีอยู่ `:242-274`) และให้ทุกผู้ใช้ด้านล่างเรียกตัวนี้

## 2. สถานะปัจจุบันที่เบี่ยงจาก spec (`facts.md`)

| spec | โค้ด |
|---|---|
| `:52` cycle เดิมบันทึกต่อได้ cycle ใหม่ห้าม | `planting-service.js:137-183` กรอง cycle ใต้ใบไม่ active ออกจากรายการ (หายไป) แต่ `assertNoOpenCycle` `:71-121` ไม่ดูใบ → แปลงถูกล็อกด้วย cycle ที่มองไม่เห็น; `harvest-capacity-operations.js:56-57` ปฏิเสธการปิด · guard `hasActiveCertificate`/`requireActiveCert` (`planting-cycle-service.js:274-281,323-331`) ไม่มีผู้เรียก |
| `:76` trace แสดงสถานะจริง + ลิงก์ verify | `resolve-plot-cycle.js` ไม่ถามใบ, `:640` hardcode `verification:{valid:true}`; FE `trace/plot-cycle/[qr-code]/client-view.tsx:295-298` โล่เขียว "แหล่งปลูกได้รับการรับรอง GACP" ไม่มีเงื่อนไข; lot/batch gate 410 แต่ `trace-fetch.ts:62-63` map เป็น `not-found` → "ไม่พบข้อมูลผลิตภัณฑ์"; `reason:'certificate_revoked'` ส่งแล้วไม่มีใครอ่าน |
| `:144` ตัดเก็บเกี่ยวต้องมีใบ active ณ วันตัด | ไม่มี |
| ป้าย QR แปลง | `plot-qr-permission.ts:34-38`, `plot-signs/*` ไม่ตรวจใบ |
| revoke | แตะแถวใบ + audit เท่านั้น (`certificate-service.js:1672-1761`) ไม่แจ้งใคร |

ทะเบียน: CAE820 (revoked 2026-08-27) ยังมี 2 cycles (PLANTED, HARVESTED), 1 batch PACKED, 1 lot PACKAGED, QR seal 4 อัน ACTIVE, `plant_units` 500 แถว; ฟาร์มเดียวกันถือใบ E5960D ที่ active

## 3. การออกแบบ

### 3.1 เกษตรกร: มองเห็นเสมอ บันทึกต่อได้ สร้างใหม่ไม่ได้
- รายการ cycle (`planting-service.js:137-183`): เลิกกรองด้วยใบ; ทุก cycle คืนพร้อม `coverage` จาก `certificateCoverage` · FE (`app/health/planting/**`) แสดงป้าย "ไม่อยู่ภายใต้การรับรอง (ใบรับรองถูกเพิกถอน/ระงับ/หมดอายุ)" + ลิงก์ verify บน cycle ที่ `covered:false`
- บันทึกกิจกรรมใน cycle เดิม (ใส่ปุ๋ย/รดน้ำ/observation) ยังทำได้ · **สร้าง cycle ใหม่** ต้อง `covered:true` ของใบที่ระบุ — `createCycle` เรียก `requireActiveCert` ที่มีอยู่ (ทำให้มีผู้เรียกจริง) → `CERTIFICATE_NOT_COVERING` (409, ข้อความไทย: สาเหตุ + ขั้นต่อไป)
- `assertNoOpenCycle` คงเดิม (แปลงมี cycle เปิดจริง) แต่ข้อความ 409 ต้องชี้ cycle ที่มองเห็นได้แล้ว และ cycle ใต้ใบไม่ active ปิดได้ด้วยการ **ยกเลิก cycle** (สถานะ `CANCELLED_UNCOVERED`, ต้องมีเหตุผล) — ทางออกในแอปที่วันนี้ไม่มี
- ตัดเก็บเกี่ยว/สร้าง batch/lot/QR ใหม่: ต้อง `covered:true` **ณ วันตัด** (spec `:144`) → ปฏิเสธด้วย `CERTIFICATE_NOT_COVERING` · ล็อต/QR ที่มีอยู่แล้วไม่ถูกลบ (หลักฐานทาง T&T คงอยู่)

### 3.2 trace สาธารณะ: ทุกระดับ gate เดียวกัน พูดความจริง
- `resolve-plot-cycle.js`: ใช้ `evaluateCertGate` เหมือน generic/lot/batch; ลบ `verification:{valid:true}` hardcode; ตอบ 410 พร้อม `reason` เหมือนราง lot
- API 410 body: `{ code:'CERTIFICATE_NOT_COVERING', reason, certificateNumber, verifyUrl, successorCertificateNumber? }` (ไม่เปิดเผยข้อมูลฟาร์ม/แปลง/lot)
- FE `trace-fetch.ts`: 410 → สถานะ `uncovered` (ไม่ใช่ `not-found`); หน้า trace ทุกแบบ (generic/lot/batch/plot-cycle) แสดง hero แดง "ใบรับรองของแหล่งปลูกนี้ถูกเพิกถอน/ระงับ/หมดอายุ" + ปุ่ม "ตรวจสอบใบรับรอง" → `/verify/<no>` (+ ลิงก์ฉบับต่ออายุเมื่อ renewed) · โล่เขียวบน plot-cycle แสดงเฉพาะ `covered:true`
- copy ต่อ reason: revoked "ถูกเพิกถอน", suspended "ถูกระงับชั่วคราว", expired "หมดอายุ", renewed "ถูกแทนที่ด้วยฉบับต่ออายุ ดูฉบับปัจจุบัน", missing "ไม่พบใบรับรองที่ผูกกับแหล่งปลูกนี้"

### 3.3 ป้าย QR แปลง
- `plot-qr-permission.ts` + `plot-signs/*`: พิมพ์/สร้างได้เฉพาะ `covered:true`; ป้ายที่พิมพ์แล้วยังสแกนได้แต่ trace ตอบตาม 3.2

### 3.4 revoke/suspend/reinstate/expire — ผลข้างเคียงที่ต้องมี
- `revokeCertificate`/`suspendCertificate`: ไม่แตะ cycle/lot/QR (คำนวณสด) · เขียน `audit_logs` เดิม + **notification in-app ถึงผู้ถือใบ** (3.6)
- QR seal (`TraceQrSecurity`) คงสถานะ ACTIVE (การสแกนตอบ 410 ตามใบ) — ไม่ revoke seal เพราะ reinstate ต้องกลับมาได้เอง

### 3.5 ใบที่ถูกแทนที่ (`renewed`)
- cycle ที่ `certificateId` = ใบเก่า และใบเก่ามี `renewedCertificateId` → `certificateCoverage` ตอบ `covered` ตามใบใหม่ (ตามผ่านลิงก์ successor) · ไม่ย้าย FK (ประวัติคงเดิม)

### 3.6 notification (ส่วนเพิ่มที่ operator รับรอง — ISO/IEC 17065 §7.11: ผู้ถือใบต้องหยุดใช้การรับรอง)
- in-app notification ถึงผู้ถือใบเมื่อ revoke/suspend/reinstate: ข้อความไทย + เลขใบ + สิ่งที่ทำได้/ไม่ได้ (บันทึกต่อได้, ห้ามสร้าง cycle/ล็อต/QR ใหม่, ป้ายที่ติดอยู่จะแสดงสถานะจริงเมื่อสแกน) · ผ่าน `createNotification()` เดิม (in-app-only ตามมติ)

## 4. เทสต์และการกดจริง
- RED-first: (1) plot-cycle trace ของ CAE820 ตอบ 200 valid:true (2) FE โล่เขียวไม่มีเงื่อนไข (3) รายการ cycle ของเกษตรกร A ไม่มี cycle ใต้ CAE820 (4) createCycle ผ่านทั้งที่ใบ revoked (5) lot trace 410 → FE "ไม่พบข้อมูล" (6) plot-sign พิมพ์ได้ใต้ใบ revoked
- unit: `certificateCoverage` ทุก reason + successor · route tests ของ trace ทั้ง 4 resolver · planting-service list/create/cancel · plot-sign permission
- กดจริง: **C07** — ผู้ขอ A (ถือ CAE820 revoked + E5960D active): (a) หน้า planting เห็น cycle ใต้ CAE820 พร้อมป้าย (b) กดสร้าง cycle ใหม่ใต้ CAE820 → ถูกปฏิเสธด้วยข้อความไทย (c) สแกน QR แปลงของ CAE820 (`/trace/plot-cycle/<qr>`) → hero แดง + ลิงก์ verify, ไม่มีโล่เขียว (d) lot QR ของ CAE820 → "ถูกเพิกถอน" ไม่ใช่ "ไม่พบ" (e) notification ปรากฏใน in-app inbox ของผู้ถือใบ (จาก C01 revoke ย้อนหลัง: ไม่มี — บันทึกว่าใช้กับ revoke ครั้งถัดไป; สำหรับ C07 ใช้ suspend→reinstate บนใบทดสอบ? **ไม่** — ห้ามแตะใบจริงเพิ่ม; พิสูจน์ notification ด้วย unit + route test เท่านั้น และระบุใน ledger)

## 5. ไม่แก้ในงานนี้
- `plant_units` 500 แถว/cycle (R8 retired, F-G4 backlog เดิม)
- copy "ไม่อยู่ในสถานะใช้งาน" ใน `common.js:268-270` แทนที่ด้วย reason-specific (ทำใน 3.2)
- dead guards/`buildCertificateSnapshot` uppercase bug: ลบเมื่อแตะไฟล์ (ratchet dead-route)

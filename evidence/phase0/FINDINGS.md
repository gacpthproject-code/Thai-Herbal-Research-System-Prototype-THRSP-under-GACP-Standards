# Phase 0 — FINDINGS (จากการกดจริงบน Postgres จริง) — 2026-08-17/18

Stack: web `next dev` :3000 · backend :8000 (Supabase จริง) · Stripe test mode + `stripe listen` · application เส้นหลัก `297088db-bb4a-4c43-ba7b-e81b2a643cde` (farmer `6705873788025`)
ทุก finding ด้านล่างมี **หลักฐานจากการรันจริง** (วิดีโอ/trace/screenshot/page-snapshot + แถว DB + log แบ็กเอนด์) ไม่ใช่การอ่านโค้ดอย่างเดียว

---

## F-CHECKOUT-M2-INVOICE-UNIQUE — 🔴 **BLOCKER · เส้นเงิน · ค่าตรวจงวด 2 จ่ายไม่ได้เลย**

**อาการที่ผู้ใช้เจอ:** เกษตรกรที่ผ่านการอนุมัติเอกสารแล้ว เปิดหน้าชำระเงินงวด 2 → จอขึ้น **"สร้างรายการชำระเงินไม่สำเร็จ — ไม่สามารถสร้างรายการชำระเงินได้ กรุณาลองใหม่ภายหลัง"** และลองกี่ครั้งก็ไม่ผ่าน

**หลักฐาน:** `evidence/phase0/test-output/e2e-phase0-s04-pay-phase2-*/`(video/trace/error-context) · backend log: `POST /api/payments/checkout HTTP/1.1 500` พร้อม
```
Invalid `prisma.invoice.create()` invocation:
Unique constraint failed on the fields: (`applicationId`,`serviceType`)
```

**สาเหตุ (ชนกันระหว่างสองการตัดสินใจที่แต่ละอันดูถูก):**
1. `apps/backend/services/checkout/stripe-checkout-service.js:160-163` — ทุก checkout สร้าง invoice ด้วย **`serviceType: 'CERTIFICATION_CHECKOUT'` คงที่ ไม่มีมิติ milestone**
2. migration `20260701010000_uniq_invoice_app_servicetype` — partial unique index `(applicationId, serviceType)` สำหรับ invoice ที่ยัง active (BUGFIX-5.1 กันใบซ้ำ)

⇒ งวด 1 สร้างคู่ `(app, CERTIFICATION_CHECKOUT)` สำเร็จ · **งวด 2 ของใบเดียวกันชนคีย์เดิมเสมอ** และ try/catch ที่แปลง P2002 เป็น 409 ครอบเฉพาะ `checkoutOrder.create` (`:141-155`) **ไม่ครอบ `invoice.create`** → หลุดเป็น 500 ดิบ

**ขอบเขตความเสียหาย:** ทุกคำขอที่จ่ายงวด 1 ผ่าน Stripe rail จะจ่ายงวด 2 ไม่ได้ ⇒ ไปต่อไม่ได้ทั้งเส้น (นัดลงพื้นที่ต้องรอ AUDIT_FEE_PAID) — **นี่คือจุดที่ Phase 0 หยุด**

**หมายเหตุที่ต้องระวังตอนแก้ (L3 — agent ไม่แตะเงิน เสนอเท่านั้น):** ระบบมี invoice สองตระกูลอยู่พร้อมกัน — คู่ `PHASE_x_STATE_FEE`/`PHASE_x_PLATFORM_FEE` ที่ออกอัตโนมัติตอน DOC_APPROVED (`workflow-side-effects.js:131-183`, s03 ยืนยันว่าเกิดจริง 2 ใบ) กับ `CERTIFICATION_CHECKOUT` ใบเดียวของ checkout ที่คอมเมนต์บอกว่า "replaces the per-phase pair" — การแก้ต้องตัดสินก่อนว่าตระกูลไหนคือของจริง ไม่ใช่แค่เติม milestone ลงคีย์

---

## F-PREVIEW-REVISION-CLOSED — 🔴 **BLOCKER · วงจรแก้ไขเอกสารขาด**

**อาการที่ผู้ใช้เจอ:** ผู้ตรวจส่งคำขอกลับให้แก้ → เกษตรกรแก้ไขได้ → แต่ไปต่อไม่ได้ จอพรีวิวขึ้น **"Application is not in previewable state"** และ **ปุ่ม "ส่งคำขอแก้ไข" ไม่ปรากฏ**

**หลักฐาน:** `evidence/phase0/s03/C07-FINDING-preview-blocks-revision.txt` + `C07-04b-preview-blocked-FINDING.png` · page snapshot ของรอบแรก: `evidence/phase0/test-output/e2e-phase0-s03-resubmit-ap-*/error-context.md` (main region = ข้อความนี้ล้วน) · DB ยืนยันสถานะ `REVISION_REQUESTED`

**สาเหตุ:**
- `apps/backend/routes/api/preview/previewable-statuses.js:19-25` — `PREVIEWABLE_STATUSES` = `{DRAFT, SUBMITTED, PENDING_DOC_FEE, PHASE_1_SLIP_UNDER_REVIEW, DOC_FEE_PAID}` — **ไม่มี `REVISION_REQUESTED` และไม่มี `CAR_PENDING`**
- แต่ `applications.js:186` `EDITABLE_STATUSES` **มี**ทั้งสองค่า (แก้ไขได้)
- และปุ่มยื่นกลับอยู่บนหน้าพรีวิวที่เดียว (`apps/web-app/src/app/health/applications/preview/client-view.tsx:425-450`)

⇒ ประตูกลับไปหาผู้ตรวจถูกปิดที่ชั้น UI · เส้น CAR (`CAR_PENDING`) ตกหลุมเดียวกัน

**ที่รันผ่านได้เพราะอะไร:** spec ปิดท่อด้วย `POST /api/applications/submit` ด้วย bearer ของเกษตรกรเอง (endpoint เดียวกับที่ปุ่มยิง) ตามกติกา mission §V — **API ทำงานถูกต้อง ปัญหาอยู่ที่ทางเข้าฝั่งจอ**

---

## F-REVIEWER-DROPDOWN-EMPTY — 🟠 **จอแจกงานเลือกผู้ตรวจไม่ได้**

**อาการ:** scheduler เปิด `/provider/coordinator` → กด "จ่ายงานตรวจเอกสาร" → **dropdown รายชื่อผู้ตรวจว่างเปล่า ปุ่มยืนยันจึง disabled**

**สาเหตุ:** `apps/backend/routes/api/provider/handlers/scheduler-assign-reviewer-handler.js:267-270` → `provider-user-service.js:236-252` กรอง `role IN ('document_reviewer','auditor')` (ตัวพิมพ์เล็ก) แต่ผู้ใช้จริงในฐานถือค่า legacy ตัวใหญ่ (`REVIEWER_AUDITOR`, `AUDITOR`, …) — `normalizeRole` ถูกใช้เฉพาะฝั่งเขียน ไม่ใช้ฝั่งอ่าน ⇒ ไม่มีแถวไหน match

**สถานะการพิสูจน์:** พบจากการอ่านโค้ด + query DB โดย spec author และ spec เดินทาง API fallback แทน (C05 ผ่านด้วย `assignedVia=api-fallback`) — ดู `evidence/phase0/s02/`

---

## สรุปเส้นทางที่พิสูจน์ได้จริง (ณ รอบนี้)

| ช่วง | ผล |
|---|---|
| C01 สมัคร + draft · C02 ยื่น (2 hop + ใบเสนอราคา) | ✅ ผ่าน (s01 — 2.9 นาที) |
| C03 checkout งวด 1 · C04 จ่ายจริง → SETTLED → DOC_FEE_PAID + journal สมดุล + ใบเสร็จ | ✅ ผ่าน (settlement — 2.1 นาที) |
| C05 แจกงานผู้ตรวจ · C06 ส่งกลับแก้ + เส้นตาย 5 วันทำการ + จอเกษตรกรเห็น | ✅ ผ่าน 3/3 (s02 — 2.4 นาที) · จอแจกงานติด F-REVIEWER-DROPDOWN-EMPTY |
| C07 แก้แล้วยื่นกลับ **ถึงผู้ตรวจคนเดิม** · C08 อนุมัติ → PENDING_AUDIT_FEE + ใบงวด 2 | ✅ ผ่าน (s03 — 3.4 นาที) · ประตูจอปิด = F-PREVIEW-REVISION-CLOSED |
| C09/C10 จ่ายค่าตรวจงวด 2 | 🔴 **หยุดที่นี่** — F-CHECKOUT-M2-INVOICE-UNIQUE |
| C11-C15 นัดลงพื้นที่ → ผลตรวจ → ออกใบ → ผู้ใช้เห็นใบ | ⛔ ยังไม่ได้พิสูจน์ (ถูกบล็อกโดย C09) |

**กฎหยุดงานของ mission §V มีผลแล้ว:** Phase 0 = **FAIL** ที่ C09 — ห้ามเริ่มงานฟีเจอร์ใหม่จนกว่ารอยรั่วเส้นเงินจะถูกซ่อม (การซ่อมเป็นใบงานของ operator: L3 ห้าม agent แก้ path เงิน · Tier C)

---

## F-SUBMIT-ECHO-LIES — 🔴 **CONFIRMED โดยการกดจริง · จอบอกความจริงคนละอย่างกับฐานข้อมูล**

รอยรั่วนี้ auditor เคยชี้จากโค้ด (`applications.js:660-661`) วันนี้ **กดจริงแล้วเห็นกับตา**

**หลักฐานดิบ** (`evidence/phase0/s07-seams/SEAM-C-submit-responses.txt`) — คำขอ `5bcbcb49…` ที่ค้างสถานะ SUBMITTED:
```
attempt 1: status 200 → {"status":"PENDING_DOC_FEE"}, "nextRequiredAction":"PAY_PHASE_1"
attempt 2: status 200 → {"status":"PENDING_DOC_FEE"}, "nextRequiredAction":"PAY_PHASE_1"
DB before: status=SUBMITTED   DB after: status=SUBMITTED
audit rows written since the first call: 0
```
⇒ API ตอบว่า "ไปชำระเงินงวด 1 ได้เลย" **สองครั้ง** ขณะที่คอลัมน์จริงไม่เคยขยับ และ**ไม่มี audit row สักแถว**บันทึกว่าเคยมีการเรียกนี้ · ความจริงบนจอกับความจริงในฐานข้อมูลแยกจากกันโดยไม่มีร่องรอย

## F-REVISION-DOOR-NO-QUOTATION — 🟠 **ยืนยันบางส่วน (ไม่ร้ายเท่าที่กลัว)**

DRAFT ที่ยื่นผ่านประตู `PUT /:id/revision` → จบที่ SUBMITTED · **quotations = 0 แถว** (ยืนยันตามที่อ่านโค้ดไว้)
**แต่** ทางจ่ายเงินไม่ได้ตันเสียทีเดียว: กดปุ่มบนจอ checkout → `POST /payments/checkout` **200** สร้าง checkout order + ใบ `INV-CO-…-M1` + PaymentIntent ได้จริง (`SEAM-A-money-surface.txt`)
⇒ Stripe rail มี invoice ของตัวเอง จึงข้ามช่องว่างของ quotation ได้ · ที่หายไปคือ **ใบเสนอราคาแบบเดิม + จอ "รอชำระ" ที่อิงมัน** (payments screen แสดง `quotation-review-section nodes=0`)
⇒ และนี่คือรากเดียวกับ **F-CHECKOUT-M2-INVOICE-UNIQUE**: ใบที่ checkout ออกใช้ `serviceType` คงที่ ⇒ งวดสองชนคีย์

## SEAM B — ยังไม่ได้รัน
`describe.serial` หยุดหลัง SEAM C ล้ม · คำถาม "ใบเสนอราคาล้มเงียบแล้วใครรู้" ได้คำตอบบางส่วนจาก SEAM A แล้ว: จอชำระเงินของเกษตรกรแสดง 0 รายการโดยไม่มีคำอธิบายใดๆ และไม่พบจอฝั่งเจ้าหน้าที่ที่ list "ยื่นแล้วแต่ไม่มีใบแจ้งหนี้"

---
---

# รอบ 2026-08-19 — เดินซ้ำหลัง fix ขึ้น main (SHA 369a3685) · walk-1 = specimen ค้าง · walk-2 = เดินสด

Stack: laptop `next dev`:3000 + backend `node server.js`:8000 (Supabase จริง) + `stripe listen` — ทั้งหมด detached process
Walk-1 (แอป `f866374a-8f6b-4c7a-b850-bd09491db042`, farmer `เฟสศูนย์ พิสูจน์ท่อ`): C01→C10 ✅ · C11 ✅ (หลัง fix dropdown) · C12 ตายซ้อน 3 ชั้น → ชั้นสุดท้ายทำ specimen **ค้างถาวร**
Artifact walk-1 ทั้งหมด: `evidence/phase0/walk1-blocked-specimen/` + `red-1-cold-compile/`

## สิ่งที่พิสูจน์ได้จริงใน walk-1 (ของที่รอบก่อนไปไม่ถึง)

| จุด | ผล | หลักฐาน |
|---|---|---|
| **C09/C10 จ่ายงวด 2 บน Stripe rail** | ✅ mint 200 → SETTLED → AUDIT_FEE_PAID · journal สมดุล 27,675=27,675 · สมการเงินผ่าน · ใบเสร็จแยก 2 นิติบุคคล · webhook PROCESSED · canonical audit ครบ | `walk1-blocked-specimen/s04/` (C10-erp-summary.txt เป็น post-hoc — spec crash ที่ query หลักฐานหลังจ่ายสำเร็จ) |
| **C12-gate: กด PASS โดยไม่มีหลักฐาน onsite → ถูกปฏิเสธ** | ✅ fail-closed จริงบน stack จริง — 500, row ค้าง AUDIT_CONFIRMED, 0 certs (cert-integrity ของ 2026-08-17 ทำงาน) | `walk1-blocked-specimen/s05/C12-gate-premature-pass.txt` + ภาพ |
| C12 upload หลักฐานจริง | ✅ รูป 5/5 มีพิกัด + checklist 24/24 persist ข้าม session | `walk1-blocked-specimen/s05/C12-photos.txt` |

## FINDING ใหม่จากการกดจริง (walk-1)

### F-AUDITOR-DROPDOWN-EMPTY — 🟠 แก้แล้ว (TDD)
น้องของ F-REVIEWER-DROPDOWN-EMPTY ที่ fix `db3e6480` พลาด: `listAuditorsForScheduler()` ยังกรอง SQL ด้วย role canonical ตัวเล็ก · seed auditor จริงถือ `AUDITOR` → modal นัดตรวจว่างเปล่า
Fix: mirror pattern เดิม (อ่าน roster → กรอง `normalizeRole()` SSOT) · RED จอจริง + RED unit 3 ข้อ → GREEN 12/12 · `walk1-blocked-specimen/s05/FIX-auditor-dropdown/`

### F-ONSITE-STARTEDAT-LIES — 🔴 แก้แล้ว (TDD) · เดิมทำให้การตรวจภาคสนามจบไม่ได้เลยผ่าน UI
`GET /context` รายงาน `startedAt = AuditChecklist.createdAt` — แถวนั้นเกิดตอน **scheduler assign** ไม่ใช่ตอนผู้ตรวจเริ่มตรวจ → field app (`setStage(startedAt ? 'checklist' : 'start')`) ข้ามหน้า GPS check-in เสมอ → ไม่มีพิกัดใน state → **รูปหลักฐานโดน 500 ทุกใบ** (`uploadPhoto: gpsLat + gpsLng required` — walk1 s05/C12-photos.txt ฉบับ 01:30) → gate ≥5 รูป ไม่มีวันผ่าน
Fix: `_resolveStartedAt()` อ่าน marker จริง (`GpsVerificationLog AUDIT_INSPECTION_START` — สิ่งเดียวที่ `startInspection` เขียน) · null เมื่อยังไม่กด/model ยังไม่ provision · rewrite pin เดิมใน `audit-onsite-routes.test.js` ที่ล็อกพฤติกรรมผิด → RED 2 → GREEN 21/21
หมายเหตุ: model `GpsVerificationLog` ยังไม่มีจริงใน schema (pilot-descope guard) ⇒ ปัจจุบัน check-in สำเร็จแต่ไม่ persist marker → reload กลับหน้า start (ซื่อสัตย์ · UX รอ ticket schema)

### F-PERMISSIONS-POLICY-KILLS-FIELD-GPS — 🔴 แก้แล้ว (TDD) · security header ฆ่าเครื่องมือภาคสนามของตัวเอง
`middleware.ts:71` ตั้ง `Permissions-Policy: geolocation=()` ทุก route → browser ปิด Geolocation API ระดับ document ("Geolocation has been disabled in this document by permissions policy" — จอจริง error-context walk1) → check-in อ่านพิกัดไม่ได้แม้อุปกรณ์อนุญาต · fallback พิกัดฟาร์ม (DM-4) ก็ใช้ไม่ได้เมื่อใบสมัครไม่มีพิกัด
Fix: `geolocation=(self)` (first-party เท่านั้น — iframe ภายนอกยัง deny · camera/mic ยัง deny) · rewrite pin ใน `security-headers-middleware.test.ts` → RED 1 → GREEN 14/14 · ยืนยัน header สดบน :3000

### F-PLOT-AREAUNIT-DEADEND — 🔴 บันทึก **ไม่แก้แอป** (product decision) · specimen ค้างถาวรเป็นหลักฐาน
เส้นทางรับใบสมัคร (prepare→submit validator→review→จ่าย 2 งวด→approve→audit) **ไม่มีชั้นไหนบังคับ `areaUnit` ของ plot** แต่ certificate generator ใช้ strict reader ปฏิเสธ plot ไม่มี unit (ถูกหลัก — ไร่/ตร.ม. กำกวม ×1,600) → `CERT_AUTO_GEN_FAILED` ที่ hop สุดท้าย · tx rollback · **แอปที่จ่ายครบ+ตรวจครบค้างที่ AUDIT_CONFIRMED และไม่มีประตูซ่อม** (`/prepare` ที่สถานะ non-editable → 409 ถูกต้อง · script `migrate-area-to-sqm.js` แก้เฉพาะแถว table ไม่แตะ formData)
Specimen: `f866374a-8f6b-4c7a-b850-bd09491db042` — จ่ายจริง 5,535+27,675 บาท (test mode) ตรวจครบ ใบไม่ออก
ที่มาของข้อมูลไม่มี unit: payload "Option 1" ของ s01 spec เอง (wizard จริงตั้ง `areaUnit:'Sqm'` เสมอ — farm-info-step.tsx:252) — **spec แก้แล้ว** แต่หลุมนี้รอ row จาก API/legacy ตัวจริงอยู่ · ทางแก้เชิงระบบต้องเลือก: บังคับที่ validator ต้นทาง หรือมีประตูซ่อม — ใบงาน operator
ข้อสังเกตพ่วง: farm (`totalAreaSize:'5'` ไม่มี unit) ผ่าน strict reader ได้ ("Farm created for cert") แต่ plot ไม่ผ่าน — ความเข้มไม่สม่ำเสมอในตัว generator เอง

### F-AUDIT-META-DOUBLE-ENCODED — 🟡 บันทึก
`audit_logs.metadata` (jsonb) เก็บ JSON **string ซ้อน** (`"{\"fromStatus\":...}"`) ไม่ใช่ object — query LIKE ต้อง match ผ่าน escape (`\"toStatus\"...`) · casing ของ actorRole ปนกัน (SYSTEM/system/HEALTH/health/document_reviewer) · จับได้เพราะ s04:254 (jsonb LIKE → 42883 แล้วแก้ cast ก็ยัง match ไม่เจอจน trace encoding)

### F-LOGIN-NAV-COLD-COMPILE — 🟡 dev-topology + UX fragility
login สำเร็จ (200+cookie) แต่ `router.replace('/health/dashboard')` แพ้ race ตอน route ต้อง compile 4.1s → ผู้ใช้ค้างหน้า login เงียบๆ ทั้งที่ session valid · warm route แล้วหาย · prod build ไม่มี per-route compile แต่ network ช้า = ความเสี่ยงเดียวกัน · `red-1-cold-compile/`

## แก้ harness/spec (Tier A ในตัวเอง)
- s04: `metadata::text LIKE '%toStatus%...%'` (jsonb + double-encoding)
- s05: probe สองประตู (start screen | checklist) + reload แล้วกดเริ่มตรวจซ้ำ (สอดคล้อง startedAt=null ที่ซื่อสัตย์)
- s07 SEAM C: รอ spinner "กำลังโหลดข้อมูลพรีวิว" ก่อนถ่าย/probe (เดิม probe ก่อน render → แดงปลอม)
- s01: plot payload เพิ่ม `areaUnit:'Sqm'`
- s05b resume driver (one-off, ลบแล้ว — source: walk1-blocked-specimen/s05/C12-resume-driver-source.txt): พิสูจน์ checklist 24/24 persist ข้าม session + จับ CERT_AUTO_GEN_FAILED

## Walk-2 (แอป `10e13c50-949d-461d-8a1a-e43673b5e5c0`, ใบรับรอง `GACP-TH-2569-E0DF5B`) — เส้นจบจริง C01→C15

| ช่วง | ผล |
|---|---|
| C01-C02 สมัคร+ยื่น (s01, payload เติม areaUnit แล้ว) | ✅ 3.4 นาที |
| C03-C04 จ่ายงวด 1 → SETTLED → DOC_FEE_PAID | ✅ 1.7 นาที |
| C05-C06 แจกงาน + ส่งกลับแก้ | ✅ 3.5 นาที |
| C07-C08 ยื่นกลับ (reviewer เดิม) + อนุมัติ → PENDING_AUDIT_FEE | ✅ 5.2 นาที |
| **C09-C10 จ่ายงวด 2 → SETTLED → AUDIT_FEE_PAID + ERP ครบ** | ✅ **3.4 นาที — เขียวเต็ม segment ในรันเดียว** |
| C11 นัดลงพื้นที่ → AUDIT_CONFIRMED | ✅ 1.8 นาที |
| C12 gate fail-closed + GPS check-in + รูป 5/5 + checklist 24/24 → AUDIT_PASSED + cert mint | ✅ (จบด้วย resume driver หลัง fix F-TX-DEFAULT-5S — บันทึกใน s05/C12-summary.txt) |
| C13 อนุมัติขั้นสุดท้าย → APPROVED | ✅ ผ่าน UI (จับ F-FINAL-APPROVAL-NO-AUDIT — ดูล่าง) |
| C14 → CERTIFIED **ผ่านประตู UI จริง** (work inbox → "ออกใบรับรองแล้ว" → ปิดงาน+เลื่อน 200) | ✅ — **F-UI-CERT ของ plan เก่าตกไป: ประตูมีจริงและใช้ได้** + canonical row ครบ |
| C15 การ์ด/รายละเอียด/PDF (ปุ่ม UI + bytes 452,643 %PDF) + /verify "ผ่าน" + SSR page + deep link | ✅ 46 วินาที เขียวทั้ง run |
| s07 seams A/C/B (fixture ตัวเอง) | ✅ 3/3 |

## FINDING เพิ่มจากช่วงท้ายเส้น (พบเพราะไปถึงเป็นครั้งแรก)

### F-TX-DEFAULT-5S — 🔴 แก้แล้ว (เชิงระบบ, TDD)
Prisma default interactive-tx 5s ล้มจริง **3 hop คนละจุด** บน Supabase latency: settle (แก้ไว้ก่อนแล้ว per-call), onsite decision + cert mint (P2028 — 6.6s), work-inbox APPROVED→CERTIFIED ("Transaction not found") — ทุก hop shape เดียวกัน: status write + canonical audit + side-effects
Fix สองชั้น: (1) decision tx ใส่ explicit `ONSITE_AUDIT.DECISION_TX_TIMEOUT_MS=30s` (business-rules idiom เดียวกับ SETTLEMENT + unit pin RED→GREEN 42/42) (2) `transactionOptions {30s/10s}` ที่ shared PrismaClient (prisma-database.js — per-call override ยังทำงาน) — พิสูจน์สดโดย C12 decision 200 + C14 work-advance 200

### F-FINAL-APPROVAL-NO-AUDIT — 🔴 แก้แล้ว (TDD) · hop เดินได้โดยไม่ทิ้งร่องรอย
`POST /applications/:id/final-approvals` (และ sibling `reject-to-auditor`) อัปเดตแถวตรงใน tx ตัวเอง **ไม่ผ่าน writeApplicationStatus** ⇒ AUDIT_PASSED→APPROVED commit โดย **ไม่มี canonical APPLICATION_STATUS_TRANSITION row เลย** — spec C13 ดักไว้ตรงจุด (11→11)
Fix: เขียน canonical row ผ่าน `statusTransitionAuditHook` ใน tx เดียวกัน ทั้งสอง route (pattern เดียวกับ submitDecision) · RED (route 200 แต่ไม่มี row) → GREEN 90/90 + neighbor suites 91/91 · พิสูจน์สด: C13 รอบ resume canonical 11→12

### F-VERIFY-PORTAL-SHAPE-MISMATCH — 🔴 แก้แล้ว (TDD) · จอ trust สาธารณะบอกใบ valid ว่า "ไม่ผ่าน"
API ตอบ `{valid:true, trustStatus:ACTIVE, data:{...}}` แต่ portal cast `response.data` (inner ที่ api-client unwrap แล้ว) เป็น envelope เต็ม → `valid`/`data.*` = undefined → จอขึ้น **"ผลการตรวจสอบ: ไม่ผ่าน"** + ทุกช่องเป็นขีด ทั้งที่ api-client เก็บ sibling ไว้ให้ใน `.meta` อยู่แล้ว (api-client.ts:449-454)
Fix: rebuild envelope จาก `meta`+`data` ใน handleVerify · RED (functional: ขับฟอร์มจริงด้วย shape ที่ walk เจอ) → GREEN 6/6 · จอจริงหลังแก้: "ผ่าน" + เลข + วันที่ (C15-06-public-verify-result.png)
หมายเหตุ: handler ข้างเคียง (signature verify :183-185, trace :214-216) ใช้ cast แบบเดียวกัน — ยังไม่ได้กด ยังไม่แก้ (ตระกูลเดียวกัน — ใบงานถัดไป)

### F-PDF-COLD-START-TIMEOUT — 🟡 บันทึก ไม่แก้
PDF ใบแรกหลัง backend restart: puppeteer launch + setContent เกิน 30s ของ puppeteer เอง → ปุ่มดาวน์โหลดของเกษตรกร error หนึ่งครั้ง กดซ้ำสำเร็จ (โชว์ครบใน C15 attempt 2-4: 503 → bytes 452,643 สำเร็จ) · ควรมี warm-up ตอน boot หรือ retry ใน route — ใบงานแยก

### สิ่งแวดล้อม (ไม่ใช่บั๊กแอป — บันทึกเพื่อรอบหน้า)
- background tasks ของ harness ถูก stop จากภายนอก 2 ระลอก (operator ยืนยันไม่ใช่คน stop) — แก้โดยย้าย stack + chain เป็น detached process (Start-Process) ทั้งหมด
- kill-wave ทำ jest-worker ของ next dev ตายทั้ง pool → ทุก API route 500 ทั้งที่หน้า page ยัง 200 (อาการหลอกว่า login พัง)
- `next dev` self-restart เมื่อชน memory threshold (3 ครั้ง แม้ heap 3GB) → route cache หาย → cold-compile race กลับมา — ต้อง warm route ก่อนทุกรอบเดิน
- backend crash 1 ครั้งจากการที่ orchestrator ลบ puppeteer profile dir ใต้ process ที่มีชีวิต (บทเรียน: restart ก่อน ค่อยเก็บกวาด)

## สรุป verdict รอบ 2026-08-19
**ท่อหลัก C01→C15 เดินจริงจบจริงบน Postgres จริงแล้ว** — เงื่อนไข "C09 ต้องผ่าน → นัดลงพื้นที่ → ออกใบรับรอง จนจบเส้น" สำเร็จ พร้อม 7 FINDINGS (5 แก้แล้วแบบ TDD ครบ RED→GREEN, 2 บันทึกเป็นใบงาน) + specimen walk-1 ค้างเป็นหลักฐาน F-PLOT-AREAUNIT-DEADEND · view-pack: `WALKTHROUGH.html`

## Update 2026-08-19 08:53 — start-marker มีชีวิตจริงบน Supabase (ปิดหาง F-ONSITE-STARTEDAT-LIES)

Schema `GpsVerificationLog` + RLS migration (main `6205827e`, Tier C operator-merged) ผ่าน 3 ขั้นตามสั่ง:
1. `migrate deploy` applied `20260819000000_add_gps_verification_log` + `prisma generate` — client model LIVE
2. probe: ตาราง `gps_verification_logs` มีจริง · `relrowsecurity=true` · policy `gps_verification_logs_observe_tenant` · suites 65/65
3. **กดจริง** (specimen walk-1, audit `bf24275a`): เปิดครั้งแรก = หน้า start (marker 0) → เริ่มตรวจ → POST /start 200 → marker 0→1 พร้อมพิกัด (18.7883, 98.9853) + organizationId → **reload → ไม่เด้งกลับหน้า check-in** — resume ที่ checklist พร้อมคำตอบ 24 ข้อเดิม
Evidence: `evidence/phase0/marker-live-2026-08-19/` (screenshots + video + marker rows + verdict + press-driver source)

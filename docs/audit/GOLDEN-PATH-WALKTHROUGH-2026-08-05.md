# GOLDEN PATH — LIVE WALKTHROUGH HARNESS (2026-08-05)
> แผ่นเดิน staging จริงทีละ hop · operator เดิน + แคป · auditor เทียบ
> **กติกาเหล็ก: 2 คอลัมน์แยกเด็ดขาด —**
> **"โครงสร้างมี" (จากโค้ด, file:line) ≠ "เดินได้จริง" (จาก walkthrough ของท่าน)**
> ห้ามรวมสองอันเป็น DONE เดียว · hop ที่ค้าง/error = gap จริง ไม่ใช่ทฤษฎี

---

## วิธีใช้แผ่นนี้
1. เข้า staging: `https://staging.gacpth.com` → login ด้วยบัญชีเกษตรกร (Health portal)
2. เดินตาม hop ตามลำดับ · แต่ละ hop **แคปหน้าจอ 1 รูป** (ตั้งชื่อ `hop-<id>.png`)
3. ในช่อง **"เดินได้จริง"** ติ๊ก 4 ข้อ + เขียนสิ่งที่เห็นจริง:
   - **(1) รับ input?** หน้าโหลด + กรอก/กดได้จริงไหม
   - **(2) เขียน DB จริง?** refresh แล้วข้อมูลยังอยู่ไหม (draft ค้าง / คำขอโผล่)
   - **(3) สถานะขยับถูก?** badge/สถานะเปลี่ยนตรงที่คาดไหม
   - **(4) hop ถัดไปเห็นข้อมูล?** จอถัดไป/แดชบอร์ด/บทบาทถัดไปเห็นคำขอนี้ไหม
4. ช่อง **"โครงสร้างมี"** ผมเติมจากโค้ดให้แล้ว (มี file:line) + ธง **⚠️ ที่คาดว่าจะตัน** — ถ้าท่านเจอตรงตามธง = ยืนยัน gap; ถ้าเดินผ่านได้ = โค้ดดีกว่าที่ audit คาด (บันทึกไว้ด้วย)

> **อ่านก่อนเดิน — จุดที่จะตันแน่ (จากโค้ด):**
> **GP-3 (ชำระเงิน) จะไม่มี PromptPay QR โผล่** — FE confirm step ยังไม่สร้าง, `@stripe/stripe-js` ไม่มีใน `apps/web-app/package.json` (GAP-MAP.md §0 + row GP-3). ท่านจะเดินถึง "รอชำระเงิน" แล้วตัน เว้นแต่ backend ตั้ง `PAYMENT_ADAPTER=mock`. **นี่คือ gap เงินอันดับ 1 ที่ต้องยืนยันด้วยตา.**
> **แทบทุก hop: การแจ้งเตือนเป็น in-app row เท่านั้น** (ไม่มี email/SMS จริงบน path — GAP-MAP §78) → ถ้าไม่ได้อีเมล = คาดไว้แล้ว ไม่ใช่ของเสียใหม่

---

# ส่วน A — WIZARD ยื่นคำขอ (9 step, กทล.1 order)
เข้า `/health/applications/new` · step 1-7 = draft (autosave), step 8 = **SUBMIT (ขยับสถานะจริง)**

| step | หน้า (key) | ท่านทำอะไร | โครงสร้างมี (โค้ด) | เดินได้จริง (ท่านกรอก) |
|---|---|---|---|---|
| 1 | **ยินยอมและประเภทคำขอ** (`consent`) | ติ๊ก PDPA + เลือกประเภทคำขอ | consent checkbox บังคับก่อน submit (`application-flow-config.ts` step consent; COMP-006) · เขียน `consentedPDPA` | ( ) รับ input ( ) draft เขียน · แคป `hop-a1.png` · เห็นจริง: ______ |
| 2 | **ข้อมูลพืชและสายพันธุ์** (`plant_selection`) | เลือกพืช/สายพันธุ์ | draft autosave (`use-auto-save.ts`) | ( ) รับ input ( ) draft ค้างหลัง refresh · `hop-a2.png` · ______ |
| 3 | **ข้อมูลผู้ยื่นคำขอ** (`general`) | กรอกชื่อ/ที่อยู่/ติดต่อ | draft autosave | ( ) รับ ( ) ค้าง · `hop-a3.png` · ______ |
| 4 | **สถานที่ปลูกและแปลง** (`farm_info`) | เพิ่มแปลง/พิกัด | draft autosave · ผูกกับ farm/plot | ( ) รับ ( ) ค้าง · `hop-a4.png` · ______ |
| 5 | **การเพาะปลูก** (`production_info`) | ข้อมูลเพาะปลูก | draft autosave | ( ) รับ ( ) ค้าง · `hop-a5.png` · ______ |
| 6 | **เก็บเกี่ยวและคุณภาพ** (`quality_control`) | ข้อมูลเก็บเกี่ยว/คุณภาพ | draft autosave | ( ) รับ ( ) ค้าง · `hop-a6.png` · ______ |
| 7 | **หลักฐานประกอบคำขอ** (`documents`) | **อัปโหลดเอกสาร** | เขียนไฟล์ local disk (`applications.js:261`) · ⚠️ **ไม่มี audit row ตอน upload/delete** (PDPA-relevant) — GAP-MAP GP-1d | ( ) อัปโหลดได้ ( ) **โหลดกลับ/preview เห็นไหม** · `hop-a7.png` · ______ |
| 8 | **ตรวจทานและส่ง** (`review`) → **SUBMIT** | กด "ส่งคำขอ" | **status → `PENDING_DOC_FEE`** (`applications.js:500`) · ⚠️ **ไม่มี canonical audit row** — `onAudit` ถูกละ (`applications.js:652,682`) · ⚠️ comment อ้างส่ง email/SMS แต่จริงเป็น in-app row (`:759-762`) | ( ) submit สำเร็จ ( ) **สถานะ = รอชำระค่าตรวจเอกสาร?** · `hop-a8.png` · ______ |
| 9 | **ใบเสนอราคา/ใบแจ้งหนี้** (`invoice`) | ดูใบแจ้งหนี้ที่ออก | ดู GP-2 ล่าง | (ดู GP-2) |

**เช็คหลัง submit (สำคัญ):** กลับไปแดชบอร์ด `/health/applications` — **คำขอโผล่เป็นรายการไหม + สถานะ = "รอชำระค่าธรรมเนียมเอกสาร"?**
→ ( ) โผล่ ( ) สถานะถูก · แคป `hop-dashboard.png` · เห็นจริง: __________

---

# ส่วน B — GOLDEN PATH หลัง submit (GP-2 → GP-10)
แต่ละ hop: **โครงสร้างมี** = พฤติกรรมจากโค้ด + ⚠️ gap ที่รู้แล้ว · **เดินได้จริง** = ท่านยืนยัน 4 ข้อ

### GP-2 · ออกใบแจ้งหนี้ #1 (ค่าตรวจเอกสาร)
- **โครงสร้างมี:** invoice ออกแบบ **applicant-trigger (กดรับใบเสนอราคา)** ไม่ใช่ระบบ mint อัตโนมัติบน live path (`quotations.js:305-332`; ตัว system-mint จริงอยู่ใน `/api/wizard` ที่ flag ปิด `wizard-controller.js:406`) · ⚠️ ไม่มี audit row · ⚠️ "invoice" มี 2 คอนเซ็ปต์ (Invoice rows กับ `phase1InvoiceId`)
- **เดินได้จริง:** ( ) เห็นใบแจ้งหนี้ + ยอด ( ) ยอดถูก ( ) กด "ชำระเงิน" ไปต่อได้ · `hop-gp2.png` · ______

### GP-3 · ชำระเงิน PromptPay QR — ⚠️ **คาดว่าตัน**
- **โครงสร้างมี:** ❌ **ไม่มี QR render** — checkout หยุดที่ breakdown + "รอชำระเงิน" (`checkout/client-view.tsx:182-244`); `clientSecret` ประกาศแต่ไม่ถูกใช้; ไม่มี `@stripe/stripe-js` · ⚠️ ไม่มี rate limiter บน `POST /api/payments/checkout` (`server.js:301-304`)
- **เดินได้จริง (จุดตัดสิน):** ( ) **มี QR ให้สแกนจริงไหม?** ( ) จ่ายได้จริงไหม · `hop-gp3.png` · ตันตรงไหน: __________
  → ถ้าไม่มี QR = **ยืนยัน gap เงิน #1** (ต้องสร้าง FE confirm step / C1 Payment Wave 3-4)

### GP-4 · webhook ยืนยันชำระ → `DOC_FEE_PAID`
- **โครงสร้างมี:** ✅ backend จริง + atomic, money-conservation ผ่าน · ❌ **ศูนย์ notification** (เกษตรกรไม่ได้ "ชำระสำเร็จ", Account ไม่รู้เงินเข้า — `email-service.js:215` dead) · ❌ **ไม่มี audit row บน hop เงินสำคัญ** (`checkout-settlement-service.js:216-228`) · ⚠️ KPI ฝั่ง Account มองไม่เห็น CheckoutOrder (`accounting-service.js:260-277`)
- **เดินได้จริง:** ( ) สถานะขยับเป็น "ชำระค่าเอกสารแล้ว" ( ) มีแจ้งเตือนไหม ( ) เจ้าหน้าที่ Account เห็นเงินเข้าไหม · `hop-gp4.png` · ______

### GP-5a · มอบหมายรีวิว → `DOC_APPROVED`
- **โครงสร้างมี:** ✅ สถานะเดิน (`DOC_FEE_PAID→ASSIGNED_FOR_REVIEW→DOC_APPROVED`) · ⚠️ **assign เลี่ยง status writer** (plain `prisma.update` `application-provider-query-methods.js:164-178`) → ไม่มี WorkActivity/audit · ⚠️ ไม่มี SLA ตอนคำขอค้างไม่ถูก assign
- **เดินได้จริง (บทบาท reviewer):** ( ) reviewer เห็นคำขอในคิว ( ) กดอนุมัติเอกสารได้ ( ) สถานะขยับ · `hop-gp5a.png` · ______

### GP-5b · ขอแก้ไข (correction 5 วันทำการ) — โซน M4
- **โครงสร้างมี:** ✅ loop ไม่จำกัดรอบ; SSOT 5 วัน (`config/business-rules.js:121`) · ✅ **M4 (เพิ่งทำ): เลยกำหนด → auto-close `EXPIRED` + `closedReason` + audit** (PR #789) · ⚠️ sticky-return ไม่ sticky (`application-review-revision-methods.js:156-160`); reminder อยู่หลัง external cron (`/api/cron/auto-cancel` ต้อง `CRON_SECRET`)
- **เดินได้จริง:** ( ) reviewer ขอแก้ได้ ( ) เกษตรกรเห็น "ต้องแก้ไข" + เดดไลน์ ( ) แก้แล้วส่งกลับได้ · `hop-gp5b.png` · ______

### GP-6 · ใบแจ้งหนี้ #2 (ค่าตรวจประเมิน) + ชำระรอบ 2
- **โครงสร้างมี:** ✅ mint คู่จริง · ❌ ไม่มี audit row · ⚠️ **mint fail ถูกกลืน** (`workflow-side-effects.js:173-183`) → ค้าง `PENDING_AUDIT_FEE` ไม่มีใบให้จ่าย · GP-6b ใช้ราง Stripe เดียวกับ GP-3 (ตันเหมือนกัน)
- **เดินได้จริง:** ( ) ใบ #2 ออก ( ) จ่ายได้ ( ) สถานะขยับ · `hop-gp6.png` · ______

### GP-7 · จัดตารางตรวจ → `AUDIT_CONFIRMED`
- **โครงสร้างมี:** ⚠️ **มี 4 ตัวเขียนตาราง cap แค่ตัวเดียว**; `POST /api/audits/schedule` เลี่ยง canonical writer, ไม่มี audit (`audits.js:266,362`); เสี่ยง double-book TOCTOU (`scheduler-audit-schedules-post-handler.js:150-241`)
- **เดินได้จริง (บทบาท scheduler):** ( ) จัดวันได้ ( ) auditor เห็นนัด ( ) เกษตรกรเห็นวันตรวจ · `hop-gp7.png` · ______

### GP-8 · ตรวจผ่าน (คนกด PASS) → `AUDIT_PASSED`
- **โครงสร้างมี:** ✅ **S6 เป็นคนกดจริง ไม่มี auto-certify** · ⚠️ แจ้ง onsite อาจส่งผิดปลายทาง (`healthId` แทน `User.id` `audit-onsite-service.js:892-895`) · ❌ decision handler **ไม่มี in-tx AuditLog** (`auditor-audit-decision-handler.js:189-231`) · ⚠️ ข้ามขั้นต่ำรูป/checklist ได้ถ้า model ไม่ถูก provision
- **เดินได้จริง (บทบาท auditor):** ( ) auditor กด PASS ได้ ( ) สถานะขยับ ( ) เกิดใบรับรอง · `hop-gp8.png` · ______

### GP-9 · ออกใบรับรอง + QR
- **โครงสร้างมี:** ✅ mint ตอน `AUDIT_PASSED`, hash + RSA จริง · ⚠️ **`documentHash` = SHA-256 ไม่มี key** (#619 — แก้ใบแล้ว recompute ได้; RSA sig คือตัวคุมจริงแต่ best-effort) → ใบขึ้น **amber ไม่ใช่เขียว** · ❌ `CERTIFIED` notif โชว์เลขใบเป็น `'-'` (`workflow-side-effects.js:258-262`) · ⚠️ `final-approvals` เขียนตรง bypass writer (`auditor.js:130-134`)
- **เดินได้จริง:** ( ) ใบรับรองออก + ดาวน์โหลดได้ ( ) มี QR ( ) เลขใบถูก (ไม่ใช่ `-`) · `hop-gp9.png` · ______

### GP-10 · หน้า verify สาธารณะ (สแกน QR)
- **โครงสร้างมี:** ✅ lookup จริง + recompute hash + RSA verify · ❌ **ไม่บันทึกการ verify** (สแกน/สแครปไม่ทิ้งร่องรอย — `public.js`) · ⚠️ security: **เดา URL ใบคนอื่นได้ไหม (IDOR/enumeration)** — BACKLOG #73
- **เดินได้จริง (ทดสอบ security):** ( ) สแกน QR แล้วหน้า verify โชว์ข้อมูลตรงใบ ( ) **ลองเปลี่ยนเลขใน URL → เห็นใบคนอื่นไหม?** · `hop-gp10.png` · ______

---

## สรุปหลังเดินจบ (auditor เติมจากรูป)
| hop | โครงสร้างมี | เดินได้จริง | ตรงกันไหม | = gap? |
|---|---|---|---|---|
| A1-A8 wizard | ⏳ | (รอรูป) | | |
| GP-2 invoice#1 | ⚠️ | (รอรูป) | | |
| GP-3 QR | ❌ คาดตัน | (รอรูป) | | **น่าจะ gap #1** |
| GP-4 settle | ✅core/❌notif/audit | (รอรูป) | | |
| GP-5a assign | ✅/⚠️bypass | (รอรูป) | | |
| GP-5b correction | ✅+M4 | (รอรูป) | | |
| GP-6 invoice#2 | ✅/⚠️ | (รอรูป) | | |
| GP-7 schedule | ⚠️TOCTOU | (รอรูป) | | |
| GP-8 PASS | ✅human/❌audit | (รอรูป) | | |
| GP-9 cert+QR | ✅/⚠️amber | (รอรูป) | | |
| GP-10 verify | ✅/⚠️IDOR | (รอรูป) | | |

> ช่อง "เดินได้จริง" ว่างทั้งหมดจนกว่าท่านจะเดิน — **ไม่มี hop ไหนถูกนับ DONE จากโค้ดอย่างเดียว** (กติกา operator 2026-08-05)

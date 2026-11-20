# 🔬 System Reality-Check — GACP Certification Platform
**วันที่:** 2026-05-30 · **วิธี:** multi-agent evidence audit (3 agents ขนานกัน + สถาปัตยกรรมวิเคราะห์เอง) · **กฎ:** ทุกข้ออ้างมี `file:line` · แยก `[VERIFIED]` (เห็นโค้ด/พิสูจน์ด้วย grep) vs `[SUSPECTED]` (สัญญาณ ต้องยืนยันเพิ่ม)

> ตอบคำถาม 6 ข้อ: (1) dynamic workflow vs hardcode · (2) ทั้งระบบทำถูกมาตรฐานหรือทำมั่ว · (3) dead/ซ้ำ/zombie/หนี้เทคนิค · (4) มาผิดทาง/over-engineer ไหม · (5) UX flow · (6) UI กดไม่ได้/ซ้ำ/zombie

---

## 0. คำตัดสินรวม (ตอบ item 4 ตรงๆ)

**คุณไม่ได้คิดไปเอง — แต่ปัญหาแคบกว่าที่รู้สึก.**

- **แกนกลางลีนและถูกต้อง** (ให้ความเป็นธรรม): state machine, auth, finance double-entry, QR/trace, applicant happy-path — ทำตามมาตรฐานจริง ไม่ใช่ façade
- **ปัญหากระจุก 2 แบบ:**
  - **(ก) หนี้จากการโตแบบเพิ่มไม่ลบ** — dead code ~3,800 LOC (backend) + ~24 zombie component (frontend), ของซ้ำ (helper, email stack, UI สองระบบ), over-engineer เฉพาะจุด (module façade ว่าง, payment แตก 7 ไฟล์)
  - **(ข) รอยต่อ half-wired / ฟีเจอร์ที่ยังไม่เสร็จ** — แจ้งเตือนทำงานครึ่งทาง, credit note ไม่ลง GL, QR cert ผิดโดเมน, pay-later โกหกว่า PAID

**วินิจฉัย:** ไม่ใช่ "ออกแบบผิดแต่แรก" (สถาปัตยกรรมดี) — เป็น **"โตด้วยการพอก ไม่ตัดของเก่า"** ตรงกับสัญชาตญาณคุณ. **ทางแก้คือ consolidation + ปิดรอยต่อ ไม่ใช่ rewrite.**

**Theme เดียวร้อยทุกข้อ:** *additive growth, no subtraction* — เพิ่มของใหม่โดยไม่ลบ/รวมของเก่า ทุกชั้น.

---

## 1. Dynamic Workflow vs Hardcode → **hardcode ถูกแล้ว, อย่าทำ engine**

| หลักฐาน | ค่า |
|---|---|
| dynamic engine (WorkflowDefinition model / xstate / bpmn / DB-driven) | **ไม่มีเลย** |
| state machine | hardcode + centralized: `workflow-transition-service.js` `ALLOWED_TRANSITIONS`(L165) `ROLE_TRANSITIONS`(L197) |
| flow เปลี่ยนบ่อยไหม | git 12 เดือน = **4 commits** (3 เป็น bug fix) → นิ่งมาก |
| ปัญหาจริง | status เป็น magic string ใน **78 ไฟล์ backend + 23 frontend** |

**สรุป:** flow ถูกกำหนดโดยระเบียบราชการ เปลี่ยน ~ไม่เคย, มี flow เดียว → dynamic engine = ความซับซ้อนมหาศาลแลกประโยชน์ศูนย์ (definition store + interpreter + versioning + migration ใบที่ค้าง + admin UI). **hardcode ที่ freeze+รวมศูนย์+มี role gate (WF-F4) เป็นจุดแข็ง.**

**หนี้ที่ควรแก้ (ไม่ใช่ด้วย engine):** รวม status เป็น **enum กลางตัวเดียว** (generate จาก Prisma enum) แทน magic string 101 จุด → ได้ type-safety โดยไม่ต้องมี runtime engine.

---

## 2. ความถูกต้องราย Subsystem → **"ไม่ทำมั่ว" แต่มี 8 รอยต่อ**

Metrics: ~170 route + ~170 service files, ทุก route mount จริง (ไม่มี orphan ที่ตั้งใจ), TODO ~55.

| Subsystem | คำตัดสิน |
|---|---|
| สมาชิก/Auth | ✅ COHERENT (bcrypt-12, lockout, JTI revocation, RBAC canonical) |
| ยื่นเอกสาร | 🟠 PARTLY — ไม่มี document store จริง (เก็บเป็น JSON blob), `/verify` ทิ้งไฟล์, upload เช็คแค่ mimetype |
| ติดตาม/แจ้งเตือน | 🟠 PARTLY — transport จริง แต่ hook อยู่แค่ provider path |
| ใบรับรอง | ✅ COHERENT (1 bug: QR domain) |
| บัญชี | ✅ COHERENT (double-entry จริง, แข็งสุด; 1 gap: credit note ไม่ลง GL) |
| ฟาร์ม | ✅ COHERENT |
| QR/Trace | ✅ COHERENT (RSA-signed digest, แข็งแกร่งสุด) |
| แผนก (reviewer/auditor/scheduler) | ✅ COHERENT (work-queue state machine + SLA) |

**8 correctness risks (เรียงตามวัสดุภาพ):**
1. ✅ **[แก้แล้ว Phase 0 — `8f99189`] Credit/Debit note ไม่ post reversing GL** — เพิ่ม `recordCreditNoteEntry`/`recordDebitNoteEntry` ใน journal-entry-service (Dr/Cr ตรงตาม docstring, balanced, 6 tests) [VERIFIED FIXED]
2. ✅ **[แก้แล้ว Phase 0 — `067e898`+`9a6c22e`] QR ใบรับรองชี้โดเมนเข้าไม่ได้** — รวมเป็น `certificate-verify-url.js` → `https://gacpth.com/verify` [VERIFIED FIXED]
3. ❌ **[ถอน — finding ไม่แม่นยำ] "แจ้งเตือน status แค่ 1 path"** — การ trace ทุก path พบว่า **ทุก status สำคัญแจ้งเตือนผู้สมัครครบแล้ว** จาก service/handler layer (payment-slip→`PAYMENT_SLIP_APPROVED/REJECTED`; onsite→`AUDIT_RESULT_*`; scheduling→`AUDIT_SCHEDULED`; cron→`APPLICATION_EXPIRED`; reviewer→`createNotification` ×6 ใน workflow-side-effects; AUDIT_PASSED→`APPLICANT_AUDIT_PASSED` ใน writer). hook กลางใน writer จะ **double-fire** — จึงไม่ทำ (สถาปัตยกรรมถูกแล้ว: writer=thin, service=orchestrate+notify) [VERIFIED — no action]
4. 🟠 **ใบรับรองไม่เซ็นดิจิทัล** — มี RSA signing แต่ไม่เรียกใน `certificate-service.js` [VERIFIED]
5. ✅ **[แก้แล้ว] email stack ซ้ำ 2 ชุด** — ไฟล์ `email/email-service.js` ที่อ่าน `application._id` (ได้ undefined บน Prisma) ไม่มีใน tree แล้ว และ `__tests__/unit/no-underscore-id-on-the-wire.test.js` กัน `_id` ทั้ง routes/services/shared [VERIFIED FIXED 2026-10-06]
6. 🟠 **ยื่นเอกสารไม่มี store + ไม่ scan content** — `documents.js:76-104`, `storage-service.js:147-156` [VERIFIED]
7. 🟡 **payment 6 ไฟล์ ~2380 LOC** (1 dead) [VERIFIED]
8. 🟡 **storage downgrade เงียบ** minio→local `storage-service.js:81,174` [VERIFIED]

> **Phase 0 status:** #1 GL ✅ · #2 QR ✅ · #3 notification = ไม่มี gap จริง (ถอน) · pay-later fake-PAID ✅ (`e4d7aa4`). เหลือ #4 cert-signing, #6 doc-store → Phase 3 (ฟีเจอร์ใหม่ ไม่ใช่ bug fix).

---

## 3. Dead / ซ้ำ / Zombie / หนี้เทคนิค → **~3,800 LOC backend + ~24 ไฟล์ frontend ตายจริง**

**Backend dead (VERIFIED zero importer):**
- `routes/api/audit/farm-audit.js` (400) — unmounted, อ้าง Prisma model ที่ไม่มี
- `services/field-audit-service.js` + `controllers/field-audit-controller/` (4 ไฟล์, ~600) — ไม่เคย instantiate
- `services/breach-notification-service.js` (690) — มีแค่ test
- `services/invoice-document-builder.js` (259) — consumer ที่อ้างไม่มีใครใช้
- `modules/{application,audit,certificate,document,identity,public}/index.js` = `{}` เปล่า

**Frontend zombie (~24 ไฟล์, VERIFIED 0 import):** `ui/button.tsx` (ซ้ำกับ primitives, 0 import), `ui/confirm-dialog.tsx` (ซ้ำ, 0 import), ทั้งโฟลเดอร์ `components/wizard/`, `submit-step.tsx` (tested-but-unrouted), `quote-step.deprecated.tsx`, + 2 dead barrel (`components/index.ts`, `components/ui/index.ts` 0 import)

**ซ้ำ (VERIFIED):** `getLogoDataUrl` ×3 byte-identical · `escapeHtml` ×3 · `formatThaiDate` ×6 backend · **43 ไฟล์ frontend เขียน date formatter เอง** (shared util ใช้แค่ 2) · payment-constants ×2

**Debt:** TODO 55 · @deprecated 25 (กระจุก payment gateway-era) · FIXME/HACK **0** · console.log prod **~0** (ที่เยอะคือ seed/e2e)

---

## 4. Over-Engineering → **มีจริง เฉพาะจุด (ไม่ใช่ทั้งระบบ)**

- 🚩 **module façade ว่าง 86%** — `modules/*/index.js` 6 ตัว = `{}` + มี **custom eslint rule** เฝ้า abstraction ที่ใช้จริง ~2 ราย
- 🚩 **payment แตก 7 ไฟล์** + circular dep (`payment-service→legacy→service`) ครึ่ง `@deprecated`
- 🚩 **finance ~38 `*-service.js`** หลายตัว thin wrapper ทับ Prisma
- 🚩 **passthrough shim** — `fee-service.js`, `payment-constants.js` = `module.exports = require(...)` ล้วน

---

## 5. UX Flow → **"ลื่นที่แกน เป๋ที่ขอบ"**

**แกน applicant ลื่นจริง** (ทุก step ต่อ API จริง): register→login→สร้างใบ (wizard server-driven + resume draft + gated nav)→upload doc→submit (`/applications/prepare`)→จ่าย (slip upload จริง)→ติดตาม→ใบรับรอง. **ไม่ใช่ façade.**

**Gap:**
1. 🔴 **"จ่ายทีหลัง" → หน้า success ที่โกหกว่า "ชำระแล้ว"** — `invoice-step.tsx:279` ปุ่มแค่ `router.push(step/12)` ไม่เรียก API; `success-step.tsx:103` hardcode "PAID" + `:24` สร้างเลขใบปลอม → ผู้สมัครเห็น "ยื่นแล้ว+จ่ายแล้ว" ทั้งที่ไม่ได้จ่ายและไม่ได้ยื่น [VERIFIED] **ร้ายแรงสุด**
2. 🟠 **ต่ออายุจ่ายเงินไม่ได้** — `RENEWAL_PAYMENT_WIRED=false` (`renewal/client-view.tsx:227`) เด้งไปอีเมล DTAM (honest แต่ตัน)

---

## 6. UI กดไม่ได้/ซ้ำ/zombie → **codebase สะอาดผิดคาด แต่มี migration debt**

**สะอาด:** `onClick={()=>{}}` = **0** · console-only handler = **0** · `disabled={true}` literal = **0** · TODO ใน component = **0**

**No-op/stub ที่มี (ส่วนใหญ่ label ตรงๆ):**
| ที่ | ปัญหา |
|---|---|
| `success-step.tsx:103` | hardcode "PAID" (หลอก) [VERIFIED deceptive] |
| `provider/scheduler/queue/client-view.tsx:214` | ปุ่ม export CSV = toast "กำลังพัฒนา" |
| `admin/certificates/[id]/detail-view.tsx:384` | **Revoke cert = dialog เปล่า** "coming next iter" (รัฐออกใบรับรองแต่เพิกถอนไม่ได้) |
| `ArAgingReport.tsx:321,332` · `audit-application-tab-panel.tsx:166` | ปุ่ม disabled "API pending" |

**UI 2 ระบบ (migration ค้าง):** Mantine-shim (`icon-buttons` 26 importers, `layout-utils` 28) vs shadcn primitives. Button canonical (130 importers) ยังพก dead Mantine prop (`color/styles/component/loading`). ConfirmDialog/Button มีตัวซ้ำ 0-import.

---

## 🗺️ Remediation Roadmap (จัดลำดับ)

### Phase 0 — แก้ทันที (ความถูกต้อง/เงิน/ความน่าเชื่อถือ)
1. **pay-later fake-PAID** — ปุ่ม "จ่ายทีหลัง" ต้องเรียก `/applications/prepare` จริง + success-step แสดง status จริง (ไม่ hardcode PAID) `invoice-step.tsx:279`, `success-step.tsx:103,24`
2. **Credit/Debit note → post reversing GL** `credit-note-service.js:689`
3. **QR cert → โดเมนจริง** `/api/public/verify/` `certificate-service.js:210`
4. **notification hook ใน `writeApplicationStatus`** (ครอบ payment/onsite/cron)

### Phase 1 — ลบของตาย (ปลอดภัย, ~3,800 LOC + ~24 ไฟล์)
farm-audit.js · field-audit-* · breach-notification-service · invoice-document-builder · 16+24 zombie components · empty module barrels · dead barrels

### Phase 2 — รวมของซ้ำ (consolidation)
status enum กลาง · `getLogoDataUrl`/`escapeHtml`/`formatThaiDate` รวมเป็น util เดียว · 43 date formatter → shared · ยุบ payment sprawl · จบ UI migration (ลบ legacy Button/ConfirmDialog/Mantine-shim)

### Phase 3 — ปิดรอยต่อ (ฟีเจอร์ที่ค้าง)
cert digital signing · renewal payment · cert revoke · finance AR actions · document store จริง + content scan

---

## หมายเหตุความซื่อสัตย์ (scope)
- ไม่ได้ trace ครบทุก ~170 service / 140 page — เน้น entry point + เส้นเงิน/cert/identity + happy-path
- `[SUSPECTED]` มีน้อย (LINE Notify deprecation, modal sprawl) — ต้องยืนยัน ops/เพิ่มเติม
- agent จับ false-positive ของตัวเอง (lazy-router `createLazyRouter('./x')` ทำ naive grep หลอก) → ผลผ่านการ re-check แล้ว

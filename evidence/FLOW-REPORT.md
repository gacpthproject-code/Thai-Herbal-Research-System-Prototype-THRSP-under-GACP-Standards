# FLOW-REPORT — W2 AUTONOMOUS FLOW (Q1 → Q2 → Q3) — 2026-08-03

Queue จบครบตาม `PROMPT-W2-AUTONOMOUS-FLOW.md` §2 (+ operator amendment เพิ่ม Q3) — **STOP ตาม Q-END** ไม่มีการหางานต่อ
Baseline: `evidence/FLOW-baseline.txt` (head `54ae9c6`, hardcode=43 todo=59 env-direct=169 dup-source=4)

## 1. งานไหนจบ / ติดอะไร

| Task | Status | fix cycles | Evidence |
|---|---|---|---|
| **Q1 — W2-03 frontend checkout UI** | DONE(probe:ratchet) + auditor PASS | 0/3 | `evidence/W2-03/` |
| **Q2 — W3-41 payment schedule** | DONE(probe:ratchet) + auditor PASS | 0/3 | `evidence/W3-41/` |
| **Q3 — reopen-readiness audit** (read-only) | DONE — auditor PASS รอบ 3 | 2/3 | `evidence/Q3-reopen-audit/` |

**ติดอะไร (ต้องมีคนทำ — agent ทำแทนไม่ได้):**
1. **CI ของ #722 ยังไม่เคยรัน** — workflow ไม่ trigger กับ PR ที่ base ไม่ใช่ `main` หลัง #721 merge ต้อง rebase + retarget #722 → `main` แล้ว CI จึงรันจริง (คำสั่ง operator ข้อ 2 — ผมเฝ้า #721 อยู่ พร้อมทำทันทีที่ merge)
2. **ต้องรัน `prisma migrate deploy` + `prisma generate` ใน env ที่เข้าถึง engine ได้ก่อน merge #722** — sandbox โดน 403 ตอน download engine (รายงานตามจริง ไม่ route around); schema ตรวจมือ + suite ผ่านด้วย mocked prisma ตาม baseline เดิม
3. **Q3 findings รอ operator เลือกรายการก่อน remediation** (ตาม mandate: ห้ามเสนอ patch) — โดยเฉพาะกอง (b) 5 รายการ

## 2. PR ที่เปิดรอ review

| PR | สถานะ | เนื้อหา |
|---|---|---|
| **#721** `feat/stripe-payment-wave-2` | draft, CI **เขียว**, mergeable `clean`, 7 commits | Wave 2 engine + adapter seam + harness + W2-02 money pins |
| **#722** `feat/w2-03-checkout-ui` (base = branch #721) | draft, CI **ยังไม่รัน** (ดูข้อ 1.1) | Q1 checkout UI + Q2 payment schedule + evidence ของ Q1-Q3 |

ทั้งสองใบ **ไม่ merge, ไม่ deploy** ตาม §9 — operator ตัดสินเอง

## 3. BACKLOG-FOUND สรุป (`BACKLOG-FOUND.md` — append-only)

| รายการ | ระดับ |
|---|---|
| **drain stored-'overdue' consumers** (invoice-repository / invoice-service / ar-aging / seed) → derived | **PRIORITY สูง** — ar-aging ที่ฝั่ง Account ใช้จะแสดงผลผิดจนกว่าจะ drain (operator แจ้งว่าจะนำไปคุยกับฝั่ง Account) |
| catalog `CHECKOUT_*` error family (4 codes) + ขยาย validator ให้จับ idiom `httpError()` | ปกติ |
| extract `'CERTIFICATION_CHECKOUT'` serviceType เป็น shared constant | ปกติ |
| paymentLimiter ไม่ครอบ `POST /api/payments/checkout` | ปกติ |
| safeErrorMessage allowlist เป็นวลีอังกฤษล้วน (กลืนข้อความไทยทุกตัวจาก service) | ปกติ |
| probe `suite-green` / `no-skip` FAIL ของเดิม (dataset-export ต้อง prisma generate; `test.skip` ใน e2e เก่า) | ของเดิมที่ baseline |

## 4. การตัดสินใจทั้งหมดที่ทำแทนคน พร้อมเหตุผล

> ทุกข้อในนี้คือจุดที่ spec ไม่ได้ระบุ และผมตัดสินแทนเพื่อให้งานเดินต่อ — operator ทบทวน/กลับคำได้ทุกข้อ

**Q1 (หลัง operator ตัดสิน A1–A7 แล้ว — เหล่านี้คือส่วนที่ยังเหลือ)**
1. **mock delay 300ms uniform ทุก scenario** — spec ระบุชัดเฉพาะ timeout/happy; ผมให้เท่ากันหมดเพราะเป็น presentation latency ไม่ใช่ business value
2. **`milestone` type = `string` ไม่ประดิษฐ์ union M1|M2** — สอดคล้อง A6 (FE ไม่ตัดสิน milestone) และไม่สร้าง vocab ที่สองฝั่ง FE
3. **entry link ไม่ส่ง `milestone`** — backend มี default M1 อยู่แล้ว (`payments.js:431`) = ปล่อยให้ backend ตัดสินตาม A6 (ผู้ implement กังวลว่าจะ 400 — ตรวจ contract แล้วไม่ใช่)
4. **ตำแหน่งลิงก์ใต้ SummaryHeader + gate `!loading && activeApplicationId`** — ต้องมี app id ถึงสร้าง href ได้
5. **ไม่ consume `clientSecret` ใน Q1** — หน้า confirm-payment จริงต้องมี Stripe JS + keys ซึ่งอยู่นอก scope; แสดง `checkoutOrderId` เป็นเลขอ้างอิงแทน (response-verbatim)
6. **วิธี auth ใน Playwright: inject cookie `auth_token`** ที่ middleware อ่านจริง — เพราะ login flow ของ e2e เดิมต้องมี backend ซึ่ง sandbox ไม่มี; **ไม่แก้ middleware/auth** และรายงานข้อจำกัดตามจริง

**Q2 (หลัง operator ตัดสิน 4 ข้อ — เหล่านี้คือส่วนที่ยังเหลือ)**
7. **backward business-day step ทำใน service ใหม่ผ่าน `isWorkingDay` canonical** — `utils/working-days.js` มีแต่ `addWorkingDays` เดินหน้า; เลือก compose จากของเดิมแทนการแก้ util หรือสร้าง calendar ที่สอง
8. **collision DUE_DATE/OVERDUE_NOTICE ตกวันเดียวกัน → ส่งทั้งคู่** — คนละ type คนละ copy และ dedup key แยก type อยู่แล้ว
9. **เวลาของ reminder = end-of-business-day ICT** — ให้สม่ำเสมอกับ `Invoice.dueDate` ที่ `addWorkingDays` คืน
10. **recipient = `invoice.applicant.id`** — ตาม idiom `invoice-service.js:452` (sendNotification lookup ด้วย User.id ไม่ใช่ canonicalId)
11. **dispatch ล้มเหลว → `sentAt=NULL` ไม่ retry + warn** — row ยัง dedup อยู่ ไม่ส่งซ้ำ; **เป็นคำถามค้างถึง operator** ว่าต้องการ retry-on-unconfirmed ไหม
12. **`'CERTIFICATION_CHECKOUT'` เป็น in-module constant** — ไม่มี shared constant และการ extract ต้องแตะไฟล์ Wave-2 (ลง backlog แทน)
13. **Q2 อยู่ใน PR #722 ใบเดียวกับ Q1 ไม่แยกใบ** — Q2-D1 ต้องแตะ mint ของสาย #721 และ D2 ต่อจาก D1; การแยกย้อนหลังต้อง force-push ซึ่งต้องห้ามตาม §6

**Q3**
14. **auditor FAIL → นับเป็น completeness fix cycle ไม่ STOP ทันที** (2 ครั้ง) — deliverable ของ Q3 คือ findings ที่ครบ; ส่งไม่ครบ = ละเมิด verify-before-claim และการเติมเป็น read-only ไม่มีความเสี่ยง (ถ้ารอบ 3 FAIL อีกจะ STOP ที่ 3/3)
15. **orchestrator verify item 13 เอง (3 ข้อ) ก่อน persist** แทนการ dispatch spec-reader รอบใหม่ — เป็นการตรวจ report ไม่ใช่เขียนโค้ด และ 2 tool call จบ

**ข้ามทั้ง flow**
16. **ไม่ commit งาน in-flight ของ implementer** แม้ stop-hook เตือนเรื่อง uncommitted changes — การ snapshot งานกลางคันทำลาย evidence trail ของ RED→GREEN; commit เมื่อ dispatch ส่งงานกลับและตรวจรับแล้วเท่านั้น

## 5. หมายเหตุความถูกต้องของรายงานนี้

- ทุกตัวเลขในรายงานมาจาก probe/test ที่รันจริงใน session และ auditor รันซ้ำอิสระอีกชั้น
- Q3 findings ผ่านการตีกลับ 2 รอบก่อนครบ — บันทึกไว้ในเอกสารเองแล้ว (`findings.md` §บันทึกกระบวนการ) เพื่อไม่ให้เข้าใจผิดว่า audit รอบเดียวจบ
- gate §4.2 (CI) ของ Q1/Q2 **ไม่ผ่านและไม่เคลมว่าผ่าน** — สถานะจริงคือ "รอ retarget" ตามคำสั่ง operator ข้อ 3

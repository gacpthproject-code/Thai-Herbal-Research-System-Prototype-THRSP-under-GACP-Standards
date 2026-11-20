# SYSTEM COMPLETENESS — 2026-08-06 (LANE 2 refresh)

> **Supersedes** `SYSTEM-COMPLETENESS-2026-08-05.md` — re-verified against main tip หลัง merge batch R2 (#793-#800) ด้วย 7 read-only inventory agents (verify-before-claim: ทุก claim มี file:line หรือ "ไม่มี")
> กติกาเดิม: **DONE ต้องมีช่อง C (e2e จริง)** · mock-only = MOCK-ONLY · ช่องที่ตอบไม่ได้ = gap ออกแบบ
> LANE-1 fixes (#802 M5-race, #803 ThaID-gate, #805 cert-downgrade) เขียวแล้ว **ยังไม่ merge** — สถานะข้างล่างคือ main ณ วันตรวจ

## สรุปรวม

**0 DONE · 8 PARTIAL · 9 MOCK-ONLY · 1 MISSING** (นับรวม subsystem ที่แตกเพิ่ม + missed modules)

| # | Subsystem | E-status | ประเด็นชี้ขาด (file:line ในภาคผนวก) |
|---|---|---|---|
| 1 | AUTH & IDENTITY | 🟡 PARTIAL | local login จริง+ถึงได้จาก UI; ThaID backend ครบแต่ปุ่ม FE facade (#801 draft รอ #803); Provider ID ตัน 409; Health ID ไม่มี adapter |
| 2 | ORG / multi-tenant | 🟡 PARTIAL ⬆ | ยกจาก MOCK-ONLY: real-Postgres 2-org test รันใน CI แล้ว (findMany+count) · ค้าง: findUnique/raw ไม่ scope, RLS inert, middleware fail-open |
| 3 | PAYMENT | 🟠 MOCK-ONLY | FE จ่ายจริงไม่ได้: clientSecret ถูกทิ้ง, ไม่มี @stripe/stripe-js, checkout UI ปิด default, keys BLOCKED |
| 4 | ACCOUNTING | 🟠 MOCK-ONLY | double-entry/reconciliation/daily-cash ไม่มี real-DB proof เลย · slip rail เดินได้บางส่วน |
| 5 | JOBS/CRON | 🟡 PARTIAL ⬆ | #797/#789 body พิสูจน์บน real-Postgres ใน CI · ค้าง: cron tick mock-only, reminders mock-only, 2 processor หาย |
| 6 | CASE-TRACKING | 🟡 PARTIAL | ยืนยัน: อ่าน **live DB ไม่ใช่ cache** (ไม่มี cache layer เลย) · ค้าง: ไม่มี real-DB/e2e ของ endpoint ต่อ role, FE ไม่ poll/refetch |
| 7 | APPLICATION SUBMIT (บพข. 9 step) | 🟡 PARTIAL | draft→submit→quotation wired; invoice mint ที่ phase-1 ไม่ใช่ตอน submit; ไม่มี real-DB ของ initial-submit path |
| 8 | CERT-lifecycle | 🟡 PARTIAL | #619 ปิดแล้ว (keyed HMAC, #805 รอ merge) · ค้าง: expiry ไม่เคย persist, renewal supersession ไม่ wire, applicationId ไม่มี @@unique (เสี่ยง double-issue) |
| 9 | FARM+TRACE | 🟡 PARTIAL | CRUD ครบแต่ orphan gaps จริง (ดูภาคผนวก) · Farm org-isolation ไม่มี real-DB proof |
| 10 | QR (4 แบบจริง: cert/plant/plot-cycle/batch+lot) | 🟠 MOCK-ONLY | "cultivation-update QR" **ไม่มีอยู่จริง** (แบบที่ 4 คือ batch+lot) · PDPA scope ของ plant QR ผ่าน (ไม่ leak ทั้งฟาร์ม) |
| 11 | SURVEY (4 บทบาท) | 🟠 MOCK-ONLY | ตอบ 4 คำถามออกแบบแล้ว — พบ gap: ใครก็ตอบ template ไหนก็ได้ (authenticateAny ไม่ match targetGroup), stats/export เปิดทุก provider role, cross-org read ทาง findUnique |
| 12 | NOTIFICATION (in-app) | 🟡 PARTIAL | wiring จริง DB-backed ครบ 4 หลักฐาน · **พบ bug จริง: actionUrl เก็บใน metadata แต่ FE อ่าน top-level → ปุ่มลิงก์ไม่เคย render** |
| 13a | PDPA retention+legal-hold | 🟡 PARTIAL | real-Postgres proven + scheduled · sweep ครอบแค่ User (อีก 5 model ที่มี legalHold ไม่ถูก sweep) |
| 13b | PDPA erasure (ม.32) | 🟠 MOCK-ONLY | โครงครบ (tax-preserve ตาม ม.87/3) แต่ $transaction ไม่เคยพิสูจน์บน real DB |
| 13c | DTAM-interop (partner-key) | 🟠 MOCK-ONLY | 14 endpoints coded, dormant (INTEROP_PARTNER_API_KEYS ว่าง fail-closed), outbound push ไม่มี |
| 13d | Remittance to DTAM | 🔴 MISSING | **unbuilt ยืนยันแล้ว**: recordRemittanceToDtam = dead code (0 callers), DtamRemittanceBatch ไม่เคยถูกเขียน, ค่าธรรมเนียมรัฐค้าง PENDING ตลอดกาล |

### Missed modules (ไม่อยู่ใน 13-list เดิม — ควร track แยก)

| Module | E-status | เหตุผลที่สำคัญ |
|---|---|---|
| **AUDIT/ONSITE inspection** | 🟡 PARTIAL | จุด pivot ของทั้ง lifecycle (AUDIT_PASSED→mint cert) — โมดูลใหญ่สุดที่ตกหล่น; integration test เป็น in-memory + mock cert-service |
| PDPA CONSENT (ม.19) | 🟠 MOCK-ONLY | grant/withdraw + require-consent gate — แยกจาก retention/erasure |
| REFUNDS | 🟠 MOCK-ONLY | เส้นเงิน (Law 3.4) — PLATFORM-side reversing GL, mock only |
| SUBSCRIPTION | 🟠 MOCK-ONLY | มี cron ตัวเอง 2 ตัว แต่ domain ไม่ถูก list |
| FRAUD + AI IMAGE | 🟠 MOCK-ONLY | duplicate-farm/anomaly/disease/quality — supporting audit decision |

## แก้ความเข้าใจจากฉบับ 2026-08-05 (สำคัญ — ห้าม plan จากของเก่า)

1. **ThaID "ไม่มี adapter" = stale** — backend ครบแล้ว (#795): adapter + callback + auto-provision guards; gap ย้ายไปที่ FE (ปุ่ม facade — #801 draft)
2. **Tenant isolation "MOCK-ONLY / flag OFF" = stale** — default ON ทั้ง code (`orgReadScopeEnabled !== 'false'`) และ prod compose (`:-true`); real-Postgres 2-org test รันใน CI พร้อม 0-skipped guard
3. **"6 real-DB tests" = stale** — ปัจจุบัน 8 suites ใน CI assert-ran guard (+cross-system-audit เป็น in-memory ไม่นับ)
4. **ADR-014 Phase D (NOT NULL) เสร็จแล้ว** (migration flip 47 tables) — MEMORY เดิมบอกยังค้าง
5. **#619 cert forge ปิดแล้ว** (keyed HMAC บน main; bare-hex→UNSIGNED ใน #805) — เหลือ backfill #804

## Defects ใหม่ที่ inventory พบ (นอกเหนือสถานะ)

| # | Defect | Evidence | ความแรง |
|---|---|---|---|
| D1 | **Notification action button ตาย**: `createNotification` เก็บ actionUrl ใน `metadata` แต่ FE bell อ่าน `n.actionUrl` top-level → undefined เสมอ | notification-service.js:324-327 vs provider/notifications/client-view.tsx:232 (+health twin) | สูง (UX เดิน journey) |
| D2 | **Payment FE จ่ายไม่ได้**: clientSecret fetch แล้วทิ้ง, ไม่มี @stripe/stripe-js, UI ตันที่ "รอชำระเงิน" | checkout/client-view.tsx:143,182-244; package.json | สูง (GAP-2 เดิม แม่นขึ้น) |
| D3 | queue-service อ้าง processor 2 ไฟล์ที่ไม่มีจริง (webhook-dlq, pdf) → PDF queue เงียบตาย | queue-service.js:13,90 | กลาง |
| D4 | Cert expiry ไม่เคย persist (`status:'expired'` ไม่มีใครเขียน) + renewal supersession ไม่ wire + `Certificate.applicationId` ไม่มี @@unique → concurrent double-issue ได้ | scheduler.js:42; renewal-service.js:596; certification.prisma | กลาง |
| D5 | Farm orphan: ลบ farm = soft ไม่ cascade (ลูกค้างชี้ farm ที่ซ่อน) แต่ลบ plot = hard ไม่มี empty-guard (cycle→plot ถูก SetNull เงียบ) + plot ไม่มี UPDATE/GET-single | farm-service.js:336-343; planting-service.js:713; cultivation.prisma:27-28 | กลาง |
| D6 | Survey: submit = authenticateAny + ไม่ match role↔targetGroup; stats/CSV เปิดทุก provider role; read by templateId ข้าม org ได้ (findUnique) | surveys.js:109,176,186; survey-service.js:132-135,302-303 | กลาง |
| D7 | PDPA sweep ครอบแค่ `prisma.user` — Application/Certificate/Invoice/Organization/PaymentSlip มี legalHold แต่ไม่มี retention sweep | pdpa-retention-job.js:94; legal-hold-guard.js:86-93 | กลาง |
| D8 | getNotifications กลืน error คืน 200 ว่าง → inbox พังดูเหมือนว่าง | notifications.js:35-39 | ต่ำ |
| D9 | mfa.js เขียนคอลัมน์ที่ไม่มีจริง (mfaSecret/mfaBackupCodes) — bug เดิมระบบ | routes/api/identity/mfa.js | ต่ำ (flag ไว้) |

## Green-mask: `e2e-golden-scenario.spec.ts` — ยืนยันแล้ว + สเปกปลด mask

ยืนยัน: มีแค่ 3 hop ที่ assert จริง (login :80, draft-create :144, health :227) — hop ที่พิสูจน์ lifecycle **ทุกตัว**รับ 4xx หรือ skip (register [200,201,409] :68 · farm test.skip :117 · submit [409,422]+skip :161 · phase1 [200,201,400,404] :175 · approve [200,400,404]+สถานะ non-canonical 'APPROVED_DOCUMENT' :198 · helper รับถึง 429 :217) · cert/QR ไม่เคยถูก assert · เขียวได้แม้ pay/review/cert พังหมด

**สเปกปลด mask (งาน UAT-01):** submit→expect 200+PENDING_DOC_FEE+quotation · phase1→200+invoiceId+DOC_FEE_PAID · approve→200+canonical advance · cert→Certificate row+เลขที่ แล้ว GET /verify integrity=VALID

## หมายเหตุวิธีอ่าน

- "PARTIAL ⬆" = ยกระดับจากฉบับ 08-05 ด้วยหลักฐานใหม่ (ไม่ใช่ความเห็น)
- ภาคผนวก file:line เต็มของทุก subsystem อยู่ใน raw inventory (workflow wf_c6e40074-ea4) — ย่อในตารางเพื่ออ่านได้; ทุกแถวมี evidence ใน digest
- staging ยังตาม main ~143 commits — ทุกสถานะข้างบนคือ "บน main" ไม่ใช่ "บนเว็บที่คนแตะได้" (LANE 5 = ปิด gap นี้)

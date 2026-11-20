# 🔬 System-Wide Audit (ปูพรมทั้งระบบ) — GACP Certification Platform

> **วิธีการ:** orchestrate 6 แทร็กตรวจสอบขนานกัน (5 sub-agent + 1 แทร็กที่ผู้ตรวจทำเอง) แบบ **อิงหลักฐานจริงทุกข้อ (file:line / ผลรันคำสั่ง) — ไม่เดา** หากตรวจไม่ได้จะระบุ "ตรวจไม่ได้" ชัดเจน
> **ขอบเขต:** Workflow/state-machine · Backend & API · Database · Frontend features · UX/UI & a11y · System/Deployment architecture
> **วันที่:** 2026-05-29 · **Commit ฐาน:** branch `claude/pensive-fermi-10tuY` · เสริมจาก `AUDIT-REPORT.md` (security audit เดิม)

---

## 1. Executive Summary

**คำตัดสินรวม:** ระบบนี้ **เป็น platform ที่โตเต็มวัยและมีวิศวกรรมดีกว่าค่าเฉลี่ยจริง** — โครงสร้าง state-machine, schema, auth, deployment, observability ออกแบบมาอย่างจริงจัง และ "Production Ready" ส่วนใหญ่เป็นจริง (frontend 141 routes wire จริง, ไม่มี mock)

**แต่** จากการ refactor/consolidation หลายรอบ (canonicalize status-machine, redesign slip-flow, รวม role) ทิ้ง **dead code + การบังคับใช้ที่ไม่สม่ำเสมอ** ไว้ → เกิด defect ความถูกต้องที่เป็นรูปธรรมหลายจุด

### ตารางสรุป findings ข้ามโดเมน

| Severity | จำนวน | IDs |
|---|---|---|
| 🔴 Critical | 1 | WF-F1 |
| 🟠 High | 8 | WF-F2, WF-F3, WF-F4, BE-T1, DB-01, DB-03, UX-A11Y-1, UX-A11Y-2 |
| 🟡 Medium | 15 | WF-F5, WF-F6, WF-F7, WF-F8, BE-T2, BE-V1, DB-02, DB-04, DB-05, DB-06, FE-F2, FE-F3, FE-F4, UX-I18N-1, UX-CONTRAST-1 |
| 🟢 Low | 13 | WF-F9, WF-F10, BE-E1, BE-C1, DB-07, DB-08, DB-09, FE-F5, FE-F6, FE-F8, UX-I18N-3, UX-HTML-1, UX-DS-1 |
| ⚪ Info/disclosed | 3 | FE-F1*, FE-F7, FE-F9/F10 |

\* FE-F1 (renewal payment ปิด) จัดเป็น High เชิงธุรกิจแต่ **เปิดเผยใน UI แล้ว** และเคยเป็น bug เสียเงินที่ถูกปิดความเสี่ยงแล้ว

### 🎯 Root cause ข้ามโดเมน (theme หลัก)
defect ความถูกต้องส่วนใหญ่มาจาก **"การมี 2 กลไกทำงานเดียวกัน โดยตัวหนึ่งไม่บังคับกฎ"** ที่เกิดซ้ำในหลายโดเมน:
- **Workflow:** `buildTransitionUpdate` (ตรวจกฎ) vs `writeApplicationStatus` (ไม่ตรวจ) → WF-F1..F8
- **Database:** registry `SOFT_DELETE_MODELS`/`TENANT_SCOPED_MODELS` ที่ maintain ด้วยมือ **drift จาก schema** → DB-03/D-04
- **Frontend/Backend:** code path เก่าที่ถูกแทนที่แต่ไม่ถูกลบ (quotes flow, payment-webhook, legacy wizard, dual form components) → WF-F1, BE-C1, FE-F5, UX-A11Y-1

**บทเรียน:** ควรเปลี่ยน convention ("กรุณาเรียกตัวที่ guard") ให้เป็น **enforcement** (ทำให้ writer เดียวเป็น guard จริง + ลบ path เก่า + sync registry อัตโนมัติจาก schema)

---

## 2. แทร็ก 1 — Workflow / State-Machine *(โดเมนที่เน้นพิเศษ)*

**นิยาม canonical:** `apps/backend/services/workflow-transition-service.js` (ไฟล์ `shared/workflow-state-machine.js`, `shared/status-machine.js` เป็น deprecated re-export) · `Application.status` เป็น `String` ธรรมดา (ไม่มี DB enum) → บังคับใช้ระดับ application ล้วน

**ภาพรวมที่ดี:** state machine หลัก **well-formed** — ไม่มี dead-end (ยกเว้น orphan ที่เป็น bug), terminal ถูก (CERTIFIED/REJECTED/EXPIRED), **payment gating แน่น** (เข้า `ASSIGNED_FOR_REVIEW` ได้เฉพาะหลัง `DOC_FEE_PAID`, เข้า `AUDIT_CONFIRMED` ได้เฉพาะหลัง `AUDIT_FEE_PAID` — ข้ามไม่ได้บนเส้นทางที่ guard), revision/CAR loop ตั้งใจไม่จำกัดรอบ + SLA 5 วัน (ไม่ใช่ off-by-one)

**ปัญหาแกนกลาง:** มี **2 กลไกเปลี่ยนสถานะ** — `buildTransitionUpdate()` (ตรวจ edge+RBAC+comment, ใช้ ~4 เส้นทาง) กับ `writeApplicationStatus()` (**ไม่ตรวจอะไรเลย**: `assertTransition` ปิดทุก call site, และถึงเปิดก็เป็น dead code เพราะ `canTransition` มี arity 2 ไม่รับ role) ใช้ ~15 เส้นทาง

| ID | Finding | Sev | Conf | หลักฐาน |
|---|---|---|---|---|
| WF-F1 | **flow `quotes` send/accept/team-review ตายทั้งหมด** — เขียน state ที่ไม่มีจริง (`quote_sent`/`awaiting_payment`/`pending_team_review`) → throw `InvalidTransitionError` → **คืน 500 ใน production** | 🔴 Critical | ✅ | `routes/api/finance/quotes.js:222,299,345` → `transition-guard.js:37` → ค่าเหล่านี้ไม่อยู่ใน `ALLOWED_TRANSITIONS` |
| WF-F2 | route `auditor/reject-to-auditor` **สำเร็จไม่ได้เลย** — `AUDIT_PASSED→CAR_REVIEWING` ผิดกฎ → throw → 500 (test mock service ไว้จึงไม่จับ) | 🟠 High | ✅ | `routes/api/provider/auditor.js:164`; `ALLOWED_TRANSITIONS.AUDIT_PASSED={APPROVED}` เท่านั้น |
| WF-F3 | `CANCEL_EXPIRED` **orphan state** (0 inbound edge) + cron เขียน transition ผิดกฎเข้าไป; **ขัดกับ cron พี่น้อง**ที่เขียน `EXPIRED` (ถูกกฎ) → scenario เดียวกันไป 2 terminal | 🟠 High | ✅ | `routes/api/system/cron.js:233`, `workflow-transitions-handler.js:179` vs `jobs/revision-deadline-checker.js:170` |
| WF-F4 | **ไม่มี call site ใดเปิด `assertTransition`** + RBAC ใน writer เป็น dead code → ความถูกต้อง+role ของ ~15 entry point อยู่ใน inline logic แต่ละที่ ไม่ใช่ guard กลาง | 🟠 High | ✅ | `application-status-writer.js:195` เรียก `canTransition(from,to,{actorRole})` แต่ฟังก์ชัน arity=2 |
| WF-F5 | submit ทำ `DRAFT→PENDING_DOC_FEE` **ผิดกฎ** (ข้าม `SUBMITTED`) — ได้เพราะ writer ไม่ตรวจ; `SUBMITTED` เป็น phantom state | 🟡 Med | ✅ | `routes/api/applications/applications.js:572`; `canTransition('DRAFT','PENDING_DOC_FEE')===false` |
| WF-F6 | auditor decision handler **bypass state machine** + ออก `REJECTED` ไม่ได้ (MAJOR→CAR_PENDING ทำให้ edge `AUDIT_CONFIRMED→REJECTED` ที่มีในตารางเข้าไม่ถึงจาก UI หลัก) | 🟡 Med | ✅ | `routes/api/provider/handlers/auditor-audit-decision-handler.js:132-138`; `audit-onsite-service.js:650` |
| WF-F7 | **ไม่มี optimistic-lock/idempotency** → race double-advance; มี `version` column แต่ไม่ได้ใช้ (update `where:{id}` ล้วน ไม่มี `where:{id,status:fromStatus}`) | 🟡 Med | ✅ | `application-status-writer.js:209`; schema `application.prisma:260-261` |
| WF-F8 | transition จาก payment/onsite **ไม่ลง `workflowHistory`** (audit trail ไม่ครบ) — `DOC_FEE_PAID`/`AUDIT_FEE_PAID`/onsite PASS/FAIL หายจาก timeline | 🟡 Med | ✅ | `payment-slip-service.js:830,977`, `audit-onsite-service.js:774` |
| WF-F9 | **SoD:** auditor คนเดียวอนุมัติเอกสาร **และ** ผ่าน onsite ของใบเดียวกันได้ (ตั้งใจหลังรวม role แต่ควร business sign-off สำหรับงานรัฐ) | 🟢 Low | ✅ | `workflow-transition-service.js:218-219` |
| WF-F10 | resubmit ไม่เช็ค revision deadline ซ้ำ (cron reconcile ทีหลัง) — บังคับใช้ไม่สม่ำเสมอ | 🟢 Low | ⚠️ | `applications.js:510` vs `workflow-transitions-handler.js:219-228` |

---

## 3. แทร็ก 2 — Backend & API

**สถาปัตยกรรม:** coherent/mature — `routes/api/index.js` รวม ~90 sub-router แยกตามโดเมน, services layer thin-route, middleware chain ครบ (sanitize→helmet→CORS allowlist→rate-limit→CSRF→central error handler), auth pipeline เดียว (HEALTH/PROVIDER JWT แยก secret + JTI revocation + DB lookup + scope binding)

**AuthZ = จุดแข็งสุด:** สุ่ม 10 endpoint mutating อ่อนไหว → ทุกตัวมี authN + RBAC + **IDOR protection ที่ service layer ผูกกับ server-trusted id** ไม่เจอรูที่ขาด check

| ID | Finding | Sev | Conf | หลักฐาน |
|---|---|---|---|---|
| BE-T1 | **ออก certificate ไม่ atomic** — `POST /audits/:id/result` รัน `writeApplicationStatus(AUDIT_PASSED)` + `generateCertificate()` แยก ไม่มี `$transaction` ครอบ; rollback แบบ best-effort (โค้ดเองยอมรับว่าอาจล้ม→manual cleanup) = ช่อง partial-failure (status เป็น PASSED แต่ไม่มี cert) | 🟠 High | ✅ | `routes/api/audits.js:454-549` (0 `$transaction`) |
| BE-T2 | `generateCertificate` เขียน farm→plots→cert หลายสเต็ปไม่ atomic | 🟡 Med | ✅ | `certificate-service.js:77-260` |
| BE-V1 | **ไม่มี validation layer สม่ำเสมอ** — มี zod `validate` middleware แต่ใช้แค่ ~2/633 handler ที่เหลือ validate inline (`if(!x)return 400`) | 🟡 Med | ✅ | `middleware/validate.js` ถูก import 2 ไฟล์ |
| BE-E1 | error response shape ไม่สม่ำเสมอ — 114 ไฟล์ใช้ ad-hoc `res.status(500).json` (central handler มีแต่ถูก bypass); `safeErrorMessage` ช่วยกันรั่ว | 🟢 Low | ✅ | `server.js:345-358` vs 114 ไฟล์ |
| BE-C1 | dead code: `payment-webhook-service` (HMAC, timingSafeEqual) ครบแต่ **ไม่มี route mount** (เหลือจาก redesign slip-flow 2026-04-29) | 🟢 Low | ✅ | grep ไม่พบ webhook router |
| BE-A8 | admin override `/admin/applications/:id/status` ไม่ tenant-scope (โหลด by `{id}`) — by-design + flag-gated `ENABLE_PROVIDER_LEGACY_ALIAS` | 🟢 Low | ⚠️ | `admin/applications.js:185` |

---

## 4. แทร็ก 3 — Database / Data-Model

**สภาพ:** **drift-free + validated** — `prisma validate` ผ่าน, `migrate diff` ว่างทั้ง 2 ทาง (migrations↔schema, live-DB↔schema), FK constraint ใน DB (158) = `@relation` ใน schema (158); bug `journal_entries.invoiceId` ที่แก้ไป **ยืนยันหายจริง**; money types รวม `Decimal(15,2)`; identity FK (healthId→canonicalId) สมเหตุผล

| ID | Finding | Sev | Conf | หลักฐาน |
|---|---|---|---|---|
| DB-01 | **FK type-mismatch ตระกูลเดิมยังเหลือ** — `purchase_invoices.journalEntryId`(text)→`journal_entries.id`(uuid) ไม่มี FK (เพิ่ม FK ตอนนี้จะ fail) | 🟠 High | ✅ | DB pg_constraint=0 FK; `billing.prisma:1209` |
| DB-03 | **registry soft-delete drift จาก schema** — 7 model มี `isDeleted` แต่ไม่อยู่ใน `SOFT_DELETE_MODELS` (CreditNote, DebitNote, JournalEntry, Quotation, Entity, Organization, PurchaseInvoice) → query ไม่กรอง tombstone อัตโนมัติ → **เสี่ยงนับเอกสารการเงินที่ void ซ้ำในรายงาน** | 🟠 High | ✅ | `soft-delete-extension.js:44-76`; workaround เติม `isDeleted:false` รายจุด (`credit-note-service.js:622`) |
| DB-02 | mismatch ตัวที่สอง — `manual_journal_entry_drafts.postedJournalEntryId`(text)→journal_entries.id(uuid) | 🟡 Med | ✅ | `billing.prisma:1026` |
| DB-04 | registry tenant-inject drift — 11 model มี `organizationId` NOT NULL แต่ไม่อยู่ใน `TENANT_SCOPED_MODELS` → create ไม่ auto-inject + cross-tenant write-guard ไม่ทำงาน | 🟡 Med | ✅ | `tenant-prisma-extension.js:40-104` |
| DB-05 | **ไม่มี row-level read isolation** — `rls_observe_check()` คืน TRUE (no-op) + app role `gacp` เป็น superuser (bypass RLS); บาง table ไม่เปิด RLS | 🟡 Med | ✅ | staged ตาม ADR-014 Phase 3c — ไม่ใช่ regression |
| DB-06 | **18 FK column ไม่มี index** — `certificates.applicationId/farmId`, `harvest_batches.farmId/cycleId`, `planting_cycles.plotId` ฯลฯ → seq-scan ตอน join + ตอนเช็ค RESTRICT ลบ parent | 🟡 Med | ✅ | DB FK-vs-index query |
| DB-07 | delete semantics ลูก Farm ไม่สม่ำเสมอ — plots/site/training=CASCADE แต่ drying/curing=RESTRICT (โดย default ของ Prisma ไม่ได้ตั้งใจ) → ลบ farm ติด | 🟢 Low | ✅ | `harvest.prisma:94,124,153,183` |
| DB-08 | 55/158 relation ไม่ระบุ `onDelete` ชัด (default สมเหตุผลแต่ intent กำกวม) | 🟢 Low | ✅ | schema grep |
| DB-09 | status เป็น free-text String ไม่ใช่ enum (ทุก model) — intentional, บังคับที่ service | 🟢 Low | ✅ | `application.prisma:43` |

---

## 5. แทร็ก 4 — Frontend Features & Integration

**ภาพรวม:** **141 page routes, wire จริงเกือบทั้งหมด** — ไม่มี `const mock…`, ไม่มี stub `alert()`, ไม่มี TODO ในโค้ด → คำกล่าว "Production Ready (v3.0)" **ส่วนใหญ่เป็นจริง**

**Integration:** nginx route `/api/*` ตรงไป **backend:8000** (proxy `[...path]` เป็น dev fallback เท่านั้น); auth = httpOnly cookie หลัก + localStorage fallback; CSRF บังคับฝั่ง backend; entity-scoping ตรวจกับ `EntityMembership` (ไม่มี IDOR)
**Workflow sync ✅:** frontend `WORKFLOW_STATES` (21 ค่า) **ตรง 1:1 กับ backend canonical** เป๊ะ · double-submit guard ครบ · refetch หลัง mutation สม่ำเสมอ · loading/error/empty states ครบ

| ID | Finding | Sev | Conf | หลักฐาน |
|---|---|---|---|---|
| FE-F1 | **renewal payment ปิด** (`RENEWAL_PAYMENT_WIRED=false`) + backend endpoint ไม่มี → ต่ออายุจ่ายในแอปไม่ได้ (เปิดเผยใน UI, redirect ไป email DTAM) | 🟠 High* | ✅ | `health/applications/renewal/client-view.tsx:52,123-139` |
| FE-F2 | **cert-gate ใน Establishments ถูก bypass** — `setIsCertified(true)` hardcode → block "ยังไม่เปิดใช้งาน" ไม่เคย render → ทุกคนเห็น farm list ไม่ว่ามี cert หรือไม่ (access-control drift) | 🟡 Med | ✅ | `health/establishments/client-view.tsx:66-68,89-112` |
| FE-F3 | admin **certificate revocation = stub** ("out of scope R7-A") | 🟡 Med | ✅ | `admin/certificates/[id]/detail-view.tsx:384-400` |
| FE-F4 | subscription **paid checkout ยังไม่ live** (promo ให้ Premium ฟรีจนกว่าเปิด payment) | 🟡 Med | ✅ | `health/subscription/client-view.tsx:104-115` |
| FE-F5 | **dead legacy wizard subtree** — `new/hooks/use-application-form-store.ts` post ไป `/api/applications/submit` ที่ไม่ active (live ใช้ `_steps/`); 2 submit path | 🟢 Low | ✅ | `_steps/layout.tsx:7,13` |
| FE-F6 | sub-feature ปิด: scheduler CSV export (toast no-op), audit per-doc comment (`disabled`), per-plant tracking — labeled ชัด | 🟢 Low | ✅ | `provider/scheduler/queue/client-view.tsx:213-216` ฯลฯ |
| FE-F8 | route dev `/test` ("UI Kit Test Page") หลุดมาใน route tree prod | 🟢 Low | ✅ | `app/test/page.tsx` |
| FE-F9/F10 | proxy ไม่ forward `x-csrf-token`/`x-active-entity-id`; `set-cookie` route เชื่อ token จาก client — **dev-only** (prod nginx bypass proxy นี้) | ⚪ Info | ✅ | `[...path]/route.ts:20-45` |

---

## 6. แทร็ก 5 — UX/UI & Accessibility

**จุดแข็ง (verified):** design-token system จริง (HSL CSS-vars + ESLint `gacp/no-raw-color`=**error** + lint-ratchet) · **Thai-first** (`<html lang="th">`, ฟอนต์ Sarabun มาตรฐานราชการ, dict TH/EN parity-tested) · a11y foundations จริง (skip link ไทย, `:focus-visible`, `prefers-reduced-motion`, Radix modal focus-trap, `primitives/input.tsx` ทำ `useId`/`aria-invalid`/`role="alert"` เป็นแบบอย่าง) · UX scaffolding ดี (empty/error/skeleton, ConfirmDialog กัน iOS PWA, wizard stepper mobile+desktop)

| ID | Finding | Sev | Conf | หลักฐาน |
|---|---|---|---|---|
| UX-A11Y-2 | **safety-net a11y เป็น advisory ไม่บังคับ** — "UX/UI Baseline Gate" จริงๆ คือ static scanner 3 เช็ค; axe-core (`@axe-core/playwright` WCAG 2.1 AA) มีจริงแต่ job `continue-on-error:true` + เช็คแค่ critical/serious | 🟠 High | ✅ | `scripts/ci/check-ui-a11y-baseline.js`; `ci.yml:671`; `a11y-fixtures.ts:136-144` |
| UX-A11Y-1 | **form มี 2 ระบบ** — legacy `form-input.tsx`/`form-controls.tsx` ไม่มี label association (`htmlFor`) + error ไม่มี `role="alert"`/`aria-invalid` (primitive ใหม่ทำถูก) → SR ได้ field ไม่มี label + error เงียบ | 🟠 High | ✅ | `components/ui/form-input.tsx:21,36,57` vs `primitives/input.tsx:13-80` |
| UX-A11Y-3/4 | wizard progress stepper เป็น `<div>` ล้วน (ไม่มี `aria-current`/`progressbar`); custom `Menu` ไม่มี `aria-haspopup`/`aria-expanded`/arrow-nav | 🟡 Med | ✅ | `wizard-progress-stepper.tsx:64-98`; `overlays.tsx:86-97` |
| UX-I18N-1 | ปนไทย-อังกฤษในหน้า **trace สาธารณะ** (ผู้บริโภคสแกนเห็น "Scan ID:", "Verified on") + admin | 🟡 Med | ✅ | `trace/[qr-code]/client-view.tsx:407`; `admin/planting/[id]/page.tsx:190` |
| UX-CONTRAST-1 | gold token `--secondary:43 45% 55%` + white fg + status text บน tint 12% อาจ fail WCAG AA | 🟡 Med | ⚠️ | `styles/globals.css:15,447` — คำนวณ ratio แบบ static ไม่ได้ |
| UX-UX-1 | ยังใช้ `window.confirm()` 9 จุดสำหรับ destructive (เสี่ยงข้อมูลหายบน iOS PWA ทั้งที่มี `ConfirmDialog`) | 🟡 Med | ✅ | grep + `confirm-dialog.tsx:8-17` |
| UX-I18N-2 | พ.ศ./ค.ศ. ไม่สม่ำเสมอ — cert ใช้ `+543` แต่ planting ใช้ `toLocaleDateString('th-TH')` (ค.ศ. ใน Node ICU) | 🟡 Med | ⚠️ | `Footer.tsx:38` vs `admin/planting/page.tsx:143` |
| UX-I18N-3/HTML-1/DS-1 | i18n 2 ระบบ (ตัวนึง dead) · nested `<p>` ผิด HTML · 6 CSS files + Mantine palette ค้าง + dual button layer | 🟢 Low | ✅ | `lib/i18n.ts` (0 importer); `admin/planting/[id]/page.tsx:190-191` |
| UX-RESP-1 | modal บางตัว fixed-width เกินจอมือถือ (`w-[920px]`) — เกษตรกร mobile-first | 🟢 Low | ⚠️ | `create-draft-modal.tsx:189` |

---

## 7. แทร็ก 6 — System / Deployment Architecture *(ผู้ตรวจทำเอง)*

- **Monorepo (pnpm):** `apps/{backend,web-app,mobile-app,public}` + `packages/validation`; web-app = thin BFF → backend Express เป็น data authority เดียว
- **Deployment (production-grade):** 6 compose variants + **blue-green** (zero-downtime) + monitoring stack แยก; prod stack = nginx + backend + frontend + postgres + redis + **MinIO** (object storage) + **Prometheus/Grafana/Loki/Promtail/cAdvisor/node-exporter**; ทุก port bind `127.0.0.1` (host nginx fronts public) ✅; images จาก ghcr.io; pre/post-deploy SQL checks + logrotate
- **External integrations:** ThaID/MOPH identity · payment (phase+webhook+slip+bank-reconciliation) · notification (email template + SMS thaibulksms/twilio + fanout + PDPA breach) · **certificate RFC3161 timestamp** (digicert/globalsign = e-signature มีผลทางกฎหมาย) · google calendar/meet (นัด onsite) · verify URL `dtam.moph.go.th/verify/`
- **Observability in-code:** `metrics-service`, structured `production-logger`, `/metrics` + `/health/ready`
- **ข้อสังเกต:** infra/integration **เกินมาตรฐาน "ระบบรับรอง" ทั่วไป** — เป็น platform เต็มรูป (สอดคล้องกับระบบบัญชี TFRS ใน `AUDIT-REPORT.md`) — scope เป็น product decision

---

## 8. Prioritized Remediation Backlog (impact × effort)

| ลำดับ | Finding | Impact | Effort | เหตุผล |
|---|---|---|---|---|
| 1 | **WF-F1** quotes flow 500 | สูง (พังใน prod) | ต่ำ | map ค่า state เก่า→canonical หรือลบ flow ที่ตายแล้ว |
| 2 | **BE-T1** cert issuance ไม่ atomic | สูง (crown-jewel op) | กลาง | ครอบ status-flip + generateCertificate + farm-activate ใน `$transaction` เดียว |
| 3 | **WF-F4 + WF-F7** writer ไม่ guard + ไม่มี optimistic lock | สูง (root cause + race) | กลาง | ทำ `writeApplicationStatus` เป็น guard จริง + `where:{id,status:fromStatus}` + ใช้ `version` |
| 4 | **DB-03** soft-delete registry drift | สูง (รายงานการเงินนับซ้ำ) | ต่ำ | sync `SOFT_DELETE_MODELS` จาก schema (หรือ generate อัตโนมัติ) |
| 5 | **WF-F3** illegal terminal + cron ขัดกัน | สูง | ต่ำ | รวม 2 cron + ทำ `CANCEL_EXPIRED` ให้มี edge ถูกกฎ (หรือใช้ `EXPIRED`) |
| 6 | **WF-F2/F6** dead reject route + ออก REJECTED ไม่ได้ | กลาง-สูง | ต่ำ | แก้ edge + เพิ่ม mapping MAJOR/outright→REJECTED |
| 7 | **FE-F2** establishments cert-gate bypass | กลาง (access-control) | ต่ำมาก | ลบ `setIsCertified(true)` hardcode |
| 8 | **DB-01/DB-02** FK mismatch (0 rows) | กลาง | ต่ำ | เปลี่ยนคอลัมน์เป็น `@db.Uuid` + เพิ่ม FK ตอนนี้ที่ตารางว่าง |
| 9 | **DB-06** 18 FK ไม่มี index | กลาง (perf) | ต่ำ | เพิ่ม `@@index` |
| 10 | **UX-A11Y-2/1** a11y ไม่บังคับ + form 2 ระบบ | กลาง (ภาระ a11y รัฐ) | กลาง | เอา `continue-on-error` ออก + ย้าย legacy form → `primitives/*` |
| 11 | **BE-V1** validation 2/633 | กลาง | กลาง | ทยอยใช้ zod `validate` กับ mutating endpoint |
| 12 | **WF-F8** audit trail ไม่ครบ · **UX-I18N-1/2** · **FE-F5/F8** dead code/test route | ต่ำ-กลาง | ต่ำ | เก็บกวาด consistency |

---

## 9. Verified Strengths (เพื่อความเป็นธรรม)
- State-machine **นิยามหลักถูกต้อง**: payment gating ข้ามไม่ได้, terminal/loop ถูก, frontend states ตรง backend 1:1
- **AuthZ ชั้นเยี่ยม**: 10/10 sensitive endpoint มี authN+RBAC+IDOR ที่ service layer ผูก server-trusted id
- **Schema drift-free + validated**, FK=relations, money `Decimal(15,2)`, transaction ใช้แพร่หลายในการเงิน
- **Frontend จริงทั้ง 141 routes** (ไม่มี mock/stub), double-submit/refetch/error-state มีวินัย
- **Thai-first + design-token + a11y foundations + observability + blue-green deploy** ระดับ production จริง

## 10. "ตรวจไม่ได้" (ต้องการเพิ่ม)
- **WCAG contrast ratio จริง** (UX-CONTRAST-1) — ต้อง render + วัด ไม่ใช่ static
- **Playwright e2e/visual จริง** — ไม่ได้รัน browser ในเครื่อง (แต่ E2E gate บน CI เขียว)
- **Mobile (Flutter) runtime** — ไม่มี Flutter SDK (ดู MOB-* ใน `AUDIT-REPORT.md`)
- **พฤติกรรมจริงใต้ load** (race WF-F7) — พิสูจน์เชิงโครงสร้าง ยังไม่ได้ stress-test

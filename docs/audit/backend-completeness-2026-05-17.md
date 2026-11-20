# การตรวจสอบความพร้อมของระบบ Backend — GACP Platform
**วันที่:** 17 พฤษภาคม 2566  
**ขอบเขต:** Services (165 ไฟล์) + Routes (169 ไฟล์) + Cron (1 ไฟล์) + Prisma models (18 schema)

---

## 1. สรุป TODO / FIXME / STUB Markers
**ทั้งหมด:** 13 markers ที่สำคัญ

### Critical (4)
- **email-transport.js:91** `TODO(ops-smtp-wiring)` — STUB nodemailer. SMTP credentials deferred. Blocks email notifications in production.
- **sms-transport.js:90** `TODO(ops-sms-wiring)` — STUB ThaiBulkSMS API. Blocks SMS in production.
- **notification-fanout-service.js:67** `TODO(multi-instance)` — In-memory dedupe store. Must promote to Redis for multi-instance deployments.
- **receipt-numbering-service.js:83** `TODO(B16-A)` — Fallback counters still in use. `prisma.receiptSequence` not yet wired.

### High (3)
- **credit-note-service.js:694** `TODO(B20-B journal owner)` — Missing journal entry recording for credit notes.
- **debit-note-service.js:570** `TODO(B20-B journal owner)` — Missing journal entry recording for debit notes.
- **credit-notes.js:17** `TODO: wire PDF template` — Credit note PDF rendering incomplete.

### Medium (6)
- **wht-service.js** — Intentional STUB. Records ทบ.50 ทวิ but no auto-withholding, no ภ.ง.ด.53 pipeline.
- **signature-service.js:23** — RSA key management requires real secrets provisioning.
- **bank-account-service.js** — PromptPay QR generation needs real bank credentials.
- **receipt-auto-sign-service.js:109,245** — References to B17 and B16-A columns deferred.
- **refund-service.js:167** — Schema refinement deferred (Invoice.refundStatus).
- **renewal-reminder-cron.js** — Script exists but NOT scheduled anywhere.

---

## 2. Known Stub Services Status

| Service | Status | What's Missing | Owner Ticket |
|---------|--------|-----------------|--------------|
| **email-transport.js** | STUB | SMTP wiring (nodemailer/SES/SendGrid) | ops-smtp-wiring |
| **sms-transport.js** | STUB | ThaiBulkSMS / Twilio API | ops-sms-wiring |
| **wht-service.js** | PARTIAL STUB | Auto-withholding (3%), ภ.ง.ด.53 pipeline | Owner: "optional for v1" |
| **signature-service.js** | PARTIAL STUB | RSA key provisioning (KMS or local keystore) | RSA keys not in secrets |
| **bank-account-service.js** | FUNCTIONAL | PromptPay QR needs real bank data | Bank accounts not configured |
| **google-meet-service.js** | FALLBACK | Placeholder links when API not configured | Not critical for MVP |

---

## 3. Routes Audit (169 ไฟล์)

**สถานะ:** Mostly complete; 2 endpoints marked TODO.

### Incomplete/TODO Endpoints
1. `finance/credit-notes.js` — GET `/:id/pdf` marked TODO (PDF template not wired)
2. `finance/wht.js` — GET `/report` exists but ภ.ง.ด.53 export missing

### Route Files by Category (ครบถ้วน)
- `admin/` (7 files) — ครบถ้วน
- `applications/` (14 files) — ครบถ้วน
- `finance/` (4 files) — 1 incomplete (credit-notes PDF)
- `provider/` (12 files) — ครบถ้วน
- `audit/` (2 files) — ครบถ้วน
- `system/` (3 files) — ครบถ้วน

---

## 4. Prisma Model Usage

### Orphan / Low-Usage Models
| Model | Usage Count | Status | Action |
|-------|------------|--------|--------|
| **JournalEntry** | 1-2 | Created Iter 16-A, used but incomplete | Awaiting credit-note/debit-note journal hooks |
| **JournalLine** | 1-2 | Paired with JournalEntry | Depends on journal-entry-service completion |
| **CreditNote** | ~5 | Functional; journal integration pending | Add recordCreditNoteEntry hook |
| **DebitNote** | ~5 | Functional; journal integration pending | Add recordDebitNoteEntry hook |
| **Quote / Quotation** | ~8 | Used by quotations route | Active |
| **ReceiptSequence** | 0 (STUB) | Defined but fallback counters still active | Migrate to Prisma queries (B16-A) |
| **IssuerBankAccount** | ~3 | Used by bank-account-service | Active; needs real data |
| **PeriodClose** | 0 | Defined; never queried | Orphan (accounting module pending) |
| **PurchaseInvoice** | 0 | Defined; never queried | Orphan (not yet implemented) |
| **ManualJournalEntryDraft** | 0 | Defined; never queried | Orphan (manual JE module pending) |

---

## 5. Cron Jobs

| Job | Location | Scheduled? | Cadence | Status |
|-----|----------|-----------|---------|--------|
| **renewal-reminder-cron.js** | `apps/backend/cron/` | ❌ NO | Suggested 02:00 UTC (09:00 ICT) | Ready but not scheduled |

**Action:** Wire into supervisord, k8s CronJob, or `jobs/scheduler.js` for daily renewal notifications.

---

## 6. ช่องว่างหลัก 10 อันดับ (ลำดับลำดับความสำคัญ)

| ลำดับ | ช่องว่าง | ระดับ | ผลกระทบ | Iteration |
|------|----------|------|---------|-----------|
| 1 | SMTP wiring (nodemailer/SES) | Critical | All email → logs only (no production notifications) | T+1 |
| 2 | ThaiBulkSMS / Twilio API | Critical | All SMS → logs only (no production SMS) | T+1 |
| 3 | In-memory dedupe → Redis | Critical | Single-instance only; multi-instance dedupe fails | T+2 |
| 4 | Journal entry hooks (CN/DN) | High | Credit/debit notes not reflected in trial balance | T+1 |
| 5 | Credit note PDF template | High | Frontend can list CN but cannot export/print | T+1 |
| 6 | Receipt sequence (Prisma) | High | Fallback counters fragile; no DB guarantee | T+1 |
| 7 | RSA key provisioning | Medium | Signatures work but dev passphrase hardcoded in secrets | T+2 |
| 8 | Schedule renewal-reminder cron | Medium | Cron script exists but never fires | T+1 |
| 9 | Bank account real data | Medium | PromptPay QR templates render but no actual accounts | T+2 |
| 10 | Accounting module (Period Close, Manual JE) | Low | Orphan schemas; no backend logic yet | T+3+ |

---

## 7. Estimate: Critical + High ปิดให้หมด

**การคำนวณ:**
- **Critical (4):** SMTP (2-3 days) + SMS (1-2 days) + Redis dedupe (2-3 days) = 5–8 days
- **High (3):** CN/DN journal (1–2 days) + PDF (1–2 days) + Receipt sequence (0.5–1 day) = 2.5–5 days

**Parallel Iteration Strategy:**
- **T+1 (2 weeks):** SMTP, SMS, CN/DN journal hooks, receipt sequence, cron scheduling (5 parallel streams)
- **T+2 (1 week):** Redis dedupe, RSA provisioning, bank account real data (3 parallel streams)
- **T+3+ (backlog):** Accounting module (Period Close, Manual JE, Purchase Invoice)

**รวม:** 3 iterations (6 weeks) to production-ready, assuming 2-person team, 80% velocity.

---

## 8. Risk Assessment

### Red Flags
1. **Email/SMS stub in production:** Applicant notifications completely silent. Critical for UX + compliance.
2. **In-memory dedupe:** Scales to 1 instance only. Multi-region deployments will duplicate messages.
3. **Manual receipt counters:** Race conditions + no DB guarantee if two instances collide.
4. **ProviderBank account stub:** Payment instructions blank if no real bank setup.

### Green Lights
- Routes structure solid (169 files, 2 minor TODOs).
- Prisma models well-designed (18 schemas, good normalization).
- Cron script ready (just needs scheduling).
- Journal entry layer functional (awaiting CN/DN hooks).

---

**สรุป:** Backend ~85% ready for production. Critical path: ops-smtp + ops-sms + dedupe-redis. Can deploy internal-testing with email/SMS stubbed; must close before launch.

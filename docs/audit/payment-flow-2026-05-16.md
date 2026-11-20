> ## ⚠️ เอกสารนี้บันทึกโมเดลที่เลิกใช้แล้ว (ปักป้าย 2026-09-05)
>
> ตัวเลขค่าธรรมเนียมและจุดยืนทางภาษีในเอกสารนี้เป็นของสูตรก่อน W14 (VAT คิดเฉพาะส่วนแพลตฟอร์ม)
> ปัจจุบัน: **ผู้ออกเอกสารรายเดียว · VAT 7% บนค่าบริการทั้งก้อน · งวด 1 = 5,885 · งวด 2 = 29,425**
> เก็บไว้อ่านเป็นบันทึกประวัติ · ความจริงปัจจุบัน: `apps/backend/services/fee-service.js`

# Payment Flow Audit — 2026-05-16

> Backend cleanup audit: the platform shifted FROM payment-gateway
> auto-verify (webhook callback) TO slip-upload with manual finance
> verification on 2026-04-29 (RFC `2026-04-29-rfc-payment-slip-flow.md`, deleted 2026-10-06: the slip flow no longer exists).
> This document records the post-shift state of the codebase, the
> files marked `@deprecated` in this pass, and the deferred work that
> blocks deletion.

## 1. Current canonical flow (text diagram)

```
1. Applicant submits application
   DRAFT → SUBMITTED → PENDING_DOC_FEE

2. POST /api/payments/create  (auth: HEALTH)
   → routes/api/finance/payments.js::router.post('/create')
   → services/payment-service.js::createPhase1Payment
   → services/payment-service-phase-flow.js::createPhase1Payment
   Effects:
     - prisma.application.update({ status: 'PAYMENT_PHASE_1', phase1Status: 'PROCESSING' })
     - prisma.paymentTransaction.create({ gateway: 'BANK_TRANSFER', status: 'PENDING' })
     - (invoice-service may create an Invoice in 'pending' state)

3. Applicant fetches active bank account
   GET /api/payments/bank-accounts/active  (auth: HEALTH, masked)
   → routes/api/finance/bank-accounts.js
   → utils/promptpay-qr.js (renders TLV-encoded QR payload)

4. Applicant transfers + uploads slip
   POST /api/payments/slip/upload  (auth: HEALTH, multipart)
   → routes/api/finance/payment-slips.js
   → services/payment-slip-service.js::recordSlipUpload
   Effects:
     - prisma.paymentSlip.create({ status: 'PENDING_REVIEW' })
     - prisma.application.update({ status: 'PHASE_1_SLIP_UNDER_REVIEW' })
     - attachmentService.attach({ resModel: 'PaymentSlip' })  // dual-write
     - slipNotifications.notifySlipUploaded (fire-and-forget)

5a. Finance approves slip
    POST /api/payments/slip/:id/approve  (auth: ACCOUNT/ADMIN)
    → services/payment-slip-service.js::approveSlip
    Effects:
      - prisma.paymentSlip.update({ status: 'APPROVED', reviewedBy, reviewedAt })
      - prisma.invoice.update({ status: 'paid', paidAt: now, paymentMethod: 'BANK_TRANSFER' })
      - writeApplicationStatus({ to: 'DOC_FEE_PAID', phase1Status: 'PAID' })
      - invoice-service.issueReceipt (async, non-fatal)
      - slipNotifications.notifySlipApproved

5b. Finance rejects slip
    POST /api/payments/slip/:id/reject  (auth: ACCOUNT/ADMIN, reason required)
    → services/payment-slip-service.js::rejectSlip
    Effects:
      - prisma.paymentSlip.update({ status: 'REJECTED', reviewNote })
      - writeApplicationStatus({ to: 'PENDING_DOC_FEE', phase1Status: 'PENDING' })
      - slipNotifications.notifySlipRejected
    (Applicant re-uploads — prior slip becomes SUPERSEDED.)

6. Document review proceeds (out of scope for this audit)
   DOC_FEE_PAID → ASSIGNED_FOR_REVIEW → DOC_APPROVED → PENDING_AUDIT_FEE

7. Phase 2 mirrors Phase 1 with PENDING_AUDIT_FEE / PHASE_2_SLIP_UNDER_REVIEW /
   AUDIT_FEE_PAID transitions and PHASE_2_TOTAL = 27,675 THB.
```

State-machine source-of-truth: `services/workflow-transition-service.js`
(VALID_TRANSITIONS map lines ~167-177).

## 2. Verification: slip-flow is the only PENDING → PAID path

| Concern | Finding |
|---------|---------|
| Routes that mount `/payments/webhook` | None. Grep `router.(post\|get).*webhook` across `apps/backend/routes/` → 0 matches. |
| Production callers of `handleWebhook` | None. Grep across `apps/backend/**/*.js` excluding tests → 0 matches outside the service files themselves. |
| Files that flip `application.phase1Status = 'PAID'` | Only `services/payment-slip-service.js::approveSlip` (PHASE_STATE_TRANSITIONS.approve) and `services/payment-service.js::syncPhaseStatusesFromInvoices` (reconciliation from Invoice.status). The deprecated `payment-service-webhook-flow.js::handlePaymentSuccess` would also flip it, but no route reaches it. |
| Files that write `invoice.status = 'paid'` | Only `services/payment-slip-service.js::approveSlip`. |
| `PaymentTransaction.gateway` values written by code | Only `'BANK_TRANSFER'` (2 occurrences in `payment-service-phase-flow.js`). |

## 3. Files modified in this pass (deprecation headers, not deletions)

| File | Change |
|------|--------|
| `apps/backend/services/payment-service-webhook-flow.js` | Added `@deprecated 2026-05-16` module-level JSDoc above `createWebhookFlow`. Cites RFC + audit doc + removal blocker (FIN-04..09 UAT tests). |
| `apps/backend/services/payment-webhook-service.js` | Rewrote module-level JSDoc to clarify MIXED status: utility helpers (`generateApplicationNumber`, `generateSecureIdFragment`, `asArray`, `buildWorkflowEvent`, `hashPayload`, `logWebhookAudit`) are still active in the slip-flow path; only `verifyWebhookSignature` is deprecated. Tagged the function itself with `@deprecated` JSDoc. |
| `apps/backend/services/payment-service-phase-flow.js` | (a) Annotated `require('./payment-service-webhook-flow')` import with the rationale for keeping it (test back-compat). (b) Replaced the dangling `* Handle payment webhook from gateway` comment block with an explicit `@deprecated 2026-05-16` JSDoc on the `createWebhookFlow({...})` destructure. |
| `apps/backend/services/payment-service.js` | Added `@deprecated 2026-05-16` JSDoc to `verifyWebhookSignature`. Reorganized `module.exports` into a clearly-labelled canonical block + a deprecated-webhook block with a removal-path comment. |
| `apps/backend/services/payment-legacy-service.js` | Replaced the file header with a `@deprecated 2026-05-16` block that distinguishes the (truly dead) `PaymentService` class from the (still-used) notification re-exports, and notes the removal path. |
| `apps/backend/services/PAYMENT_SERVICES_README.md` | Full rewrite. Old README still described gateway flow ("User pays → webhook → payment-webhook-service.js"). New README describes the slip-flow canonical path, distinguishes canonical vs deprecated files, and documents the `gateway` field value mapping (`BANK_TRANSFER` only). |

## 4. Files NOT modified — clarified as "looks legacy but is alive"

| File | Why it stays as-is |
|------|--------------------|
| `apps/backend/utils/promptpay-qr.js` | Generates the TLV-encoded QR payload that goes on the bank-account "pay here" screen the applicant sees before uploading a slip. Imported by `routes/api/finance/bank-accounts.js`. Not gateway code. |
| `apps/backend/config/business-rules.js` (`PAYMENT.GATEWAY_PROVIDER: 'MOCK_PROMPTPAY'`) | Read by `payment-constants.js` → `CONFIG.gateway.provider`. Currently informational only (no code branches on it). Cleanup deferred — touching `business-rules.js` cascades into multiple unrelated tests. |
| `apps/backend/services/payment-webhook-service.js` (the file itself) | The non-deprecated helpers (ID generators, audit-log writer, workflow-event builder) are imported by the canonical phase-flow. Splitting them out into a new `payment-utils.js` file is deferred to keep this audit minimal-diff. |
| `apps/backend/middleware/audit-logger.js` ("PAYMENT_GATEWAY" actor ID inside `logWebhookAudit`) | The string `'PAYMENT_GATEWAY'` is written as the `actorId` of a webhook-originated audit row. Since the writer itself is deprecated, the constant follows. Not touched. |

## 5. Tests that exercise deprecated code (deferred work — blockers for deletion)

| Test | What it asserts |
|------|-----------------|
| `apps/backend/__tests__/unit/finance-uat-fin04-09.test.js` (FIN-04, FIN-05) | Webhook idempotency, invalid-signature rejection, missing-invoiceId rejection, DOC_FEE_PAID transition through `createWebhookFlow.handleWebhook`. |
| `apps/backend/__tests__/unit/payment-service.test.js` | `handleWebhook` unmatched-invoice handling, `handlePaymentSuccess` Phase 1 success transition, `handlePaymentFailure` Phase 2 failure path. |
| `apps/backend/__tests__/integration/phase-amount-canonical.test.js` | Mocks `verifyWebhookSignature` when constructing the phase-flow but only exercises `createPhase1Payment`. **Not a blocker** — the mock is just dependency injection. |

**Removal plan**: rewrite FIN-04..FIN-09 + payment-service.test.js to
exercise the slip-flow equivalents (slip idempotency, slip rejection,
slip approval → DOC_FEE_PAID). Once those tests no longer import the
deprecated handlers, the webhook-flow file and the
`verifyWebhookSignature` / `handleWebhook` exports can be deleted.
Estimated 2-4 hours of test work.

## 6. `gateway` field value mapping

`PaymentTransaction.gateway` is a free-form `String` column. Historical
values in production data may include legacy provider names; current
code only writes one value.

| Value | Producer (code path) | Flow type |
|-------|----------------------|-----------|
| `BANK_TRANSFER` | `payment-service-phase-flow.js::createPhase1Payment` / `createPhase2Payment` | Slip-upload, manual verify (CANONICAL as of 2026-04-29) |
| `STRIPE` / `PROMPTPAY` / `TRUEMONEY` / `OMISE` / `2C2P` / `KASIKORN` | None — no code currently writes these | Historical / never-deployed gateway integrations. Schema comment on `billing.prisma:256` mentions STRIPE/PROMPTPAY/TRUEMONEY as examples; that comment is stale and should be tightened in the next schema-migration pass. |

## 7. Orchestrator decisions still needed

- **Test rewrite scope**: should FIN-04..FIN-09 be rewritten in this
  sprint to unblock deletion of `payment-service-webhook-flow.js`, or
  deferred to a dedicated test-modernization PR? This audit pass left
  the file in place because rewriting 200+ lines of UAT mocks is out of
  scope for a cleanup pass.
- **Schema comment**: the `gateway String // STRIPE, PROMPTPAY, ...`
  comment in `prisma/schema/billing.prisma:256` is misleading. Updating
  it requires a no-op Prisma migration. Defer to next billing-schema
  PR.
- **Reconciliation use case**: bank-statement ingest may legitimately
  reuse the webhook-flow's idempotency + race-guard primitives. If
  that's on the roadmap within 60 days, deletion should be deferred; if
  not, delete after the test rewrite.

## 8. Out-of-scope (per audit boundary)

Not touched in this pass — file boundaries protected by the audit
brief:

- `apps/web-app/**` (frontend)
- `apps/backend/services/pdf/**` (B15-C, receipt generation)
- `apps/backend/services/accounting-service.js` (B15-C)
- `apps/backend/services/audit-trail*.js` (B15-D)
- `apps/backend/services/application-status-writer.js` (read-only)
- `apps/backend/services/application-service/application-review-revision-methods.js`

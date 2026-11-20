# Payment Audit Evidence Contract — 2026-05-16

**Owner**: B15-B (audit-evidence cluster)
**Status**: ratified; tests at `apps/backend/__tests__/unit/{slip-hash-integrity,audit-trail,bank-reconciliation-service}.test.js`
**Legal basis**:
- Thai Electronic Transactions Act B.E. 2544 §12 / §26 (integrity of electronic evidence)
- Thai Electronic Transactions Act B.E. 2544 §31 (traceability of payment-record disclosures)
- ISO 27799:2016 §7.10.2 (cryptographic integrity controls)
- ISO 27799:2016 §7.10.4 (audit log integrity verification on read)
- Revenue Department guideline RDc 16/2553 §3 (reconciliation against bank ledger per accounting period)

## 1. Required audit events per payment lifecycle

The hash-chained `AuditLog` table (see `apps/backend/prisma/schema/audit.prisma`) is the canonical evidence store. Every payment-related state change MUST emit a row. The write path is `middleware/audit-logger.js` (`auditLogger.log` for fire-and-forget, `auditLogger.logWithin(event, tx)` for transactional binding).

| Lifecycle stage          | Action                                  | Category | Resource                                | Severity   | Actor role     |
|--------------------------|-----------------------------------------|----------|-----------------------------------------|------------|----------------|
| Applicant uploads slip   | `PAYMENT_SLIP_UPLOADED`                 | PAYMENT  | resourceType=PAYMENT, resourceId=slipId | INFO       | HEALTH         |
| Finance views file       | `PAYMENT_SLIP_FILE_VIEWED`              | PAYMENT  | resourceType=PAYMENT, resourceId=slipId | INFO       | ACCOUNT/ADMIN  |
| Finance approves slip    | `PAYMENT_SLIP_APPROVED`                 | PAYMENT  | resourceType=PAYMENT, resourceId=slipId | INFO       | ACCOUNT/ADMIN  |
| Finance rejects slip     | `PAYMENT_SLIP_REJECTED`                 | PAYMENT  | resourceType=PAYMENT, resourceId=slipId | WARNING    | ACCOUNT/ADMIN  |
| Reconciliation export    | `PAYMENT_RECONCILIATION_EXPORTED`       | PAYMENT  | resourceType=PAYMENT, resourceId=BANK_RECONCILIATION | INFO | ACCOUNT/AUDITOR/ADMIN |
| Hash mismatch detected   | `PAYMENT_SLIP_HASH_MISMATCH_DETECTED`   | PAYMENT  | resourceType=PAYMENT, resourceId=BANK_RECONCILIATION | CRITICAL | (whoever ran the report) |

Every event MUST carry `metadata.applicationId` (when applicable) so `audit-trail-service.getPaymentAuditTrail(applicationId)` can stitch the cross-resource trail back together for DTAM inspection.

### Wiring status (verified 2026-05-16)

`apps/backend/routes/api/finance/payment-slips.js` emits all four slip-lifecycle events via the local `logSlipEvent(req, action, severity, payload)` helper. `apps/backend/routes/api/finance/reconciliation.js` (new in B15-B) emits the reconciliation + hash-mismatch events. No additional wiring is required in the route layer.

## 2. Slip file integrity contract

**Module**: `apps/backend/services/slip-hash-integrity.js`
**Hash**: SHA-256, hex-encoded lowercase (RFC 6234)
**Storage**: `Attachment.fileHash` on the polymorphic Attachment row dual-written by `payment-slip-service.recordSlipUpload` (Wave A Phase 33). The slip-flow service already accepts a `fileHash` argument and propagates it to `attachmentService.attach`; once the upload route invokes `slipHashIntegrity.computeBufferHash(file.buffer)` and passes it through, every new slip will have its hash recorded.

**Three verification outcomes** (consumed by the reconciliation report):

| Status              | Meaning                                                                                          | Action by finance/auditor                                       |
|---------------------|--------------------------------------------------------------------------------------------------|-----------------------------------------------------------------|
| `MATCH`             | Stored hash equals recomputed hash. Pass.                                                        | None.                                                           |
| `MISMATCH`          | Stored hash differs from recomputed hash. Possible tampering.                                    | Escalate per ISO 27799 §7.10.4; CRITICAL audit event auto-fires.|
| `HASH_NOT_RECORDED` | `Attachment.fileHash` is null — uploaded before B15-B hash computation wiring.                   | Surfaced in monthly report; integrity guarantee starts after this date for newly-uploaded slips. |
| `FILE_NOT_FOUND`    | Hash recorded but file missing on disk/storage. Likely a storage-migration gap.                  | Escalate to storage-ops; row excluded from "verified" count.    |

The reconciliation route logs every `MISMATCH` outcome as a `PAYMENT_SLIP_HASH_MISMATCH_DETECTED` event at CRITICAL severity — the event itself is hash-chained, so the tamper detection is itself tamper-evident.

## 3. Bank reconciliation report

**Service**: `apps/backend/services/bank-reconciliation-service.js`
**Method**: `generateReconciliationReport({ startDate, endDate, accountId, organizationId, verifyHashes, limit })`
**Route**: `GET /api/finance/reconciliation?from=YYYY-MM-DD&to=YYYY-MM-DD[&accountId=&format=json|csv]`
**Role guard**: ACCOUNT, AUDITOR, ADMIN (org-scoped)

### Sample CSV (fake data)

```
date,invoiceNumber,receiptNumber,applicationNumber,applicantName,amount,amountVerifiedBaht,slipReference,paymentMethod,slipHash,integrity
2026-05-12T09:14:23.000Z,INV-2026-001,RC-2026-001,GACP-2026-001,Somchai Nakorn,5535,5535,KTB20260512091400123,BANK_TRANSFER,b8c0...d3a9,MATCH
2026-05-14T11:02:51.000Z,INV-2026-002,RC-2026-002,GACP-2026-002,"Suda, Limpinij",27675,27675,SCB20260514110100456,BANK_TRANSFER,f12b...8e07,MATCH
```

The header columns mirror the bank's monthly statement export so finance can paste both into Excel and diff with `VLOOKUP` on `slipReference`. `slipHash` lets DTAM spot-verify slip images against archive copies without re-fetching the file.

## 4. Hash-chain verification process

Each `AuditLog` row carries:
- `sequenceNumber` (globally unique, monotonically increasing per tenant)
- `previousHash` (currentHash of the prior row, or `'GENESIS'` for the first)
- `currentHash` (SHA-256 of a deterministic JSON projection: `{ logId, sequenceNumber, category, action, actorId, resourceType, resourceId, timestamp }` plus the `previousHash`)

Two verification surfaces exist:

1. **Full-history verify** (audit-logger.verifyChain, used by ops scripts):
   - Walks every row, recomputes each `currentHash` from raw fields, and asserts the chain is unbroken.
   - Reports both `LINK_MISMATCH` (broken previousHash pointer) and `HASH_MISMATCH` (forged currentHash).

2. **Read-time verify** (audit-trail.getPaymentAuditTrail, used by finance dashboard + DTAM inspection):
   - Fetches the trail for one application, sorted by `sequenceNumber asc`.
   - Calls `verifyHashChain(rows)` which asserts intra-window link continuity.
   - Returns `{ events, chain: { verified, breaks: [...] } }`. Events are returned **even when the chain is broken** — the broken row is forensic evidence and must not be hidden.

DTAM inspectors run the read-time check against any application of interest. A break triggers a follow-up forensic dump of the surrounding rows via `audit-trail.listAuditEvents(...)`.

## 5. WHT (Withholding Tax) status

Per `apps/backend/config/invoice-issuers.js` Tier 9, WHT is intentionally not implemented for the current rollout. To keep this audit contract forward-compatible with the corporate-customer billing rollout:

- Every row in `getPaymentAuditTrail()` response carries `withholdingTaxApplicable: false`.
- Every row in the reconciliation report carries `withholdingTaxApplicable: false`.
- A top-level `withholdingTaxApplicable: false` is also stamped on the trail response shape.

When WHT is implemented:
1. A new audit action `WHT_CERTIFICATE_ISSUED` is added to `PAYMENT_AUDIT_ACTIONS`.
2. The `withholdingTaxApplicable` flag flips per-event based on the applicant's tax registration state.
3. Historical rows continue to read `false`, which is the legally accurate value for the pre-WHT period.

No retroactive re-keying is required.

## 6. File inventory (touched in this work)

| File                                                                                  | Action  |
|---------------------------------------------------------------------------------------|---------|
| `apps/backend/services/slip-hash-integrity.js`                                        | created |
| `apps/backend/services/bank-reconciliation-service.js`                                | created |
| `apps/backend/routes/api/finance/reconciliation.js`                                   | created |
| `apps/backend/routes/api/index.js`                                                    | edited (mount) |
| `apps/backend/services/audit-trail.js`                                                | edited (added `getPaymentAuditTrail`, `verifyHashChain`, `PAYMENT_AUDIT_ACTIONS`) |
| `apps/backend/__tests__/unit/slip-hash-integrity.test.js`                             | created |
| `apps/backend/__tests__/unit/bank-reconciliation-service.test.js`                     | created |
| `apps/backend/__tests__/unit/audit-trail.test.js`                                     | edited (added `getPaymentAuditTrail` + `verifyHashChain` cases) |
| `docs/audit/payment-audit-evidence-2026-05-16.md`                                     | created (this file) |

## 7. Out of scope for B15-B (handed off to other clusters)

- **B15-A (payment-flow)**: wire `slipHashIntegrity.computeBufferHash(file.buffer)` into the slip-upload route handler at `apps/backend/routes/api/finance/payment-slips.js:165` so newly uploaded slips populate `Attachment.fileHash` from day one. The hash field is already accepted by `payment-slip-service.recordSlipUpload`; it just needs the value at the route boundary.
- **B15-C (PDF + accounting)**: receipt-PDF generation already emits a `RECEIPT_ISSUED` event via `invoice-service.issueReceipt`; verified in `apps/backend/__tests__/unit/invoice-service.test.js`.
- **DBA**: no schema migration is required for this work. The `Attachment.fileHash` column already exists (`apps/backend/prisma/schema/attachment.prisma:56`). The GIN index on `AuditLog.metadata` (`apps/backend/prisma/schema/audit.prisma:52`) is what powers the JSON-path lookup in `getPaymentAuditTrail`; already in place.

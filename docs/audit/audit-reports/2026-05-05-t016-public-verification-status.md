# T-016 Public Verification & QR Resolution — Status — 2026-05-05

Audit pass for **T-016 — Consolidate backend public verification, trust,
and QR-resolution contracts** (master-audit-implementation-action-plan.md).

This document inventories the public verification surface, surfaces the
real consolidation gaps, and explicitly marks what requires sign-off
before code changes can land. Touching public API contracts requires a
deprecation window + client communication, so this audit is doc-only —
no code changes proposed in this PR.

## Subtask 1 — Choose canonical public truth source

### Certificate-verification surfaces (4 distinct route families)

| Route | Mount | Rate-limit | Payload shape | Code (`?code=`) check |
|---|---|---:|---|---|
| `GET /api/certificates/verify/:certificateNumber` | `routes/api/certificates/certificates.js:248` | ❌ none | `{success, valid, data: {certificateNumber, siteName, plantType, issuedDate, expiryDate, status}}` | ❌ |
| `GET /api/public/verify/:certificateNumber` | `routes/api/auth/public.js:47` | ✅ `publicVerifyLimiter` | `{success, verified, valid, data: {status, reason, ...}}` | ✅ |
| `GET /api/public/verify/:certificateNumber/page` | `routes/api/auth/public.js:135` | ❌ | HTML page render | — |
| `GET /api/interoperability/v1/certificates/:certificateNumber/verify` | `routes/api/integration/interoperability.js:111` | (unknown — needs check) | shared helper `sendCertificateVerificationResult(certificate, res)` | ❌ |
| `GET /api/interoperability/v1/verification/certificate/:certificateNumber` | line 122 | same | same shared helper | ❌ |
| `GET /api/interoperability/v1/verification?certificateNumber=...` | line 133 | same | same shared helper | ❌ |
| `GET /api/interoperability/v1/certificates/:certificateNumber/signed-envelope` | line 151 | same | adds RSA-signed envelope wrapper | ❌ |

Notes:
- The 3 interop `v1` endpoints **already** consolidate through
  `fetchCertificateByLookup()` + `sendCertificateVerificationResult()`.
  No drift between them within that namespace.
- The split is between the 3 cross-namespace surfaces:
  `/api/certificates/verify`, `/api/public/verify`, and the interop
  `v1` family.
- **`/api/certificates/verify/:certificateNumber` is the most concerning**
  — no rate-limit, no `?code=` validation, simpler payload that
  **does not match** the canonical public-verify response shape from
  `/api/public/verify`. A consumer that hits this endpoint instead
  of `/api/public/verify` gets less data and no enumeration
  protection.

### Recommendation (subtask 1) — needs sign-off

Make `/api/public/verify/:certificateNumber` the canonical public surface.
Treat the other two:

- `/api/certificates/verify/:certificateNumber` — deprecate; redirect to
  the canonical surface OR alias the handler to the canonical one
  (matches PR #258 pattern for `/api/admin/*` legacy alias). Operator
  must verify no production consumers call this directly.
- `/api/interoperability/v1/...` — keep as the **official integration
  audience** (signed envelopes, machine-to-machine). Document its
  divergence as intentional, not consolidation drift.

Why this needs sign-off:
- Removing or aliasing `/api/certificates/verify/*` is a public API
  change. Mobile / external partner clients may depend on the current
  response shape.
- Need a deprecation window (90+ days for govt-grade integration) and
  comms before redirect lands.

## Subtask 2 — Align field mapping + lookup semantics

### Trace surfaces (4 distinct route families)

| Route | Purpose | Service |
|---|---|---|
| `GET /api/trace/plot-cycle/:qrCode` | plot-cycle QR resolution | `resolveTraceByPlotCycleQr()` |
| `GET /api/trace/:qrCode` | generic QR resolution | `resolve-generic.js` |
| `GET /api/trace/:qrCode/qr` | QR-code metadata | inline |
| `GET /api/trace/plant/:qrCode` | plant species lookup | inline |
| `GET /api/trace/verify/:entityType/:entityId` | integrity record + scan log | `qrcodeService.recordTraceScan` |

Notes:
- The trace-service has **been refactored** into `services/trace-service/{queries,common,resolve-plot-cycle,resolve-generic}.js`
  during earlier waves. Substring matching has been replaced with
  qrCode-table lookups (per `20260213103000_add_trace_qr_security`
  migration that introduced the `traceQrSecurity` table with unique
  qrCode + publicUrl, ratcheted in `20260306200000` to enforce the
  uniqueness audit fix).
- The `findFirst`-based ambiguous lookups the original audit cited
  appear to be retired — substring queries now go through the
  unique qrCode column.

### Recommendation (subtask 2)

No further field-mapping consolidation work appears to be needed.
The earlier session work + `20260306200000` unique-constraint
migration closed the ambiguous-lookup gap. **Substantially complete.**

## Subtask 3 — Quarantine ambiguous-lookup compatibility paths

The trace-service refactor (visible in
`services/trace-service/queries.js`) already moved away from
`findFirst({ where: { qrCode: { contains: ... } } })`-style
ambiguous matching. Today's queries use the unique
`traceQrSecurity.qrCode` column directly.

**Recommendation: substantially complete.** A targeted code review
sweep would still be useful to confirm no straggler `contains`-based
lookups remain in service files, but that's a small follow-up audit
rather than a structural consolidation task.

## Summary

- Subtask 1 (canonical truth source for certs): 🟡 inventory complete; consolidation needs API-deprecation sign-off
- Subtask 2 (field mapping for trace): ✅ substantially complete via earlier refactor + unique constraint migration
- Subtask 3 (quarantine ambiguous lookups): ✅ substantially complete (trace-service refactored)

T-016's main remaining work is the **`/api/certificates/verify/*`
deprecation decision** — public API contract change requiring
operator + product-owner sign-off on the deprecation window. No
code changes recommended in this PR.

## What's safe to take next without sign-off

- Add a contract verification test asserting `sendCertificateVerificationResult`
  payload shape stays stable (lock the canonical interop surface)
- Add a regression test for `traceQrSecurity.qrCode` uniqueness behavior

These are additive (test-only) and would land in a T-019 follow-up rather than as T-016 changes.

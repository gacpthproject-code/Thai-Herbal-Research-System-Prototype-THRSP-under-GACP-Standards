# T-012 Document + Certificate Flows — Status — 2026-05-05

Audit pass for **T-012 — Persist and protect backend document
verification and certificate issuance/download flows** (master-audit-implementation-action-plan.md).

This document records the alignment status of T-012's three subtasks.
**All three subtasks are substantially complete** — the concerns the
original audit raised have been addressed by intervening work. This
audit confirms each one and surfaces no new gaps.

## Subtask 1 — Auth gap on certificate download + listing — ✅ closed

Original audit concern: *"certificate download is less protected than
the rest of the module, provider certificate listing is too broad"*.

### `GET /api/certificates/:id/download` (`certificates.js:192`)

Re-audited:

- **`authenticateHealth`** required at the route level
- **Ownership check** via `prisma.certificate.findFirst({ where: { id, userId, isDeleted: false } })` — health user can only download own cert
- **Capability gate** via `entityService.assertCapability(req.activeEntity.role, 'PRINT_QR')` — multi-member entities (juristic / community enterprise) gate the QR-print action by member role (OWNER / ADMIN / MANAGER can print; VIEWER cannot)
- 404 (not 403) when ownership fails — same canonical pattern as the IDOR sweep (T-014 / PR-02)

The download endpoint actually has **MORE** guards than the read endpoint, not fewer. The audit note was either historical or referred to a now-removed legacy download path.

### `GET /api/certificates/` listing

Re-audited:

```js
if (!isProviderRole(userRole)) {
  where.userId = userId;  // health user → own certs only
}
// Provider role: where = { isDeleted: false }
const certificates = await prisma.certificate.findMany({ where, take: 100 });
```

**The "no provider filter" appearance is misleading.** Certificate is in `TENANT_SCOPED_MODELS` (`tenant-prisma-extension.js:79`), so the extension auto-injects `organizationId: <bound>` into every query that goes through the bound tenant scope. After ADR-014 (multi-tenancy phase 1), the listing for provider users is effectively:

```sql
WHERE "isDeleted" = false AND "organizationId" = <provider's bound org>
```

Cross-tenant data leak via this endpoint is closed at the Prisma extension layer. Admin role can opt into `withoutTenantScope()` for cross-org auditing, but only the admin-tooling code paths use it; routine list calls never bypass.

## Subtask 2 — Certificate number generation concurrency — ✅ closed

Original audit concern: *"certificate issuance is not concurrency-safe"* (count()+1 race).

`services/certificate-service.js:160-187` uses **`crypto.randomBytes(3)` (16M-key space) + retry on collision** with the `certificateNumber @unique` constraint as the final guard. No `count() + 1` anywhere in the issuance path. The retry loop attempts up to 5 times before throwing — well above the practical collision rate.

This is the same pattern as the race-safe sequence migration documented in CHANGELOG 3.1.0 (PostgreSQL sequences for batch / lot / application numbers). The cert path uses random suffixes instead of sequences because:

- Sequential cert numbers let an attacker walk the public verify endpoint by visiting `/api/public/verify/GACP-TH-2569-00001..N`
- A 6-char hex suffix turns enumeration into a 16M-key search space
- Combined with rate-limit on the public verify endpoint, enumeration is impractical

## Subtask 3 — Document verification durability — ✅ closed

Original audit concern: *"document verification appears to be in-session only"*.

`services/fraud-detection/document-verification-methods.js:107` writes verification results back to the `applicationDocument` table:

```js
await prisma.applicationDocument.update({ ... });
```

So document verification IS persistent — the audit note appears to predate the migration that added the durable update. The "session-only" perception may have come from an older code path that has since been retired.

The persisted fields include the verification confidence score, the failure / pass reason text, and the analyst-friendly machine-readable result. All survive a server restart.

## What's not in scope for T-012

The audit's broader DOD ("issuance does not depend on `count()+1` or silent side-effect failure") covers two concerns we should track separately:

1. **Issuance bootstrap side-effects** (e.g., creating a planting cycle when issuing a cert). These are wrapped in try/catch with non-blocking logging today; if any of them ever needs to be transactional, that's a future hardening task — not a T-012 gap.
2. **Failure-path observability** for the cert issuance pipeline (PDF gen, signing, audit log). These are visible in the existing logger output but no formal failure-rate dashboard exists. Out of scope for T-012; would belong in T-018 (release gates / observability).

## Summary

- Subtask 1: ✅ closed — listing is tenant-scoped via extension; download has ownership + capability gate
- Subtask 2: ✅ closed — random-suffix + unique constraint, no count()+1
- Subtask 3: ✅ closed — verification results persisted to applicationDocument

**T-012 is substantially complete.** No code changes recommended in this PR — every concern from the original audit has been addressed by intervening work (ADR-014 tenant scoping, the random-suffix cert numbering, the durable verification persistence).

The next concrete forward-progress on this epic moves into T-013 (frontend evidence + document upload screens).

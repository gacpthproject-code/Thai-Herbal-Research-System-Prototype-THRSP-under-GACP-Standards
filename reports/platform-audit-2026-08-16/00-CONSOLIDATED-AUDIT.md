# Platform Audit — Consolidated & Ranked (2026-08-16)

> Read-only adversarial audit, 6 parallel fresh-context agents, one per area. **Nothing was changed.** Every finding cites file:line in the per-area report. This file ranks all findings and proposes a fix order — it does not fix anything.

## Verdict

The platform has the **shape** of a GACP seed-to-sale certification system, but its load-bearing pillars — verified identity, tenant isolation, sealed traceability, evidence-gated certification, a working money path — are **stubs, dead links, or bypassed**. The recurring pattern across all six areas is **"claims without backing"** — the exact failure GOALS.md's North Star ("every claim machine-proven") was written to fight. **Not ready for the 50-farm pilot.**

The good news: GOALS.md already anticipated much of this, and the settlement-resilience mission (merged today) proves the team has a working method — design → RED → build → adversarial review → evidence — to fix pillars one at a time.

## Source reports (full file:line evidence)
- `reports/platform-audit-2026-08-16/01-auth-identity.md`
- `reports/platform-audit-2026-08-16/02-farm-qr-seedtosale.md`
- `reports/role-workflow-auditor/2026-08-16-role-tools-audit.md`
- `reports/platform-audit-2026-08-16/04-eight-systems-flows.md`
- `reports/legacy-sweeper/2026-08-16-dead-code-inventory.md`
- `reports/platform-audit-2026-08-16/07-docs-cleanup.md`

**Honesty caveat:** these are agent-produced, evidence-cited findings. Before FIXING any one, verify it (as the settlement review loop did) — items marked **PENDING** need a live/DB check; items marked **(logical)** are reasoned, not demonstrated live. The severity ranking is the coordinator's synthesis; a human should sanity-check the top Criticals.

## The 8 systems (derived — no doc enumerates them)
Identity & Access · Application Workflow · Billing & Payment · Document Review · Scheduling & Audit/Inspection · Certification & Public Verify · Cultivation & Traceability · Notification & Platform-Admin/Reporting.
Status: **Billing = BROKEN**, **Scheduling/Audit = BROKEN**, Cultivation/Certification/Workflow = **PARTIAL (severe)**, Identity/Document-Review/Notification = functional-with-gaps.

## Master ranked findings

### CRITICAL — makes the product fraudulent / loses money / breaks isolation
| ID | Finding | Evidence | GOALS |
|---|---|---|---|
| C1 | **A certificate can PASS with ZERO evidence** — a phantom Prisma model crashes checklist submission and silently disables the minimum-evidence gate; onsite-inspection screen also unreachable | report 04 (Scheduling/Audit) | integrity / G2 |
| C2 | **Tenant isolation effectively absent** — RLS = `SELECT TRUE` on users +48 tables; the Prisma extension skips `findUnique/update/delete` and **fails open** when orgId is unresolved | 01 + 03 (migrations/20260502060000:39-50, tenant-prisma-extension.js) | G2 |
| C3 | **Identity is not verified** — หมอพร้อม has no backend adapter (throws AUTH_PROVIDER_NO_ADAPTER); ThaID code is real but gated on 7 absent gov credentials; the only working login is a self-typed 13-digit ID + password, checksum-only | 01 (idp-adapter.js:32-45, prisma-auth-service.js:73-109) | identity |
| C4 | **Billing broken 4 ways** — (a) no payment UI/confirm step (F-GATEWAY-UI); (b) amount-mismatch settlements capture cash then vanish from every retry path; (c) mock payment adapter not gated by environment; (d) DTAM remittance is a one-way door | report 04 (Billing) | G1 |
| C5 | **Cert issuance fabricates a fake harvest batch** that receives a real public QR | 02 + 04 | integrity |
| C6 (PENDING) | PDPA AES-256-GCM for `healthId`/`providerId` is opt-in, **defaults false** in both compose files, yet the manual claims "LIVE prod" → PII possibly plaintext at rest | 01 (prisma-pdpa-extension.js:868 vs manual 01) | needs live check |

### HIGH
| ID | Finding | Evidence |
|---|---|---|
| H1 | Farm-level QR = **dead link** (`/verify/farm/:id`, route absent) | farm-service.js:357 |
| H2 | Per-plant QR **never cryptographically sealed** (0 `registerTraceIntegrity(PLANT_UNIT)`) — contradicts the platform's own manual | report 02 |
| H3 | HarvestBatch weights self-declared, editable after creation, never re-signed → QR integrity is a stale snapshot | harvest-service.js:13-20,130-145 |
| H4 | Public trace hardcodes `"Raw Material (GACP)"` regardless of cert validity; batch creation has no cert check | trace-batch-lot-routes.js:116,156 |
| H5 | The only functional login never checks the national ID against any government source | prisma-auth-service.js:73-109 |
| H6 | ThaID account-linking-by-national-ID → silent account-takeover vector (logical) | thaid-identity-service.js:132-145 |
| H7 | platform_admin: two disagreeing admin gates (require-admin blocks it; role-middleware bypass lets it in elsewhere) | role-middleware.js:40-42 |
| H8 | `admin/applications.js:122-151` has no org filter — relies wholly on the RLS backstop that fails open | report 03 |
| H9 | Application renewal broken 3 independent ways (incl. a fabricated invoice total shown to the applicant) | report 04 |
| H10 | 3 status hops bypass the audited writer; the ESLint guard built to catch exactly that is blind to it | report 04 |
| H11 | `CERTIFIED` has no real production trigger, yet a dashboard counts by it | report 04 |
| H12 | A real, audit-safe revoke endpoint is orphaned behind a stub admin dialog | report 04 |
| H13 | Public certificate-enumeration oracle | report 04 |
| H14 | Cultivation plot-entry step 404s (repeat of an already-"fixed" bug) | report 04 |
| H15 | A DB outage on public trace renders as "counterfeit" (dangerous false-negative) | report 04 |
| H17 | **Slip path is 100% live and the ONLY mobile payment rail** (mobile has zero Stripe code); no `SLIP_UPLOAD_ENABLED` cutoff flag exists → "slip is draining, Stripe is the rail" is not true in practice; drain-complete structurally can't reach 0 | report 06 |

### MEDIUM
| ID | Finding | Evidence |
|---|---|---|
| M1 (PENDING) | Default lookup hash is unkeyed SHA-256 (brute-forceable); keyed HMAC exists but dormant by default | prisma-auth-service.js:301-309 |
| M2 | account_dtam/account_platform: role-middleware presets predate the Tier-16 split → 403 both split roles; finance/quotes.js dead-from-FE + mis-gated | report 03 |
| M3 | Stale doc says admin issues certificates; code moved that to auditor auto-issue on AUDIT_PASSED | report 03 |
| M4 | auditor owns S2 doc-review edges AND the full S4-S6 chain — no maker-checker ruling on that combination | report 03 |
| M5 | `GET /api/audit` reads an in-memory array, not the real Prisma audit log (dead tool) | audit.js:23-25 |
| M6 | Fee defined in 5 places (real bug: FE 30,000 vs API 15,000) | GOALS.md:18,32 |

### Docs (bloat + false claims) — report 07
- 614 tracked docs; **every navigation file is broken** (README links non-existent files).
- **False production claims:** `docs/contract/evidence/README.md` ("ระบบจริง gacpth.com production ✅ LIVE") + root README ("Production Ready v3.0") — no production exists (GOALS.md confirms).
- A single 2026-05-16 "Ralph Loop" burst produced 61 files self-describing "FINAL/production" — the false-narrative source.
- `PAYMENT_SERVICES_README.md` (slip-canonical) contradicts the Stripe direction.
- **Recommended minimal doc set (8):** README(fixed) → PRODUCT → DEVELOPMENT-GUIDE → architecture(01 + system-map) → workflow-state-machine → USER-MANUAL → GOALS → CLAUDE/HARNESS.

### Dead code (flag-only — DELETE NOTHING; operator approves) — report 06
~400 lines PENDING operator: `requirePermission` (23) · dead payment enums (70) · `status-machine`+`transition-guard` chain (71) · 4 always-501 analytics routes (130, needs product sign-off) · Flutter legacy stubs · `PAYMENT_WEBHOOK_SECRET` boot-secret (Tier C, operator-only). **Slip path is NOT dead — do not remove (see H17).**

## Five cross-cutting themes (the roots)
1. **Identity is not verified** (C3, H5, H6) — the root of trust has no root.
2. **Tenant isolation is a stub** (C2, H7, H8) — RLS = SELECT TRUE + fail-open extension.
3. **Certification can be empty or fabricated** (C1, C5, H11, H12) — the core product isn't integrity-gated.
4. **The money path is broken beyond reliability** (C4, H17, M6) — the settlement-resilience mission fixed *reliability of settle*; correctness (UI, mobile rail, mismatch-cash, remittance, fee SSOT) is still open.
5. **Trace isn't sealed + the narrative is false** (H1-H4, C5, docs D2-D3) — QR/weights mutable; docs claim a production that doesn't exist.

## Proposed fix order (map to GOALS G0→G3; "fraudulent-if-unfixed" first)
1. **Certification integrity** (C1, C5) — a cert platform that issues empty/fabricated certs has no product. *Verify the phantom-model + fake-batch findings first, then design the evidence-gate + issuance fix.* [integrity]
2. **Tenant isolation — real RLS** (C2, H8) — GOALS G2 already mandates "decide RLS in 1 week." [G2]
3. **Money correctness** (C4, H17, M6) — amount-mismatch cash-vanish, mock-adapter env-gate, mobile-slip vs Stripe reality, fee SSOT. [G1]
4. **Identity** (C3, H5, H6) — decide honestly: label "unverified / ThaID pending gov creds," or build verification. [identity]
5. **Traceability sealing** (H1-H4) — seal per-plant QR, fix farm QR route, mass-balance. [seed-to-sale]
6. **Docs honesty pass** (D1-D4) — remove false production claims, cut to the 8-file set. GOALS G3 already lists this. [G3]
7. **Dead-code sweep** (flag-only → operator-approved removal). [cleanup]

Each line above is its own mission: **design → plan → build → adversarial review → evidence**, Tier per `tier-check`, operator merges money/auth/schema.

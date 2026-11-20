# GACP API — Tech-Lead Master Report (Phase 3)

**Date:** 2026-06-04
**Mission A** (infra verify, gate) → **PASSED**
**Mission B** (carpet-bomb every endpoint) → **COMPLETE with caveats**
**Overall verdict:** 🟡 **AMBER** — infra critical = OK, but coverage gate (tested == N) **NOT fully met** (92 endpoints observed only via canonical twin, 1 genuinely unobserved), and **real defects found** (136 × HTTP 500, 27 × validation/not-found gaps).

---

## (A) Infrastructure — expected vs found

Verified live on the production host `43.134.175.51` (`lhins-mtr0y9cx`) against the Phase-0 manifest derived from `docker-compose.production.yml`, `package.json`, Prisma schema, and `.env.production.example`.

| Component | Expected | Found | Status |
|---|---|---|---|
| Prod containers | 13, restart-policy always | 13 Up, restart count 0 | ✅ |
| Node | 20.x (node:20-alpine) | v20.20.2 | ✅ |
| pnpm | 8.15.0 | 8.15.0 | ✅ |
| PostgreSQL | 15 | 15.18 | ✅ |
| Prisma migrations | all applied | **79/79 applied**, DB connected | ✅ |
| Edge → backend | host-nginx → :8080 | `nginx -t` OK, 80/443 TLS, proxy valid | ✅ |
| Required env vars | 23 names present, non-empty | 23/23 PRESENT-NONEMPTY (values never read) | ✅ |
| Env file perms | restricted | `600`, root-owned | ✅ |
| Public ports | only 80/443 | only 80/443; nothing else public | ✅ |

**Benign drift (no action):** prometheus bound loopback `127.0.0.1:9090` (not in manifest); host swap = 0; my own `gacp-test-*` QA scaffold present (isolated, capped, untouched — torn down post-test).

→ **Critical infra: OK.** Endpoint testing authorized.

---

## (B) Endpoints — results

Carpet-bombed against the **isolated** `gacp-test` stack (same backend image `deploy-production-latest`, separate DB/Redis/MinIO, `127.0.0.1:18000`), mutation-safe (bogus UUIDs only, no real data touched).

### Coverage reconciliation (hard gate)

| Metric | Count |
|---|---|
| Endpoints in inventory (N) | **1,077** |
| Endpoints processed by workflow | 1,077 |
| Distinct `method+path` that produced rows | **1,069** |
| — directly observed (real status seen) | **976** |
| — **observed only via 429 (rate-limit-masked)** | **93** |
| Test rows total | 3,148 |
| PASS / FAIL | **2,490 / 658** |

**Gate `tested == N` is NOT cleanly met. Honest accounting:**
- **8 endpoints** in the inventory collapsed to duplicate `method+path` keys in the result set (trailing-slash / dual-slice labeling) — processed but not distinctly represented.
- **93 endpoints** (the entire `/api/v1/*` alias slice, tested last) returned **only HTTP 429** from the global IP rate limiter (`express-rate-limit` 1000 req / 15 min, keyed by `127.0.0.1`, no dev-skip — `server.js:183-190`). The limiter saturated under concurrent QA slices, so **no real endpoint behavior was observable** for these.
  - **92 of 93** are `/api/v1/X` dual-mount aliases whose canonical `/api/X` twin **was** directly observed (identical router/handler) → behavior is **known by equivalence**, not by direct test.
  - **1** is genuinely unobserved with no observed twin: `GET /api/v1/interoperability/v1/trace/events/farm/:id`.

> Per the reachability rule, those 93 are reported **UNREACHABLE (rate-limited)**, **not PASS**. To close the gate cleanly they must be re-run with the global limiter disabled in the test env (or with inter-request delay / per-slice IP). This is a **test-harness limitation, not a product defect.**

### Failure breakdown (658 FAIL rows)

| Actual status | Count | Interpretation |
|---|---|---|
| **429** | 293 | Rate-limiter saturation — **test artifact**, not endpoint behavior |
| **500** | 136 | 🔴 **Real server errors** — see below |
| **404** | 147 | Mostly expectation/inventory mismatches (route genuinely absent or auth-gated) — not security bypass |
| **401** | 30 | Inventory labeled route "public" but server requires auth — **fail-closed**, benign; inventory mislabels |
| **403** | 15 | Scope/role mismatch — fail-closed |
| **200/201** | 27 | 🟠 **Validation / not-found gaps** — see below |
| **501** | 8 | Analytics endpoints **not implemented** (`/api/analytics/{geography,performance,trends}/*`) |
| **400** | 2 | Minor expectation mismatch |

---

### 🔴 Priority 1 — HTTP 500 server errors (91 distinct endpoints, 136 rows)

These return **500 where they should return 404 (not-found) or 400/422 (bad input)** — missing existence guards and missing input validation, surfacing raw exceptions. By cause:

- **`not-found → 500` (56 rows):** handler does a DB/relation operation on a bogus id with no pre-existence check; the DB/ORM throws and is not caught. Affects: `application-bundles`, `applications/bundles`, `audits/{fraud,site-analysis}`, `fraud-detection`, `site-analyses`, `training-records/farm/*`, `invoices/:id/receipt*`, `provider/directory/:id`, `templates/:id`, `system-config/:id`, `plants/:id`.
- **`bad-types → 500` (34 rows):** no type validation; wrong-typed body reaches DB/logic and throws. Affects: `criteria`, `quotes`, `templates`, `audits/schedule`, `audits/site-analysis`, `config/document-slots/validate`, `consumer-feedback`, `e2e/*`, `auth/health/me` (PATCH), `post-audit/tasks`.
- **`boundary → 500` (23), `missing-fields → 500` (11), `happy-get → 500` (12).**
- **Confirmed earlier & corroborated here:** `GET /api/application-bundles/my` and `/api/applications/bundles/my` → **500 on happy path** (the known `userId` column bug in `application-bundles.js`).

Full list: `test-reports/api-500-endpoints.txt`. All 658 fail rows: `test-reports/api-failures.csv`.

**Repro (no auth needed to trigger the 500 class — bad-types example):**
```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://gacpth.com/api/quotes/ \
  -H 'Authorization: Bearer <provider-token>' \
  -H 'Content-Type: application/json' \
  -d '{"serviceType":12345,"areaRai":"not-a-number"}'   # → 500 (expected 400/422)
```
**Suspected root cause:** handlers lack a validation layer (Zod/Joi/express-validator) and lack `try/catch → 404` on `findUniqueOrThrow`-style calls. Systematic, not one-off.

---

### 🟠 Priority 2 — validation / not-found masking (27 rows, 200/201 when an error was due)

Two sub-classes:

1. **Validation bypass (wrong types accepted, 200):** `POST /api/{,v1/}validation/land-check` & `/applications/validate/land-check` (non-numeric lat/lng → `parseFloat`→`NaN`→bounds-false→`valid:true`, `validation.js:31-40`); `validate/pre-submission`; `config/document-slots/validate`; `pricing/calculate`; `interoperability/v1/signatures/verify` (non-string signature); `provider/certificates/bulk-notify`.
   - **One is a state mutation:** `POST /api/v1/provider/directory` **created a record with a 5000-char email (201)** — no length bound. Should be rejected.
2. **Soft not-found (200 + empty/`valid:false` instead of 404):** public verify endpoints `certificates/verify/:n`, `interoperability/v1/.../verify`, `trace/:id/qr` (generates a QR for any string), `templates/:code/versions`, `consumer-feedback/:certId`; idempotent deletes with no existence check (`applications/draft`, `draft-documents`, `consent/:cat`).
   - Soft-not-found leaks no data but masks errors from clients; the QR/verify cases could mislead consumers.

---

### 🟡 Priority 3 — not-implemented & inventory mismatches

- **501 Not Implemented (8):** `/api/analytics/geography/certification-rate`, `/performance/overview`, `/trends/applications`, `/trends/plant-types` (+ their `/v1` twins). Stubs — decide implement vs remove from inventory.
- **401/403 where inventory said "public" (45):** server fail-closes (correct, safe). The **inventory** is wrong for these (`audits/stats`, `audit/` alias, `revision-deadline/:id`, `lots/*`, `interoperability/v1/trust/{registry,revocations}`, `consent/bulk`, `sync/offline`). Action: correct the inventory's auth column, not the server.
- **404 on no-auth/bad-auth (94):** route genuinely not mounted in this build (e.g. `/api/admin/*` requires `ENABLE_PROVIDER_LEGACY_ALIAS=true`); 404 is correct, not a bypass.

---

### Already-fixed (separate from this run)

- **`authenticateAny` missing DB enrichment** → 403 "Health healthId is required" on `/health/dashboard`, payments, entities for all health users. Root-caused, fixed, verified. **PR `fix/authenticate-any-healthid` open, awaiting deploy decision.**

---

## Spot re-verification (zero-failure-slice guard)

Slices with 0 failures were re-checked: the `/api/accounting/*` and most `GET` happy/auth slices passed legitimately (200 with token, 401 without) — re-confirmed on 3 random endpoints, consistent. No silently-skipped slice.

## Verdict

🟡 **AMBER — NOT GREEN.** Green requires `(infra critical = OK) AND (tested == N) AND (every PASS has evidence)`.
- infra critical = **OK** ✅
- tested == N → **NO** (93 rate-limit-masked; 8 dedup gap) ❌
- every PASS has evidence → **YES** for the 976 directly observed ✅

**Required to reach GREEN:** (1) re-run the 93 `/api/v1/*` endpoints with the global rate-limiter disabled in the test env; (2) fix the 91 endpoints emitting 500 (add input validation + existence-guard/`try-catch→404`); (3) decide on the 8 × 501 analytics stubs; (4) correct the inventory's auth labels for the 45 fail-closed routes.

## Artifacts
- `test-reports/api-inventory.{md,json}` — 1,077 endpoints (Phase 1)
- `test-reports/api-failures.csv` — all 658 fail rows
- `test-reports/api-500-endpoints.txt` — 91 distinct 500-emitting endpoints, grouped by router

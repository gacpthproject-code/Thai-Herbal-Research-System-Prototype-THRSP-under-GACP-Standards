## layer2-L1 — every plot is born with a code — 2026-08-24

Status: DONE(probe:jest __tests__/unit/plot-code-extension.test.js) — 12/12 pass, output below.

### Every path that creates a Plot row (grep `plot.create|createMany|upsert|createManyAndReturn`, plus raw `INSERT INTO "plots"`, whole repo minus node_modules)

| # | Path | Client | Covered now? |
|---|---|---|---|
| 1 | `services/planting-service.js:656` `createPlotForFarm` ← `routes/api/cultivation/plots.js:77` POST `/farms/:farmId/plots` | shared extended (`services/prisma-database.js`) | yes |
| 2 | `services/application-service/application-submission-methods.js:83` `tx.plot.createMany` ← wizard submission, inside `prisma.$transaction` | shared extended, tx client | yes |
| 3 | `services/certificate-service.js:796` `client.plot.create` ← `ensurePlotsForFarm` at issuance (`client` defaults to the shared one; a tx client when auto-issue passes one) | shared extended | yes |
| 4 | `prisma/seed-gacp.js:523` `prisma.plot.upsert` (2 ERP dev plots) | **bare `new PrismaClient()` at seed-gacp.js:48 — no extensions** | **no — see below** |
| — | `__tests__/unit/n-plus-one-batching.test.js:225`, `farm-entityid-stamp.test.js:82`, `certificate-service-evidence-gate.test.js:99` | jest mocks, not real writes | n/a |

No nested `plots: { create: … }` writes exist in production code, and no raw SQL inserts into `plots` outside the migrations. Web-app (`apps/web-app`) never writes plots — it calls the backend.

Path 2 proves extensions reach transaction clients without needing a database: `tx.farm.create` at application-submission-methods.js:54 omits `organizationId`, which is `String` with no default (`prisma/schema/farm.prisma:97`). Wizard submissions succeed in production, so the tenant extension must be injecting inside the `$transaction` callback. The Prisma 5.22 runtime agrees — `_createItxClient` builds the tx client from `this._appliedParent._createItxClient(n)` (`node_modules/@prisma/client/runtime/library.js`).

### The choice: a Prisma extension on the shared client

`services/plot-code-extension.js` (new), wired at `services/prisma-database.js:120-133`. Rejected alternatives, with reasons, are in that file's header:
- **Per-call-site minting** — correct the day it is written, wrong the first time somebody adds a fourth route. The property wanted is "a Plot row cannot exist without a code", not "these three call sites remember".
- **Plot service as the funnel** — paths 2 and 3 do not go through `planting-service`, and nothing stops a fourth from skipping it either.
- **Database DEFAULT** — the only option that also covers path 4 and raw SQL, but it puts the format in a second place (plpgsql) that will drift from `shared/plot-code.js`, and `random()` is not a CSPRNG (`gen_random_bytes` fixes the RNG, not the duplication). Worth revisiting as a backstop when the contract migration makes `plotCode` NOT NULL.

Rules held, each pinned by a test: caller-supplied code is never replaced; `update`/`updateMany` are not hooked at all, so a printed sign can never be orphaned; `upsert` mints into `create` only; `qrIssuedAt`/`qrRevokedAt` are never touched; no pre-check — a `P2002` naming `plotCode` redraws (max 5 attempts), a `P2002` on any other column rethrows on the first try. Honest limit, documented in the source: inside an interactive transaction the retry cannot succeed (Postgres aborts the tx on the failed statement), so the caller sees an error either way — at ~9.3e14 codes that is a one-in-a-billion event per insert at a million plots, and a SAVEPOINT per plot insert is not worth carrying for it.

### RED

`plot-code-extension.test.js` first failed on the missing module. The defect itself was also shown directly, with a throwaway probe (since deleted) driving the real `planting-service.createPlotForFarm`:

```
● RED: a plot created through the normal route path comes back with no plotCode
    expect(received).toBe(expected)   Expected: true   Received: false
    > 14 |     expect(isValidPlotCode(created.plotCode)).toBe(true);
```

### GREEN

```
PASS __tests__/unit/plot-code-extension.test.js
  √ route path — planting-service.createPlotForFarm returns a plot with a valid code
  √ wizard path — executeWizardSubmission gives every submitted plot its own code
  √ issuance path — certificate-service.ensurePlotsForFarm mints a code for the fallback plot
  √ a caller-supplied plotCode is left exactly as it was
  √ update is not hooked at all — a plot that has a code can never have it replaced
  √ upsert mints into the create branch and does not touch the update branch
  √ qrIssuedAt and qrRevokedAt stay untouched — a code existing is not a sign existing
  √ other models are untouched
  √ a P2002 on plotCode is retried with a DIFFERENT code, not pre-checked
  √ a P2002 on some OTHER column is rethrown immediately — no pointless retry
  √ createMany re-mints the batch on collision and gives up rather than looping forever
  √ prisma-database.js applies plotCodeExtension to the client the services use
Tests: 12 passed, 12 total
```

Neighbours of the files I touched, re-run: `prisma-tx-defaults`, `n-plus-one-batching`, `certificate-service-evidence-gate`, `farm-entityid-stamp` — 4 suites, 23 tests, all pass. `npx eslint` on all three changed files: clean.

What the tests simulate, stated plainly: Prisma's `$allModels` dispatcher and the database. The service functions, the extension and the data shapes are real. The wiring into the real client is checked by source-scan, for the reason `prisma-tx-defaults.test.js` already gives — requiring `prisma-database.js` in a unit test constructs a live `PrismaClient`.

### Not done / for whoever picks this up

1. **Path 4 (seed-gacp.js) still mints no code.** It is dev/CI data and `prisma/backfill-plot-codes.js` cleans up after it, but the one-line fix is `const prisma = new PrismaClient().$extends(plotCodeExtension);` at seed-gacp.js:48. Not mine to edit under the shared-tree rule, so it is here rather than in the diff.
2. **No live proof.** preview.gacpth.com runs `main`, which does not have this change, and creating a plot there is a write to the live database — forbidden. This needs a deploy before a real "create a plot, see its code" walk is possible.
3. **Nested writes and raw SQL are still uncovered** by construction. The contract migration's NOT NULL is what would catch them; a probe that greps for `plot.create` outside the extended client would catch them earlier.

Evidence: `apps/backend/services/plot-code-extension.js`, `apps/backend/__tests__/unit/plot-code-extension.test.js`, this file.

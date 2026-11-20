# Layer 2 / L2 — the sign in the field carries the PLOT code, and scanning it works — 2026-08-24

Status: `DONE(probe:jest __tests__/unit/trace-resolves-plot-code.test.js)`

## Did

- `services/trace-service/resolve-plot-cycle.js:302-367` — a scan whose string normalises to
  `PLOT-XXXXX-XXXXX` (`shared/plot-code.js:89 normalizePlotCode`, so lowercase and stray
  spaces resolve) now finds the plot by `Plot.plotCode`, then its one open cycle, and returns
  the projection a cycle-plot QR returns today.
- `resolve-plot-cycle.js:32` — `OPEN_CYCLE_STATUSES = ['PLANNING','PLANTED','GROWING','READY_HARVEST']`,
  exported. Statuses from `prisma/schema/cultivation.prisma:53-54`. Listed as the OPEN set,
  not the closed set, so a status added later defaults to "not open".
- `resolve-plot-cycle.js:56-71` — the assignment `include` is now one `ASSIGNMENT_INCLUDE`
  object shared by both lookup paths, so the two routes cannot drift into different fields.
  `plotCode` added to the plot select.
- `resolve-plot-cycle.js` publicData — two new keys on the existing PLOT_CYCLE body:
  `plotCode` (never redacted: it is the string the scanner already holds) and `hasOpenCycle`.
- `resolve-plot-cycle.js:80-100` — the audit write is one `logPublicScan()` used by all three
  outcomes, so a dormant scan and a revoked scan leave the same kind of row a normal scan does.
- `__tests__/unit/trace-resolves-plot-code.test.js` — 9 tests, RED before the change.

No route file changed. The dedicated route already passes the raw param through
(`routes/api/trace/trace.js:63-67`) and the generic cascade already delegates to this resolver
(`services/trace-service/resolve-generic.js:387`), so both `/api/trace/plot-cycle/:code` and
`/api/trace/:code` resolve a plot code with no edit.

## The two decisions I was asked to argue

**No open cycle — between harvest and the next planting → `200`, `type: 'PLOT'`.**
404 would be a lie about real land: the sign is nailed to a post on a registered plot that will
be planted again, and it would send a farmer hunting for a broken QR that is not broken. It
would also make the dormant months indistinguishable from a code that was never issued — the
one case where "not found" is the truth.
Not `PLOT_CYCLE` with `cycle: null`, because a body typed PLOT_CYCLE that carries no cycle is a
lie about its own shape and teaches every consumer to null-check a field the type promises. A
separate type forces the branch that has to exist anyway ("no open round — start one" instead
of cycle facts), and no existing PLOT_CYCLE consumer ever receives it.
The dormant body is redacted as CONTROLLED: with no cycle there is no species, and this file
already argues (`resolve-plot-cycle.js:120-123`) that unknown resolves to controlled. I did not
read the last CLOSED cycle to recover the species — un-redacting a dormant plot buys a scanner
nothing and would make the page leak more the longer the land sits idle.

**`qrRevokedAt` set → `410`, and nothing about the land.**
`qrRevokedAt` is set when a sign is lost, stolen or photographed by someone who should not have
it (`prisma/schema/farm.prisma:245`). Whoever is scanning now may be exactly the person it was
revoked against, so the resolver stops before it reads the plot: no farm, no plot name, no
location, no cycle — the cycle query is never issued (asserted in the test).
410 rather than 404 because the distinction is the whole message: this code was real and is
deliberately no longer served, which tells the farmer reading his own faded sign to get a
reprint, where a 404 would send him hunting for a typo. 410 is already this surface's word for
"existed, no longer valid" (`resolve-generic.js:135,246,323` for revoked/expired certificates).

## What could not break, and why it did not

- **Every existing QR still resolves.** The plot-code block runs only when the string IS a plot
  code, and every live plot-cycle `qrCode` is a UUID (`services/qrcode/qrcode-service.js:101`,
  `crypto.randomUUID()`), which cannot match `PLOT-XXXXX-XXXXX`. When the code is well-formed
  but no plot owns it, the block falls THROUGH to the four original strategies instead of
  returning. A throw inside it is caught, logged, and falls through too. Two tests pin this: a
  legacy UUID QR resolves without `plot.findUnique` ever being called, and `PLOT-22222-33333`
  with no matching plot still reaches the legacy 404.
- **Controlled-species redaction applies on the new path.** Same `redactPublicPlotPayload`, same
  call site — the plot-code path sets `assignment`/`securityRecord` and then runs the identical
  body. Asserted directly (cannabis fixture: `farm.name`, `farm.district`, `plot.name`,
  `cycle.expectedHarvestDate` null, `plantUnits {total:null,byStatus:{}}`) and again on the
  dormant page. The existing generic-fallback bypass test still passes.
- **The evidence chain is unchanged.** package → lot → harvest → cycle → plot → certificate. The
  plot code only selects the same `PlantingCyclePlot` row a cycle-plot QR would have pointed at;
  the scan is still recorded against `PLANTING_CYCLE_PLOT`/`assignment.id`, and no join in the
  chain reads `plotCode`.

## RED (before the change)

```
× resolves a plot code through the plot's open cycle to the same PLOT_CYCLE projection
× looks up the plot by the NORMALISED code when it was transcribed badly
× asks only for an OPEN cycle — a harvested season must not answer the sign
× redacts a controlled species on the plot-code path exactly as on the QR path
× answers with the PLOT, not a 404, when there is no open cycle
× says nothing about the farm or the plot on the dormant page — species unknown means controlled
× 410s and publishes nothing about the land
√ still resolves a legacy cycle-plot QR without ever touching the plot-code path
× falls through to the legacy cascade when a well-formed code matches no plot
Tests:       8 failed, 1 passed, 9 total
```
(The one green is the regression guard — it had to be green both before and after.)
Live baseline on main, same shape of code, both routes: `GET /api/trace/PLOT-7F2KX-M9QRT` → 404,
`GET /api/trace/plot-cycle/PLOT-7F2KX-M9QRT` → 404.

## GREEN

```
PASS __tests__/unit/trace-resolves-plot-code.test.js            (9/9)
PASS __tests__/unit/trace-generic-resolves-plot-cycle-fallback.test.js (2/2)
Tests:       11 passed, 11 total
```
Neighbours re-run, all pass: `trace-generic-lab-privacy`, `trace-generic-pii-redaction`,
`trace-integrity-payload-fail-closed`, `trace-plant-cert-revocation`,
`trace-resolve-legacy-batch-number-format`, `traceability-public-projection-cycle-farmid`,
`interop-trace-revoked-reason-mask`, `auto-trace-actor-identity-mask`, `plot-code` — 34 + 7 tests.
`npx eslint` clean on both changed files.

## Pre-existing failure I did NOT touch

`__tests__/unit/trace-plot-cycle-plant-count-ssot.test.js` — 2 tests fail, expecting
`plantUnits.total === 120`, receiving `null`. Not caused by this work: its fixture
(`:85`) is `{ code: 'CANNABIS', nameTH: 'กัญชา', nameEN: 'Cannabis' }` with **no
`requiresLicense`**, and `redactPublicPlotPayload` (untouched by me — same body, now at
`resolve-plot-cycle.js:127-160`) treats unknown as controlled and nulls the count. The redaction
landed in commit fba95067 and this test was not updated with it. My own tests prove the mechanism
is the redaction and not the new path: the same resolver returns 120 for `requiresLicense:false`
and null for `requiresLicense:true`. One-line fix, for whoever owns that file: set
`requiresLicense: false` on the fixture (it is a plant-count test, not a redaction test).

## Left for the next lane

1. **The URL on the sign.** The dormant page and the plot-code path hand out
   `{base}/plot-cycle/<PLOT-CODE>` (`resolve-plot-cycle.js:49-51`), because that is the only FE
   page that renders this payload
   (`apps/web-app/src/app/trace/plot-cycle/[qr-code]/client-view.tsx:153`). The generic
   `/trace/[qr-code]` page reads `data.plant` and `data.farm.location` — fields no plot
   projection has — so a plot code typed into the public search box resolves 200 in the API and
   renders a broken page **today, before this change too**. Whoever prints the sign should encode
   the `plot-cycle` path until a `/trace/plot/<code>` page exists.
2. **FE copy for `type: 'PLOT'`.** The plot-cycle page uses optional chaining throughout, so a
   dormant body degrades to `-` placeholders rather than crashing, but it does not yet say
   "ยังไม่มีรอบปลูกที่เปิดอยู่" or offer "start a round". `message` and `plotStatus:'NO_OPEN_CYCLE'`
   are in the body for it.
3. **R15 is not yet enforced by the database.** The spec requires a partial unique index; it does
   not exist in `prisma/migrations` yet. Until it does, `orderBy: { createdAt: 'desc' }` is the
   tiebreak — the newest open round answers the sign rather than an arbitrary row.
4. **The authenticated recording flow** should import `OPEN_CYCLE_STATUSES` from this module
   rather than write a second definition of "open".

Evidence: this file · `apps/backend/__tests__/unit/trace-resolves-plot-code.test.js`

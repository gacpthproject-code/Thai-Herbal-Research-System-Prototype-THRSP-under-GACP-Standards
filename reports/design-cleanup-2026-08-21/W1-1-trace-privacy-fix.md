## W1-1 — public trace lab-result / COA-link privacy fix — 2026-08-21

Status: DONE(probe: jest full-file runs below, this session)

### 1. Auth-reachability proof

The task named `resolveScannedCode` as the function to check. That function lives in
`apps/backend/routes/api/interoperability/interoperability-resolve.js` and is used ONLY by
`GET /api/interoperability/v1/resolve`
(`apps/backend/routes/api/integration/interoperability.js:449`), which IS guarded:
`router.get('/v1/resolve', requirePartnerApiKey, interopExportLimiter, partnerAccessLogger, ...)`.
That route also never returns lab values (`probeCertificate`/`probeHarvestBatch`/`probeLot` in
`interoperability-resolve.js` carry no `labResults`/`thcContent` field at all) — **no defect
there, and it is authenticated, so I changed nothing about it.**

The actual leak is the function the task's own verified lines pointed to:
`resolveTraceByGenericQr` in `apps/backend/services/trace-service/resolve-generic.js`. Its route
chain has no auth anywhere:
- `apps/backend/routes/api/index.js:315` — `router.use('/trace', traceRouter)`, no middleware.
- `apps/backend/routes/api/trace/trace.js:88` — `router.get('/:qrCode', ...)`, no middleware,
  calls `resolveTraceByGenericQr` directly (line 100).
- `apps/backend/routes/public-trace.js:40` — `GET /trace/:qrCode` 302-redirects to the same
  `/api/trace/:qrCode` (also unauthed), so both public paths reach it.
- `apps/backend/server.js:170` — the `/api/trace` mount applies only open CORS (`origin: '*'`),
  never an auth check.

Confirmed unauthenticated and reachable. This is a naming mismatch in the task brief, not a false
alarm — I fixed the resolver the task's own evidence pointed to.

### 2. What R9 actually says (I initially assumed wrong)

`docs/superpowers/specs/2026-08-20-planting-tnt-design.md:24`: "หน้า public แจ้งแค่ว่า 'มี/ไม่มี'
ผลตรวจ — ไฟล์ COA และค่าผลตรวจไม่ขึ้น public". Line 77 is explicit: "ไม่มีไฟล์ ไม่มีค่า
**ไม่มีสรุปผ่าน/ไม่ผ่าน**" (no file, no values, **no pass/fail summary**). This is stricter than
my brief's assumption of "a pass/fail assurance is fine" — R9 forbids exposing PASS vs FAIL too,
permitting only existence + lab name (no date field exists in the current schema to add "ตรวจเมื่อ
<date>", so that clause is omitted, not fabricated).

### 3. Fields removed (file:line, backend)

`apps/backend/services/trace-service/resolve-generic.js`:
- Line ~172 (PLANTING_CYCLE), ~276 (HARVEST_BATCH), ~353 (LOT-via-cert) `lab_analysis`: removed
  `status` (raw labResultStatus) and `results` (raw labResults JSON). Kept `labName` (R9-permitted)
  and added `tested: true` (object only exists when labResults present, same gate as before).
- Line ~329 LOT `labTest`: removed `status`, `passed`, `thcContent`, `cbdContent`,
  `moistureContent`, `labTestReportUrl`. Replaced with `tested: boolean` = true only for a
  CONCLUDED test (`testStatus` PASSED or FAILED) — deliberately not distinguishing which, since R9
  forbids the pass/fail summary. The Bug 6.3 invariant ("presence of a report URL is NOT a pass
  signal") is preserved verbatim in a comment — `tested` still derives from `testStatus` alone.

Frontend (`apps/web-app/src/app/trace/[qr-code]/client-view.tsx`): removed the whole per-analyte
results table, the PASSED/FAILED colored badge, and the "ดูรายงานผลตรวจแล็บ" link to
`labTestReportUrl`. Replaced with a new pure helper `apps/web-app/src/app/trace/lab-assurance.ts`
(`deriveLabAssurance`) rendering only existence + labName, matching `@/lib/verify/trace-trust`'s
existing pattern. `apps/web-app/src/app/trace/[qr-code]/trace-page-types.ts` updated to match
(`lab_analysis: { tested, labName }`, `lot.labTest: { tested }`).

### 4. RED → GREEN evidence

Backend RED (before fix, `apps/backend/__tests__/unit/trace-generic-lab-privacy.test.js`, new
file): 5 of 6 failed — serialized body contained `"results"`, `"thcContent"`, `"labTestReportUrl"`,
etc., and a distinctive marker value/URL. GREEN after fix: 6/6 pass, plus
`lot-test-status.test.js` (28/28... see below), `trace-generic-pii-redaction.test.js`,
`generic-trace-cert-gate.test.js`, `harvest-cross-farm-cert-read.test.js` all pass (31 tests,
5 suites).

Frontend RED: temporarily swapped `client-view.tsx` back to the pre-fix git HEAD content (file
restored immediately after, verified byte-identical to the fixed version via `diff`), ran
`apps/web-app/src/app/trace/__tests__/lab-privacy.test.ts` (new file) → 4 of 12 failed (source
still referenced `labTestReportUrl`/`thcContent`/`cbdContent`/`moistureContent`/`.results` and
matched the `labTest.status` regex). GREEN after restoring the real fix: 12/12 pass.

Broader regression run: `npx jest --testPathPattern="trace|lot"` in `apps/backend` → **24 suites,
197 tests, all pass**. `apps/web-app`: `npx jest src/app/trace src/lib/verify` → **5 suites, 50
tests, all pass**.

`npx tsc --noEmit -p tsconfig.json` from `apps/web-app`: **62 lines of errors, all in
`e2e-phase0/*.spec.ts`** — identical to the known baseline, zero new lines.

### 5. Existing test that encoded the defect

`apps/backend/__tests__/unit/lot-test-status.test.js` — its second `describe` block ("Bug 6.3 —
public resolver never renders non-PASSED as passed") asserted `out.body.data.lot.labTest.status`
and `.passed` were PRESENT on the public response for PENDING/FAILED/PASSED lots (lines 97-117 in
the pre-fix version). That is exactly the R9 violation. Updated it to assert
`labTest` deep-equals `{ tested: false }` / `{ tested: true }` instead, with a comment
documenting the change and pointing at R9. The original PASSED/FAILED/PENDING → correct
`testStatus` write-path tests (`normalizeLotTestStatus`, first `describe` block) were untouched —
that is a different, still-valid invariant (write-side, not the public read).

### 6. Other exposures of the same class — checked, not found (or already gated)

- `apps/backend/routes/api/trace/trace-batch-lot-routes.js` (`GET /api/trace/batch/:id`,
  `/api/trace/lot/:id`, both public, no auth): no lab fields at all in the response — clean.
- `apps/backend/services/trace-service/resolve-plot-cycle.js` (canonical structured resolver):
  grepped for labResults/thcContent/address/phone/coordinates — none found.
- `apps/backend/services/trace-service/queries.js` `findLotByQrCode`/`findBatchById`: these
  `select` the same `labResults`/`labResultStatus` fields, but grep confirms **no route calls
  either function** — dead code, not a live leak. Flagging for legacy-sweeper, not touching (not
  the same live defect, and deleting dead code is out of this fix's scope).
  route to a route.
- `apps/backend/routes/api/trace/trace.js` `/plant/:qrCode` (public, legacy PlantUnit path, R8 —
  explicitly not to be extended/touched in this design): exposes farm name/province/district (no
  address), plant/batch/lot summary, `careHistory[].notes` (free-text care-log notes — could carry
  incidental PII if a farmer wrote something personal, but this is a different defect class and a
  route already marked for eventual removal). Not fixed — flagging only, per the task's "list the
  rest" instruction.
- `interoperability-core.js` `buildCertificateEnvelope` does carry `applicantName`/
  `holderDisplayName`, but only on the two partner-key-gated e-certificate/envelope endpoints
  (SEC-AUDIT-012, already documented as partner-only by design) — not public.
- Public certificate-verify endpoints (`apps/backend/routes/api/auth/public.js`,
  `apps/backend/routes/api/certificates/certificates.js`) — grepped, no lab fields present.
- Noted but NOT in scope/not touched: `thai-ui-copy` skill flagged a pre-existing Gregorian-date
  leak (`new Date(dateStr).toLocaleDateString('th-TH')`) still at
  `client-view.tsx`'s `formatDate` helper — a date-format bug, not a privacy leak, unrelated to
  this fix.

### 7. Files touched

- `apps/backend/services/trace-service/resolve-generic.js`
- `apps/backend/__tests__/unit/lot-test-status.test.js` (updated, defect noted above)
- `apps/backend/__tests__/unit/trace-generic-lab-privacy.test.js` (new)
- `apps/web-app/src/app/trace/[qr-code]/client-view.tsx`
- `apps/web-app/src/app/trace/[qr-code]/trace-page-types.ts`
- `apps/web-app/src/app/trace/lab-assurance.ts` (new)
- `apps/web-app/src/app/trace/__tests__/lab-privacy.test.ts` (new)

No secrets added. No money paths touched. No ratchet-relevant pattern (hardcode/dup-source/todo/
env-direct/skip/green-mask) introduced — the `tested` derivation reads the same `testStatus`
field the old `passed` logic did, just returns a coarser boolean.

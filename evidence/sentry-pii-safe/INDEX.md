# Sentry re-added with PII scrubbing: evidence (feat/sentry-pii-safe, 2026-10-02)

These are summaries only. Every run below happened in this session on Node v24.21.0 with `NODE_OPTIONS` unset and `SIGNING_KEY_DIR` set to a temporary directory. The fake values used throughout are national ID `1-2345-67890-12-3` / `1234567890123`, email `test@example.com`, and a JWT assembled at runtime.

## RED, before each change

| # | State of the tree | Result |
|---|---|---|
| R1 | Tests written; scrubber was an identity stub; no `config/sentry.js` | `sentry-pii-scrub`: 47 failed, 12 passed. `sentry-config` and `sentry-express-envelope`: the suites did not load (`Cannot find module '../../config/sentry'`). |
| R2 | Real `@sentry/node` 11.2.0 wired through `config/sentry.js`, scrubber still an identity stub | Envelope suite: 2 failed. The national ID reached the HTTP sink, in both the Express 500 event and the unhandled-rejection event. The off-by-default tests passed: there was no DSN, so nothing was sent. |
| R3 | Mutation: `traceLifecycle: 'static'` removed (SDK 11 default `'stream'`) | 2 failed. A streamed span carried `http.request.body.data` = `{"nationalId":"1-2345-67890-12-3"}`, plus `user.ip_address`. This is SDK 11's `dataCollection` default; `beforeSendTransaction` never runs for streamed spans. |
| R4 | OTel-attribute tests run against the scrubber before key-level handling | 2 failed: off-allowlist `http.request.header.*`, the body attribute, and the payment-route query. |
| R5 | Web: before the transport gate | 1 failed. A `session` item carried `attrs.ip_address` from `setUser`. Sessions never pass `beforeSend`. |
| R6 | Web mutation: scrub options and transport gate removed from `initSentryClient` | 6 of 8 failed. ID, email, JWT, name, phone and IP all appeared in the envelope. |
| R7 | Web CSP tests run against the unchanged middleware | 2 failed. `connect-src` did not include the DSN ingest origin. |
| R8 | env-validator and catalog tests run against main's `env-validator.js` and `secrets.js` | 8 failed. |

## GREEN, final tree

| Suite | Result |
|---|---|
| `apps/backend/__tests__/unit/sentry-pii-scrub.test.js` + `sentry-config.test.js` + `sentry-express-envelope.test.js` | all pass (part of the full run below) |
| Backend full unit suite (`LOCAL_GATE_FULL=1 scripts/ci/local-gate.sh`) | 899 suites passed, 2 failed, 45 skipped; 11940 tests passed, 15 failed, 328 skipped |
| The 2 failing suites (`integration/payer-block-matrix`, `integration/dtam-schema-drop-migration-real-postgres`) | **Same result on main 37799f12** in this worktree: 2 suites, 15 tests failed, all with `PrismaClientInitializationError` (no Postgres here). No new failure. Main's full-gate attestation (`evidence/gate/88408f76….json`) shows `suite-green` failing for the same reason. |
| Web full jest suite | 426/426 suites, 3463/3463 tests |
| `tsc -p apps/web-app --noEmit` | exit 0 |
| `next build` with a DSN baked in | compiled; the only notice was Next's "Linting is disabled" (from `--no-lint`) |

## Scrubbed envelope sample (backend, real SDK, local sink)

The request was `POST /api/applications/1234567890123/lookup?nationalId=…&token=<JWT>`. Its body held the ID and email. It carried `Authorization: Bearer <JWT>`, `Cookie`, `X-National-Id` and `X-Applicant-Email`. The message embedded the ID, email and JWT. The event as it reached the sink:

```json
{ "type": "Error",
  "value": "[TEST] ไม่พบผู้ยื่น [Filtered] [Filtered] [Filtered]",
  "mechanism": "auto.http.express", "frames": 10,
  "inAppFrame": [{ "filename": "express-error-app.js", "lineno": 29 }],
  "transaction": "POST /api/applications/:nationalId/lookup",
  "request": { "headers": { "content-type": "application/json", "host": "127.0.0.1:…", "content-length": "61" },
               "method": "POST", "url": "http://127.0.0.1:…/api/applications/[Filtered]/lookup" },
  "user": null }
fake values in raw envelopes: []
```

## Browser wire checks (real Chromium against a real `next build`)

- **Local sink** (`browser-wire-check.mjs` in this folder, `/verify`): the CSP `connect-src` admits the sink origin and does not carry the public key. 0 CSP violations. 10 envelopes arrived (transaction, session, event). The exception was sent as `[TEST] ทดสอบ [Filtered] [Filtered] — …`, with `user: null`. Fake values that reached the sink: none.
- **Web server side** (Node runtime, same build): transactions arrived with `platform: node`. The URL arrived as `/api/applications/[Filtered]`. Fake values: none.

## Smoke test against the real Sentry ingest

The DSNs were sourced in a subshell only and were never printed. The events were marked as tests.

| Project | Event id | Ingest HTTP | Message as sent | Fake values in envelope |
|---|---|---|---|---|
| backend (`node apps/backend/scripts/sentry-smoke.js`, env `smoke-test-local`) | `cf9b7a800f864498a87dc38ec70b256e` | 200 | `[TEST] Sentry smoke test, ignore — ทดสอบ [Filtered] [Filtered]` | none |
| web (browser, `/verify`, env `smoke-test-local`) | `cc9dcdad2a7f479fb9523da039c99ef6` | 200 | `[TEST] Sentry web smoke, ignore — ทดสอบ [Filtered] [Filtered]` | none |

**PENDING: the operator still has to confirm both event ids in the Sentry UI and check that no ID appears there.** The local `.next` build that baked in the real web DSN was deleted after the run.

## Probes (run on the committed tree)

| Probe | Result |
|---|---|
| ratchet | PASS. hardcode=26, todo=53, env-direct=101, dup-source=0, unchanged. Env reads go through `config/` only. |
| retired-words | PASS |
| no-secret | PASS. layer1 grep: 0 hits; layer2 gitleaks: clean. Neither the real DSN key nor the ingest host appears in the tree or in recent history (checked without printing them). |
| no-skip | PASS |
| status-vocab, stripe-sdk-isolated, settle-webhook-only, deps-health | PASS. deps-health: audit critical=0. |
| error-codes-source-pointers (jest) | PASS |
| dependency-audit | FAIL, **pre-existing**. The high advisories in a same-time `pnpm audit` of main's lockfile and of this branch are identical: 15 and 15, 0 new, 0 gone. They are axios, basic-ftp, brace-expansion, js-yaml and smol-toml. The new Sentry tree adds no advisory. |
| probe-gate (local-gate) | FAIL from 4 probes this branch does not touch: dependency-audit (above), deploy-drift (demo was unreachable from here), main-attestation-audit (main commits without an attestation), nginx-config-drift (host differs from git). |
| tier-check | **TIER=C** (compose, deploy, middleware, lockfile, governance). The operator merges. |

## Fix round 1 (privacy review NEEDS FIXES, 2026-10-02/03)

The reviewer ran the real SDK 11.2.0 with recording transports. Each finding below got RED, then GREEN. The RED runs used the previous scrubber, or a mutation, swapped in.

| Item | RED | GREEN, and where |
|---|---|---|
| C1 Prisma messages carry PII | Wire test on real Prisma 5.22 + Postgres 17 (scratch, port 5451, removed after use): 3 failed. The validation error carried firstName, lastName, address and passport. Raw P2010 carried the failing row and `Key (full_name)=(…)`. | `integration/sentry-prisma-errors-real-postgres.test.js` 4/4. The value is cut to ``Invalid `user.create()` invocation: <summary>``. `23514`/`23505` and the constraint name are kept. |
| C2 query string and Referer carry names | Backend wire: 2 failed (`?q=`, Referer, outbound query). Web jsdom with the real SDK: 2 failed (pushState `?q=`, fetch `?q=`, Thai path, console). | Query strings are dropped on every route and in every URL field and free-text URL. Referer and Origin become origin + path. A path segment with Thai text is replaced. `sentry-express-envelope` and `sentry-client-urls` pass. |
| I3 key denylist misses schema fields | Unit: 19 keys failed. Schema guard: 46 uncovered fields. | `isSensitiveKey` uses substring + word rules. `unit/sentry-pii-schema-fields.test.js` reads every field in `prisma/schema/*.prisma`: 0 uncovered. |
| M4 number shapes | 7 failed (4-5-4 grouping, Thai digits, dots, `(02)`, `081.234.5678`, Thai-digit mobile) | One 13-digit rule with `[-. ]` and ๐-๙. Phones accept `.`, brackets and Thai digits. |
| M5 env reads in web server.ts | Guard failed on the old `server.ts` | `sentryServerRuntimeEnv()` in `src/lib/config/sentry.ts`, pinned by a test. |
| M6 wording | — | HARNESS_LOG (this branch's own entry) and cutover-checklist-2026-05-17 now say only "removed 2026-07-25; re-added 2026-10-02 by operator decision, with PII scrubbing". `docs/audit-reports/2026-07-25-*` is a dated audit record and was left unchanged. |
| M7 one release | 3 failed | The builder stage now has `ARG GIT_SHA` and `ENV NEXT_PUBLIC_SENTRY_RELEASE=${GIT_SHA}`. The separate release ARG is gone. |
| Reviewer harness re-run | 3 runtime leaks remained after the first fix: a Thai name in a tag value, a console line with Thai free text, and `020-123-4567`. Unit tests: 3 failed. | A tag value with Thai text is replaced. A console breadcrumb with Thai text is dropped. Any 10-digit 0x number is treated as a phone. Re-run: **0 runtime leaks of 33 values.** The remaining hits are in stack-frame source-context lines, i.e. the harness file's own source code. The reviewer's web probe shows all four values false. |

Not covered by design: a person's name typed into an exception message's free text. That is documented in the runbook.

### Round 1 runs, on the tree after merging main e33666b9

- **Sentry suites**: 151/151 passed, with real Postgres 17 for the Prisma suite. The scratch container on port 5451 was removed afterwards.
- **Backend full suite** (`LOCAL_GATE_FULL=1`): 899 suites passed, 3 failed; 11990 tests passed, 16 failed.
  - `payer-block-matrix` and `dtam-schema-drop-migration-real-postgres` fail on main too: there is no Postgres in the gate run.
  - `document-precheck/extract.test.js` failed 1 test in the full run: "a timeout that lands while the pdf-extract-worker child is running leaves no child process behind". It passes 13/13 when run alone on this tree. This code is not touched by the branch; I read it as a timing race under load.
- **Web full suite**: 432/432 suites, 3548/3548 tests. tsc: exit 0.
- **Probes**: ratchet 26/53/101/0, retired-words, no-secret and no-skip PASS. probe-gate FAIL comes only from probes this branch does not touch: dependency-audit, deploy-drift, gate-attestation, main-attestation-audit and nginx-config-drift.

### Re-review P1 (approved round 1; parkable P1 fixed before the gate)

- **What leaked:** a percent-encoded Thai path segment survived in the `http.client` span `description` and in `contexts.nextjs.request_path`.
- **RED:** run through the real SDK to the sink, with the fixture routes `/api/outbound-path` and `/api/nextjs-context`, 3 tests failed. `request_path` arrived as `/health/applications/%E0%B8%9B…`.
- **Fix:**
  - `scrubString` replaces any URL path segment containing `%E0%B8` or `%E0%B9` (case-insensitive).
  - `request_path` was added to `URL_VALUE_KEYS`.
- **GREEN:**
  - Sentry unit and wire suites: 150/150.
  - Prisma suite on scratch Postgres 5451: 4/4. The container was removed afterwards.
  - Web Sentry and CSP suites: 68/68.
- **Probes:** ratchet 26/53/101/0, retired-words, no-secret and no-skip PASS. TIER=C.
- **P2 and P3:** both are documented as limits in the runbook (hand-written free text, Latin-script names). No code change.

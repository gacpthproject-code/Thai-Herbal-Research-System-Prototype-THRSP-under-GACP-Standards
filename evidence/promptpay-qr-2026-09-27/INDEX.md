# PromptPay QR step — evidence (feat/promptpay-qr, 2026-09-27)

> **Fix round 1:** see `fix-round-1/` (table at the end). The `walk/` screenshots and traces were re-taken on the fix-round-1 build (provider no longer named on screen, editable payer email). Raw jest logs were removed from this branch's history; only summaries are kept (raw logs trip gitleaks).

## RED → GREEN
| file | what it shows |
|---|---|
| `red/backend-red-summary.txt` | new backend suite before implementation: 15/15 fail (`getStripePublishableKey is not a function`, `getClientConfig is not a function`, promise resolved instead of rejecting on missing/mismatched key, no `publishableKey`/`invoiceId`/`payerEmail` in the response) |
| `red/web-red-summary.txt` | QR path + CSP before implementation: 12 fail / 2 pass. The 2 green-from-birth are **pins, not fixes**: "no publishable key → no pay button, says QR cannot be shown" (the old copy already said so) and "no maps host / no wildcard" |
| `red/web-red-settled-heading-summary.txt` | found by the walk (A09 first run): heading still said "สร้างรายการสำเร็จ รอชำระเงิน" above the paid panel. RED, then fixed |
| `round0-test-output-backend-summary.txt` · `round0-test-output-web-summary.txt` | targeted suites green after implementation (round 0) |
| `email-required-probe.txt` | stripe-js 9.17.0 types do NOT require `billing_details.email` for PromptPay (`payment-intents.d.ts:348-351`), the live test-mode API DOES (`parameter_missing billing_details[email]`). Email fallback kept |
| `stripe-csp-doc-excerpt.md` · `stripe-promptpay-doc-excerpt.md` | the Stripe docs the CSP hosts and the confirm call were taken from |

## Real walk — Stripe TEST mode (`walk/`)
Stack: scratch Postgres container `qr-walk-pg` (:55461, `prisma migrate deploy` of this tree) · backend of this tree (:8099, `PAYMENT_ADAPTER=stripe`, test keys from `apps/backend/.env` via a scratch env file, publishable key read through the dev fallback name `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) · `next build` + `next start` of this tree (:3099) · `stripe listen --forward-to 127.0.0.1:8099/api/v1/webhooks/stripe`. Chromium via Playwright. Reproduce: `walk/run-walk.sh` (output `walk/run-walk-output.txt`).

Seeded, not walked (stated): the JURISTIC company entity + membership and one PENDING_DOC_FEE application per farmer (`walk/seed-payable-application.js`). Farmers registered through the real `POST /api/auth/health/register`. Quotation issued through the real `issueQuotationsForApplication` on a client that drops an `undefined` — **every quotation issuance fails on this tree** (`walk/F-QT-ISSUER-UNDEFINED-repro.txt`, BACKLOG-FOUND.md 2026-09-27). Everything else is real doors.

| shot | should show |
|---|---|
| A01 → A02 | payments list; quotation QT-PRD-2026-000001 accepted by pressing ยอมรับใบเสนอราคา |
| A03 | checkout idle: the both-states sentence (ONLINE_PAYMENT_STEP_TH) |
| A04 | created: ฿5,885, pay button, payer email from the company's contact (`accounts@qr-walk-company.example`) |
| A05 | Stripe's QR modal (Thai; test mode puts "จำลองการสแกน" over the blurred QR). **Review M-1:** the round-0 A05 caught only the loading overlay; this re-walk's A05 shows the modal, and so do A07 and B06 |
| A06 → A08 | Stripe-hosted PromptPay test page, "Authorize Test Payment" pressed |
| A07 | our page right after the authorise press: still the modal, nothing claimed |
| A09 | settled: heading ชำระเงินสำเร็จ, receipt **TAX-PRD-2026-000001 issued by the system** |
| A10 | payments list: ยอดรอชำระ ฿0, งวดที่ 1 ชำระครบแล้ว, ออกใบเสร็จแล้ว TAX-PRD-2026-000001 |
| B04 → B05 → B06 | farmer with no email on record: required input, button disabled until a valid address, typed address opens the QR |

`walk/Atrace.txt` · `walk/Btrace.txt` — timed trace (client secret, keys, JWTs redacted). Key lines: `POST 200 /api/payments/checkout` carries `publishableKey pk_test_[REDACTED]`, `invoiceId`, `payerEmail`; after authorise `GET /api/invoices/my` → `status paid, receiptNumber TAX-PRD-2026-000001, receiptStatus ISSUED`.
`walk/stripe-listen-tail.txt` — `payment_intent.succeeded` forwarded → `[200]`. `walk/backend-webhook-lines.txt` — `[checkout-settle] settled … targetState DOC_FEE_PAID`.
`walk/run-walk-output.txt` §6 — DB after: application DOC_FEE_PAID · order SETTLED · invoice paid · receipt TAX-PRD-2026-000001 ISSUED **receiptIssuedBy stripe-webhook** · charge SUCCESS 588500 satang · quotation ACCEPTED.
`walk/stripe-side-proof.txt` — Stripe's own record: walk A intent `succeeded`, pm.type promptpay, email = entity contact; walk B intent email = the typed address (then cancelled as cleanup).

Not captured: the "waiting for confirmation" state on screen — settlement landed before the first poll after the modal closed. The unit suite pins it (`checkout-promptpay-qr.test.tsx`).

## Gate (numbers vs main 87b197bf baseline from the brief)
| check | result |
|---|---|
| `round0-backend-full-summary.txt` | 857 passed / 32 skipped suites · 11,035 passed / 221 skipped tests · EXIT 0 (baseline 856 / 11,020 of 11,241; +1 suite +15 tests = the new file). 3 GB heap, fresh SIGNING_KEY_DIR, test dedupeKey hashes redacted |
| `round0-backend-full-run1-3-fails-summary.txt` | first full run: 3 suites / 4 tests failed, all caused by this branch (new code not catalogued; a top-of-file require shifted two line pointers in shared/error-codes.js). Fixed: catalogue rows added, require made lazy, adapter doc kept to one line |
| `round0-web-full-summary.txt` · `web-tsc.txt` | 406 suites / 3,313 tests pass (baseline 404 / 3,298; +2 suites +15 tests) · tsc EXIT 0 |
| `next-build.txt` | `next build` EXIT 0 (the build the walk ran on) |
| `probes.txt` | retired-words PASS · ratchet PASS (hardcode 27 · todo 53 · env-direct 102 · dup-source 0) · settle-webhook-only PASS · stripe-sdk-isolated PASS · status-vocab PASS · no-skip PASS · no-secret: layer1 0 hits, layer2 gitleaks FAIL on commit 2a26d202 of another branch (fix/retire-residency-claims), not in this branch; `main..HEAD` and this evidence dir are clean |
| `tier-check.txt` | TIER=C (money, env, compose, auth-exact-path) |
| `dependency-audit.txt` | PASS, no unaccepted high/critical (@stripe/stripe-js 9.17.0 has no dependencies) |
| `key-mtime-before.txt` / `key-mtime-after.txt` | main tree private.pem 2026-09-05 22:50:35 before and after |

## Fix round 1 (`fix-round-1/`)
| file | what it shows |
|---|---|
| `red-i1.txt` | I-1 RED on the base service: 7 fail / 1 pin. With PI_A **succeeded**, the base code called create again (a second intent); a canceled PI_A was "replaced" under the plain key |
| `red-web.txt` | I-1 web (succeeded/processing → wait, no pay button), M-3 (editable pre-filled email), I-2 (pay step names no provider) — 4 fail before |
| `red-i2.txt` | pins flipped to "provider not named" (operator ruling 2026-09-27): backend mirror 2 fail, web truthful-copy 4 fail before the copy change |
| `reuse-proof.sh` · `reuse-proof-output.txt` | **real Stripe test API**, real `POST /api/payments/checkout`: 2 presses → 1 intent; PromptPay-confirmed (live QR) → 3rd press reuses it, same client secret (sha256 shown); intent canceled in Stripe → the ONE replacement; retry idempotent; Stripe's list for the order: `1st=canceled, 2nd=requires_payment_method` |
| `green-targeted-summary.txt` · `full-suites-summary.txt` | backend 858 / 11,043 EXIT 0 · web 406 / 3,317 · tsc 0 |
| `next-build-summary.txt` · `probes.txt` · `tier-check.txt` · `key-mtime-*.txt` | build 0 · probes · TIER=C · private.pem unchanged |

## Fix round 2 (`fix-round-2/`)
| file | what it shows |
|---|---|
| `red-settlement.txt` | on head ba175636 (settlement unchanged): 4 fail / 3 pins. `payment_intent.canceled` for superseded pi_A cancelled the order holding pi_B (`{"data":{"status":"CANCELLED"},"where":{"id":"co-1"}}`) |
| `late-event-proof.sh` · `late-event-proof-output.txt` | real Stripe test API + real signed `POST /api/v1/webhooks/stripe`: Stripe's own canceled event for A delivered after the replacement → order stays PENDING_PAYMENT on B, event row `PROCESSED error=IGNORED:SUPERSEDED_INTENT`; B's canceled event → order CANCELLED; money-equation PASS on that DB |
| `suites-summary.txt` · `probes.txt` · `tier-check.txt` · `key-mtime-*.txt` | settlement/checkout/webhook 33 suites / 319 tests · backend full 859 / 11,050 EXIT 0 · settle-webhook-only, webhook-idempotent, ratchet PASS · TIER=C · private.pem unchanged |

## Fix round 3 (`fix-round-3/`)
| file | what it shows |
|---|---|
| `red-n1.txt` | N-1 on head de296a94: the order row changed between read and write (compare-and-set would match 0 rows) and the old code overwrote it with `update where {id}` — 3 fail / 7 pins |
| `red-n2.txt` | N-2: `CHECKOUT_ERROR_MAP.CHECKOUT_INTENT_UNUSABLE` was `undefined` (the screen fell back to "try again later") |
| `suites-summary.txt` · `probes.txt` · `tier-check.txt` · `key-mtime-*.txt` | backend checkout/settlement 34 suites / 331 · backend full 859 / 11,052 EXIT 0 · web checkout 6 / 95 · web full 406 / 3,318 · tsc 0 · ratchet, settle-webhook-only, webhook-idempotent, no-secret PASS · pointers :765 / :855 exact, baseline untouched · TIER=C |

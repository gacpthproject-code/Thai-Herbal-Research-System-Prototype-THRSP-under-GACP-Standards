# W3 — real, scannable QR codes — 2026-08-22

Status: DONE(probe: jest — 6 suites/17 tests green post-fix-round-1; tsc 62/62 baseline lines, 0 new; eslint clean)
Branch: fix/real-qr-codes (from main)
Fix-round 1 (review 6712f985 — SECURITY approve, ENGINEERING needs-fix): see §"Fix-round 1" below.

## Operator instruction
"QR code ต้องแสกนได้จริง QR หลอกๆ ต้องแก้ไขปรับปรุง" — every place the UI shows
something that looks like a scannable QR must be a real, scannable QR encoding
the correct URL. Decorative QR icons that merely suggest scanning are forbidden.

## Audit — every QR-looking element found

| Location | What it was | Verdict | Action |
|---|---|---|---|
| `src/app/(public)/verify/[cert-number]/page.tsx:214-217` | lucide `<QrCode>` icon in a 128px box, captioned "สแกนเพื่อตรวจสอบ" | **FAKE — confirmed** (BACKLOG-FOUND.md 2026-08-20) | **Fixed** — real `<QrImage>` encoding this page's own public verify URL |
| `src/app/health/certificates/client-view.tsx:475` (dialog fallback, no backend `qrCode`) | lucide `<QrCode>` icon standing in for the code inside the "here is your QR" dialog | **FAKE** — displayed AS the code | **Fixed** — real `<QrImage>`, backend blob kept only as `fallbackSrc` |
| `src/app/health/certificates/client-view.tsx:295` | lucide `<QrCode>` icon on a 68px button, `onClick` opens the QR dialog | icon-on-button that opens the real code | **OK, unchanged** |
| `src/app/trace/lot/[lot-id]/client-view.tsx:317` | lucide `<QrCode>` icon inside a `<Link>` button, "ดูหน้า QR สาธารณะ" | icon-on-button that navigates | **OK, unchanged** — matches the given example verbatim |
| `src/app/health/official-documents/client-view.tsx:292` | lucide `<QrCode>` icon prefixing an informational paragraph about certificates in general ("...มี QR Code ให้ผู้ซื้อสแกน...") | inline bullet icon on a general blurb, not shown as a per-item scan target, no single URL to encode | **OK, unchanged** |
| `src/app/trace/client-view.tsx:138` | lucide `<QrCode>` icon in a "Smart Label" feature card (alongside Leaf/FlaskConical cards) | pure feature-illustration icon, no "สแกน" copy nearby | **OK, unchanged** |
| `src/app/health/planting/[id]/*.tsx` (3 files), `src/components/ui/icons*.tsx` | `<Icons.QrCode>` on "generate plot QR" action buttons; icon component definition itself | icon-on-button / non-UI | **OK, unchanged** |
| `src/app/trace/[qr-code]/...`, `.../plot-cycle/[qr-code]/...` | `qrCode` is a route-param variable name, not a rendered icon | not applicable | **OK, unchanged** |
| **`src/components/document/gacpthai-document-layout.tsx:187-192`** (found via broader grep, not on the given suspect list) | literal text placeholder `[QR Code]` + caption "กรุณาสแกนคิวอาร์โค้ด", rendered on every quotation/invoice document (`showQR={true}` in `invoice-document.tsx`, `quotation-document.tsx`) | **FAKE — worse than decorative**: a literal non-functional label saying "please scan" | **Placeholder removed** (not replaced — see below) |

### Why the document-layout QR was removed, not replaced (ORIGINAL — superseded, see Fix-round 1 §6)
`apps/backend` has a public verify route for certificates
(`/verify/:certificateNumber`) and for trace entities
(`/verify/:entityType/:entityId`) — grepped in `apps/backend/routes/`. There is
**no public verify route for a quotation/invoice document**. Per this task's own
rule ("the URL a QR encodes must be one the backend actually serves... if there
is no such source, say so"), inventing one now would ship a QR encoding an
endpoint that does not exist. The fake placeholder was removed; `showQR` stays
on `DtamDocumentLayoutProps` (no-op, documented) so a real code can be wired in
once that backend route exists. Flagging as follow-up, not fixing further here.

**This turned out to be wrong** — my grep only covered `apps/backend/routes/`;
the reviewer found the real URL lives in `apps/backend/services/pdf/` instead
(a PDF template service, not a route file). See Fix-round 1 §6 for the actual
fix: the placeholder is now a real QR encoding `/health/payments?app=<id>`,
the same value the backend PDF already encodes.

## Shared component decision
No shared QR renderer existed — every real usage (cert-detail, payments,
planting, 2FA setup) had its own copy of `useEffect` + `QRCode.toDataURL`.
Created `src/components/ui/qr-image.tsx` (`QrImage`), lifting the cert-detail
page's approach: generate client-side from `value` so the code always reflects
the current verify URL; a `fallbackSrc` (e.g. a backend blob) is used only if
generation itself errors. Used it for the two NEW fixes (verify page,
certificates dialog).

Originally did NOT retrofit the cert-detail page itself, on the reasoning
that it already worked and touching it was pure regression risk. **Fix-round
1 reverted that call** (see §2 below) — the component's own docstring claimed
to be "the ONE real client-side rendering path", which was false as long as
cert-detail kept a second, parallel implementation. `PaymentInvoiceCard`,
`slip-upload-modal`, and `use-planting-cycle-detail-actions` (payment QRs /
2FA setup — a different kind of value, not a verify URL) remain untouched;
they were not named in the fix-round and retrofitting them is not required
for the docstring to be true (cert-detail was the one QrImage's own comment
pointed at by name).

## What changed
- `src/components/ui/qr-image.tsx` (new) — shared `<QrImage value alt size
  className fallbackSrc />`. Default size 176px (>= the 160px scan-reliability
  floor), `margin:2` quiet zone, `errorCorrectionLevel:'H'`.
- `src/app/(public)/verify/[cert-number]/page.tsx` — decorative `<QrCode>`
  icon replaced with `<QrImage value={publicVerifyPageUrl} .../>`.
  `publicVerifyPageUrl` is built from the SAME request-host source
  (`x-forwarded-host`/`host` + `x-forwarded-proto`) the page already uses for
  its backend fetch (see the file's own C1 comment) — this is the page's own
  canonical public URL, not `buildPublicVerifyUrl` (that builds the *internal
  backend API* fetch URL, a different thing). Falls back to the same
  `https://gacpth.com` host `CertificateService.getVerifyBase()` uses
  client-side if a request somehow carries no host header. Removed the now-
  unused `QrCode` lucide import.
- `src/app/health/certificates/client-view.tsx` — the QR-preview dialog now
  always renders `<QrImage value={CertificateService.getCertificateVerifyUrl(...)}
  fallbackSrc={selectedCert.qrCode ?? null} .../>` instead of a ternary between
  a backend blob and a decorative icon. `QrCode` import kept (still used at
  line 295 for the legitimate thumbnail button).
- `src/components/document/gacpthai-document-layout.tsx` — removed the fake
  `[QR Code]` placeholder block; `showQR` prop kept but documented as a no-op
  pending a real backend endpoint.
- Tests (new): `verify-real-qr.test.tsx`, `certificates-qr-dialog-real-qr.test.tsx`,
  `qr-image.decode.test.ts`.
- `package.json` (+devDependencies only): `jsqr`, `pngjs`, `@types/pngjs` —
  added explicitly to decode the generated PNG back to pixels for the
  decode-proof test. Not imported by any shipped page.

## TDD — RED then GREEN (real runs, this session)

RED (each file's fix `git stash`-ed to reproduce the pre-fix state, test run
against it, then restored):

```
verify-real-qr.test.tsx (vs pre-fix page.tsx):
  Tests: 2 failed, 1 passed, 3 total   <- fails on "renders QrImage" + "no QrCode import"

certificates-qr-dialog-real-qr.test.tsx (vs pre-fix client-view.tsx):
  Tests: 1 failed, 1 total             <- fails: expect(stub).not.toBeNull() -> Received: null
```

GREEN (fix restored, all three new suites together):

```
PASS src/app/(public)/verify/[cert-number]/__tests__/verify-real-qr.test.tsx (3)
PASS src/app/health/certificates/__tests__/certificates-qr-dialog-real-qr.test.tsx (1)
PASS src/components/ui/__tests__/qr-image.decode.test.ts (3)
Test Suites: 3 passed, 3 total
Tests:       7 passed, 7 total
```

## Decode-proof (real, not mocked)
`qr-image.decode.test.ts` deliberately does NOT mock `qrcode` (every other
suite does, since jsdom's canvas is a no-op — see
`src/__tests__/health-certificate-detail.test.tsx`). `qrcode`'s Node entry
point (`package.json` "main" -> `lib/server.js`) renders PNGs via `pngjs`
with no `<canvas>`, so `QRCode.toDataURL` genuinely works under plain
Node/Jest. The test: generate a real PNG data URL for a verify URL with the
exact options `QrImage` uses, base64-decode it, `PNG.sync.read` it into
pixels, run `jsQR` over those pixels, and assert the decoded string equals
the source URL byte-for-byte. All 3 assertions passed (including a sanity
check that a wrong value is correctly rejected by the proof itself).

## Quality gates (this session)
- `npx tsc --noEmit -p tsconfig.json`: **62 lines total**, 0 referencing any
  changed/new file — matches the stated 62-line e2e-phase0 baseline exactly,
  zero new lines.
- `eslint` (direct, `--max-warnings=0`) on all 8 changed/new files: **exit 0**,
  no output — clean.
- `npm run lint:trust`: **exit 0**, clean. Finding: this script's glob
  (`src/app/verify/**/*.{ts,tsx}`) does NOT actually reach the file this task
  fixed — the public per-certificate verify page lives at
  `src/app/(public)/verify/[cert-number]/page.tsx` (a route-group path), while
  `src/app/verify/page.tsx` is a DIFFERENT feature (`TrustVerifierPortal`,
  same URL prefix `/verify`, unrelated component). The `lint:trust` run above
  passed on the file it actually matches; the direct `eslint` run above is
  what actually covers `page.tsx` (same ruleset, explicit path, also clean).
  Flagging the glob gap rather than silently relying on a script that missed
  the file.
- Screenshot: a Next.js dev server was already running on :3000 (pre-existing
  process, not started by this task). Fetched
  `/verify/GACP-TH-2569-85B448` with a real headless Chromium (Playwright,
  already installed) and saved
  `reports/design-cleanup-2026-08-21/qr-verify-after.png` — shows the real QR
  in place of the old icon, with the cert number printed beneath it.
  **Extra proof beyond the static screenshot**: read the live page's actual
  `<img data-testid="qr-image">` `src` (a 4790-char real PNG data URL) and
  decoded it with the same `pngjs`+`jsqr` pipeline as the unit test — decoded
  value: `http://localhost:3000/verify/GACP-TH-2569-85B448`, i.e. exactly the
  page's own URL. This is the strongest evidence available: real server, real
  browser, real QR, real decode, correct value.

## Ratchet
Touches `src/` — no hardcode/dup-source/todo/env-direct introduced; the one
`showQR` no-op is documented, not silently dropped.

## Next
- BACKLOG: wire a real QR into `DtamDocumentLayout` once a public
  verify/track route exists for quotations/invoices/receipts.
  **SUPERSEDED by Fix-round 1 §6 — done, see below.**

---

## Fix-round 1 (review 6712f985 — SECURITY approve, ENGINEERING needs-fix)

1. **Base URL single-sourced.** Moved verify-URL derivation into
   `src/lib/verify/public-verify-url.ts` next to `buildPublicVerifyUrl`:
   added `DEFAULT_PUBLIC_HOST` (the one fallback constant, was duplicated
   3 ways across page.tsx / certificate-service.ts / this file),
   `buildPublicVerifyPageUrl(base, certNumber)`, and
   `resolvePublicOrigin(host, proto)`. `page.tsx`'s `fetchCertificate` now
   resolves `publicOrigin` from the SAME `headers()` call it already made
   for the backend fetch and returns it on `FetchOutcome`; the page body no
   longer calls `headers()` a second time. `certificate-service.ts`'s
   `getVerifyBase()`/`getCertificateVerifyUrl` now import
   `DEFAULT_PUBLIC_HOST`/`buildPublicVerifyPageUrl` instead of a second
   hand-rolled literal + concatenation.
2. **Cert-detail retrofitted onto `<QrImage>`.**
   `app/health/certificates/[id]/client-view.tsx:104-122` — deleted its
   bespoke `qrDataUrl` state + `useEffect` + `import QRCode from 'qrcode'`;
   renders `<QrImage value={verifyUrl} fallbackSrc={cert.qrCode ?? null} .../>`
   directly. `qr-image.tsx`'s "single client-side rendering path" docstring
   is now true (verified: `grep -rn "QRCode.toDataURL" src` finds it only
   inside `qr-image.tsx` and `page.tsx`'s SSR pre-render, both intentional).
3. **Exported QR options; deleted the tautological test.** `qr-image.tsx`
   now exports `qrRenderOptions(size)` — `{margin:2, width, errorCorrectionLevel:'H'}`
   — consumed by the component's own effect, `page.tsx`'s SSR pre-render, and
   `qr-image.decode.test.ts` (`import { qrRenderOptions } from '@/components/ui/qr-image'`,
   no retyped literal). Deleted the "decoding a code built for a DIFFERENT
   value never equals the wrong string" test — it re-decoded the SAME
   correctly-generated code and compared to an unrelated string, which is
   true regardless of whether generation/decoding actually works.
4. **Fixed the vacuous dialog assertion.**
   `certificates-qr-dialog-real-qr.test.tsx:134` queried
   `[data-testid="qr-image-stub"] svg` — the stub is a childless div, so
   that selector can never match ANYTHING, pass or fail. Added
   `data-testid="cert-qr-preview-box"` to the QR container div in
   `certificates/client-view.tsx` and rewrote the assertion to check that
   scoped box for an absent `<svg>` — a genuine regression check (the
   pre-fix code rendered a real lucide `<QrCode>` svg there on the
   no-backend-blob path).
5. **SSR pre-render.** `page.tsx` now calls
   `QRCode.toDataURL(publicVerifyPageUrl, qrRenderOptions(QR_SIZE))`
   server-side (best-effort, `.catch(() => null)`) and passes the result as
   `<QrImage initialDataUrl={ssrQrDataUrl} .../>`. `qr-image.tsx` gained an
   `initialDataUrl` prop: when set, `useState` seeds with it and the client
   effect skips regenerating — first paint / no-JS / crawler requests see
   the real code, not the loading box. New test asserts
   `data-has-initial-data-url="true"` on the (still-mocked) `QrImage` in
   `verify-real-qr.test.tsx`.
6. **Document-layout QR restored with the real backend value.** The
   reviewer found `apps/backend/services/pdf/invoice-template-service.js`
   (~1019-1024) already builds `${base}/health/payments?app=<applicationId>`
   for the printed PDF's QR — my original grep only checked
   `apps/backend/routes/` and missed this (services/pdf isn't a route
   file). `/health/payments?app=<id>` is also an existing frontend route
   (already used as a redirect target in `invoice-step.tsx:179`). Added
   `buildDocumentPaymentQrUrl(applicationId)` (exported from
   `gacpthai-document-layout.tsx`, browser-origin-based, same
   `DEFAULT_PUBLIC_HOST` fallback) and a `qrValue` prop on
   `DtamDocumentLayout`; `showQR && qrValue` renders `<QrImage size={96} .../>`
   inside the (kept) `.dtam-doc-footer-qr` box. `invoice-document.tsx` and
   `quotation-document.tsx` gained an `applicationId?: string` prop and pass
   `buildDocumentPaymentQrUrl(applicationId)` as `qrValue`; `invoice-step.tsx`
   (the sole caller of both) now passes `applicationId={state.applicationId}`
   through. Removed `.dtam-doc-qr-placeholder` from
   `gacpthai-document-styles.css` — confirmed truly dead
   (`grep -rn "dtam-doc-qr-placeholder" src` → only its own definition).
   `.dtam-doc-footer-qr` is still used, kept.

**S1 (host-header trust).** `resolvePublicOrigin` only accepts
`x-forwarded-host` when it matches an allowlist (`gacpth.com`,
`staging.gacpth.com`, `localhost`, `127.0.0.1`, or any subdomain of an
allowlisted domain, extendable via the server-only `PUBLIC_VERIFY_HOST_ALLOWLIST`
env var — deliberately NOT `NEXT_PUBLIC_*`, which is build-time-inlined and
empty at runtime per the page's own C1 comment); anything else falls back to
`DEFAULT_PUBLIC_HOST`. **Deploy note for the operator**: `deploy/nginx/gacp-platform.conf`
and `deploy/nginx/staging.gacpth.com.conf` did not set `X-Forwarded-Host` at
all (checked: zero occurrences before this change) — added
`proxy_set_header X-Forwarded-Host $host;` to each file's main frontend
`location /` block, alongside the existing `Host` header line, so the
allowlisted host actually arrives. **This nginx change ships in the repo but
still needs a real `nginx -t && systemctl reload nginx` on the server to take
effect** — flagging per instruction, not claiming it's live.

**S2 (fallback src type confusion).** `qr-image.tsx`'s fallback branch now
requires `fallbackSrc.startsWith('data:image/')` before use; any other value
(bare remote URL, garbage string) is ignored and falls through to the empty
placeholder. New test file `qr-image.test.tsx` (2 tests): fallback renders
for a real `data:image/...` value, and is ignored (falls to
`data-testid="qr-image-loading"`) for a non-data-URI value, with `qrcode`
mocked to force the generation-failure branch.

### Re-run — real output, this session
```
Test Suites: 6 passed, 6 total    Tests: 17 passed, 17 total
  qr-image.test.tsx                          (2 — NEW, S2)
  qr-image.decode.test.ts                    (2 — was 3, tautological one deleted)
  health-certificate-detail.test.tsx         (3 — cert-detail retrofit, unaffected)
  public-verify-url.test.ts                  (5 — buildPublicVerifyUrl, unaffected)
  verify-real-qr.test.tsx                    (4 — was 3, +1 SSR pre-render check)
  certificates-qr-dialog-real-qr.test.tsx    (1 — assertion now non-vacuous)

npx tsc --noEmit -p tsconfig.json: 62 lines, all in e2e-phase0/*.spec.ts
  (pre-existing baseline) — 0 lines reference any file this branch touches.
eslint --max-warnings=0 on all 15 changed/new web-app files: exit 0, no output.
```

### File list added/changed this fix round
`apps/web-app/src/lib/verify/public-verify-url.ts`,
`apps/web-app/src/lib/services/certificate-service.ts`,
`apps/web-app/src/components/ui/qr-image.tsx`,
`apps/web-app/src/app/(public)/verify/[cert-number]/page.tsx`,
`apps/web-app/src/app/health/certificates/[id]/client-view.tsx`,
`apps/web-app/src/app/health/certificates/client-view.tsx`,
`apps/web-app/src/components/document/gacpthai-document-layout.tsx`,
`apps/web-app/src/components/document/gacpthai-document-styles.css`,
`apps/web-app/src/features/permit-form/components/documents/invoice-document.tsx`,
`apps/web-app/src/features/permit-form/components/documents/quotation-document.tsx`,
`apps/web-app/src/app/health/applications/new/_steps/steps/invoice-step.tsx`,
`apps/web-app/src/app/(public)/verify/[cert-number]/__tests__/verify-real-qr.test.tsx`,
`apps/web-app/src/app/health/certificates/__tests__/certificates-qr-dialog-real-qr.test.tsx`,
`apps/web-app/src/components/ui/__tests__/qr-image.decode.test.ts`,
`apps/web-app/src/components/ui/__tests__/qr-image.test.tsx` (new),
`deploy/nginx/gacp-platform.conf`, `deploy/nginx/staging.gacpth.com.conf`.

### Not re-verified this round
Did not re-run `lint:trust` or retake the Playwright screenshot/live-decode
(not in the coordinator's fix-round checklist: "3 suites + cert-detail tests
+ tsc + eslint"); both passed/were captured against the pre-fix-round code
earlier in this session and nothing in this round changed page.tsx's rendered
markup shape or the trust-lint-scoped files' lint-relevant surface.

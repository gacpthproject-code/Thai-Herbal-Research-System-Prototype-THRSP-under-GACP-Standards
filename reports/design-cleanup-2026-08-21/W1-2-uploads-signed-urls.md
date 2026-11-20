# W1-2 — Uploaded files can be uploaded but never displayed

**Branch:** `fix/design-reproducibility`
**Commits:** backend inside `841ebdbd` (swept by a concurrent agent's commit — see §9), frontend `ba16520e`
**Status:** DONE(live proof) — real commands and output in §5
**Evidence:** `W1-2-repro-before.txt`, `W1-2-RED.txt`, `W1-2-RED-frontend.txt`, `W1-2-GREEN.txt`, `W1-2-live-proof.txt` (this directory)

---

## 1. Re-verification of the reproduction

Run against the stack on `:8000` before any change, farmer logged in through
`POST /api/auth/health/login` (token at `data.tokens.accessToken`). Full transcript in
`W1-2-repro-before.txt`.

| Step | Result |
|---|---|
| `POST /api/auth/health/me/avatar` with a PNG | **200**, `{"data":{"profileImage":"/uploads/<uuid>.png"}}`, file really written (67 bytes on disk) |
| `GET /uploads/<uuid>.png` **with** `Authorization: Bearer …` | **200 `image/png`** |
| `GET /uploads/<uuid>.png` **without** the header | **401 `{"code":"NO_TOKEN"}`** |

Confirmed exactly as reported.

### One correction to the framing, found while reproducing

The 401 is **not** universal in a browser. `apps/web-app/next.config.*` rewrites
`/uploads/:path*` to the backend, so an `<img>` load is **same-origin** and carries the
`auth_token` cookie that `setAuthCookies` writes (`apps/backend/controllers/auth-controller.js:42`
— `httpOnly`, `sameSite: 'lax'`, `maxAge` 24h). `authenticateAny`
(`apps/backend/middleware/auth-middleware.js:763-772`) reads that cookie **before** the header.
Proved live:

```
$ curl -c jar -X POST .../api/auth/health/login ...        # login=200, jar receives auth_token
$ curl -b jar http://localhost:8000/uploads/<uuid>.png     # NO Authorization header
status=200 type=image/png
```

So the real failure surface is every consumer that holds a Bearer token but **not** that cookie:

- **`apps/mobile-app`** — the Flutter client calls the backend origin directly with a Bearer token
  only (`lib/data/repositories/auth_repository_impl.dart:152`). Every private image is broken
  there today.
- A web session whose 24h `auth_token` cookie aged out while the access token kept being refreshed
  in `localStorage` — the app still works, images silently 401.
- Any cross-site embed (`sameSite: 'lax'` does not send the cookie on a subresource load from
  another site).
- Anything not going through the Next rewrite (the raw backend origin is in the CSP `img-src`).

The fix below removes the dependency on an ambient session credential entirely, which is the right
answer for all four, and is strictly tighter than the status quo for root files (see §4).

---

## 2. The mechanism, and why it fits both storage providers

`apps/backend/services/storage-service.js` owns it, extending the existing provider split:

```js
createSignedObjectUrl(objectKey, { subject, expiresInSeconds })  // -> { url, expiresAt, provider }
verifySignedObjectRequest(objectKey, query)                      // -> { valid } | { valid:false, reason }
```

- **`local`** — HMAC-SHA256 over `v1 \n <normalized object key> \n <exp> \n <subject digest>`,
  base64url, carried as `?exp=…&sub=…&sig=…`. The object key is bound into the signature, so a
  signature for one object cannot open another; `exp` is bound, so it cannot be stretched.
- **`minio`** — delegates to the provider's own `presignedGetObject(bucket, key, ttl)`. Same idea,
  implemented by the object store. `splitBucketKey` only consumes a **known** bucket name as the
  bucket, so `slips/x.pdf` is not misread as bucket `slips`.

A caller never has to know which backend is live. This extends the existing file rather than
forking a parallel system: it reuses `normalizeObjectKey`, `encodeObjectKey`,
`canUseCloudStorage`, `getMinioClient`, `BUCKETS`, and the `cloudStorageRequired()` /
`STORAGE_ALLOW_LOCAL_FALLBACK` policy (a presign failure in production-with-cloud throws instead
of silently degrading to the local HMAC scheme).

**Lifetime.** `SIGNED_URL_DEFAULT_TTL_SECONDS = 300`, hard-capped at
`SIGNED_URL_MAX_TTL_SECONDS = 600`. A caller asking for a day gets 10 minutes.

**Subject.** The raw subject never travels in the URL — `sub` is a 16-hex-char HMAC digest of the
minting user's id, and it is covered by the signature so it cannot be swapped. It exists so an
auditor can tie a served byte-range back to the identity the mint was authorised for, without
putting a user id in every access log and page source.

**Secret.** `UPLOADS_URL_SIGNING_SECRET` in `apps/backend/config/secrets.js`,
`aliases: ['HMAC_KEY']`, `required: false`. `required:false` is deliberate: `HMAC_KEY` is already
`required:'production'`, so a production deploy that satisfies `HMAC_KEY` satisfies this too and
no operator gains a new boot gate. Before use the value is **domain-separated**
(`HMAC(raw, 'gacp:uploads-signed-url:v1')`), so a URL signature can never be replayed into another
`HMAC_KEY` consumer's domain. If nothing resolves it throws `SIGNED_URL_KEY_UNAVAILABLE` rather
than signing with a constant. No secret is hardcoded, logged, or returned — a unit test greps the
source for an inline fallback.

**The gate.** `apps/backend/middleware/uploads-access.js` now accepts **either** credential:

```js
const { sensitive } = classifyUploadsPath(rel);
if (sensitive) {
    const signature = storageService.verifySignedObjectRequest(rel, req.query || {});
    if (signature.valid) { req.uploadsSignedAccess = true; return next(); }
    return authenticateAny(req, res, next);
}
```

The classification set is **byte-for-byte the same** as before — `classifyUploadsPath` only names
what the gate already did inline (root files, `slips/`, `application-drafts/`, `wizard-drafts/`,
`car/`, `audits/` sensitive; lab-report subfolders public). The C1 traversal/malformed rejection
still runs first, in both gates, before any signature is considered. No signature and no session
is still 401.

---

## 3. Access-log redaction — what I found

**There is no log redactor in this repo.** `server.js` logs every request with
`morgan('combined')`, whose `:url` token prints the full target including the query string, and
`apps/backend/shared/logger.js` is a bare winston logger with a `Console` transport and no
scrubbing layer. A repo-wide search for `redact` turned up only `server.js#redactDatabaseUrl`
(boot banner) and PII masking helpers inside `utils/field-encryption.js` — nothing on the request
path. There is no `core/network/log_redactor` equivalent.

So the redaction had to be built before a signature could live in a query string.
`apps/backend/shared/log-redact.js` plus a `morgan.token('url', …)` override registered **before**
the morgan middleware is mounted. It redacts the **value** and keeps the **key**
(`sig=REDACTED`), so an operator can still see that a signed request happened; `exp`, `sub` and
`X-Amz-Expires` stay readable because they are not credentials. It also covers
`X-Amz-Signature` / `X-Amz-Credential` / `X-Amz-Security-Token` for the MinIO provider, and the
usual `token` / `access_token` family. It never throws — on any parse problem it drops the whole
query string rather than risk printing a credential.

Proved live (§5 step 8): every `sig=` value ever written to the running server's access log is
`sig=REDACTED`; zero un-redacted values.

---

## 4. Entitlement — what is enforced, and what honestly is not

The mint endpoint (`POST /api/files/signed-url`, `apps/backend/routes/api/files/files.js`) calls
`authorizeUploadsObject(req.user, rel)` — the same function the static gate's object ACLs use, so
the two cannot drift.

**The invariant: a mint is never more permissive than what this caller's own session could already
GET from `/uploads`.**

| Path | What is enforced at mint | Source of truth |
|---|---|---|
| `slips/*` | **Real per-object ACL.** Owner + money-flow side (SoD) + tenancy, through the exact `slipService.canSeeSlip` the JSON API and the static gate use. Unknown file → 404. | `services/payment-slip-service.js:289` |
| `application-drafts/*` | **Real per-object ACL.** Owner by UUID, owner by FK token, or same-tenant provider reviewer, through `canSeeDraftDoc` + `resolveDraftOwner`. | `middleware/uploads-access.js` |
| `wizard-drafts/*` | Same ACL; `ApplicationDraft` is tenant-scoped so a cross-tenant lookup returns null. | same |
| a root file that is the caller's **own avatar** | **STRICTER than the gate.** The mint resolves `User.privacySettings.avatar` and requires an exact match. The session gate lets any authenticated user read any root file; a signed URL cannot be minted for someone else's. | `controllers/auth-controller/auth-session-security-handlers.js:121-134` |
| `audits/*` | **Real per-object ACL** when the file resolves: uploader, or same-tenant provider staff, through the `Attachment` row (`fileUrl` + `uploadedBy` + `organizationId`) that `attachmentService.attach` writes. | `services/audit-onsite-service.js:663-676` |
| `car/*` | Owner/tenant through a JSON containment lookup into `Application.formData.carDocuments[].path`. **Unverified against live data** — see below. | `routes/api/applications/applications-car.js:180-186` |
| lab-report subfolders | Public already; minting is a no-op convenience. | — |

### What genuinely cannot be expressed today — do NOT read this as done

1. **Registration ID-card images have no owner record at all.**
   `registerHealthUser` passes `idCardImage` into `userData`
   (`services/prisma-auth-service.js:648`) but `_sanitizeInput` deletes that key
   (`services/prisma-auth-service.js:55`) and the `User` model has **no such column**
   (`prisma/schema/auth.prisma` — only the deprecated `idCard` / `idCardHash` / `idCardHmac`
   scalars). The bytes land on disk with nothing in the database pointing at them. There is no
   owner to check, so **no signed URL can be minted for an ID-card image** — the mint returns 404
   (proved live, §5 step 7d). Nothing in the app renders them either. This is a pre-existing
   data-model hole, not something this change closes: those files remain readable by **any**
   authenticated session through the unchanged cookie/Bearer path. It is the sharpest remaining
   instance of the "per-object owner/tenant ACL" follow-up named at
   `middleware/uploads-access.js:97-98`.

2. **`car/` resolution is written but not proven on real data.** The
   `formData: { path: ['carDocuments'], array_contains: [{ path: fileUrl }] }` predicate follows
   the same shape as the existing wizard-draft lookup, but I had no CAR-evidence row to exercise
   it against in this session. When it fails to resolve, the mint falls through to
   `SESSION_PARITY_UNRESOLVED` (below), which is safe but is not the ACL.

3. **`SESSION_PARITY_UNRESOLVED` is a real residual, not a pass.** When a draft / audit / CAR file
   cannot be resolved to an owner, the mint grants exactly what the pre-existing gate granted —
   "any valid session" — and no more. That matches the interim fail-SAFE the static gate already
   had for unresolved drafts, so nothing regresses, but it means for those objects the signed URL
   is **not** an entitlement improvement, only an ergonomic one. The `reason` field on every
   decision records which case fired, and the mint logs it.

4. **A lookup ERROR fails closed at mint** (`LOOKUP_FAILED` → 404) even though the static gate's
   pre-existing behaviour on a resolver error is fail-SAFE pass-through. Minting a **new**
   credential on a failed check is a different risk from letting an already-working session read
   continue, so the two deliberately differ.

5. **The signed URL is a bearer credential** for one object, exactly like an S3 presigned GET.
   Anyone who obtains the URL within its 10-minute window can fetch that one object. Its defences
   are the short life, the object-scoped signature, and the log redaction — not secrecy of the
   path.

---

## 5. Live end-to-end proof

Full transcript: `reports/design-cleanup-2026-08-21/W1-2-live-proof.txt`.
Stack: `NODE_ENV=development PORT=8000 DOTENV_CONFIG_PATH=<repo>/.env node -r dotenv/config server.js`,
real Supabase DB, boot line `Server accepting requests on 0.0.0.0:8000`.

```
== STEP 1 — upload an avatar ==
$ curl -s -X POST http://localhost:8000/api/auth/health/me/avatar \
    -H "Authorization: Bearer $TOKEN" -F "avatar=@up-proof.png;type=image/png"
{"success":true,"message":"อัปโหลดรูปโปรไฟล์สำเร็จ",
 "data":{"profileImage":"/uploads/1787370276370-f8535335-73b9-4c3d-8d8a-552f69e87abc.png"}, ...}
HTTP:200
$ ls -l apps/backend/public/uploads/1787370276370-f8535335-73b9-4c3d-8d8a-552f69e87abc.png
-rw-r--r-- 1 charo 197609 67 Aug 22 10:44 ...

== STEP 2 — GET with the Authorization header (still works) ==
status=200 type=image/png size=67

== STEP 3 — bare GET, no auth header, no signature (what a browser <img> did) ==
{"success":false,"error":"Unauthorized","message":"No token provided","code":"NO_TOKEN"}
status=401

== STEP 4 — mint a signed URL for that object (authenticated, once) ==
$ curl -s -X POST http://localhost:8000/api/files/signed-url -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" -d '{"fileUrl":"/uploads/1787370276370-….png"}'
{"success":true,"data":{
  "url":"/uploads/1787370276370-….png?exp=1787370594&sub=1d5df908febf68cc&sig=<REDACTED IN THIS REPORT>",
  "expiresAt":"2026-08-22T03:49:54.000Z"}}

== STEP 5 — THE FIX: GET the signed URL with NO Authorization header at all ==
$ curl -o /dev/null -w "…" "http://localhost:8000/uploads/1787370276370-….png?exp=…&sub=…&sig=…"
status=200 type=image/png size=67

== STEP 6 — a bare unsigned GET is STILL 401 ==
{"success":false,"error":"Unauthorized","message":"No token provided","code":"NO_TOKEN"}
status=401

== STEP 7 — negative cases, live ==
7a tampered signature (last 2 chars flipped) ........................ status=401
7b the same signature pointed at a DIFFERENT object ................. status=401
7c exp stretched by a day without re-signing ........................ status=401
7d mint for a root file that is NOT the caller's own avatar ......... 404 NOT_FOUND, no URL
7e mint for a traversal path ........................................ 400 INVALID_PATH
7f mint with no session ............................................. 401 NO_TOKEN
7g the same signature re-fetched after its window closed ............ status=401

== STEP 8 — the access log must not contain the signature ==
GET /uploads/1787370276370-….png?exp=1787370594&sub=1d5df908febf68cc&sig=REDACTED HTTP/1.1
distinct non-REDACTED sig values in the whole access log: 0
```

Step 5 is the point of the whole change: the same object that answered 401 to a credential-less
browser-style GET in step 3 now answers **200 `image/png`** from a freshly minted signed URL, while
step 6 shows the bare unsigned GET is still 401.

---

## 6. RED → GREEN

**RED** (`W1-2-RED.txt`, `W1-2-RED-frontend.txt`) — captured before any implementation existed:

```
Test Suites: 3 failed, 3 total
Tests:       15 failed, 2 passed, 17 total
  ● … › a valid signature serves the file with the right content type — no auth header
    TypeError: storage.createSignedObjectUrl is not a function
  ● … › the :url token is overridden before the morgan middleware is mounted
    Cannot find module '../../shared/log-redact'
  ● (frontend) Cannot find module '../signed-file-url'
```

**GREEN** (`W1-2-GREEN.txt`) — `Test Suites: 10 passed, 10 total / Tests: 100 passed, 100 total`:

- `uploads-signed-url.test.js` — 10 tests: mint shape, no raw subject in the URL, verify, expired,
  tampered, exp-stretched, cross-object, missing signature, TTL cap, "the signing key comes from
  the secret manager, never a literal in code", and the MinIO branch delegating to
  `presignedGetObject(bucket, key, ttl)`.
- `uploads-access-signed.test.js` — 7 tests over a real `express.static` mount serving a real PNG:
  no-session-no-signature → 401; valid signature → **200 `image/png`**; expired → 401; tampered →
  401; one object's signature does not unlock another → 401; **existing session-based access still
  works**; a signature cannot smuggle a traversal past the path guard.
- `uploads-signed-url-route.test.js` — 12 entitlement tests: anonymous → 401; non-`/uploads` and
  traversal → 400; slip owner mints and the URL verifies for that exact object only; `canSeeSlip`
  failure → 404 with no URL; unknown slip → 404; avatar owner mints; another user → 404; draft
  owner mints; cross-tenant stranger → 404; the response body carries only `url` + `expiresAt`.
- `log-redact.test.js` — 8 tests including a source assertion that the `:url` override comes
  **before** `app.use(morgan(...))` in `server.js`.
- `signed-file-url.test.tsx` (web-app, 7 tests) including **"an uploaded image renders from a
  signed URL without an Authorization header"** — asserts `img.src` is the minted URL, contains
  `sig=`, and the element carries nothing bearer-ish.

Pre-existing suites re-run unchanged and green inside that same 100: `uploads-access`,
`uploads-access-draft-acl`, `uploads-access-traversal`, `uploads-slip-idor`,
`uploads-security-headers`, `secrets-catalog`.

**No existing test asserted the broken behaviour**, so nothing had to be updated or flagged.

`npx tsc --noEmit -p tsconfig.json` from `apps/web-app`: **62 lines, byte-identical to the
`e2e-phase0/*.spec.ts` baseline** (a `diff` against the recorded baseline reports no differences).
Zero new lines.

---

## 7. Consumers migrated, and consumers deliberately left

### Migrated (commit `ba16520e`)

One helper, three entry points, no token-attaching fetch anywhere in a component:

- `apps/web-app/src/lib/services/signed-file-url.ts` — `getSignedFileUrl(fileUrl)` plus a
  per-object cache that collapses a burst of identical mints and refreshes 30s before expiry. A
  `data:` / `blob:` / absolute source passes through unsigned. Failures throw a Thai message.
- `apps/web-app/src/lib/hooks/use-signed-file-url.ts` — `{ url, loading, error }`.
- `apps/web-app/src/components/ui/signed-image.tsx` — the same thing as a component, for lists
  where a hook cannot be called per iteration.

| Consumer | Change |
|---|---|
| `app/provider/accounting/slip-review-modal.tsx` | `<img>` / `<iframe>` / both `<a href>` now use a signed URL minted from `slip.fileUrl` (previously `PaymentService.slipFileUrl(slip.id)`, an API route that 302s to `/uploads` and leans on the cookie). Added explicit loading and Thai error states. |
| `app/provider/audits/[id]/audit-application-tab-panel.tsx` | Document viewer `<iframe>` / `<img>` / download `<a>` now use a signed URL for the selected document. Added loading and Thai error states. |
| `components/audit/ChecklistItem.tsx` | Evidence-photo thumbnails render through `<SignedImage>`; `/uploads/audits/...` URLs get signed, local camera `data:` previews pass through. |

Thai copy on every new string: `คุณ` register, no em dash, cause plus next action, no bare apology.
Example: `ไม่พบไฟล์นี้ หรือบัญชีของคุณไม่มีสิทธิ์เปิดดู คุณติดต่อผู้ดูแลระบบได้หากคิดว่าเป็นความผิดพลาด`.

### Deliberately left, with the reason

| Consumer | Why left |
|---|---|
| **`app/health/applications/new/**` (wizard document step)** | **FILE OWNERSHIP — off limits.** This is the main applicant-facing consumer. `_steps/steps/documents-step.tsx:130-138` stores `uploaded.fileUrl`; `farm-info-step.tsx:164-167,566-587` seeds land-document URLs; the review step renders them through `review-step-helpers.ts:76-77`. **What needs changing:** every place that puts a stored `/uploads/...` value into an `<img src>` / `<a href>` should call `useSignedFileUrl` (or use `<SignedImage>`); the stored values themselves stay as plain paths — never persist a signed URL. Left for a follow-up. |
| **`app/health/payments/slip-upload-modal.tsx:482`** | **FILE OWNERSHIP — off limits.** Same one-line change: wrap the preview `<img src>` in `<SignedImage>`. Note its current source may be a local `blob:`/`data:` preview, in which case `SignedImage` passes it through and nothing else is needed. |
| `lib/services/preview-document.ts` (plus `components/feature/document-uploader.tsx`, `inline-document-upload.tsx`) | **Still correct as-is.** `/uploads/*` ships `Content-Disposition: attachment` (`middleware/uploads-security-headers.js`), so opening even a *signed* URL in a tab downloads rather than previews. The blob-fetch helper is the right tool for inline preview and it works today. Switching it to a signed URL would additionally fix Bearer-only clients — worthwhile, but a separate change. |
| `app/health/documents/[id]/client-view.tsx` | Same reason: already uses `api.getBlob(view.fileUrl)` for inline render. Works today. |
| `components/ui/data-components.tsx` `Avatar`/image, `app/health/certificates/**`, `app/health/tracking/lots/**`, `app/provider/profile/security/**`, `app/provider/audits/[id]/audit-field-tools.tsx` | Not uploaded files — `data:` QR codes, bundled `/images/*` assets, and in-memory camera captures. Nothing to sign. |
| `apps/mobile-app` (Flutter) | Out of scope for this task, but it is the consumer most broken by the original bug. It should call `POST /api/files/signed-url` and load the returned URL. |

---

## 8. What remains for the bucket-separation follow-up

1. **Per-object ACL for the two paths that still cannot express one** — ID-card root files
   (§4.1: no DB row exists at all; needs a `User.idCardImageUrl` column or an `Attachment` row
   written at registration) and CAR evidence (§4.2: needs live verification of the JSON predicate,
   or a dual-write into `application_documents`).
2. **Drain `SESSION_PARITY_UNRESOLVED`** — the wizard-draft dual-write into
   `application_documents` that `middleware/uploads-access.js:270` already tracks would remove the
   draft case; an `Attachment` row for CAR would remove the CAR case.
3. **Bucket separation proper** — public (lab reports, consumer trace) versus private (everything
   else) as separate buckets, so the default is deny and the public set is an explicit allow-list,
   instead of one mount classified by path prefix. With `createSignedObjectUrl` in place, the
   MinIO half of that becomes a config change rather than a code change.
4. **Rotate `UPLOADS_URL_SIGNING_SECRET` independently of `HMAC_KEY`** once bucket separation
   lands. The alias is a deliberate interim so no new production boot gate was introduced.
5. **`Content-Disposition: attachment` versus inline preview** — signed URLs fix `<img>`, but a PDF
   still cannot be previewed in an `<iframe>` served from `/uploads` because of the attachment
   header. Either a signature-covered `?disposition=inline` parameter or keeping the blob helper.
   Not decided here.
6. **A backend restart invalidates outstanding signatures in development** (the dev fallback secret
   is process-namespaced). Harmless at a 5-minute TTL, and it does not apply in production where
   `HMAC_KEY` is a real configured value.

---

## 9. Process note — the backend commit was swept

While I was committing, a concurrent agent working in this same checkout ran a commit that picked
up my staged index. My backend work (1,320 lines across 12 files) therefore landed inside
`841ebdbd docs(log): operator permanently deletes the data-residency rule (2026-08-21)`, whose
message does not describe it. The **content is complete and correct** — verified by re-reading
`git show 841ebdbd` — only the message is wrong. I did not rewrite history: the other agent had
files staged at that moment and an `--amend` would have swept theirs in turn. The coordinator has
said they will split that commit.

The frontend commit `ba16520e` was made with an explicit pathspec and landed cleanly. Every
subsequent commit stages explicit paths, verifies `git diff --cached --name-only` immediately
before committing, and runs the hook in the foreground.

### Files in the backend commit

```
apps/backend/services/storage-service.js          (+234)  signing mechanism, both providers
apps/backend/middleware/uploads-access.js         (+233/-14) classify + authorize + accept a signature
apps/backend/routes/api/files/files.js            (+119)  POST /api/files/signed-url
apps/backend/shared/log-redact.js                 (+110)  access-log redaction
apps/backend/config/secrets.js                    (+30)   UPLOADS_URL_SIGNING_SECRET
apps/backend/routes/api/index.js                  (+5)    mount /api/files
apps/backend/server.js                            (+7)    morgan :url override
.env.production.example                           (+5)    document the optional dedicated key
apps/backend/__tests__/unit/uploads-signed-url.test.js        (+169)
apps/backend/__tests__/unit/uploads-signed-url-route.test.js  (+211)
apps/backend/__tests__/unit/uploads-access-signed.test.js     (+134)
apps/backend/__tests__/unit/log-redact.test.js                (+72)
```

### Synthetic account used for the live proof

`1999000123453` / `uploads-proof@example.test`, created through the public
`POST /api/auth/health/register` endpoint on the shared dev database, in line with the existing
practice for live proofs (`evidence/live-proofs-2026-08-20/INDEX.md`). No money state, no
workflow state, and no existing row was touched.

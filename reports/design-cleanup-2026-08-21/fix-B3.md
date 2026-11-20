# fix-B3 — deleting a draft attachment published it — 2026-08-23

Status: DONE(probe:jest — 7 suites / 96 tests, output below) · fix proven live end-to-end against the real DB
Scope: `apps/backend/middleware/uploads-access.js` (the report's `services/uploads-access.js` does not exist),
the draft-document DELETE in `apps/backend/routes/api/applications/applications.js`, and their tests.

## Root cause (both halves)

- `uploads-access.js:336` (pre-fix) `if (!owner) { return next(); }` — an object whose owner could not be
  resolved kept only the session-presence gate. "We cannot tell whose this is" meant "serve it".
- `applications.js:1197` DELETE `/draft-documents/:documentId` dropped the `formData.draftDocuments` entry and
  hard-deleted the mirrored row (`application-document-sync.js:77` `deleteMany`) but never unlinked the file.
- The mirrored row was the ONLY owner record the gate read. So the delete *created* the unresolvable state
  the gate treats as permission: 404-for-everyone-but-the-owner → 200-with-bytes-for-any-logged-in-user.

## What I changed and why (the deliberate call the task asked for)

1. **Fail closed.** `gateDraftObjectAccess` (`uploads-access.js:365-380`) no longer resolves+decides on its own;
   it calls `authorizeUploadsObject` — the resolver already wired to the signed-URL mint — so gate and mint
   cannot drift. `authorizeUploadsObject`'s unresolved branch flipped from
   `{allowed:true, reason:'SESSION_PARITY_UNRESOLVED'}` to `{allowed:false, reason:'OWNER_UNRESOLVED'}`
   (`:519`). A lookup error → 500 (`:376`), never bytes. This tightens the mint for car/audit paths too:
   that is intentional — the mint invariant is "never more permissive than the gate".
2. **Delete removes the bytes, not the row alone.** `unlinkStoredDraftDocument` (`applications.js:409-441`),
   called at `:1226`. NOT soft-delete: `ApplicationDocument` has no `isDeleted` column
   (`prisma/schema/application-document.prisma:24-56`), so soft-delete means a migration = Tier C, outside the
   authorisation I have — and it would keep both the PII metadata and the bytes when the applicant asked for
   the file to be gone. Hard-delete + unlink + a gate that fails closed is coherent on its own.
   Path confinement reuses `storageService.resolveWithinUploads` exactly as `wizard-controller.js:203-215`
   does, so a poisoned `fileUrl` cannot become an arbitrary file delete. Unlink failure never fails the request.
3. **Availability guard for the fail-closed switch.** `resolveApplicationDraftDocumentOwner`
   (`uploads-access.js:294-311`) resolves `application-drafts/*` against the CANONICAL record —
   `Application.formData.draftDocuments[].fileUrl`, written in the same request as the bytes — when the
   best-effort mirror is absent. Without it, fail-closed would have locked owners out of every file whose
   dual-write failed (H7). Proven live below: with the mirror row deleted, the owner still gets 200.

## RED first

```
$ npx jest __tests__/unit/uploads-access-draft-acl.test.js          (fail-closed expectations, pre-fix)
  × an application-draft with NO owner record anywhere → 404, bytes never served   Expected 404, Received 200
  × an unresolvable wizard-draft → 404, bytes never served                          Expected 404, Received 200
  × a resolver ERROR does not serve the bytes → 500                                 Expected 500, Received 200
  × a DIFFERENT applicant is still refused → 404                                    Expected 404, Received 200
Tests: 4 failed, 9 passed, 13 total

$ npx jest __tests__/unit/draft-document-delete-removes-bytes.test.js               (pre-fix)
  × unlinks the stored file inside the uploads root
    expect(jest.fn()).toHaveBeenCalledTimes(1) — Received number of calls: 0
Tests: 1 failed, 4 passed, 5 total
```
(The three passing rows in the delete suite are negative controls — pre-fix nothing unlinks at all, so only the
load-bearing assertion could go red. They earn their keep after the fix, when unlink is live.)

## GREEN

```
$ npx jest __tests__/unit/uploads-access-draft-acl.test.js __tests__/unit/draft-document-delete-removes-bytes.test.js \
           __tests__/unit/uploads-signed-url-route.test.js __tests__/unit/uploads-access.test.js \
           __tests__/unit/uploads-access-signed.test.js __tests__/unit/uploads-access-traversal.test.js \
           __tests__/unit/applications-route-rbac.test.js
PASS ×7    Test Suites: 7 passed, 7 total    Tests: 96 passed, 96 total
```

## Live proof

**1. The bug still reproduces on preview (main, unfixed)** — farmer A uploads, farmer B reads.
```
POST /api/applications/draft-documents (A)  → fileUrl /uploads/application-drafts/1787500201010-ac2dcf1d-…png
BEFORE DELETE  A(owner) → 200 image/png 70B      B(other) → 404 {"success":false,"error":"NOT_FOUND"}
DELETE /api/applications/draft-documents/<id> (A) → {"success":true,...,"deleted":true}
AFTER  DELETE  B(other) → 200 image/png 70B      bytes identical to the uploaded probe: true
```

**2. The fix, run live against the same Supabase database** (fixed code started locally on :5099, real DB,
real logins for the same two farmers, same HTTP stack — preview cannot show this until the fix deploys):
```
FAIL-CLOSED (file on disk, no owner row anywhere — exactly the post-delete state preview is in):
  disk: 70 bytes present     B(other) → 404 {"success":false,"error":"NOT_FOUND"}
                             A(farmer) → 404 {"success":false,"error":"NOT_FOUND"}
FULL CYCLE:
  upload (A) → on disk: YES
  BEFORE DELETE  A(owner) → 200 image/png 70B     B(other) → 404 NOT_FOUND
  DELETE (A)     {"deleted":true}                 on disk after delete: NO
  AFTER  DELETE  B(other) → 404 NOT_FOUND         A(owner) → 404 NOT_FOUND
H7 FALLBACK (mirror row deleted for one probe file, bytes + canonical entry left in place):
  mirror rows for this file: before=1 deleted=1;  canonical resolver found owner row: fa8fa62b-…
  A(owner) → 200 image/png 70B                    B(other) → 404 NOT_FOUND
```
The H7 block also proves the new `array_contains` query resolves in real Postgres, not just against a mocked
Prisma — that was the one part of the fix a unit test could not honestly assert.

## Cleanup

- Local: both probe files gone from `apps/backend/public/uploads/application-drafts/`, A's draft-document list
  back to `[]` (it was `[]` before I started). Local server stopped (pid 2572).
- **Outstanding, not mine to remove:** the preview reproduction left one orphan on the preview server's disk —
  `public/uploads/application-drafts/1787500201010-ac2dcf1d-70bf-40ed-873d-ae0618b0027e.png`, a 70-byte 1×1
  transparent PNG, no PII. Its DB records are gone, so no API can delete it — that IS the bug. It becomes
  unreadable the moment this fix deploys; `rm` it on the origin host at the next deploy along with the two
  probe files 07-BUG-HUNT.md §217 already reported.

## Concerns / things I did not fix

- **Behaviour change beyond B3, deliberate:** a `wizard-drafts/*` file whose `ApplicationDraft` is soft-deleted
  (`resolveDraftOwner` filters `isDeleted:false`) now returns 404 to everyone, including its owner. Same for
  `car/*` and `audits/*` objects that fail to resolve — previously any session was served. I judged
  fail-closed correct for all of them; if the operator wants the old behaviour anywhere, it needs a real
  allow-list, not a catch-all pass-through.
- **H7 itself is untouched.** The dual-write is still best-effort (`applications.js:1171`, post-diff). It no longer
  decides authorization alone, so a failed write no longer publishes a file — but the fraud-scan store can
  still silently miss rows. Separate fix.
- **L3:** no amount, charge, settlement or ledger path is touched by this diff.
- **Secret near-miss (must report, L2):** masking the UAT creds file with `awk -F'\t'` printed two bare
  password lines (`walk1=`, `farmerA=`) into my transcript before I switched to a correct mask. The values are
  not repeated anywhere in this report and were never sent anywhere. Rotate them:
  `scripts/ops/run-walkthrough.sh --seed-uat`.

## Files changed

```
apps/backend/middleware/uploads-access.js
apps/backend/routes/api/applications/applications.js
apps/backend/__tests__/unit/uploads-access-draft-acl.test.js         (interim pass-through test inverted)
apps/backend/__tests__/unit/draft-document-delete-removes-bytes.test.js   (new)
```

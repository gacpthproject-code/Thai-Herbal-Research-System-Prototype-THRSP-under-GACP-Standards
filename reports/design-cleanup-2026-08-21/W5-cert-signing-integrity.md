# W5 — Ruling 2: certificate signing survives machine moves and never degrades silently

Date: 2026-08-22 · Branch `fix/cert-signing-key-integrity` from `687494c6` · Worktree `C:/Users/charo/Documents/GitHub/gacp-wt-signing`
Tier: **C** (schema + identity/trust) → operator merges. Nothing committed; nothing applied to any database.
Ruling: `reports/design-cleanup-2026-08-21/03-OPERATOR-DELEGATED-RULINGS.md` §ข้อ 2.

---

## 0. The one thing to read first

The ruling was written against a hypothetical ("if the key is lost the system mints a new one and old
certificates stop verifying"). A read-only query of the demo database on 2026-08-22 shows the failure has
**already happened**, in the milder of its two forms:

```
certificateNumber      createdAt                  documentHash  signature  signatureKeyId
GACP-ERP-100012        2026-08-16T00:11:45.811Z   absent        NULL       NULL
GACP-TH-2569-E0DF5B    2026-08-18T19:42:37.434Z   present       NULL       NULL
GACP-TH-2569-85B448    2026-08-20T03:20:49.917Z   present       NULL       NULL
```

CERT-01 (the PKI signature) shipped `465afea3`, 2026-06-07. All three certificates were minted after that
and **not one carries a signature**. The dev key at `apps/backend/keys/private.pem` (written 2026-08-14) is
encrypted under `dev-rsa-passphrase-${pid}-${Date.now()}` (`config/secrets.js:243`), a value no later
process can reproduce, so every issuance hit `ERR_OSSL_BAD_DECRYPT` and took the hash-only branch in
silence. The certificate the operator pressed through the real UI on 2026-08-20 (`GACP-TH-2569-85B448`,
memory: *plot-areaunit fixed+healed*) is one of them.

So Ruling 2 is not preventative work. Defect 2 is live and has produced three unsigned government
e-certificates.

---

## 1. The three defects, verified at HEAD `687494c6`

### Defect 1 — silent key regeneration · `apps/backend/services/crypto/signature-service.js:345-358`

```js
async ensureLocalKeys() {
  try {
    await this.loadPublicKey();
    await this.loadPrivateKey();
    logger.info('Loaded existing keys');
  } catch (_error) {
    logger.warn('Keys not found, generating new key pair...');
    await this.generateKeyPair();
  }
}
```

Two separate holes, only the first of which the ruling anticipated:

1. **Missing → regenerate, in every environment.** A fresh container, a machine move, or a mount that did
   not come up mints a *new* certifying authority. Every certificate signed with the old key stops
   verifying, and the only trace is one `warn` line.
2. **Present but unusable → treated as fine.** `loadPrivateKey` reads bytes; it never checks the key can be
   decrypted. A `private.pem` whose passphrase is gone loads "successfully" and fails much later, inside
   `signWithLocalKey`, where defect 2 swallowed it. This is what produced the three rows above.

A third hole surfaced while proving the fix (§5): `signWithLocalKey` never awaited `initialize()`, so the
first signature of a process could read the on-disk key *before* the boot check had validated or replaced
it — a race, deterministic in practice because `initialize()` yields on its first `await`.

### Defect 2 — hash-only fallback · `apps/backend/services/certificate-service.js:438-452`

```js
// Best-effort: a signing outage must NOT block the single-auditor auto-issue flow —
// the cert still issues with SHA-256 hash integrity and `signature` stays null.
} catch (signErr) {
    logger.error(`... (issuing with hash-only integrity): ${signErr.message}`);
}
```

The comment states the trade-off honestly and gets it backwards. `documentHash` proves the row agrees with
itself; anyone who can rewrite the row can rewrite the hash with it. It is an internal consistency check,
not third-party verification. A GACP certificate without its signature is not a weaker certificate, it is
an unverifiable one — and the public verify page will happily show it as VALID on hash integrity alone.

### Defect 3 — no public key on the row · `apps/backend/prisma/schema/certification.prisma:105-107`

```prisma
  signature          String?
  signatureAlgorithm String?
  signatureKeyId     String?
```

and `certificate-service.js:1081`:

```js
const ok = await signatureService.verifyWithLocalKey(cert.documentHash, cert.signature);
```

Two arguments. `verifyWithLocalKey`'s third parameter (`publicKey`) is never passed, so verification always
uses whatever key the box holds **today**. Rotate, rebuild, or move to the ministry's hardware and every
certificate issued before the move reads as forged. `signatureKeyId` names a namespace, not a key, so it
cannot recover the right key either.

---

## 2. Boot-guard design

Two layers, because they answer different questions at different times.

**Policy — `apps/backend/config/signing-key-policy.js` (new).** One place that decides whether a key is
mandatory (`isSigningKeyRequired()`: production always, plus `REQUIRE_SIGNING_KEY=true` anywhere) and which
key is expected (`getExpectedSigningKeyFingerprint()`). Both resolve through `config/secrets.js`, where two
catalogue entries were added (`secrets.js:246-263`). It lives in `config/` deliberately: services must not
read `process.env` directly (the env-direct ratchet counts those, and the repo's rule is one catalogued
lookup path). Making the requirement opt-in outside production means staging and CI can exercise the exact
production contract without pretending to be production.

**Boot refusal — `config/boot-secret-guard.js:217` / `:297`, wired at `server.js:42`.** Synchronous, runs
before the express app is built, next to the existing production-secret sentinel guard it mirrors. It:

- reads `public.pem` + `private.pem` from the signature service's own `DEFAULT_KEY_DIR` (exported, so the
  guard and the service can never drift to different directories);
- performs a real sign → verify round trip. "Are the files there?" is the question that let defect 1(2)
  through; "can this key sign?" is the question that catches it;
- compares `sha256(public.pem)` against `SIGNING_KEY_FINGERPRINT` when pinned;
- on any failure writes a Thai + English block naming the reason (`KEY_UNREADABLE`, `KEY_UNUSABLE`,
  `KEY_PAIR_MISMATCH`, `PASSPHRASE_UNAVAILABLE`, `FINGERPRINT_MISMATCH`), the key directory, and the action,
  then `exit(1)`.

`ALLOW_PENDING_SECRETS` deliberately does **not** bypass this. That hatch exists so a pilot can run while
Finance confirms bank details; a wrong signing key is not a pending value, it is an invalid certificate.

**Runtime — `signature-service.ensureLocalKeys()` (`:468`).** Same decision, applied where the service
actually loads the key: load → `_assertKeyPairUsable()` (`:519`, sign+verify probe) → on failure either
throw a fatal (required runtime) or regenerate with a loud `DEV KEY GENERATED` warning naming
`REQUIRE_SIGNING_KEY` — then `_assertKeyFingerprint()` (`:550`) in **every** environment, because a
generated dev key can never match a pinned fingerprint and a developer who pins one should get the same
answer production gives.

Side effect worth naming: the dev branch now regenerates on an *unusable* key, not only a missing one.
That is what unbricks local signing — the stale 2026-08-14 dev key is replaced on next boot instead of
failing forever. Nothing under `apps/backend/keys` in the main checkout was touched by this work.

Fingerprint derivation is now one function, `fingerprintPublicKey` (`signature-service.js:38`), shared by
the boot guard and the verify response. It is `sha256` over the PEM with CRLF normalised to LF, which is
byte-identical to the inline derivation H1 has been publishing for any LF PEM — so no fingerprint already
surfaced changes — and additionally means a key file mounted or checked out on Windows does not read as a
different key.

---

## 3. Fail-closed issuance and what it does to the state machine

`certificate-service.signCertificateDataOrThrow()` (`:1089`), called at `:463` **before**
`client.certificate.create`. It refuses three ways, all fail-closed:

1. the signer throws (no key, wrong passphrase, unreadable mount);
2. the signer returns nothing;
3. the signature does not verify against the public key about to be pinned.

(3) is what makes the pinned column trustworthy. It is a real sign→verify round trip, so a namespace/key
mismatch — `signWithLocalKey` using a namespaced key while the pin came from the default key — can never
write a row whose own key fails to verify it. It also means the happy path is self-checking rather than
self-asserting.

The error carries `code: 'CERT_SIGNING_UNAVAILABLE'`, `statusCode: 503`, catalogued at
`shared/error-codes.js` next to its sibling `EVIDENCE_CAPTURE_UNAVAILABLE` (the other fail-closed issuance
gate) with Thai copy per `thai-ui-copy` — cause plus next action, no em dash, space before ๆ:

> ระบบลงลายมือชื่อดิจิทัลของใบรับรองไม่พร้อมใช้งาน จึงยังออกใบรับรองไม่ได้ ระบบไม่ได้บันทึกการเปลี่ยนแปลงใด ๆ กรุณาแจ้งผู้ดูแลระบบแล้วบันทึกผลการตรวจอีกครั้ง

### State machine consequence

The transition that mints certificates is `AUDIT_CONFIRMED|CAR_REVIEWING → AUDIT_PASSED`. It is **already
atomic**, and this change inherits that rather than needing new machinery — which is the answer to "make
the transition atomic": it was made atomic by BE-T1 and the fix is placed so it stays that way.

- `routes/api/audit/audits.js:527` wraps the status flip and issuance in one `prisma.$transaction`, and
  passes the tx handle into `writeApplicationStatus`.
- `application-status-writer.js:968` issues the certificate through **that same handle**
  (`generateCertificate(..., { prisma })`), so cert-gen and the status flip share one transaction.
- `application-status-writer.js:1153-1158` wraps any cert error as
  `wrapped.code = certError?.code || 'CERT_AUTO_GEN_FAILED'` and rethrows, and writes a
  `CERT_AUTO_GEN_ROLLBACK` audit marker.

So a signing outage now produces: **transaction rolls back → application stays at its pre-audit status
(`AUDIT_CONFIRMED`) → no certificate row, no partial assets → the auditor gets a 500 whose `code` is
`CERT_SIGNING_UNAVAILABLE` and can simply press the button again once the key is mounted.** Fully
retryable, no half-issued state. `findCertificateForApplication` remains the idempotency primitive, so the
retry is safe.

One deliberate non-change: `audits.js:585` returns HTTP **500** (its generic branch is
`statusCode < 500`), not 503, while forwarding `code: 'CERT_SIGNING_UNAVAILABLE'`. Widening that branch
would change the HTTP contract of every writer error on that route, which is outside Ruling 2. The UI keys
on `code`, and the code is correct. If the coordinator wants a 503 on the wire, that is a one-line follow-up
in `audits.js`, reviewed on its own.

Before the fix that same outage produced an `AUDIT_PASSED` application plus a permanently unverifiable
certificate — a state with no repair path short of revoke-and-reissue.

---

## 4. Schema, migration, backfill

**Column** (`prisma/schema/certification.prisma`, after `signatureKeyId`):

```prisma
  signaturePublicKey String?
```

Nullable, additive, PEM.

**CORRECTION (fix round).** The first version of this section argued against a fingerprint column because
"a verifier still needs a key registry to resolve it — which is the coupling this ruling removes", and
concluded the PEM makes each row self-contained. The security reviewer was right and that reasoning was
wrong. **The registry IS the trust anchor.** A row cannot be self-contained about its own trustworthiness:
`signaturePublicKey`, `signature` and `documentHash` all live on the same row, so a writer who controls the row
controls all three and can mint a valid-looking verdict under a key they own. Something outside the row has
to answer "is this key ours?", and a small operator-declared fingerprint list is exactly that thing. What
the ruling removes is the dependency on **where the key is stored** (mount, HSM, KMS) — not the need for an
anchor. The PEM column is still the right shape: it carries the material so verification needs no key
store, while §4a supplies the anchor that says the material is ours.

**Migration** — `prisma/migrations/20260822120000_certificate_signature_public_key_expand/migration.sql`:

```sql
ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "signaturePublicKey" TEXT;
```

`IF NOT EXISTS` makes it safe to run twice and safe on a database where the column was created out of band.
Purely additive — proved, not asserted:

```
$ npx prisma validate --schema prisma/schema
The schemas at prisma\schema are valid 🚀

$ npx prisma migrate diff --from-schema-datamodel <HEAD 687494c6 schema> --to-schema-datamodel prisma/schema --script
-- AlterTable
ALTER TABLE "certificates" ADD COLUMN     "signaturePublicKey" TEXT;
```

(`reports/design-cleanup-2026-08-21/W5/migration-additive-proof.txt`.) One statement, no rename, no drop,
no type change. The diff is schema-to-schema so it needed no database.

**Migration NOT applied.** `prisma migrate deploy` was not run against the Supabase dev DB, per the brief.
The only database access in this work was read-only `SELECT`.

**Backfill** — `apps/backend/scripts/backfill-certificate-signature-public-key.js`, deliberately not SQL.

The brief's premise was "every existing certificate with a non-null signature gets the current key's public
PEM (the only key that could have signed them) — verify that assumption". Two findings:

1. **On this database the backfill is a no-op.** `signature IS NOT NULL` matches **zero** rows, and
   `signatureKeyId` is NULL on all three certificates. There is no row whose signature could be invalidated
   by getting this wrong. (Which is itself the evidence for defect 2 — see §0.)
2. **The assumption should not be encoded even so.** A blind `UPDATE ... SET signaturePublicKey = <current
   key>` asserts something SQL cannot check. So the script *proves* it per row: it runs a real RSA verify of
   `signature` over `documentHash` with the candidate key and pins the key **only where that verify passes**.
   Rows that do not verify are reported and left untouched, because pinning a non-verifying key would turn a
   verifiable-somewhere certificate into a permanently-invalid one.

Read-only by default (`--apply` to write), idempotent (`signature NOT NULL AND signaturePublicKey NULL`),
and it prints certificate numbers and public-key fingerprints only — never a PEM body, private key, or
passphrase.

**Verification** now prefers the row (`certificate-service.js:1165`):

```js
const pinnedPublicKey = cert.signaturePublicKey || null;
const ok = await signatureService.verifyWithLocalKey(cert.documentHash, cert.signature, pinnedPublicKey);
```

and `verifyWithLocalKey` (`signature-service.js:405`) uses a caller-supplied PEM **alone** — it does not
even wait for service initialization on that path, because verifying an old certificate must not depend on
the state of this machine's key. Legacy rows with no pinned key fall back to the loaded key: exactly the
old behaviour, for exactly the old rows. The attested `publicKeyFingerprint` now describes the key that
actually verified rather than the box's key.

---

## 5. RED → GREEN

Four new suites, 31 tests. RED captured before the fix in `reports/design-cleanup-2026-08-21/W5/`.

| Defect | Suite | RED | GREEN |
|---|---|---|---|
| 1 | `signature-service-key-integrity.test.js` | 8 failed, 1 passed | 9 passed |
| 1 | `server-boot-signing-key-guard.test.js` | (new guard, no RED artefact — the function did not exist) | 8 passed |
| 2 | `certificate-signing-fail-closed.test.js` | 6 failed, 6 total | 6 passed |
| 3 | `certificate-signature-public-key-pinned.test.js` | 3 failed, 2 passed | 5 passed |

Defect 3's suite uses **real RSA keys**, not stubbed booleans: it signs with one key, swaps the live service
to a different key (machine move), then proves the row with `signaturePublicKey` still verifies and the same
row without it does not. It also asserts a tampered `documentHash` still fails with the pinned key — the
column is a key source, not a bypass.

Full run over every backend suite matching
`(certificate|signature|verify|trace|crypto|cert-|secrets|boot|error-codes|status-writer)`:

```
Test Suites: 2 failed, 3 skipped, 57 passed, 59 of 62 total
Tests:       8 failed, 22 skipped, 539 passed, 569 total
FAIL __tests__/unit/certificate-farm-resolution.test.js
FAIL __tests__/unit/certificate-issuance-holder-wiring.test.js
```

Those two suites (8 tests) **already fail on `687494c6`**. Verified in a clean detached worktree
(`gacp-wt-baseline`) at that exact commit: `Tests: 8 failed, 20 passed` across the same set. Same suites,
same count, before and after. No new failures.
(`reports/design-cleanup-2026-08-21/W5/GREEN-suites.txt`.)

**The race found while going green.** Four certificate suites that passed at HEAD went red mid-work with
`ERR_OSSL_BAD_DECRYPT`. They were not broken by fail-closed issuance; fail-closed issuance *revealed* that
they had been signing against a stale dev key all along and the old code had been swallowing it — the same
mechanism as the three unsigned production rows, reproduced locally. Root cause: `signWithLocalKey` did not
await `ensureInitialized()`. Fixed at `signature-service.js:343`; all four are green without any change to
their assertions.

**Ratchet** — unchanged, no counter above baseline:

```
hardcode: 36   todo: 56   env-direct: 122   dup-source: 2
PASS: no counter above baseline
```

Identical to the pre-change run in the same worktree. The new configuration reads go through
`config/secrets.js`, so `env-direct` did not move.

**Lint** — `npx eslint` over all 13 changed/added files: 0 errors, 0 warnings.

**Secrets** — `scripts/probes/no-secret.sh`: layer-1 grep 0 hits, deep scanner absent locally so the probe
correctly reports `BLOCKED: operator:secret-scanner` rather than a false PASS. `apps/backend/keys/*.pem` is
gitignored (`.gitignore:103`) and no key file is tracked or staged. No private key, passphrase, or PEM body
appears in any code, test, log line, or error message added here — error messages carry fs/OpenSSL causes
and public-key fingerprints only.

### 4a. Trust anchor for the pinned key (fix round)

`certificate-service.verifyCertificateSignature` now gates the pinned key before using it:

```js
const pinnedPublicKey = cert.signaturePublicKey || null;
if (pinnedPublicKey) {
    const trusted = await signatureService.getTrustedPublicKeyFingerprints(CERT_KEY_NAMESPACE);
    const pinnedFingerprint = fingerprintPublicKey(pinnedPublicKey);
    if (!trusted.has(pinnedFingerprint)) {
        return { signed: true, valid: false, reason: 'untrusted_pinned_key', publicKeyFingerprint: null };
    }
}
```

The trusted set (`signature-service.getTrustedPublicKeyFingerprints`) is built from three sources, none of
which a request can reach:

| source | covers |
|---|---|
| the key this box holds for the certificate namespace | everything signed today; a plain mount move keeps the same fingerprint, so a machine move needs no config change |
| `SIGNING_KEY_FINGERPRINT` (operator pin) | consulted even when the mount is unreadable, so a key-mount outage degrades verification of old certificates gracefully instead of failing them |
| `SIGNING_KEY_RETIRED_FINGERPRINTS` (comma-separated, new catalogue entry) | keys the operator has retired but still vouches for — this is what keeps a real rotation non-destructive |

Three details worth naming:

- The namespace used to build the set is the **constant** `CERT_KEY_NAMESPACE`, never `cert.signatureKeyId`.
  That column is row data too; letting it steer key selection would hand part of the anchor back to the
  attacker.
- An untrusted key gets `publicKeyFingerprint: null`. Attesting the attacker's fingerprint on the public
  response would be publishing their claim in our voice, even next to `valid: false`.
- `reason: 'untrusted_pinned_key'` is distinct from an ordinary failed verify, so "this key is not ours" and
  "this document was altered" stay separable in logs and in the response. `public.js` needs no change:
  `signatureValid` derives from `valid`, so it is already `false`.

Because the trusted set is deploy configuration, a **rotation now requires the operator to declare the old
fingerprint** or certificates signed by it stop verifying. That is a deliberate trade: silent trust of any
key on any row was the vulnerability. It is added to the operator actions in §6.

---

## 5a. Fix round — security review (2026-08-22)

Review verdict: engineering pass, security **conditional**. One crux, four engineering items. All addressed
in the same worktree; nothing committed.

### The crux — a pinned key with no trust anchor

The reviewer's finding, reproduced as a test before any fix: anyone who can write a certificate row can
generate a keypair, sign the stored `documentHash` with it, pin their own PEM, and `public.js` would publish
`sealed: true` / `signatureValid: true` carrying **their** fingerprint. The signature genuinely verifies —
cryptography was never the missing piece; an answer to "is this key ours?" was.

RED first, with real RSA (the forgery uses a genuinely valid signature, asserted as such in the test before
the assertion that matters):

```
Tests: 2 failed, 6 passed, 8 total
  ● FORGERY: a row pinning an attacker key with a genuinely valid signature is NOT valid
  ● RETIRED and NOT listed: rotation without declaring the old key refuses rather than trusts
```

GREEN after the anchor: **8 passed**. Cases: forged key → `valid:false` + `untrusted_pinned_key` + no attested
fingerprint; current key → true; retired-but-listed → true; retired-and-undeclared → false; list parsing
(spacing, blanks, mixed case); `SIGNING_KEY_FINGERPRINT` alone anchoring a row while the mount is unreadable;
legacy row (no pinned key) unchanged; a trusted key does **not** excuse a tampered hash.
Evidence: `W5/RED-4-trust-anchor.txt`.

### Engineering items

1. **Wire status now matches the catalog.** `application-status-writer.js` copies `statusCode` onto the
   wrapped error alongside `code`, and `audits.js` honours a writer-declared 5xx (anything else stays 500, so
   unexpected faults are not reclassified as retryable) and takes its Thai/English wording from the catalog
   instead of retyping it. A signing outage is now HTTP **503 / CERT_SIGNING_UNAVAILABLE** on the wire.
   Proven at route level with supertest in
   `__tests__/unit/audits-result-signing-outage-wire-status.test.js` (5 tests): 503 + code; status and both
   messages equal to the catalog entry; an undeclared failure still 500; a declared 409 still 409.
2. **One fingerprint definition.** `boot-secret-guard.js` imports `fingerprintPublicKey` (and
   `DEFAULT_KEY_DIR`) from the signature service instead of re-deriving the hash inline. The drift risk was
   real and specific: a guard that calls the mounted key fine and a verifier that then calls the same key a
   stranger.
3. **No unhandled rejection.** `this.initPromise = this.initialize()` can now reject (required runtime, no
   usable key) with nothing awaiting it at construction. A `.catch` logs the real reason once;
   `ensureInitialized()` still rejects for every caller that awaits it, so fail-closed is unchanged — the
   guard's actionable message is no longer replaced by a generic Node warning.
4. **`$queryRaw`** replaces `$queryRawUnsafe` for the backfill's constant distribution query.

### Fix-round verification

```
Test Suites: 2 failed, 3 skipped, 63 passed, 65 of 68 total
Tests:       8 failed, 22 skipped, 586 passed, 616 total
FAIL __tests__/unit/certificate-farm-resolution.test.js
FAIL __tests__/unit/certificate-issuance-holder-wiring.test.js
```

Same 2 suites / 8 tests that already fail at `687494c6` (§5 baseline). No new failures; 47 more tests pass
than in round 1. Ratchet unchanged: `hardcode=36 todo=56 env-direct=122 dup-source=2`. eslint 0 errors over
all fix-round files. Evidence: `W5/GREEN-fix-round.txt`.

Two round-1 suites were updated rather than left passing on the old contract, both legitimately:
`certificate-pki-signature.test.js` (its stub service needed `getTrustedPublicKeyFingerprints`; the default
is an empty set, so a test that pins a key must now say so) and
`certificate-signature-public-key-pinned.test.js` (its scenario is a **rotation**, which now requires the
operator to declare the retired fingerprint — the case where an undeclared key is refused is proven in the
new trust-anchor suite). No assertion was weakened.

---

## 6. What this does NOT fix — operator actions

1. **The three existing unsigned certificates are still unsigned.** This change stops new ones; it cannot
   retroactively sign old ones (that would require the key that was supposed to have signed them, which
   never existed). Decide: re-issue them, or accept them as hash-only legacy rows. They are visibly
   `signature: NULL` and the public verifier already reports `{ signed: false }` for them.
2. **Secret mount on the box.** Ruling 2 calls for the key as a read-only Docker/host secret mount. That is
   not in this diff — no compose or deploy file was touched. Until it is done, production has no key to
   refuse to boot *without*, so the guard's practical effect starts at the mount.
3. **`RSA_PRIVATE_KEY_PASSPHRASE` is unset in the root `.env`** (checked: 0 occurrences). That is why the
   dev key rotates per process. Setting a stable dev value makes local signing stable across restarts;
   production requires it already (`required: 'production'`).
4. **`SIGNING_KEY_FINGERPRINT` is not pinned anywhere.** The guard is inert until the operator sets it after
   mounting the real key. Get it from the backfill script's dry run, or `sha256` of `public.pem`.
5. **Key rotation is now a two-line change, and both lines are required.** Rotating means: update
   `SIGNING_KEY_FINGERPRINT` to the new key (or the next boot refuses) **and** append the OLD fingerprint to
   `SIGNING_KEY_RETIRED_FINGERPRINTS` (or every certificate that key signed stops verifying, reporting
   `untrusted_pinned_key`). Neither failure is silent, which is the point, but both need a runbook line.
   The old fingerprint is printed by the boot guard on every start and by the backfill script's dry run.
6. **`prisma generate` was not run.** It writes into `node_modules`, which is junctioned to the main
   checkout and shared with other agents. The coordinator must run `prisma generate` together with
   `migrate deploy` — the client needs `signaturePublicKey` before any issuance touches the new field.
7. **No PKI trust chain.** The signing key is still self-generated, not issued by a CA. Third parties can
   verify a certificate against its pinned key but nothing attests that the key belongs to กรมการแพทย์แผนไทยฯ.
   That is the open follow-up already recorded in memory (*PKI signing key*), unchanged by this work.

---

## 7. Files

**Modified (12)** — the last four are the fix round
```
apps/backend/services/crypto/signature-service.js
apps/backend/services/certificate-service.js
apps/backend/config/secrets.js
apps/backend/config/boot-secret-guard.js
apps/backend/config/signing-key-policy.js
apps/backend/server.js
apps/backend/shared/error-codes.js
apps/backend/prisma/schema/certification.prisma
apps/backend/scripts/backfill-certificate-signature-public-key.js
apps/backend/services/application-status-writer.js          ← fix round (statusCode propagation)
apps/backend/routes/api/audit/audits.js                     ← fix round (honour 503, catalog wording)
apps/backend/__tests__/unit/certificate-pki-signature.test.js
apps/backend/__tests__/unit/certificate-signature-public-key-pinned.test.js
```

**Added (9)**
```
apps/backend/config/signing-key-policy.js
apps/backend/prisma/migrations/20260822120000_certificate_signature_public_key_expand/migration.sql
apps/backend/scripts/backfill-certificate-signature-public-key.js
apps/backend/__tests__/unit/signature-service-key-integrity.test.js
apps/backend/__tests__/unit/certificate-signing-fail-closed.test.js
apps/backend/__tests__/unit/certificate-signature-public-key-pinned.test.js
apps/backend/__tests__/unit/server-boot-signing-key-guard.test.js
apps/backend/__tests__/unit/certificate-pinned-key-trust-anchor.test.js       ← fix round
apps/backend/__tests__/unit/audits-result-signing-outage-wire-status.test.js  ← fix round
```

(`signing-key-policy.js`, `backfill-...js` and the two named test files appear in both lists: added in round 1,
edited again in the fix round.)

Two pre-existing tests were modified, both because a contract genuinely changed, never to make a failure go
away: `certificate-pki-signature.test.js` (third argument to `verifyWithLocalKey`, then the trusted-set
accessor on its stub) and `certificate-signature-public-key-pinned.test.js` (its rotation scenario now needs
the retired fingerprint declared). Cases were **added** in both. No assertion was weakened.

**Evidence** — `reports/design-cleanup-2026-08-21/W5/`: `RED-1-key-integrity.txt`,
`RED-2-fail-closed.txt`, `RED-3-pinned-key.txt`, `RED-4-trust-anchor.txt`, `GREEN-suites.txt`,
`GREEN-fix-round.txt`, `migration-additive-proof.txt`.

**Suggested fix-round commit** (on top of `da393a24`):
`fix(cert): anchor the pinned public key in a trusted-fingerprint set; wire 503 through to the route`

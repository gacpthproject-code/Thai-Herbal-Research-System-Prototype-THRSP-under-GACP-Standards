## G4 prep P2 — officer accounts exist and can log in — 2026-08-25
Status: DONE(probe:login-probe + me-probe against https://preview.gacpth.com)

### Seeding is the only path that exists — this is design, not a shortcut

`apps/backend/routes/api/auth/auth-provider.js` mounts exactly four routes:
`POST /login` (:33), `POST /logout`, `GET /me`, and `GET|PUT /me/notification-prefs`.
There is **no `/register`**, and no other provider-account creation route anywhere in the file.
Confirmed at the live surface too, not only by reading:

```
{"probe":"/api/auth/provider/register","status":404,"body":"Cannot POST /api..."}
{"probe":"/api/auth/provider/signup","status":404,"body":"Cannot POST /api..."}
```

A DTAM officer identity is issued by the ministry, not self-claimed, so the platform
deliberately offers no self-registration for it. G4.0 rule 1 ("no seeding — every row from real
use") is a rule about **applicant-generated** data; for an officer there is no "real use" door to
walk through. Seeding is therefore the officer account's only legitimate origin, which is a
property of the design rather than a corner cut.

### Which seed — and why neither could be run as written

**`scripts/ops/uat-account-seed.js` — rejected: it cannot create.** Every write is an `update`,
never `upsert`/`create`, and that is stated as a safety property in its own header (:43-48:
*"`update`, not `upsert`: if a row is missing … Prisma throws P2025, this script logs 'skip: not
seeded on this environment' and moves on — it will not create a user"*). It exists to rotate
passwords on rows `seed-gacp.js` already made. Against a database emptied to zero users it would
have printed five `FAILED: … not seeded on this environment` lines and exited 1. Wrong tool for a
rebuild.

**`apps/backend/prisma/seed-gacp.js` — the right fixture, wrong blast radius.** It is the only
creator of officer rows in the repo (`grep -rln "1111111111111"` over `scripts/` and
`apps/backend/prisma/` finds it plus the two ops scripts that merely reference it). Its
admin/officer block is exactly what P2 needs. But the file is monolithic — one `main()`, no flag
to limit scope — and the rest of it would have written, into a database whose entire point is
that it is clean:

| block | line | what it creates | why that is fatal here |
|---|---|---|---|
| `APPLICANTS` | :132-150, :302-370 | users `1100100100012` **and** `1100200200022` | **these are the two G4 farmers.** Pre-creating them means Farmer A and B never register through the real UI — the journey is faked at step 1, against G4.0 rule 1 |
| `SAMPLE_APPLICATIONS` | :232-270, :441-476 | `APP-68-001/002/003` parked at `ASSIGNED_FOR_REVIEW` / `APPROVED` / `AUDIT_CONFIRMED` via an eslint-disabled direct status write | fake applications at fake statuses, sitting in the queue the officers are about to work |
| ERP fixtures | :477-660 | a Farm, Plots, a PlantSpecies, a CertificationStandard, a Certificate | pollutes the exact `Lot → HarvestBatch → cycle → plot → certificate → application → farmer` chain G4.4 requires to be provably clean |

**What I ran:** the admin + officer block of `seed-gacp.js` **only**, values copied verbatim
(`ADMIN` :156-162, `OFFICERS` :172-231, admin upsert :375-401, officer upsert :410-441), with the
same `hashId` = sha256 (:69-71), the same `BCRYPT_ROUNDS = 12` (:62), and the same
`accountType: 'PROVIDER'`, `status: 'ACTIVE'`, `ministryVerified: true`, `organizationId` = the
`default` org (`621002a3-4542-446e-9504-838693009c84`). No extra columns, so the row shape is
byte-for-byte what a normal `seed-gacp.js` run produces. Runner lives in the scratchpad
(`p2/seed-officers.js`) — no repo file was edited. Passwords were read from the walkthrough creds
file and never printed or logged.

### Accounts as stored (read back with raw SQL, not echoed from the writer)

```
TOTAL USERS = 5
{"providerId":"1111111111111","role":"document_reviewer","accountType":"PROVIDER","status":"ACTIVE","authType":"PROVIDER_ID","ministryVerified":true,"isDeleted":false,"healthId":null,"twoFactorEnabled":false}
{"providerId":"2222222222222","role":"auditor",          "accountType":"PROVIDER","status":"ACTIVE","authType":"PROVIDER_ID","ministryVerified":true,"isDeleted":false,"healthId":null,"twoFactorEnabled":false}
{"providerId":"3333333333333","role":"scheduler",        "accountType":"PROVIDER","status":"ACTIVE","authType":"PROVIDER_ID","ministryVerified":true,"isDeleted":false,"healthId":null,"twoFactorEnabled":false}
{"providerId":"4444444444444","role":"account",          "accountType":"PROVIDER","status":"ACTIVE","authType":"PROVIDER_ID","ministryVerified":true,"isDeleted":false,"healthId":null,"twoFactorEnabled":false}
{"providerId":"9876543210987","role":"admin",            "accountType":"PROVIDER","status":"ACTIVE","authType":"PROVIDER_ID","ministryVerified":true,"isDeleted":false,"healthId":null,"twoFactorEnabled":false}
ROLE DISTRIBUTION = [{"role":"account","n":1},{"role":"admin","n":1},{"role":"auditor","n":1},{"role":"document_reviewer","n":1},{"role":"scheduler","n":1}]
LEGACY/UPPERCASE SPELLINGS = []
```

**The dual-spelling problem is gone.** The old data carried `AUDITOR` alongside `auditor`,
`HEALTH` alongside `health`, and a legacy `REVIEWER_AUDITOR`. The rebuild has one spelling per
role, all lowercase-canonical, each matching `CANONICAL_ROLES` in
`apps/backend/shared/canonical-rbac.js:33-60` (`ADMIN:'admin'` :34, `SCHEDULER:'scheduler'` :39,
`DOCUMENT_REVIEWER:'document_reviewer'` :40, `AUDITOR:'auditor'` :41, `ACCOUNT:'account'` :51).
All five are members of `PROVIDER_CANONICAL_ROLES` (:235-246), which is what `normalizeRole` +
`isProviderRole` gate the login on (`auth-provider.js:85-93`) — so the spelling is not cosmetic,
it is the thing that decides whether the account can authenticate at all.

`role: 'account'` for `4444444444444` is the **legacy union role, kept on purpose**, per the
fixture's own note (`seed-gacp.js:213-221`): Tier 16 splits it into `account_dtam` /
`account_platform`, but which side an account belongs to is an operator decision recorded by
`scripts/migrate-account-role.js`, not something a seed decides silently. It is canonical and
provider-valid today, and it logs in.

### Login proof — POST https://preview.gacpth.com/api/auth/provider/login

All five, one attempt each (the route locks an account after 5 failures, `auth-provider.js:127-147`):

| role | providerId | HTTP | token? | JWT role / canonicalRole | jti | MFA gate |
|---|---|---|---|---|---|---|
| reviewer  | 1111111111111 | **200** | yes (659 ch) | `document_reviewer` / `document_reviewer` | yes | none |
| auditor   | 2222222222222 | **200** | yes (631 ch) | `auditor` / `auditor` | yes | none |
| scheduler | 3333333333333 | **200** | yes (639 ch) | `scheduler` / `scheduler` | yes | none |
| account   | 4444444444444 | **200** | yes (631 ch) | `account` / `account` | yes | none |
| admin     | 9876543210987 | **200** | yes (623 ch) | `admin` / `admin` | yes | none |

Every response carried `success:true`, `dashboardUrl: /provider/dashboard`, and
`organizationId: 621002a3-…` in the JWT. None returned `mfa_required` or `mfa_setup_required`.

**A token that is issued is not yet a session**, and the failure mode this lane exists to catch is
a seed that runs clean but yields an account that cannot actually work. So each token was then
spent on `GET /api/auth/provider/me`:

```
{"role":"reviewer", "meStatus":200,"meOk":true,"meRole":"document_reviewer","meProviderIdMasked":"1-XXXX-XXXX-X-1111"}
{"role":"auditor",  "meStatus":200,"meOk":true,"meRole":"auditor",          "meProviderIdMasked":"2-XXXX-XXXX-X-2222"}
{"role":"scheduler","meStatus":200,"meOk":true,"meRole":"scheduler",        "meProviderIdMasked":"3-XXXX-XXXX-X-3333"}
{"role":"account",  "meStatus":200,"meOk":true,"meRole":"account",          "meProviderIdMasked":"4-XXXX-XXXX-X-4444"}
{"role":"admin",    "meStatus":200,"meOk":true,"meRole":"admin",            "meProviderIdMasked":"9-XXXX-XXXX-X-0987"}
```

Side effect worth recording: these logins are also the proof that **preview.gacpth.com runs
against this database** — rows written locally a minute earlier authenticated remotely. The
default `AUTH_LOOKUP_USE_HMAC=false` path (sha256 → `providerIdHash`) is confirmed live; the seed
sets `providerIdHash` exactly as `seed-gacp.js` does, so writer and reader agree.

### Exactly what I wrote to the live database

**5 `User` rows, nothing else.** Counted before and after:

| table | before | after |
|---|---|---|
| users | 0 | **5** |
| application / certificate / farm / plot / invoice | 0 each | **0 each** |
| plantSpecies / certificationStandard | 6 / 4 | 6 / 4 (untouched) |
| organizations | 43 | 43 (untouched) |

### Findings for the coordinator

1. **The second auditor is missing, and certificate issuance will need it.**
   `seed-gacp.js:191-199` defines a 6th officer `2222222222223`
   ("หัวหน้าผู้ตรวจประเมิน (ผู้ตัดสินการรับรอง)") with the note that *ISO/IEC 17065 §7.6 requires
   the approver/issuer to differ from the on-site evaluator*. It is outside P2's five, so I did
   not create it. If the G4 issuance step enforces that separation, that account must be added
   before the certificate can be minted.
2. **The repo has no officers-only seed entry point.** This is the real gap that forced a
   scratchpad runner: `seed-gacp.js` is all-or-nothing, and `uat-account-seed.js` cannot create.
   A `--users-only` / `--officers-only` guard on `seed-gacp.js` would turn an officer rebuild into
   a one-line repo command with a reviewable diff. Not fixed here — outside this lane's files.
3. **43 orphan `Organization` rows survived the emptying** (`m5-pac-…`, `a0-pr2-…`, `e2e-mint-…`,
   `wf-f7-…` — old per-test tenants). Harmless to the journey; all five officers sit under
   `default`. Flagged only because "the database is clean" is not quite true of that table.
4. **Passwords are the pre-existing walkthrough set**, reused so the creds file stays accurate.
   That file's header says it is valid until the next `--seed-uat` run rotates it; anyone running
   `run-walkthrough.sh --seed-uat` now will rotate these five successfully, because
   `uat-account-seed.js` keys on the same `providerIdHash` the new rows carry.

Blocked: -
Next: farmer lanes register `1100100100012` / `1100200200022` through the real UI; add
`2222222222223` if the issuance step needs a separate certification decision-maker.
Evidence: this file · scratchpad `p2/{seed-officers,verify-roles,login-probe,me-probe,state}.js`

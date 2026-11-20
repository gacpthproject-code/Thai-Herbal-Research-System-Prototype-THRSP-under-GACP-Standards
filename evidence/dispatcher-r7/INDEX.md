# fix/dispatcher-tools round 7: evidence index

Range d4751295c..HEAD. Every test run used the round-7 scratch Postgres (container disp-r7-pg, database
gacp_r7, 155 migrations), a private SIGNING_KEY_DIR and PAYMENT_ADAPTER=mock. The database URL and the
signing passphrase were read from 0600 files inside the scripts; `scripts/backend-env.sh` refuses to
start unless DATABASE_URL names that scratch database.

## RED then GREEN, per item (`redgreen/`)

| Item | RED commit | RED output | Fix commit | GREEN output |
|---|---|---|---|---|
| M-1 site-contact ask | 04c33f7df | m1-red.txt (2 failed: queue row says siteContactRequestedAt after a thrown or hung notice) | 9e586be18 | m1-green.txt (3/3) |
| M-1 pattern, visit reminder | 68810a6ab | visit-throw-red.txt (record kept after the throw) | 15b35c017 | visit-throw-green.txt (7/7) |
| L-3 reminder not registered | 8b4d566aa | l3-red.txt (runVisitReminders called once; 13 blocks, not 12) | 81b44266b | l3-green.txt (24/24) |
| I-1 card promises only a coming ask | 6261bf1c5 | i1-backend-red.txt (door lacks siteContactRequestPending), i1-web-red.txt (card says "ระบบจะแจ้ง" with no word from the server) | 9d377a77c | i1-backend-green.txt, i1-web-green.txt |
| I-3 unread English keys | a11826597 | i3-red.txt (the 8 values) | c68d8f361 | i3-green.txt |
| Inspector page "Workflow" (order 51) | fdb001870 | page-copy-red.txt | 9a3547202 | page-copy-green.txt (59/59 page tests) |
| I-8 picker note | 509d12963 | i8-red.txt (note missing) | e3b374391 | i8-green.txt (10/10) |
| Org-scope monitor test, date-dependent (main test) | today's run at d4751295c and at 7ee0eb5e7 | org-scope-at-base-d4751295c.txt (stuckItems [] : 4 calendar days back is 1 working day on the 2026-10-13 holiday) | 0afa28e97 | org-scope-green.txt (27/27) |

Mutants, each run against the committed fix and restored from git:

- `m1-mutant-nolease.txt`: the claim ignores another run's fresh claim. A concurrent run asks twice.
- `m1-mutant-keepclaim-on-throw.txt`: a thrown notice keeps the claim. The next run asks nobody.
- `m1-mutant-no-takeover.txt`: a stale claim is never taken over. The later run asks nobody.
- `i1-mutant-nowindow.txt`: the pending rule ignores the visit date. The job asks a passed visit, and the calendar promises it.
- `i1-web-mutant.txt`: the card promises whatever the server says. Two card tests fail.

`narrowed-three.txt` and `narrowed-site-contact.txt`: the three real-Postgres job suites after the
read-narrowing helper moved into the dispatcher-world fixture (16/16, then 4/4 with exact counts).

## Checks at the final head

`final-7ee0eb5e7/` holds the one heavy slot (code head 7ee0eb5e7; 0afa28e97 after it changes one test
file only):

- `backend-targeted-summary.txt`: 63 suites, 1617 tests, 1616 passed, 1 failed. The failure is the
  date-dependent org-scope monitor test above; it fails the same way at d4751295c today and passes 27/27
  after 0afa28e97.
- `probes/`: P1-P8 under both TENANT_READ_ORG_SCOPE settings, contact probes 7/7 each, lock order 2/2,
  P7 exit 0; nothing leaked.
- `screens/`: the site-contact card in its three states (will ask, asked, no ask coming) and the reason
  picker with "อื่น ๆ" (late visit shows the note, over cap does not), each at 1440x900 and 390x844;
  10/10 passed.
- `web-summary.txt`: web jest 510 suites, 4016 tests, all passed; tsc exit 0.

The slot ran (`scripts/final-job.sh`): the targeted backend tests
(`scripts/targeted-backend.txt`, every test file that loads a backend file this round touched, plus
every user of the dispatcher-world fixture), probes P1-P8 (`/tmp/dispatcher-r5/probe-run.sh`), the
round-7 screens at 1440x900 and 390x844 (`scripts/r7-shots.spec.ts` on an export of the head), web jest
(whole suite) and web tsc.

## Ratchet and error codes (`ratchet/`)

`ratchet.sh` PASS at 4c9f1860a and again at 0afa28e97: hardcode 26, todo 33, env-direct 93, dup-source 0. `--selftest` 17/17.
`extract-error-codes.js --validate`: 461 codes reconciled; `--markdown` left docs/api/error-codes.md unchanged.

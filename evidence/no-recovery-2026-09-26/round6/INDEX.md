# Round 6: atomic re-enrol attempt counter (2026-09-26)

Source: `reports/security/2026-09-26-no-recovery-round5-review.md` (APPROVE, 1 LOW). With parallel wrong codes on one session from k addresses, the count was not held to 5 (reviewer on a real Redis: k=5 → 15 codes checked, k=20 → 60). Tier C (`tier-check.txt`). Node v20.20.2; the branch is still on Node 20 pins.

| artifact | what it shows |
|---|---|
| `red-backend.txt` | the new parallel test against the round-5 code, with a 3 ms simulated Redis round trip so requests interleave. k=5 → **25** checks against the pending secret, k=20 → **100** (expected ≤ 5). The other 9 tests in the file pass |
| `green-backend.txt` | 12 suites (hardening + round 4 + enrolment + doors + catalog + SEC-002 + 3 MFA integration suites): 120/120. k=5 and k=20 are both ≤ 5, the entry is gone and the old factor is intact |
| `backend-full.txt` | full backend jest (fresh SIGNING_KEY_DIR, 3 GB heap): 848 suites passed / 31 skipped, 10,889 tests, exit 0, no failures. **No real Redis or Postgres**: Redis is an in-memory stand-in with a pipeline, so the atomicity rests on Redis INCR semantics and is not re-measured here against a real server. dedupeKey hashes are redacted |
| `key-mtime-*.txt` | `apps/backend/keys/private.pem` in the main tree unchanged (2026-09-05 22:50:35) |

Change: `services/auth/mfa-reenrol-store.js claimAttempt` runs `INCR mfa:reenrol:<id>:attempts` + `PEXPIRE` (to the entry's deadline) in one pipeline on `redisService.client`, the raw pattern rate-limiter.js uses. It runs BEFORE the code is checked. Only attempts 1–5 may check a code. Attempt ≥ 6 gets 400 `MFA_REENROL_RESTART` without a check and clears the entry. The wrong code that is attempt 5 deletes the entry and the counter. `start` resets the counter and `clear` deletes it. A store that is not connected, or a failed pipeline, gives 503 `MFA_REENROL_UNAVAILABLE` with the row unchanged (new test in `mfa-setup-reenrol.test.js`). The mfa.js catalog `source:` lines were realigned.

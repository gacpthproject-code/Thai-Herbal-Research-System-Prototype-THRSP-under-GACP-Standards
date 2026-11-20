# Round 5: verify-setup hardening + enrolment path (2026-09-26)

Source: `reports/security/2026-09-26-no-recovery-round34-review.md` (APPROVE with MEDIUMs). The fixes are controller decisions. Tier C (`tier-check.txt`).

| artifact | what it shows |
|---|---|
| `red-backend.txt` | new `mfa-reenrol-hardening.test.js` against the round-4 code: 9 failed / 9. This includes the reviewer's case: 40 wrong codes from 40 addresses, where no `MFA_REENROL_RESTART` came back and the slot survived |
| `red-web.txt` | web tests against the round-4 page + enrolment form: 3 failed / 67. The restart step, the store-outage message, and the path pin (form still on `/identity/mfa/...`) |
| `green-backend.txt` | 13 suites (new + round 4 + enrolment + the 3 MFA integration suites + SEC-002 logout): 139/139 |
| `green-web.txt` | `src/app/auth` + `src/app/provider/profile/security`: 79/79 |
| `backend-full-run1.txt` | first full run: 4 suites / 14 tests failed from my change. The new store module called `createLogger`, which the logger mocks in those suites lack, so the require threw. Inside logout, that throw landed in the access-token revocation `try`, so `accessRevoked` came back false. Fix: use the plain logger, and give the logout clear its own guard after the jti blocklist |
| `backend-full.txt` | after the fix (fresh SIGNING_KEY_DIR, 3 GB heap): 848 suites passed / 31 skipped, 10,886 tests, exit 0, no failures. **No Postgres or Redis**: the integration DB suites skipped, and Redis is an in-memory stand-in. dedupeKey hashes are redacted |
| `key-mtime-*.txt` | `apps/backend/keys/private.pem` in the main tree: 2026-09-05 22:50:35 before and after |
| `web-full.txt` | 392 suites / 3,191 tests, all pass · `web-tsc.txt` exit 0 |

## Behaviour (real mfa router, real rate limiter with its memory store, real token-revocation, session-revocation and password-management; users and Redis in memory)

1. `/verify-setup` goes through `mfaVerifyLimiter`: 5 per 15 min per IP, the limiter `/disable` uses. From one address, attempts 6–8 get 429. The pending entry carries the session's token id (`sessionFamilyId`, else `jti`). A different session, even with a VALID code for the pending secret, gets 403 `MFA_REENROL_SESSION_MISMATCH` and no backup codes. A session with no token id is also refused, at `/setup` and at `/verify-setup`. Wrong codes count on the entry, and the 5th deletes it (400 `MFA_REENROL_RESTART`). The 40-guess run ends with the entry gone and the old factor untouched; the right new-secret code afterwards gets 400.
2. The entry is deleted on `DELETE /mfa/disable`, on `changePassword` (the function behind both change-password doors), in `revokeSessionFromRequest` (both logout doors), and in `revokeAllUserTokens`.
3. A successful re-enrol writes the new secret, the backup codes and `sessionsRevokedAt` in one write. It revokes the refresh tokens, and sets a fresh `provider_token` cookie whose `iat` equals the stamp, so this session is not evicted and every token issued before the stamp is. Audit `MFA_REENROLLED {otherSessionsRevoked: true}`.
4. The web enrolment form now uses `providerApiPaths.mfaSetup` / `mfaVerifySetup` (`/api/mfa/...`). The pin test derives the expected path from `server.js` (`app.use('/api', apiRoutes)`), `routes/api/index.js` (`router.use('/mfa', …)`) and the route declarations in `identity/mfa.js`.

Web: on the security page, a re-enrol that ends in RESTART or SESSION_MISMATCH closes the QR step and says "กรุณาเริ่มย้ายใหม่…". A store outage, a 429 or a session problem is no longer reported as "รหัสปัจจุบันไม่ถูกต้อง".

Known limit, not fixed: the failure count is read-modify-write in Redis, so parallel guesses can each count from the same value. The per-IP limiter (5) and the session binding bound it. An atomic counter needs an INCR that redis-service does not expose. Left as the operator's trade-off (reported, not changed): an active lock blocks the owner's own password change.

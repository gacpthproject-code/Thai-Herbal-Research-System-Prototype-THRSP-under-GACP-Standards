# Round 4: mfa/setup (2026-09-26)

Controller decision, in line with the operator's "ถอดทั้งสองประตู": `POST /api/mfa/setup` must not switch off or overwrite an ENABLED second factor without proof. Round 3 found that it did, on any provider session. Tier C (`tier-check.txt`).

| artifact | what it shows |
|---|---|
| `red-backend.txt` | new `mfa-setup-reenrol.test.js` against the pre-change router: 8 failed / 9. With no code, `/setup` on an enabled account answered 200 and overwrote the row. First enrolment (control) passed |
| `red-web.txt` | new `mfa-reenrol.test.tsx` against the pre-change security page: 3 failed / 3. The page had no re-enrol path |
| `green-backend.txt` | the new suite + enrolment loop + second-factor doors + neighbours: 86/86 |
| `green-web.txt` | `src/app/provider/profile/security`: 7/7 |
| `backend-full-run1.txt` | the first full run had 2 failures from my change. (1) Catalog `source:` line numbers for the mfa.js codes had shifted, pinned by `second-factor-is-totp-only.test.js`; I realigned them in error-codes.js and docs. (2) A source regex expected `authenticateForMfaSetup` right after `'/setup'`; `a-locked-out-officer-can-still-enrol.test.js` now expects the new limiter in front of it. `fix-rerun.txt`: 43/43 |
| `backend-full.txt` | full backend jest after those fixes (fresh SIGNING_KEY_DIR, 3 GB heap): 847 suites passed / 31 skipped, 10,877 tests, exit 0, no failures. **No Postgres or Redis**: the integration suites skipped, and the Redis pending slot is proven only against an in-memory stand-in. This is not a full gate. dedupeKey hashes are redacted |
| `key-mtime-*.txt` | `apps/backend/keys/private.pem` in the main tree: 2026-09-05 22:50:35 before and after |
| `web-full.txt` | 392 suites / 3,188 tests, all pass · `web-tsc.txt` exit 0 |

## Behaviour (router through supertest; the users row and Redis are in memory)

- 2FA enabled, `/setup` with no code or a wrong code → 401 `MFA_CODE_REQUIRED` "Invalid code" (the same verifier and the same `error` text as `/disable`). The row is unchanged. Audit `MFA_REENROL_REFUSED`.
- The right current code → 200 with a new secret and QR. The new secret waits in Redis (`mfa:reenrol:<userId>`, 10 min, `setStrict`); the row keeps the old secret, `twoFactorEnabled: true` and the old backup codes. Audit `MFA_REENROL_INITIATED`.
- `/verify-setup` with a code from the NEW secret swaps the secret and the backup codes in one write and clears the pending slot (audit `MFA_REENROLLED`). A wrong code, or no re-enrol in progress, gets 400 and the old factor stays. Previously, `/verify-setup` on an enabled account with its current code regenerated the backup codes. That path now answers 400; no UI called it.
- Redis unavailable → 503 `MFA_REENROL_UNAVAILABLE`, nothing changed (fail-closed).
- A `/setup` that carries a code goes through `mfaVerifyLimiter` (5 / 15 min / IP, the limiter `/disable` uses). `/disable` has no per-account counter, so neither does this. First enrolment (no code) does not go through the limiter.
- No 2FA enabled: `/setup` and `/verify-setup` work as before.

## Web

`/provider/profile/security` with 2FA enabled now has "ย้าย MFA ไปแอปหรือโทรศัพท์เครื่องใหม่". It asks for the current 6-digit code, the button stays disabled until one is entered, and nothing is called on mount. It then shows the existing QR step with "แอปเดิมยังใช้ได้จนกว่าคุณจะยืนยันรหัสจากรายการใหม่". A wrong code shows "รหัสปัจจุบันไม่ถูกต้อง". The health security page has no 2FA controls at all ("ไม่มีสิ่งใดให้ตั้งค่าในหน้านี้"), and `/mfa/setup` is provider-only (authenticateForMfaSetup → authenticateProvider), so there was nothing to change on the health side. The login enrolment form (`mfa-enrolment-form.tsx`) runs only for accounts without 2FA. It was unchanged and its tests still pass. No view-pack this round: the change is covered by jsdom tests only.

# Round 2: staff password doors (2026-09-26)

Operator ruling 2026-09-26: "ปิด + เพิ่มเปลี่ยนรหัสของตัวเองให้เจ้าหน้าที่". Source finding: `reports/security/2026-09-26-no-recovery-review.md` (HIGH). Tier C (`tier-check.txt`).

| artifact | what it shows |
|---|---|
| `red-backend.txt` | new `staff-password-doors.test.js` + rewritten `provider-directory-hardening.test.js` run against the production files as they were before this round (`e54eeaa9`): 21 failed / 71 passed (92) |
| `red-web.txt` | new web tests against the same production files: 8 failed / 6 passed (14) |
| `green-backend.txt` | 9 suites including neighbours (reset-routes, no-self-service, error-codes catalog, provider login, admin gates, session epoch, audit fixes): 163/163 |
| `green-web.txt` | `src/app/provider`, `src/app/health/profile`, `src/app/health/settings`: 75 suites / 481 tests |
| `backend-full.txt` | full backend jest (`--silent --forceExit`, 3 GB heap, fresh SIGNING_KEY_DIR in scratchpad): 845 suites passed / 31 skipped, 10,876 tests passed, exit 0. `fail-branch.txt` is empty. There was **no Postgres**, so the integration suites skipped themselves. This is "nothing new fails vs the 11 suites in attestation f6932758", not a full gate. The dedupeKey hashes are redacted |
| `key-mtime-*.txt` | `apps/backend/keys/private.pem` in the main tree was not touched (2026-09-05 22:50:35, before and after) |
| `web-full.txt` | 391 suites / 3,202 tests, all pass (the previous round had 389/3,194) · `web-tsc.txt` exit 0. Both ran before one className-only change to the card (`sm:pt-6`, spacing seen in the first screenshot). After that change the card test was re-run: 4/4 |

## Behaviour (all pinned through real routers with supertest; the users table is in memory and `update` writes the row)

- `PUT` or `PATCH /api/provider/directory/:id` with a non-empty `password` gets 400 `DIRECTORY_PASSWORD_WRITE_FORBIDDEN`. The whole request is refused, and the target's hash is byte-identical. This holds for a staff target, a farmer target, the admin's own account, and a platform admin.
- `PUT`/`PATCH`/`DELETE` only reach accounts with a providerId whose role is not health. Any other account gets 404, the same answer as cross-org. The existing 403/404 guards are kept.
- `POST /api/auth/provider/change-password` (authenticateProvider, changePasswordSchema): old + new gives 200. The new password verifies. `sessionsRevokedAt` is stamped and `revokeAllUserTokens` is called. A `PASSWORD_CHANGE` audit row is written with role `PROVIDER`. A wrong old password gets the same status, code and message as the health door (400 `INVALID_CREDENTIALS` "รหัสผ่านเดิมไม่ถูกต้อง"). A weak new password gets 400 `VALIDATION_ERROR`. A `userId` in the body is ignored.
- Rate limit: before this round the health door had only the global 1000/15 min cap. It had no limiter of its own. `changePasswordLimiter` (10 failures / 15 min / IP; successful requests are not counted) is now mounted on both doors, on `/api` and `/api/v1`. This is pinned by reading `server.js`. It was not exercised with requests.

## view-pack (real Chromium, local `next dev`, fixtures for every `/api/**`; no backend or DB; the JWT cookie is unsigned)

| image (before, after) | what to look at |
|---|---|
| `*-11-edit-dialog-open.png` + `*-11-edit-dialog.txt` | before: the dialog has "รหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)", and the PUT body is `{username, providerId:"", email, password:"", …}`. After: no password field, and the PUT body is `{email, firstName, lastName, role}`. The old body's `providerId:""` would have been refused by the real backend as `PROVIDER_ID_EDIT_FORBIDDEN`, so editing an officer from this dialog was already broken on main (read from the code, not run against a backend) |
| `*-12-create-dialog.png` | creating an account still takes an initial password. The field is now `type=password`; before, it was a plain text input that showed the password as it was typed |
| `*-13/14-staff-security*.png` | before: MFA only. After: a "เปลี่ยนรหัสผ่าน" card with three masked fields (desktop and 390 px) |
| `after-15-staff-change-mismatch.png` | a mismatched confirmation is refused before the network (no POST in `.txt`) |
| `after-16-staff-change-wrong-current.png` | POST `/api/auth/provider/change-password` with the field names `oldPassword` and `newPassword`. The fixture answers 400 `INVALID_CREDENTIALS` and the card shows "รหัสผ่านเดิมไม่ถูกต้อง". **The success path (sign out, then go to `/auth/provider/login`) was not shot.** It is pinned only by the jsdom test |

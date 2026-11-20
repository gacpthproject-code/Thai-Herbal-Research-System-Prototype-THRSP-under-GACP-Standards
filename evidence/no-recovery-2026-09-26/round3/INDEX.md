# Round 3: 2FA doors (2026-09-26)

Operator ruling 2026-09-26: "ถอดทั้งสองประตู". No one clears another account's 2FA: 2FA recovery belongs to หมอพร้อม, and "เราไม่มีการกู้บัญชี". Source: `reports/security/2026-09-26-no-recovery-round2-review.md`. Tier C (`tier-check.txt`).

| artifact | what it shows |
|---|---|
| `red-sf.txt` | new `second-factor-doors.test.js` against the pre-change code: 5 failed / 10. Both doors answered 200 and cleared the in-memory row. The 5 owner-self-disable controls already passed |
| `red-lockout.txt` | the per-account lockout tests in `staff-password-doors.test.js` against the pre-change code: 9 failed |
| `red-web.txt` | web `src/app/admin/users` + `src/app/provider/management` with the new and updated tests, against the pre-change pages: 5 failed / 37 |
| `green-backend.txt` | 16 suites (new + every suite that pinned the removed doors or the change-password path): 772/772 |
| `green-web.txt` | admin, provider, components/admin, services, i18n: 122 suites / 890 tests |
| `backend-full-run1.txt` | first full run: `auth-service.test.js` failed 1 test. It pinned the exact update payload of `changePassword`, which now also resets the lockout columns. The test was updated (`auth-service-rerun.txt`: 22/22) |
| `backend-full.txt` | full backend jest after that fix (fresh SIGNING_KEY_DIR, 3 GB heap): 846 suites passed / 31 skipped, 10,868 tests, exit 0, no failures at all. **No Postgres**: integration suites skipped, so this is not a full gate. dedupeKey hashes are redacted |
| `key-mtime-*.txt` | `apps/backend/keys/private.pem` in the main tree: 2026-09-05 22:50:35 before and after |
| `web-full.txt` | 391 suites / 3,185 tests, all pass (one test file was deleted with the modal, one was added) · `web-tsc.txt` exit 0 |

## Behaviour

- `POST /api/admin/users/:id/force-reset-mfa` and `POST /api/provider/directory/:id/disable-2fa` reach no route. Express's own 404 ("Cannot POST …") comes back, not a JSON 404. The target's `twoFactorEnabled`, secret and backup codes are unchanged. This holds for a farmer, a staff member, the admin's own account, and a platform admin.
- Kept: `DELETE /api/mfa/disable` (the owner, with a TOTP code from their own app) → 200 and 2FA off. A wrong code → 401 and nothing changes. A code from another account's secret does not work.
- Change password (both doors): wrong current password attempts 1–4 → 400 `INVALID_CREDENTIALS`. The 5th → 423 `ACCOUNT_LOCKED`, `isLocked` set, `lockedUntil` +15 min. These are the same columns and threshold as login, so it locks sign-in too. While locked, even the right password changes nothing. An expired lock clears itself. A success resets the counter. Every failure writes an audit row `PASSWORD_CHANGE … FAILURE {reason, failedAttempts}`. The test checks that the call arguments contain neither password nor a bcrypt hash.

## view-pack (real Chromium, local `next dev`, `/api/**` fixtures, unsigned cookie; no backend or DB)

| image (before, after) | what to look at |
|---|---|
| `*-21-admin-users-row-menu.png` + `.txt` | `.txt` lists the row menu items. Before: เปิดการใช้งาน / เปลี่ยนบทบาท / **รีเซ็ต MFA**. After: เปิดการใช้งาน / เปลี่ยนบทบาท. In the unmodified page the third item hangs below the table and is clipped, so it does not show in the before picture |
| `*-23-admin-users-row-menu-unclipped.png` | the same menu with an injected `* { overflow: visible !important }` **for the photo only**: before shows "รีเซ็ต MFA", after does not |
| `*-22-provider-management-row.png` + `.txt` | a locked officer with 2FA on. Before: the row has the orange shield-off "Disable 2FA for สมชาย ใจดี" button. After: it is gone. Unlock, edit and delete stay |

The fixture rows show "ถูกระงับ" / "เปิดการใช้งาน" for users sent as `status: ACTIVE`. This is how the page reads the fixture shape and was not investigated. It is the same before and after.
